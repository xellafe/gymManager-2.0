/**
 * Test del servizio di sblocco alternativo (chiave di recupero e PIN) su DB reale.
 * Electron è mockato: userData su tmpdir, safeStorage simulato (XOR), ipcMain che
 * raccoglie gli handler per verificare `db:unlock` e `db:getState`.
 * Le asserzioni che dipendono dalla cifratura reale sono gated da CIPHER_ENABLED.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  cifraturaDisponibile: true,
  decifraturaRotta: false
}))

vi.mock('electron', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: fsMkdir } = require('fs')
  const base = pathJoin(osTmpdir(), `gymmanager-sblocco-${process.pid}`)
  const userData = pathJoin(base, 'userData')
  const altro = pathJoin(base, 'altro')
  fsMkdir(userData, { recursive: true })
  fsMkdir(altro, { recursive: true })
  const xor = (b: Buffer): Buffer => Buffer.from(b.map((x) => x ^ 0x5a))
  return {
    app: {
      getPath: (name: string) => (name === 'userData' ? userData : altro),
      getVersion: () => '0.1.0-test'
    },
    safeStorage: {
      isEncryptionAvailable: () => mocks.cifraturaDisponibile,
      encryptString: (s: string) => xor(Buffer.from(s, 'utf-8')),
      decryptString: (b: Buffer) => {
        if (mocks.decifraturaRotta) throw new Error('decrypt failed')
        return xor(b).toString('utf-8')
      }
    },
    ipcMain: {
      handle: (canale: string, fn: (...args: unknown[]) => unknown) => {
        mocks.handlers.set(canale, fn)
      }
    },
    BrowserWindow: { fromWebContents: () => null },
    dialog: {},
    shell: {}
  }
})
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../src/main/pdf/generator', () => ({ generaPDFInElectron: vi.fn() }))
vi.mock('../../src/main/updater/auto-updater', () => ({
  checkForUpdates: vi.fn(),
  installUpdate: vi.fn(),
  revealDownloadedUpdate: vi.fn()
}))
vi.mock('../../src/main/backup/backup-scheduler', () => ({
  initBackupScheduler: vi.fn(),
  restartBackupScheduler: vi.fn()
}))
vi.mock('../../src/main/sync/sync-service', () => ({
  getStatus: vi.fn(),
  upload: vi.fn(),
  syncOnOpen: vi.fn(async () => undefined),
  checkRemote: vi.fn(),
  resolveConflict: vi.fn(),
  enableSync: vi.fn(),
  disableSync: vi.fn(),
  setPolling: vi.fn()
}))

import {
  openDatabase,
  closeDatabase,
  isDatabaseOpen,
  getCurrentKey,
  deriveKey,
  DB_PATH
} from '../../src/main/db/database'
import {
  generaChiaveRecupero,
  sbloccaConChiave,
  completaRecupero,
  impostaPin,
  disattivaPin,
  sbloccaConPin,
  statoSblocco,
  getSbloccoPath,
  eliminaStatoSblocco,
  isRecuperoInCorso
} from '../../src/main/sicurezza/sblocco-service'
import { registerIpcHandlers } from '../../src/main/ipc/handlers'

registerIpcHandlers()

function isCipherEnabled(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSQLite = require('better-sqlite3-multiple-ciphers')
  const tempFile = join(tmpdir(), `cipher-probe-sblocco-${process.pid}-${Date.now()}.db`)
  try {
    const dbA = new BetterSQLite(tempFile)
    dbA.pragma("key='alpha'")
    dbA.prepare('CREATE TABLE IF NOT EXISTS _p (id INTEGER PRIMARY KEY)').run()
    dbA.close()
    const dbB = new BetterSQLite(tempFile)
    dbB.pragma("key='beta'")
    try {
      const res = dbB.prepare('PRAGMA integrity_check').all()
      dbB.close()
      const ok =
        Array.isArray(res) &&
        res.length === 1 &&
        (res[0] as Record<string, string>)['integrity_check'] === 'ok'
      return !ok
    } catch {
      try { dbB.close() } catch { /* ignore */ }
      return true
    }
  } catch {
    return false
  } finally {
    if (existsSync(tempFile)) { try { unlinkSync(tempFile) } catch { /* ignore */ } }
  }
}
const CIPHER_ENABLED = isCipherEnabled()

