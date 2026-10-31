# Project playbook

## Conventions
- Codice in italiano per il dominio (`cliente`, `iscrizione`, `ricevuta`), stringhe UI sempre in `src/renderer/src/i18n/locales/it.json` (e `en.json`), mai hardcoded.
- Regole di business pure in `src/main/domain/`; accesso al DB solo nei repository `src/main/db/*-repository.ts`.
- Tipi condivisi main/renderer in `src/types/shared.ts`; tipizzazione di `window.api` in `src/renderer/src/types/api.d.ts`.
- TypeScript strict, niente `any` senza motivazione esplicita.
- Test unit in `tests/unit/` (dominio in `tests/unit/domain/`), e2e Playwright su Electron in `tests/e2e/`.

## Patterns
- Nuova operazione esposta al renderer: handler `ipcMain.handle('<area>:<azione>')` in `src/main/ipc/handlers.ts` → metodo in `src/preload/index.ts` → tipo in `src/renderer/src/types/api.d.ts` (es. `clienti:count`).
- Modifica di schema: nuova migrazione `src/main/db/migrations/NNN_<nome>.ts` con `up` e `down`, registrata in `src/main/db/migrations.ts`; mai modificare migrazioni già rilasciate.
- Componenti UI riusabili in `src/renderer/src/components/ui/` (`Modal`, `ConfirmDialog`, `Snackbar`, `Badge`, `SearchInput`).

## Reusable code
- Importi, date e numero ricevuta (main/PDF): `src/main/domain/ricevuta-format.ts` (`formatImporto`, `formatDataIT`, `formatNumeroRicevuta`).
- Codice fiscale: `src/main/domain/codice-fiscale.ts`; comuni: `src/main/domain/comuni.ts`.
- Helper renderer (minorenne, intestatario, nome cliente): `src/renderer/src/utils/dominio.ts`.

## Don'ts
- Non violare le invarianti di dominio di `CLAUDE.md` (iscrizione attiva unica, ricevute immutabili, numerazione senza buchi, anonimizzazione al posto della cancellazione).
- Non indebolire la sicurezza Electron: `contextIsolation: true`, `nodeIntegration: false`, IPC solo via preload.
- Non inventare requisiti: ciò che non è in `docs/` va in `OPEN-QUESTIONS.md` con un'assunzione marcata.
- Non toccare `.github/workflows/release.yml` né la versione in `package.json` fuori da una release.

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
