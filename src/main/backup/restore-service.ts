import { existsSync, copyFileSync, unlinkSync, readFileSync } from 'fs'
import log from 'electron-log'
import {
  DB_PATH,
  openDatabase,
  openDatabaseWithKey,
  getCurrentKey,
  closeDatabase,
  isDatabaseOpen,
} from '../db/database'
import {
  applicaDopoRipristino,
  dbKeyDaChiave,
  eliminaStatoSblocco
} from '../sicurezza/sblocco-service'
import { isSlotSblocco } from '../domain/sblocco'
import type { BackupManifest, CredenzialiRipristino, SlotSblocco } from '../../types/shared'

/**
 * Legge e verifica il manifest JSON accanto al file di backup.
 *
 * @param backupPath - Percorso del file .db di backup
 * @returns Il manifest del backup
 * @throws Se il manifest non è trovato o il file .db è mancante
 */
export async function verificaBackup(backupPath: string): Promise<BackupManifest> {
  if (!existsSync(backupPath)) {
    throw new Error(`File di backup non trovato: ${backupPath}`)
  }

  const manifestPath = backupPath + '.manifest.json'
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Manifest del backup non trovato: ${manifestPath}. ` +
        'Il file potrebbe non essere un backup valido di GymManager.'
    )
  }

  let manifest: BackupManifest
  try {
    const raw = readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(raw) as BackupManifest
  } catch (err) {
    throw new Error(
      `Impossibile leggere il manifest del backup: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // Valida i campi minimi
  if (typeof manifest.version !== 'number' || !manifest.createdAt || !manifest.appVersion) {
    throw new Error('Manifest del backup non valido: campi obbligatori mancanti.')
  }

  log.info(`[restore] Backup verificato — versione schema: ${manifest.version}, creato: ${manifest.createdAt}`)
  return manifest
}

/**
 * Core del ripristino (senza verifica manifest): chiude il DB, fa una copia di
 * sicurezza, sovrascrive il DB con il file fornito e riapre con la password data
 * oppure direttamente con la chiave SQLCipher (ottenuta dalla chiave di recupero).
 * Su fallimento ripristina la copia di sicurezza.
 *
 * @param backupPath - Percorso del file .db di backup
 * @param credenziale - La master password del backup oppure la sua chiave SQLCipher (hex 64)
 */