const PASSWORD = 'vecchia-password'
const PIN = 'Gym24a'

function invoca<T>(canale: string, args?: unknown): Promise<T> {
  const fn = mocks.handlers.get(canale)
  if (!fn) throw new Error(`handler mancante: ${canale}`)
  return Promise.resolve(fn({ sender: {} }, args) as T)
}

function leggiFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(getSbloccoPath(), 'utf-8')) as Record<string, unknown>
}

function cleanup(): void {
  if (isDatabaseOpen()) closeDatabase()
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    if (existsSync(f)) { try { unlinkSync(f) } catch { /* ignore */ } }
  }
  eliminaStatoSblocco()
  mocks.cifraturaDisponibile = true
  mocks.decifraturaRotta = false
}
beforeEach(cleanup)
afterEach(cleanup)

/** DB nuovo aperto con PASSWORD. */
function dbAperto(): void {
  openDatabase(PASSWORD)
}

/** Istante `minuti` dopo `base`. */
function dopo(base: Date, minuti: number): Date {
  return new Date(base.getTime() + minuti * 60_000)
}

// ─────────────────────────────────────────────────────────────────────────────

describe('master password richiesta (AC5)', () => {
  it('generare la chiave con password errata → PASSWORD_WRONG', () => {
    dbAperto()
    expect(() => generaChiaveRecupero('sbagliata')).toThrow('PASSWORD_WRONG')
    expect(statoSblocco().recuperoAttivo).toBe(false)
  })

  it('impostare il PIN con password errata → PASSWORD_WRONG', () => {
    dbAperto()
    expect(() => impostaPin('sbagliata', PIN)).toThrow('PASSWORD_WRONG')
    expect(statoSblocco().pinAttivo).toBe(false)
  })

  it('a DB chiuso generare la chiave → PASSWORD_WRONG', () => {
    expect(() => generaChiaveRecupero(PASSWORD)).toThrow('PASSWORD_WRONG')
  })

  it('formato PIN non valido → PIN_FORMATO_NON_VALIDO', () => {
    dbAperto()
    expect(() => impostaPin(PASSWORD, 'abc12')).toThrow('PIN_FORMATO_NON_VALIDO')
    expect(() => impostaPin(PASSWORD, 'abc-12')).toThrow('PIN_FORMATO_NON_VALIDO')
  })

  it('senza safeStorage → PIN_NON_DISPONIBILE e pinDisponibile false', () => {
    dbAperto()
    mocks.cifraturaDisponibile = false
    expect(() => impostaPin(PASSWORD, PIN)).toThrow('PIN_NON_DISPONIBILE')
    expect(statoSblocco().pinDisponibile).toBe(false)
  })

  it('disattivare il PIN non richiede la password', () => {
    dbAperto()
    impostaPin(PASSWORD, PIN)
    expect(statoSblocco().pinAttivo).toBe(true)
    closeDatabase()
    disattivaPin()
    expect(statoSblocco().pinAttivo).toBe(false)
  })

  it('rigenerare la chiave invalida la precedente', () => {
    dbAperto()
    const prima = generaChiaveRecupero(PASSWORD)
    const seconda = generaChiaveRecupero(PASSWORD)
    expect(seconda).not.toBe(prima)
    closeDatabase()
    expect(() => sbloccaConChiave(prima)).toThrow('CHIAVE_ERRATA')
    sbloccaConChiave(seconda)
    expect(isDatabaseOpen()).toBe(true)
  })
})

