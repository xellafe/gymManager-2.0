import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  ComuneInfo,
  ElectronAPI,
  DbState,
  ClienteRow,
  CreateClienteInput,
  UpdateClienteInput,
  ClientiFilters,
  ImportRowResult,
  ImportPreview,
  ImportReport,
  CertificatoRow,
  CreateCertificatoInput,
  TipoIscrizioneRow,
  TipoAbbonamentoRow,
  CreateTipoIscrizioneInput,
  UpdateTipoIscrizioneInput,
  CreateTipoAbbonamentoInput,
  UpdateTipoAbbonamentoInput,
  IscrizioneClienteRow,
  AbbonamentoClienteRow,
  AssegnaIscrizioneInput,
  AssegnaAbbonamentoInput,
  RicevutaRow,
  RicevutaConRighe,
  RicevutaFilters,
  VocePagabile,
  CreaRicevutaInput,
  WidgetIndicatori,
  ClienteInScadenza,
  AbbonamentoPerTipo,
  IncassiPeriodo,
  NuoviTesseramenti,
  CompleannoDellaSett,
  DashboardPeriodo,
  BackupManifest,
  BackupLocaleInfo,
  DriveBackupItem,
  UpdateInfo,
  UpdateProgress,
  SyncStatus,
  VoceChangelog
} from '../types/shared'

// Espone le API standard di electron-toolkit su window.electron
exposeElectronAPI()

