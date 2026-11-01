import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { closeDatabase, isDatabaseOpen } from './db/database'
import { registerIpcHandlers } from './ipc/handlers'
import { loadSettings } from './settings/store'
import { gestisciDownload } from './settings/cartella-ricevute'
import { inizializzaVersioneVista } from './changelog/changelog-service'
import { backupAutomatico } from './backup/backup-service'
import { stopBackupScheduler } from './backup/backup-scheduler'
import { initAutoUpdater } from './updater/auto-updater'
import { initSyncService, upload as syncUpload } from './sync/sync-service'
import { loadSyncState, isLocalDirty } from './sync/sync-state'

function createWindow(): BrowserWindow {
  const preloadPath = join(__dirname, '../preload/index.js')

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:false necessario perché il preload usa require() di Node.js
      // (ipcRenderer da 'electron', @electron-toolkit/preload). Con sandbox:true
      // il preload avrebbe accesso solo alle API Electron esposte come globali.
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // Inizializza l'auto-updater dopo che la finestra è visibile
    initAutoUpdater(mainWindow)
    // Inizializza il servizio di sincronizzazione Drive (riferimento finestra per gli eventi)
    initSyncService(mainWindow)
  })

  // I blob URL (PDF delle ricevute) esistono solo nel renderer: si aprono in una finestra
  // dell'app con il visualizzatore PDF integrato. Gli altri link vanno nel browser di sistema.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
        }
      }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // In sviluppo usa il dev server di Vite; in produzione carica il file statico
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// Inizializzazione dell'app
app.whenReady().then(() => {
  // Imposta l'App User Model ID (usato da Windows per notifiche/taskbar)
  electronApp.setAppUserModelId('it.gymmanager.app')

  // Ottimizzazioni (DevTools con F12 in dev, ignora Ctrl+R in prod, ecc.)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Registra tutti gli handler IPC prima di creare la finestra
  registerIpcHandlers()

  // «Salva con nome» delle ricevute (Scarica e visualizzatore PDF) parte dalla cartella risolta
  session.defaultSession.on('will-download', (_e, item) => gestisciDownload(item))

  // Nuova installazione: registra la versione corrente prima che il DB venga creato
  try {
    inizializzaVersioneVista()
  } catch (err) {
    log.warn('[main] Inizializzazione versione vista fallita (non bloccante):', err)
  }

  createWindow()

  app.on('activate', () => {
    // Su macOS è comune ricreare la finestra quando si clicca sull'icona nel dock
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  log.info('[main] Tutte le finestre chiuse')

  // Ferma il timer periodico: evita che un tick parta mentre il DB si sta chiudendo.
  stopBackupScheduler()

  // Backup automatico alla chiusura se settings.backup_on_close === 'true' e DB aperto
  if (isDatabaseOpen()) {
    try {
      const settings = loadSettings()
      if (settings.backup_on_close !== false) {
        // Esegui in modo sincrono tramite void: non blocca la chiusura
        backupAutomatico()
          .then((p) => log.info(`[main] Backup automatico chiusura completato: ${p}`))
          .catch((err) => log.warn('[main] Backup automatico chiusura fallito (non bloccante):', err))
      }
    } catch (err) {
      log.warn('[main] Errore lettura settings per backup chiusura:', err)
    }

    // Upload best-effort del sync alla chiusura, se abilitato e con modifiche locali.
    // NB: stesso pattern best-effort del backup-on-close: il promise non è atteso, quindi
    // la chiusura non viene rallentata. La garanzia di upload è data da "Sincronizza ora"
    // e dal polling; questo è solo un tentativo opportunistico.
    try {
      const syncState = loadSyncState()
      if (syncState.enabled && isLocalDirty(syncState)) {
        syncUpload()
          .then(() => log.info('[main] Upload sync alla chiusura completato'))
          .catch((err) => log.warn('[main] Upload sync alla chiusura fallito (non bloccante):', err))
      }
    } catch (err) {
      log.warn('[main] Errore valutazione sync per chiusura:', err)
    }
  }

  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Gestione errori non catturati nel main process
process.on('uncaughtException', (err) => {
  log.error('[main] Errore non catturato:', err)
})

process.on('unhandledRejection', (reason) => {
  log.error('[main] Promise rejection non gestita:', reason)
})
