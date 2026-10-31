/**
 * Test unitari per generaHTMLRicevuta in src/main/domain/ricevuta.ts
 * Verifica la struttura dell'HTML generato per le ricevute fiscali.
 */

import { describe, it, expect } from 'vitest'
import { generaHTMLRicevuta } from '../../../src/main/domain/ricevuta'
import type { ImpostazioniAttivitaSnapshot } from '../../../src/main/domain/ricevuta'
import type { RicevutaConRighe } from '../../../src/types/shared'

// ---------------------------------------------------------------------------
// Stub dati
// ---------------------------------------------------------------------------

const impostazioni: ImpostazioniAttivitaSnapshot = {
  ragione_sociale: 'Palestra Test S.r.l.',
  indirizzo: 'Via Roma 1, 20100 Milano (MI)',
  codice_fiscale_piva: 'IT01234567890',
  dicitura_pie_default: 'Importo comprensivo di IVA.',
}

const ricevutaBase: RicevutaConRighe = {
  id: 1,
  numero: 1,
  anno: 2025,
  data_emissione: '2025-03-15',
  cliente_id: 10,
  intestatario_nome: 'Mario',
  intestatario_cognome: 'Rossi',
  intestatario_cf: 'RSSMRA80A01H501A',
  intestatario_via: 'Via Garibaldi',
  intestatario_civico: '42',
  intestatario_citta: 'Roma',
  intestatario_provincia: 'RM',
  intestatario_cap: '00100',
  tutore_nome: null,
  tutore_cognome: null,
  tutore_cf: null,
  totale: 120,
  metodo_pagamento: 'contanti',
  stato_pagamento: 'pagato',
  dicitura_pie: null,
  stato: 'emessa',
  data_annullamento: null,
  data_emissione_sistema: '2025-03-15T10:00:00',
  righe: [
    {
      id: 1,
      ricevuta_id: 1,
      tipo: 'iscrizione',
      riferimento_id: 5,
      descrizione: 'Tesseramento annuale',
      data_inizio: '2025-01-01',
      data_fine: '2025-12-31',
      prezzo: 50,
      ordine: 0,
    },
    {
      id: 2,
      ricevuta_id: 1,
      tipo: 'abbonamento',
      riferimento_id: 7,
      descrizione: 'Sala pesi',
      data_inizio: '2025-03-01',
      data_fine: '2025-05-31',
      prezzo: 70,
      ordine: 1,
    },
  ],
}

