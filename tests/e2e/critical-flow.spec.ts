/**
 * Test e2e — flussi critici (docs/TESTING.md)
 *
 * Prerequisiti per l'esecuzione reale:
 * - `npm run build:electron` completato
 * - Ambiente grafico disponibile (non headless)
 * - DB in stato pulito (usare directory temporanea)
 *
 * Questi test sono marcati `test.skip` finche' non viene rimossa
 * la condizione manualmente. Eseguire con: npm run test:e2e
 */

import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/electron-app'
import type { ElectronApplication } from './helpers/electron-app'

/**
 * Helper: sblocca l'app inserendo la master password.
 * Presuppone che il DB esista e la pagina Unlock sia visibile.
 * Se il DB non ha la chiave di recupero compare l'invito: si preme "Più tardi".
 */
async function unlockApp(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  password = 'TestPassword123!'
): Promise<void> {
  await window.locator('[data-testid="password-input"]').fill(password)
  await window.locator('[data-testid="unlock-submit"]').click()
  await expect(window.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: 10000 })
  const piuTardi = window.locator('[data-testid="invito-chiave-dopo"]')
  if (await piuTardi.isVisible({ timeout: 2000 }).catch(() => false)) {
    await piuTardi.click()
  }
}

test.describe('Flusso critico: crea cliente → iscrizione → abbonamento → ricevuta → backup', () => {
  let app: ElectronApplication | null = null

  test.afterEach(async () => {
    if (app) {
      await app.close()
      app = null
    }
  })

  test(
    'Test 1: crea cliente → assegna iscrizione → assegna abbonamento → emetti e salva ricevuta → ri-scarica (stesso numero) → backup',
    async () => {
      test.skip(true, 'Richiede Electron build e ambiente grafico — eseguire manualmente con npm run test:e2e')

      app = await launchApp()
      const window = await app.firstWindow()
      await unlockApp(window)

      // ── Passo 1: crea un nuovo cliente ─────────────────────────────────────
      await window.locator('[data-testid="nav-clienti"]').click()
      await window.locator('[data-testid="btn-nuovo-cliente"]').click()

      await window.locator('[data-testid="campo-nome"]').fill('Mario')
      await window.locator('[data-testid="campo-cognome"]').fill('Rossi')
      await window.locator('[data-testid="campo-codice-fiscale"]').fill('RSSMRA85T10H501Z')
      await window.locator('[data-testid="campo-data-nascita"]').fill('10/01/1985')
      await window.locator('[data-testid="btn-salva-cliente"]').click()

      // Verifica: il cliente appare nella lista
      await expect(window.locator('text=Mario Rossi')).toBeVisible()

      // ── Passo 2: assegna iscrizione ────────────────────────────────────────
      await window.locator('text=Mario Rossi').click()
      await window.locator('[data-testid="tab-iscrizioni"]').click()
      await window.locator('[data-testid="btn-nuova-iscrizione"]').click()

      // Seleziona tipo iscrizione e date
      await window.locator('[data-testid="select-tipo-iscrizione"]').selectOption({ index: 0 })
      await window.locator('[data-testid="campo-data-inizio-isc"]').fill('01/01/2025')
      await window.locator('[data-testid="campo-data-scadenza-isc"]').fill('31/12/2025')
      await window.locator('[data-testid="btn-salva-iscrizione"]').click()

      // Verifica: badge "attiva" visibile
      await expect(window.locator('[data-testid="badge-iscrizione-attiva"]')).toBeVisible()

      // ── Passo 3: assegna abbonamento ───────────────────────────────────────
      await window.locator('[data-testid="tab-abbonamenti"]').click()
      await window.locator('[data-testid="btn-nuovo-abbonamento"]').click()

      // Seleziona tipo abbonamento e date (entro scadenza iscrizione)
      await window.locator('[data-testid="select-tipo-abbonamento"]').selectOption({ index: 0 })
      await window.locator('[data-testid="campo-data-inizio-abb"]').fill('01/01/2025')
      await window.locator('[data-testid="campo-data-scadenza-abb"]').fill('31/01/2025')
      await window.locator('[data-testid="btn-salva-abbonamento"]').click()

      // Verifica: abbonamento visibile nella lista
      await expect(window.locator('[data-testid="lista-abbonamenti"]')).toBeVisible()

      // ── Passo 4: emetti e salva ricevuta ───────────────────────────────────
      await window.locator('[data-testid="tab-ricevute"]').click()
      await window.locator('[data-testid="btn-nuova-ricevuta"]').click()

      // Seleziona le voci pagabili (iscrizione + abbonamento)
      await window.locator('[data-testid="check-voce-iscrizione"]').check()
      await window.locator('[data-testid="check-voce-abbonamento"]').check()

      // Imposta data emissione e metodo pagamento
      await window.locator('[data-testid="campo-data-emissione"]').fill('15/03/2025')
      await window.locator('[data-testid="select-metodo-pagamento"]').selectOption('contanti')

      // Emetti la ricevuta
      await window.locator('[data-testid="btn-emetti-ricevuta"]').click()

      // Verifica: la ricevuta ha un numero assegnato
      const numeroRicevuta = await window.locator('[data-testid="numero-ricevuta"]').textContent()
      expect(numeroRicevuta).toBeTruthy()
      expect(Number(numeroRicevuta)).toBeGreaterThan(0)

      // ── Passo 5: ri-scarica — il numero deve essere lo stesso ──────────────
      const idRicevuta = await window.locator('[data-testid="ricevuta-id"]').getAttribute('data-id')
      await window.locator('[data-testid="btn-scarica-pdf"]').click()

      // Il numero della ricevuta non deve cambiare (ri-lettura dal DB)
      const numeroRidownload = await window.locator('[data-testid="numero-ricevuta"]').textContent()
      expect(numeroRidownload).toBe(numeroRicevuta)
      expect(idRicevuta).toBeTruthy()

      // ── Passo 6: backup ────────────────────────────────────────────────────
      await window.locator('[data-testid="nav-impostazioni"]').click()
      await window.locator('[data-testid="tab-backup"]').click()
      await window.locator('[data-testid="btn-backup-locale"]').click()

      // Verifica: messaggio di successo backup
      await expect(window.locator('[data-testid="backup-success"]')).toBeVisible({ timeout: 15000 })
    }
  )

  test(
    'Test 2: tentativo assegna abbonamento senza iscrizione attiva → bloccato/segnalato correttamente',
    async () => {
      test.skip(true, 'Richiede Electron build e ambiente grafico — eseguire manualmente con npm run test:e2e')

      app = await launchApp()
      const window = await app.firstWindow()
      await unlockApp(window)

      // ── Passo 1: crea un cliente senza iscrizione ──────────────────────────
      await window.locator('[data-testid="nav-clienti"]').click()
      await window.locator('[data-testid="btn-nuovo-cliente"]').click()

      await window.locator('[data-testid="campo-nome"]').fill('Luigi')
      await window.locator('[data-testid="campo-cognome"]').fill('Bianchi')
      await window.locator('[data-testid="campo-codice-fiscale"]').fill('BNCLGU90A01H501T')
      await window.locator('[data-testid="campo-data-nascita"]').fill('01/01/1990')
      await window.locator('[data-testid="btn-salva-cliente"]').click()

      await expect(window.locator('text=Luigi Bianchi')).toBeVisible()

      // ── Passo 2: tenta di assegnare un abbonamento senza iscrizione ────────
      await window.locator('text=Luigi Bianchi').click()
      await window.locator('[data-testid="tab-abbonamenti"]').click()
      await window.locator('[data-testid="btn-nuovo-abbonamento"]').click()

      // ── Passo 3: verifica che l'azione sia bloccata con messaggio ──────────
      // L'invariante 2 richiede che l'UI impedisca o segnali l'azione.
      // Il bottone potrebbe essere disabilitato, oppure appare un messaggio di errore.
      const bottoneDisabilitato = await window
        .locator('[data-testid="btn-nuovo-abbonamento"]')
        .isDisabled()

      const messaggioErrore = window.locator('[data-testid="errore-no-iscrizione"]')
      const erroreVisibile = await messaggioErrore.isVisible().catch(() => false)

      // Almeno una delle due condizioni deve essere vera
      expect(bottoneDisabilitato || erroreVisibile).toBe(true)

      // Se il form si apre comunque, il salvataggio deve fallire con errore
      if (!bottoneDisabilitato && !erroreVisibile) {
        await window.locator('[data-testid="select-tipo-abbonamento"]').selectOption({ index: 0 })
        await window.locator('[data-testid="btn-salva-abbonamento"]').click()

        // Deve apparire un messaggio di errore NESSUNA_ISCRIZIONE_ATTIVA
        await expect(window.locator('[data-testid="errore-salvataggio"]')).toBeVisible()
      }
    }
  )
})