describe('sblocco con PIN (AC2, AC4)', () => {
  it('il PIN distingue maiuscole e minuscole', () => {
    dbAperto()
    impostaPin(PASSWORD, PIN)
    closeDatabase()
    expect(sbloccaConPin('gym24a')).toEqual({ esito: 'errato', bloccatoFino: null })
    expect(isDatabaseOpen()).toBe(false)
    expect(sbloccaConPin(PIN)).toEqual({ esito: 'ok' })
    expect(isDatabaseOpen()).toBe(true)
    expect(getCurrentKey()).toBe(deriveKey(PASSWORD))
  })

  it('blocco dal 5° errore, tentativi durante il blocco non contati, persistenza su disco', async () => {
    dbAperto()
    impostaPin(PASSWORD, PIN)
    closeDatabase()
    const t0 = new Date('2026-11-01T10:00:00.000Z')

    for (let i = 1; i <= 4; i++) {
      expect(sbloccaConPin('zzzzzz', t0)).toEqual({ esito: 'errato', bloccatoFino: null })
    }
    const quinto = sbloccaConPin('zzzzzz', t0)
    expect(quinto).toEqual({ esito: 'errato', bloccatoFino: dopo(t0, 1).toISOString() })

    // Durante il blocco anche il PIN corretto è rifiutato e il contatore non cresce
    expect(sbloccaConPin(PIN, dopo(t0, 0.5))).toEqual({
      esito: 'bloccato',
      bloccatoFino: dopo(t0, 1).toISOString()
    })
    expect(isDatabaseOpen()).toBe(false)
    expect(leggiFile().pinErrori).toBe(5)

    // Reinizializzazione del servizio: contatore e blocco letti da sblocco.json
    vi.resetModules()
    const servizio = await import('../../src/main/sicurezza/sblocco-service')
    expect(servizio.statoSblocco(dopo(t0, 0.5)).pinBloccatoFino).toBe(dopo(t0, 1).toISOString())
    expect(servizio.sbloccaConPin('zzzzzz', dopo(t0, 0.5)).esito).toBe('bloccato')

    // Dopo la scadenza: 6° errore → 2 minuti
    const sesto = servizio.sbloccaConPin('zzzzzz', dopo(t0, 2))
    expect(sesto).toEqual({ esito: 'errato', bloccatoFino: dopo(t0, 4).toISOString() })
    expect(leggiFile().pinErrori).toBe(6)
  })

  it('al 10° errore lo slot PIN è rimosso', () => {
    dbAperto()
    impostaPin(PASSWORD, PIN)
    closeDatabase()
    let ora = new Date('2026-11-01T10:00:00.000Z')
    for (let i = 1; i <= 9; i++) {
      expect(sbloccaConPin('zzzzzz', ora).esito).toBe('errato')
      ora = dopo(ora, 60) // oltre qualunque blocco
    }
    expect(sbloccaConPin('zzzzzz', ora)).toEqual({ esito: 'disattivato' })
    const file = leggiFile()
    expect(file.pin).toBeNull()
    expect(file.pinErrori).toBe(0)
    expect(statoSblocco().pinAttivo).toBe(false)
    // Il PIN corretto non funziona più
    expect(sbloccaConPin(PIN, ora)).toEqual({ esito: 'disattivato' })
    expect(isDatabaseOpen()).toBe(false)
  })

  it('il PIN corretto azzera il contatore', () => {
    dbAperto()
    impostaPin(PASSWORD, PIN)
    closeDatabase()
    const t0 = new Date('2026-11-01T10:00:00.000Z')
    for (let i = 1; i <= 5; i++) sbloccaConPin('zzzzzz', t0)
    expect(leggiFile().pinErrori).toBe(5)
    expect(sbloccaConPin(PIN, dopo(t0, 2))).toEqual({ esito: 'ok' })
    expect(leggiFile().pinErrori).toBe(0)
    expect(leggiFile().pinBloccatoFino).toBeNull()
  })

  it('db:unlock riuscito azzera il contatore', async () => {
    dbAperto()
    impostaPin(PASSWORD, PIN)
    closeDatabase()
    const t0 = new Date('2026-11-01T10:00:00.000Z')
    for (let i = 1; i <= 5; i++) sbloccaConPin('zzzzzz', t0)
    expect(leggiFile().pinErrori).toBe(5)
    await invoca('db:unlock', { password: PASSWORD })
    expect(isDatabaseOpen()).toBe(true)
    expect(leggiFile().pinErrori).toBe(0)
    expect(leggiFile().pinBloccatoFino).toBeNull()
  })

  it('db:unlockPin restituisce l\'esito e apre il DB', async () => {
    dbAperto()
    impostaPin(PASSWORD, PIN)
    closeDatabase()
    expect(await invoca('db:unlockPin', { pin: PIN })).toEqual({ esito: 'ok' })
    expect(await invoca('db:getState')).toEqual({ state: 'ready' })
  })

  it('safeStorage che non decifra: PIN disattivato senza contare l\'errore', () => {
    dbAperto()
    impostaPin(PASSWORD, PIN)
    closeDatabase()
    mocks.decifraturaRotta = true
    expect(sbloccaConPin(PIN)).toEqual({ esito: 'disattivato' })
    expect(leggiFile().pin).toBeNull()
    expect(leggiFile().pinErrori).toBe(0)
  })

  it.skipIf(!CIPHER_ENABLED)('[CIPHER] PIN che non apre più il DB: disattivato', () => {
    dbAperto()
    impostaPin(PASSWORD, PIN)
    closeDatabase()
    for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
      if (existsSync(f)) unlinkSync(f)
    }
    openDatabase('altra-password')
    closeDatabase()
    expect(sbloccaConPin(PIN)).toEqual({ esito: 'disattivato' })
    expect(statoSblocco().pinAttivo).toBe(false)
    expect(isDatabaseOpen()).toBe(false)
  })
})

