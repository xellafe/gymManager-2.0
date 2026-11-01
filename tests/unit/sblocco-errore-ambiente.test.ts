/**
 * Un errore tecnico di apertura del DB (`DB_APERTURA_FALLITA`, es. modulo nativo compilato
 * per un altro ABI) non deve contare come tentativo né invalidare i metodi di sblocco:
 * `sbloccaConPin` e `sbloccaConChiave` lo rilanciano lasciando `sblocco.json` invariato.
 * `src/main/db/database` è mockato parzialmente: nessun DB reale.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'fs'

const mocks = vi.hoisted(() => ({ password: 'password-di-test' }))

vi.mock('electron', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir: osTmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync: fsMkdir } = require('fs')
  const base = pathJoin(osTmpdir(), `gymmanager-sblocco-ambiente-${process.pid}`)
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
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => xor(Buffer.from(s, 'utf-8')),
      decryptString: (b: Buffer) => xor(b).toString('utf-8')
    }
  }
})
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../src/main/db/database', async (importOriginal) => {
  const originale = await importOriginal<typeof import('../../src/main/db/database')>()
  const chiave = originale.deriveKey(mocks.password)
  return {
    ...originale,
    openDatabaseWithKey: vi.fn(() => {
      throw new Error('DB_APERTURA_FALLITA')
    }),
    isDatabaseOpen: vi.fn(() => false),
    getCurrentKey: vi.fn(() => chiave)
  }
})

import { openDatabaseWithKey } from '../../src/main/db/database'
import {
  generaChiaveRecupero,
  impostaPin,
  sbloccaConPin,
  sbloccaConChiave,
  getSbloccoPath,
  isRecuperoInCorso
} from '../../src/main/sicurezza/sblocco-service'

const PIN = 'Gym24a'
const PIN_ERRATO = 'Gym24b'

function leggiFile(): string {
  return readFileSync(getSbloccoPath(), 'utf-8')
}

describe('DB_APERTURA_FALLITA allo sblocco con PIN o chiave di recupero', () => {
  let chiave: string
  let prima: string

  beforeEach(() => {
    if (existsSync(getSbloccoPath())) unlinkSync(getSbloccoPath())
    impostaPin(mocks.password, PIN)
    chiave = generaChiaveRecupero(mocks.password)
    expect(sbloccaConPin(PIN_ERRATO)).toEqual({ esito: 'errato', bloccatoFino: null })
    expect(sbloccaConPin(PIN_ERRATO)).toEqual({ esito: 'errato', bloccatoFino: null })
    prima = leggiFile()
    const stato = JSON.parse(prima) as Record<string, unknown>
    expect(stato.pinErrori).toBe(2)
    expect(stato.pinBloccatoFino).toBeNull()
    expect(typeof stato.pin).toBe('string')
    expect(stato.recupero).not.toBeNull()
    vi.mocked(openDatabaseWithKey).mockClear()
  })

  it('PIN corretto: rilancia DB_APERTURA_FALLITA, slot PIN e contatore invariati', () => {
    expect(() => sbloccaConPin(PIN)).toThrow('DB_APERTURA_FALLITA')
    expect(openDatabaseWithKey).toHaveBeenCalledTimes(1)
    expect(leggiFile()).toBe(prima)
    const stato = JSON.parse(leggiFile()) as Record<string, unknown>
    expect(stato.pinErrori).toBe(2)
    expect(typeof stato.pin).toBe('string')
  })

  it('chiave di recupero: rilancia DB_APERTURA_FALLITA (non CHIAVE_NON_VALIDA), slot invariato', () => {
    let errore: unknown = null
    try {
      sbloccaConChiave(chiave)
    } catch (err) {
      errore = err
    }
    expect(errore).toBeInstanceOf(Error)
    expect((errore as Error).message).toBe('DB_APERTURA_FALLITA')
    expect(openDatabaseWithKey).toHaveBeenCalledTimes(1)
    expect(leggiFile()).toBe(prima)
    expect(isRecuperoInCorso()).toBe(false)
  })
})
