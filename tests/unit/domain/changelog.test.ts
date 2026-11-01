import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parseChangelog,
  parseSegmenti,
  confrontaVersioni,
  selezionaNovita
} from '../../../src/main/domain/changelog'
import type { VoceChangelog } from '../../../src/types/shared'

const MD = `# Changelog

Intro ignorata.

## [0.1.12] — 2026-11-01

### Aggiunto
- **Cartella** ricevute con \`codice\`

> Nota *importante*

Paragrafo semplice

## [0.1.11] — 2026-07-22

### Corretto
- Fix

## [0.1.3] e precedenti

- vecchia voce ignorata

## [0.1.2]

- senza data

[0.1.12]: https://example.com/0.1.12
[0.1.11]: https://example.com/0.1.11
`

function voce(versione: string): VoceChangelog {
  return { versione, data: '', blocchi: [] }
}

describe('parseChangelog', () => {
  it('estrae versione e data gg/mm/aaaa e ignora intestazioni non x.y.z e link', () => {
    const voci = parseChangelog(MD)
    expect(voci.map((v) => v.versione)).toEqual(['0.1.12', '0.1.11', '0.1.2'])
    expect(voci[0].data).toBe('01/11/2026')
    expect(voci[2].data).toBe('')
    const testi = JSON.stringify(voci)
    expect(testi).not.toContain('vecchia voce')
    expect(testi).not.toContain('example.com')
  })

  it('classifica titolo, voce e paragrafo (anche righe >)', () => {
    const [v] = parseChangelog(MD)
    expect(v.blocchi.map((b) => b.tipo)).toEqual(['titolo', 'voce', 'paragrafo', 'paragrafo'])
    expect(v.blocchi[2].segmenti).toEqual([
      { tipo: 'testo', testo: 'Nota ' },
      { tipo: 'corsivo', testo: 'importante' }
    ])
    expect(v.blocchi[1].segmenti).toEqual([
      { tipo: 'grassetto', testo: 'Cartella' },
      { tipo: 'testo', testo: ' ricevute con ' },
      { tipo: 'codice', testo: 'codice' }
    ])
  })

  it('applicato al CHANGELOG.md reale restituisce la 0.1.12 con i gruppi attesi', () => {
    const md = readFileSync(join(__dirname, '../../../CHANGELOG.md'), 'utf-8')
    const voci = parseChangelog(md)
    const v = voci.find((x) => x.versione === '0.1.12')
    expect(v).toBeDefined()
    expect(v?.data).toBe('01/11/2026')
    const titoli = v?.blocchi
      .filter((b) => b.tipo === 'titolo')
      .map((b) => b.segmenti.map((s) => s.testo).join(''))
    expect(titoli).toEqual(['Aggiunto', 'Modificato', 'Corretto'])
    expect(voci.some((x) => x.versione.includes('precedenti'))).toBe(false)
  })
})

describe('parseSegmenti', () => {
  it('un marcatore non chiuso resta testo', () => {
    expect(parseSegmenti('a **b')).toEqual([{ tipo: 'testo', testo: 'a **b' }])
    expect(parseSegmenti('x `y')).toEqual([{ tipo: 'testo', testo: 'x `y' }])
    expect(parseSegmenti('x *y')).toEqual([{ tipo: 'testo', testo: 'x *y' }])
  })

  it('riconosce grassetto, corsivo e codice', () => {
    expect(parseSegmenti('**a** *b* `c`')).toEqual([
      { tipo: 'grassetto', testo: 'a' },
      { tipo: 'testo', testo: ' ' },
      { tipo: 'corsivo', testo: 'b' },
      { tipo: 'testo', testo: ' ' },
      { tipo: 'codice', testo: 'c' }
    ])
  })
})

describe('confrontaVersioni', () => {
  it('confronta numericamente', () => {
    expect(confrontaVersioni('0.1.9', '0.1.10')).toBe(-1)
    expect(confrontaVersioni('0.1.10', '0.1.10')).toBe(0)
    expect(confrontaVersioni('1.0.0', '0.9.9')).toBe(1)
  })
})

describe('selezionaNovita', () => {
  const voci = ['0.1.10', '0.1.11', '0.1.12'].map(voce)

  it('precedente 0.1.10 e corrente 0.1.12: 0.1.12 e 0.1.11', () => {
    expect(selezionaNovita(voci, '0.1.12', '0.1.10').map((v) => v.versione)).toEqual([
      '0.1.12',
      '0.1.11'
    ])
  })
  it('precedente null: solo la corrente', () => {
    expect(selezionaNovita(voci, '0.1.12', null).map((v) => v.versione)).toEqual(['0.1.12'])
  })
  it('precedente uguale o maggiore della corrente: nulla', () => {
    expect(selezionaNovita(voci, '0.1.12', '0.1.12')).toEqual([])
    expect(selezionaNovita(voci, '0.1.11', '0.1.12')).toEqual([])
  })
  it('esclude versioni oltre la corrente', () => {
    expect(selezionaNovita(voci, '0.1.11', '0.1.10').map((v) => v.versione)).toEqual(['0.1.11'])
  })
})
