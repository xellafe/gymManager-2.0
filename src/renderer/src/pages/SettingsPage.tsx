import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { applyTheme, applyPrimaryColor } from '../theme'
import { useSettings } from '../context/SettingsContext'
import type { AppSettings } from '../../../types/shared'
import RestoreDialog from '../components/backup/RestoreDialog'
import ResetPasswordDialog from '../components/backup/ResetPasswordDialog'
import ChangePasswordDialog from '../components/backup/ChangePasswordDialog'
import DriveRestoreDialog from '../components/backup/DriveRestoreDialog'
import { ridimensionaLogo } from '../utils/logo'

// ── Colori preset ─────────────────────────────────────────────────────────────

interface PresetColor {
  labelKey: string
  rgb: string
}

const PRESET_COLORS: PresetColor[] = [
  { labelKey: 'impostazioni.colore_blu', rgb: '37,99,235' },
  { labelKey: 'impostazioni.colore_indaco', rgb: '79,70,229' },
  { labelKey: 'impostazioni.colore_viola', rgb: '124,58,237' },
  { labelKey: 'impostazioni.colore_rosa', rgb: '219,39,119' },
  { labelKey: 'impostazioni.colore_rosso', rgb: '220,38,38' },
  { labelKey: 'impostazioni.colore_arancione', rgb: '234,88,12' },
  { labelKey: 'impostazioni.colore_verde', rgb: '22,163,74' },
  { labelKey: 'impostazioni.colore_teal', rgb: '13,148,136' },
]

// ── Widget disponibili ────────────────────────────────────────────────────────

interface WidgetDef {
  id: string
  labelKey: string
  defaultOn: boolean
}

const WIDGET_DEFS: WidgetDef[] = [
  { id: 'indicatori', labelKey: 'impostazioni.widget_indicatori', defaultOn: true },
  { id: 'scadenze', labelKey: 'impostazioni.widget_scadenze', defaultOn: true },
  { id: 'incassi', labelKey: 'impostazioni.widget_incassi', defaultOn: true },
  { id: 'abbonamenti', labelKey: 'impostazioni.widget_abbonamenti', defaultOn: true },
  { id: 'tesseramenti', labelKey: 'impostazioni.widget_tesseramenti', defaultOn: true },
  { id: 'compleanni', labelKey: 'impostazioni.widget_compleanni', defaultOn: false },
]

/**
 * Converte una stringa "R,G,B" in un colore esadecimale "#rrggbb"
 * usato dall'input type="color".
 */
