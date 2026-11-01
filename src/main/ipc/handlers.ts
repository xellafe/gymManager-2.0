import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
import { checkForUpdates, installUpdate, revealDownloadedUpdate } from '../updater/auto-updater'
import {
  getNovitaDaMostrare,
  segnaVersioneVista,
  getNovitaVersioneCorrente
} from '../changelog/changelog-service'
import { backupLocale, backupAutomatico, listBackupLocali } from '../backup/backup-service'
import { initBackupScheduler, restartBackupScheduler } from '../backup/backup-scheduler'
import { verificaBackup, ripristinaBackup, resetDatabase, eseguiRipristino } from '../backup/restore-service'
import {
  connectDrive,
  isDriveConnected,
  disconnectDrive,
  backupSuDrive,
  listBackupDrive,
  ripristinaDaDrive
} from '../backup/drive-service'
import type {
  BackupManifest,
  BackupLocaleInfo,
  DriveBackupItem,
  SyncStatus,
  VoceChangelog
} from '../../types/shared'
import {
  getStatus as syncGetStatus,
  upload as syncUpload,
  syncOnOpen,
  checkRemote as syncCheckRemote,
  resolveConflict as syncResolveConflict,
  enableSync as syncEnable,
  disableSync as syncDisable,
  setPolling as syncSetPolling
} from '../sync/sync-service'
import { generaHTMLRicevuta } from '../domain/ricevuta'
import { generaPDFInElectron } from '../pdf/generator'
import { getDatabase } from '../db/database'
import type { ImpostazioniAttivitaSnapshot } from '../domain/ricevuta'
import log from 'electron-log'
import { checkFirstRun, openDatabase, isDatabaseOpen, changePassword } from '../db/database'
import { loadSettings, saveSettings, applyAppSettingsToDb } from '../settings/store'
import {
  createCliente,
  getCliente,
  updateCliente,
  listClienti,
  anonimizzaCliente,
  getTuttiCodiciFiscali,
  getTutteTessere,
  importClienti,
  contaClientiAttivi
} from '../db/clients-repository'
import { parseCsvClienti, analizzaImport } from '../domain/import-clienti'
import { addCertificato, listCertificati } from '../db/certificates-repository'
import {
  createTipoIscrizione,
  updateTipoIscrizione,
  listTipiIscrizione,
  deleteTipoIscrizione,
  invalidaTipoIscrizione,
  createTipoAbbonamento,
  updateTipoAbbonamento,
  listTipiAbbonamento,
  deleteTipoAbbonamento,
  invalidaTipoAbbonamento
} from '../db/catalog-repository'
import {
  assegnaIscrizione,
  rinnovaIscrizione,
  getIscrizioneAttiva,
  listIscrizioni,
  updateIscrizioneDate,
  invalidaIscrizione,
  assegnaAbbonamento,
  listAbbonamenti,
  updateAbbonamentoDate,
  invalidaAbbonamento,
  aggiornaStatoIscrizioni,
  aggiornaStatoAbbonamenti
} from '../db/memberships-repository'
import {
  getRicevuta,
  creaRicevuta,
  listRicevute,
  annullaRicevuta,
  getVociPagabili,
  listAnniRicevute,
  getUltimoNumeroRicevuta,
  setStatoPagamentoIscrizione,
  setStatoPagamentoAbbonamento
} from '../db/receipts-repository'
import {
  getIndicatori,
  getClientiInScadenza,
  getDistribuzioneAbbonamenti,
  getIncassiPeriodo,
  getNuoviTesseramenti,
  getCompleanni
} from '../db/dashboard-repository'
import { cercaComuni } from '../domain/comuni'
import { calcolaCF } from '../domain/codice-fiscale'
import { validaCliente, validaClienteUpdate } from '../domain/cliente'
import { validaTipoIscrizione, validaTipoAbbonamento, validaTipoUpdate } from '../domain/catalogo'
import type {
  AppSettings,
  ComuneInfo,
  DbState,
  ClienteRow,
  CreateClienteInput,
  UpdateClienteInput,
  ClientiFilters,
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
  CreaRicevutaInput,
  VocePagabile,
  WidgetIndicatori,
  ClienteInScadenza,
  AbbonamentoPerTipo,
  IncassiPeriodo,
  NuoviTesseramenti,
  CompleannoDellaSett,
  DashboardPeriodo,
  ImportPreview,
  ImportReport
} from '../../types/shared'

/**
 * Registra tutti gli handler IPC dell'applicazione.
 * Deve essere chiamata prima della creazione della finestra principale.
 */
