import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from '../ui/ConfirmDialog'
import GeneraChiaveDialog from './GeneraChiaveDialog'
import ImpostaPinDialog from './ImpostaPinDialog'
import type { StatoSblocco } from '../../../../types/shared'
import { CLASSE_BOTTONE_PRIMARIO, CLASSE_BOTTONE_SECONDARIO } from './pin'

/** Impostazioni → Sicurezza: chiave di recupero e PIN di sblocco. */
export default function SicurezzaSezione(): React.JSX.Element | null {
  const { t } = useTranslation()
  const [stato, setStato] = useState<StatoSblocco | null>(null)
  const [mostraChiave, setMostraChiave] = useState(false)
  const [mostraPin, setMostraPin] = useState(false)
  const [mostraDisattiva, setMostraDisattiva] = useState(false)
  const [disattivaErrore, setDisattivaErrore] = useState<string | null>(null)
  const [disattivando, setDisattivando] = useState(false)
  const [pinVisibile, setPinVisibile] = useState(false)
  const [pinVisibileErrore, setPinVisibileErrore] = useState<string | null>(null)

  const carica = useCallback(async (): Promise<void> => {
    try {
      setStato(await window.api.sicurezza.stato())
    } catch {
      setStato(null)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

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

  async function togglePinVisibile(): Promise<void> {
    const precedente = pinVisibile
    setPinVisibileErrore(null)
    setPinVisibile(!precedente)
    try {
      await window.api.settings.set({ pin_visibile: !precedente })
    } catch {
      setPinVisibile(precedente)
      setPinVisibileErrore(t('sicurezza.errore_generico'))
    }
  }

  async function disattiva(): Promise<void> {
    setDisattivaErrore(null)
    setDisattivando(true)
    try {
      await window.api.sicurezza.disattivaPin()
      setMostraDisattiva(false)
      await carica()
    } catch {
      setDisattivaErrore(t('sicurezza.errore_generico'))
    } finally {
      setDisattivando(false)
    }
  }

  if (stato === null) return null

  return (
    <>
      {/* Chiave di recupero */}
      <div className="mb-6" data-testid="sicurezza-chiave">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {t('sicurezza.chiave_titolo')}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          {t('sicurezza.chiave_sezione_descrizione')}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
          {stato.recuperoAttivo
            ? t('sicurezza.chiave_stato_attiva')
            : t('sicurezza.chiave_stato_assente')}
        </p>
        <button
          type="button"
          data-testid="btn-genera-chiave"
          onClick={() => setMostraChiave(true)}
          className={CLASSE_BOTTONE_PRIMARIO}
        >
          {stato.recuperoAttivo
            ? t('sicurezza.rigenera_pulsante')
            : t('sicurezza.genera_pulsante_sezione')}
        </button>
      </div>

      {/* PIN */}
      <div className="mb-6" data-testid="sicurezza-pin">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {t('sicurezza.pin_titolo')}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {stato.pinDisponibile
            ? t('sicurezza.pin_sezione_descrizione')
            : t('sicurezza.pin_non_disponibile')}
        </p>
        {stato.pinDisponibile && (
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p
                id="pin-mostra-label"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t('sicurezza.pin_mostra')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t('sicurezza.pin_mostra_descrizione')}
              </p>
              {pinVisibileErrore !== null && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {pinVisibileErrore}
                </p>
              )}
            </div>
            <button
              type="button"
              data-testid="pin-mostra-toggle"
              onClick={() => {
                void togglePinVisibile()
              }}
              className={[
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                pinVisibile ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
              ].join(' ')}
              role="switch"
              aria-checked={pinVisibile}
              aria-labelledby="pin-mostra-label"
            >
              <span
                className={[
                  'inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
                  pinVisibile ? 'translate-x-6' : 'translate-x-1'
                ].join(' ')}
                aria-hidden="true"
              />
            </button>
          </div>
        )}
        {stato.pinDisponibile && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="btn-pin-imposta"
              onClick={() => setMostraPin(true)}
              className={CLASSE_BOTTONE_PRIMARIO}
            >
              {stato.pinAttivo ? t('sicurezza.pin_cambia') : t('sicurezza.pin_attiva')}
            </button>
            {stato.pinAttivo && (
              <button
                type="button"
                data-testid="btn-pin-disattiva"
                onClick={() => {
                  setDisattivaErrore(null)
                  setMostraDisattiva(true)
                }}
                className={CLASSE_BOTTONE_SECONDARIO}
              >
                {t('sicurezza.pin_disattiva')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Portale su body + stop del submit sintetico: nessuna <form> annidata in quella delle Impostazioni */}
      {createPortal(
        <div onSubmit={(e) => e.stopPropagation()}>
          <GeneraChiaveDialog
            isOpen={mostraChiave}
            variante={stato.recuperoAttivo ? 'rigenera' : 'genera'}
            onClose={() => setMostraChiave(false)}
            onGenerata={() => {
              void carica()
            }}
          />
          <ImpostaPinDialog
            isOpen={mostraPin}
            cambio={stato.pinAttivo}
            onClose={() => setMostraPin(false)}
            onImpostato={() => {
              setMostraPin(false)
              void carica()
            }}
          />
          <ConfirmDialog
            isOpen={mostraDisattiva}
            onClose={() => setMostraDisattiva(false)}
            onConfirm={() => {
              void disattiva()
            }}
            title={t('sicurezza.pin_disattiva_titolo')}
            message={t('sicurezza.pin_disattiva_messaggio')}
            confirmLabel={t('sicurezza.pin_disattiva')}
            isLoading={disattivando}
            errorMessage={disattivaErrore}
          />
        </div>,
        document.body
      )}
    </>
  )
}
