/**
 * Un errore tecnico di apertura del DB (`DB_APERTURA_FALLITA`) arriva invariato al renderer da
 * `db:setup`, `db:unlock`, `db:unlockPin` e `db:unlockRecupero` (il renderer lo riconosce con
 * `includes`). Database e servizio di sblocco sono mockati parzialmente.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  return {
    app: { getPath: () => osTmpdir(), getVersion: () => '0.1.0-test' },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(s),
      decryptString: (b: Buffer) => b.toString()
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
vi.mock('../../src/main/db/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/main/db/database')>()),
  openDatabase: vi.fn(() => {
    throw new Error('DB_APERTURA_FALLITA')
  })
}))
vi.mock('../../src/main/sicurezza/sblocco-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/main/sicurezza/sblocco-service')>()),
  sbloccaConPin: vi.fn(() => {
    throw new Error('DB_APERTURA_FALLITA')
  }),
  sbloccaConChiave: vi.fn(() => {
    throw new Error('DB_APERTURA_FALLITA')
  }),
  azzeraContatorePin: vi.fn()
}))

import { registerIpcHandlers } from '../../src/main/ipc/handlers'
import { azzeraContatorePin } from '../../src/main/sicurezza/sblocco-service'

registerIpcHandlers()

function invoca(canale: string, args: unknown): Promise<unknown> {
  const fn = mocks.handlers.get(canale)
  if (!fn) throw new Error(`handler mancante: ${canale}`)
  return Promise.resolve().then(() => fn({ sender: {} }, args))
}

beforeEach(() => {
  vi.mocked(azzeraContatorePin).mockClear()
})

describe('errore tecnico di apertura del DB verso il renderer', () => {
  it('db:setup rigetta con DB_APERTURA_FALLITA', async () => {
    await expect(invoca('db:setup', { password: 'una-password' })).rejects.toThrow(
      'DB_APERTURA_FALLITA'
    )
  })

  it('db:unlock rigetta con DB_APERTURA_FALLITA senza azzerare il contatore PIN', async () => {
    await expect(invoca('db:unlock', { password: 'una-password' })).rejects.toThrow(
      'DB_APERTURA_FALLITA'
    )
    expect(azzeraContatorePin).not.toHaveBeenCalled()
  })

  it('db:unlockPin rigetta con DB_APERTURA_FALLITA (non è un esito PIN errato)', async () => {
    await expect(invoca('db:unlockPin', { pin: 'Gym24a' })).rejects.toThrow('DB_APERTURA_FALLITA')
  })

  it('db:unlockRecupero rigetta con DB_APERTURA_FALLITA', async () => {
    await expect(
      invoca('db:unlockRecupero', { chiave: '0000-0000-0000-0000-0000-0000' })
    ).rejects.toThrow('DB_APERTURA_FALLITA')
  })
})
