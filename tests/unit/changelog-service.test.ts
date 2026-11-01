import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'

const TEST_USER_DATA = join(tmpdir(), `gymmanager-changelog-test-${process.pid}`)
const stato = vi.hoisted(() => ({ primoAvvio: true, versione: '0.1.12' }))

vi.mock('electron', () => ({
  app: { getPath: (_n: string) => TEST_USER_DATA, getVersion: () => stato.versione }
}))
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../src/main/db/database', () => ({ checkFirstRun: () => stato.primoAvvio }))

import { getSettingsPath, loadSettings } from '../../src/main/settings/store'
import {
  inizializzaVersioneVista,
  getNovitaDaMostrare,
  segnaVersioneVista,
  getNovitaVersioneCorrente
} from '../../src/main/changelog/changelog-service'

const MD = `# Changelog

## [0.1.12] — 2026-11-01

### Aggiunto
- Dodici

## [0.1.11] — 2026-07-22

- Undici

## [0.1.10] — 2026-07-22

- Dieci
`

function scriviSettings(obj: Record<string, unknown>): void {
  writeFileSync(getSettingsPath(), JSON.stringify(obj), 'utf-8')
}

beforeEach(() => {
  mkdirSync(TEST_USER_DATA, { recursive: true })
  stato.primoAvvio = true
  stato.versione = '0.1.12'
})
afterEach(() => {
  if (existsSync(TEST_USER_DATA)) rmSync(TEST_USER_DATA, { recursive: true, force: true })
})

describe('nuova installazione', () => {
  it('registra la versione corrente e non mostra nulla', () => {
    inizializzaVersioneVista()
    expect(loadSettings().last_seen_version).toBe('0.1.12')
    expect(getNovitaDaMostrare(MD)).toEqual([])
  })

  it('con DB esistente non registra nulla', () => {
    stato.primoAvvio = false
    inizializzaVersioneVista()
    expect(loadSettings().last_seen_version).toBe('')
  })

  it('non sovrascrive una versione già registrata', () => {
    scriviSettings({ last_seen_version: '0.1.10' })
    inizializzaVersioneVista()
    expect(loadSettings().last_seen_version).toBe('0.1.10')
  })
})

describe('getNovitaDaMostrare', () => {
  it('DB esistente e versione vuota: solo la versione installata', () => {
    stato.primoAvvio = false
    inizializzaVersioneVista()
    expect(getNovitaDaMostrare(MD).map((v) => v.versione)).toEqual(['0.1.12'])
  })

  it('versione non valida: come vuota', () => {
    scriviSettings({ last_seen_version: 'abc' })
    expect(getNovitaDaMostrare(MD).map((v) => v.versione)).toEqual(['0.1.12'])
  })

  it('con versione precedente: tutte le successive fino alla corrente', () => {
    scriviSettings({ last_seen_version: '0.1.10' })
    expect(getNovitaDaMostrare(MD).map((v) => v.versione)).toEqual(['0.1.12', '0.1.11'])
  })

  it('versione già vista: nulla', () => {
    scriviSettings({ last_seen_version: '0.1.12' })
    expect(getNovitaDaMostrare(MD)).toEqual([])
  })

  it('versione senza sezione: [] e registra la corrente', () => {
    stato.versione = '0.2.0'
    scriviSettings({ last_seen_version: '0.1.12' })
    expect(getNovitaDaMostrare(MD)).toEqual([])
    expect(loadSettings().last_seen_version).toBe('0.2.0')
  })

  it('downgrade: [] e registra la corrente', () => {
    stato.versione = '0.1.10'
    scriviSettings({ last_seen_version: '0.1.12' })
    expect(getNovitaDaMostrare(MD)).toEqual([])
    expect(loadSettings().last_seen_version).toBe('0.1.10')
  })
})

describe('segnaVersioneVista', () => {
  it('salva la versione corrente lasciando invariate le altre chiavi', () => {
    scriviSettings({ last_seen_version: '0.1.10', backup_dir: 'D:/B', theme: 'dark' })
    segnaVersioneVista()
    const s = JSON.parse(readFileSync(getSettingsPath(), 'utf-8')) as Record<string, unknown>
    expect(s.last_seen_version).toBe('0.1.12')
    expect(s.backup_dir).toBe('D:/B')
    expect(s.theme).toBe('dark')
  })
})

describe('getNovitaVersioneCorrente', () => {
  it('restituisce la sola versione installata senza scrivere', () => {
    scriviSettings({ last_seen_version: '0.1.10' })
    expect(getNovitaVersioneCorrente(MD).map((v) => v.versione)).toEqual(['0.1.12'])
    expect(loadSettings().last_seen_version).toBe('0.1.10')
  })

  it('senza sezione per la versione: []', () => {
    stato.versione = '9.9.9'
    expect(getNovitaVersioneCorrente(MD)).toEqual([])
  })
})
