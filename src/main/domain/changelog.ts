import type {
  BloccoChangelog,
  SegmentoChangelog,
  TipoBloccoChangelog,
  VoceChangelog
} from '../../types/shared'
import { formatDataIT } from './ricevuta-format'

const RE_INTESTAZIONE = /^##\s+\[(\d+)\.(\d+)\.(\d+)\](?:\s+—\s+(\d{4}-\d{2}-\d{2}))?\s*$/
const RE_DEFINIZIONE_LINK = /^\[[^\]]+\]:\s*\S+/
const RE_VERSIONE = /^\d+\.\d+\.\d+$/

/** Verifica il formato x.y.z (solo numeri). */
export function isVersioneValida(v: string): boolean {
  return RE_VERSIONE.test(v)
}

/** Confronto numerico di due versioni x.y.z: -1, 0, 1. */
export function confrontaVersioni(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

const MARCATORI: { apertura: string; tipo: Exclude<SegmentoChangelog['tipo'], 'testo'> }[] = [
  { apertura: '**', tipo: 'grassetto' },
  { apertura: '*', tipo: 'corsivo' },
  { apertura: '`', tipo: 'codice' }
]

/** Scompone una riga in segmenti testo/grassetto/corsivo/codice (nessun annidamento). */
export function parseSegmenti(riga: string): SegmentoChangelog[] {
  const segmenti: SegmentoChangelog[] = []
  let testo = ''
  const chiudiTesto = (): void => {
    if (testo.length > 0) {
      segmenti.push({ tipo: 'testo', testo })
      testo = ''
    }
  }
  let i = 0
  while (i < riga.length) {
    let consumato = false
    for (const { apertura, tipo } of MARCATORI) {
      if (!riga.startsWith(apertura, i)) continue
      const inizio = i + apertura.length
      const fine = riga.indexOf(apertura, inizio)
      if (fine > inizio) {
        chiudiTesto()
        segmenti.push({ tipo, testo: riga.slice(inizio, fine) })
        i = fine + apertura.length
        consumato = true
      }
      break
    }
    if (!consumato) {
      testo += riga[i]
      i++
    }
  }
  chiudiTesto()
  return segmenti
}

function creaBlocco(tipo: TipoBloccoChangelog, testo: string): BloccoChangelog {
  return { tipo, segmenti: parseSegmenti(testo) }
}

function parseRiga(riga: string): BloccoChangelog {
  if (riga.startsWith('### ')) return creaBlocco('titolo', riga.slice(4).trim())
  if (riga.startsWith('- ')) return creaBlocco('voce', riga.slice(2).trim())
  if (riga.startsWith('> ')) return creaBlocco('paragrafo', riga.slice(2).trim())
  return creaBlocco('paragrafo', riga)
}

/** Estrae le versioni dal markdown del changelog (`## [x.y.z] — aaaa-mm-gg`). */
export function parseChangelog(md: string): VoceChangelog[] {
  const voci: VoceChangelog[] = []
  let corrente: VoceChangelog | null = null

  for (const grezza of md.split(/\r?\n/)) {
    const riga = grezza.trim()
    if (riga.startsWith('## ')) {
      const m = RE_INTESTAZIONE.exec(riga)
      if (m) {
        corrente = {
          versione: `${m[1]}.${m[2]}.${m[3]}`,
          data: m[4] ? formatDataIT(m[4]) : '',
          blocchi: []
        }
        voci.push(corrente)
      } else {
        corrente = null
      }
      continue
    }
    if (!corrente || riga === '' || RE_DEFINIZIONE_LINK.test(riga)) continue
    const blocco = parseRiga(riga)
    if (blocco.segmenti.length > 0) corrente.blocchi.push(blocco)
  }
  return voci
}

/**
 * Voci da mostrare: con `precedente` nullo solo quella della versione corrente, altrimenti quelle
 * con `precedente < versione <= corrente`. Ordine decrescente per versione.
 */
export function selezionaNovita(
  voci: VoceChangelog[],
  corrente: string,
  precedente: string | null
): VoceChangelog[] {
  return voci
    .filter((v) =>
      precedente === null
        ? v.versione === corrente
        : confrontaVersioni(v.versione, precedente) > 0 &&
          confrontaVersioni(v.versione, corrente) <= 0
    )
    .sort((a, b) => confrontaVersioni(b.versione, a.versione))
}
