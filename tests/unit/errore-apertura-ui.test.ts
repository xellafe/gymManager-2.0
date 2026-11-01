// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '../../src/renderer/src/i18n'
import SetupPage from '../../src/renderer/src/pages/Setup'
import UnlockPage from '../../src/renderer/src/pages/Unlock'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MESSAGGIO = 'Impossibile decodificare i dati a causa di un errore interno'
const rifiuto = (canale: string, codice: string): Error =>
  new Error(`Error invoking remote method '${canale}': Error: ${codice}`)

function scrivi(input: HTMLInputElement, valore: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, valore)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const q = <T extends Element>(testId: string): T | null =>
  document.querySelector<T>(`[data-testid="${testId}"]`)

async function inviaForm(testId: string): Promise<void> {
  await act(async () => {
    q(testId)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('errore tecnico di apertura del database (UI)', () => {
  let container: HTMLDivElement
  let root: Root
  let api: {
    db: Record<string, ReturnType<typeof vi.fn>>
    sicurezza: Record<string, ReturnType<typeof vi.fn>>
    settings: Record<string, ReturnType<typeof vi.fn>>
    backup: Record<string, ReturnType<typeof vi.fn>>
  }

  async function monta(el: React.ReactElement): Promise<void> {
    await act(async () => {
      root.render(el)
    })
  }

  beforeEach(() => {
    api = {
      db: {
        setup: vi.fn(),
        unlock: vi.fn(),
        unlockPin: vi.fn(),
        unlockRecupero: vi.fn()
      },
      sicurezza: {
        stato: vi.fn().mockResolvedValue({
          recuperoAttivo: true,
          pinAttivo: true,
          pinBloccatoFino: null,
          pinDisponibile: true
        })
      },
      settings: { get: vi.fn().mockResolvedValue({ pin_visibile: true }) },
      backup: { listLocale: vi.fn().mockResolvedValue([]) }
    }
    ;(window as unknown as { api: unknown }).api = api
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('Setup: DB_APERTURA_FALLITA mostra il messaggio dedicato', async () => {
    api.db.setup.mockRejectedValue(rifiuto('db:setup', 'DB_APERTURA_FALLITA'))
    await monta(React.createElement(SetupPage, { onReady: vi.fn() }))
    await act(async () => {
      scrivi(q<HTMLInputElement>('password-input')!, 'password123')
      scrivi(q<HTMLInputElement>('password-confirm-input')!, 'password123')
    })
    await inviaForm('setup-form')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(MESSAGGIO)
  })

  it('Setup: altri errori restano setup.error', async () => {
    api.db.setup.mockRejectedValue(rifiuto('db:setup', 'ALTRO'))
    await monta(React.createElement(SetupPage, { onReady: vi.fn() }))
    await act(async () => {
      scrivi(q<HTMLInputElement>('password-input')!, 'password123')
      scrivi(q<HTMLInputElement>('password-confirm-input')!, 'password123')
    })
    await inviaForm('setup-form')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Errore durante la configurazione. Riprova.'
    )
  })

  it('Unlock con PIN: messaggio dedicato, caselle svuotate, nessun pannello di ripristino; poi password', async () => {
    api.db.unlockPin.mockRejectedValue(rifiuto('db:unlockPin', 'DB_APERTURA_FALLITA'))
    api.db.unlock.mockRejectedValue(rifiuto('db:unlock', 'DB_APERTURA_FALLITA'))
    await monta(React.createElement(UnlockPage, { onReady: vi.fn() }))
    expect(q('unlock-pin-form')).not.toBeNull()

    for (let i = 1; i <= 6; i++) {
      await act(async () => {
        scrivi(q<HTMLInputElement>(`pin-input-${i}`)!, String(i))
      })
    }
    expect(api.db.unlockPin).toHaveBeenCalledWith('123456')
    expect(q('unlock-error')?.textContent).toBe(MESSAGGIO)
    expect(q('recovery-panel')).toBeNull()
    expect(q('unlock-pin-form')).not.toBeNull()
    for (let i = 1; i <= 6; i++) {
      expect(q<HTMLInputElement>(`pin-input-${i}`)!.value).toBe('')
    }

    await act(async () => {
      q<HTMLButtonElement>('usa-password')!.click()
    })
    await act(async () => {
      scrivi(q<HTMLInputElement>('password-input')!, 'password123')
    })
    await inviaForm('unlock-form')
    expect(q('unlock-error')?.textContent).toBe(MESSAGGIO)
    expect(q('recovery-panel')).toBeNull()
    expect(q<HTMLButtonElement>('unlock-submit')!.disabled).toBe(false)
  })

  it('Unlock con chiave di recupero: messaggio dedicato', async () => {
    api.db.unlockRecupero.mockRejectedValue(rifiuto('db:unlockRecupero', 'DB_APERTURA_FALLITA'))
    await monta(React.createElement(UnlockPage, { onReady: vi.fn() }))
    await act(async () => {
      q<HTMLButtonElement>('usa-password')!.click()
    })
    await act(async () => {
      q<HTMLButtonElement>('password-dimenticata')!.click()
    })
    await act(async () => {
      scrivi(q<HTMLInputElement>('chiave-input')!, 'AAAA-BBBB')
    })
    await act(async () => {
      document
        .querySelector('[data-testid="unlock-recupero"] form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(q('unlock-error')?.textContent).toBe(MESSAGGIO)
    expect(q('recovery-panel')).toBeNull()
  })

  it('Unlock: password errata resta il messaggio di oggi', async () => {
    api.sicurezza.stato.mockResolvedValue({
      recuperoAttivo: false,
      pinAttivo: false,
      pinBloccatoFino: null,
      pinDisponibile: true
    })
    api.db.unlock.mockRejectedValue(rifiuto('db:unlock', 'Password errata'))
    await monta(React.createElement(UnlockPage, { onReady: vi.fn() }))
    await act(async () => {
      scrivi(q<HTMLInputElement>('password-input')!, 'sbagliata1')
    })
    await inviaForm('unlock-form')
    expect(q('unlock-error')?.textContent).toBe('Password errata. Riprova.')
  })

  it('Unlock: MIGRATION_FAILED mostra il messaggio di migrazione e il pannello di ripristino', async () => {
    api.sicurezza.stato.mockResolvedValue({
      recuperoAttivo: false,
      pinAttivo: false,
      pinBloccatoFino: null,
      pinDisponibile: true
    })
    api.db.unlock.mockRejectedValue(rifiuto('db:unlock', 'MIGRATION_FAILED'))
    await monta(React.createElement(UnlockPage, { onReady: vi.fn() }))
    await act(async () => {
      scrivi(q<HTMLInputElement>('password-input')!, 'password123')
    })
    await inviaForm('unlock-form')
    expect(q('recovery-panel')).not.toBeNull()
    expect(q('recovery-panel')?.textContent).toContain(i18n.t('unlock.recovery_titolo'))
    expect(document.body.textContent).not.toContain(MESSAGGIO)
  })
})
