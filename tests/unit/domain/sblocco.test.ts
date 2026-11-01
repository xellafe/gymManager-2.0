import { describe, it, expect } from 'vitest'
import {
  ALFABETO_CROCKFORD,
  generaChiaveRecupero,
  normalizzaChiave,
  validaPin,
  calcolaBloccoPin,
  isSlotSblocco
} from '../../../src/main/domain/sblocco'

describe('generaChiaveRecupero', () => {
  it('produce 6 gruppi da 4 caratteri Crockford separati da -', () => {
    for (let i = 0; i < 50; i++) {
      const chiave = generaChiaveRecupero()
      expect(chiave).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/)
      const grezza = chiave.replace(/-/g, '')
      expect(grezza).toHaveLength(24)
      for (const c of grezza) expect(ALFABETO_CROCKFORD).toContain(c)
    }
  })

  it('genera chiavi diverse a ogni chiamata', () => {
    const chiavi = new Set(Array.from({ length: 20 }, () => generaChiaveRecupero()))
    expect(chiavi.size).toBe(20)
  })

  it('la chiave generata è già normalizzata a meno dei trattini', () => {
    const chiave = generaChiaveRecupero()
    expect(normalizzaChiave(chiave)).toBe(chiave.replace(/-/g, ''))
  })
})

describe('normalizzaChiave', () => {
  const valida = '7K3MQ9XA0123456789ABCDEF'

  it('ignora spazi, trattini e maiuscole/minuscole', () => {
    expect(normalizzaChiave('7k3m-q9xa 0123-4567 89ab-cdef')).toBe(valida)
    expect(normalizzaChiave('  7K3M Q9XA 0123 4567 89AB CDEF  ')).toBe(valida)
  })

  it('converte O in 0 e I/L in 1', () => {
    expect(normalizzaChiave('OOOO-IIII-LLLL-oooo-iiii-llll')).toBe('000011111111000011111111')
  })

  it('rifiuta lunghezze diverse da 24', () => {
    expect(normalizzaChiave('7K3M-Q9XA-0123-4567-89AB-CDE')).toBeNull()
    expect(normalizzaChiave('7K3M-Q9XA-0123-4567-89AB-CDEF0')).toBeNull()
    expect(normalizzaChiave('')).toBeNull()
  })

  it('rifiuta caratteri fuori dall’alfabeto (U, simboli)', () => {
    expect(normalizzaChiave('UK3M-Q9XA-0123-4567-89AB-CDEF')).toBeNull()
    expect(normalizzaChiave('7K3M-Q9XA-0123-4567-89AB-CDE!')).toBeNull()
    expect(normalizzaChiave('7K3M_Q9XA_0123_4567_89AB_CDEF')).toBeNull()
  })
})

describe('validaPin', () => {
  it('accetta esattamente 6 caratteri alfanumerici', () => {
    expect(validaPin('Gym24a')).toBe(true)
    expect(validaPin('000000')).toBe(true)
    expect(validaPin('abcDEF')).toBe(true)
  })

  it('rifiuta lunghezze diverse e caratteri non alfanumerici', () => {
    expect(validaPin('Gym24')).toBe(false)
    expect(validaPin('Gym24ab')).toBe(false)
    expect(validaPin('Gym 24')).toBe(false)
    expect(validaPin('Gym-24')).toBe(false)
    expect(validaPin('Gym24à')).toBe(false)
    expect(validaPin('')).toBe(false)
  })

  it('distingue maiuscole e minuscole (non normalizza)', () => {
    // Entrambi validi ma diversi: il segreto della KEK è il PIN così com'è
    expect(validaPin('Gym24a')).toBe(true)
    expect(validaPin('gym24a')).toBe(true)
    expect('Gym24a').not.toBe('gym24a')
  })
})

describe('calcolaBloccoPin', () => {
  const ora = new Date('2026-11-01T10:00:00.000Z')
  const minutiDi = (fino: string | null): number =>
    fino === null ? 0 : (new Date(fino).getTime() - ora.getTime()) / 60_000

  it('nessun blocco per 1-4 errori', () => {
    for (const errori of [1, 2, 3, 4]) {
      expect(calcolaBloccoPin(errori, ora)).toEqual({ bloccatoFino: null, disattiva: false })
    }
  })

  it('blocco di 1, 2, 4, 8, 16 minuti per 5-9 errori', () => {
    const attesi = [1, 2, 4, 8, 16]
    attesi.forEach((minuti, i) => {
      const r = calcolaBloccoPin(5 + i, ora)
      expect(r.disattiva).toBe(false)
      expect(minutiDi(r.bloccatoFino)).toBe(minuti)
    })
  })

  it('al 10° errore disattiva il PIN', () => {
    expect(calcolaBloccoPin(10, ora)).toEqual({ bloccatoFino: null, disattiva: true })
  })
})

describe('isSlotSblocco', () => {
  it('riconosce uno slot valido e rifiuta il resto', () => {
    expect(isSlotSblocco({ versione: 1, salt: 'a', dbKeyCifrata: 'b', kekCifrata: 'c' })).toBe(true)
    expect(isSlotSblocco({ versione: 2, salt: 'a', dbKeyCifrata: 'b', kekCifrata: 'c' })).toBe(false)
    expect(isSlotSblocco({ versione: 1, salt: 'a', dbKeyCifrata: 'b' })).toBe(false)
    expect(isSlotSblocco(null)).toBe(false)
    expect(isSlotSblocco('slot')).toBe(false)
  })
})
