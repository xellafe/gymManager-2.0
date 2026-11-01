/**
 * Test unit per il sistema di backup/restore (F5).
 *
 * Usa DB temporanei su disco (tmpdir) e mocka 'electron' per evitare
 * la dipendenza da Electron runtime.
 *
 * NOTA: i test di ripristino verificano il round-trip completo
 * backup → restore → DB apribile con la stessa password.
 * In assenza di SQLCipher la verifica della password è skip-pata
 * (stesso comportamento di db.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  statSync
} from 'fs'

// ─────────────────────────────────────────────────────────────────────────────
// Mock Electron
// NOTA: vi.mock() è hoistato da Vitest prima di qualsiasi inizializzazione di
// variabili del modulo (temporal dead zone). La factory NON può referenziare
// costanti del modulo — usiamo require() inline, come in db.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('electron', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: fsMkdir } = require('fs')
  const testDataDir = pathJoin(osTmpdir(), `gymmanager-backup-test-${process.pid}`)
  fsMkdir(testDataDir, { recursive: true })
  const xor = (b: Buffer): Buffer => Buffer.from(b.map((x) => x ^ 0x5a))
  return {
    app: {
      getPath: (_name: string) => testDataDir,
      getVersion: () => '0.1.0-test'
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => xor(Buffer.from(s, 'utf-8')),
      decryptString: (b: Buffer) => xor(b).toString('utf-8')
    }
  }
})

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

// Calcoliamo TEST_USER_DATA con la stessa logica della factory mock (dopo le mock)
const TEST_USER_DATA = join(tmpdir(), `gymmanager-backup-test-${process.pid}`)

// ─────────────────────────────────────────────────────────────────────────────
// Import DOPO i mock
// ─────────────────────────────────────────────────────────────────────────────

import { backupLocale, backupAutomatico, risolviCartellaBackup, listBackupLocali } from '../../src/main/backup/backup-service'
import { verificaBackup, ripristinaBackup, resetDatabase } from '../../src/main/backup/restore-service'
import {
  connectDrive,
  isDriveConnected,
  backupSuDrive,
  listBackupDrive,
  leggiSlotBackupDrive
} from '../../src/main/backup/drive-service'
import {
  openDatabase,
  closeDatabase,
  isDatabaseOpen,
  getDatabase,
  getCurrentKey,
  deriveKey,
  DB_PATH
} from '../../src/main/db/database'
import { runMigrations } from '../../src/main/db/migrations'
import {
  generaChiaveRecupero,
  impostaPin,
  statoSblocco,
  getSlotRecupero,
  getSbloccoPath,
  isRecuperoInCorso,
  eliminaStatoSblocco
} from '../../src/main/sicurezza/sblocco-service'
import type { BackupManifest } from '../../src/main/backup/backup-service'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let _cfCounter = 0

/** Genera un codice fiscale fittizio univoco per ogni invocazione */
function uniqueCF(): string {
  _cfCounter++
  return `TSTBK${String(_cfCounter).padStart(5, '0')}H501Z`
}

/** Path temporaneo univoco */
function tempPath(suffix = '.db'): string {
  return join(tmpdir(), `gymmanager-bk-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`)
}

/**
 * Crea un DB SQLite fresco su dbPath con le migrazioni applicate
 * e un cliente di test.
 * Usa journal_mode = DELETE per evitare file WAL su Windows.
 * Il modulo database.ts NON viene coinvolto (usa better-sqlite3 direttamente).
 */
function creaDbDiTest(dbPath: string): void {
  const db = new Database(dbPath)
  db.pragma('journal_mode = DELETE')
  runMigrations(db)
  db.prepare(
    `INSERT OR IGNORE INTO clienti (nome, cognome, codice_fiscale) VALUES ('Mario', 'Rossi', ?)`
  ).run(uniqueCF())
  db.close()
}

/**
 * Pulisce un insieme di path (db + wal + shm + manifest + safety).
 * Ignora silenziosamente gli errori EBUSY/ENOENT.
 */
