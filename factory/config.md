---
base_branch: main
forge: github          # github | gitlab | azure | git
forge_host: ""         # self-hosted only, e.g. gitlab.company.com
azure_org: ""          # Azure DevOps Server only: collection URL
azure_project: ""      # Azure DevOps Server only: project name
build: npm run typecheck && npm run build:electron
lint: npm run lint
test: npm test
ui_review: static      # none | static | browser
dev_server: ""         # browser only, e.g. npm run dev
base_url: ""           # browser only, e.g. http://localhost:5173
max_rounds: 2          # rework rounds after the first review
implementer_model: sonnet / medium  # <model> / <effort>: model of the implementers
escalation_model: opus / medium     # <model> / <effort>: complex tasks and escalated tasks
release: "off"         # auto | off — automatic tag + release on every merged PR (github, gitlab)
workspace: branch      # ask | branch | worktree — where a new feature runs
worktree_setup: "npm ci"  # worktree only: command run in a new worktree, e.g. npm ci (empty = none)
---
Notes for every agent:
- App desktop Electron (main + preload + renderer React). Il renderer non gira in un browser
  normale: dipende da `window.api` esposto dal preload. Per questo `ui_review` è `static`.
- `build` = `typecheck` + `build:electron` (bundle Vite); lo script `build` completo include anche
  il packaging `electron-builder` ed è lento: non serve alla factory. `npm run verify` esegue gli
  stessi passi più lint e test.
- `release: off`: le release restano manuali (bump `package.json` + `CHANGELOG.md`, tag `v*`,
  `.github/workflows/release.yml` compila gli installer letti da electron-updater). La factory non
  crea tag né release.
- Modulo nativo `better-sqlite3-multiple-ciphers`: i test Vitest richiedono il build per l'ABI di
  Node, Electron quello per l'ABI di Electron (vedi i commenti in `.github/workflows/ci.yml`).
  Se i test falliscono con un errore di `NODE_MODULE_VERSION`, eseguire
  `npm rebuild better-sqlite3-multiple-ciphers`.
- La conoscenza autorevole è in `docs/` (SPEC, DOMAIN-MODEL, FUNZIONALITA, DECISIONS) e in
  `CLAUDE.md` (invarianti di dominio). Requisiti mancanti → `OPEN-QUESTIONS.md`.
- Non toccare `out/`, `dist/`, `playwright-report/`, `test-results/` (artefatti generati).

## Commit rules
Conventional commits (`feat`/`fix`/`test`/`docs`/`chore`) con scope di dominio, soggetto in
italiano, es. `feat(clienti): filtro età in listClienti`.