describe('sblocco con chiave di recupero (AC6)', () => {
  it('senza chiave generata → RECUPERO_NON_DISPONIBILE', () => {
    dbAperto()
    closeDatabase()
    expect(() => sbloccaConChiave('0000-0000-0000-0000-0000-0000')).toThrow('RECUPERO_NON_DISPONIBILE')
  })

  it('chiave errata o malformata → CHIAVE_ERRATA, DB chiuso', () => {
    dbAperto()
    generaChiaveRecupero(PASSWORD)
    closeDatabase()
    expect(() => sbloccaConChiave('0000-0000-0000-0000-0000-0000')).toThrow('CHIAVE_ERRATA')
    expect(() => sbloccaConChiave('troppo-corta')).toThrow('CHIAVE_ERRATA')
    expect(isDatabaseOpen()).toBe(false)
    expect(isRecuperoInCorso()).toBe(false)
  })

  it('recupero completo: stato recupero, nuova password, vecchia chiave invalidata, PIN valido', async () => {
    dbAperto()
    const chiave = generaChiaveRecupero(PASSWORD)
    impostaPin(PASSWORD, PIN)
    closeDatabase()

    // La chiave si inserisce ignorando trattini e maiuscole
    await invoca('db:unlockRecupero', { chiave: chiave.toLowerCase().replace(/-/g, ' ') })
    expect(isDatabaseOpen()).toBe(true)
    expect(await invoca('db:getState')).toEqual({ state: 'recupero' })

    await expect(invoca('recupero:completa', { nuovaPassword: 'corta' })).rejects.toThrow(
      'VALIDATION_ERROR'
    )
    const nuovaChiave = await invoca<string>('recupero:completa', { nuovaPassword: 'nuova-password' })
    expect(nuovaChiave).not.toBe(chiave)
    expect(await invoca('db:getState')).toEqual({ state: 'ready' })
    await expect(invoca('recupero:completa', { nuovaPassword: 'altra-password' })).rejects.toThrow(
      'RECUPERO_NON_IN_CORSO'
    )
    expect(getCurrentKey()).toBe(deriveKey('nuova-password'))
    closeDatabase()

    expect(() => openDatabase('nuova-password')).not.toThrow()
    closeDatabase()
    expect(() => sbloccaConChiave(chiave)).toThrow('CHIAVE_ERRATA')
    sbloccaConChiave(nuovaChiave)
    expect(getCurrentKey()).toBe(deriveKey('nuova-password'))
    closeDatabase()
    expect(sbloccaConPin(PIN)).toEqual({ esito: 'ok' })
    expect(getCurrentKey()).toBe(deriveKey('nuova-password'))
  })

  it.skipIf(!CIPHER_ENABLED)('[CIPHER] dopo il recupero la vecchia password non apre il DB', () => {
    dbAperto()
    const chiave = generaChiaveRecupero(PASSWORD)
    closeDatabase()
    sbloccaConChiave(chiave)
    completaRecupero('nuova-password')
    closeDatabase()
    expect(() => openDatabase(PASSWORD)).toThrow('PASSWORD_WRONG')
  })

  it.skipIf(!CIPHER_ENABLED)('[CIPHER] chiave che decifra ma non apre il DB → CHIAVE_NON_VALIDA', () => {
    dbAperto()
    const chiave = generaChiaveRecupero(PASSWORD)
    closeDatabase()
    for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
      if (existsSync(f)) unlinkSync(f)
    }
    openDatabase('altra-password')
    closeDatabase()
    expect(() => sbloccaConChiave(chiave)).toThrow('CHIAVE_NON_VALIDA')
    expect(isDatabaseOpen()).toBe(false)
    expect(isRecuperoInCorso()).toBe(false)
  })
})

