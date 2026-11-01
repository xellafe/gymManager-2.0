/**
 * Google Drive integration — OAuth 2.0 per Desktop App.
 *
 * Flusso:
 * 1. L'utente inserisce Client ID e Client Secret (credenziali "App desktop")
 *    nella sezione Impostazioni → Backup.
 * 2. Clicca "Connetti Google Drive": si apre il browser sul URL di autorizzazione Google.
 * 3. L'app avvia un server HTTP locale (loopback) che riceve il callback OAuth.
 * 4. Il codice di autorizzazione viene scambiato con i token (access + refresh).
 * 5. I token sono salvati in `drive-tokens.json` nella cartella userData.
 *
 * Scope richiesto: https://www.googleapis.com/auth/drive.file
 * (accesso solo ai file creati dall'app)
 */

import { app, shell } from 'electron'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import log from 'electron-log'
import { isSlotSblocco } from '../domain/sblocco'
import type { BackupManifest, DriveBackupItem, SlotSblocco } from '../../types/shared'

// Costanti iniettate da Vite define al momento del build.
// In sviluppo locale si impostano tramite variabili d'ambiente GOOGLE_CLIENT_ID
// e GOOGLE_CLIENT_SECRET (vedi electron.vite.config.ts).
declare const __GOOGLE_CLIENT_ID__: string
declare const __GOOGLE_CLIENT_SECRET__: string

// ── Costanti ──────────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3'
const GOOGLE_DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_NAME = 'GymManager Backup'
const TOKENS_FILE = 'drive-tokens.json'
const AUTH_TIMEOUT_MS = 5 * 60 * 1000 // 5 minuti

// ── Tipi locali ───────────────────────────────────────────────────────────────

interface TokenData {
  access_token: string
  refresh_token: string
  expiry_date: number   // timestamp ms
  client_id: string
  client_secret: string
}

// ── Gestione token ────────────────────────────────────────────────────────────

function getTokensPath(): string {
  return join(app.getPath('userData'), TOKENS_FILE)
}

function loadTokens(): TokenData | null {
  const filePath = getTokensPath()
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as TokenData
  } catch (err) {
    log.warn('[drive] Errore lettura token:', err)
    return null
  }
}

function saveTokens(data: TokenData): void {
  writeFileSync(getTokensPath(), JSON.stringify(data, null, 2), 'utf-8')
}

function clearTokens(): void {
  const filePath = getTokensPath()
  if (existsSync(filePath)) {
    try { unlinkSync(filePath) } catch { /* ignore */ }
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/** Trova una porta TCP libera sul loopback. */
async function getFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

/** Scambia il codice di autorizzazione OAuth con i token. */
async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString()
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`TOKEN_EXCHANGE_FAILED: ${body}`)
  }
  return response.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

/** Rinnova l'access token usando il refresh token. */
async function refreshToken(tokens: TokenData): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: tokens.client_id,
      client_secret: tokens.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    }).toString()
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`REFRESH_FAILED: ${body}`)
  }
  const data = await response.json() as { access_token: string; expires_in: number }
  tokens.access_token = data.access_token
  tokens.expiry_date = Date.now() + (data.expires_in - 60) * 1000
  saveTokens(tokens)
  return tokens.access_token
}

/** Restituisce un access token valido (rinnova se scaduto). */
async function getValidToken(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new Error('DRIVE_NOT_CONNECTED')
  if (Date.now() < tokens.expiry_date) return tokens.access_token
  return refreshToken(tokens)
}

// ── Drive folder helper ───────────────────────────────────────────────────────