export async function eseguiRipristino(
  backupPath: string,
  credenziale: { password: string } | { chiaveDb: string }
): Promise<void> {
  // 2. Chiudi il DB corrente
  if (isDatabaseOpen()) {
    closeDatabase()
    log.info('[restore] DB corrente chiuso per ripristino')
  }

  // 3. Crea un backup di sicurezza del DB corrente (se esiste)
  const safetyPath = DB_PATH + '.restore-safety.db'
  let hasSafetyBackup = false
  if (existsSync(DB_PATH)) {
    copyFileSync(DB_PATH, safetyPath)
    hasSafetyBackup = true
    log.info(`[restore] Backup di sicurezza creato: ${safetyPath}`)
  }

  // 4. Copia il file backup nel percorso DB
  try {
    copyFileSync(backupPath, DB_PATH)
    log.info(`[restore] File backup copiato su: ${DB_PATH}`)
  } catch (err) {
    // Se la copia fallisce, ripristina il backup di sicurezza
    if (hasSafetyBackup) {
      copyFileSync(safetyPath, DB_PATH)
      log.warn('[restore] Copia backup fallita, DB di sicurezza ripristinato')
    }
    throw new Error(
      `Impossibile copiare il backup: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // 5. Tenta di aprire il DB con la password fornita
  try {
    if ('password' in credenziale) openDatabase(credenziale.password)
    else openDatabaseWithKey(credenziale.chiaveDb)
    log.info('[restore] DB ripristinato e aperto con successo')
  } catch (err) {
    // 6. Se fallisce: ripristina il backup di sicurezza
    log.error('[restore] Apertura DB ripristinato fallita, ripristino backup di sicurezza')
    closeDatabase()

    if (hasSafetyBackup) {
      copyFileSync(safetyPath, DB_PATH)
      try {
        // Non riaprire: la password originale è sconosciuta qui
        log.info('[restore] DB di sicurezza ripristinato su disco (richiede riapertura manuale)')
      } catch {
        // ignora
      }
    } else if (existsSync(DB_PATH)) {
      unlinkSync(DB_PATH)
    }

    throw new Error(
      'Password errata o file di backup corrotto. ' +
        'Il database originale è stato ripristinato. ' +
        `Dettaglio: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    // 7. Rimuovi il backup di sicurezza (operazione completata o fallita già gestita)
    if (hasSafetyBackup && existsSync(safetyPath)) {
      try {
        unlinkSync(safetyPath)
      } catch {
        log.warn(`[restore] Impossibile rimuovere backup di sicurezza: ${safetyPath}`)
      }
    }
  }
}

/**
 * Ripristina un file di backup con la master password o con la chiave di recupero.
 *
 * Con la chiave di recupero usa `slotBackup` (dal manifest o dai metadati Drive):
 * `RECUPERO_NON_DISPONIBILE` se manca, `CHIAVE_ERRATA` (prima di toccare il DB) se non lo apre.
 * Dopo un ripristino riuscito: PIN disattivato, contatore azzerato, slot di recupero corrente =
 * quello del backup (o nessuno); con la chiave si entra nello stato di recupero.
 *
 * @param backupPath - Percorso del file .db di backup
 * @param slotBackup - Slot di recupero salvato con il backup, se presente
 * @param credenziali - `{ password }` oppure `{ chiaveRecupero }`
 */
export async function ripristinaConCredenziali(
  backupPath: string,
  slotBackup: SlotSblocco | null,
  credenziali: CredenzialiRipristino
): Promise<void> {
  if ('chiaveRecupero' in credenziali) {
    if (slotBackup === null) throw new Error('RECUPERO_NON_DISPONIBILE')
    const chiaveDb = dbKeyDaChiave(slotBackup, credenziali.chiaveRecupero)
    await eseguiRipristino(backupPath, { chiaveDb })
    applicaDopoRipristino(slotBackup, true)
  } else {
    await eseguiRipristino(backupPath, { password: credenziali.password })
    applicaDopoRipristino(slotBackup, false)
  }
}

/**
 * Ripristina un backup locale nel DB corrente.
 *
 * Operazione distruttiva: sovrascrive il DB attivo.
 * Prima di sovrascrivere, crea un backup di sicurezza del DB corrente.
 * Se l'apertura del backup fallisce, ripristina il backup di sicurezza.
 *
 * @param backupPath - Percorso del file .db di backup
 * @param credenziali - `{ password }` del backup oppure `{ chiaveRecupero }`
 */
export async function ripristinaBackup(
  backupPath: string,
  credenziali: CredenzialiRipristino
): Promise<void> {
  const manifest = await verificaBackup(backupPath)
  const slot = isSlotSblocco(manifest.recupero) ? manifest.recupero : null
  await ripristinaConCredenziali(backupPath, slot, credenziali)
}

/**
 * Reset DISTRUTTIVO del database.
 *
 * Cancella tutti i dati, crea un nuovo DB con la nuova password.
 * Conforme a D6 (DECISIONS.md): il reset cancella i dati senza recupero possibile.
 * Elimina anche `sblocco.json` (chiave di recupero e PIN del DB cancellato).
 *
 * ATTENZIONE: operazione irreversibile. Usare solo con doppia conferma dell'utente.
 *
 * @param nuovaPassword - La nuova master password per il DB appena creato
 */
export async function resetDatabase(nuovaPassword: string): Promise<void> {
  log.warn('[reset] Avvio reset DISTRUTTIVO del database')

  // 1. Chiudi il DB corrente
  if (isDatabaseOpen()) {
    closeDatabase()
    log.info('[reset] DB corrente chiuso')
  }

  // 2. Elimina il file DB (e i file WAL/SHM associati)
  const filesToDelete = [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']
  for (const f of filesToDelete) {
    if (existsSync(f)) {
      unlinkSync(f)
      log.info(`[reset] File eliminato: ${f}`)
    }
  }

  // 3. Chiave di recupero e PIN appartengono al DB cancellato
  eliminaStatoSblocco()

  // 4. Crea un nuovo DB con la nuova password (openDatabase lo crea da zero con migrazioni)
  openDatabase(nuovaPassword)
  log.info('[reset] Nuovo DB creato con nuova password e migrazioni applicate')
}

/**
 * Reload sync: sostituisce il DB locale con `nuovoPath` e riapre con la chiave
 * CORRENTE in memoria (stessa master password tra dispositivi).
 * Non richiede la password in chiaro.
 *
 * Su fallimento (chiave incompatibile) ripristina il DB precedente e lancia
 * Error('SYNC_PASSWORD_MISMATCH').
 *
 * ATTENZIONE: cattura la chiave PRIMA di closeDatabase(), che la azzera.
 *
 * @param nuovoPath - Percorso del file .db da installare come DB attivo
 */
export async function eseguiRipristinoConChiaveCorrente(nuovoPath: string): Promise<void> {
  // Cattura la chiave prima di chiudere (closeDatabase la azzera)
  const key = getCurrentKey()
  if (key === null) throw new Error('DB_NON_APERTO')

  const safetyPath = DB_PATH + '.sync-safety.db'
  let hasSafety = false

  if (isDatabaseOpen()) {
    closeDatabase()
    log.info('[sync-restore] DB corrente chiuso per reload sync')
  }

  if (existsSync(DB_PATH)) {
    copyFileSync(DB_PATH, safetyPath)
    hasSafety = true
    log.info(`[sync-restore] Backup di sicurezza creato: ${safetyPath}`)
  }

  try {
    copyFileSync(nuovoPath, DB_PATH)
    log.info(`[sync-restore] File sync copiato su: ${DB_PATH}`)
    openDatabaseWithKey(key)
    log.info('[sync-restore] Reload completato con chiave corrente')
  } catch (err) {
    log.error('[sync-restore] Reload fallito, ripristino DB precedente', err)
    if (isDatabaseOpen()) closeDatabase()
    if (hasSafety) {
      copyFileSync(safetyPath, DB_PATH)
      // Riapri con la stessa chiave per lasciare il DB in stato coerente
      try {
        openDatabaseWithKey(key)
        log.info('[sync-restore] DB precedente ripristinato e riaperto')
      } catch (reopenErr) {
        log.error('[sync-restore] Impossibile riaprire il DB di sicurezza', reopenErr)
      }
    }
    throw new Error('SYNC_PASSWORD_MISMATCH')
  } finally {
    if (hasSafety && existsSync(safetyPath)) {
      try {
        unlinkSync(safetyPath)
      } catch {
        log.warn(`[sync-restore] Impossibile rimuovere backup di sicurezza: ${safetyPath}`)
      }
    }
  }
}

export type { BackupManifest }
