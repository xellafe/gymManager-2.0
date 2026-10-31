import { dirname, join } from 'path'
import { statSync } from 'fs'
import { app } from 'electron'
import type { DownloadItem } from 'electron'
import log from 'electron-log'
import { loadSettings, saveSettings } from './store'

/**
 * Cartella in cui aprire «Salva con nome» per una ricevuta:
 * configurata (se esiste) → ultima usata (se esiste) → Download.
 */
export function risolviCartellaRicevute(
  configurata: string,
  ultima: string,
  download: string,
  esiste: (p: string) => boolean
): string {
  if (configurata.trim().length > 0 && esiste(configurata)) return configurata
  if (ultima.trim().length > 0 && esiste(ultima)) return ultima
  return download
}

function esisteCartella(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/**
 * Handler di `will-download`: precompila «Salva con nome» sulla cartella risolta (senza impostare
 * `savePath`, quindi il dialog compare sempre) e, a salvataggio completato, ricorda la cartella usata.
 */
export function gestisciDownload(item: DownloadItem): void {
  let cartella = app.getPath('downloads')
  try {
    const s = loadSettings()
    cartella = risolviCartellaRicevute(
      s.receipt_download_dir,
      s.receipt_last_dir,
      cartella,
      esisteCartella
    )
  } catch (err) {
    log.warn('[ricevute] Errore lettura impostazioni per il download (non bloccante):', err)
  }
  item.setSaveDialogOptions({ defaultPath: join(cartella, item.getFilename()) })

  item.once('done', (_event, state) => {
    if (state !== 'completed') return
    const savePath = item.getSavePath()
    if (!savePath) return
    try {
      saveSettings({ ...loadSettings(), receipt_last_dir: dirname(savePath) })
    } catch (err) {
      log.warn("[ricevute] Impossibile salvare l'ultima cartella usata (non bloccante):", err)
    }
  })
}