function cleanupFiles(...paths: string[]): void {
  for (const p of paths) {
    const extras = [
      p,
      p + '-wal',
      p + '-shm',
      p + '.manifest.json',
      p + '.restore-safety.db'
    ]
    for (const f of extras) {
      try {
        if (existsSync(f)) unlinkSync(f)
      } catch {
        // Ignora EBUSY/ENOENT
      }
    }
  }
}

/**
 * Chiude il DB del modulo in modo pulito, forzando il checkpoint WAL.
 * Riduce i file rimasti aperti su Windows dopo la chiusura.
 */
function chiudiDbModulo(): void {
  if (isDatabaseOpen()) {
    try {
      const db = getDatabase()
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.pragma('journal_mode = DELETE')
    } catch {
      // ignora
    }
    closeDatabase()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown globale
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  chiudiDbModulo()
  cleanupFiles(DB_PATH)
  eliminaStatoSblocco()
})

afterEach(() => {
  chiudiDbModulo()
  cleanupFiles(DB_PATH)
  eliminaStatoSblocco()
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: backupLocale
// ─────────────────────────────────────────────────────────────────────────────

describe('backupLocale', () => {
  it('crea il file di backup nella destinazione indicata', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      const manifest = await backupLocale(destPath)
      expect(existsSync(destPath)).toBe(true)
      expect(manifest).toBeDefined()
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('crea il file manifest JSON accanto al backup', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      await backupLocale(destPath)
      expect(existsSync(destPath + '.manifest.json')).toBe(true)
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('il manifest ha i campi obbligatori (version, createdAt, appVersion, dbPath)', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      const manifest = await backupLocale(destPath)
      expect(typeof manifest.version).toBe('number')
      expect(typeof manifest.createdAt).toBe('string')
      expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(typeof manifest.appVersion).toBe('string')
      expect(typeof manifest.dbPath).toBe('string')
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('il manifest sul disco è leggibile e coerente con quello restituito', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      const manifest = await backupLocale(destPath)
      const manifestOnDisk = JSON.parse(
        readFileSync(destPath + '.manifest.json', 'utf-8')
      ) as BackupManifest
      expect(manifestOnDisk.createdAt).toBe(manifest.createdAt)
      expect(manifestOnDisk.appVersion).toBe(manifest.appVersion)
      expect(manifestOnDisk.version).toBe(manifest.version)
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('crea le directory di destinazione se non esistono', async () => {
    creaDbDiTest(DB_PATH)
    const subDir = join(tmpdir(), `gymmanager-newdir-${Date.now()}`)
    const destPath = join(subDir, 'backup.db')
    try {
      expect(existsSync(subDir)).toBe(false)
      await backupLocale(destPath)
      expect(existsSync(subDir)).toBe(true)
      expect(existsSync(destPath)).toBe(true)
    } finally {
      cleanupFiles(destPath)
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('fs').rmdirSync(subDir, { recursive: true })
      } catch { /* ignore */ }
    }
  })

  it('lancia errore se il file DB non esiste', async () => {
    // DB_PATH non esiste (cleanup in beforeEach)
    const destPath = tempPath('.db')
    await expect(backupLocale(destPath)).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: backupAutomatico
// ─────────────────────────────────────────────────────────────────────────────

describe('backupAutomatico', () => {
  it('crea il file nella directory backups di default', async () => {
    creaDbDiTest(DB_PATH)
    const backupPath = await backupAutomatico()
    try {
      expect(existsSync(backupPath)).toBe(true)
      expect(backupPath).toContain('backups')
      expect(backupPath).toMatch(/backup_\d{8}_\d{6}\.db$/)
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('mantiene al massimo 5 backup automatici (retention esplicita)', async () => {
    creaDbDiTest(DB_PATH)
    const backupDir = join(TEST_USER_DATA, 'backups')
    mkdirSync(backupDir, { recursive: true })

    // Crea 6 backup fittizi pre-esistenti
    const fakeFiles: string[] = []
    for (let i = 1; i <= 6; i++) {
      const fakePath = join(backupDir, `backup_20260101_0000${String(i).padStart(2, '0')}.db`)
      writeFileSync(fakePath, 'fake db data')
      writeFileSync(fakePath + '.manifest.json', '{}')
      fakeFiles.push(fakePath)
    }

    // Passa retention: 5 esplicitamente per non dipendere da MAX_AUTO_BACKUPS rimosso
    const backupPath = await backupAutomatico({ dir: backupDir, retention: 5 })

    try {
      const files = readdirSync(backupDir).filter(
        (f) => f.startsWith('backup_') && f.endsWith('.db')
      )
      expect(files.length).toBeLessThanOrEqual(5)
    } finally {
      cleanupFiles(backupPath)
      for (const f of fakeFiles) cleanupFiles(f)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: verificaBackup
// ─────────────────────────────────────────────────────────────────────────────

describe('verificaBackup', () => {
  it('legge il manifest correttamente da un backup creato con backupLocale', async () => {
    creaDbDiTest(DB_PATH)
    const destPath = tempPath('.db')
    try {
      const originalManifest = await backupLocale(destPath)
      const readManifest = await verificaBackup(destPath)
      expect(readManifest.createdAt).toBe(originalManifest.createdAt)
      expect(readManifest.appVersion).toBe(originalManifest.appVersion)
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('lancia errore se il file .db è mancante', async () => {
    const fakePath = tempPath('.db')
    await expect(verificaBackup(fakePath)).rejects.toThrow(/non trovato/)
  })

  it('lancia errore se il manifest è mancante', async () => {
    const destPath = tempPath('.db')
    writeFileSync(destPath, 'fake db content')
    try {
      await expect(verificaBackup(destPath)).rejects.toThrow(/manifest/i)
    } finally {
      cleanupFiles(destPath)
    }
  })

  it('lancia errore se il manifest ha JSON non valido', async () => {
    const destPath = tempPath('.db')
    writeFileSync(destPath, 'fake db content')
    writeFileSync(destPath + '.manifest.json', 'INVALID JSON {{{}}}')
    try {
      await expect(verificaBackup(destPath)).rejects.toThrow()
    } finally {
      cleanupFiles(destPath)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: ripristinaBackup
// ─────────────────────────────────────────────────────────────────────────────

describe('ripristinaBackup', () => {
  it('copia il file backup nel percorso DB e apre il DB', async () => {
    // Crea il DB cifrato a DB_PATH tramite openDatabase (obbligatorio con SQLCipher)
    openDatabase('testpassword')
    chiudiDbModulo()

    const backupPath = tempPath('.db')
    await backupLocale(backupPath)

    // Reset DB_PATH per simulare un DB diverso corrente
    cleanupFiles(DB_PATH)

    // Ripristina — il backup è cifrato con 'testpassword', il restore deve riuscire
    await ripristinaBackup(backupPath, { password: 'testpassword' })
    expect(isDatabaseOpen()).toBe(true)

    cleanupFiles(backupPath)
  })

  it('dopo il ripristino le migrazioni sono presenti nel DB', async () => {
    // Crea DB cifrato tramite openDatabase
    openDatabase('testpassword')
    chiudiDbModulo()

    const backupPath = tempPath('.db')
    await backupLocale(backupPath)

    cleanupFiles(DB_PATH)

    await ripristinaBackup(backupPath, { password: 'testpassword' })
    expect(isDatabaseOpen()).toBe(true)

    const db = getDatabase()
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as { version: number }[]
    expect(versions.length).toBeGreaterThan(0)

    cleanupFiles(backupPath)
  })

  it('lancia errore se il file backup non ha manifest', async () => {
    const invalidPath = tempPath('.db')
    writeFileSync(invalidPath, 'NOT_A_DB')
    // Nessun manifest → verificaBackup lancia Error con "manifest"

    try {
      await expect(ripristinaBackup(invalidPath, { password: 'testpassword' })).rejects.toThrow()
    } finally {
      cleanupFiles(invalidPath)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: resetDatabase
// ─────────────────────────────────────────────────────────────────────────────

describe('resetDatabase', () => {
  it('crea un nuovo DB apribile dopo il reset', async () => {
    creaDbDiTest(DB_PATH)
    // Il DB è stato creato da better-sqlite3 direttamente, non aperto dal modulo
    expect(existsSync(DB_PATH)).toBe(true)

    await resetDatabase('nuovapassword')
    expect(isDatabaseOpen()).toBe(true)
  })

  it('il DB dopo reset ha le tabelle delle migrazioni (DB fresco)', async () => {
    creaDbDiTest(DB_PATH)

    await resetDatabase('nuovapassword')
    expect(isDatabaseOpen()).toBe(true)

    const db = getDatabase()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const tableNames = tables.map((t) => t.name)
    expect(tableNames).toContain('clienti')
    expect(tableNames).toContain('schema_migrations')
  })

  it('il DB dopo reset è vuoto (nessun dato del vecchio DB)', async () => {
    creaDbDiTest(DB_PATH)

    await resetDatabase('nuovapassword')
    const db = getDatabase()
    const clienti = db.prepare('SELECT COUNT(*) as n FROM clienti').get() as { n: number }
    expect(clienti.n).toBe(0)
  })

  it('funziona anche se non c\'è nessun DB su disco', async () => {
    // beforeEach ha già rimosso il DB_PATH
    expect(existsSync(DB_PATH)).toBe(false)

    await resetDatabase('nuovapassword3')
    expect(isDatabaseOpen()).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: Drive stub
// ─────────────────────────────────────────────────────────────────────────────

describe('Drive — stato non configurato/connesso', () => {
  it('isDriveConnected restituisce false quando non ci sono token salvati', () => {
    expect(isDriveConnected()).toBe(false)
  })

  it('connectDrive lancia errore quando le credenziali non sono configurate', async () => {
    // Con settings vuote (mock electron), il Client ID e Secret saranno stringa vuota
    await expect(connectDrive()).rejects.toThrow()
  })

  it('backupSuDrive lancia DRIVE_NOT_CONNECTED quando non connesso', async () => {
    await expect(backupSuDrive('/fake/path.db')).rejects.toThrow('DRIVE_NOT_CONNECTED')
  })

  it('listBackupDrive lancia DRIVE_NOT_CONNECTED quando non connesso', async () => {
    await expect(listBackupDrive()).rejects.toThrow('DRIVE_NOT_CONNECTED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7: round-trip backup → restore → lettura dati
// ─────────────────────────────────────────────────────────────────────────────

describe('round-trip integrazione: backup → restore → DB apribile', () => {
  it('dopo backup e restore il DB è aperto e le migrazioni sono presenti', async () => {
    // 1. Crea DB cifrato a DB_PATH tramite openDatabase (necessario con SQLCipher)
    openDatabase('testpassword')
    chiudiDbModulo()

    // 2. Crea il backup dal DB cifrato
    const backupPath = tempPath('.db')
    await backupLocale(backupPath)
    expect(existsSync(backupPath)).toBe(true)
    expect(existsSync(backupPath + '.manifest.json')).toBe(true)

    // 3. Chiudi e svuota il DB corrente
    cleanupFiles(DB_PATH)

    // 4. Ripristina il backup
    await ripristinaBackup(backupPath, { password: 'testpassword' })

    // 5. Il DB deve essere aperto
    expect(isDatabaseOpen()).toBe(true)

    // 6. Le tabelle di migrazione devono esistere
    const db = getDatabase()
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as { version: number }[]
    expect(versions.length).toBeGreaterThan(0)

    cleanupFiles(backupPath)
  })

  it('il manifest del backup riporta la versione schema corretta', async () => {
    const sourcePath = tempPath('.db')
    creaDbDiTest(sourcePath)
    copyFileSync(sourcePath, DB_PATH)

    const backupPath = tempPath('.db')
    const manifest = await backupLocale(backupPath)

    expect(manifest.version).toBeGreaterThanOrEqual(0)
    expect(manifest.appVersion).toBe('0.1.0-test')

    cleanupFiles(sourcePath, backupPath)
  })

  it('il backup è un file DB con dimensione > 0', async () => {
    const sourcePath = tempPath('.db')
    creaDbDiTest(sourcePath)
    copyFileSync(sourcePath, DB_PATH)

    const backupPath = tempPath('.db')
    await backupLocale(backupPath)

    const stat = statSync(backupPath)
    expect(stat.size).toBeGreaterThan(0)

    cleanupFiles(sourcePath, backupPath)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8: risolviCartellaBackup
// ─────────────────────────────────────────────────────────────────────────────

describe('risolviCartellaBackup', () => {
  it('ritorna il default se la cartella è vuota o whitespace', () => {
    expect(risolviCartellaBackup('', '/def')).toBe('/def')
    expect(risolviCartellaBackup('   ', '/def')).toBe('/def')
  })
  it('ritorna la cartella configurata se valorizzata', () => {
    expect(risolviCartellaBackup('/custom', '/def')).toBe('/custom')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 9: backupAutomatico — cartella e retention parametriche
// ─────────────────────────────────────────────────────────────────────────────

describe('backupAutomatico — cartella e retention parametriche', () => {
  it('scrive nella cartella passata in opts', async () => {
    const dir = join(TEST_USER_DATA, 'custom-bk')
    creaDbDiTest(DB_PATH)
    const p = await backupAutomatico({ dir, retention: 10 })
    expect(p.startsWith(dir)).toBe(true)
    expect(existsSync(p)).toBe(true)
  })

  it('ruota mantenendo esattamente `retention` file', async () => {
    const dir = join(TEST_USER_DATA, 'rot-bk')
    mkdirSync(dir, { recursive: true })
    for (let i = 0; i < 6; i++) {
      const f = join(dir, `backup_2026010${i}_000000.db`)
      writeFileSync(f, 'x')
    }
    creaDbDiTest(DB_PATH)
    await backupAutomatico({ dir, retention: 3 })
    const rimasti = readdirSync(dir).filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
    expect(rimasti.length).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 10: listBackupLocali
// ─────────────────────────────────────────────────────────────────────────────

describe('listBackupLocali', () => {
  it('elenca i backup con manifest, ordinati dal più recente', async () => {
    const dir = join(TEST_USER_DATA, 'list-bk')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'backup_20260101_100000.db'), 'x')
    writeFileSync(
      join(dir, 'backup_20260101_100000.db.manifest.json'),
      JSON.stringify({ version: 6, createdAt: '2026-01-01T10:00:00.000Z', appVersion: '0.1.0', dbPath: 'x' })
    )
    writeFileSync(join(dir, 'backup_20260201_120000.db'), 'x')
    writeFileSync(
      join(dir, 'backup_20260201_120000.db.manifest.json'),
      JSON.stringify({ version: 7, createdAt: '2026-02-01T12:00:00.000Z', appVersion: '0.1.1', dbPath: 'x' })
    )

    const lista = await listBackupLocali(dir)
    expect(lista.length).toBe(2)
    expect(lista[0].createdAt).toBe('2026-02-01T12:00:00.000Z')
    expect(lista[0].appVersion).toBe('0.1.1')
    expect(lista[0].version).toBe(7)
    expect(lista[1].appVersion).toBe('0.1.0')
  })

  it('include i backup senza manifest (fallback) ed esclude i file non-backup', async () => {
    const dir = join(TEST_USER_DATA, 'list-bk2')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'backup_20260301_090000.db'), 'x')
    writeFileSync(join(dir, 'altro.db'), 'x')
    writeFileSync(join(dir, 'note.txt'), 'x')

    const lista = await listBackupLocali(dir)
    expect(lista.length).toBe(1)
    expect(lista[0].path.endsWith('backup_20260301_090000.db')).toBe(true)
    expect(typeof lista[0].createdAt).toBe('string')
    expect(lista[0].createdAt.length).toBeGreaterThan(0)
  })

  it('ritorna [] se la cartella non esiste', async () => {
    const lista = await listBackupLocali(join(TEST_USER_DATA, 'inesistente-xyz'))
    expect(lista).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 11: chiave di recupero nei backup (AC9, AC10, AC11)
// ─────────────────────────────────────────────────────────────────────────────

/** Crea il DB cifrato con la chiave di recupero (e il PIN) e ne fa un backup. */
async function backupConChiave(): Promise<{ backupPath: string; chiave: string }> {
  openDatabase('testpassword')
  const chiave = generaChiaveRecupero('testpassword')
  impostaPin('testpassword', 'Gym24a')
  chiudiDbModulo()
  const backupPath = tempPath('.db')
  await backupLocale(backupPath)
  return { backupPath, chiave }
}

describe('backup con chiave di recupero', () => {
  it('il manifest contiene lo slot `recupero` se la chiave esiste', async () => {
    const { backupPath } = await backupConChiave()
    try {
      const manifest = JSON.parse(
        readFileSync(backupPath + '.manifest.json', 'utf-8')
      ) as BackupManifest
      expect(manifest.recupero).toEqual(getSlotRecupero())
      expect(manifest.recupero?.versione).toBe(1)
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('senza chiave il manifest non ha il campo `recupero`', async () => {
    creaDbDiTest(DB_PATH)
    const backupPath = tempPath('.db')
    try {
      const manifest = await backupLocale(backupPath)
      expect(manifest.recupero).toBeUndefined()
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('ripristino con la chiave: DB aperto, recupero in corso, PIN disattivato, slot del backup', async () => {
    const { backupPath, chiave } = await backupConChiave()
    const slotBackup = getSlotRecupero()
    try {
      cleanupFiles(DB_PATH)
      // Slot corrente diverso da quello del backup
      openDatabase('altra-password')
      generaChiaveRecupero('altra-password')
      expect(getSlotRecupero()).not.toEqual(slotBackup)

      await ripristinaBackup(backupPath, { chiaveRecupero: chiave.toLowerCase() })
      expect(isDatabaseOpen()).toBe(true)
      expect(getCurrentKey()).toBe(deriveKey('testpassword'))
      expect(isRecuperoInCorso()).toBe(true)
      expect(statoSblocco().pinAttivo).toBe(false)
      expect(getSlotRecupero()).toEqual(slotBackup)
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('backup senza slot → RECUPERO_NON_DISPONIBILE', async () => {
    openDatabase('testpassword')
    chiudiDbModulo()
    const backupPath = tempPath('.db')
    await backupLocale(backupPath)
    try {
      await expect(
        ripristinaBackup(backupPath, { chiaveRecupero: '0000-0000-0000-0000-0000-0000' })
      ).rejects.toThrow('RECUPERO_NON_DISPONIBILE')
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('CHIAVE_ERRATA lascia intatto il DB corrente', async () => {
    const { backupPath } = await backupConChiave()
    try {
      cleanupFiles(DB_PATH)
      openDatabase('corrente-password')
      getDatabase()
        .prepare(`INSERT INTO clienti (nome, cognome, codice_fiscale) VALUES ('Anna', 'Bianchi', ?)`)
        .run(uniqueCF())
      const statoPrima = readFileSync(getSbloccoPath(), 'utf-8')

      await expect(
        ripristinaBackup(backupPath, { chiaveRecupero: '0000-0000-0000-0000-0000-0000' })
      ).rejects.toThrow('CHIAVE_ERRATA')

      expect(isDatabaseOpen()).toBe(true)
      expect(getCurrentKey()).toBe(deriveKey('corrente-password'))
      const n = getDatabase()
        .prepare(`SELECT COUNT(*) AS n FROM clienti WHERE cognome = 'Bianchi'`)
        .get() as { n: number }
      expect(n.n).toBe(1)
      expect(readFileSync(getSbloccoPath(), 'utf-8')).toBe(statoPrima)
      expect(isRecuperoInCorso()).toBe(false)
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('ripristino con password di un backup senza slot: PIN disattivato e nessuna chiave corrente', async () => {
    openDatabase('testpassword')
    chiudiDbModulo()
    const backupPath = tempPath('.db')
    await backupLocale(backupPath)
    try {
      openDatabase('testpassword')
      generaChiaveRecupero('testpassword')
      impostaPin('testpassword', 'Gym24a')
      chiudiDbModulo()

      await ripristinaBackup(backupPath, { password: 'testpassword' })
      expect(isDatabaseOpen()).toBe(true)
      expect(isRecuperoInCorso()).toBe(false)
      expect(statoSblocco()).toMatchObject({ recuperoAttivo: false, pinAttivo: false })
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('ripristino con password di un backup con slot: lo slot del backup diventa corrente', async () => {
    const { backupPath } = await backupConChiave()
    const slotBackup = getSlotRecupero()
    try {
      eliminaStatoSblocco()
      await ripristinaBackup(backupPath, { password: 'testpassword' })
      expect(getSlotRecupero()).toEqual(slotBackup)
      expect(statoSblocco().pinAttivo).toBe(false)
      expect(isRecuperoInCorso()).toBe(false)
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('resetDatabase elimina sblocco.json', async () => {
    openDatabase('testpassword')
    generaChiaveRecupero('testpassword')
    chiudiDbModulo()
    expect(existsSync(getSbloccoPath())).toBe(true)

    await resetDatabase('nuovapassword')
    expect(existsSync(getSbloccoPath())).toBe(false)
    expect(statoSblocco().recuperoAttivo).toBe(false)
  })
})

describe('Drive — slot di recupero nei metadati', () => {
  const tokensPath = join(TEST_USER_DATA, 'drive-tokens.json')

  beforeEach(() => {
    writeFileSync(
      tokensPath,
      JSON.stringify({
        access_token: 'tok',
        refresh_token: 'ref',
        expiry_date: Date.now() + 3_600_000,
        client_id: 'id',
        client_secret: 'secret'
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (existsSync(tokensPath)) unlinkSync(tokensPath)
  })

  /** fetch mockato: cartella esistente, upload che registra il corpo multipart. */
  function stubFetch(descrizione?: string): { corpi: string[] } {
    const corpi: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: unknown }) => {
        if (url.includes('/upload/drive/v3/files')) {
          corpi.push(Buffer.from(init?.body as Buffer).toString('latin1'))
          return new Response(JSON.stringify({ id: 'file-1', name: 'x' }), { status: 200 })
        }
        if (url.includes('fields=description')) {
          const meta = descrizione === undefined ? {} : { description: descrizione }
          return new Response(JSON.stringify(meta), { status: 200 })
        }
        return new Response(JSON.stringify({ files: [{ id: 'folder-1' }] }), { status: 200 })
      })
    )
    return { corpi }
  }

  /** Estrae i metadati JSON (prima parte) dal corpo multipart. */
  function metadati(corpo: string): { name: string; description?: string } {
    const parte = corpo.split('\r\n\r\n')[1].split('\r\n')[0]
    return JSON.parse(parte) as { name: string; description?: string }
  }

  it('backupSuDrive mette lo slot del manifest nel campo description', async () => {
    const { backupPath } = await backupConChiave()
    const { corpi } = stubFetch()
    try {
      await backupSuDrive(backupPath)
      expect(corpi).toHaveLength(1)
      const meta = metadati(corpi[0])
      expect(meta.name).toMatch(/^gymmanager_backup_/)
      expect(JSON.parse(meta.description as string)).toEqual(getSlotRecupero())
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('backupSuDrive senza slot nel manifest non invia description', async () => {
    creaDbDiTest(DB_PATH)
    const backupPath = tempPath('.db')
    await backupLocale(backupPath)
    const { corpi } = stubFetch()
    try {
      await backupSuDrive(backupPath)
      expect(metadati(corpi[0]).description).toBeUndefined()
    } finally {
      cleanupFiles(backupPath)
    }
  })

  it('leggiSlotBackupDrive legge lo slot dalla description (null se assente o non valida)', async () => {
    openDatabase('testpassword')
    generaChiaveRecupero('testpassword')
    const slot = getSlotRecupero()
    stubFetch(JSON.stringify(slot))
    expect(await leggiSlotBackupDrive('file-1')).toEqual(slot)
    stubFetch()
    expect(await leggiSlotBackupDrive('file-1')).toBeNull()
    stubFetch('testo libero')
    expect(await leggiSlotBackupDrive('file-1')).toBeNull()
  })
})