// Costruisce l'API applicativa personalizzata
const api: ElectronAPI = {
  // Piattaforma del sistema operativo (es. 'darwin', 'win32'): usata dalla UI
  // per adattare il comportamento dell'auto-update su macOS.
  platform: process.platform,

  db: {
    getState(): Promise<{ state: DbState }> {
      return ipcRenderer.invoke('db:getState')
    },
    setup(password: string): Promise<void> {
      return ipcRenderer.invoke('db:setup', { password })
    },
    unlock(password: string): Promise<void> {
      return ipcRenderer.invoke('db:unlock', { password })
    },
    isOpen(): Promise<boolean> {
      return ipcRenderer.invoke('db:isOpen')
    },
    changePassword(oldPassword: string, newPassword: string): Promise<void> {
      return ipcRenderer.invoke('db:changePassword', { oldPassword, newPassword })
    }
  },

  settings: {
    get(): Promise<AppSettings> {
      return ipcRenderer.invoke('settings:get')
    },
    set(settings: Partial<AppSettings>): Promise<void> {
      return ipcRenderer.invoke('settings:set', { settings })
    }
  },

  app: {
    getVersion(): Promise<string> {
      return ipcRenderer.invoke('app:getVersion')
    }
  },

  clienti: {
    list(filters?: ClientiFilters): Promise<ClienteRow[]> {
      return ipcRenderer.invoke('clienti:list', filters)
    },
    get(id: number): Promise<ClienteRow | null> {
      return ipcRenderer.invoke('clienti:get', id)
    },
    create(data: CreateClienteInput): Promise<ClienteRow> {
      return ipcRenderer.invoke('clienti:create', data)
    },
    update(id: number, data: UpdateClienteInput): Promise<ClienteRow> {
      return ipcRenderer.invoke('clienti:update', id, data)
    },
    anonimizza(id: number): Promise<void> {
      return ipcRenderer.invoke('clienti:anonimizza', id)
    },
    import: {
      analizza(path: string): Promise<ImportPreview> {
        return ipcRenderer.invoke('clienti:import:analizza', path)
      },
      esegui(path: string): Promise<ImportReport> {
        return ipcRenderer.invoke('clienti:import:esegui', path)
      },
      template(destPath: string): Promise<void> {
        return ipcRenderer.invoke('clienti:import:template', destPath)
      }
    },
    count(): Promise<number> {
      return ipcRenderer.invoke('clienti:count')
    }
  },

  certificati: {
    list(clienteId: number): Promise<CertificatoRow[]> {
      return ipcRenderer.invoke('certificati:list', clienteId)
    },
    add(data: CreateCertificatoInput): Promise<CertificatoRow> {
      return ipcRenderer.invoke('certificati:add', data)
    }
  },

  catalogo: {
    tipiIscrizione: {
      list(includeNonValidi?: boolean): Promise<TipoIscrizioneRow[]> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:list', includeNonValidi)
      },
      create(data: CreateTipoIscrizioneInput): Promise<TipoIscrizioneRow> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:create', data)
      },
      update(id: number, data: UpdateTipoIscrizioneInput): Promise<TipoIscrizioneRow> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:update', { id, data })
      },
      delete(id: number): Promise<void> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:delete', { id })
      },
      invalida(id: number): Promise<void> {
        return ipcRenderer.invoke('catalogo:tipiIscrizione:invalida', { id })
      }
    },
    tipiAbbonamento: {
      list(includeNonValidi?: boolean): Promise<TipoAbbonamentoRow[]> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:list', includeNonValidi)
      },
      create(data: CreateTipoAbbonamentoInput): Promise<TipoAbbonamentoRow> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:create', data)
      },
      update(id: number, data: UpdateTipoAbbonamentoInput): Promise<TipoAbbonamentoRow> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:update', { id, data })
      },
      delete(id: number): Promise<void> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:delete', { id })
      },
      invalida(id: number): Promise<void> {
        return ipcRenderer.invoke('catalogo:tipiAbbonamento:invalida', { id })
      }
    }
  },

  iscrizioni: {
    assegna(data: AssegnaIscrizioneInput): Promise<IscrizioneClienteRow> {
      return ipcRenderer.invoke('iscrizioni:assegna', data)
    },
    rinnova(vecchiaId: number | null, data: AssegnaIscrizioneInput): Promise<IscrizioneClienteRow> {
      return ipcRenderer.invoke('iscrizioni:rinnova', { vecchiaId, data })
    },
    getAttiva(clienteId: number): Promise<IscrizioneClienteRow | null> {
      return ipcRenderer.invoke('iscrizioni:getAttiva', { clienteId })
    },
    list(clienteId: number): Promise<IscrizioneClienteRow[]> {
      return ipcRenderer.invoke('iscrizioni:list', { clienteId })
    },
    updateDate(id: number, dataInizio: string, dataScadenza: string): Promise<IscrizioneClienteRow> {
      return ipcRenderer.invoke('iscrizioni:updateDate', { id, dataInizio, dataScadenza })
    },
    invalida(id: number): Promise<IscrizioneClienteRow> {
      return ipcRenderer.invoke('iscrizioni:invalida', { id })
    },
    setPagamento(args: { id: number; stato: 'pagato' | 'da_incassare' }): Promise<void> {
      return ipcRenderer.invoke('iscrizioni:setPagamento', args)
    }
  },

  abbonamenti: {
    assegna(data: AssegnaAbbonamentoInput): Promise<AbbonamentoClienteRow> {
      return ipcRenderer.invoke('abbonamenti:assegna', data)
    },
    list(clienteId: number, soloAttivi?: boolean): Promise<AbbonamentoClienteRow[]> {
      return ipcRenderer.invoke('abbonamenti:list', { clienteId, soloAttivi })
    },
    updateDate(id: number, dataInizio: string, dataScadenza: string): Promise<AbbonamentoClienteRow> {
      return ipcRenderer.invoke('abbonamenti:updateDate', { id, dataInizio, dataScadenza })
    },
    invalida(id: number): Promise<AbbonamentoClienteRow> {
      return ipcRenderer.invoke('abbonamenti:invalida', { id })
    },
    setPagamento(args: { id: number; stato: 'pagato' | 'da_incassare' }): Promise<void> {
      return ipcRenderer.invoke('abbonamenti:setPagamento', args)
    }
  },

  ricevute: {
    crea(data: CreaRicevutaInput): Promise<RicevutaConRighe> {
      return ipcRenderer.invoke('ricevute:crea', data)
    },
    get(id: number): Promise<RicevutaConRighe | null> {
      return ipcRenderer.invoke('ricevute:get', { id })
    },
    list(filters?: RicevutaFilters): Promise<RicevutaRow[]> {
      return ipcRenderer.invoke('ricevute:list', filters)
    },
    annulla(id: number): Promise<RicevutaRow> {
      return ipcRenderer.invoke('ricevute:annulla', { id })
    },
    vociPagabili(clienteId: number): Promise<VocePagabile[]> {
      return ipcRenderer.invoke('ricevute:vociPagabili', { clienteId })
    },
    anni(): Promise<number[]> {
      return ipcRenderer.invoke('ricevute:anni')
    },
    ultimoNumero(anno: number): Promise<number> {
      return ipcRenderer.invoke('ricevute:ultimoNumero', { anno })
    }
  },

  pdf: {
    genera(args: { ricevutaId: number }): Promise<string> {
      return ipcRenderer.invoke('pdf:genera', args)
    }
  },

  dashboard: {
    indicatori(params: {
      oggi: string
      giorniCert: number
      giorniIsc: number
      giorniAbb: number
      dal: string
      al: string
    }): Promise<WidgetIndicatori> {
      return ipcRenderer.invoke('dashboard:indicatori', params)
    },
    scadenze(params: {
      oggi: string
      giorniCert: number
      giorniIsc: number
      giorniAbb: number
    }): Promise<ClienteInScadenza[]> {
      return ipcRenderer.invoke('dashboard:scadenze', params)
    },
    abbonamenti(params: { soloAttivi?: boolean }): Promise<AbbonamentoPerTipo[]> {
      return ipcRenderer.invoke('dashboard:abbonamenti', params)
    },
    incassi(params: { periodo: DashboardPeriodo }): Promise<IncassiPeriodo> {
      return ipcRenderer.invoke('dashboard:incassi', params)
    },
    tesseramenti(params: { periodo: DashboardPeriodo }): Promise<NuoviTesseramenti> {
      return ipcRenderer.invoke('dashboard:tesseramenti', params)
    },
    compleanni(params: { dalGiorno: string; alGiorno: string }): Promise<CompleannoDellaSett[]> {
      return ipcRenderer.invoke('dashboard:compleanni', params)
    }
  },

  backup: {
    locale(args: { destinazionePath: string }): Promise<BackupManifest> {
      return ipcRenderer.invoke('backup:locale', args)
    },
    automatico(): Promise<string> {
      return ipcRenderer.invoke('backup:automatico')
    },
    listLocale(): Promise<BackupLocaleInfo[]> {
      return ipcRenderer.invoke('backup:listLocale')
    },
    verifica(args: { backupPath: string }): Promise<BackupManifest> {
      return ipcRenderer.invoke('backup:verifica', args)
    },
    ripristina(args: { backupPath: string; password: string }): Promise<void> {
      return ipcRenderer.invoke('backup:ripristina', args)
    },
    reset(args: { nuovaPassword: string }): Promise<void> {
      return ipcRenderer.invoke('backup:reset', args)
    },
    drive: {
      connect(): Promise<void> {
        return ipcRenderer.invoke('backup:drive:connect')
      },
      disconnect(): Promise<void> {
        return ipcRenderer.invoke('backup:drive:disconnect')
      },
      isConnected(): Promise<boolean> {
        return ipcRenderer.invoke('backup:drive:isConnected')
      },
      backup(args: { backupPath: string }): Promise<string> {
        return ipcRenderer.invoke('backup:drive:backup', args)
      },
      list(): Promise<DriveBackupItem[]> {
        return ipcRenderer.invoke('backup:drive:list')
      },
      restore(args: { fileId: string; password: string }): Promise<void> {
        return ipcRenderer.invoke('backup:drive:restore', args)
      }
    }
  },

  cf: {
    cercaComuni(query: string): Promise<ComuneInfo[]> {
      return ipcRenderer.invoke('cf:cercaComuni', query)
    },
    calcola(input: {
      nome: string
      cognome: string
      dataNascita: string
      sesso: 'M' | 'F'
      codiceComune: string
    }): Promise<string> {
      return ipcRenderer.invoke('cf:calcola', input)
    }
  },

  dialog: {
    showOpenDialog(options?: {
      title?: string
      filters?: { name: string; extensions: string[] }[]
      properties?: Array<'openFile' | 'openDirectory'>
    }): Promise<{ canceled: boolean; filePaths: string[] }> {
      return ipcRenderer.invoke('dialog:showOpenDialog', options)
    },
    showSaveDialog(options?: {
      title?: string
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
    }): Promise<{ canceled: boolean; filePath: string }> {
      return ipcRenderer.invoke('dialog:showSaveDialog', options)
    }
  },

  changelog: {
    getPending(): Promise<VoceChangelog[]> {
      return ipcRenderer.invoke('changelog:getPending')
    },
    markSeen(): Promise<void> {
      return ipcRenderer.invoke('changelog:markSeen')
    },
    getCurrent(): Promise<VoceChangelog[]> {
      return ipcRenderer.invoke('changelog:getCurrent')
    }
  },

  updater: {
    check(): Promise<void> {
      return ipcRenderer.invoke('updater:check')
    },
    install(): Promise<void> {
      return ipcRenderer.invoke('updater:install')
    },
    revealDownload(): Promise<void> {
      return ipcRenderer.invoke('updater:revealDownload')
    }
  },

  sync: {
    status(): Promise<SyncStatus> {
      return ipcRenderer.invoke('sync:status')
    },
    now(): Promise<void> {
      return ipcRenderer.invoke('sync:now')
    },
    check(): Promise<void> {
      return ipcRenderer.invoke('sync:check')
    },
    resolve(scelta: 'remoto' | 'locale' | 'copia'): Promise<void> {
      return ipcRenderer.invoke('sync:resolve', { scelta })
    },
    enable(): Promise<void> {
      return ipcRenderer.invoke('sync:enable')
    },
    disable(): Promise<void> {
      return ipcRenderer.invoke('sync:disable')
    },
    setPolling(sec: number): Promise<void> {
      return ipcRenderer.invoke('sync:setPolling', { sec })
    }
  },

  on(channel: string, callback: (...args: unknown[]) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  off(channel: string, callback: (...args: unknown[]) => void): void {
    ipcRenderer.removeListener(channel, callback as Parameters<typeof ipcRenderer.removeListener>[1])
  }
}