function rgbStringToHex(rgb: string): string {
  const parts = rgb.split(',').map((s) => parseInt(s.trim(), 10))
  if (parts.length !== 3 || parts.some(isNaN)) return '#2563eb'
  const [r, g, b] = parts
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Converte un colore esadecimale "#rrggbb" nella stringa "R,G,B"
 * attesa da AppSettings.primaryColor.
 */
function hexToRgbString(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r},${g},${b}`
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  theme: 'light' | 'dark' | 'system'
  language: string
  primaryColor: string // "R,G,B"
  dicitura_pie: string
  receipt_start_number: string // stringa per il controllo dell'input
  expiry_warning_days_certificates: string
  expiry_warning_days_memberships: string
  expiry_warning_days_subscriptions: string
  dashboard_widgets: string[]
  ragione_sociale: string
  indirizzo_attivita: string
  codice_fiscale_piva: string
  logo_base64: string
  backup_on_close: boolean
  backup_dir: string
  receipt_download_dir: string
  backup_periodic_enabled: boolean
  backup_periodic_hours: number
  backup_retention: number
}

interface FormErrors {
  receipt_start_number?: string
  expiry_warning_days_certificates?: string
  expiry_warning_days_memberships?: string
  expiry_warning_days_subscriptions?: string
}

// ── Icone ─────────────────────────────────────────────────────────────────────

function CheckIcon(): React.JSX.Element {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

// ── Componente principale ──────────────────────────────────────────────────────

export default function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { refresh: refreshSettings } = useSettings()

  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false)
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false)
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Drive OAuth state
  const [driveConnected, setDriveConnected] = useState(false)
  const [isConnectingDrive, setIsConnectingDrive] = useState(false)
  const [driveError, setDriveError] = useState<string | null>(null)
  const [isDriveBacking, setIsDriveBacking] = useState(false)
  const [driveBackupMsg, setDriveBackupMsg] = useState<string | null>(null)
  const [showDriveRestore, setShowDriveRestore] = useState(false)

  // Versione app e controllo aggiornamenti
  const [appVersion, setAppVersion] = useState('')
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateCheckResult, setUpdateCheckResult] = useState<'idle' | 'errore'>('idle')
  const [updateErrorMsg, setUpdateErrorMsg] = useState<string | null>(null)

  // Sync state — il tipo è inferito come SyncStatus (dalla firma del preload) con pollingSec aggiunto
  const [syncStatus, setSyncStatus] = useState<ReturnType<typeof window.api.sync.status> extends Promise<infer T> ? T | null : never>(null)
  const [isSyncNow, setIsSyncNow] = useState(false)
  const [syncNowResult, setSyncNowResult] = useState<'idle' | 'ok' | 'errore'>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const syncNowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [form, setForm] = useState<FormState>({
    theme: 'system',
    language: 'it',
    primaryColor: '37,99,235',
    dicitura_pie: '',
    receipt_start_number: '1',
    expiry_warning_days_certificates: '30',
    expiry_warning_days_memberships: '30',
    expiry_warning_days_subscriptions: '30',
    dashboard_widgets: ['indicatori', 'scadenze', 'incassi', 'abbonamenti', 'tesseramenti'],
    ragione_sociale: '',
    indirizzo_attivita: '',
    codice_fiscale_piva: '',
    logo_base64: '',
    backup_on_close: true,
    backup_dir: '',
    receipt_download_dir: '',
    backup_periodic_enabled: false,
    backup_periodic_hours: 6,
    backup_retention: 10,
  })
  const [errors, setErrors] = useState<FormErrors>({})
  // Ultimo numero di ricevuta emesso per l'anno corrente: default e minimo del numero iniziale
  const currentYear = new Date().getFullYear()
  const [ultimoNumeroAnno, setUltimoNumeroAnno] = useState(0)
  const numeroInizialeMin = Math.max(ultimoNumeroAnno, 1)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Listener eventi aggiornamento (separato — non dipende dalle impostazioni)
  useEffect(() => {
    const unsubNotAvailable = window.api.on('update:not-available', () => {
      setIsCheckingUpdate(false)
    })
    const unsubAvailable = window.api.on('update:available', () => {
      setIsCheckingUpdate(false)
    })
    const unsubError = window.api.on('update:error', (...args: unknown[]) => {
      setIsCheckingUpdate(false)
      setUpdateCheckResult('errore')
      setUpdateErrorMsg((args[0] as string | undefined) ?? null)
    })
    return () => {
      unsubNotAvailable()
      unsubAvailable()
      unsubError()
    }
  }, [])

  // Caricamento impostazioni al mount
  useEffect(() => {
    setIsLoading(true)
    void window.api.backup.drive.isConnected().then(c => setDriveConnected(c)).catch(() => {})
    void window.api.app.getVersion().then(v => setAppVersion(v)).catch(() => {})
    void window.api.sync.status().then(s => setSyncStatus(s)).catch(() => {})
    Promise.all([
      window.api.settings.get(),
      window.api.ricevute.ultimoNumero(currentYear).catch(() => 0),
    ])
      .then(([s, ultimo]: [AppSettings, number]) => {
        setUltimoNumeroAnno(ultimo)
        // Il numero iniziale salvato vale solo se ancorato all'anno corrente.
        // Default mostrato = massimo tra l'ultimo emesso e l'eventuale salto in sospeso.
        const inizialeAncorato =
          (s.receipt_start_number_year ?? 0) === currentYear ? (s.receipt_start_number ?? 1) : 0
        const numeroIniziale = Math.max(ultimo, inizialeAncorato, 1)
        setForm({
          theme: s.theme,
          language: s.language ?? 'it',
          primaryColor: s.primaryColor ?? '37,99,235',
          dicitura_pie: s.dicitura_pie ?? '',
          receipt_start_number: String(numeroIniziale),
          expiry_warning_days_certificates: String(
            s.expiry_warning_days_certificates ?? 30
          ),
          expiry_warning_days_memberships: String(
            s.expiry_warning_days_memberships ?? 30
          ),
          expiry_warning_days_subscriptions: String(
            s.expiry_warning_days_subscriptions ?? 30
          ),
          dashboard_widgets: Array.isArray(s.dashboard_widgets)
            ? s.dashboard_widgets
            : ['indicatori', 'scadenze', 'incassi', 'abbonamenti', 'tesseramenti'],
          ragione_sociale: s.ragione_sociale ?? '',
          indirizzo_attivita: s.indirizzo_attivita ?? '',
          codice_fiscale_piva: s.codice_fiscale_piva ?? '',
          logo_base64: s.logo_base64 ?? '',
          backup_on_close: s.backup_on_close ?? true,
          backup_dir: s.backup_dir ?? '',
          receipt_download_dir: s.receipt_download_dir ?? '',
          backup_periodic_enabled: s.backup_periodic_enabled ?? false,
          backup_periodic_hours: s.backup_periodic_hours ?? 6,
          backup_retention: s.backup_retention ?? 10,
        })
      })
      .catch(() => {
        setSaveError(t('common.error_generic'))
      })
      .finally(() => {
        setIsLoading(false)
      })

    return () => {
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current)
      }
      if (backupTimerRef.current !== null) {
        clearTimeout(backupTimerRef.current)
      }
      if (syncNowTimerRef.current !== null) {
        clearTimeout(syncNowTimerRef.current)
      }
    }
  }, [t, currentYear])

  // ── Validazione ─────────────────────────────────────────────────────────────

  function validateWarningDays(value: string): boolean {
    const n = parseInt(value, 10)
    return Number.isInteger(n) && n >= 1 && n <= 365 && value.trim() !== ''
  }

  const validate = useCallback(
    (data: FormState): FormErrors => {
      const errs: FormErrors = {}

      const startNum = parseInt(data.receipt_start_number, 10)
      if (!Number.isInteger(startNum) || startNum < 1 || data.receipt_start_number.trim() === '') {
        errs.receipt_start_number = t('impostazioni.errore_numero_minimo_uno')
      } else if (startNum < numeroInizialeMin) {
        errs.receipt_start_number = t('impostazioni.errore_numero_minore_ultimo', {
          numero: numeroInizialeMin,
        })
      }

      if (!validateWarningDays(data.expiry_warning_days_certificates)) {
        errs.expiry_warning_days_certificates = t('impostazioni.errore_giorni_range')
      }

      if (!validateWarningDays(data.expiry_warning_days_memberships)) {
        errs.expiry_warning_days_memberships = t('impostazioni.errore_giorni_range')
      }

      if (!validateWarningDays(data.expiry_warning_days_subscriptions)) {
        errs.expiry_warning_days_subscriptions = t('impostazioni.errore_giorni_range')
      }

      return errs
    },
    [t, numeroInizialeMin]
  )

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleThemeChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const value = e.target.value as 'light' | 'dark' | 'system'
    setForm((prev) => ({ ...prev, theme: value }))
  }

  function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const value = e.target.value
    setForm((prev) => ({ ...prev, language: value }))
  }

  function handleColorPickerChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const rgb = hexToRgbString(e.target.value)
    setForm((prev) => ({ ...prev, primaryColor: rgb }))
  }

  function handlePresetColor(rgb: string): void {
    setForm((prev) => ({ ...prev, primaryColor: rgb }))
  }

  function handleDizituraChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    const value = e.target.value.slice(0, 200)
    setForm((prev) => ({ ...prev, dicitura_pie: value }))
  }

  function handleStartNumberChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setForm((prev) => ({ ...prev, receipt_start_number: e.target.value }))
    setErrors((prev) => ({ ...prev, receipt_start_number: undefined }))
  }

  function handleWarningDaysChange(field: keyof Pick<FormState, 'expiry_warning_days_certificates' | 'expiry_warning_days_memberships' | 'expiry_warning_days_subscriptions'>) {
    return (e: React.ChangeEvent<HTMLInputElement>): void => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function handleWidgetToggle(widgetId: string): void {
    setForm((prev) => {
      const current = prev.dashboard_widgets
      const isActive = current.includes(widgetId)
      const updated = isActive
        ? current.filter((w) => w !== widgetId)
        : [...current, widgetId]
      return { ...prev, dashboard_widgets: updated }
    })
  }

  function handleRagioneSocialeChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setForm((prev) => ({ ...prev, ragione_sociale: e.target.value }))
  }

  function handleIndirizzoChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setForm((prev) => ({ ...prev, indirizzo_attivita: e.target.value }))
  }

  function handleCodFiscalePivaChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setForm((prev) => ({ ...prev, codice_fiscale_piva: e.target.value }))
  }

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    // Reset il valore dell'input per permettere di ricaricare lo stesso file
    e.target.value = ''
    if (!file) return
    setLogoError(null)
    try {
      // Ridimensiona dentro il box della ricevuta mantenendo il rapporto d'aspetto
      // e normalizza a PNG (evita logo troppo grandi / formati non stampabili).
      const ridimensionato = await ridimensionaLogo(file)
      setForm((prev) => ({ ...prev, logo_base64: ridimensionato }))
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      setLogoError(
        code === 'LOGO_FORMATO_NON_SUPPORTATO'
          ? t('impostazioni.logo_errore_formato')
          : t('impostazioni.logo_errore_generico')
      )
    }
  }

  function handleLogoRimuovi(): void {
    setLogoError(null)
    setForm((prev) => ({ ...prev, logo_base64: '' }))
  }

  function handleBackupOnCloseChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setForm((prev) => ({ ...prev, backup_on_close: e.target.checked }))
  }

  async function handleDriveConnect(): Promise<void> {
    setDriveError(null)
    setIsConnectingDrive(true)
    try {
      await window.api.backup.drive.connect()
      setDriveConnected(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('DRIVE_CREDENTIALS_MISSING')) {
        setDriveError(t('backup.drive_non_configurato'))
      } else {
        setDriveError(t('backup.drive_errore_connessione'))
      }
    } finally {
      setIsConnectingDrive(false)
    }
  }

  async function handleDriveDisconnect(): Promise<void> {
    try {
      await window.api.backup.drive.disconnect()
      setDriveConnected(false)
      setDriveError(null)
    } catch {
      setDriveError(t('backup.drive_errore_connessione'))
    }
  }

  async function handleDriveBackup(): Promise<void> {
    setDriveBackupMsg(null)
    setIsDriveBacking(true)
    try {
      const path = await window.api.backup.automatico()
      await window.api.backup.drive.backup({ backupPath: path })
      setDriveBackupMsg(t('backup.drive_backup_completato'))
    } catch {
      setDriveBackupMsg(t('backup.drive_backup_errore'))
    } finally {
      setIsDriveBacking(false)
    }
  }

  /** Traduce un errore di sync in un messaggio leggibile. */
  function mapSyncError(err: unknown): string {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('SYNC_DRIVE_NON_CONNESSO')) return t('sync.drive_non_connesso')
    if (msg.includes('SYNC_PASSWORD_MISMATCH')) return t('sync.errore_password_diversa')
    return msg.trim().length > 0 ? msg : t('sync.sincronizza_errore')
  }

  async function handleSyncEnable(): Promise<void> {
    setSyncError(null)
    try {
      await window.api.sync.enable()
      const s = await window.api.sync.status()
      setSyncStatus(s)
      window.dispatchEvent(new CustomEvent('gm:sync-config-changed'))
    } catch (err) {
      setSyncError(mapSyncError(err))
      // Riallinea lo stato (enableSync fa rollback a disabilitato in caso di errore)
      const s = await window.api.sync.status().catch(() => null)
      if (s !== null) setSyncStatus(s)
    }
  }

  async function handleSyncDisable(): Promise<void> {
    setSyncError(null)
    try {
      await window.api.sync.disable()
      const s = await window.api.sync.status()
      setSyncStatus(s)
      window.dispatchEvent(new CustomEvent('gm:sync-config-changed'))
    } catch (err) {
      setSyncError(mapSyncError(err))
    }
  }

  async function handleSyncNow(): Promise<void> {
    setSyncNowResult('idle')
    setSyncError(null)
    setIsSyncNow(true)
    try {
      await window.api.sync.now()
      const s = await window.api.sync.status()
      setSyncStatus(s)
      setSyncNowResult('ok')
    } catch (err) {
      setSyncNowResult('errore')
      setSyncError(mapSyncError(err))
    } finally {
      setIsSyncNow(false)
      if (syncNowTimerRef.current !== null) clearTimeout(syncNowTimerRef.current)
      syncNowTimerRef.current = setTimeout(() => setSyncNowResult('idle'), 4000)
    }
  }

  async function handleSyncSetPolling(sec: number): Promise<void> {
    try {
      await window.api.sync.setPolling(sec)
      const s = await window.api.sync.status()
      setSyncStatus(s)
      window.dispatchEvent(new CustomEvent('gm:sync-config-changed'))
    } catch (err) {
      setSyncError(mapSyncError(err))
    }
  }

  function handleCheckUpdate(): void {
    setIsCheckingUpdate(true)
    setUpdateCheckResult('idle')
    setUpdateErrorMsg(null)
    void window.api.updater.check()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setSaveError(null)

    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setIsSaving(true)
    try {
      const payload: Partial<AppSettings> = {
        theme: form.theme,
        language: form.language,
        primaryColor: form.primaryColor,
        dicitura_pie: form.dicitura_pie,
        receipt_start_number: parseInt(form.receipt_start_number, 10),
        // Ancora il numero iniziale all'anno corrente: non traboccherà sul prossimo anno
        receipt_start_number_year: currentYear,
        expiry_warning_days_certificates: parseInt(
          form.expiry_warning_days_certificates,
          10
        ),
        expiry_warning_days_memberships: parseInt(
          form.expiry_warning_days_memberships,
          10
        ),
        expiry_warning_days_subscriptions: parseInt(
          form.expiry_warning_days_subscriptions,
          10
        ),
        dashboard_widgets: form.dashboard_widgets,
        ragione_sociale: form.ragione_sociale,
        indirizzo_attivita: form.indirizzo_attivita,
        codice_fiscale_piva: form.codice_fiscale_piva,
        logo_base64: form.logo_base64,
        backup_on_close: form.backup_on_close,
        backup_dir: form.backup_dir,
        receipt_download_dir: form.receipt_download_dir,
        backup_periodic_enabled: form.backup_periodic_enabled,
        backup_periodic_hours: form.backup_periodic_hours,
        backup_retention: form.backup_retention,
      }
      await window.api.settings.set(payload)
      // Applica immediatamente il cambio lingua senza riavvio
      if (form.language !== i18n.language) {
        await i18n.changeLanguage(form.language)
      }
      // Applica immediatamente tema e colore senza riavvio (C4)
      applyTheme(form.theme as 'light' | 'dark' | 'system')
      if (form.primaryColor) {
        applyPrimaryColor(form.primaryColor)
      }
      // Aggiorna il context delle impostazioni (soglie scadenza, widget, ecc.) (C5)
      refreshSettings()

      setSuccessMessage(true)
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current)
      }
      successTimerRef.current = setTimeout(() => {
        setSuccessMessage(false)
      }, 3000)
    } catch {
      setSaveError(t('common.error_generic'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSfogliaCartella(): Promise<void> {
    const res = await window.api.dialog.showOpenDialog({
      title: t('backup.cartella_label'),
      properties: ['openDirectory'],
    })
    if (!res.canceled && res.filePaths.length > 0) {
      setForm((prev) => ({ ...prev, backup_dir: res.filePaths[0] }))
    }
  }

  async function handleSfogliaCartellaRicevute(): Promise<void> {
    const res = await window.api.dialog.showOpenDialog({
      title: t('impostazioni.cartella_ricevute_label'),
      properties: ['openDirectory'],
    })
    if (!res.canceled && res.filePaths.length > 0) {
      setForm((prev) => ({ ...prev, receipt_download_dir: res.filePaths[0] }))
    }
  }

  async function handleBackupNow(): Promise<void> {
    setBackupStatus(null)
    setIsBackingUp(true)
    try {
      const path = await window.api.backup.automatico()
      if (backupTimerRef.current !== null) clearTimeout(backupTimerRef.current)
      setBackupStatus({ type: 'success', message: t('backup.backup_completato', { path }) })
      backupTimerRef.current = setTimeout(() => setBackupStatus(null), 5000)
    } catch {
      setBackupStatus({ type: 'error', message: t('backup.backup_errore') })
    } finally {
      setIsBackingUp(false)
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      </div>
    )
  }

  const hexColor = rgbStringToHex(form.primaryColor)

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={(e) => { void handleSubmit(e) }} noValidate>

        {/* ── Sezione Dati attività ────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {t('impostazioni.sezione_dati_attivita')}
          </h3>

          {/* Ragione sociale */}
          <div className="mb-5">
            <label
              htmlFor="settings-ragione-sociale"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.ragione_sociale')}
            </label>
            <input
              id="settings-ragione-sociale"
              type="text"
              value={form.ragione_sociale}
              onChange={handleRagioneSocialeChange}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Indirizzo attività */}
          <div className="mb-5">
            <label
              htmlFor="settings-indirizzo"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.indirizzo_attivita')}
            </label>
            <input
              id="settings-indirizzo"
              type="text"
              value={form.indirizzo_attivita}
              onChange={handleIndirizzoChange}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Codice fiscale / P.IVA */}
          <div className="mb-5">
            <label
              htmlFor="settings-cf-piva"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.codice_fiscale_piva')}
            </label>
            <input
              id="settings-cf-piva"
              type="text"
              value={form.codice_fiscale_piva}
              onChange={handleCodFiscalePivaChange}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Logo */}
          <div>
            <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('impostazioni.logo')}
            </p>
            {form.logo_base64 ? (
              <div className="mb-3 flex items-start gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                    {t('impostazioni.logo_anteprima')}
                  </p>
                  <img
                    src={form.logo_base64}
                    alt={t('impostazioni.logo_anteprima')}
                    className="h-16 max-w-[200px] object-contain rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLogoRimuovi}
                  className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  {t('impostazioni.logo_rimuovi')}
                </button>
              </div>
            ) : null}
            <label
              htmlFor="settings-logo-upload"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary-500"
            >
              {t('impostazioni.logo_carica')}
              <input
                id="settings-logo-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                onChange={(e) => void handleLogoFileChange(e)}
                className="sr-only"
              />
            </label>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {t('impostazioni.logo_hint')}
            </p>
            {logoError ? (
              <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                {logoError}
              </p>
            ) : null}
          </div>
        </section>

        {/* ── Sezione Aspetto ──────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {t('impostazioni.sezione_aspetto')}
          </h3>

          {/* Tema */}
          <div className="mb-5">
            <label
              htmlFor="settings-theme"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.tema')}
            </label>
            <select
              id="settings-theme"
              value={form.theme}
              onChange={handleThemeChange}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="system">{t('impostazioni.tema_sistema')}</option>
              <option value="light">{t('impostazioni.tema_chiaro')}</option>
              <option value="dark">{t('impostazioni.tema_scuro')}</option>
            </select>
          </div>

          {/* Lingua */}
          <div className="mb-5">
            <label
              htmlFor="settings-language"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.lingua')}
            </label>
            <select
              id="settings-language"
              value={form.language}
              onChange={handleLanguageChange}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="it">{t('impostazioni.lingua_it')}</option>
              <option value="en">{t('impostazioni.lingua_en')}</option>
            </select>
          </div>

          {/* Colore primario */}
          <div>
            <label
              htmlFor="settings-color"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.colore_primario')}
            </label>

            {/* Preset */}
            <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label={t('impostazioni.colore_primario')}>
              {PRESET_COLORS.map((preset) => {
                const isSelected = form.primaryColor === preset.rgb
                const presetHex = rgbStringToHex(preset.rgb)
                const presetLabel = t(preset.labelKey)
                return (
                  <button
                    key={preset.rgb}
                    type="button"
                    title={presetLabel}
                    aria-pressed={isSelected}
                    onClick={() => handlePresetColor(preset.rgb)}
                    className={[
                      'w-8 h-8 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500',
                      isSelected
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-transparent hover:scale-110',
                    ].join(' ')}
                    style={{ backgroundColor: presetHex }}
                  >
                    {isSelected && (
                      <span className="flex items-center justify-center text-white">
                        <CheckIcon />
                      </span>
                    )}
                    <span className="sr-only">{presetLabel}</span>
                  </button>
                )
              })}
            </div>

            {/* Color picker personalizzato */}
            <div className="flex items-center gap-3">
              <input
                id="settings-color"
                type="color"
                value={hexColor}
                onChange={handleColorPickerChange}
                className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-700 cursor-pointer p-0.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label={t('impostazioni.colore_primario')}
              />
              <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                {hexColor}
              </span>
            </div>
          </div>
        </section>

        {/* ── Sezione Ricevute ─────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {t('impostazioni.sezione_ricevute')}
          </h3>

          {/* Dicitura piè di ricevuta */}
          <div className="mb-5">
            <label
              htmlFor="settings-dicitura"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.dicitura_pie')}
            </label>
            <textarea
              id="settings-dicitura"
              value={form.dicitura_pie}
              onChange={handleDizituraChange}
              rows={3}
              maxLength={200}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 text-right">
              {form.dicitura_pie.length}/200
            </p>
          </div>

          {/* Cartella di salvataggio ricevute */}
          <div className="mb-5">
            <label
              htmlFor="settings-receipt-dir"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.cartella_ricevute_label')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="settings-receipt-dir"
                type="text"
                readOnly
                value={form.receipt_download_dir}
                placeholder={t('impostazioni.cartella_ricevute_placeholder')}
                aria-describedby="settings-receipt-dir-help"
                className="block flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => { void handleSfogliaCartellaRicevute() }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              >
                {t('backup.cartella_sfoglia')}
              </button>
              {form.receipt_download_dir.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, receipt_download_dir: '' }))}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                >
                  {t('backup.cartella_reset')}
                </button>
              )}
            </div>
            <p
              id="settings-receipt-dir-help"
              className="mt-1.5 text-xs text-gray-500 dark:text-gray-400"
            >
              {t('impostazioni.cartella_ricevute_help')}
            </p>
          </div>

          {/* Numero iniziale ricevute */}
          <div>
            <label
              htmlFor="settings-start-number"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.numero_iniziale_ricevute')}
            </label>
            <input
              id="settings-start-number"
              type="number"
              min={numeroInizialeMin}
              step={1}
              value={form.receipt_start_number}
              onChange={handleStartNumberChange}
              className={[
                'block w-full rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                errors.receipt_start_number
                  ? 'border-red-400 dark:border-red-500'
                  : 'border-gray-300 dark:border-gray-700',
              ].join(' ')}
              aria-describedby={
                errors.receipt_start_number
                  ? 'settings-start-number-error'
                  : 'settings-start-number-hint'
              }
              aria-invalid={errors.receipt_start_number !== undefined}
            />
            {errors.receipt_start_number ? (
              <p
                id="settings-start-number-error"
                role="alert"
                className="mt-1.5 text-sm text-red-600 dark:text-red-400"
              >
                {errors.receipt_start_number}
              </p>
            ) : (
              <p
                id="settings-start-number-hint"
                className="mt-1.5 text-sm text-amber-600 dark:text-amber-400"
              >
                {t('impostazioni.numero_iniziale_avviso')}
              </p>
            )}
          </div>
        </section>

        {/* ── Sezione Scadenze ─────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {t('impostazioni.sezione_scadenze')}
          </h3>

          {/* Preavviso certificati */}
          <div className="mb-5">
            <label
              htmlFor="settings-warning-days-cert"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.preavviso_certificati')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="settings-warning-days-cert"
                type="number"
                min={1}
                max={365}
                step={1}
                value={form.expiry_warning_days_certificates}
                onChange={handleWarningDaysChange('expiry_warning_days_certificates')}
                className={[
                  'block w-32 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                  errors.expiry_warning_days_certificates
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-700',
                ].join(' ')}
                aria-describedby={
                  errors.expiry_warning_days_certificates
                    ? 'settings-warning-days-cert-error'
                    : undefined
                }
                aria-invalid={errors.expiry_warning_days_certificates !== undefined}
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('impostazioni.giorni')}
              </span>
            </div>
            {errors.expiry_warning_days_certificates && (
              <p
                id="settings-warning-days-cert-error"
                role="alert"
                className="mt-1.5 text-sm text-red-600 dark:text-red-400"
              >
                {errors.expiry_warning_days_certificates}
              </p>
            )}
          </div>

          {/* Preavviso iscrizioni */}
          <div className="mb-5">
            <label
              htmlFor="settings-warning-days-isc"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.preavviso_iscrizioni')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="settings-warning-days-isc"
                type="number"
                min={1}
                max={365}
                step={1}
                value={form.expiry_warning_days_memberships}
                onChange={handleWarningDaysChange('expiry_warning_days_memberships')}
                className={[
                  'block w-32 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                  errors.expiry_warning_days_memberships
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-700',
                ].join(' ')}
                aria-describedby={
                  errors.expiry_warning_days_memberships
                    ? 'settings-warning-days-isc-error'
                    : undefined
                }
                aria-invalid={errors.expiry_warning_days_memberships !== undefined}
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('impostazioni.giorni')}
              </span>
            </div>
            {errors.expiry_warning_days_memberships && (
              <p
                id="settings-warning-days-isc-error"
                role="alert"
                className="mt-1.5 text-sm text-red-600 dark:text-red-400"
              >
                {errors.expiry_warning_days_memberships}
              </p>
            )}
          </div>

          {/* Preavviso abbonamenti */}
          <div>
            <label
              htmlFor="settings-warning-days-abb"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('impostazioni.preavviso_abbonamenti')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="settings-warning-days-abb"
                type="number"
                min={1}
                max={365}
                step={1}
                value={form.expiry_warning_days_subscriptions}
                onChange={handleWarningDaysChange('expiry_warning_days_subscriptions')}
                className={[
                  'block w-32 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                  errors.expiry_warning_days_subscriptions
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-700',
                ].join(' ')}
                aria-describedby={
                  errors.expiry_warning_days_subscriptions
                    ? 'settings-warning-days-abb-error'
                    : undefined
                }
                aria-invalid={errors.expiry_warning_days_subscriptions !== undefined}
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('impostazioni.giorni')}
              </span>
            </div>
            {errors.expiry_warning_days_subscriptions && (
              <p
                id="settings-warning-days-abb-error"
                role="alert"
                className="mt-1.5 text-sm text-red-600 dark:text-red-400"
              >
                {errors.expiry_warning_days_subscriptions}
              </p>
            )}
          </div>
        </section>

        {/* ── Sezione Dashboard ─────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {t('impostazioni.sezione_dashboard')}
          </h3>

          <fieldset>
            <legend className="sr-only">{t('impostazioni.sezione_dashboard')}</legend>
            <div className="space-y-3">
              {WIDGET_DEFS.map((widget) => {
                const isChecked = form.dashboard_widgets.includes(widget.id)
                return (
                  <label
                    key={widget.id}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleWidgetToggle(widget.id)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 focus:ring-2 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors select-none">
                      {t(widget.labelKey)}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </section>

        {/* ── Sezione Backup e sicurezza ───────────────────────────────────── */}
        <section data-testid="tab-backup" className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {t('backup.titolo')}
          </h3>

          {/* Backup locale */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {t('backup.locale_titolo')}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {t('backup.locale_descrizione')}
            </p>

            {/* Cartella di destinazione */}
            <div className="mb-4">
              <label
                htmlFor="settings-backup-dir"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('backup.cartella_label')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="settings-backup-dir"
                  type="text"
                  readOnly
                  value={form.backup_dir}
                  placeholder={t('backup.cartella_predefinita')}
                  className="block flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => { void handleSfogliaCartella() }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                >
                  {t('backup.cartella_sfoglia')}
                </button>
                {form.backup_dir.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, backup_dir: '' }))}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  >
                    {t('backup.cartella_reset')}
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {t('backup.cartella_help')}
              </p>
            </div>

            {/* Backup automatico alla chiusura */}
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={form.backup_on_close}
                onChange={handleBackupOnCloseChange}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 focus:ring-2 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 select-none">
                {t('impostazioni.backup_on_close')}
              </span>
            </label>

            {/* Backup periodico */}
            <label className="flex items-center gap-3 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.backup_periodic_enabled}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, backup_periodic_enabled: e.target.checked }))
                }
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 focus:ring-2 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 select-none">
                {t('backup.periodico_label')}
              </span>
            </label>
            {form.backup_periodic_enabled && (
              <div className="flex items-center gap-2 mb-4 ml-7">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('backup.periodico_ogni')}
                </span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  step={1}
                  value={form.backup_periodic_hours}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      backup_periodic_hours: Math.min(168, Math.max(1, Number(e.target.value) || 1)),
                    }))
                  }
                  className="block w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('backup.periodico_ore')}
                </span>
              </div>
            )}

            {/* Retention */}
            <div className="flex items-center gap-2 mb-4">
              <label
                htmlFor="settings-backup-retention"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                {t('backup.retention_label')}
              </label>
              <input
                id="settings-backup-retention"
                type="number"
                min={1}
                max={100}
                step={1}
                value={form.backup_retention}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    backup_retention: Math.min(100, Math.max(1, Number(e.target.value) || 1)),
                  }))
                }
                className="block w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('backup.retention_unita')}
              </span>
            </div>

            {/* Feedback backup */}
            {backupStatus !== null && (
              <div
                data-testid={backupStatus.type === 'success' ? 'backup-success' : undefined}
                role="status"
                aria-live="polite"
                className={[
                  'mb-3 rounded-lg px-4 py-3 text-sm border',
                  backupStatus.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400',
                ].join(' ')}
              >
                {backupStatus.message}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                data-testid="btn-backup-locale"
                type="button"
                onClick={() => { void handleBackupNow() }}
                disabled={isBackingUp}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              >
                {isBackingUp ? t('common.loading') : t('backup.backup_ora')}
              </button>
              <button
                type="button"
                onClick={() => setShowRestoreDialog(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              >
                {t('backup.ripristina_pulsante')}
              </button>
            </div>
          </div>

          {/* Google Drive */}
          <div className="mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {t('backup.drive_titolo')}
            </h4>

            {/* Stato connessione */}
            <div className="flex items-center gap-2 mb-4">
              {driveConnected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />
                  {t('backup.drive_connesso')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500" aria-hidden="true" />
                  {t('backup.drive_non_connesso')}
                </span>
              )}
            </div>

            {!driveConnected && (
              <>
                {/* Messaggio di errore Drive */}
                {driveError !== null && (
                  <div
                    role="alert"
                    className="mb-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2"
                  >
                    {driveError}
                  </div>
                )}

                {/* Pulsante Connetti */}
                <button
                  type="button"
                  onClick={() => { void handleDriveConnect() }}
                  disabled={isConnectingDrive}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                >
                  {isConnectingDrive ? t('backup.drive_connessione_in_corso') : t('backup.drive_connetti')}
                </button>
              </>
            )}

            {driveConnected && (
              <div className="space-y-3">
                {driveBackupMsg !== null && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">{driveBackupMsg}</p>
                )}
                {driveError !== null && (
                  <span className="text-xs text-red-600 dark:text-red-400">{driveError}</span>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { void handleDriveBackup() }}
                    disabled={isDriveBacking}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  >
                    {isDriveBacking ? t('backup.drive_backup_in_corso') : t('backup.drive_backup_ora')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDriveRestore(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  >
                    {t('backup.drive_ripristina_pulsante')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleDriveDisconnect() }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  >
                    {t('backup.drive_disconnetti')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sicurezza — Cambio password (non distruttivo) */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('backup.cambia_password_titolo')}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('backup.cambia_password_descrizione')}</p>
            <button
              type="button"
              onClick={() => setShowChangePasswordDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              {t('backup.cambia_password_pulsante')}
            </button>
          </div>

          {/* Sicurezza — Reset password */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {t('backup.reset_titolo')}
            </h4>
            <button
              type="button"
              onClick={() => setShowResetPasswordDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              {t('backup.reset_pulsante')}
            </button>
          </div>
        </section>

        {/* ── Sezione Sincronizzazione ─────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {t('sync.titolo')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
            {t('sync.descrizione')}
          </p>

          {!driveConnected ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t('sync.drive_non_connesso')}
            </p>
          ) : (
            <div className="space-y-5">
              {syncError !== null && (
                <div
                  role="alert"
                  className="flex items-start justify-between gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400"
                >
                  <span className="min-w-0 break-words">{syncError}</span>
                  <button
                    type="button"
                    onClick={() => setSyncError(null)}
                    aria-label={t('common.close')}
                    className="shrink-0 text-red-400 hover:text-red-700 dark:hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                  >
                    ✕
                  </button>
                </div>
              )}
              {/* Toggle abilita / disabilita */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {syncStatus?.enabled ? t('sync.disabilita') : t('sync.abilita')}
                  </p>
                  {syncStatus !== null && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {syncStatus.lastSyncAt !== null
                        ? t('sync.ultimo_sync', {
                            data: new Intl.DateTimeFormat('it-IT', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(syncStatus.lastSyncAt)),
                          })
                        : t('sync.stato_aggiornato')}
                    </p>
                  )}
                  {syncStatus?.dirty === true && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      {t('sync.stato_modifiche_locali')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (syncStatus?.enabled) {
                      void handleSyncDisable()
                    } else {
                      void handleSyncEnable()
                    }
                  }}
                  className={[
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                    syncStatus?.enabled
                      ? 'bg-primary-600'
                      : 'bg-gray-200 dark:bg-gray-700',
                  ].join(' ')}
                  role="switch"
                  aria-checked={syncStatus?.enabled ?? false}
                  aria-label={syncStatus?.enabled ? t('sync.disabilita') : t('sync.abilita')}
                >
                  <span
                    className={[
                      'inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
                      syncStatus?.enabled ? 'translate-x-6' : 'translate-x-1',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {syncStatus?.enabled && (
                <>
                  {/* Pulsante Sincronizza ora */}
                  <div>
                    {syncNowResult === 'ok' && (
                      <p className="mb-2 text-sm text-green-600 dark:text-green-400">
                        {t('sync.sincronizza_ok')}
                      </p>
                    )}
                    {syncNowResult === 'errore' && (
                      <p className="mb-2 text-sm text-red-600 dark:text-red-400">
                        {t('sync.sincronizza_errore')}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => { void handleSyncNow() }}
                      disabled={isSyncNow}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                    >
                      {isSyncNow ? t('sync.sincronizzazione_in_corso') : t('sync.sincronizza_ora')}
                    </button>
                  </div>

                  {/* Selettore intervallo polling */}
                  <div>
                    <label
                      htmlFor="settings-sync-polling"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                    >
                      {t('sync.intervallo_polling')}
                    </label>
                    <select
                      id="settings-sync-polling"
                      value={syncStatus.pollingSec ?? 60}
                      onChange={(e) => { void handleSyncSetPolling(parseInt(e.target.value, 10)) }}
                      className="block w-48 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value={30}>30 {t('sync.secondi')}</option>
                      <option value={60}>60 {t('sync.secondi')}</option>
                      <option value={300}>300 {t('sync.secondi')}</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── Feedback globale e submit ─────────────────────────────────────── */}

        {saveError !== null && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {saveError}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2"
          >
            <CheckIcon />
            <span>{t('impostazioni.salvato')}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            {isSaving ? t('common.loading') : t('impostazioni.salva')}
          </button>
        </div>
      </form>

      {/* ── Sezione Informazioni app (fuori dal form — non salvabile) ──────── */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mt-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
          {t('impostazioni.sezione_info')}
        </h3>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
              {t('aggiornamento.versione_corrente')}
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {appVersion !== '' ? `v${appVersion}` : '…'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            {isCheckingUpdate ? t('aggiornamento.controllo') : t('aggiornamento.controlla_pulsante')}
          </button>
        </div>

        {updateCheckResult === 'errore' && (
          <div className="mt-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-red-600 dark:text-red-400">
                {t('aggiornamento.errore_verifica')}
              </p>
              {updateErrorMsg !== null && (
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                  {updateErrorMsg}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setUpdateCheckResult('idle')
                setUpdateErrorMsg(null)
              }}
              aria-label={t('common.close')}
              className="shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            >
              ✕
            </button>
          </div>
        )}
      </section>

      {/* Dialogs backup — fuori dal form per non interferire con il submit */}
      <RestoreDialog
        isOpen={showRestoreDialog}
        onClose={() => setShowRestoreDialog(false)}
      />
      <ResetPasswordDialog
        isOpen={showResetPasswordDialog}
        onClose={() => setShowResetPasswordDialog(false)}
      />
      <ChangePasswordDialog
        isOpen={showChangePasswordDialog}
        onClose={() => setShowChangePasswordDialog(false)}
      />
      <DriveRestoreDialog isOpen={showDriveRestore} onClose={() => setShowDriveRestore(false)} />
    </div>
  )
}
