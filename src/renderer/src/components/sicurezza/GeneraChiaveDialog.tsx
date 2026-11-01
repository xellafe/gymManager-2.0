import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import ChiaveRecuperoModal from './ChiaveRecuperoModal'
import {
  CLASSE_BOTTONE_PRIMARIO,
  CLASSE_BOTTONE_SECONDARIO,
  CLASSE_ERRORE,
  CLASSE_INPUT
} from './pin'

export type VarianteGeneraChiave = 'invito' | 'genera' | 'rigenera'

interface GeneraChiaveDialogProps {
  isOpen: boolean
  variante: VarianteGeneraChiave
  /** Chiusura (anche "Più tardi" dell'invito, Esc, clic fuori). */
  onClose: () => void
  /** Chiamata dopo che la chiave è stata generata e l'utente ha confermato di averla salvata. */
  onGenerata?: () => void
}

/** Chiede la master password e genera (o rigenera) la chiave di recupero. */
export default function GeneraChiaveDialog({
  isOpen,
  variante,
  onClose,
  onGenerata
}: GeneraChiaveDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chiave, setChiave] = useState<string | null>(null)

  function reset(): void {
    setPassword('')
    setError(null)
    setChiave(null)
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
    setIsLoading(true)
    try {
      const nuova = await window.api.sicurezza.generaChiaveRecupero(password)
      setPassword('')
      setChiave(nuova)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(
        msg.includes('PASSWORD_WRONG') ? t('sicurezza.password_errata') : t('sicurezza.errore_generico')
      )
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  if (chiave !== null) {
    return (
      <ChiaveRecuperoModal
        chiave={chiave}
        onClose={() => {
          reset()
          onGenerata?.()
          onClose()
        }}
      />
    )
  }

  const titolo =
    variante === 'invito'
      ? t('sicurezza.invito_titolo')
      : variante === 'rigenera'
        ? t('sicurezza.rigenera_titolo')
        : t('sicurezza.genera_titolo')
  const descrizione =
    variante === 'invito'
      ? t('sicurezza.invito_testo')
      : variante === 'rigenera'
        ? t('sicurezza.rigenera_avviso')
        : t('sicurezza.genera_testo')
  const prefisso = variante === 'invito' ? 'invito-chiave' : 'genera-chiave'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={titolo} maxWidth="max-w-md">
      <form
        data-testid={`${prefisso}-form`}
        onSubmit={(e) => {
          void handleSubmit(e)
        }}
        className="space-y-4"
        noValidate
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">{descrizione}</p>
        <div>
          <label
            htmlFor={`${prefisso}-password`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            {t('sicurezza.password_label')}
          </label>
          <input
            id={`${prefisso}-password`}
            data-testid={`${prefisso}-password`}
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
        {error !== null && (
          <div role="alert" className={CLASSE_ERRORE}>
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            data-testid={variante === 'invito' ? 'invito-chiave-dopo' : undefined}
            onClick={handleClose}
            disabled={isLoading}
            className={CLASSE_BOTTONE_SECONDARIO}
          >
            {variante === 'invito' ? t('sicurezza.invito_dopo') : t('common.cancel')}
          </button>
          <button
            type="submit"
            data-testid={`${prefisso}-genera`}
            disabled={isLoading}
            className={CLASSE_BOTTONE_PRIMARIO}
          >
            {isLoading ? t('common.loading') : t('sicurezza.genera_pulsante')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
