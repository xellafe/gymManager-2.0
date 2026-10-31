# Project playbook

## Conventions
- Codice in italiano per il dominio (`cliente`, `iscrizione`, `ricevuta`), stringhe UI sempre in `src/renderer/src/i18n/locales/it.json` (e `en.json`), mai hardcoded.
- Regole di business pure in `src/main/domain/`; accesso al DB solo nei repository `src/main/db/*-repository.ts`.
- Tipi condivisi main/renderer in `src/types/shared.ts`; tipizzazione di `window.api` in `src/renderer/src/types/api.d.ts`.
- TypeScript strict, niente `any` senza motivazione esplicita.
- Test unit in `tests/unit/` (dominio in `tests/unit/domain/`), e2e Playwright su Electron in `tests/e2e/`.
- Ogni modifica al layout della ricevuta va verificata sul caso peggiore (tutore + logo + 5 voci) contando le pagine del PDF generato — il layout di `generaCSS` era al limite (1013 px su ≈1046) e il tutore lo faceva sforare senza che nessun test se ne accorgesse.
- Le asserzioni sul CSS della ricevuta devono coprire ogni valore elencato nella tabella dello spec, non un campione — altrimenti una regressione su regole non campionate (h2, note, separatore) passa inosservata.
- Nei test dei moduli del main che usano più cartelle di sistema, il mock di `app.getPath` deve distinguere il nome (es. `'downloads'` diverso da `'userData'`) — un mock che restituisce sempre lo stesso percorso fa coincidere Download e userData e il ripiego su Download non viene davvero verificato (`tests/unit/cartella-ricevute.test.ts`).

## Patterns
- Nuova operazione esposta al renderer: handler `ipcMain.handle('<area>:<azione>')` in `src/main/ipc/handlers.ts` → metodo in `src/preload/index.ts` → tipo in `src/renderer/src/types/api.d.ts` (es. `clienti:count`).
- Modifica di schema: nuova migrazione `src/main/db/migrations/NNN_<nome>.ts` con `up` e `down`, registrata in `src/main/db/migrations.ts`; mai modificare migrazioni già rilasciate.
- Componenti UI riusabili in `src/renderer/src/components/ui/` (`Modal`, `ConfirmDialog`, `Snackbar`, `Badge`, `SearchInput`).
- I percorsi locali della macchina (`backup_dir`, `receipt_download_dir`) restano solo in `settings.json` e non entrano in `applyAppSettingsToDb` (`src/main/settings/store.ts`): sincronizzati via Drive su un altro PC punterebbero a una cartella inesistente.
- Per aggiornare una sola chiave di `settings.json` dal main usare `saveSettings({ ...loadSettings(), chiave })`, mai scrivere il file a mano (es. `src/main/settings/cartella-ricevute.ts`, `src/main/ipc/handlers.ts`): evita di perdere le altre chiavi.

## Reusable code
- Importi, date e numero ricevuta (main/PDF): `src/main/domain/ricevuta-format.ts` (`formatImporto`, `formatDataIT`, `formatNumeroRicevuta`).
- Codice fiscale: `src/main/domain/codice-fiscale.ts`; comuni: `src/main/domain/comuni.ts`.
- Helper renderer (minorenne, intestatario, nome cliente): `src/renderer/src/utils/dominio.ts`.

## Don'ts
- Non violare le invarianti di dominio di `CLAUDE.md` (iscrizione attiva unica, ricevute immutabili, numerazione senza buchi, anonimizzazione al posto della cancellazione).
- Non indebolire la sicurezza Electron: `contextIsolation: true`, `nodeIntegration: false`, IPC solo via preload.
- Non inventare requisiti: ciò che non è in `docs/` va in `OPEN-QUESTIONS.md` con un'assunzione marcata.
- Non toccare `.github/workflows/release.yml` né la versione in `package.json` fuori da una release.
- Non modificare `LOGO_BOX_WIDTH_PX`/`LOGO_BOX_HEIGHT_PX` per guadagnare spazio nella ricevuta — in `src/main/domain/ricevuta.ts` sono la sorgente unica anche del ridimensionamento del logo; cambiarle altera i loghi già caricati.
- Non passare blob/data URL a `shell.openExternal` in `setWindowOpenHandler` (`src/main/index.ts`): i blob URL del renderer non esistono fuori dall'app.
- Ogni finestra aperta con `action: 'allow'` in `setWindowOpenHandler` deve ricevere un proprio handler che nega `window.open` e la navigazione esterna (`did-create-window`): senza restrizioni un link nel contenuto caricherebbe un sito remoto in una finestra dell'app.

## Definition of Done
- [gate] Build, lint and tests are green.
- [code] Every acceptance criterion has an automated test or a precise manual step.
- [security] No secrets in code or committed configuration.
- [gate] `npm run verify` è verde.
- [code] Ogni regola di dominio nuova o modificata ha un test Vitest in `tests/unit/`.
- [code] Le modifiche di schema hanno una migrazione con `up`/`down` e un test.
- [ux] Nessuna stringa UI hardcoded: chiavi presenti in `it.json` ed `en.json`.
- [ui] Importi nel formato `1.234,56 €`, date `gg/mm/aaaa`.
- [security] Nessuna nuova API Node esposta al renderer fuori dal preload.
