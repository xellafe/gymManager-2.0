import React from 'react'
import { useTranslation } from 'react-i18next'
import { CLASSE_INPUT } from './pin'
import type { CredenzialiRipristino } from '../../../../types/shared'

export type ModoCredenziale = 'password' | 'chiave'

interface CredenzialeRipristinoCampiProps {
  idPrefix: string
  modo: ModoCredenziale
  onModo: (m: ModoCredenziale) => void
  password: string
  onPassword: (v: string) => void
  chiave: string
  onChiave: (v: string) => void
  disabled: boolean
}

/** Scelta "Master password" / "Chiave di recupero" con il campo corrispondente (dialog di ripristino). */
export function CredenzialeRipristinoCampi({
  idPrefix,
  modo,
  onModo,
  password,
  onPassword,
  chiave,
  onChiave,
  disabled
}: CredenzialeRipristinoCampiProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <fieldset className="flex gap-5">
        <legend className="sr-only">{t('backup.ripristina_credenziale')}</legend>
        {(['password', 'chiave'] as const).map((m) => (
          <label
            key={m}
            className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            <input
              type="radio"
              name={`${idPrefix}-modo`}
              data-testid={`${idPrefix}-modo-${m}`}
              checked={modo === m}
              onChange={() => onModo(m)}
              disabled={disabled}
              className="w-4 h-4 text-primary-600 focus:ring-primary-500"
            />
            {m === 'password' ? t('backup.ripristina_con_password') : t('backup.ripristina_con_chiave')}
          </label>
        ))}
      </fieldset>
      {modo === 'password' ? (
        <div>
          <label
            htmlFor={`${idPrefix}-password`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            {t('backup.ripristina_password')}
          </label>
          <input
            id={`${idPrefix}-password`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            disabled={disabled}
            className={CLASSE_INPUT}
          />
        </div>
      ) : (
        <div>
          <label
            htmlFor={`${idPrefix}-chiave`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            {t('backup.ripristina_chiave')}
          </label>
          <input
            id={`${idPrefix}-chiave`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={chiave}
            onChange={(e) => onChiave(e.target.value)}
            disabled={disabled}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            className={`${CLASSE_INPUT} font-mono`}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('backup.ripristina_chiave_hint')}
          </p>
        </div>
      )}
    </div>
  )
}

/** Costruisce le credenziali per l'IPC; `null` se il campo scelto è vuoto. */
export function costruisciCredenziali(
  modo: ModoCredenziale,
  password: string,
  chiave: string
): CredenzialiRipristino | null {
  if (modo === 'password') return password ? { password } : null
  const c = chiave.trim()
  return c ? { chiaveRecupero: c } : null
}

/** Chiave i18n dell'errore di ripristino per i codici legati alla chiave, `null` se altro. */
export function erroreChiaveRipristino(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('CHIAVE_ERRATA')) return 'backup.ripristina_chiave_errata'
  if (msg.includes('RECUPERO_NON_DISPONIBILE')) return 'backup.ripristina_chiave_non_disponibile'
  return null
}