const ricevutaConTutore: RicevutaConRighe = {
  ...ricevutaBase,
  id: 2,
  numero: 2,
  intestatario_nome: 'Luca',
  intestatario_cognome: 'Bianchi',
  intestatario_cf: 'BNCLCU10A01H501B',
  tutore_nome: 'Anna',
  tutore_cognome: 'Bianchi',
  tutore_cf: 'BNCNNA75B45H501C',
  righe: [
    {
      id: 3,
      ricevuta_id: 2,
      tipo: 'iscrizione',
      riferimento_id: 8,
      descrizione: 'Tesseramento annuale',
      data_inizio: '2025-01-01',
      data_fine: '2025-12-31',
      prezzo: 50,
      ordine: 0,
    },
  ],
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('generaHTMLRicevuta — struttura base', () => {
  const html = generaHTMLRicevuta(ricevutaBase, impostazioni)

  it('contiene il numero ricevuta formattato', () => {
    expect(html).toContain('Ricevuta n. 2025-1')
  })

  it('contiene il nome intestatario', () => {
    expect(html).toContain('Mario')
    expect(html).toContain('Rossi')
  })

  it('contiene la data di emissione in formato italiano', () => {
    expect(html).toContain('15/03/2025')
  })

  it('contiene "Copia cliente" come etichetta prima copia', () => {
    expect(html).toContain('Copia cliente')
  })

  it('contiene "Copia matrice" come etichetta seconda copia', () => {
    expect(html).toContain('Copia matrice')
  })

  it('contiene la linea di taglio tra le due copie', () => {
    expect(html).toContain('Tagliare')
  })

  it('contiene il totale in formato italiano', () => {
    // 120 euro → "120,00 €"
    expect(html).toContain('120,00')
  })

  it('contiene le descrizioni delle righe', () => {
    expect(html).toContain('Tesseramento annuale')
    expect(html).toContain('Sala pesi')
  })

  it('contiene i periodi delle righe in formato gg/mm/aaaa', () => {
    // riga 1: 2025-01-01 - 2025-12-31
    expect(html).toContain('01/01/2025')
    expect(html).toContain('31/12/2025')
  })

  it('contiene i dati attività in intestazione', () => {
    expect(html).toContain('Palestra Test S.r.l.')
    expect(html).toContain('IT01234567890')
  })

  it('non contiene "codice univoco"', () => {
    expect(html.toLowerCase()).not.toContain('codice univoco')
  })

  it('contiene la dicitura a piè di default', () => {
    expect(html).toContain('Importo comprensivo di IVA.')
  })
})

describe('generaHTMLRicevuta — con tutore (minore)', () => {
  const html = generaHTMLRicevuta(ricevutaConTutore, impostazioni)

  it('contiene "Tutore di" con il CF del minore', () => {
    expect(html).toContain('Tutore di')
    expect(html).toContain('BNCLCU10A01H501B')
  })

  it('intestazione al tutore: nome tutore presente', () => {
    expect(html).toContain('Anna')
    expect(html).toContain('Bianchi')
  })

  it('contiene il CF del tutore', () => {
    expect(html).toContain('BNCNNA75B45H501C')
  })
})

describe('generaHTMLRicevuta — dicitura piè personalizzata nella ricevuta', () => {
  it('usa la dicitura della ricevuta se presente, non quella di default', () => {
    const ricevutaCustomDicitura: RicevutaConRighe = {
      ...ricevutaBase,
      dicitura_pie: 'Pagamento ricevuto in contanti.',
    }
    const html = generaHTMLRicevuta(ricevutaCustomDicitura, impostazioni)
    expect(html).toContain('Pagamento ricevuto in contanti.')
  })
})

describe('generaHTMLRicevuta — riga senza periodo', () => {
  it('non genera testo di periodo se data_inizio e data_fine sono null', () => {
    const ricevutaRigaLibera: RicevutaConRighe = {
      ...ricevutaBase,
      righe: [
        {
          id: 4,
          ricevuta_id: 1,
          tipo: 'libera',
          riferimento_id: null,
          descrizione: 'Quota una tantum',
          data_inizio: null,
          data_fine: null,
          prezzo: 25,
          ordine: 0,
        },
      ],
    }
    const html = generaHTMLRicevuta(ricevutaRigaLibera, impostazioni)
    expect(html).toContain('Quota una tantum')
    // Il campo periodo deve essere vuoto (cella vuota nella tabella)
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('null')
  })
})

describe('generaHTMLRicevuta — layout compatto (tutore + logo + 5 voci)', () => {
  const righe = Array.from({ length: 5 }, (_, i) => ({
    id: 100 + i,
    ricevuta_id: 2,
    tipo: 'abbonamento' as const,
    riferimento_id: 20 + i,
    descrizione: `Voce ${i + 1}`,
    data_inizio: '2025-03-01',
    data_fine: '2025-05-31',
    prezzo: 1234.56,
    ordine: i,
  }))
  const ricevuta: RicevutaConRighe = { ...ricevutaConTutore, righe, totale: 6172.8 }
  const html = generaHTMLRicevuta(ricevuta, {
    ...impostazioni,
    logo_base64: 'data:image/png;base64,AAAA',
  })

  it('usa font e spaziature compatti', () => {
    expect(html).toMatch(/body \{[^}]*font-size: 10pt;/)
    expect(html).toMatch(/\.numero-data h1 \{[^}]*font-size: 12pt;/)
    expect(html).toMatch(/\.dicitura-pie \{[^}]*font-size: 8pt;/)
    expect(html).toMatch(/\.voci th,\s*\.voci td \{[^}]*padding: 3px 6px;/)
    expect(html).toMatch(/@media print \{[\s\S]*\.copia \{ border: none; padding: 8px 12px; \}/)
  })

  it('impedisce di spezzare una copia tra due pagine', () => {
    expect(html).toMatch(/\.copia \{[^}]*break-inside: avoid;[^}]*page-break-inside: avoid;/)
  })

  it('mantiene contenuto, importi e date invariati', () => {
    expect(html).toContain('Ricevuta n. 2025-2')
    expect(html).toContain('BNCNNA75B45H501C')
    expect(html).toContain('Tutore di BNCLCU10A01H501B')
    expect(html).toContain('Voce 5')
    expect(html.match(/1\.234,56/g)?.length).toBe(10)
    expect(html.match(/01\/03\/2025 - 31\/05\/2025/g)?.length).toBe(10)
    expect(html).toContain('Importo comprensivo di IVA.')
  })
})
