/**
 * Classificazione degli errori di apertura del DB (fase 1 di `openDatabase` e
 * `openDatabaseWithKey`): solo `SQLITE_NOTADB` / `file is not a database` è una chiave errata
 * (`PASSWORD_WRONG`); ogni altro errore (es. modulo nativo compilato per un altro ABI) è
 * `DB_APERTURA_FALLITA`. Il modulo nativo è mockato: nessun DB reale.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  /** Errore lanciato dal costruttore di Database (null = nessuno). */
  erroreCostruttore: null as Error | null,
  /** Errore lanciato da `pragma('user_version')` (null = nessuno). */
  erroreUserVersion: null as Error | null,
  chiusure: 0
}))

vi.mock('better-sqlite3-multiple-ciphers', () => {
  class DatabaseFinto {
    open = true
    constructor(_path: string) {
      if (mocks.erroreCostruttore) throw mocks.erroreCostruttore
    }
    pragma(sql: string): unknown {
      if (sql === 'user_version' && mocks.erroreUserVersion) throw mocks.erroreUserVersion
      return 0
    }
    close(): void {
      this.open = false
      mocks.chiusure++
    }
  }
  return { default: DatabaseFinto }
})
vi.mock('electron', () => ({
  app: { getPath: (name: string) => `C:/finto/${name}` }
}))
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import {
  openDatabase,
  openDatabaseWithKey,
  isDatabaseOpen,
  getCurrentKey
} from '../../src/main/db/database'

const CHIAVE = 'a'.repeat(64)

function erroreAbi(): Error {
  return new Error(
    "The module 'better_sqlite3.node' was compiled against a different Node.js version using " +
      'NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 130.'
  )
}

function erroreNotADb(): Error {
  return Object.assign(new Error('file is not a database'), { code: 'SQLITE_NOTADB' })
}

const aperture: Array<[string, () => void]> = [
  ['openDatabase', () => openDatabase('password-di-test')],
  ['openDatabaseWithKey', () => openDatabaseWithKey(CHIAVE)]
]

describe('classificazione degli errori di apertura del DB', () => {
  beforeEach(() => {
    mocks.erroreCostruttore = null
    mocks.erroreUserVersion = null
    mocks.chiusure = 0
  })

  describe.each(aperture)('%s', (_nome, apri) => {
    it('errore NODE_MODULE_VERSION nel costruttore → DB_APERTURA_FALLITA', () => {
      mocks.erroreCostruttore = erroreAbi()
      expect(apri).toThrow('DB_APERTURA_FALLITA')
      expect(apri).not.toThrow('PASSWORD_WRONG')
      expect(isDatabaseOpen()).toBe(false)
      expect(getCurrentKey()).toBeNull()
    })

    it('SQLITE_NOTADB / file is not a database su user_version → PASSWORD_WRONG', () => {
      mocks.erroreUserVersion = erroreNotADb()
      expect(apri).toThrow('PASSWORD_WRONG')
      expect(mocks.chiusure).toBeGreaterThan(0)
      expect(isDatabaseOpen()).toBe(false)
      expect(getCurrentKey()).toBeNull()
    })

    it('solo il messaggio "file is not a database" (senza code) → PASSWORD_WRONG', () => {
      mocks.erroreUserVersion = new Error('file is not a database')
      expect(apri).toThrow('PASSWORD_WRONG')
    })

    it('altro errore SQLite su user_version → DB_APERTURA_FALLITA e handle chiuso', () => {
      mocks.erroreUserVersion = Object.assign(new Error('unable to open database file'), {
        code: 'SQLITE_CANTOPEN'
      })
      expect(apri).toThrow('DB_APERTURA_FALLITA')
      expect(mocks.chiusure).toBeGreaterThan(0)
      expect(isDatabaseOpen()).toBe(false)
    })
  })
})
