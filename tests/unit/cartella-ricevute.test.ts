import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'

const TEST_USER_DATA = join(tmpdir(), `gymmanager-cartella-ricevute-test-${process.pid}`)
const TEST_DOWNLOADS = join(TEST_USER_DATA, 'Downloads')

vi.mock('electron', () => ({
  app: {
    getPath: (n: string) => (n === 'downloads' ? TEST_DOWNLOADS : TEST_USER_DATA)
  }
}))
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import type { DownloadItem } from 'electron'
import {
  risolviCartellaRicevute,
  gestisciDownload
} from '../../src/main/settings/cartella-ricevute'
import { getSettingsPath } from '../../src/main/settings/store'

type StatoDone = 'completed' | 'cancelled' | 'interrupted'
type DoneListener = (event: unknown, state: StatoDone) => void

/** DownloadItem finto: registra le chiamate e permette di emettere `done`. */
function creaItemFinto(filename: string, savePath: string) {
  let onDone: DoneListener | null = null
  const setSaveDialogOptions = vi.fn()
  const setSavePath = vi.fn()
  const item = {
    getFilename: () => filename,
    getSavePath: () => savePath,
    setSaveDialogOptions,
    setSavePath,
    once: (event: string, listener: DoneListener) => {
      if (event === 'done') onDone = listener
      return item
    }
  }
  return {
    item: item as unknown as DownloadItem,
    setSaveDialogOptions,
    setSavePath,
    emettiDone: (state: StatoDone): void => {
      onDone?.({}, state)
    }
  }
}

describe('risolviCartellaRicevute', () => {
  const DL = 'C:/Users/u/Downloads'
  const esisteSolo =
    (...presenti: string[]) =>
    (p: string): boolean =>
      presenti.includes(p)

  it('AC2: configurata esistente → configurata, anche con ultima valorizzata', () => {
    expect(
      risolviCartellaRicevute('D:/Ricevute', 'C:/Temp', DL, esisteSolo('D:/Ricevute', 'C:/Temp'))
    ).toBe('D:/Ricevute')
  })

  it('AC3: configurata vuota o solo spazi, ultima esistente → ultima', () => {
    const esiste = esisteSolo('C:/Temp')
    expect(risolviCartellaRicevute('', 'C:/Temp', DL, esiste)).toBe('C:/Temp')
    expect(risolviCartellaRicevute('   ', 'C:/Temp', DL, esiste)).toBe('C:/Temp')
  })

  it('AC4: configurata inesistente → ultima se esiste, altrimenti Download', () => {
    expect(risolviCartellaRicevute('D:/Sparita', 'C:/Temp', DL, esisteSolo('C:/Temp'))).toBe(
      'C:/Temp'
    )
    expect(risolviCartellaRicevute('D:/Sparita', 'C:/Anche', DL, esisteSolo())).toBe(DL)
  })

  it('AC5: configurata e ultima vuote o inesistenti → Download', () => {
    expect(risolviCartellaRicevute('', '', DL, esisteSolo())).toBe(DL)
    expect(risolviCartellaRicevute(' ', '  ', DL, () => true)).toBe(DL)
    expect(risolviCartellaRicevute('D:/X', 'C:/Y', DL, esisteSolo())).toBe(DL)
  })
})

describe('gestisciDownload', () => {
  const CONFIGURATA = join(TEST_USER_DATA, 'Ricevute')
  const ALTROVE = join(TEST_USER_DATA, 'Altrove')

  function scriviSettings(obj: Record<string, unknown>): void {
    writeFileSync(getSettingsPath(), JSON.stringify(obj), 'utf-8')
  }
  function leggiSettings(): Record<string, unknown> {
    return JSON.parse(readFileSync(getSettingsPath(), 'utf-8')) as Record<string, unknown>
  }

  beforeEach(() => {
    mkdirSync(TEST_DOWNLOADS, { recursive: true })
    mkdirSync(CONFIGURATA, { recursive: true })
    mkdirSync(ALTROVE, { recursive: true })
  })
  afterEach(() => {
    if (existsSync(TEST_USER_DATA)) rmSync(TEST_USER_DATA, { recursive: true, force: true })
  })

  it('AC6: defaultPath = cartella configurata + nome file, senza setSavePath', () => {
    scriviSettings({ receipt_download_dir: CONFIGURATA, receipt_last_dir: ALTROVE })
    const f = creaItemFinto('ricevuta-2026-15.pdf', '')
    gestisciDownload(f.item)
    expect(f.setSaveDialogOptions).toHaveBeenCalledWith({
      defaultPath: join(CONFIGURATA, 'ricevuta-2026-15.pdf')
    })
    expect(f.setSavePath).not.toHaveBeenCalled()
  })

  it('AC6: configurata inesistente → ultima; nessuna impostazione → Download', () => {
    scriviSettings({
      receipt_download_dir: join(TEST_USER_DATA, 'Sparita'),
      receipt_last_dir: ALTROVE
    })
    const a = creaItemFinto('r.pdf', '')
    gestisciDownload(a.item)
    expect(a.setSaveDialogOptions).toHaveBeenCalledWith({ defaultPath: join(ALTROVE, 'r.pdf') })

    rmSync(getSettingsPath())
    const b = creaItemFinto('r.pdf', '')
    gestisciDownload(b.item)
    expect(b.setSaveDialogOptions).toHaveBeenCalledWith({
      defaultPath: join(TEST_DOWNLOADS, 'r.pdf')
    })
  })

  it('AC7: completed → receipt_last_dir = cartella del file, altre chiavi invariate', () => {
    scriviSettings({
      receipt_download_dir: CONFIGURATA,
      ragione_sociale: 'ASD Test',
      backup_retention: 7
    })
    const f = creaItemFinto('r.pdf', join(ALTROVE, 'r.pdf'))
    gestisciDownload(f.item)
    f.emettiDone('completed')
    const s = leggiSettings()
    expect(s.receipt_last_dir).toBe(ALTROVE)
    expect(s.receipt_download_dir).toBe(CONFIGURATA)
    expect(s.ragione_sociale).toBe('ASD Test')
    expect(s.backup_retention).toBe(7)
  })

  it.each(['cancelled', 'interrupted'] as const)(
    'AC7: %s → settings.json invariato, nessuna eccezione',
    (state) => {
      scriviSettings({ receipt_download_dir: CONFIGURATA, receipt_last_dir: '' })
      const prima = readFileSync(getSettingsPath(), 'utf-8')
      const f = creaItemFinto('r.pdf', join(ALTROVE, 'r.pdf'))
      gestisciDownload(f.item)
      expect(() => f.emettiDone(state)).not.toThrow()
      expect(readFileSync(getSettingsPath(), 'utf-8')).toBe(prima)
    }
  )

  it('AC7: completed con savePath vuoto → settings.json invariato', () => {
    scriviSettings({ receipt_last_dir: ALTROVE })
    const prima = readFileSync(getSettingsPath(), 'utf-8')
    const f = creaItemFinto('r.pdf', '')
    gestisciDownload(f.item)
    f.emettiDone('completed')
    expect(readFileSync(getSettingsPath(), 'utf-8')).toBe(prima)
  })
})
