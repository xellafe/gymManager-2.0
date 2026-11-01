# Changelog

Tutte le modifiche rilevanti di GymManager 2.0. Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.1.0/); versionamento [SemVer](https://semver.org/lang/it/) (pre-1.0).

## [0.1.12] — 2026-11-01

### Aggiunto
- **Cartella di salvataggio ricevute** (Impostazioni → sezione ricevute): si può scegliere la cartella su cui si apre «Salva con nome» a ogni salvataggio di una ricevuta, sia da «Scarica» sia dal visualizzatore PDF. Si può comunque cambiare nome o cartella al momento; il salvataggio successivo riparte dalla cartella configurata. Senza cartella configurata, o se non è più disponibile (es. disco esterno scollegato), il dialog si apre sull'**ultima cartella usata** (ricordata anche dopo il riavvio) o sulla cartella Download.

### Modificato
- **«Visualizza» ricevuta**: il PDF si apre in una finestra dell'app con il visualizzatore integrato, invece che fuori dall'app.

### Corretto
- **Ricevute con tutore su due pagine**: con tutore, logo e fino a 5 voci la ricevuta sforava su una seconda pagina e separava la copia cliente dalla copia matrice. Il layout è più compatto e le due copie stanno sulla stessa A4; se una ricevuta è comunque troppo lunga, la copia matrice passa intera alla pagina successiva.

## [0.1.11] — 2026-07-22

### Aggiunto
- **Feedback controllo aggiornamenti**: all'apertura dell'app (e al controllo manuale in Impostazioni) compare uno **snackbar** in basso a destra che rende evidente la verifica — "Controllo aggiornamenti in corso…" e poi l'esito: aggiornamento trovato, **nessun aggiornamento** (prima non c'era alcun riscontro se si era già alla versione più recente) o errore. Le azioni di download/installazione restano gestite dal banner esistente.
- **Pagina Clienti — filtro età**: nuovo filtro per mostrare solo i **minorenni** o solo i **maggiorenni** (i clienti senza data di nascita sono esclusi da entrambe le categorie).
- **Pagina Clienti — conteggi**: viene mostrato il **numero totale** di clienti e, quando i filtri restringono l'elenco, il **rapporto compatto** tra risultati e totale (es. `250/1333`); il totale si aggiorna dopo creazione, import o anonimizzazione.

## [0.1.10] — 2026-07-22

