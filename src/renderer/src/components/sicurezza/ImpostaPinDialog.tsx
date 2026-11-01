import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import {
  CLASSE_BOTTONE_PRIMARIO,
  CLASSE_BOTTONE_SECONDARIO,
  CLASSE_ERRORE,
  CLASSE_INPUT,
  PIN_REGEX
} from './pin'

interface ImpostaPinDialogProps {
  isOpen: boolean
  /** true se il PIN è già attivo (titolo "Cambia PIN"). */
  cambio: boolean
  onClose: () => void
  onImpostato: () => void
}

/** Attiva o cambia il PIN: richiede la master password, il PIN e la sua conferma. */
export default function ImpostaPinDialog({
  isOpen,
  cambio,
  onClose,
  onImpostato
}: ImpostaPinDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [conferma, setConferma] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset(): void {
    setPassword('')
    setPin('')
    setConferma('')
    setError(null)
  }

  function handleClose(): void {
    if (isLoading) return
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    if (!password) {
      setError(t('sicurezza.password_obbligatoria'))
      return
    }
    if (!PIN_REGEX.test(pin)) {
      setError(t('sicurezza.pin_formato'))
      return
    }
    if (pin !== conferma) {
      setError(t('sicurezza.pin_mismatch'))
      return
    }
    setIsLoading(true)
    try {
      await window.api.sicurezza.impostaPin(password, pin)
      reset()
      onImpostato()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('PASSWORD_WRONG')) setError(t('sicurezza.password_errata'))
      else if (msg.includes('PIN_FORMATO_NON_VALIDO')) setError(t('sicurezza.pin_formato'))
      else if (msg.includes('PIN_NON_DISPONIBILE')) setError(t('sicurezza.pin_non_disponibile'))
      else setError(t('sicurezza.errore_generico'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={cambio ? t('sicurezza.pin_cambia_titolo') : t('sicurezza.pin_attiva_titolo')}
      maxWidth="max-w-md"
    >
      <form
        onSubmit={(e) => {
          void handleSubmit(e)
        }}
        className="space-y-4"
        noValidate
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('sicurezza.pin_descrizione')}</p>
        <div>
          <label
            htmlFor="imposta-pin-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            {t('sicurezza.password_label')}
          </label>
          <input
            id="imposta-pin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            disabled={isLoading}
            className={CLASSE_INPUT}
          />
        </div>
        <div>
          <label
            htmlFor="imposta-pin-pin"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            {t('sicurezza.pin_label')}
          </label>
          <input
            id="imposta-pin-pin"
            type="password"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setError(null)
            }}
            disabled={isLoading}
            className={CLASSE_INPUT}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('sicurezza.pin_hint')}</p>
        </div>
        <div>
          <label
            htmlFor="imposta-pin-conferma"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            {t('sicurezza.pin_conferma_label')}
          </label>
          <input
            id="imposta-pin-conferma"
            type="password"
            autoComplete="off"
            maxLength={6}
            value={conferma}
            onChange={(e) => {
              setConferma(e.target.value)
              setError(null)
            }}
            disabled={isLoading}
            className={CLASSE_INPUT}
          />
        </div>
        {error !== null && (
          <div role="alert" className={CLASSE_ERRORE}>
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className={CLASSE_BOTTONE_SECONDARIO}
          >
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={isLoading} className={CLASSE_BOTTONE_PRIMARIO}>
            {isLoading ? t('common.loading') : t('sicurezza.pin_imposta')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
