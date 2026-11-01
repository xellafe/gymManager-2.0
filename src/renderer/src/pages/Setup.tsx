import React, { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import ChiaveRecuperoModal from '../components/sicurezza/ChiaveRecuperoModal'
import { PIN_REGEX } from '../components/sicurezza/pin'

type SetupState = 'idle' | 'submitting' | 'error'
type SetupPhase = 'password' | 'chiave' | 'pin'

interface SetupPageProps {
  onReady: () => void
}

export default function SetupPage({ onReady }: SetupPageProps): React.JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<SetupState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [phase, setPhase] = useState<SetupPhase>('password')
  const [chiave, setChiave] = useState('')
  const [pin, setPin] = useState('')
  const [pinConferma, setPinConferma] = useState('')

  function validate(): string | null {
    if (password.length < 8) {
      return t('setup.too_short')
    }
    if (password !== confirm) {
      return t('setup.mismatch')
    }
    return null
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setErrorMessage('')

    const validationError = validate()
    if (validationError !== null) {
      setErrorMessage(validationError)
      return
    }

    setStatus('submitting')
    try {
      await window.api.db.setup(password)
    } catch {
      setStatus('error')
      setErrorMessage(t('setup.error'))
      return
    }
    // DB creato: se la chiave non si genera, si prosegue (l'invito comparirà nella dashboard).
    try {
      setChiave(await window.api.sicurezza.generaChiaveRecupero(password))
      setPhase('chiave')
    } catch {
      onReady()
    }
  }

  /** Dopo la conferma della chiave: passo PIN se disponibile, altrimenti dashboard. */
  async function handleChiaveSalvata(): Promise<void> {
    setChiave('')
    setStatus('idle')
    try {
      const stato = await window.api.sicurezza.stato()
      if (stato.pinDisponibile) {
        setPhase('pin')
        return
      }
    } catch {
      // non bloccante: si prosegue senza il passo PIN
    }
    onReady()
  }

  async function handlePinSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setErrorMessage('')
    if (!PIN_REGEX.test(pin)) {
      setErrorMessage(t('sicurezza.pin_formato'))
      return
    }
    if (pin !== pinConferma) {
      setErrorMessage(t('sicurezza.pin_mismatch'))
      return
    }
    setStatus('submitting')
    try {
      await window.api.sicurezza.impostaPin(password, pin)
      onReady()
    } catch {
      setStatus('error')
      setErrorMessage(t('sicurezza.errore_generico'))
    }
  }

  const isSubmitting = status === 'submitting'

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
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
            {t('setup.title')}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('setup.subtitle')}</p>
        </div>

        {/* Card */}
        <div className="bg-surface-raised dark:bg-surface-raised rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          {phase === 'pin' ? (
            <form
              data-testid="pin-form"
              onSubmit={(e) => {
                void handlePinSubmit(e)
              }}
              noValidate
            >
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {t('sicurezza.setup_pin_titolo')}
              </h2>
              <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
                {t('sicurezza.pin_descrizione')}
              </p>
              <div className="mb-5">
                <label
                  htmlFor="setup-pin"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  {t('sicurezza.pin_label')}
                </label>
                <input
                  id="setup-pin"
                  data-testid="pin-input"
                  type="password"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('sicurezza.pin_hint')}
                </p>
              </div>
              <div className="mb-5">
                <label
                  htmlFor="setup-pin-conferma"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  {t('sicurezza.pin_conferma_label')}
                </label>
                <input
                  id="setup-pin-conferma"
                  data-testid="pin-confirm-input"
                  type="password"
                  autoComplete="off"
                  maxLength={6}
                  value={pinConferma}
                  onChange={(e) => setPinConferma(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                />
              </div>
              {errorMessage && (
                <div
                  role="alert"
                  className="mb-5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
                >
                  {errorMessage}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  data-testid="pin-salta"
                  onClick={onReady}
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium py-2.5 px-4 transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                >
                  {t('sicurezza.pin_salta')}
                </button>
                <button
                  type="submit"
                  data-testid="pin-imposta"
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium py-2.5 px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? t('common.loading') : t('sicurezza.pin_imposta')}
                </button>
              </div>
            </form>
          ) : (
          <form data-testid="setup-form" onSubmit={handleSubmit} noValidate>
            {/* Campo password */}
            <div className="mb-5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('setup.password_label')}
              </label>
              <input
                id="password"
                data-testid="password-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                required
              />
            </div>

            {/* Campo conferma */}
            <div className="mb-5">
              <label
                htmlFor="confirm"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('setup.confirm_label')}
              </label>
              <input
                id="confirm"
                data-testid="password-confirm-input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                required
              />
            </div>

            {/* Messaggio di errore */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
              >
                {errorMessage}
              </div>
            )}

            {/* Hint password */}
            <p className="mb-6 text-xs text-gray-500 dark:text-gray-400">{t('setup.password_hint')}</p>

            {/* Bottone submit */}
            <button
              type="submit"
              data-testid="setup-submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium py-2.5 px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('common.loading') : t('setup.submit')}
            </button>
          </form>
          )}
        </div>
      </div>

      {phase === 'chiave' && (
        <ChiaveRecuperoModal
          chiave={chiave}
          onClose={() => {
            void handleChiaveSalvata()
          }}
        />
      )}
    </div>
  )
}