/** Trova o crea la cartella "GymManager Backup" su Drive. */
async function getOrCreateFolder(accessToken: string): Promise<string> {
  const escapedName = FOLDER_NAME.replace(/'/g, "\\'")
  const q = `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false`
  const listUrl = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!listRes.ok) throw new Error(`DRIVE_LIST_FOLDER_FAILED: ${await listRes.text()}`)

  const listData = await listRes.json() as { files: Array<{ id: string }> }
  if (listData.files.length > 0) return listData.files[0].id

  const createRes = await fetch(`${GOOGLE_DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  })
  if (!createRes.ok) throw new Error(`DRIVE_CREATE_FOLDER_FAILED: ${await createRes.text()}`)
  const folder = await createRes.json() as { id: string }
  return folder.id
}

// ── API pubblica ──────────────────────────────────────────────────────────────

/**
 * Avvia il flusso OAuth 2.0:
 * 1. Apre un server HTTP locale su una porta libera.
 * 2. Apre il browser sul URL di autorizzazione Google.
 * 3. Attende il callback, scambia il codice per i token.
 * 4. Salva i token su disco.
 */
export async function connectDrive(): Promise<void> {
  const clientId = __GOOGLE_CLIENT_ID__
  const clientSecret = __GOOGLE_CLIENT_SECRET__

  if (!clientId || !clientSecret) {
    throw new Error('DRIVE_CREDENTIALS_MISSING')
  }

  const port = await getFreePort()
  const redirectUri = `http://127.0.0.1:${port}/callback`

  const authUrl = new URL(GOOGLE_AUTH_URL)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', DRIVE_SCOPE)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')

  return new Promise<void>((resolve, reject) => {
    const server = createServer((req, res) => {
      let url: URL
      try {
        url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      } catch {
        res.writeHead(400); res.end(); return
      }

      if (url.pathname !== '/callback') {
        res.writeHead(404); res.end(); return
      }

      const code = url.searchParams.get('code')
      const oauthError = url.searchParams.get('error')

      const sendHtml = (ok: boolean): void => {
        const body = ok
          ? '<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>&#x2705; Google Drive connesso!</h2><p>Puoi chiudere questa finestra e tornare all\'app.</p></body></html>'
          : '<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>&#x274C; Autenticazione non riuscita</h2><p>Chiudi questa finestra e riprova dall\'app.</p></body></html>'
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(body)
      }

      if (oauthError) {
        sendHtml(false)
        clearTimeout(timeoutHandle)
        server.close()
        reject(new Error(`DRIVE_AUTH_DENIED: ${oauthError}`))
        return
      }

      if (!code) { res.writeHead(400); res.end(); return }

      exchangeCode(clientId, clientSecret, code, redirectUri)
        .then(data => {
          saveTokens({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expiry_date: Date.now() + (data.expires_in - 60) * 1000,
            client_id: clientId,
            client_secret: clientSecret
          })
          sendHtml(true)
          clearTimeout(timeoutHandle)
          server.close()
          resolve()
          log.info('[drive] Connessione OAuth completata con successo')
        })
        .catch(err => {
          sendHtml(false)
          clearTimeout(timeoutHandle)
          server.close()
          reject(err instanceof Error ? err : new Error(String(err)))
        })
    })

    // eslint-disable-next-line prefer-const
    let timeoutHandle: ReturnType<typeof setTimeout>

    server.on('error', err => {
      clearTimeout(timeoutHandle)
      reject(err)
    })

    server.listen(port, '127.0.0.1', () => {
      log.info(`[drive] Server OAuth locale su porta ${port}`)
      timeoutHandle = setTimeout(() => {
        server.close()
        reject(new Error('DRIVE_AUTH_TIMEOUT'))
      }, AUTH_TIMEOUT_MS)
      void shell.openExternal(authUrl.toString())
    })
  })
}

/** Indica se Google Drive è connesso (token presente su disco). */
export function isDriveConnected(): boolean {
  const tokens = loadTokens()
  return tokens !== null && Boolean(tokens.access_token) && Boolean(tokens.refresh_token)
}

/** Disconnette Google Drive rimuovendo i token salvati. */
export async function disconnectDrive(): Promise<void> {
  clearTokens()
  log.info('[drive] Account Google Drive disconnesso')
}

// ── Sync: costanti ────────────────────────────────────────────────────────────

