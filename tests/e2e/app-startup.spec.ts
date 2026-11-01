/**
 * Test e2e — flusso Setup + sblocco app
 *
 * Prerequisiti per l'esecuzione reale:
 * - `npm run build:electron` completato
 * - Nessun DB esistente nella userData directory
 * - Ambiente grafico disponibile (non headless)
 *
 * Questi test sono marcati `test.skip` finche' non viene rimossa
 * la condizione manualmente. Eseguire con: npm run test:e2e
 */

import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/electron-app'
import type { ElectronApplication } from './helpers/electron-app'

test.describe('Setup e sblocco app', () => {
  let app: ElectronApplication | null = null

  test.afterEach(async () => {
    if (app) {
      await app.close()
      app = null
    }
  })

  test('prima apertura: pagina Setup appare e si imposta la master password', async () => {
    test.skip(true, 'Richiede Electron build e ambiente grafico — eseguire manualmente con npm run test:e2e')

    // Passo 1: lancia l'app in una directory temporanea senza DB esistente
    app = await launchApp()

    // Passo 2: attendi la prima finestra
    const window = await app.firstWindow()

    // Passo 3: verifica che la pagina Setup sia visibile
    // La pagina Setup contiene un campo per la master password
    await expect(window.locator('[data-testid="setup-form"]')).toBeVisible()

    // Passo 4: inserisce la password
    await window.locator('[data-testid="password-input"]').fill('TestPassword123!')
    await window.locator('[data-testid="password-confirm-input"]').fill('TestPassword123!')

    // Passo 5: conferma
    await window.locator('[data-testid="setup-submit"]').click()

    // Passo 6: compare la chiave di recupero: la chiusura è disabilitata finché non si conferma
    await expect(window.locator('[data-testid="chiave-recupero-modal"]')).toBeVisible()
    await expect(window.locator('[data-testid="chiave-recupero-chiudi"]')).toBeDisabled()
    await window.locator('[data-testid="chiave-recupero-conferma"]').check()
    await window.locator('[data-testid="chiave-recupero-chiudi"]').click()

    // Passo 7: passo PIN facoltativo, si salta
    await window.locator('[data-testid="pin-salta"]').click()

    // Passo 8: l'app si sblocca e mostra la dashboard
    await expect(window.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: 10000 })
  })

  test("apertura successiva: pagina Unlock appare, password corretta sblocca l'app", async () => {
    test.skip(true, 'Richiede Electron build e ambiente grafico — eseguire manualmente con npm run test:e2e')

    // Prerequisito: il DB esiste già (eseguire dopo il test di setup)

    // Passo 1: lancia l'app con DB esistente
    app = await launchApp()

    // Passo 2: attendi la prima finestra
    const window = await app.firstWindow()

    // Passo 3: verifica che la pagina Unlock sia visibile
    await expect(window.locator('[data-testid="unlock-form"]')).toBeVisible()

    // Passo 4: inserisce la password corretta
    await window.locator('[data-testid="password-input"]').fill('TestPassword123!')

    // Passo 5: conferma
    await window.locator('[data-testid="unlock-submit"]').click()

    // Passo 6: l'app si sblocca e mostra la dashboard
    await expect(window.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: 10000 })
  })

  test('password errata: messaggio di errore dedicato', async () => {
    test.skip(true, 'Richiede Electron build e ambiente grafico — eseguire manualmente con npm run test:e2e')

    // Prerequisito: il DB esiste già

    // Passo 1: lancia l'app con DB esistente
    app = await launchApp()
    const window = await app.firstWindow()

    // Passo 2: inserisce una password errata
    await window.locator('[data-testid="password-input"]').fill('PasswordSbagliata!')
    await window.locator('[data-testid="unlock-submit"]').click()

    // Passo 3: verifica che appaia un messaggio di errore
    await expect(window.locator('[data-testid="unlock-error"]')).toBeVisible()

    // Passo 4: la dashboard NON appare
    await expect(window.locator('[data-testid="dashboard"]')).not.toBeVisible()
  })
})
