import { PIN_REGEX } from './pin'

/** Numero di caselle del PIN. */
export const PIN_LUNGHEZZA = 6

const CARATTERE_PIN = /^[A-Za-z0-9]$/

export interface EsitoCaselle {
  /** Nuovo valore del PIN (0-6 caratteri, senza buchi). */
  valore: string
  /** Indice (0-5) della casella da mettere a fuoco. */
  focus: number
}

/** Digitazione nella casella `indice`: si usa l'ultimo carattere, se è alfanumerico. */
export function applicaDigitazione(valore: string, indice: number, testo: string): EsitoCaselle {
  const c = testo.slice(-1)
  if (!CARATTERE_PIN.test(c)) return { valore, focus: indice }
  const pos = Math.min(indice, valore.length)
  return {
    valore: valore.slice(0, pos) + c + valore.slice(pos + 1),
    focus: Math.min(pos + 1, PIN_LUNGHEZZA - 1)
  }
}

/** Backspace nella casella `indice`. */
export function applicaBackspace(valore: string, indice: number): EsitoCaselle {
  if (indice < valore.length) {
    return { valore: valore.slice(0, indice) + valore.slice(indice + 1), focus: indice }
  }
  const prec = Math.min(indice, valore.length) - 1
  if (prec < 0) return { valore, focus: 0 }
  return { valore: valore.slice(0, prec) + valore.slice(prec + 1), focus: prec }
}

/** Incolla: accetta solo un PIN valido (spazi ai bordi ignorati) e riempie tutte le caselle. */
export function applicaIncolla(valore: string, testo: string): EsitoCaselle {
  const t = testo.trim()
  if (PIN_REGEX.test(t)) return { valore: t, focus: PIN_LUNGHEZZA - 1 }
  return { valore, focus: Math.min(valore.length, PIN_LUNGHEZZA - 1) }
}