// Espone window.api al renderer in modo sicuro tramite contextBridge
contextBridge.exposeInMainWorld('api', api)

// Re-esporta i tipi per l'uso nel renderer (tree-shaken in produzione)
export type {
  AppSettings,
  ComuneInfo,
  ElectronAPI,
  DbState,
  ClienteRow,
  CreateClienteInput,
  UpdateClienteInput,
  ClientiFilters,
  ImportRowResult,
  ImportPreview,
  ImportReport,
  CertificatoRow,
  CreateCertificatoInput,
  TipoIscrizioneRow,
  TipoAbbonamentoRow,
  CreateTipoIscrizioneInput,
  UpdateTipoIscrizioneInput,
  CreateTipoAbbonamentoInput,
  UpdateTipoAbbonamentoInput,
  IscrizioneClienteRow,
  AbbonamentoClienteRow,
  AssegnaIscrizioneInput,
  AssegnaAbbonamentoInput,
  RicevutaRow,
  RicevutaConRighe,
  RicevutaFilters,
  VocePagabile,
  CreaRicevutaInput,
  WidgetIndicatori,
  ClienteInScadenza,
  AbbonamentoPerTipo,
  IncassiPeriodo,
  NuoviTesseramenti,
  CompleannoDellaSett,
  DashboardPeriodo,
  BackupManifest,
  BackupLocaleInfo,
  DriveBackupItem,
  UpdateInfo,
  UpdateProgress,
  SyncStatus
}