const SYNC_FILE_NAME = 'gymmanager_sync.db'

// ── Sync: metodi per il file di sync stabile ──────────────────────────────────

/** Trova (o crea vuoto) il file di sync stabile nella cartella app. Ritorna il fileId. */
export async function getOrCreateSyncFile(): Promise<string> {
  const accessToken = await getValidToken()
  const folderId = await getOrCreateFolder(accessToken)
  const q = `name='${SYNC_FILE_NAME}' and '${folderId}' in parents and trashed=false`
  const listUrl = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!listRes.ok) throw new Error(`SYNC_LIST_FAILED: ${await listRes.text()}`)
  const data = await listRes.json() as { files: Array<{ id: string }> }
  if (data.files.length > 0) return data.files[0].id
  // crea metadata-only (contenuto vuoto); il primo upload lo riempirà
  const createRes = await fetch(`${GOOGLE_DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: SYNC_FILE_NAME, parents: [folderId] })
  })
  if (!createRes.ok) throw new Error(`SYNC_CREATE_FAILED: ${await createRes.text()}`)
  return (await createRes.json() as { id: string }).id
}

export interface SyncMetadata { revision: string; modifiedTime: string; size: number }

/** Metadati di versione del file di sync. `revision` = headRevisionId (fallback modifiedTime). */
export async function getSyncMetadata(fileId: string): Promise<SyncMetadata> {
  const accessToken = await getValidToken()
  const url = `${GOOGLE_DRIVE_API}/files/${fileId}?fields=headRevisionId,modifiedTime,size`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`SYNC_META_FAILED: ${await res.text()}`)
  const d = await res.json() as { headRevisionId?: string; modifiedTime: string; size?: string }
  return { revision: d.headRevisionId ?? d.modifiedTime, modifiedTime: d.modifiedTime, size: parseInt(d.size ?? '0', 10) }
}

/** Sovrascrive in-place il contenuto del file di sync; ritorna la nuova revisione. */
export async function uploadSync(fileId: string, dbPath: string): Promise<string> {
  const accessToken = await getValidToken()
  const content = readFileSync(dbPath)
  const url = `${GOOGLE_DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=headRevisionId,modifiedTime`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(content.byteLength)
    },
    body: content
  })
  if (!res.ok) throw new Error(`SYNC_UPLOAD_FAILED: ${await res.text()}`)
  const d = await res.json() as { headRevisionId?: string; modifiedTime: string }
  return d.headRevisionId ?? d.modifiedTime
}

/** Scarica il contenuto del file di sync su `destPath`. */
export async function downloadSync(fileId: string, destPath: string): Promise<void> {
  const accessToken = await getValidToken()
  const res = await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`SYNC_DOWNLOAD_FAILED: ${await res.text()}`)
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
}

/** Carica una copia di conflitto (file separato timestamped). Ritorna il fileId. */
export async function uploadConflictCopy(dbPath: string): Promise<string> {
  return backupSuDriveConNome(
    dbPath,
    `gymmanager_conflict_${new Date().toISOString().replace(/[:.]/g, '-')}.db`
  )
}

// ── Backup timestamped ────────────────────────────────────────────────────────

/**
 * Helper interno: carica un file su Drive con un nome specificato, nella cartella app.
 * `description` (facoltativa) finisce nei metadati del file. Ritorna il fileId.
 */
async function backupSuDriveConNome(
  backupPath: string,
  fileName: string,
  description?: string
): Promise<string> {
  const accessToken = await getValidToken()
  const folderId = await getOrCreateFolder(accessToken)

  const fileContent = readFileSync(backupPath)
  const boundary = 'gymmanager_drive_boundary_314159'

  const metadataJson = JSON.stringify({
    name: fileName,
    parents: [folderId],
    ...(description !== undefined ? { description } : {})
  })

  const bodyParts = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    `${metadataJson}\r\n`,
    `--${boundary}\r\n`,
    'Content-Type: application/octet-stream\r\n\r\n'
  ]

  const bodyBuffer = Buffer.concat([
    Buffer.from(bodyParts.join(''), 'utf-8'),
    fileContent,
    Buffer.from(`\r\n--${boundary}--`, 'utf-8')
  ])

  const uploadUrl = `${GOOGLE_DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(bodyBuffer.byteLength)
    },
    body: bodyBuffer
  })

  if (!res.ok) throw new Error(`DRIVE_UPLOAD_FAILED: ${await res.text()}`)

  const data = await res.json() as { id: string }
  log.info(`[drive] File caricato su Drive: ${data.id} (${fileName})`)
  return data.id
}