describe('sblocco.json non contiene segreti in chiaro (AC8)', () => {
  it('nessuna traccia di dbKey, chiave di recupero o PIN; slot PIN cifrato con safeStorage', () => {
    dbAperto()
    const dbKey = getCurrentKey() as string
    const chiave = generaChiaveRecupero(PASSWORD)
    impostaPin(PASSWORD, PIN)

    const testo = readFileSync(getSbloccoPath(), 'utf-8')
    const varianti = [
      dbKey,
      dbKey.toUpperCase(),
      Buffer.from(dbKey, 'hex').toString('base64'),
      chiave,
      chiave.replace(/-/g, ''),
      PIN
    ]
    for (const v of varianti) expect(testo).not.toContain(v)

    // Lo slot PIN non è JSON leggibile: è il risultato di safeStorage.encryptString
    const file = JSON.parse(testo) as { pin: string; recupero: unknown }
    const grezzo = Buffer.from(file.pin, 'base64').toString('utf-8')
    expect(() => JSON.parse(grezzo)).toThrow()
    expect(grezzo).not.toContain('dbKeyCifrata')
    expect(file.recupero).toMatchObject({ versione: 1 })

    // Nessun dato di sblocco in settings.json
    const settingsPath = join(tmpdir(), `gymmanager-sblocco-${process.pid}`, 'userData', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = readFileSync(settingsPath, 'utf-8')
      expect(settings).not.toContain('recupero')
      expect(settings).not.toContain('dbKeyCifrata')
      expect(settings).not.toContain(file.pin)
    }
  })

  it('file assente → tutto disattivato', () => {
    expect(existsSync(getSbloccoPath())).toBe(false)
    expect(statoSblocco()).toEqual({
      recuperoAttivo: false,
      pinAttivo: false,
      pinBloccatoFino: null,
      pinDisponibile: true
    })
  })

  it('file corrotto → ignorato', () => {
    writeFileSync(getSbloccoPath(), '{ non json', 'utf-8')
    expect(statoSblocco().recuperoAttivo).toBe(false)
  })
})
