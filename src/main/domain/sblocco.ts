import { randomInt } from 'crypto'
import type { SlotSblocco } from '../../types/shared'

/** Alfabeto base32 di Crockford: niente I, L, O, U (caratteri ambigui). */
export const ALFABETO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Lunghezza della chiave di recupero (senza separatori). */
export const LUNGHEZZA_CHIAVE = 24
const DIMENSIONE_GRUPPO = 4

/** Errori di PIN dopo i quali scatta il primo blocco. */
export const PIN_ERRORI_PRIMO_BLOCCO = 5
/** Errore di PIN al quale il PIN viene disattivato. */
export const PIN_ERRORI_DISATTIVAZIONE = 10

/**
 * Genera una chiave di recupero casuale: 24 caratteri dell'alfabeto Crockford,
 * formattata in 6 gruppi da 4 separati da `-` (es. `7K3M-Q9XA-…`).
 */
export function generaChiaveRecupero(): string {
  let grezza = ''
  for (let i = 0; i < LUNGHEZZA_CHIAVE; i++) {
    grezza += ALFABETO_CROCKFORD[randomInt(ALFABETO_CROCKFORD.length)]
  }
  return formattaChiave(grezza)
}

/** Divide una chiave normalizzata in gruppi da 4 separati da `-`. */
export function formattaChiave(normalizzata: string): string {
  const gruppi: string[] = []
  for (let i = 0; i < normalizzata.length; i += DIMENSIONE_GRUPPO) {
    gruppi.push(normalizzata.slice(i, i + DIMENSIONE_GRUPPO))
  }
  return gruppi.join('-')
}

/**
 * Normalizza la chiave digitata dall'utente: rimuove spazi e `-`, porta in maiuscolo,
 * sostituisce `O`→`0` e `I`/`L`→`1`.
 * @returns la chiave normalizzata (24 caratteri Crockford) o `null` se non valida.
 */
export function normalizzaChiave(input: string): string | null {
  const pulita = input
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (pulita.length !== LUNGHEZZA_CHIAVE) return null
  for (const c of pulita) {
    if (!ALFABETO_CROCKFORD.includes(c)) return null
  }
  return pulita
}

/** Il PIN è esattamente 6 caratteri A-Z, a-z, 0-9 (maiuscole e minuscole distinte). */
export function validaPin(pin: string): boolean {
  return /^[A-Za-z0-9]{6}$/.test(pin)
}

export interface BloccoPin {
  /** ISO datetime di fine blocco, `null` se nessun blocco. */
  bloccatoFino: string | null
  /** true se il PIN va disattivato. */
  disattiva: boolean
}

/**
 * Calcola l'effetto di `errori` PIN errati consecutivi:
 * 1-4 → nessun blocco; 5-9 → blocco di 2^(errori-5) minuti da `ora`; ≥10 → disattivazione.
 */
export function calcolaBloccoPin(errori: number, ora: Date): BloccoPin {
  if (errori >= PIN_ERRORI_DISATTIVAZIONE) return { bloccatoFino: null, disattiva: true }
  if (errori < PIN_ERRORI_PRIMO_BLOCCO) return { bloccatoFino: null, disattiva: false }
  const minuti = 2 ** (errori - PIN_ERRORI_PRIMO_BLOCCO)
  return { bloccatoFino: new Date(ora.getTime() + minuti * 60_000).toISOString(), disattiva: false }
}

/** Type guard per uno slot letto da file, manifest o metadati Drive. */
export function isSlotSblocco(valore: unknown): valore is SlotSblocco {
  if (typeof valore !== 'object' || valore === null) return false
  const v = valore as Record<string, unknown>
  return (
    v.versione === 1 &&
    typeof v.salt === 'string' &&
    typeof v.dbKeyCifrata === 'string' &&
    typeof v.kekCifrata === 'string'
  )
}
