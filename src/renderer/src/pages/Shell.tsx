import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsProvider } from '../context/SettingsContext'
import DashboardPage from './DashboardPage'
import ClientsPage from './ClientsPage'
import CatalogoPage from './CatalogoPage'
import ReceiptsPage from './ReceiptsPage'
import SettingsPage from './SettingsPage'
import UpdateNotification from '../components/updater/UpdateNotification'
import UpdateCheckSnackbar from '../components/updater/UpdateCheckSnackbar'
import ChangelogModal from '../components/ChangelogModal'
import GeneraChiaveDialog from '../components/sicurezza/GeneraChiaveDialog'
import type { ClientiFilters, VoceChangelog } from '../../../types/shared'

type NavItem = 'dashboard' | 'clients' | 'catalog' | 'receipts' | 'settings'

interface NavLinkProps {
  id: NavItem
  active: boolean
  icon: React.ReactNode
  label: string
  testId?: string
  onClick: (id: NavItem) => void
}

function NavLink({ id, active, icon, label, testId, onClick }: NavLinkProps): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onClick(id)}
      aria-current={active ? 'page' : undefined}
      className={[
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
        active
          ? 'bg-primary-600 text-white'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
      ].join(' ')}
    >
      <span className="shrink-0 w-5 h-5">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

const DashboardIcon = (): React.JSX.Element => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
    />
  </svg>
)

const ClientsIcon = (): React.JSX.Element => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
    />
  </svg>
)

const CatalogIcon = (): React.JSX.Element => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
    />
  </svg>
)

const ReceiptsIcon = (): React.JSX.Element => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    />
  </svg>
)

const SettingsIcon = (): React.JSX.Element => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const AppLogoIcon = (): React.JSX.Element => (
  <svg
    className="w-6 h-6 text-white"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
    />
  </svg>
)

interface ReceiptsFilter {
  stato_pagamento?: 'pagato' | 'da_incassare'
}

export default function ShellPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [activeNav, setActiveNav] = useState<NavItem>('dashboard')
  const [clientFilter, setClientFilter] = useState<ClientiFilters | undefined>(undefined)
  const [receiptsFilter, setReceiptsFilter] = useState<ReceiptsFilter | undefined>(undefined)
  const [novita, setNovita] = useState<VoceChangelog[]>([])
  const [novitaAperte, setNovitaAperte] = useState(false)
  const [novitaCaricate, setNovitaCaricate] = useState(false)
  const [invitoNecessario, setInvitoNecessario] = useState(false)
  const [invitoChiuso, setInvitoChiuso] = useState(false)

  // Novità non ancora viste: errori ignorati (nessun modale, riproverà al prossimo avvio)
  useEffect(() => {
    void window.api.changelog
      .getPending()
      .then((voci) => {
        if (voci.length > 0) {
          setNovita(voci)
          setNovitaAperte(true)
        }
      })
      .catch(() => {})
      .finally(() => setNovitaCaricate(true))
  }, [])

  // Invito a generare la chiave di recupero: a ogni montaggio finché non esiste
  useEffect(() => {
    void window.api.sicurezza
      .stato()
      .then((st) => setInvitoNecessario(!st.recuperoAttivo))
      .catch(() => {})
  }, [])

  function chiudiNovita(): void {
    setNovitaAperte(false)
    void window.api.changelog.markSeen().catch(() => {})
  }

  /** Gestisce la navigazione proveniente dalla Dashboard (drill-down). */
  function handleDashboardNavigate(section: string, params?: Record<string, unknown>): void {
    if (section === 'clients' && params) {
      const filtro = params.filtro as string | undefined
      if (filtro === 'iscrizione_attiva') {
        setClientFilter({ stato_iscrizione: 'attiva' })
        setActiveNav('clients')
      } else if (filtro === 'iscrizione_scaduta') {
        setClientFilter({ stato_iscrizione: 'scaduta' })
        setActiveNav('clients')
      } else if (filtro === 'certificato') {
        setClientFilter({ stato_certificato: 'da_gestire' })
        setActiveNav('clients')
      } else if (filtro === 'abbonamento' && params.tipoAbbonamentoId !== undefined) {
        setClientFilter({ tipo_abbonamento_id: params.tipoAbbonamentoId as number })
        setActiveNav('clients')
      } else if (params.clienteId !== undefined) {
        setClientFilter(undefined)
        setActiveNav('clients')
      } else {
        setClientFilter(undefined)
        setActiveNav('clients')
      }
    } else if (section === 'receipts') {
      if (params?.filtro === 'da_incassare') {
        setReceiptsFilter({ stato_pagamento: 'da_incassare' })
      } else {
        setReceiptsFilter(undefined)
      }
      setActiveNav('receipts')
    } else {
      const validSections: NavItem[] = ['dashboard', 'clients', 'catalog', 'receipts', 'settings']
      if (validSections.includes(section as NavItem)) {
        setActiveNav(section as NavItem)
      }
    }
  }

  const navItems: { id: NavItem; icon: React.ReactNode; label: string; testId: string }[] = [
    { id: 'dashboard', icon: <DashboardIcon />, label: t('shell.nav.dashboard'), testId: 'nav-dashboard' },
    { id: 'clients', icon: <ClientsIcon />, label: t('shell.nav.clients'), testId: 'nav-clienti' },
    { id: 'catalog', icon: <CatalogIcon />, label: t('shell.nav.catalog'), testId: 'nav-catalog' },
    { id: 'receipts', icon: <ReceiptsIcon />, label: t('shell.nav.receipts'), testId: 'nav-receipts' },
    { id: 'settings', icon: <SettingsIcon />, label: t('shell.nav.settings'), testId: 'nav-impostazioni' },
  ]

  function renderContent(): React.ReactNode {
    switch (activeNav) {
      case 'dashboard':
        return <DashboardPage onNavigate={handleDashboardNavigate} />
      case 'clients':
        return (
          <ClientsPage
            initialFilter={clientFilter}
            onFilterConsumed={() => setClientFilter(undefined)}
          />
        )
      case 'catalog':
        return <CatalogoPage />
      case 'receipts':
        return <ReceiptsPage initialFilter={receiptsFilter} />
      case 'settings':
        return <SettingsPage />
      default:
        return <DashboardPage onNavigate={handleDashboardNavigate} />
    }
  }

  return (
    <SettingsProvider>
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-600 shrink-0">
            <AppLogoIcon />
          </div>
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('app.name')}
          </span>
        </div>

        {/* Navigazione */}
        <nav data-testid="shell-nav" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label={t('shell.nav.aria_label')}>
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              id={item.id}
              active={activeNav === item.id}
              icon={item.icon}
              label={item.label}
              testId={item.testId}
              onClick={(id) => {
                if (id === 'clients') setClientFilter(undefined)
                setActiveNav(id)
              }}
            />
          ))}
        </nav>
      </aside>

      {/* Area contenuto principale */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header area contenuto */}
        <header className="px-8 py-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {navItems.find((n) => n.id === activeNav)?.label ?? ''}
          </h2>
        </header>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-8">{renderContent()}</div>
      </main>

      {/* Notifica aggiornamento — overlay non invasivo posizionato in fondo */}
      <UpdateNotification />
      <UpdateCheckSnackbar />
      <ChangelogModal isOpen={novitaAperte} voci={novita} onClose={chiudiNovita} />
      <GeneraChiaveDialog
        isOpen={invitoNecessario && !invitoChiuso && novitaCaricate && !novitaAperte}
        variante="invito"
        onClose={() => setInvitoChiuso(true)}
      />
    </div>
    </SettingsProvider>
  )
}
