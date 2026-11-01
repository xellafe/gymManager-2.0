/**
 * Test per changePassword (rekey SQLCipher).
 * Riusa il pattern di db.test.ts: electron mockato su tmpdir, DB_PATH fisso.
 * Le asserzioni che dipendono dalla cifratura reale sono gated da CIPHER_ENABLED.
 * Il cambio password via handler `db:changePassword` mantiene validi chiave di recupero e PIN.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { unlinkSync, existsSync } from 'fs'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: fsMkdir } = require('fs')
  const testDataDir = pathJoin(osTmpdir(), `gymmanager-cpw-${process.pid}`)
  fsMkdir(testDataDir, { recursive: true })
  const xor = (b: Buffer): Buffer => Buffer.from(b.map((x) => x ^ 0x5a))
  return {
    app: { getPath: (_n: string) => testDataDir, getVersion: () => '0.1.0-test' },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => xor(Buffer.from(s, 'utf-8')),
      decryptString: (b: Buffer) => xor(b).toString('utf-8')
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
  changePassword,
  getCurrentKey,
  deriveKey,
  DB_PATH
} from '../../src/main/db/database'
import {
  generaChiaveRecupero,
  impostaPin,
  sbloccaConChiave,
  sbloccaConPin,
  eliminaStatoSblocco
} from '../../src/main/sicurezza/sblocco-service'
import { registerIpcHandlers } from '../../src/main/ipc/handlers'

registerIpcHandlers()

function invoca(canale: string, args?: unknown): Promise<unknown> {
  const fn = mocks.handlers.get(canale)
  if (!fn) throw new Error(`handler mancante: ${canale}`)
  return Promise.resolve(fn({ sender: {} }, args))
}

function isCipherEnabled(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSQLite = require('better-sqlite3-multiple-ciphers')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pjoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: ostmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { unlinkSync: fsUnlink, existsSync: fsExists } = require('fs')
  const tempFile = pjoin(ostmpdir(), `cipher-probe-cpw-${process.pid}-${Date.now()}.db`)
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
      const ok = Array.isArray(res) && res.length === 1 && (res[0] as Record<string, string>)['integrity_check'] === 'ok'
      return !ok
    } catch {
      try { dbB.close() } catch { /* ignore */ }
      return true
    }
  } catch {
    return false
  } finally {
    if (fsExists(tempFile)) { try { fsUnlink(tempFile) } catch { /* ignore */ } }
  }
}
const CIPHER_ENABLED = isCipherEnabled()

function cleanup(): void {
  if (isDatabaseOpen()) closeDatabase()
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    if (existsSync(f)) { try { unlinkSync(f) } catch { /* ignore */ } }
  }
  eliminaStatoSblocco()
}
beforeEach(cleanup)
afterEach(cleanup)

describe('changePassword', () => {
  it('lancia se il DB non è aperto', () => {
    expect(() => changePassword('a', 'newpass12')).toThrow()
  })

  it('lancia PASSWORD_WRONG se la vecchia password non corrisponde', () => {
    openDatabase('vecchia-password')
    expect(() => changePassword('sbagliata', 'nuova-password')).toThrow('PASSWORD_WRONG')
  })

  it('con la vecchia password corretta non lancia', () => {
    openDatabase('vecchia-password')
    expect(() => changePassword('vecchia-password', 'nuova-password')).not.toThrow()
    expect(isDatabaseOpen()).toBe(true)
  })

  it.skipIf(!CIPHER_ENABLED)(
    '[CIPHER] dopo il rekey il DB si riapre con la NUOVA password e non con la vecchia',
    () => {
      openDatabase('vecchia-password')
      changePassword('vecchia-password', 'nuova-password')
      closeDatabase()
      expect(() => openDatabase('nuova-password')).not.toThrow()
      closeDatabase()
      expect(() => openDatabase('vecchia-password')).toThrow('PASSWORD_WRONG')
    }
  )
})

describe('db:changePassword mantiene validi chiave di recupero e PIN', () => {
  it('dopo il cambio password chiave e PIN aprono il DB con la nuova chiave', async () => {
    openDatabase('vecchia-password')
    const chiave = generaChiaveRecupero('vecchia-password')
    impostaPin('vecchia-password', 'Gym24a')

    await invoca('db:changePassword', { oldPassword: 'vecchia-password', newPassword: 'nuova-password' })
    expect(getCurrentKey()).toBe(deriveKey('nuova-password'))
    closeDatabase()

    sbloccaConChiave(chiave)
    expect(getCurrentKey()).toBe(deriveKey('nuova-password'))
    closeDatabase()

    expect(sbloccaConPin('Gym24a')).toEqual({ esito: 'ok' })
    expect(getCurrentKey()).toBe(deriveKey('nuova-password'))
  })

  it('senza chiave né PIN il cambio password riesce comunque', async () => {
    openDatabase('vecchia-password')
    await invoca('db:changePassword', { oldPassword: 'vecchia-password', newPassword: 'nuova-password' })
    expect(getCurrentKey()).toBe(deriveKey('nuova-password'))
  })

  it.skipIf(!CIPHER_ENABLED)('[CIPHER] la chiave ricifrata apre davvero il DB rekeyed', async () => {
    openDatabase('vecchia-password')
    const chiave = generaChiaveRecupero('vecchia-password')
    await invoca('db:changePassword', { oldPassword: 'vecchia-password', newPassword: 'nuova-password' })
    closeDatabase()
    expect(() => openDatabase('vecchia-password')).toThrow('PASSWORD_WRONG')
    expect(() => sbloccaConChiave(chiave)).not.toThrow()
    expect(isDatabaseOpen()).toBe(true)
  })
})
