# Units Formula Migration CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A self-contained, interactive CLI (in `.migration/`, zero impact on front/back) that migrates the formula fields of **170,096 units across 853 blocks** to the DB, **block by block**, with per-phase yes/no/yes-to-all gating, spinners/progress bars, full logging to file, per-block JSONL snapshots, and a complete rollback path.

**Architecture:** `.migration/` is an isolated Node ESM package with its own `package.json`/`node_modules` (gitignored). It **replicates** (copies, never imports) the pure formula functions from `components/units/datasheet-units-table.tsx`. CLI built on **oclif** (commands/flags) + **@inquirer/prompts** (gating/navigation) + **ora** (spinners) + **cli-progress** (bars) + **chalk**/**cli-table3** (diff tables) + **pino** (file logs). Per block: fetch → `original.jsonl` → apply formulas → `corrected.jsonl` → `diff.jsonl` → PUT one-by-one → `put-results.jsonl`, with checkpoint/resume. Rollback re-PUTs `original.jsonl`.

**Tech stack:** Node ≥20 (the repo requires it), ESM JavaScript (no TS build step), oclif, @inquirer/prompts, ora, cli-progress, chalk, cli-table3, pino, pino-pretty.

**Non-negotiables:**
- **Do NOT modify any file outside `.migration/`** except a single `.gitignore` line. The formula functions are **copied**, not refactored out of the component.
- **Idempotent**: only PUT fields that changed (tolerance 0.01); re-runs are safe.
- **Only derived/formula fields** are written — never user inputs (exception: lote `unitSizeM2 = landM2`, which the formula corrects by design).
- Every run writes immutable artifacts under `.migration/runs/<timestamp>/`.

**Source of truth for formulas (copy from here):** `components/units/datasheet-units-table.tsx`
- Constants: `PARKING_M2_PER_SPACE` (L72 = `12.5`), `VAT_RATE` (L397 = `1.092`), `INSTALLMENT_*` (L400-403).
- Functions L359-L636: `roundTo2`, `syncUnitParkingSize`, `syncUnitTotalSize`, `syncUnitHabitableConstruction`, `removeVat`, `applyVat`, `syncUnitPriceFromTotal`, `syncUnitRentalFromTotal`, `maintenanceWithoutVatUsd`, `syncUnitMaintenancePerM2`, `syncUnitInstallment`, `syncUnitIncome`, `syncUnitAbsorption`, `syncUnitAbsorptionPerM2`, `RECONCILED_FORMULA_FIELDS` (L586), `ensureUnitFormulasSynced` (L640).
- `getVatRate` (L1076-1086).
- From `lib/constants.ts`: `M2_TO_VARAS_SQUARED = 1.431`, `M_TO_VARAS = 1.19`, `getVarasFactor`.
- Persisted-field rule: `lib/api/strapi.ts` `CLIENT_ONLY_USD_FIELDS = {"maintenanceWithoutVATUSD"}` (L23) — never PUT these.

---

## File Structure (all under `.migration/`)

```
.migration/
  package.json            bin/run.js            .env.example
  README.md               .gitignore (local: node_modules, runs)
  src/
    commands/  dry-run.js  run.js  rollback.js  status.js
    core/      formulas.js  fields.js  strapi.js  logger.js  gate.js  pipeline.js  paths.js
    formulas.parity.test.mjs
  runs/<ts>/  run.log  run.ndjson  manifest.json  progress.json
              blocks/<blockId>/ original.jsonl corrected.jsonl diff.jsonl put-results.jsonl
```

Each `core/*` module has one responsibility. Commands are thin: they wire core modules + interactive UI.

---

## Task 1: Scaffold the isolated `.migration/` package

**Files:** create `.migration/package.json`, `.migration/.gitignore`, `.migration/.env.example`, `.migration/bin/run.js`, `.migration/README.md`; modify root `.gitignore` (one line).

- [ ] **Step 1: `.migration/package.json`**
```json
{
  "name": "units-migration-cli",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "bin": { "migrate": "./bin/run.js" },
  "scripts": { "migrate": "node ./bin/run.js", "test:parity": "node ./src/formulas.parity.test.mjs" },
  "dependencies": {
    "@oclif/core": "^4",
    "@inquirer/prompts": "^7",
    "ora": "^8",
    "cli-progress": "^3",
    "chalk": "^5",
    "cli-table3": "^0.6",
    "pino": "^9",
    "pino-pretty": "^13",
    "dotenv": "^16"
  }
}
```

- [ ] **Step 2: `.migration/.gitignore`**
```
node_modules/
runs/
.env
```

- [ ] **Step 3: Root `.gitignore`** — append exactly one line (the only edit outside `.migration/`):
```
.migration/node_modules/
```
(Run: confirm with `git status` that nothing else in the project changed.)

- [ ] **Step 4: `.migration/.env.example`**
```
# Apunta al Strapi destino (staging para ensayo, prod para la corrida real)
STRAPI_URL=https://your-strapi-host
# Opción A (recomendada): API token con permiso read+update sobre Unit
STRAPI_API_TOKEN=
# Opción B (fallback): credenciales de admin (se usa /content-manager)
STRAPI_USERNAME=
STRAPI_PASSWORD=
# Concurrencia de PUTs por bloque
PUT_CONCURRENCY=8
```

- [ ] **Step 5: `.migration/bin/run.js`** (oclif entrypoint)
```js
#!/usr/bin/env node
import { execute } from '@oclif/core'
await execute({ dir: import.meta.url })
```
Add oclif config to `package.json` (`"oclif": { "bin": "migrate", "commands": "./src/commands", "topicSeparator": " " }`).

- [ ] **Step 6: `.migration/README.md`** — document install (`cd .migration && npm install`), the safe workflow (dry-run → single block → full → verify in UI), and rollback. (Full text in Task 12.)

- [ ] **Step 7: Install & smoke test**
Run: `cd .migration && npm install && node ./bin/run.js --help`
Expected: oclif help lists commands (after later tasks add them; for now it runs without crashing).

- [ ] **Step 8: Commit** — `git add .migration .gitignore && git commit -m "chore(migration): scaffold isolated units-migration CLI package"`

---

## Task 2: `core/formulas.js` — replicate the pure formula engine

**Files:** create `.migration/src/core/formulas.js`.

The engine must be a **faithful copy** of the source functions (do NOT re-derive). Procedure:

- [ ] **Step 1: Copy constants & helpers** — port these verbatim, removing TypeScript type annotations (`: number`, `: Record<string, unknown>`, `: void`, `as any`, generics). From `lib/constants.ts`: `M2_TO_VARAS_SQUARED = 1.431`, `M_TO_VARAS = 1.19`, and `getVarasFactor` (with its `LINEAR_VARAS_KEYS`). From the component: `PARKING_M2_PER_SPACE = 12.5`, `VAT_RATE = 1.092`, `INSTALLMENT_ANNUAL_RATE = 0.075`, `INSTALLMENT_YEARS = 20`, `INSTALLMENT_NPER = 240`, `INSTALLMENT_LOAN_RATIO = 0.9`.

- [ ] **Step 2: Copy functions L359-L636** from `components/units/datasheet-units-table.tsx` verbatim (strip types): `roundTo2`, `syncUnitParkingSize`, `syncUnitTotalSize`, `syncUnitHabitableConstruction`, `removeVat`, `applyVat`, `syncUnitPriceFromTotal`, `syncUnitRentalFromTotal`, `maintenanceWithoutVatUsd`, `syncUnitMaintenancePerM2`, `syncUnitInstallment`, `syncUnitIncome`, `syncUnitAbsorption`, `syncUnitAbsorptionPerM2`, and `ensureUnitFormulasSynced` (L640; keep its `RECONCILED_FORMULA_FIELDS` exactly as in source — i.e. **without** `maintenanceWithoutVATUSD`). Read the exact current source before copying.

- [ ] **Step 3: Copy `getVatRate`** (component L1076-1086) as a standalone export:
```js
export function getVatRate(quarter, category, usageName) {
  const isInterior = quarter ? ['S1', 'S2'].includes(quarter) : false
  const isLote = !!(category && category.toLowerCase().includes('lote'))
  if (isInterior && isLote) return 1.12
  const usage = (usageName || '').toLowerCase()
  if (usage.includes('renta')) return 1.12
  if (usage.includes('venta')) return 0.916
  return 1.12
}
```

- [ ] **Step 4: Add block-context helpers** (mirror the page logic at `app/(main)/units/list/[id]/page.tsx` L119-121):
```js
export function isVerticalBlock(categoryName, categoryCode) {
  const s = `${categoryName || ''} ${categoryCode || ''}`.toLowerCase()
  return s.includes('vertical') || s.includes('vert')
}
export function isLoteBlock(categoryName, categoryCode) {
  const s = `${categoryName || ''} ${categoryCode || ''}`.toLowerCase()
  return s.includes('lote') || s.includes('lot')
}
```

- [ ] **Step 5: Export** `ensureUnitFormulasSynced`, `getVatRate`, `isVerticalBlock`, `isLoteBlock`, `roundTo2`, and `RECONCILED_FORMULA_FIELDS`.

- [ ] **Step 6: Commit** — `git commit -m "feat(migration): replicate pure unit-formula engine"`

---

## Task 3: `core/fields.js` + parity test

**Files:** create `.migration/src/core/fields.js`, `.migration/src/formulas.parity.test.mjs`.

- [ ] **Step 1: `core/fields.js`** — the set of **persisted** formula fields the migration may write (formulaFields from handleSave minus client-only, minus pure inputs we don't recompute). Define and export:
```js
// Campos derivados que la migración puede escribir (persistidos por Strapi).
// Excluye maintenanceWithoutVATUSD (client-only, ver lib/api/strapi.ts).
export const PERSISTED_FORMULA_FIELDS = [
  'parkingSizeM2', 'totalSizeM2', 'habitableConstructionM2',
  'priceWithoutVATUSD', 'pricePerM2USD',
  'rentalPriceWithoutVATUSD',
  'maintenancePricePerM2USD',
  'installmentUSD', 'incomeUSD',
  'unitAbsorption', 'absorptionPerM2',
  'unitSizeM2', // lote: unitSize = terreno
  'landM2',     // lote: land = unitSize (espejo bidireccional)
]
export const CHANGE_TOLERANCE = 0.01
```

- [ ] **Step 2: `formulas.parity.test.mjs`** — assert the engine produces the expected values on 3 hand-computed units (vertical, horizontal, lote). This catches transcription errors from the copy.
```js
import assert from 'node:assert'
import { ensureUnitFormulasSynced, getVatRate } from './core/formulas.js'

// Horizontal: habitable = unitSize; total = habitable (+0)
{
  const u = { unitSizeM2: 60, parkingSpaces: 2, totalPriceUSD: 100000 }
  ensureUnitFormulasSynced(u, {}, false, getVatRate('T1', 'Casas', 'Uso Venta'), false)
  assert.strictEqual(u.habitableConstructionM2, 60, 'horiz habitable')
  assert.strictEqual(u.totalSizeM2, 60, 'horiz total (no parking)')
  assert.strictEqual(u.parkingSizeM2, 25, 'horiz parking size')
}
// Vertical: habitable = unitSize + balcón; total = habitable + parqueo
{
  const u = { unitSizeM2: 60, parkingSpaces: 2, unitType: [{ __component: 'unit-types.housing', balconyTerraceSizeM2: 10 }] }
  ensureUnitFormulasSynced(u, {}, true, 1.092, false)
  assert.strictEqual(u.habitableConstructionM2, 70, 'vert habitable +balcón')
  assert.strictEqual(u.totalSizeM2, 95, 'vert total = 70 + 25')
}
// Lote: unitSize = terreno = total
{
  const u = { unitSizeM2: 0, landM2: 120, parkingSpaces: 0 }
  ensureUnitFormulasSynced(u, {}, false, 1.12, true)
  assert.strictEqual(u.unitSizeM2, 120, 'lote unitSize = terreno')
  assert.strictEqual(u.habitableConstructionM2, 120, 'lote habitable = terreno')
  assert.strictEqual(u.totalSizeM2, 120, 'lote total = terreno')
}
console.log('parity OK')
```

- [ ] **Step 3: Run** — `cd .migration && node ./src/formulas.parity.test.mjs`
Expected: `parity OK` (no assertion failures). If any fails, the copy diverged — fix `formulas.js` to match source.

- [ ] **Step 4: Commit** — `git commit -m "feat(migration): persisted-field set + formula parity test"`

---

## Task 4: `core/strapi.js` — auth, fetch, put, backoff

**Files:** create `.migration/src/core/strapi.js`.

- [ ] **Step 1: Auth (supports both modes)** — read `.env`. If `STRAPI_API_TOKEN` present → REST mode (`/api/...`, `Authorization: Bearer <token>`). Else if `STRAPI_USERNAME/PASSWORD` → admin mode (`POST /admin/login` → JWT → `/content-manager/collection-types/api::unit.unit/...`). Expose a uniform interface so callers don't care:
```js
// listBlocks() -> [{ documentId, id, quarter, categoryName, categoryCode, name }]
// listUnitsForBlock(blockDocumentId) -> StrapiUnit[]  (paginated, with unitUsage + unitType populated)
// putUnit(documentId, dataObj) -> { ok, status }   (only the changed fields)
```
REST endpoints:
- Blocks: `GET /api/blocks?populate[blockCategory]=true&fields[0]=quarter&pagination[pageSize]=100&pagination[page]=N`
- Units: `GET /api/units?filters[block][documentId][$eq]=<id>&populate[unitUsage]=true&populate[unitType]=true&pagination[pageSize]=100&pagination[page]=N`
- Put: `PUT /api/units/<documentId>` body `{ data: <changed fields> }`
Admin endpoints (fallback): `GET/PUT /content-manager/collection-types/api::block.block` and `api::unit.unit` (same populate/filter semantics; cache the admin JWT, re-login on 401 once — mirror `app/api/blocks/generate-code/route.ts`).

- [ ] **Step 2: Pagination** — `listUnitsForBlock` loops pages until `meta.pagination.page >= pageCount`, concatenating results. Same for `listBlocks`.

- [ ] **Step 3: `putUnit` with backoff** — on 429/502/503/504, retry up to 5× with exponential backoff (250ms, 500ms, 1s, 2s, 4s). On 4xx (other), return `{ ok:false, status }` without retry. Respect a module-level concurrency limiter (simple promise pool, size from `PUT_CONCURRENCY`).

- [ ] **Step 4: Smoke test** — `node -e "import('./src/core/strapi.js').then(async m=>{const b=await m.listBlocks(); console.log('blocks:', b.length)})"` against the configured Strapi.
Expected: prints the block count (≈853). If auth fails, surface a clear error telling the user which env vars are missing.

- [ ] **Step 5: Commit** — `git commit -m "feat(migration): strapi client (api-token + admin auth, paginate, put+backoff)"`

---

## Task 5: `core/logger.js` + `core/paths.js`

**Files:** create `.migration/src/core/logger.js`, `.migration/src/core/paths.js`.

- [ ] **Step 1: `paths.js`** — compute run dirs. `newRunDir()` → `runs/<YYYY-MM-DD_HHmm>/` (timestamp passed in, since Date is fine in a real CLI). Helpers: `blockDir(runDir, blockId)`, ensure dirs exist (`fs.mkdirSync recursive`). JSONL append helper `appendJsonl(file, obj)`.

- [ ] **Step 2: `logger.js`** — a pino logger writing to `run.ndjson` (structured) **and** a human line to console + `run.log` (tee). API: `log.info(msg, data?)`, `log.warn`, `log.error`, `log.phase(name)`. Console uses pino-pretty; file `run.log` gets the same human-readable lines. Everything that happens (fetch counts, each PUT result, gate decisions, errors) goes through this.

- [ ] **Step 3: Commit** — `git commit -m "feat(migration): run paths + tee logger (console + run.log + ndjson)"`

---

## Task 6: `core/gate.js` — yes / no / yes-to-all

**Files:** create `.migration/src/core/gate.js`.

- [ ] **Step 1: Implement** a stateful gate using `@inquirer/prompts` `expand` (single-key). It remembers "yes-to-all":
```js
import { expand } from '@inquirer/prompts'
export function createGate({ assumeYes = false } = {}) {
  let all = assumeYes
  return async function gate(phaseLabel) {
    if (all) return 'continue'
    const ans = await expand({
      message: `${phaseLabel} — ¿continuar?`,
      default: 's',
      choices: [
        { key: 's', name: 'Sí (avanzar)', value: 'continue' },
        { key: 'n', name: 'No (interrumpir)', value: 'abort' },
        { key: 'a', name: 'Sí a todo (no preguntar más)', value: 'all' },
      ],
    })
    if (ans === 'all') { all = true; return 'continue' }
    return ans // 'continue' | 'abort'
  }
}
```
`--yes` flag → `assumeYes:true` (fully non-interactive). `abort` bubbles up to stop the run (checkpoint already saved).

- [ ] **Step 2: Commit** — `git commit -m "feat(migration): interactive gate (sí / no / sí-a-todo)"`

---

## Task 7: `core/pipeline.js` — per-block phases

**Files:** create `.migration/src/core/pipeline.js`.

- [ ] **Step 1: `processBlock(block, ctx)`** where `ctx = { runDir, log, gate, strapi, dryRun, spinner, progress }`. Phases, each followed by `await gate(label)` (abort → throw `AbortError`):
  1. **Fetch** (ora spinner): `units = await strapi.listUnitsForBlock(block.documentId)`; write each to `original.jsonl`. Log `N unidades`.
  2. **Align**: stable-sort units by `unitNumber`/`documentId`; (the JSONL is the aligned artifact). 
  3. **Formulas**: for each unit compute `isVertical/isLote` from block, `vatRate = getVatRate(block.quarter, block.categoryName, unit.unitUsage?.name)`, clone the unit, run `ensureUnitFormulasSynced(clone, {collectionDate, startDate}, isVertical, vatRate, isLote)`; write clone to `corrected.jsonl`.
  4. **Diff**: for each unit, compare original vs corrected over `PERSISTED_FORMULA_FIELDS` with `CHANGE_TOLERANCE`; collect `{documentId, unitNumber, changes:[{field,before,after}]}`; write changed ones to `diff.jsonl`; render a `cli-table3` summary (first ~10 rows + totals) with chalk colors.
  5. **PUT** (skipped if `dryRun`): a `cli-progress` bar over changed units; for each, `await strapi.putUnit(documentId, changedFieldsObj)` through the concurrency pool; append `{documentId, status, ms, error?}` to `put-results.jsonl`; log failures.
- [ ] **Step 2: Block context** — `collectionDate/startDate` for absorption come from the block (`block.collectionDate`, `block.startDate` if present; else undefined → absorption stays 0, same as UI). Populate these in `listBlocks`/`listUnitsForBlock` if available.
- [ ] **Step 3: Return** `{ blockId, units: N, changed: M, written: W, failed: F }` for the manifest.
- [ ] **Step 4: Commit** — `git commit -m "feat(migration): per-block pipeline (fetch→formulas→diff→put) with spinners/progress"`

---

## Task 8: `commands/dry-run.js`

**Files:** create `.migration/src/commands/dry-run.js`.

- [ ] **Step 1:** oclif Command. Flags: `--block <id>` (single), `--from-block <n>`, `--limit <n>`. Creates a run dir, iterates blocks (gate runs but PUT phase is skipped via `dryRun:true`), writes `original/corrected/diff` and a `manifest.json` with totals (blocks, units, would-change). Prints a final summary table: total units, total to change, by-field counts. **Writes nothing to Strapi.**
- [ ] **Step 2: Verify** — `node ./bin/run.js dry-run --block <oneRealBlockId>` against staging/prod: confirms artifacts created under `runs/<ts>/blocks/<id>/` and the diff matches what the UI reconciliation shows for that block.
- [ ] **Step 3: Commit** — `git commit -m "feat(migration): dry-run command (no writes, full diff + manifest)"`

---

## Task 9: `commands/run.js` — interactive migration + resume

**Files:** create `.migration/src/commands/run.js`.

- [ ] **Step 1:** oclif Command. Flags: `--yes` (assume yes-to-all), `--block <id>`, `--from-block <n>`, `--resume <runTs>`, `--concurrency <n>`. Behavior:
  - If `--resume`, reuse that run dir + `progress.json` (skip blocks already in it). Else create a new run dir.
  - `listBlocks()`, iterate; for each not-yet-done block call `processBlock(..., {dryRun:false})`; on success append blockId to `progress.json` and a row to `manifest.json`.
  - `AbortError` (gate `no`) → print "interrumpido; reanudá con --resume <ts>" and exit 0 (checkpoint intact).
  - Top-level overall `cli-progress` bar `bloque X/853`.
- [ ] **Step 2: Optional interactive menu** — if invoked as `run` with no flags, first show an `@inquirer/prompts` `select`: Dry-run / Migrar / Rollback / Estado (delegating to the other commands). (Keep thin.)
- [ ] **Step 3: Verify on ONE block** — `node ./bin/run.js run --block <id>` on staging (or prod in the freeze window): step through phases with the gate, confirm the PUTs succeed (`put-results.jsonl` all `ok`), then open that block in the admin UI → **zero yellow** (reconciliation clean). This is the end-to-end proof.
- [ ] **Step 4: Commit** — `git commit -m "feat(migration): interactive run command with checkpoint/resume"`

---

## Task 10: `commands/rollback.js`

**Files:** create `.migration/src/commands/rollback.js`.

- [ ] **Step 1:** oclif Command. Flags: `--run <ts>` (required), `--block <id>`, `--all`, `--yes`. Interactive when flags omitted: `select` the run, then scope (todo / un bloque / rango). For each target block, read `original.jsonl`; for each unit, PUT the **original** values of `PERSISTED_FORMULA_FIELDS` that the migration had changed (intersect with that block's `diff.jsonl` so only migrated fields are restored). Progress bar + `rollback-results.jsonl` + `rollback.log`. Same gate.
- [ ] **Step 2: Verify** — after rollback of the test block, re-fetch and assert the restored values equal `original.jsonl` (the command prints a ✓/✗ per unit and a summary).
- [ ] **Step 3: Commit** — `git commit -m "feat(migration): rollback command (re-PUT originals, scoped, verified)"`

---

## Task 11: `commands/status.js`

**Files:** create `.migration/src/commands/status.js`.

- [ ] **Step 1:** oclif Command. Flag `--run <ts>` (or interactive `select` of a run). Reads `manifest.json`/`progress.json` and prints: blocks done / total, units processed, changed, written, failed, and a list of blocks with failures (from `put-results.jsonl`). Helps decide what to `--resume` or re-run.
- [ ] **Step 2: Commit** — `git commit -m "feat(migration): status command"`

---

## Task 12: README + safe-workflow doc

**Files:** finalize `.migration/README.md`.

- [ ] **Step 1:** Document, in Spanish:
  - **Setup**: `cd .migration && npm install`, copy `.env.example` → `.env`, fill `STRAPI_URL` + (`STRAPI_API_TOKEN` **or** `STRAPI_USERNAME/PASSWORD`).
  - **Auth**: how to create a Strapi API token (Settings → API Tokens → read+update on Unit). Note admin fallback.
  - **Safe workflow** (recommended order):
    1. `npm run test:parity`
    2. `node ./bin/run.js dry-run --block <id>` then full `dry-run` to size the change.
    3. `node ./bin/run.js run --block <id>` on ONE block → verify zero-yellow in the admin UI.
    4. **Freeze window** (no concurrent user edits) → `node ./bin/run.js run` → review block 1 with the gate → `sí a todo`.
    5. `status` to confirm; `--resume <ts>` if interrupted.
  - **Rollback**: `node ./bin/run.js rollback --run <ts> [--block <id> | --all]` re-uploads the originals; verified per unit.
  - **Artifacts**: explain `original.jsonl` (backup + rollback source), `corrected.jsonl`, `diff.jsonl`, `put-results.jsonl`, `run.log`.
- [ ] **Step 2: Commit** — `git commit -m "docs(migration): README with setup, safe workflow, rollback"`

---

## Final verification (whole deliverable)

- `.gitignore` shows only the project changed line is `.migration/node_modules/`; everything else lives in `.migration/` (`git status` clean of project files).
- `npm run test:parity` passes.
- `dry-run --block <id>` and `run --block <id>` work end-to-end against staging/prod; the migrated block shows **zero yellow** in the admin UI.
- `rollback --block <id>` restores and verifies.
- Full run is resumable (`--resume`) and idempotent (second pass writes nothing).

## Open decisions (defaults chosen; override via `.env`/flags)

- **Auth**: defaults to `STRAPI_API_TOKEN` if set, else admin login. (User to provide one.)
- **Environment**: whatever `STRAPI_URL` points to. Strongly recommend staging or single-block trial before the full prod sweep.
- **Concurrency**: default 8 (`PUT_CONCURRENCY` / `--concurrency`).
- **Freeze window**: recommended during the full run (rollback consistency).
- **Dry-run first**: enforced by the documented workflow (not by code).

## Self-review notes

- Spec coverage: isolation (T1), replicate-not-extract (T2 copy + T3 parity), block-by-block folder+jsonl (T7/paths T5), apply formulas+corrected+diff (T7), one-by-one PUT (T7/strapi T4), CLI terminal (oclif T1+commands), gate sí/no/sí-a-todo per phase (T6 used in T7), loaders/navigation (ora/cli-progress/inquirer across T7-T11), logs to file (T5), rollback strategy (T10 + original.jsonl from T7). All present.
- No placeholders: copy instructions reference exact source line ranges; parity test guards the copy; interfaces and artifact formats are concrete.
- Type/naming consistency: `PERSISTED_FORMULA_FIELDS`, `CHANGE_TOLERANCE`, `ensureUnitFormulasSynced`, `processBlock`, `createGate`, `putUnit`, `listBlocks`, `listUnitsForBlock` used consistently across tasks.
