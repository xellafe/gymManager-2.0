// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SicurezzaSezione from '../../src/renderer/src/components/sicurezza/SicurezzaSezione'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SicurezzaSezione dentro una <form>', () => {
  let container: HTMLDivElement
  let root: Root
  const spia = vi.fn()

  beforeEach(async () => {
    spia.mockClear()
    ;(window as unknown as { api: unknown }).api = {
      sicurezza: {
        stato: vi.fn().mockResolvedValue({
          recuperoAttivo: false,
          pinAttivo: false,
          pinBloccatoFino: null,
          pinDisponibile: true
        })
      },
      settings: { get: vi.fn().mockResolvedValue({ pin_visibile: false }), set: vi.fn() }
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(
        React.createElement(
          'form',
          {
            onSubmit: (e: React.FormEvent) => {
              e.preventDefault()
              spia()
            }
          },
          React.createElement(SicurezzaSezione)
        )
      )
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it.each(['btn-pin-imposta', 'btn-genera-chiave'])(
    '%s: nessuna form annidata e submit non propagato',
    async (testId) => {
      const bottone = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
      expect(bottone).not.toBeNull()
      await act(async () => {
        bottone!.click()
      })
      expect(document.querySelectorAll('form form').length).toBe(0)
      const formDialog = Array.from(document.body.querySelectorAll('form')).find(
        (f) => !f.contains(bottone)
      )
      expect(formDialog).toBeDefined()
      await act(async () => {
        formDialog!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      expect(spia).not.toHaveBeenCalled()
    }
  )
})
