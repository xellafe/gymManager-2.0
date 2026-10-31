/**
 * Generazione HTML per le ricevute fiscali.
 * Logica pura — nessuna dipendenza da Node.js o Electron.
 * Importabile dai test senza mockare Electron.
 *
 * Invarianti rispettate (CLAUDE.md):
 *   5. Ricevute immutabili: il documento è generabile deterministicamente dal record salvato.
 *   6. Numerazione progressiva per anno: il numero formattato riflette anno+numero persistiti.
 */

import { formatImporto, formatDataIT, formatNumeroRicevuta } from './ricevuta-format'
import type { RicevutaConRighe } from '../../types/shared'

export { formatImporto, formatDataIT, formatNumeroRicevuta }

// ---------------------------------------------------------------------------
// Dimensioni del logo derivate dal formato della ricevuta
// ---------------------------------------------------------------------------

/**
 * Box di rendering del logo nell'intestazione della ricevuta (CSS `.logo`).
 * È la SORGENTE UNICA: il CSS viene generato a partire da queste costanti,
 * e il ridimensionamento del logo deve puntare allo stesso box.
 */
export const LOGO_BOX_WIDTH_PX = 120
export const LOGO_BOX_HEIGHT_PX = 64

/**
 * Fattore di scala per una stampa nitida sul box (≈288 DPI con DPR=3).
 * Oltre questo valore non si guadagna nitidezza percepibile, si aggiungono solo byte.
 */
export const LOGO_PRINT_SCALE = 3

/** Dimensione intrinseca massima consigliata del logo (box × scala di stampa). */
export const LOGO_MAX_WIDTH_PX = LOGO_BOX_WIDTH_PX * LOGO_PRINT_SCALE // 360
export const LOGO_MAX_HEIGHT_PX = LOGO_BOX_HEIGHT_PX * LOGO_PRINT_SCALE // 192

export interface ImpostazioniAttivitaSnapshot {
  ragione_sociale: string
  indirizzo: string
  codice_fiscale_piva: string
  /** Logo in formato base64 (es. data:image/png;base64,...) — opzionale */
  logo_base64?: string
  /** Dicitura a piè di ricevuta — opzionale; sovrascrive quella nella ricevuta */
  dicitura_pie_default?: string
}

// ---------------------------------------------------------------------------
// Generazione HTML
// ---------------------------------------------------------------------------

/**
 * Genera l'HTML completo per la ricevuta fiscale.
 *
 * Produce DUE copie nella stessa pagina (skill ricevuta-fiscale):
 *   1. "Copia cliente"
 *   2. "Copia matrice"
 * separate da una linea tratteggiata con testo "--- Tagliare ---".
 *
 * L'HTML è self-contained (CSS inline) e ottimizzato per la stampa A4.
 *
 * Layout compatto: le due copie stanno su una A4 fino a ~5 voci (con tutore e logo).
 * Fallback: se non stanno insieme, ogni `.copia` ha `break-inside: avoid` e quindi
 * si passa a una copia per pagina (la copia matrice va intera alla pagina successiva).
 */