/** Slot di recupero dal manifest accanto al backup, se presente e leggibile. */
function leggiSlotDaManifest(backupPath: string): SlotSblocco | null {
  const manifestPath = backupPath + '.manifest.json'
  if (!existsSync(manifestPath)) return null
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Partial<BackupManifest>
    return isSlotSblocco(manifest.recupero) ? manifest.recupero : null
  } catch (err) {
    log.warn('[drive] Manifest del backup illeggibile:', err)
    return null
  }
}

/**
 * Carica un file di backup su Google Drive nella cartella "GymManager Backup".
 * Se il manifest accanto al file contiene lo slot della chiave di recupero, lo salva
 * (JSON) nel campo `description` del file Drive, per il ripristino con la chiave.
 * @returns ID del file su Google Drive
 */
export async function backupSuDrive(backupPath: string): Promise<string> {
  const fileName = `gymmanager_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`
  const slot = leggiSlotDaManifest(backupPath)
  const fileId = await backupSuDriveConNome(
    backupPath,
    fileName,
    slot !== null ? JSON.stringify(slot) : undefined
  )
  log.info(`[drive] Backup caricato su Drive: ${fileId} (${fileName})`)
  return fileId
}

/**
 * Scarica e salva un file di backup da Google Drive.
 */
export async function ripristinaDaDrive(fileId: string, destinazionePath: string): Promise<void> {
  const accessToken = await getValidToken()

  const res = await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`DRIVE_DOWNLOAD_FAILED: ${await res.text()}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(destinazionePath, buffer)
  log.info(`[drive] File ripristinato da Drive: ${fileId} → ${destinazionePath}`)
}

/**
 * Legge lo slot della chiave di recupero dal campo `description` di un backup su Drive.
 * @returns lo slot, o `null` se il backup non lo contiene (backup precedenti)
 */
export async function leggiSlotBackupDrive(fileId: string): Promise<SlotSblocco | null> {
  const accessToken = await getValidToken()
  const res = await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?fields=description`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`DRIVE_META_FAILED: ${await res.text()}`)
  const data = (await res.json()) as { description?: string }
  if (!data.description) return null
  try {
    const slot: unknown = JSON.parse(data.description)
    return isSlotSblocco(slot) ? slot : null
  } catch {
    return null
  }
}

/**
 * Elenca i backup presenti nella cartella "GymManager Backup" su Drive.
 */
export async function listBackupDrive(): Promise<DriveBackupItem[]> {
  const accessToken = await getValidToken()
  const folderId = await getOrCreateFolder(accessToken)

  // Include SOLO i backup timestamped (gymmanager_backup_*); esclude il file di sync
  // stabile (gymmanager_sync.db) e le copie di conflitto (gymmanager_conflict_*).
  const q = `'${folderId}' in parents and trashed=false and name contains 'gymmanager_backup'`
  const url = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(q)}&orderBy=createdTime+desc&fields=files(id,name,createdTime,size)&pageSize=50`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`DRIVE_LIST_FAILED: ${await res.text()}`)

  const data = await res.json() as {
    files: Array<{ id: string; name: string; createdTime: string; size?: string }>
  }

  return data.files.map(f => ({
    id: f.id,
    nome: f.name,
    createdAt: f.createdTime,
    size: parseInt(f.size ?? '0', 10)
  }))
}
