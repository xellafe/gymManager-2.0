import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CLASSE_INPUT } from './pin'
import {
  PIN_LUNGHEZZA,
  applicaBackspace,
  applicaDigitazione,
  applicaIncolla,
  type EsitoCaselle
} from './pin-caselle'

interface PinInputProps {
  value: string
  onChange: (valore: string) => void
  /** true: caratteri visibili; false: nascosti. */
  visibile: boolean
  disabled?: boolean
  autoFocus?: boolean
  /** Chiamata quando una digitazione o un incolla porta il valore da meno di 6 a 6 caratteri. */
  onCompleto?: (valore: string) => void
  testId: string
  idPrefix: string
}

const INDICI = Array.from({ length: PIN_LUNGHEZZA }, (_, i) => i)

/** Campo PIN a 6 caselle (una per carattere). L'etichetta è nell'elemento con id `<idPrefix>-label`. */
export default function PinInput({
  value,
  onChange,
  visibile,
  disabled = false,
  autoFocus = false,
  onCompleto,
  testId,
  idPrefix
}: PinInputProps): React.JSX.Element {
  const { t } = useTranslation()
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const eraDisabilitato = useRef(disabled)

  function focusSu(indice: number): void {
    refs.current[indice]?.focus()
  }

  // Focus alla prima casella all'apertura e quando tornano abilitate
  useEffect(() => {
    if (autoFocus && eraDisabilitato.current && !disabled) focusSu(0)
    eraDisabilitato.current = disabled
  }, [disabled, autoFocus])

  useEffect(() => {
    if (autoFocus) focusSu(0)
    // solo al montaggio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applica(esito: EsitoCaselle): void {
    if (esito.valore !== value) {
      onChange(esito.valore)
      if (value.length < PIN_LUNGHEZZA && esito.valore.length === PIN_LUNGHEZZA) {
        onCompleto?.(esito.valore)
      }
    }
    focusSu(esito.focus)
  }

  return (
    <div
      role="group"
      aria-labelledby={`${idPrefix}-label`}
      data-testid={testId}
      className="flex gap-2"
    >
      {INDICI.map((i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          id={`${idPrefix}-${i + 1}`}
          data-testid={`${testId}-${i + 1}`}
          type={visibile ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          maxLength={1}
          inputMode="text"
          aria-label={t('sicurezza.pin_carattere', { n: i + 1, totale: PIN_LUNGHEZZA })}
          value={value[i] ?? ''}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => applica(applicaDigitazione(value, i, e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault()
              applica(applicaBackspace(value, i))
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault()
              applica(applicaDigitazione(value, i, e.key))
            }
          }}
          onPaste={(e) => {
            e.preventDefault()
            applica(applicaIncolla(value, e.clipboardData.getData('text')))
          }}
          className={`${CLASSE_INPUT} !w-10 !px-0 text-center font-mono`}
        />
      ))}
    </div>
  )
}