### Aggiunto
- **Import clienti da CSV** (pagina Clienti → "Importa CSV"): caricamento massivo di un elenco di clienti da file CSV. L'import è **puramente additivo** — inserisce solo i clienti nuovi e **non modifica né cancella** quelli esistenti. Il controllo dei duplicati avviene per **codice fiscale**: i CF già presenti in anagrafica vengono **saltati e segnalati**. Flusso **anteprima → conferma**: l'app analizza il file e mostra un riepilogo (nuovi / già presenti / errori) con la tabella delle righe scartate e il relativo motivo **prima** di scrivere; alla conferma vengono importate solo le righe valide. È disponibile un **modello CSV scaricabile** (intestazioni fisse; colonne obbligatorie `codice_fiscale`, `nome`, `cognome`, più campi anagrafici opzionali). Delimitatore `;`/`,` rilevato automaticamente, date in formato `gg/mm/aaaa`, `numero_tessera` assegnata automaticamente se assente (senza collisioni all'interno dello stesso file).

## [0.1.9] — 2026-07-14

### Modificato
- **Numerazione ricevute ancorata all'anno** (invariante 6): il *numero iniziale* configurato in Impostazioni ora vale **solo per l'anno per cui è stato impostato**; un nuovo anno riparte comunque da **1** e non eredita più il valore residuo dell'anno precedente. Se il numero impostato è **maggiore** dell'ultima ricevuta emessa nell'anno, la numerazione **salta in avanti** a quel numero (es. ultima = 3, imposto 8 → la prossima è la 8); se è minore o uguale viene ignorato e si prosegue da `MAX+1`.

### Aggiunto
- **Impostazioni → Numero iniziale ricevute**: il campo propone come default l'**ultimo numero emesso** per l'anno corrente e **impedisce** di inserire un valore inferiore a esso.

## [0.1.8] — 2026-06-28

### Aggiunto
- **Installer macOS**: nuovo target `.dmg` universale (Apple Silicon + Intel) e job di build dedicato su runner `macos-latest` nel workflow di release; al push del tag viene pubblicato sulla stessa release insieme all'installer Windows.

### Modificato
- **Auto-update su macOS**: la build macOS non è firmata, quindi Squirrel.Mac non può auto-installare l'aggiornamento. L'app ora **scarica** comunque il pacchetto (target `zip` + `latest-mac.yml`) e, al posto del riavvio automatico, lo **rivela in Finder** ("Apri in Finder") per l'installazione manuale (trascinare GymManager in Applicazioni). Su Windows l'auto-update resta invariato.

### Note
- macOS: prima apertura via clic destro → Apri (avviso Gatekeeper "sviluppatore non identificato"). Manca ancora `icon.icns`: viene usata l'icona Electron di default.

## [0.1.7] — 2026-06-25

### Corretto
- **Ricevuta in errore con un logo caricato**: un logo pesante (es. foto da fotocamera) faceva fallire la generazione del PDF. Il documento veniva caricato come `data:text/html;base64,…` e, con il logo incluso **due volte** (copia cliente + matrice), superava il tetto di Chromium sulla lunghezza delle URL (`url::kMaxURLChars`, ~2 MB). Ora il logo viene **ridimensionato automaticamente al caricamento** dentro il box di stampa (max **360×192 px**, derivato dal formato della ricevuta) **mantenendo il rapporto d'aspetto** (un solo fattore di scala, solo riduzione), e normalizzato a **PNG**. In export resta una **guardia** che, oltre il limite, dà un errore chiaro e attribuibile invece di fallire in modo opaco.

### Modificato
- **Caricamento logo (Impostazioni)**: selezione ristretta ai formati stampabili (PNG, JPEG, WebP, GIF, SVG), nota informativa sul ridimensionamento e messaggio d'errore in caso di formato non supportato o file illeggibile.

## [0.1.6] — 2026-06-25

### Modificato
- **Ricevuta e pagamento disaccoppiati** (invariante 5): l'eleggibilità di una voce all'emissione **non dipende più dallo stato di pagamento**, ma dal fatto che la voce **non sia già coperta da una ricevuta emessa**. Conseguenze: si possono mettere su un'unica ricevuta voci **pagate e non**; non si possono più creare ricevute duplicate per la stessa voce; emettere o annullare una ricevuta **non altera** il pagamento (annullare libera di nuovo la voce). Lo stato pagato / da incassare si cambia con un **toggle dedicato per riga** su iscrizioni e abbonamenti.
- **Rimosso il pulsante "Emetti ricevuta" per riga** introdotto in 0.1.5 (e l'emissione di voci già pagate via quel pulsante): l'emissione avviene dal CTA della sezione Ricevute, che ora elenca correttamente tutte le voci ancora senza ricevuta.

### Corretto
- **Sincronizzazione Drive che falliva in silenzio**: l'abilitazione inghiottiva gli errori (sync "abilitato" ma non funzionante, senza messaggio). Ora `enableSync` verifica che Drive sia connesso, fa rollback in caso di errore e **mostra il motivo** in Impostazioni → Sincronizzazione (messaggio chiudibile).

## [0.1.5] — 2026-06-25

### Aggiunto
- **"Emetti ricevuta" per riga** nel dettaglio cliente: sulle iscrizioni/abbonamenti attivi compare un pulsante che apre il form di emissione con quella voce **già preselezionata**, senza doverla cercare nella sezione Ricevute. Funziona **anche per le voci già "pagato"** (la ricevuta documenta il pagamento già registrato): il form generale continua però a elencare solo le voci da incassare. *(Rimosso in 0.1.6 a favore del disaccoppiamento ricevuta/pagamento.)*
- **Stato di pagamento negli abbonamenti**: la tabella Abbonamenti del dettaglio cliente ora mostra, accanto al prezzo, se la voce è "pagato" o "da incassare" (come già avviene per l'iscrizione).

### Corretto
- **Auto-update da repo privato**: il controllo aggiornamenti falliva con `404` su `releases.atom`. Su repository privati electron-updater seleziona il provider autenticato (API GitHub) **solo** se trova un token nella configurazione del provider; il solo `requestHeaders` non bastava. Ora il token (PAT read-only iniettato a build time) viene passato via `setFeedURL({ provider: 'github', private: true, token })`, così l'updater usa l'API autenticata invece del feed pubblico.
- **Messaggio d'errore aggiornamento non chiudibile**: il banner d'errore dell'updater (in basso) e il riquadro d'errore in Impostazioni → Informazioni app ora hanno un pulsante di chiusura (✕) per essere rimossi.

> **Nota:** le installazioni **0.1.4** non possono auto-aggiornarsi a 0.1.5 (contengono ancora l'updater difettoso): installare la 0.1.5 **manualmente** una volta; da lì in avanti l'auto-update funziona.

## [0.1.4] — 2026-06-20

Consolidamento post-F7: robustezza backend, funzionalità P1, accessibilità (WCAG 2.1), rifiniture UX e sincronizzazione multi-dispositivo. Raccoglie il lavoro WP1–WP5 e i rilievi B1–B12.

### Aggiunto
- **Sincronizzazione multi-dispositivo via Google Drive**: file di sync dedicato con guardia di versione ottimistica e polling; download automatico all'apertura se il locale è pulito, banner "Ricarica" non bloccante durante l'uso, e gestione conflitti "blocca e chiedi" con 3 scelte (ricarica / sovrascrivi / copia di conflitto). Password mismatch tra dispositivi segnalato senza perdita dati (`SYNC_PASSWORD_MISMATCH`).
- **Tutore come cliente registrato** (B7): il tutore di un minore è ora un cliente collegato via FK `tutore_id` (ricerca/selezione nel form); ricevuta intestata al tutore con indirizzo del tutore e `assistito_cf` del minore. Migrazione `007` (rimozione vecchi campi free-text `tutore_*`).
- **Configurazione backup locale** (B8): cartella di destinazione configurabile, backup periodico opzionale ogni N ore, retention configurabile, oltre al backup alla chiusura.
- **Recovery da migrazione fallita** (B11): alla schermata di accesso, in caso di `MIGRATION_FAILED`, pannello con elenco dei backup locali e "Sfoglia file…" per ripristinare riusando la password inserita.
- **Cambio master password** non distruttivo (B2, PRAGMA rekey) con UI dedicata.
- **Backup e ripristino su Google Drive** dall'app (B3).
- **Comune di nascita con autocompletamento e calcolo del codice fiscale** (B4, dataset `comuni-json`).
- **Emissione ricevuta contestuale** all'assegnazione di iscrizione/abbonamento (B1).
- **Selettore cliente** nella pagina Ricevute (B12) e ricerca per nome nelle tab del Catalogo (B12).
- **Rinnovo iscrizione atomico** via IPC dedicato (C12).
- Personalizzazione tema: derivazione dell'intera scala primaria 50–900 dal colore scelto (N5).

### Modificato
- **Dashboard**: la card "Incassi" degli Indicatori segue il selettore di periodo (B10); il drill-down "Certificati" porta ai certificati **da gestire** (in scadenza + scaduti) con card e lista coerenti (B9).
- **Accessibilità (WP5, WCAG 2.1)**: focus-trap e ripristino del focus nei modali, errori di validazione collegati ai campi, label associate e `aria-required`/`aria-invalid`, stati di caricamento con `role=status`, contrasto migliorato, navigazione da tastiera e `focus-visible` uniformi, tabelle con `scope`/`caption`.
- **UX**: messaggi di validazione specifici per campo e validazione client-side nel form cliente (C7/C8), conferma di scarto alla chiusura dei modali con modifiche non salvate (C10), scroll orizzontale sulle tabelle (C11), blocco/avviso se manca l'indirizzo dell'intestatario all'emissione (B6/C9), file picker nativo e conferma di successo nel ripristino (C6).
- Modifica delle date di iscrizioni/abbonamenti dalla UI (B12).

### Sicurezza
- Cifratura del DB con SQLCipher e gestione della master password in memoria; cambio password senza perdita dati.
- IPC esclusivamente via preload; nessun segreto nel renderer.

### Note
- Alcune funzionalità richiedono verifica manuale su build di produzione (rekey, Google Drive, sync multi-dispositivo, backup periodico, recovery migrazione): vedi `docs/VERIFICHE-MANUALI.md`.
- **Caveat migrazione 007 (B7):** i minori già presenti in DB rilasciati perdono il collegamento al tutore (rimozione dei vecchi campi free-text) e vanno **ri-collegati a mano** selezionando il cliente-tutore; le ricevute già emesse (snapshot) non cambiano.

## [0.1.3] e precedenti
Versioni di sviluppo iniziali (fasi F0–F7): impianto Electron + React + SQLCipher, anagrafica clienti, catalogo, iscrizioni/abbonamenti, ricevute, dashboard, backup locale e impianto auto-update.

[0.1.7]: https://github.com/federicoxella-space/gymManager-2.0/releases/tag/v0.1.7
[0.1.6]: https://github.com/federicoxella-space/gymManager-2.0/releases/tag/v0.1.6
[0.1.5]: https://github.com/federicoxella-space/gymManager-2.0/releases/tag/v0.1.5
[0.1.4]: https://github.com/federicoxella-space/gymManager-2.0/releases/tag/v0.1.4