export function registerIpcHandlers(): void {
  // ── Database ─────────────────────────────────────────────────────────────

  /**
   * Restituisce lo stato corrente del database:
   * - 'firstRun': nessun DB su disco (primo avvio)
   * - 'locked': DB esiste ma non è stato sbloccato
   * - 'ready': DB aperto e pronto
   */
  ipcMain.handle('db:getState', (): { state: DbState } => {
    try {
      if (isDatabaseOpen()) {
        return { state: 'ready' }
      }
      if (checkFirstRun()) {
        return { state: 'firstRun' }
      }
      return { state: 'locked' }
    } catch (err) {
      log.error('[ipc] db:getState errore:', err)
      throw new Error('Impossibile determinare lo stato del database')
    }
  })

  /**
   * Primo avvio: crea il database con la password scelta dall'utente.
   */
  ipcMain.handle('db:setup', async (_event, { password }: { password: string }): Promise<void> => {
    try {
      if (!password || password.trim().length === 0) {
        throw new Error('La password non può essere vuota')
      }
      openDatabase(password)
      aggiornaStatoIscrizioni()
      aggiornaStatoAbbonamenti()
      log.info('[ipc] db:setup completato')
      initBackupScheduler()
    } catch (err) {
      log.error('[ipc] db:setup errore:', err)
      if (err instanceof Error && err.message === 'PASSWORD_WRONG') {
        throw new Error('Password non valida')
      }
      throw err instanceof Error ? err : new Error('Errore durante la configurazione del database')
    }
  })

  /**
   * Avvii successivi: sblocca il database esistente con la master password.
   */
  ipcMain.handle(
    'db:unlock',
    async (_event, { password }: { password: string }): Promise<void> => {
      try {
        if (!password || password.trim().length === 0) {
          throw new Error('La password non può essere vuota')
        }
        openDatabase(password)
        aggiornaStatoIscrizioni()
        aggiornaStatoAbbonamenti()
        log.info('[ipc] db:unlock completato')
        // Verifica sync non bloccante: non deve ritardare la risposta dell'unlock.
        void syncOnOpen().catch((err) => log.warn('[sync] open check fallito:', err))
        initBackupScheduler()
      } catch (err) {
        log.error('[ipc] db:unlock errore:', err)
        if (err instanceof Error && err.message === 'PASSWORD_WRONG') {
          throw new Error('Password errata. Riprova.')
        }
        if (err instanceof Error && err.message.startsWith('MIGRATION_FAILED')) {
          // Migrazione fallita post-aggiornamento: DB aperto ma schema non aggiornato.
          // L'utente deve ripristinare da un backup o contattare il supporto.
          throw new Error('MIGRATION_FAILED')
        }
        throw err instanceof Error ? err : new Error('Errore durante lo sblocco del database')
      }
    }
  )

  ipcMain.handle(
    'db:changePassword',
    async (
      _event,
      { oldPassword, newPassword }: { oldPassword: string; newPassword: string }
    ): Promise<void> => {
      try {
        if (!newPassword || newPassword.length < 8) {
          throw new Error('VALIDATION_ERROR: newPassword: minimo 8 caratteri')
        }
        changePassword(oldPassword, newPassword)
        log.info('[ipc] db:changePassword completato')
      } catch (err) {
        log.error('[ipc] db:changePassword errore:', err)
        if (err instanceof Error && err.message === 'PASSWORD_WRONG') {
          throw new Error('PASSWORD_WRONG')
        }
        throw err instanceof Error ? err : new Error('Errore durante il cambio password')
      }
    }
  )

  /**
   * Indica se il database è attualmente aperto.
   */
  ipcMain.handle('db:isOpen', (): boolean => {
    return isDatabaseOpen()
  })

  // ── Impostazioni ─────────────────────────────────────────────────────────

  /**
   * Restituisce le impostazioni correnti dell'applicazione.
   */
  ipcMain.handle('settings:get', (): AppSettings => {
    try {
      return loadSettings()
    } catch (err) {
      log.error('[ipc] settings:get errore:', err)
      throw new Error('Impossibile leggere le impostazioni')
    }
  })

  /**
   * Aggiorna (merge parziale) le impostazioni dell'applicazione.
   */
  ipcMain.handle(
    'settings:set',
    (_event, { settings }: { settings: Partial<AppSettings> }): void => {
      try {
        const current = loadSettings()
        const updated: AppSettings = { ...current, ...settings }

        // A14: SQLite per primo, in transazione (atomico). Se fallisce, il file NON viene scritto.
        if (isDatabaseOpen()) {
          applyAppSettingsToDb(getDatabase(), settings)
        }

        // JSON è la sorgente autorevole per le letture (loadSettings). Se saveSettings fallisce,
        // il DB resta avanti di un passo ma viene riallineato al successivo settings:set riuscito.
        // Solo dopo il successo SQLite, persiste il file JSON.
        saveSettings(updated)
        // Le impostazioni di backup periodico possono essere cambiate: riallinea il timer.
        restartBackupScheduler()
      } catch (err) {
        log.error('[ipc] settings:set errore:', err)
        throw new Error('Impossibile salvare le impostazioni')
      }
    }
  )

  // ── App ──────────────────────────────────────────────────────────────────

  /**
   * Restituisce la versione dell'applicazione.
   */
  ipcMain.handle('app:getVersion', (): string => {
    return app.getVersion()
  })

  // ── Clienti ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'clienti:list',
    (_event, filters?: ClientiFilters): ClienteRow[] => {
      try {
        const settings = loadSettings()
        return listClienti(filters, settings.expiry_warning_days_certificates)
      } catch (err) {
        log.error('[ipc] clienti:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero clienti')
      }
    }
  )

  ipcMain.handle('clienti:count', (): number => {
    try {
      return contaClientiAttivi()
    } catch (err) {
      log.error('[ipc] clienti:count errore:', err)
      throw err instanceof Error ? err : new Error('Errore nel conteggio clienti')
    }
  })

  ipcMain.handle(
    'clienti:get',
    (_event, id: number): ClienteRow | null => {
      try {
        return getCliente(id)
      } catch (err) {
        log.error('[ipc] clienti:get errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero cliente')
      }
    }
  )

  ipcMain.handle(
    'clienti:create',
    (_event, data: CreateClienteInput): ClienteRow => {
      try {
        const validation = validaCliente(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
        return createCliente(data)
      } catch (err) {
        log.error('[ipc] clienti:create errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione del cliente')
      }
    }
  )

  ipcMain.handle(
    'clienti:update',
    (_event, id: number, data: UpdateClienteInput): ClienteRow => {
      try {
        const validation = validaClienteUpdate(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
        return updateCliente(id, data)
      } catch (err) {
        log.error('[ipc] clienti:update errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento del cliente")
      }
    }
  )

  ipcMain.handle(
    'clienti:anonimizza',
    (_event, id: number): void => {
      try {
        anonimizzaCliente(id)
      } catch (err) {
        log.error('[ipc] clienti:anonimizza errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante l\'anonimizzazione del cliente')
      }
    }
  )

  ipcMain.handle(
    'clienti:import:analizza',
    (_event, path: string): ImportPreview => {
      try {
        const content = readFileSync(path, 'utf-8')
        const righe = parseCsvClienti(content)
        return analizzaImport(righe, getTuttiCodiciFiscali(), getTutteTessere())
      } catch (err) {
        log.error('[ipc] clienti:import:analizza errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'analisi del CSV")
      }
    }
  )

  ipcMain.handle(
    'clienti:import:esegui',
    (_event, path: string): ImportReport => {
      try {
        // Rilegge e rianalizza il file: non ci si fida di dati dal renderer
        const content = readFileSync(path, 'utf-8')
        const righe = parseCsvClienti(content)
        const preview = analizzaImport(righe, getTuttiCodiciFiscali(), getTutteTessere())
        const nuovi = preview.righe
          .filter((r) => r.esito === 'nuovo' && r.cliente)
          .map((r) => r.cliente!)
        const importati = importClienti(nuovi)
        return { importati, saltati: preview.duplicati, errori: preview.errori }
      } catch (err) {
        log.error('[ipc] clienti:import:esegui errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'import del CSV")
      }
    }
  )

  ipcMain.handle(
    'clienti:import:template',
    (_event, destPath: string): void => {
      try {
        const intestazione =
          'codice_fiscale;nome;cognome;numero_tessera;data_nascita;sesso;comune_nascita;via;civico;citta;provincia;cap;email;telefono;note'
        const esempio =
          'RSSMRA85M01H501Z;Mario;Rossi;;01/03/1985;M;Roma;Via Roma;10;Roma;RM;00100;mario.rossi@example.it;3331234567;'
        // BOM iniziale per compatibilità con Excel su Windows
        writeFileSync(destPath, `\uFEFF${intestazione}\n${esempio}\n`, 'utf-8')
      } catch (err) {
        log.error('[ipc] clienti:import:template errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione del modello CSV')
      }
    }
  )

  // ── Certificati ──────────────────────────────────────────────────────────

  ipcMain.handle(
    'certificati:list',
    (_event, clienteId: number): CertificatoRow[] => {
      try {
        return listCertificati(clienteId)
      } catch (err) {
        log.error('[ipc] certificati:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero certificati')
      }
    }
  )

  ipcMain.handle(
    'certificati:add',
    (_event, data: CreateCertificatoInput): CertificatoRow => {
      try {
        return addCertificato(data)
      } catch (err) {
        log.error('[ipc] certificati:add errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante l\'aggiunta del certificato')
      }
    }
  )

  // ── Catalogo: TipiIscrizione ──────────────────────────────────────────────

  ipcMain.handle(
    'catalogo:tipiIscrizione:list',
    (_event, includeNonValidi?: boolean): TipoIscrizioneRow[] => {
      try {
        return listTipiIscrizione(includeNonValidi)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero tipi iscrizione')
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiIscrizione:create',
    (_event, data: CreateTipoIscrizioneInput): TipoIscrizioneRow => {
      try {
        const validation = validaTipoIscrizione(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
        return createTipoIscrizione(data)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:create errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione del tipo iscrizione')
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiIscrizione:update',
    (_event, { id, data }: { id: number; data: UpdateTipoIscrizioneInput }): TipoIscrizioneRow => {
      try {
        const validation = validaTipoUpdate(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
        return updateTipoIscrizione(id, data)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:update errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento del tipo iscrizione")
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiIscrizione:delete',
    (_event, { id }: { id: number }): void => {
      try {
        deleteTipoIscrizione(id)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:delete errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'eliminazione del tipo iscrizione")
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiIscrizione:invalida',
    (_event, { id }: { id: number }): void => {
      try {
        invalidaTipoIscrizione(id)
      } catch (err) {
        log.error('[ipc] catalogo:tipiIscrizione:invalida errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'invalidazione del tipo iscrizione")
      }
    }
  )

  // ── Catalogo: TipiAbbonamento ─────────────────────────────────────────────

  ipcMain.handle(
    'catalogo:tipiAbbonamento:list',
    (_event, includeNonValidi?: boolean): TipoAbbonamentoRow[] => {
      try {
        return listTipiAbbonamento(includeNonValidi)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero tipi abbonamento')
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiAbbonamento:create',
    (_event, data: CreateTipoAbbonamentoInput): TipoAbbonamentoRow => {
      try {
        const validation = validaTipoAbbonamento(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
        return createTipoAbbonamento(data)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:create errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione del tipo abbonamento')
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiAbbonamento:update',
    (_event, { id, data }: { id: number; data: UpdateTipoAbbonamentoInput }): TipoAbbonamentoRow => {
      try {
        const validation = validaTipoUpdate(data)
        if (!validation.valid) {
          const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
          throw new Error(`VALIDATION_ERROR: ${errorMsg}`)
        }
        return updateTipoAbbonamento(id, data)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:update errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento del tipo abbonamento")
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiAbbonamento:delete',
    (_event, { id }: { id: number }): void => {
      try {
        deleteTipoAbbonamento(id)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:delete errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'eliminazione del tipo abbonamento")
      }
    }
  )

  ipcMain.handle(
    'catalogo:tipiAbbonamento:invalida',
    (_event, { id }: { id: number }): void => {
      try {
        invalidaTipoAbbonamento(id)
      } catch (err) {
        log.error('[ipc] catalogo:tipiAbbonamento:invalida errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'invalidazione del tipo abbonamento")
      }
    }
  )

  // ── Iscrizioni ────────────────────────────────────────────────────────────

  ipcMain.handle(
    'iscrizioni:assegna',
    (_event, data: AssegnaIscrizioneInput): IscrizioneClienteRow => {
      try {
        return assegnaIscrizione(data)
      } catch (err) {
        log.error('[ipc] iscrizioni:assegna errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'assegnazione dell'iscrizione")
      }
    }
  )

  ipcMain.handle('iscrizioni:rinnova', (_event, args: { vecchiaId: number | null; data: AssegnaIscrizioneInput }) => {
    try {
      return rinnovaIscrizione(args.vecchiaId, args.data)
    } catch (err) {
      log.error('[ipc] iscrizioni:rinnova errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante il rinnovo iscrizione')
    }
  })

  ipcMain.handle(
    'iscrizioni:getAttiva',
    (_event, { clienteId }: { clienteId: number }): IscrizioneClienteRow | null => {
      try {
        return getIscrizioneAttiva(clienteId)
      } catch (err) {
        log.error('[ipc] iscrizioni:getAttiva errore:', err)
        throw err instanceof Error ? err : new Error("Errore nel recupero dell'iscrizione attiva")
      }
    }
  )

  ipcMain.handle(
    'iscrizioni:list',
    (_event, { clienteId }: { clienteId: number }): IscrizioneClienteRow[] => {
      try {
        return listIscrizioni(clienteId)
      } catch (err) {
        log.error('[ipc] iscrizioni:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero iscrizioni')
      }
    }
  )

  ipcMain.handle(
    'iscrizioni:updateDate',
    (
      _event,
      { id, dataInizio, dataScadenza }: { id: number; dataInizio: string; dataScadenza: string }
    ): IscrizioneClienteRow => {
      try {
        return updateIscrizioneDate(id, dataInizio, dataScadenza)
      } catch (err) {
        log.error('[ipc] iscrizioni:updateDate errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento delle date iscrizione")
      }
    }
  )

  ipcMain.handle(
    'iscrizioni:invalida',
    (_event, { id }: { id: number }): IscrizioneClienteRow => {
      try {
        return invalidaIscrizione(id)
      } catch (err) {
        log.error('[ipc] iscrizioni:invalida errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'invalidazione dell'iscrizione")
      }
    }
  )

  ipcMain.handle(
    'iscrizioni:setPagamento',
    (_event, { id, stato }: { id: number; stato: 'pagato' | 'da_incassare' }): void => {
      try {
        setStatoPagamentoIscrizione(id, stato)
      } catch (err) {
        log.error('[ipc] iscrizioni:setPagamento errore:', err)
        throw err instanceof Error ? err : new Error('Errore aggiornamento pagamento')
      }
    }
  )

  // ── Abbonamenti ───────────────────────────────────────────────────────────

  ipcMain.handle(
    'abbonamenti:assegna',
    (_event, data: AssegnaAbbonamentoInput): AbbonamentoClienteRow => {
      try {
        return assegnaAbbonamento(data)
      } catch (err) {
        log.error('[ipc] abbonamenti:assegna errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'assegnazione dell'abbonamento")
      }
    }
  )

  ipcMain.handle(
    'abbonamenti:list',
    (
      _event,
      { clienteId, soloAttivi }: { clienteId: number; soloAttivi?: boolean }
    ): AbbonamentoClienteRow[] => {
      try {
        return listAbbonamenti(clienteId, soloAttivi)
      } catch (err) {
        log.error('[ipc] abbonamenti:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero abbonamenti')
      }
    }
  )

  ipcMain.handle(
    'abbonamenti:updateDate',
    (
      _event,
      { id, dataInizio, dataScadenza }: { id: number; dataInizio: string; dataScadenza: string }
    ): AbbonamentoClienteRow => {
      try {
        return updateAbbonamentoDate(id, dataInizio, dataScadenza)
      } catch (err) {
        log.error('[ipc] abbonamenti:updateDate errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento delle date abbonamento")
      }
    }
  )

  ipcMain.handle(
    'abbonamenti:invalida',
    (_event, { id }: { id: number }): AbbonamentoClienteRow => {
      try {
        return invalidaAbbonamento(id)
      } catch (err) {
        log.error('[ipc] abbonamenti:invalida errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'invalidazione dell'abbonamento")
      }
    }
  )

  ipcMain.handle(
    'abbonamenti:setPagamento',
    (_event, { id, stato }: { id: number; stato: 'pagato' | 'da_incassare' }): void => {
      try {
        setStatoPagamentoAbbonamento(id, stato)
      } catch (err) {
        log.error('[ipc] abbonamenti:setPagamento errore:', err)
        throw err instanceof Error ? err : new Error('Errore aggiornamento pagamento')
      }
    }
  )

  // ── Ricevute ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'ricevute:crea',
    (_event, data: CreaRicevutaInput): RicevutaConRighe => {
      try {
        return creaRicevuta(data)
      } catch (err) {
        log.error('[ipc] ricevute:crea errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la creazione della ricevuta')
      }
    }
  )

  ipcMain.handle(
    'ricevute:get',
    (_event, { id }: { id: number }): RicevutaConRighe | null => {
      try {
        return getRicevuta(id)
      } catch (err) {
        log.error('[ipc] ricevute:get errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero della ricevuta')
      }
    }
  )

  ipcMain.handle(
    'ricevute:list',
    (_event, filters?: RicevutaFilters): RicevutaRow[] => {
      try {
        return listRicevute(filters)
      } catch (err) {
        log.error('[ipc] ricevute:list errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero ricevute')
      }
    }
  )

  ipcMain.handle(
    'ricevute:annulla',
    (_event, { id }: { id: number }): RicevutaRow => {
      try {
        return annullaRicevuta(id)
      } catch (err) {
        log.error('[ipc] ricevute:annulla errore:', err)
        throw err instanceof Error ? err : new Error("Errore durante l'annullamento della ricevuta")
      }
    }
  )

  ipcMain.handle(
    'ricevute:vociPagabili',
    (_event, { clienteId }: { clienteId: number }): VocePagabile[] => {
      try {
        return getVociPagabili(clienteId)
      } catch (err) {
        log.error('[ipc] ricevute:vociPagabili errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero voci pagabili')
      }
    }
  )

  /**
   * Restituisce gli anni per cui esistono ricevute (per il filtro anno).
   */
  ipcMain.handle('ricevute:anni', (): number[] => {
    try {
      return listAnniRicevute()
    } catch (err) {
      log.error('[ipc] ricevute:anni errore:', err)
      return []
    }
  })

  /**
   * Ultimo numero di ricevuta emesso per un anno (0 se nessuno). Usato dalle
   * impostazioni per proporre il default e il minimo del numero iniziale.
   */
  ipcMain.handle('ricevute:ultimoNumero', (_event, { anno }: { anno: number }): number => {
    try {
      return getUltimoNumeroRicevuta(anno)
    } catch (err) {
      log.error('[ipc] ricevute:ultimoNumero errore:', err)
      return 0
    }
  })

  // ── PDF ───────────────────────────────────────────────────────────────────

  /**
   * Genera il PDF di una ricevuta.
   * Flusso:
   *   1. Carica la ricevuta (con righe) dal DB.
   *   2. Legge i dati attività da app_settings.
   *   3. Genera l'HTML tramite generaHTMLRicevuta.
   *   4. Produce il PDF con generaPDFInElectron.
   *   5. Restituisce il Buffer come stringa base64 (IPC serializza solo dati primitivi).
   */
  ipcMain.handle(
    'pdf:genera',
    async (_event, { ricevutaId }: { ricevutaId: number }): Promise<string> => {
      try {
        const ricevuta = getRicevuta(ricevutaId)
        if (!ricevuta) {
          throw new Error(`Ricevuta con id ${ricevutaId} non trovata`)
        }

        // Legge le impostazioni attività: loadSettings() (sorgente primaria)
        // con fallback su app_settings SQLite per compatibilità con dati precedenti.
        const appSettings = loadSettings()
        const db = getDatabase()
        const getSetting = (key: string, def = ''): string => {
          const row = db
            .prepare('SELECT value FROM app_settings WHERE key = ?')
            .get(key) as { value: string } | undefined
          return row?.value ?? def
        }

        const impostazioni: ImpostazioniAttivitaSnapshot = {
          ragione_sociale: appSettings.ragione_sociale || getSetting('ragione_sociale', 'Palestra'),
          indirizzo: appSettings.indirizzo_attivita || getSetting('indirizzo', ''),
          codice_fiscale_piva: appSettings.codice_fiscale_piva || getSetting('codice_fiscale_piva', ''),
          logo_base64: (appSettings.logo_base64 || getSetting('logo_base64')) || undefined,
          dicitura_pie_default: appSettings.dicitura_pie || getSetting('dicitura_pie', ''),
        }

        const html = generaHTMLRicevuta(ricevuta, impostazioni)
        const pdfBuffer = await generaPDFInElectron(html)

        log.info(`[ipc] pdf:genera completato per ricevuta ${ricevutaId}`)
        return pdfBuffer.toString('base64')
      } catch (err) {
        log.error('[ipc] pdf:genera errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la generazione del PDF')
      }
    }
  )

  // ── Dashboard ─────────────────────────────────────────────────────────────

  ipcMain.handle(
    'dashboard:indicatori',
    (
      _event,
      {
        oggi,
        giorniCert,
        giorniIsc,
        giorniAbb,
        dal,
        al
      }: { oggi: string; giorniCert: number; giorniIsc: number; giorniAbb: number; dal: string; al: string }
    ): WidgetIndicatori => {
      try {
        return getIndicatori(oggi, giorniCert, giorniIsc, giorniAbb, dal, al)
      } catch (err) {
        log.error('[ipc] dashboard:indicatori errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero indicatori dashboard')
      }
    }
  )

  ipcMain.handle(
    'dashboard:scadenze',
    (
      _event,
      {
        oggi,
        giorniCert,
        giorniIsc,
        giorniAbb
      }: { oggi: string; giorniCert: number; giorniIsc: number; giorniAbb: number }
    ): ClienteInScadenza[] => {
      try {
        return getClientiInScadenza(oggi, giorniCert, giorniIsc, giorniAbb)
      } catch (err) {
        log.error('[ipc] dashboard:scadenze errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero scadenze dashboard')
      }
    }
  )

  ipcMain.handle(
    'dashboard:abbonamenti',
    (_event, { soloAttivi }: { soloAttivi?: boolean }): AbbonamentoPerTipo[] => {
      try {
        return getDistribuzioneAbbonamenti(soloAttivi)
      } catch (err) {
        log.error('[ipc] dashboard:abbonamenti errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero distribuzione abbonamenti')
      }
    }
  )

  ipcMain.handle(
    'dashboard:incassi',
    (_event, { periodo }: { periodo: DashboardPeriodo }): IncassiPeriodo => {
      try {
        return getIncassiPeriodo(periodo)
      } catch (err) {
        log.error('[ipc] dashboard:incassi errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero incassi periodo')
      }
    }
  )

  ipcMain.handle(
    'dashboard:tesseramenti',
    (_event, { periodo }: { periodo: DashboardPeriodo }): NuoviTesseramenti => {
      try {
        return getNuoviTesseramenti(periodo)
      } catch (err) {
        log.error('[ipc] dashboard:tesseramenti errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero nuovi tesseramenti')
      }
    }
  )

  ipcMain.handle(
    'dashboard:compleanni',
    (
      _event,
      { dalGiorno, alGiorno }: { dalGiorno: string; alGiorno: string }
    ): CompleannoDellaSett[] => {
      try {
        return getCompleanni(dalGiorno, alGiorno)
      } catch (err) {
        log.error('[ipc] dashboard:compleanni errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel recupero compleanni')
      }
    }
  )

  // ── Backup ───────────────────────────────────────────────────────────────

  /**
   * Esegue il backup locale del file DB verso il percorso scelto dall'utente.
   */
  ipcMain.handle(
    'backup:locale',
    async (_event, { destinazionePath }: { destinazionePath: string }): Promise<BackupManifest> => {
      try {
        return await backupLocale(destinazionePath)
      } catch (err) {
        log.error('[ipc] backup:locale errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante il backup locale')
      }
    }
  )

  /**
   * Esegue un backup nella cartella configurata (o quella di default se non impostata),
   * applicando la retention configurata. Restituisce il percorso del file creato.
   */
  ipcMain.handle('backup:automatico', async (): Promise<string> => {
    try {
      return await backupAutomatico()
    } catch (err) {
      log.error('[ipc] backup:automatico errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante il backup automatico')
    }
  })

  ipcMain.handle('backup:listLocale', async (): Promise<BackupLocaleInfo[]> => {
    try {
      return await listBackupLocali()
    } catch (err) {
      log.error('[ipc] backup:listLocale errore:', err)
      throw err instanceof Error ? err : new Error('Errore nel recupero dei backup locali')
    }
  })

  /**
   * Verifica un file di backup e restituisce il suo manifest.
   */
  ipcMain.handle(
    'backup:verifica',
    async (_event, { backupPath }: { backupPath: string }): Promise<BackupManifest> => {
      try {
        return await verificaBackup(backupPath)
      } catch (err) {
        log.error('[ipc] backup:verifica errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la verifica del backup')
      }
    }
  )

  /**
   * Ripristina un backup nel DB corrente.
   */
  ipcMain.handle(
    'backup:ripristina',
    async (
      _event,
      { backupPath, password }: { backupPath: string; password: string }
    ): Promise<void> => {
      try {
        await ripristinaBackup(backupPath, password)
      } catch (err) {
        log.error('[ipc] backup:ripristina errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante il ripristino del backup')
      }
    }
  )

  /**
   * Apre la finestra di dialogo nativa per la selezione di un file.
   * Usata dal renderer per il pulsante "Sfoglia…" nel ripristino backup.
   */
  ipcMain.handle(
    'dialog:showOpenDialog',
    async (
      event,
      options?: {
        title?: string
        filters?: { name: string; extensions: string[] }[]
        properties?: Array<'openFile' | 'openDirectory'>
      }
    ): Promise<{ canceled: boolean; filePaths: string[] }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const properties = options?.properties ?? ['openFile']
        const isDirectory = properties.includes('openDirectory')
        const dialogOptions: Electron.OpenDialogOptions = {
          title: options?.title,
          properties,
          // I filtri si applicano solo alla selezione di file
          ...(isDirectory
            ? {}
            : { filters: options?.filters ?? [{ name: 'Database', extensions: ['db'] }] })
        }
        const result = win
          ? await dialog.showOpenDialog(win, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions)
        return { canceled: result.canceled, filePaths: result.filePaths }
      } catch (err) {
        log.error('[ipc] dialog:showOpenDialog errore:', err)
        throw err instanceof Error ? err : new Error('Errore apertura finestra di selezione file')
      }
    }
  )

  ipcMain.handle(
    'dialog:showSaveDialog',
    async (
      event,
      options?: {
        title?: string
        defaultPath?: string
        filters?: { name: string; extensions: string[] }[]
      }
    ): Promise<{ canceled: boolean; filePath: string }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const dialogOptions: Electron.SaveDialogOptions = {
          title: options?.title,
          defaultPath: options?.defaultPath,
          filters: options?.filters
        }
        const result = win
          ? await dialog.showSaveDialog(win, dialogOptions)
          : await dialog.showSaveDialog(dialogOptions)
        return { canceled: result.canceled, filePath: result.filePath ?? '' }
      } catch (err) {
        log.error('[ipc] dialog:showSaveDialog errore:', err)
        throw err instanceof Error ? err : new Error('Errore apertura finestra di salvataggio file')
      }
    }
  )

  /**
   * Reset DISTRUTTIVO del database con nuova password.
   * D6: cancella tutti i dati, nessun recupero possibile.
   */
  ipcMain.handle(
    'backup:reset',
    async (_event, { nuovaPassword }: { nuovaPassword: string }): Promise<void> => {
      try {
        await resetDatabase(nuovaPassword)
      } catch (err) {
        log.error('[ipc] backup:reset errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante il reset del database')
      }
    }
  )

  /**
   * STUB: connette Google Drive tramite OAuth.
   */
  ipcMain.handle('backup:drive:connect', async (): Promise<void> => {
    try {
      await connectDrive()
    } catch (err) {
      log.error('[ipc] backup:drive:connect errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante la connessione a Drive')
    }
  })

  /**
   * Indica se Google Drive è connesso (token salvati su disco).
   */
  ipcMain.handle('backup:drive:isConnected', (): boolean => {
    return isDriveConnected()
  })

  /**
   * Disconnette Google Drive rimuovendo i token locali.
   */
  ipcMain.handle('backup:drive:disconnect', async (): Promise<void> => {
    try {
      await disconnectDrive()
    } catch (err) {
      log.error('[ipc] backup:drive:disconnect errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante la disconnessione da Drive')
    }
  })

  /**
   * STUB: carica un backup su Google Drive.
   */
  ipcMain.handle(
    'backup:drive:backup',
    async (_event, { backupPath }: { backupPath: string }): Promise<string> => {
      try {
        return await backupSuDrive(backupPath)
      } catch (err) {
        log.error('[ipc] backup:drive:backup errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante il backup su Drive')
      }
    }
  )

  /**
   * STUB: elenca i backup su Google Drive.
   */
  ipcMain.handle('backup:drive:list', async (): Promise<DriveBackupItem[]> => {
    try {
      return await listBackupDrive()
    } catch (err) {
      log.error('[ipc] backup:drive:list errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante il recupero lista backup Drive')
    }
  })

  /** Ripristina un backup scaricandolo da Drive in un file temporaneo, poi sovrascrive il DB. */
  ipcMain.handle(
    'backup:drive:restore',
    async (
      _event,
      { fileId, password }: { fileId: string; password: string }
    ): Promise<void> => {
      const tempPath = join(app.getPath('userData'), `drive-restore-${Date.now()}.db`)
      try {
        await ripristinaDaDrive(fileId, tempPath)
        await eseguiRipristino(tempPath, password)
      } catch (err) {
        log.error('[ipc] backup:drive:restore errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante il ripristino da Drive')
      } finally {
        if (existsSync(tempPath)) {
          try { unlinkSync(tempPath) } catch { /* ignore */ }
        }
      }
    }
  )

  // ── Codice Fiscale ────────────────────────────────────────────────────────

  ipcMain.handle('cf:cercaComuni', (_event, query: string): ComuneInfo[] => {
    try {
      return cercaComuni(query, 20)
    } catch (err) {
      log.error('[ipc] cf:cercaComuni errore:', err)
      throw err instanceof Error ? err : new Error('Errore nella ricerca comuni')
    }
  })

  ipcMain.handle(
    'cf:calcola',
    (
      _event,
      {
        nome,
        cognome,
        dataNascita,
        sesso,
        codiceComune
      }: { nome: string; cognome: string; dataNascita: string; sesso: 'M' | 'F'; codiceComune: string }
    ): string => {
      try {
        if (!nome?.trim() || !cognome?.trim() || !dataNascita || (sesso !== 'M' && sesso !== 'F') || !codiceComune?.trim()) {
          throw new Error('VALIDATION_ERROR: dati insufficienti per il calcolo del CF')
        }
        return calcolaCF(nome, cognome, dataNascita, sesso, codiceComune)
      } catch (err) {
        log.error('[ipc] cf:calcola errore:', err)
        throw err instanceof Error ? err : new Error('Errore nel calcolo del codice fiscale')
      }
    }
  )

  // ── Changelog ────────────────────────────────────────────────────────────

  ipcMain.handle('changelog:getPending', (): VoceChangelog[] => {
    try {
      return getNovitaDaMostrare()
    } catch (err) {
      log.error('[ipc] changelog:getPending errore:', err)
      throw err instanceof Error ? err : new Error('Errore nel recupero delle novità')
    }
  })

  ipcMain.handle('changelog:markSeen', (): void => {
    try {
      segnaVersioneVista()
    } catch (err) {
      log.error('[ipc] changelog:markSeen errore:', err)
      throw err instanceof Error ? err : new Error('Errore nel salvataggio della versione vista')
    }
  })

  ipcMain.handle('changelog:getCurrent', (): VoceChangelog[] => {
    try {
      return getNovitaVersioneCorrente()
    } catch (err) {
      log.error('[ipc] changelog:getCurrent errore:', err)
      throw err instanceof Error ? err : new Error('Errore nel recupero delle note della versione')
    }
  })

  // ── Auto-updater ─────────────────────────────────────────────────────────

  /**
   * Avvia manualmente il controllo degli aggiornamenti disponibili.
   */
  ipcMain.handle('updater:check', (): void => {
    try {
      checkForUpdates()
      log.info('[ipc] updater:check avviato')
    } catch (err) {
      log.error('[ipc] updater:check errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante il controllo aggiornamenti')
    }
  })

  /**
   * Installa l'aggiornamento già scaricato e riavvia l'applicazione.
   * Deve essere chiamato solo dopo aver ricevuto l'evento 'update:downloaded'.
   */
  ipcMain.handle('updater:install', (): void => {
    try {
      log.info('[ipc] updater:install avviato')
      installUpdate()
    } catch (err) {
      log.error('[ipc] updater:install errore:', err)
      throw err instanceof Error ? err : new Error("Errore durante l'installazione dell'aggiornamento")
    }
  })

  /**
   * macOS: rivela in Finder il pacchetto di aggiornamento scaricato, così che
   * l'utente possa installarlo manualmente (build non firmata, no auto-install).
   */
  ipcMain.handle('updater:revealDownload', (): void => {
    try {
      log.info('[ipc] updater:revealDownload avviato')
      revealDownloadedUpdate()
    } catch (err) {
      log.error('[ipc] updater:revealDownload errore:', err)
      throw err instanceof Error ? err : new Error("Errore nell'apertura del pacchetto di aggiornamento")
    }
  })

  // ── Sincronizzazione Drive ─────────────────────────────────────────────────

  /** Stato corrente della sincronizzazione (enabled/connected/lastSync/dirty/conflict). */
  ipcMain.handle('sync:status', async (): Promise<SyncStatus> => {
    try {
      return await syncGetStatus()
    } catch (err) {
      log.error('[ipc] sync:status errore:', err)
      throw err instanceof Error ? err : new Error('Errore nel recupero dello stato di sincronizzazione')
    }
  })

  /** Sincronizzazione manuale (upload con guardia ottimistica). */
  ipcMain.handle('sync:now', async (): Promise<void> => {
    try {
      await syncUpload()
    } catch (err) {
      log.error('[ipc] sync:now errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante la sincronizzazione')
    }
  })

  /** Verifica non distruttiva dello stato remoto (polling). */
  ipcMain.handle('sync:check', async (): Promise<void> => {
    try {
      await syncCheckRemote()
    } catch (err) {
      log.error('[ipc] sync:check errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante la verifica remota')
    }
  })

  /** Risolve un conflitto secondo la scelta dell'utente. */
  ipcMain.handle(
    'sync:resolve',
    async (_event, { scelta }: { scelta: 'remoto' | 'locale' | 'copia' }): Promise<void> => {
      try {
        await syncResolveConflict(scelta)
      } catch (err) {
        log.error('[ipc] sync:resolve errore:', err)
        throw err instanceof Error ? err : new Error('Errore durante la risoluzione del conflitto')
      }
    }
  )

  /** Abilita la sincronizzazione. */
  ipcMain.handle('sync:enable', async (): Promise<void> => {
    try {
      await syncEnable()
    } catch (err) {
      log.error('[ipc] sync:enable errore:', err)
      throw err instanceof Error ? err : new Error("Errore durante l'abilitazione della sincronizzazione")
    }
  })

  /** Disabilita la sincronizzazione. */
  ipcMain.handle('sync:disable', async (): Promise<void> => {
    try {
      await syncDisable()
    } catch (err) {
      log.error('[ipc] sync:disable errore:', err)
      throw err instanceof Error ? err : new Error('Errore durante la disabilitazione della sincronizzazione')
    }
  })

  /** Aggiorna l'intervallo di polling (in secondi). */
  ipcMain.handle('sync:setPolling', (_event, { sec }: { sec: number }): void => {
    try {
      syncSetPolling(sec)
    } catch (err) {
      log.error('[ipc] sync:setPolling errore:', err)
      throw err instanceof Error ? err : new Error("Errore durante l'aggiornamento dell'intervallo di polling")
    }
  })

  log.info('[ipc] Handler IPC registrati')
}
