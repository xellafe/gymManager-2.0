import { describe, it, expect } from 'vitest'
import {
  applicaBackspace,
  applicaDigitazione,
  applicaIncolla
} from '../../src/renderer/src/components/sicurezza/pin-caselle'

describe('applicaDigitazione', () => {
  it('scrive nella casella e avanza', () => {
    expect(applicaDigitazione('', 0, 'G')).toEqual({ valore: 'G', focus: 1 })
    expect(applicaDigitazione('Gy', 2, 'm')).toEqual({ valore: 'Gym', focus: 3 })
  })

  it('usa l ultimo carattere digitato', () => {
    expect(applicaDigitazione('G', 0, 'Gx')).toEqual({ valore: 'x', focus: 1 })
  })

  it('ignora i caratteri non alfanumerici', () => {
    expect(applicaDigitazione('Gy', 2, '-')).toEqual({ valore: 'Gy', focus: 2 })
    expect(applicaDigitazione('Gy', 2, ' ')).toEqual({ valore: 'Gy', focus: 2 })
    expect(applicaDigitazione('Gy', 2, 'è')).toEqual({ valore: 'Gy', focus: 2 })
    expect(applicaDigitazione('Gy', 2, '')).toEqual({ valore: 'Gy', focus: 2 })
  })

  it('non lascia buchi: una casella oltre la prima libera scrive nella prima libera', () => {
    expect(applicaDigitazione('Gy', 5, 'm')).toEqual({ valore: 'Gym', focus: 3 })
    expect(applicaDigitazione('', 3, '1')).toEqual({ valore: '1', focus: 1 })
  })

  it('sostituisce un carattere esistente', () => {
    expect(applicaDigitazione('Gym24a', 1, 'Z')).toEqual({ valore: 'GZm24a', focus: 2 })
  })

  it('il focus resta sulla sesta casella', () => {
    expect(applicaDigitazione('Gym24', 4, 'a')).toEqual({ valore: 'Gym2a', focus: 5 })
    expect(applicaDigitazione('Gym24', 5, 'a')).toEqual({ valore: 'Gym24a', focus: 5 })
    expect(applicaDigitazione('Gym24a', 5, 'b')).toEqual({ valore: 'Gym24b', focus: 5 })
  })
})

describe('applicaBackspace', () => {
  it('su casella piena la svuota con scorrimento a sinistra e focus fermo', () => {
    expect(applicaBackspace('Gym24a', 1)).toEqual({ valore: 'Gm24a', focus: 1 })
    expect(applicaBackspace('Gym', 2)).toEqual({ valore: 'Gy', focus: 2 })
  })

  it('su casella vuota cancella la precedente e vi sposta il focus', () => {
    expect(applicaBackspace('Gym', 3)).toEqual({ valore: 'Gy', focus: 2 })
    expect(applicaBackspace('Gym', 5)).toEqual({ valore: 'Gy', focus: 2 })
  })

  it('nessun effetto sulla prima casella vuota', () => {
    expect(applicaBackspace('', 0)).toEqual({ valore: '', focus: 0 })
    expect(applicaBackspace('', 3)).toEqual({ valore: '', focus: 0 })
  })
})

describe('applicaIncolla', () => {
  it('riempie tutte le caselle con un PIN valido', () => {
    expect(applicaIncolla('', 'Gym24a')).toEqual({ valore: 'Gym24a', focus: 5 })
    expect(applicaIncolla('ab', 'Gym24a')).toEqual({ valore: 'Gym24a', focus: 5 })
  })

  it('ignora gli spazi ai bordi', () => {
    expect(applicaIncolla('', '  Gym24a\n')).toEqual({ valore: 'Gym24a', focus: 5 })
  })

  it('ignora un testo non valido', () => {
    expect(applicaIncolla('Gy', 'Gym24')).toEqual({ valore: 'Gy', focus: 2 })
    expect(applicaIncolla('Gy', 'Gym24ab')).toEqual({ valore: 'Gy', focus: 2 })
    expect(applicaIncolla('Gy', 'Gym 4a')).toEqual({ valore: 'Gy', focus: 2 })
    expect(applicaIncolla('Gy', 'Gym-4a')).toEqual({ valore: 'Gy', focus: 2 })
  })
})
