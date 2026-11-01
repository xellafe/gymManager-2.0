import { app } from 'electron'
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  statSync,
  readFileSync
} from 'fs'
import { join, dirname } from 'path'
import log from 'electron-log'
import { DB_PATH, getDatabase, isDatabaseOpen } from '../db/database'
import { loadSettings } from '../settings/store'
import { getSlotRecupero } from '../sicurezza/sblocco-service'
import type { BackupLocaleInfo, BackupManifest } from '../../types/shared'

export type { BackupManifest }

/**
 * Legge PRAGMA user_version dal DB aperto.
 * Se il DB non è aperto restituisce 0.
 */
function getUserVersion(): number {
  if (!isDatabaseOpen()) return 0
  const db = getDatabase()
  const result = db.pragma('user_version') as Array<{ user_version: number }>
  return result[0]?.user_version ?? 0
}

/**
 * Esegue il backup locale del file DB verso un percorso scelto dall'utente.
 *
 * Il backup è la copia diretta del file DB cifrato con SQLCipher —
 * nessuna ulteriore cifratura viene aggiunta.
 * Accanto al file .db viene scritto un file .manifest.json con i metadati
 * (e lo slot della chiave di recupero, se generata).
 *
 * @param destinazionePath - Percorso completo del file di destinazione (.db)
 * @returns Il manifest del backup creato
 */
export async function backupLocale(destinazionePath: string): Promise<BackupManifest> {
  if (!existsSync(DB_PATH)) {
    throw new Error('File database non trovato: ' + DB_PATH)
  }

  // Crea la directory di destinazione se non esiste
  const destDir = dirname(destinazionePath)
  mkdirSync(destDir, { recursive: true })

  // Copia il file DB (già cifrato con SQLCipher)
  copyFileSync(DB_PATH, destinazionePath)
  log.info(`[backup] File DB copiato in: ${destinazionePath}`)

  const manifest: BackupManifest = {
    version: getUserVersion(),
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    dbPath: DB_PATH
  }
  // Slot della chiave di recupero corrente: il backup si potrà aprire anche con la chiave
  const recupero = getSlotRecupero()
  if (recupero !== null) manifest.recupero = recupero

  // Scrivi il manifest accanto al backup
  const manifestPath = destinazionePath + '.manifest.json'
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  log.info(`[backup] Manifest scritto in: ${manifestPath}`)

  return manifest
}

/** Default di retention se le impostazioni non sono risolvibili. */
const DEFAULT_RETENTION = 10

/**
 * Risolve la cartella di backup: usa `backupDir` se valorizzata, altrimenti `defaultDir`.
 * Funzione pura (nessun side effect), testabile senza filesystem.
 */
export function risolviCartellaBackup(backupDir: string, defaultDir: string): string {
  return backupDir.trim().length > 0 ? backupDir.trim() : defaultDir
}

/**
 * Esegue un backup nella cartella configurata (o quella di default),
 * con nome `backup_YYYYMMDD_HHMMSS.db`. Mantiene gli ultimi `retention` backup
 * (prefisso `backup_`: manuali e automatici condividono la rotazione).
 *
 * Se `opts` non fornisce `dir`/`retention`, vengono letti dalle impostazioni.
 * @returns Il percorso del file di backup creato
 */
export async function backupAutomatico(opts?: { dir?: string; retention?: number }): Promise<string> {
  const defaultDir = join(app.getPath('userData'), 'backups')
  let backupDir = opts?.dir
  let retention = opts?.retention
  if (backupDir === undefined || retention === undefined) {
    const settings = loadSettings()
    backupDir = backupDir ?? risolviCartellaBackup(settings.backup_dir, defaultDir)
    retention = retention ?? settings.backup_retention
  }
  const targetDir = backupDir
  const keep = Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : DEFAULT_RETENTION

  mkdirSync(targetDir, { recursive: true })

  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const datePart =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const backupPath = join(targetDir, `backup_${datePart}.db`)

  await backupLocale(backupPath)
  log.info(`[backup] Backup creato: ${backupPath}`)

  const files = readdirSync(targetDir)
    .filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
    .map((f) => ({ name: f, path: join(targetDir, f), mtime: statSync(join(targetDir, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime)

  if (files.length > keep) {
    const toDelete = files.slice(0, files.length - keep)
    for (const file of toDelete) {
      try {
        unlinkSync(file.path)
        const manifestPath = file.path + '.manifest.json'
        if (existsSync(manifestPath)) unlinkSync(manifestPath)
        log.info(`[backup] Backup rimosso (eccesso): ${file.name}`)
      } catch (err) {
        log.warn(`[backup] Impossibile rimuovere backup obsoleto ${file.name}:`, err)
      }
    }
  }

  return backupPath
}

/**
 * Elenca i backup locali (`backup_*.db`) nella cartella configurata (o `dir` se passata),
 * leggendo i metadati dal sidecar `.manifest.json`. Ordina dal più recente.
 * Se la cartella non esiste ritorna [].
 */
export async function listBackupLocali(dir?: string): Promise<BackupLocaleInfo[]> {
  const defaultDir = join(app.getPath('userData'), 'backups')
  const targetDir = dir ?? risolviCartellaBackup(loadSettings().backup_dir, defaultDir)
  if (!existsSync(targetDir)) return []

  const files = readdirSync(targetDir).filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
  const lista: BackupLocaleInfo[] = files.map((f) => {
    const fullPath = join(targetDir, f)
    const manifestPath = fullPath + '.manifest.json'
    let createdAt: string
    let appVersion = ''
    let version = 0
    if (existsSync(manifestPath)) {
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Partial<BackupManifest>
        createdAt = m.createdAt ?? new Date(statSync(fullPath).mtimeMs).toISOString()
        appVersion = m.appVersion ?? ''
        version = m.version ?? 0
      } catch {
        createdAt = new Date(statSync(fullPath).mtimeMs).toISOString()
      }
    } else {
      createdAt = new Date(statSync(fullPath).mtimeMs).toISOString()
    }
    return { path: fullPath, createdAt, appVersion, version }
  })

  lista.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return lista
}
