import React, { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import ChiaveRecuperoModal from '../components/sicurezza/ChiaveRecuperoModal'

interface NuovaPasswordRecuperoProps {
  /** Chiamata dopo il salvataggio della nuova password e la conferma della nuova chiave. */
  onReady: () => void
}

const CLASSE_INPUT =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition'

/** Pagina obbligatoria dopo lo sblocco con la chiave di recupero: scelta della nuova master password. */
export default function NuovaPasswordRecuperoPage({
  onReady
}: NuovaPasswordRecuperoProps): React.JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [nuovaChiave, setNuovaChiave] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setErrorMessage('')
    if (password.length < 8) {
      setErrorMessage(t('setup.too_short'))
      return
    }
    if (password !== confirm) {
      setErrorMessage(t('setup.mismatch'))
      return
    }
    setIsSubmitting(true)
    try {
      const chiave = await window.api.recupero.completa(password)
      setPassword('')
      setConfirm('')
      setNuovaChiave(chiave)
    } catch {
      setErrorMessage(t('nuova_password.errore'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('nuova_password.titolo')}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('nuova_password.descrizione')}
          </p>
        </div>

        <div className="bg-surface-raised dark:bg-surface-raised rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <form
            data-testid="nuova-password-form"
            onSubmit={(e) => {
              void handleSubmit(e)
            }}
            noValidate
          >
            <div className="mb-5">
              <label
                htmlFor="nuova-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('nuova_password.password_label')}
              </label>
              <input
                id="nuova-password"
                data-testid="nuova-password-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting || nuovaChiave !== null}
                autoFocus
                className={CLASSE_INPUT}
              />
            </div>
            <div className="mb-5">
              <label
                htmlFor="nuova-password-conferma"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('setup.confirm_label')}
              </label>
              <input
                id="nuova-password-conferma"
                data-testid="nuova-password-confirm-input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={isSubmitting || nuovaChiave !== null}
                className={CLASSE_INPUT}
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

            <p className="mb-6 text-xs text-gray-500 dark:text-gray-400">
              {t('setup.password_hint')}
            </p>

            <button
              type="submit"
              data-testid="nuova-password-submit"
              disabled={isSubmitting || nuovaChiave !== null}
              className="w-full rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium py-2.5 px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('common.loading') : t('nuova_password.submit')}
            </button>
          </form>
        </div>
      </div>

      {nuovaChiave !== null && <ChiaveRecuperoModal chiave={nuovaChiave} onClose={onReady} />}
    </div>
  )
}
