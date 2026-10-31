import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import log from 'electron-log'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { AppSettings } from '../../types/shared'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'it',
  primaryColor: '59,130,246',
  expiry_warning_days_certificates: 30,
  expiry_warning_days_memberships: 30,
  expiry_warning_days_subscriptions: 30,
  dicitura_pie: '',
  receipt_start_number: 1,
  receipt_start_number_year: 0,
  dashboard_widgets: ['indicatori', 'scadenze', 'incassi', 'abbonamenti', 'tesseramenti'],
  ragione_sociale: '',
  indirizzo_attivita: '',
  codice_fiscale_piva: '',
  logo_base64: '',
  backup_on_close: true,
  backup_dir: '',
  backup_periodic_enabled: false,
  backup_periodic_hours: 6,
  backup_retention: 10,
  receipt_download_dir: '',
  receipt_last_dir: ''
}

export function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/**
 * Carica le impostazioni dal file JSON su disco.
 * Se il file non esiste o non è parsabile, restituisce i valori di default.
 */
export function loadSettings(): AppSettings {
  const filePath = getSettingsPath()

  if (!existsSync(filePath)) {
    log.info('[settings] File impostazioni non trovato, uso defaults')
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>

    return {
      theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
      language: parsed.language ?? DEFAULT_SETTINGS.language,
      primaryColor: parsed.primaryColor ?? DEFAULT_SETTINGS.primaryColor,
      expiry_warning_days_certificates:
        parsed.expiry_warning_days_certificates ??
        DEFAULT_SETTINGS.expiry_warning_days_certificates,
      expiry_warning_days_memberships:
        parsed.expiry_warning_days_memberships ??
        DEFAULT_SETTINGS.expiry_warning_days_memberships,
      expiry_warning_days_subscriptions:
        parsed.expiry_warning_days_subscriptions ??
        DEFAULT_SETTINGS.expiry_warning_days_subscriptions,
      dicitura_pie: parsed.dicitura_pie ?? DEFAULT_SETTINGS.dicitura_pie,
      receipt_start_number: parsed.receipt_start_number ?? DEFAULT_SETTINGS.receipt_start_number,
      receipt_start_number_year:
        parsed.receipt_start_number_year ?? DEFAULT_SETTINGS.receipt_start_number_year,
      dashboard_widgets:
        Array.isArray(parsed.dashboard_widgets)
          ? parsed.dashboard_widgets
          : DEFAULT_SETTINGS.dashboard_widgets,
      ragione_sociale: parsed.ragione_sociale ?? DEFAULT_SETTINGS.ragione_sociale,
      indirizzo_attivita: parsed.indirizzo_attivita ?? DEFAULT_SETTINGS.indirizzo_attivita,
      codice_fiscale_piva: parsed.codice_fiscale_piva ?? DEFAULT_SETTINGS.codice_fiscale_piva,
      logo_base64: parsed.logo_base64 ?? DEFAULT_SETTINGS.logo_base64,
      backup_on_close: parsed.backup_on_close ?? DEFAULT_SETTINGS.backup_on_close,
      backup_dir: parsed.backup_dir ?? DEFAULT_SETTINGS.backup_dir,
      backup_periodic_enabled:
        parsed.backup_periodic_enabled ?? DEFAULT_SETTINGS.backup_periodic_enabled,
      backup_periodic_hours: parsed.backup_periodic_hours ?? DEFAULT_SETTINGS.backup_periodic_hours,
      backup_retention: parsed.backup_retention ?? DEFAULT_SETTINGS.backup_retention,
      receipt_download_dir: parsed.receipt_download_dir ?? DEFAULT_SETTINGS.receipt_download_dir,
      receipt_last_dir: parsed.receipt_last_dir ?? DEFAULT_SETTINGS.receipt_last_dir
    }
  } catch (err) {
    log.error('[settings] Errore lettura impostazioni, uso defaults:', err)
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * Sincronizza i campi condivisi di AppSettings nella tabella SQLite app_settings,
 * in un'unica transazione (atomica). Scrive solo i campi presenti in `settings`.
 */
export function applyAppSettingsToDb(db: Database.Database, settings: Partial<AppSettings>): void {
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
  const campi = [
    'receipt_start_number',
    'receipt_start_number_year',
    'dicitura_pie',
    'ragione_sociale',
    'indirizzo_attivita',
    'codice_fiscale_piva',
    'logo_base64',
    'backup_on_close'
  ] as const
  const esegui = db.transaction(() => {
    for (const key of campi) {
      const v = settings[key]
      if (v !== undefined) {
        upsert.run(key, String(v))
      }
    }
  })
  esegui.immediate()
}

/**
 * Salva le impostazioni su file JSON.
 */
export function saveSettings(settings: AppSettings): void {
  const filePath = getSettingsPath()
  try {
    writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
    log.info('[settings] Impostazioni salvate')
  } catch (err) {
    log.error('[settings] Errore salvataggio impostazioni:', err)
    throw new Error('Impossibile salvare le impostazioni')
  }
}
