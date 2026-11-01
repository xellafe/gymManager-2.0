import { app } from 'electron'
import changelogMd from '../../../CHANGELOG.md?raw'
import { checkFirstRun } from '../db/database'
import { isVersioneValida, parseChangelog, selezionaNovita } from '../domain/changelog'
import { loadSettings, saveSettings } from '../settings/store'
import type { VoceChangelog } from '../../types/shared'

function salvaVersioneVista(versione: string): void {
  saveSettings({ ...loadSettings(), last_seen_version: versione })
}

/**
 * Da chiamare all'avvio: su una nuova installazione (nessuna versione registrata e DB assente)
 * registra la versione corrente, così non c'è nulla da mostrare.
 */
export function inizializzaVersioneVista(): void {
  if (loadSettings().last_seen_version === '' && checkFirstRun()) {
    salvaVersioneVista(app.getVersion())
  }
}

/** Novità non ancora viste. Se non c'è nulla da mostrare registra subito la versione corrente. */
export function getNovitaDaMostrare(testo: string = changelogMd): VoceChangelog[] {
  const corrente = app.getVersion()
  const vista = loadSettings().last_seen_version
  if (vista === corrente) return []
  const precedente = isVersioneValida(vista) ? vista : null
  const novita = selezionaNovita(parseChangelog(testo), corrente, precedente)
  if (novita.length === 0) salvaVersioneVista(corrente)
  return novita
}

/** Registra la versione corrente come vista. */
export function segnaVersioneVista(): void {
  salvaVersioneVista(app.getVersion())
}

/** Note della sola versione installata (0 o 1 voce); non scrive. */
export function getNovitaVersioneCorrente(testo: string = changelogMd): VoceChangelog[] {
  return selezionaNovita(parseChangelog(testo), app.getVersion(), null)
}
