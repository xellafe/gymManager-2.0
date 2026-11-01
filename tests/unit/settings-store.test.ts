import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'

const TEST_USER_DATA = join(tmpdir(), `gymmanager-settings-test-${process.pid}`)

vi.mock('electron', () => ({
  app: { getPath: (_n: string) => TEST_USER_DATA, getVersion: () => '0.1.0-test' }
}))
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import Database from 'better-sqlite3-multiple-ciphers'
import { runMigrations } from '../../src/main/db/migrations'
import {
  loadSettings,
  getSettingsPath,
  applyAppSettingsToDb
} from '../../src/main/settings/store'

beforeEach(() => {
  mkdirSync(TEST_USER_DATA, { recursive: true })
})
afterEach(() => {
  if (existsSync(TEST_USER_DATA)) rmSync(TEST_USER_DATA, { recursive: true, force: true })
})

describe('loadSettings — chiavi backup B8', () => {
  it('usa i default quando il file non esiste', () => {
    const s = loadSettings()
    expect(s.backup_dir).toBe('')
    expect(s.backup_periodic_enabled).toBe(false)
    expect(s.backup_periodic_hours).toBe(6)
    expect(s.backup_retention).toBe(10)
  })

  it('legge i valori persistiti', () => {
    writeFileSync(
      getSettingsPath(),
      JSON.stringify({
        backup_dir: 'D:/GymBackup',
        backup_periodic_enabled: true,
        backup_periodic_hours: 12,
        backup_retention: 20
      }),
      'utf-8'
    )
    const s = loadSettings()
    expect(s.backup_dir).toBe('D:/GymBackup')
    expect(s.backup_periodic_enabled).toBe(true)
    expect(s.backup_periodic_hours).toBe(12)
    expect(s.backup_retention).toBe(20)
  })
})

describe('loadSettings — cartelle ricevute', () => {
  it('usa stringhe vuote quando le chiavi sono assenti', () => {
    const d = loadSettings()
    expect(d.receipt_download_dir).toBe('')
    expect(d.receipt_last_dir).toBe('')
    writeFileSync(getSettingsPath(), JSON.stringify({ backup_dir: 'D:/GymBackup' }), 'utf-8')
    const s = loadSettings()
    expect(s.receipt_download_dir).toBe('')
    expect(s.receipt_last_dir).toBe('')
  })

  it('legge i valori persistiti', () => {
    writeFileSync(
      getSettingsPath(),
      JSON.stringify({ receipt_download_dir: 'D:/Ricevute', receipt_last_dir: 'C:/Temp' }),
      'utf-8'
    )
    const s = loadSettings()
    expect(s.receipt_download_dir).toBe('D:/Ricevute')
    expect(s.receipt_last_dir).toBe('C:/Temp')
  })
})

describe('applyAppSettingsToDb — cartelle ricevute', () => {
  it('non scrive receipt_download_dir né receipt_last_dir in app_settings', () => {
    const db = new Database(':memory:')
    try {
      runMigrations(db)
      applyAppSettingsToDb(db, {
        receipt_download_dir: 'D:/Ricevute',
        receipt_last_dir: 'C:/Temp',
        ragione_sociale: 'ASD Test'
      })
      const righe = db
        .prepare(
          `SELECT key FROM app_settings WHERE key IN ('receipt_download_dir', 'receipt_last_dir')`
        )
        .all()
      expect(righe).toHaveLength(0)
      const rs = db.prepare(`SELECT value FROM app_settings WHERE key = 'ragione_sociale'`).get() as {
        value: string
      }
      expect(rs.value).toBe('ASD Test')
    } finally {
      db.close()
    }
  })
})
