import React, { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CLASSE_BOTTONE_PRIMARIO, CLASSE_BOTTONE_SECONDARIO, CLASSE_ERRORE } from './pin'

interface ChiaveRecuperoModalProps {
  chiave: string
  /** Chiamata solo dopo la conferma "Ho salvato la chiave". */
  onClose: () => void
}

/**
 * Mostra la chiave di recupero una sola volta. Non si chiude con Esc né con clic fuori:
 * solo dopo aver spuntato "Ho salvato la chiave".
 */
export default function ChiaveRecuperoModal({
  chiave,
  onClose
}: ChiaveRecuperoModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [confermata, setConfermata] = useState(false)
  const [copiata, setCopiata] = useState(false)
  const [esitoSalva, setEsitoSalva] = useState<'ok' | 'errore' | null>(null)
  const [erroreCopia, setErroreCopia] = useState(false)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  async function copia(): Promise<void> {
    setErroreCopia(false)
    try {
      await navigator.clipboard.writeText(chiave)
      setCopiata(true)
    } catch {
      setCopiata(false)
      setErroreCopia(true)
    }
  }

  async function salvaFile(): Promise<void> {
    setEsitoSalva(null)
    const contenuto = `${chiave}\n${t('sicurezza.file_riga1')}\n${t('sicurezza.file_riga2')}\n`
    try {
      const salvato = await window.api.sicurezza.salvaChiaveTxt(contenuto)
      setEsitoSalva(salvato ? 'ok' : null)
    } catch {
      setEsitoSalva('errore')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="chiave-recupero-modal"
    >
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-xl max-h-[90vh] overflow-y-auto focus:outline-none"
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('sicurezza.chiave_titolo')}
          </h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('sicurezza.chiave_descrizione')}
          </p>

          <div
            data-testid="chiave-recupero-valore"
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-center font-mono text-lg tracking-wider text-gray-900 dark:text-gray-100 select-all break-all"
          >
            {chiave}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="chiave-recupero-copia"
              onClick={() => {
                void copia()
              }}
              className={CLASSE_BOTTONE_SECONDARIO}
            >
              {copiata ? t('sicurezza.chiave_copiata') : t('sicurezza.chiave_copia')}
            </button>
            <button
              type="button"
              data-testid="chiave-recupero-salva"
              onClick={() => {
                void salvaFile()
              }}
              className={CLASSE_BOTTONE_SECONDARIO}
            >
              {t('sicurezza.chiave_salva_file')}
            </button>
          </div>

          {esitoSalva === 'ok' && (
            <p role="status" className="text-sm text-green-700 dark:text-green-400">
              {t('sicurezza.chiave_file_salvato')}
            </p>
          )}
          {esitoSalva === 'errore' && (
            <div role="alert" className={CLASSE_ERRORE}>
              {t('sicurezza.chiave_file_errore')}
            </div>
          )}
          {erroreCopia && (
            <div role="alert" className={CLASSE_ERRORE}>
              {t('sicurezza.chiave_copia_errore')}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              data-testid="chiave-recupero-conferma"
              checked={confermata}
              onChange={(e) => setConfermata(e.target.checked)}
              className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
            />
            {t('sicurezza.chiave_conferma')}
          </label>

          <div className="flex justify-end">
            <button
              type="button"
              data-testid="chiave-recupero-chiudi"
              disabled={!confermata}
              onClick={onClose}
              className={CLASSE_BOTTONE_PRIMARIO}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
