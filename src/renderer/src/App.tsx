import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import { applyTheme, applyPrimaryColor } from './theme'
import SetupPage from './pages/Setup'
import UnlockPage from './pages/Unlock'
import NuovaPasswordRecuperoPage from './pages/NuovaPasswordRecupero'
import ShellPage from './pages/Shell'
import SyncBanner from './components/sync/SyncBanner'
import SyncConflictDialog from './components/sync/SyncConflictDialog'

type AppState = 'loading' | 'firstRun' | 'locked' | 'ready' | 'recupero'

export default function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [appState, setAppState] = useState<AppState>('loading')
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** Avvia o riavvia il timer di polling (solo se sync abilitato). */
  function startPolling(pollingSec: number): void {
    if (pollingTimerRef.current !== null) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
    if (pollingSec <= 0) return
    pollingTimerRef.current = setInterval(() => {
      void window.api.sync.check().catch(() => { /* non bloccante */ })
    }, pollingSec * 1000)
  }

  function stopPolling(): void {
    if (pollingTimerRef.current !== null) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
  }

  /** Rilegge lo stato del DB (dopo setup, sblocco o recupero). */
  async function rileggiStato(): Promise<void> {
    try {
      const { state } = await window.api.db.getState()
      setAppState(state)
    } catch {
      setAppState('locked')
    }
  }

  useEffect(() => {
    async function init(): Promise<void> {
      try {
        // Carica le impostazioni e applica il tema prima di mostrare l'UI
        const settings = await window.api.settings.get()
        applyTheme(settings.theme)
        if (settings.primaryColor) {
          applyPrimaryColor(settings.primaryColor)
        }
        // Sincronizza la lingua con le impostazioni salvate
        if (settings.language && settings.language !== i18n.language) {
          await i18n.changeLanguage(settings.language)
        }

        // Determina lo stato iniziale del DB
        const { state } = await window.api.db.getState()
        setAppState(state)
      } catch {
        // In caso di errore mostra comunque lo schermo di sblocco (stato più sicuro)
        setAppState('locked')
      }
    }

    // Ascolta i cambi di preferenza sistema per il tema system
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (): void => {
      window.api.settings.get().then((s) => {
        if (s.theme === 'system') applyTheme('system')
      })
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)

    void init()

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
  }, [])

  // Avvia il polling sync una volta che l'app è pronta
  useEffect(() => {
    if (appState !== 'ready') return

    async function initPolling(): Promise<void> {
      try {
        const status = await window.api.sync.status()
        if (status.enabled) {
          startPolling(status.pollingSec ?? 60)
        }
      } catch {
        // non bloccante
      }
    }

    void initPolling()

    // Ri-legge lo stato e riavvia il timer quando il sync viene abilitato/disabilitato
    // o l'intervallo cambia da Impostazioni (evento emesso da SettingsPage).
    const handleConfigChanged = (): void => {
      window.api.sync.status().then((s) => {
        if (s.enabled) {
          startPolling(s.pollingSec ?? 60)
        } else {
          stopPolling()
        }
      }).catch(() => { /* non bloccante */ })
    }
    window.addEventListener('gm:sync-config-changed', handleConfigChanged)

    // check() su focus della finestra
    const handleWindowFocus = (): void => {
      window.api.sync.status().then((s) => {
        if (s.enabled) {
          void window.api.sync.check().catch(() => { /* non bloccante */ })
        }
      }).catch(() => { /* non bloccante */ })
    }
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      window.removeEventListener('gm:sync-config-changed', handleConfigChanged)
      window.removeEventListener('focus', handleWindowFocus)
      stopPolling()
    }
  }, [appState])

  if (appState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface gap-4">
        <div
          className="w-10 h-10 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin"
          role="status"
          aria-label={t('app.loading')}
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">{t('app.loading')}</span>
      </div>
    )
  }

  if (appState === 'firstRun') {
    return <SetupPage onReady={() => void rileggiStato()} />
  }

  if (appState === 'locked') {
    return <UnlockPage onReady={() => void rileggiStato()} />
  }

  if (appState === 'recupero') {
    return <NuovaPasswordRecuperoPage onReady={() => void rileggiStato()} />
  }

  return (
    <>
      <ShellPage />
      <SyncBanner />
      <SyncConflictDialog />
    </>
  )
}