export function generaHTMLRicevuta(
  ricevuta: RicevutaConRighe,
  impostazioniAttivita: ImpostazioniAttivitaSnapshot,
): string {
  const numeroFormattato = formatNumeroRicevuta(ricevuta.anno, ricevuta.numero)
  const dataEmissione = formatDataIT(ricevuta.data_emissione)

  // Intestatario: se presente tutore, la ricevuta è intestata al tutore
  const haTutore =
    ricevuta.tutore_nome !== null &&
    ricevuta.tutore_cognome !== null &&
    ricevuta.tutore_cf !== null

  const intestatarioNome = haTutore
    ? `${ricevuta.tutore_nome} ${ricevuta.tutore_cognome}`
    : `${ricevuta.intestatario_nome} ${ricevuta.intestatario_cognome}`

  const intestatarioCF = haTutore ? (ricevuta.tutore_cf as string) : ricevuta.intestatario_cf

  // Indirizzo intestatario: usa sempre intestatario_* (il repository salva già
  // i campi corretti: per i minori contiene l'indirizzo del tutore se fornito)
  const indirizzoParti: string[] = []
  const viaRef = ricevuta.intestatario_via
  const civicoRef = ricevuta.intestatario_civico
  const cittaRef = ricevuta.intestatario_citta
  const provRef = ricevuta.intestatario_provincia
  const capRef = ricevuta.intestatario_cap

  if (viaRef) {
    indirizzoParti.push(`${viaRef}${civicoRef ? ' ' + civicoRef : ''}`)
  }
  if (capRef || cittaRef || provRef) {
    const localita = [capRef, cittaRef, provRef ? `(${provRef})` : null]
      .filter(Boolean)
      .join(' ')
    indirizzoParti.push(localita)
  }
  const indirizzoIntestatario = indirizzoParti.join(', ')

  // Riga tutore aggiuntiva: mostra il CF del minore (assistito_cf), non quello del tutore
  const cfMinore = ricevuta.assistito_cf ?? ricevuta.intestatario_cf
  const rigaTutore = haTutore
    ? `<p class="tutore">Tutore di ${escapeHtml(cfMinore)}: ${escapeHtml(ricevuta.intestatario_nome)} ${escapeHtml(ricevuta.intestatario_cognome)}</p>`
    : ''

  // Dicitura a piè
  const dicitura = ricevuta.dicitura_pie ?? impostazioniAttivita.dicitura_pie_default ?? ''

  // Logo
  const logoHtml = impostazioniAttivita.logo_base64
    ? `<img src="${escapeAttr(impostazioniAttivita.logo_base64)}" alt="Logo" class="logo" />`
    : ''

  // Righe tabella
  const righeHtml = ricevuta.righe
    .map((r) => {
      const periodo =
        r.data_inizio && r.data_fine
          ? `${formatDataIT(r.data_inizio)} - ${formatDataIT(r.data_fine)}`
          : ''
      return `
        <tr>
          <td>${escapeHtml(r.descrizione)}</td>
          <td class="center">${escapeHtml(periodo)}</td>
          <td class="right">${escapeHtml(formatImporto(r.prezzo))}</td>
        </tr>`
    })
    .join('')

  const totaleFormattato = formatImporto(ricevuta.totale)

  const css = generaCSS()
  const corpo = generaCorpo({
    logoHtml,
    impostazioni: impostazioniAttivita,
    numeroFormattato,
    dataEmissione,
    intestatarioNome,
    intestatarioCF,
    indirizzoIntestatario,
    rigaTutore,
    righeHtml,
    totaleFormattato,
    dicitura,
  })

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ricevuta n. ${escapeHtml(numeroFormattato)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="copia">
    <div class="etichetta-copia">Copia cliente</div>
    ${corpo}
  </div>

  <div class="separatore">
    <span>&#x2014;&#x2014;&#x2014; Tagliare &#x2014;&#x2014;&#x2014;</span>
  </div>

  <div class="copia">
    <div class="etichetta-copia">Copia matrice</div>
    ${corpo}
  </div>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Utility interne
// ---------------------------------------------------------------------------

interface CorpoParams {
  logoHtml: string
  impostazioni: ImpostazioniAttivitaSnapshot
  numeroFormattato: string
  dataEmissione: string
  intestatarioNome: string
  intestatarioCF: string
  indirizzoIntestatario: string
  rigaTutore: string
  righeHtml: string
  totaleFormattato: string
  dicitura: string
}

function generaCorpo(p: CorpoParams): string {
  return `
    <div class="intestazione-attivita">
      ${p.logoHtml}
      <div class="dati-attivita">
        <strong>${escapeHtml(p.impostazioni.ragione_sociale)}</strong><br />
        ${escapeHtml(p.impostazioni.indirizzo)}<br />
        CF/P.IVA: ${escapeHtml(p.impostazioni.codice_fiscale_piva)}
      </div>
    </div>

    <div class="numero-data">
      <h1>Ricevuta n. ${escapeHtml(p.numeroFormattato)}</h1>
      <p>Data di emissione: <strong>${escapeHtml(p.dataEmissione)}</strong></p>
    </div>

    <div class="intestatario">
      <h2>Intestatario</h2>
      <p><strong>${escapeHtml(p.intestatarioNome)}</strong></p>
      <p>Codice fiscale: ${escapeHtml(p.intestatarioCF)}</p>
      ${p.indirizzoIntestatario ? `<p>${escapeHtml(p.indirizzoIntestatario)}</p>` : ''}
      ${p.rigaTutore}
    </div>

    <table class="voci">
      <thead>
        <tr>
          <th class="left">Attivit&agrave; / Voce</th>
          <th class="center">Periodo</th>
          <th class="right">Importo</th>
        </tr>
      </thead>
      <tbody>
        ${p.righeHtml}
      </tbody>
      <tfoot>
        <tr class="totale">
          <td colspan="2"><strong>TOTALE</strong></td>
          <td class="right"><strong>${escapeHtml(p.totaleFormattato)}</strong></td>
        </tr>
      </tfoot>
    </table>

    ${p.dicitura ? `<p class="dicitura-pie">${escapeHtml(p.dicitura)}</p>` : ''}`
}

function generaCSS(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      color: #1a1a1a;
      background: #fff;
      padding: 16px;
    }

    .copia {
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
      padding: 24px;
      border: 1px solid #ccc;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .etichetta-copia {
      text-align: right;
      font-size: 8pt;
      color: #666;
      margin-bottom: 4px;
      font-style: italic;
    }

    .intestazione-attivita {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 8px;
      border-bottom: 2px solid #333;
      padding-bottom: 6px;
    }

    .logo {
      max-height: ${LOGO_BOX_HEIGHT_PX}px;
      max-width: ${LOGO_BOX_WIDTH_PX}px;
      object-fit: contain;
    }

    .dati-attivita {
      line-height: 1.3;
    }

    .numero-data {
      margin: 6px 0;
    }

    .numero-data h1 {
      font-size: 12pt;
      margin-bottom: 2px;
    }

    .intestatario {
      margin: 6px 0;
      padding: 6px 8px;
      background: #f7f7f7;
      border-left: 3px solid #333;
    }

    .intestatario h2 {
      font-size: 10pt;
      margin-bottom: 2px;
      color: #444;
    }

    .intestatario p {
      line-height: 1.3;
    }

    .tutore {
      font-style: italic;
      color: #555;
    }

    .voci {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
    }

    .voci th,
    .voci td {
      border: 1px solid #aaa;
      padding: 3px 6px;
    }

    .voci thead {
      background: #e8e8e8;
      font-weight: bold;
    }

    .voci tfoot .totale {
      background: #f0f0f0;
    }

    .left { text-align: left; }
    .center { text-align: center; }
    .right { text-align: right; }

    .dicitura-pie {
      margin-top: 6px;
      font-size: 8pt;
      color: #555;
      border-top: 1px solid #ccc;
      padding-top: 4px;
    }

    .separatore {
      text-align: center;
      margin: 8px auto;
      max-width: 720px;
      border-top: 2px dashed #999;
      padding-top: 2px;
      font-size: 8pt;
      color: #888;
    }

    @media print {
      body { padding: 0; }
      .copia { border: none; padding: 8px 12px; }
      .separatore { border-color: #444; }
    }
  `
}

/** Escapa i caratteri HTML pericolosi nelle stringhe di testo. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escapa per attributi HTML (es. src dell'img). */
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}
