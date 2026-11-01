import React, { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { BackupLocaleInfo, StatoSblocco } from '../../../types/shared'
import PinInput from '../components/sicurezza/PinInput'
import { PIN_REGEX } from '../components/sicurezza/pin'

type UnlockState = 'idle' | 'submitting' | 'error'
type UnlockMode = 'pin' | 'password' | 'recupero'

const CLASSE_INPUT =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition'
const CLASSE_LINK =
  'text-sm text-primary-600 dark:text-primary-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded'

function formatMmSs(secondi: number): string {
  const m = Math.floor(secondi / 60)
  const s = secondi % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface UnlockPageProps {
  onReady: () => void
}

export default function UnlockPage({ onReady }: UnlockPageProps): React.JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<UnlockState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [backups, setBackups] = useState<BackupLocaleInfo[]>([])
  const [restoring, setRestoring] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const [mode, setMode] = useState<UnlockMode | null>(null)
  const [stato, setStato] = useState<StatoSblocco | null>(null)
  const [pin, setPin] = useState('')
  const [pinVisibile, setPinVisibile] = useState(false)
  const [chiave, setChiave] = useState('')
  const [bloccatoFino, setBloccatoFino] = useState<string | null>(null)
  const [adesso, setAdesso] = useState(() => Date.now())

  // Stato dei metodi di sblocco: decide la modalità iniziale (PIN se attivo)
  useEffect(() => {
    let attivo = true
    window.api.sicurezza
      .stato()
      .then((st) => {
        if (!attivo) return
        setStato(st)
        setBloccatoFino(st.pinBloccatoFino)
        setAdesso(Date.now())
        setMode(st.pinAttivo ? 'pin' : 'password')
      })
      .catch(() => {
        if (attivo) setMode('password')
      })
    return () => {
      attivo = false
    }
  }, [])

  // Preferenza "Mostra PIN" (locale al PC, leggibile a DB chiuso)
  useEffect(() => {
    let attivo = true
    window.api.settings
      .get()
      .then((st) => {
        if (attivo) setPinVisibile(st.pin_visibile)
      })
      .catch(() => {
        if (attivo) setPinVisibile(false)
      })
    return () => {
      attivo = false
    }
  }, [])

  // Conto alla rovescia del blocco PIN: si riabilita alla scadenza
  const secondiRimasti =
    bloccatoFino === null ? 0 : Math.max(0, Math.ceil((Date.parse(bloccatoFino) - adesso) / 1000))
  useEffect(() => {
    if (bloccatoFino === null) return
    if (secondiRimasti <= 0) {
      setBloccatoFino(null)
      return
    }
    const id = setInterval(() => setAdesso(Date.now()), 1000)
    return () => clearInterval(id)
  }, [bloccatoFino, secondiRimasti])

  function cambiaModo(m: UnlockMode): void {
    setMode(m)
    setErrorMessage('')
    setStatus('idle')
  }

  /** Gestisce MIGRATION_FAILED comune a password, PIN e chiave. Restituisce true se l'ha gestito. */
  async function gestisciMigrazioneFallita(message: string): Promise<boolean> {
    if (!message.includes('MIGRATION_FAILED')) return false
    setErrorMessage(t('unlock.migration_failed'))
    setRecovery(true)
    try {
      setBackups(await window.api.backup.listLocale())
    } catch {
      setBackups([])
    }
    return true
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setErrorMessage('')
    setStatus('submitting')

    try {
      await window.api.db.unlock(password)
      onReady()
    } catch (err) {
      setStatus('error')
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('errata') || message.toLowerCase().includes('wrong')) {
        setErrorMessage(t('unlock.wrong_password'))
      } else if (!(await gestisciMigrazioneFallita(message))) {
        setErrorMessage(t('unlock.error'))
      }
    }
  }

  async function handlePinSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    await inviaPin(pin)
  }

  async function inviaPin(valore: string): Promise<void> {
    setErrorMessage('')
    if (!PIN_REGEX.test(valore)) {
      setErrorMessage(t('unlock.pin_errato'))
      return
    }
    setStatus('submitting')
    try {
      const esito = await window.api.db.unlockPin(valore)
      switch (esito.esito) {
        case 'ok':
          onReady()
          return
        case 'errato':
          setStatus('error')
          setPin('')
          setBloccatoFino(esito.bloccatoFino)
          setAdesso(Date.now())
          setErrorMessage(t('unlock.pin_errato'))
          return
        case 'bloccato':
          setStatus('error')
          setPin('')
          setBloccatoFino(esito.bloccatoFino)
          setAdesso(Date.now())
          return
        case 'disattivato':
          setStatus('error')
          setPin('')
          setBloccatoFino(null)
          setStato((st) => (st ? { ...st, pinAttivo: false } : st))
          setMode('password')
          setErrorMessage(t('unlock.pin_disattivato'))
          return
      }
    } catch (err) {
      setStatus('error')
      const message = err instanceof Error ? err.message : ''
      if (!(await gestisciMigrazioneFallita(message))) {
        setErrorMessage(t('unlock.error'))
      }
    }
  }

  async function handleChiaveSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setErrorMessage('')
    if (!chiave.trim()) {
      setErrorMessage(t('unlock.chiave_errata'))
      return
    }
    setStatus('submitting')
    try {
      await window.api.db.unlockRecupero(chiave.trim())
      onReady()
    } catch (err) {
      setStatus('error')
      const message = err instanceof Error ? err.message : ''
      if (message.includes('CHIAVE_ERRATA')) {
        setErrorMessage(t('unlock.chiave_errata'))
      } else if (message.includes('RECUPERO_NON_DISPONIBILE')) {
        setErrorMessage(t('unlock.chiave_non_disponibile'))
      } else if (message.includes('CHIAVE_NON_VALIDA')) {
        setErrorMessage(t('unlock.chiave_non_valida'))
      } else if (!(await gestisciMigrazioneFallita(message))) {
        setErrorMessage(t('unlock.error'))
      }
    }
  }

  function formatData(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(d)
  }

  async function eseguiRipristino(backupPath: string): Promise<void> {
    setRecoveryError('')
    if (!password) {
      setRecoveryError(t('unlock.recovery_password_obbligatoria'))
      return
    }
    setRestoring(true)
    try {
      await window.api.backup.ripristina({ backupPath, password })
      onReady()
    } catch {
      setRecoveryError(t('unlock.recovery_errore'))
    } finally {
      setRestoring(false)
    }
  }

  async function handleSfoglia(): Promise<void> {
    const res = await window.api.dialog.showOpenDialog({
      title: t('unlock.recovery_lista_titolo'),
      properties: ['openFile'],
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (!res.canceled && res.filePaths.length > 0) {
      await eseguiRipristino(res.filePaths[0])
    }
  }

  const isSubmitting = status === 'submitting'
  const pinBloccato = bloccatoFino !== null && secondiRimasti > 0
  const modoPredefinito: UnlockMode = stato?.pinAttivo ? 'pin' : 'password'

  const erroreBox =
    errorMessage !== '' ? (
      <div
        role="alert"
        data-testid="unlock-error"
        className="mb-5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
      >
        {errorMessage}
      </div>
    ) : null

  const bottoneSubmit = (testId: string, label: string, disabled = false): React.JSX.Element => (
    <button
      type="submit"
      data-testid={testId}
      disabled={isSubmitting || disabled}
      className="w-full rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium py-2.5 px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
    >
      {isSubmitting ? t('common.loading') : label}
    </button>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
        {/* Header / Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
            <svg
              className="w-9 h-9 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('unlock.title')}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('unlock.subtitle')}</p>
        </div>

        {/* Card */}
        <div className="bg-surface-raised dark:bg-surface-raised rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          {!recovery && mode === 'pin' && (
            <form
              data-testid="unlock-pin-form"
              onSubmit={(e) => {
                void handlePinSubmit(e)
              }}
              noValidate
            >
              <div className="mb-5">
                <label
                  id="pin-label"
                  htmlFor="pin-1"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  {t('unlock.pin_label')}
                </label>
                <PinInput
                  idPrefix="pin"
                  testId="pin-input"
                  value={pin}
                  onChange={setPin}
                  visibile={pinVisibile}
                  disabled={isSubmitting || pinBloccato}
                  autoFocus
                  onCompleto={(v) => {
                    if (!isSubmitting && !pinBloccato) void inviaPin(v)
                  }}
                />
              </div>

              {pinBloccato && (
                <div
                  role="status"
                  data-testid="pin-bloccato"
                  className="mb-5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
                >
                  {t('unlock.pin_bloccato')}{' '}
                  <span className="font-mono font-semibold" data-testid="pin-countdown">
                    {formatMmSs(secondiRimasti)}
                  </span>
                </div>
              )}
              {erroreBox}

              {bottoneSubmit('unlock-pin-submit', t('unlock.submit'), pinBloccato)}

              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  data-testid="usa-password"
                  onClick={() => cambiaModo('password')}
                  className={CLASSE_LINK}
                >
                  {t('unlock.usa_password')}
                </button>
                <button
                  type="button"
                  data-testid="password-dimenticata"
                  onClick={() => cambiaModo('recupero')}
                  className={CLASSE_LINK}
                >
                  {t('unlock.dimenticata')}
                </button>
              </div>
            </form>
          )}

          {!recovery && mode === 'password' && (
            <form
              data-testid="unlock-form"
              onSubmit={(e) => {
                void handleSubmit(e)
              }}
              noValidate
            >
              {/* Campo password */}
              <div className="mb-5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  {t('unlock.password_label')}
                </label>
                <input
                  id="password"
                  data-testid="password-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                  className={CLASSE_INPUT}
                  required
                />
              </div>

              {erroreBox}

              {bottoneSubmit('unlock-submit', t('unlock.submit'))}

              <div className="mt-4 flex flex-col items-center gap-2">
                {stato?.pinAttivo && (
                  <button
                    type="button"
                    data-testid="usa-pin"
                    onClick={() => cambiaModo('pin')}
                    className={CLASSE_LINK}
                  >
                    {t('unlock.usa_pin')}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="password-dimenticata"
                  onClick={() => cambiaModo('recupero')}
                  className={CLASSE_LINK}
                >
                  {t('unlock.dimenticata')}
                </button>
              </div>
            </form>
          )}

          {!recovery && mode === 'recupero' && (
            <div data-testid="unlock-recupero">
              {stato?.recuperoAttivo ? (
                <form
                  onSubmit={(e) => {
                    void handleChiaveSubmit(e)
                  }}
                  noValidate
                >
                  <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                    {t('unlock.chiave_descrizione')}
                  </p>
                  <div className="mb-5">
                    <label
                      htmlFor="chiave"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                    >
                      {t('unlock.chiave_label')}
                    </label>
                    <input
                      id="chiave"
                      data-testid="chiave-input"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={chiave}
                      onChange={(e) => setChiave(e.target.value)}
                      disabled={isSubmitting}
                      autoFocus
                      placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                      className={`${CLASSE_INPUT} font-mono`}
                    />
                  </div>
                  {erroreBox}
                  {bottoneSubmit('unlock-chiave-submit', t('unlock.chiave_submit'))}
                </form>
              ) : (
                <p
                  data-testid="unlock-senza-chiave"
                  className="mb-2 text-sm text-gray-600 dark:text-gray-400"
                >
                  {t('unlock.senza_chiave')}
                </p>
              )}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  data-testid="torna-accesso"
                  onClick={() => cambiaModo(modoPredefinito)}
                  className={CLASSE_LINK}
                >
                  {t('unlock.torna_accesso')}
                </button>
              </div>
            </div>
          )}

          {recovery && (
            <div data-testid="recovery-panel">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('unlock.recovery_titolo')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {t('unlock.recovery_spiegazione')}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-4">
                {t('unlock.recovery_limite')}
              </p>

              {recoveryError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
                >
                  {recoveryError}
                </div>
              )}

              {mode !== 'password' && (
                <div className="mb-4">
                  <label
                    htmlFor="recovery-password"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                  >
                    {t('unlock.recovery_password_label')}
                  </label>
                  <input
                    id="recovery-password"
                    data-testid="recovery-password-input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={restoring}
                    className={CLASSE_INPUT}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('unlock.recovery_password_hint')}
                  </p>
                </div>
              )}

              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('unlock.recovery_lista_titolo')}
              </p>

              {backups.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {t('unlock.recovery_vuota')}
                </p>
              ) : (
                <ul className="mb-4 divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                  {backups.map((b) => (
                    <li key={b.path} className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {formatData(b.createdAt)}
                        {b.appVersion
                          ? ` · ${t('unlock.recovery_riga_versione', { versione: b.appVersion })}`
                          : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void eseguiRipristino(b.path)
                        }}
                        disabled={restoring}
                        className="ml-3 shrink-0 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white text-sm font-medium py-1.5 px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                      >
                        {restoring ? t('unlock.recovery_in_corso') : t('unlock.recovery_ripristina')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => {
                  void handleSfoglia()
                }}
                disabled={restoring}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium py-2.5 px-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
              >
                {t('unlock.recovery_sfoglia')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
