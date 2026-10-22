# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`market-scan-back-office` — Prime IQ's web back office for real-estate market-scan data: **projects → blocks → units**, plus exchange-rate profiles and catalogs. Next.js App Router (React 19) front end over a **Strapi v5** backend reached purely over HTTP. Bilingual ES/EN. Production: https://admin.primeiqlatam.com (Vercel).

There is no local backend in this repo — Strapi is a remote service configured via `NEXT_PUBLIC_STRAPI_URL`.

## Commands

Package manager is **pnpm** (`pnpm-workspace.yaml`; a stale `package-lock.json` is also present — ignore it). Node from `.nvmrc` (24.14.1; `engines` requires ≥20).

```bash
pnpm install          # postinstall runs patch-package (patches/) and prisma generate --generator app
pnpm dev              # next dev
pnpm dev:staging      # next dev on the prisma backend, from .env.staging.local only (see below)
pnpm db:generate      # regenerate the app's Prisma client into lib/db/generated (gitignored)
pnpm build            # next build
pnpm start            # next start
```

**There is no working linter.** `pnpm lint` runs `eslint .`, but eslint is neither a dependency nor installed — the script fails. Don't cite it as a check.

Type checking: `npx tsc --noEmit`. Note `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so **a green build does not mean the types are clean**. The baseline is noisy — filter output to files you touched.

Tests: `npm test` runs the pure modules with `node --test` (no dependencies needed): the formula engine and block context in `lib/domain/units/`, plus `lib/*.test.ts`, `lib/copilot/`, `lib/db/` (catalog mapping and guard) and `components/units/`. The ETL in `etl/` has its own `npm test`.

## Environment

`.env` (gitignored) — key vars:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_STRAPI_URL` | Strapi origin (no trailing `/api`). Used by client, proxy, and server routes. |
| `STRAPI_USERNAME` / `STRAPI_PASSWORD` | Strapi **admin** credentials, server-only. Used by the `generate-code` routes to hit `/admin/login` + `/content-manager/uid/generate`. |
| `NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL` | n8n Chat Trigger for the Copilot (must end in `/chat`; `lib/copilot/constants.ts` appends it if missing). |
| `EXCHANGE_RATES_WEBHOOK_URL` | Override for the n8n exchange-rates feed. |
| `NEXT_PUBLIC_BLOCK_COUNTER_WEBHOOK_URL` | n8n webhook that recomputes block counters after a unit save. |
| `NEXT_PUBLIC_DATA_BACKEND` | `strapi` (default) or `prisma`. Picks the `dataClient` implementation for the whole app. |
| `DATABASE_URL_APP` | Postgres of the new app (schema `msp_app`), read by `lib/db/connection.ts`. Only in `.env.staging.local`. The Railway CA comes from `DATABASE_CA_APP` (PEM) or `DATABASE_CA_FILE_APP` (default `etl/certs/dbo-stage-ca.pem`). |

`.env.staging.local` (gitignored, template in `.env.staging.example`) is the environment for the `prisma` backend. `pnpm dev:staging` ([`scripts/dev-staging.mjs`](scripts/dev-staging.mjs)) loads only that file and blanks every key of the regular `.env`, so the local app can't reach production Strapi or its credentials. Don't run the `prisma` backend any other way.

## Architecture

### Data layer — the UI goes through `dataClient`, backed by `lib/api/strapi.ts`

A single ~3k-line [`StrapiClient`](lib/api/strapi.ts) singleton (`strapiClient`) holds all API knowledge: entity interfaces (`StrapiProject`, `StrapiBlock`, `StrapiUnit`, `StrapiExchangeRateProfile`, `CatalogItem`), query-string building for Strapi v5 filters/populate/pagination, and every CRUD method. New backend calls belong here, not inline in components.

Pages and components never import `strapiClient`: they call `dataClient` from the facade [`lib/api/client.ts`](lib/api/client.ts), whose `DataClient` type lists the methods the UI uses. `NEXT_PUBLIC_DATA_BACKEND` picks the implementation: `strapi` (the default, what production runs) or `prisma` ([`lib/api/prisma-client.ts`](lib/api/prisma-client.ts), being built module by module for the migration, see `docs/migration/ROADMAP.md` phase 5). A new method the UI needs goes in `strapi.ts`, in `DataClient` **and** in the `prisma` implementation (at least as a "not migrated" error). Types `Strapi*` and pure helpers are still imported from `strapi.ts`.

The `prisma` side so far covers the catalogs: Server Actions in [`lib/db/catalog-actions.ts`](lib/db/catalog-actions.ts) → generic repository [`lib/db/catalogs.ts`](lib/db/catalogs.ts) (endpoint → model map and DTO rules in the pure `catalog-mapping.ts`, `documentId` = `publicId`) → Prisma client [`lib/db/client.ts`](lib/db/client.ts) (`server-only`, schema `msp_app`). There is no server-side auth yet, so every action calls `assertPrismaActionsAllowed()` ([`lib/db/guard.ts`](lib/db/guard.ts)): it only answers under `next dev` with the `prisma` backend. Login on that backend ([`lib/db/auth-actions.ts`](lib/db/auth-actions.ts)) checks email/username and password against `msp_app.user` with the bcrypt hashes copied from Strapi, never calls Strapi, and keeps the user in `localStorage`. Both the guard and that client-side session go away with Auth.js. The app's client is the `app` generator of `prisma/schema.prisma`; migrations are still applied only from `etl/`.

**Base URL is environment-dependent** and this matters: in the browser the client points at `/api/strapi`; on the server it calls Strapi directly (avoids loopback). [`app/api/strapi/[...path]/route.ts`](app/api/strapi/[...path]/route.ts) is a transparent proxy whose sole purpose is **server-side logging** of every call (method, path, resolved user email, status, duration, body/summary) via [`lib/server-logger.ts`](lib/server-logger.ts) into Vercel Functions logs. Keep browser traffic flowing through it.

### Strapi v5 write rules (recurring source of 400s)

- Relations are written by **`documentId`**, not numeric `id` — use `getRelationDocumentId()`.
- Components and dynamic-zone entries must **not** carry `id` in a write body ("Invalid key id"). `sanitizeCurrenciesComponentForWrite()` and `sanitizeUnitTypeArrayForWrite()` exist for this.
- Non-USD price fields (`totalPriceGTQ`, …) and `maintenanceWithoutVATUSD` are **client-only** — they exist for grid editing/conversion and are stripped before sending. The regex in `strapi.ts` must stay in sync with `FOREIGN_PRICE_COLUMN_KEY_RE` in the datasheet component.
- Responses arrive as `{ data, meta }` or bare objects; `request()` unwraps `data`, but list methods deliberately return the full envelope to keep `meta.pagination`.
- A dynamic-zone update is merged with the server value (`mergeUnitTypeWithServer`) so a partial `unitType` payload can't wipe stored fields.

### Auth

Client-side only: JWT from `POST /api/auth/local` stored in `localStorage` (`strapi_token`), session state in [`context/AuthContext.tsx`](context/AuthContext.tsx), helpers in [`lib/auth/auth.ts`](lib/auth/auth.ts). `middleware.ts` is a **no-op pass-through** — there is no route protection at the edge; guarding happens in the client layout. Role comes from `GET /users/me?populate=role`; super-admin detection is fuzzy by `role.type`/`role.name` in [`lib/auth/is-strapi-super-admin.ts`](lib/auth/is-strapi-super-admin.ts). Server routes that need to authenticate a caller validate the bearer against Strapi with `isValidStrapiBearer()`.

### Routing

`app/(auth)/*` (login, register, forgot/reset password) and `app/(main)/*` (everything else, wrapped by `components/main-layout-client.tsx` → side-nav + top-bar). Entities follow a `list / new / view/[id] / edit/[id] / clone/[id]` shape. Note the inconsistency: **projects use `[documentId]` for view/edit; blocks and exchange-rate profiles use `[id]`** (which also carries a documentId). Catalogs are a single optional-catch-all route `catalogs/[[...slug]]` driven by the `CATALOG_TYPES` map in `strapi.ts`.

### i18n

`next-intl` with **cookie-based** locale (`locale` cookie, default `es`) resolved in [`i18n.ts`](i18n.ts) — no locale path segments. Messages are two flat files, `messages/es.json` and `messages/en.json`; both must be updated together. UI text is always translated; **code comments are predominantly Spanish** — match that when editing existing files.

### UI

shadcn/ui "new-york" style in `components/ui/` (Radix + Tailwind v4 + `lucide-react`), configured by `components.json` (aliases `@/*`; extra registry `@mapcn`). Toasts use `sileo` and `sonner`. Theme via `next-themes`. Onboarding tours live in `components/tour/` + `hooks/use-tour.ts`.

## The units datasheet — the core of the app

[`components/units/datasheet-units-table.tsx`](components/units/datasheet-units-table.tsx) (~7.8k lines) is a Glide Data Grid spreadsheet at `/units/list/[id]` (units of one block) and the most business-dense file in the repo. It is the only units grid: the old alternates (`editable-`, `luckysheet-`, `univer-units-table`, `units-table`) were deleted in v1.28.2.

Declarative configuration is split out into [`datasheet-units-table-config.ts`](components/units/datasheet-units-table-config.ts) (`DATASHEET_CONFIG`: field labels, USD field lists, foreign-currency behavior, cascade rules). Its header documents the exact 7-step recipe for **adding a new field group** — follow it; runtime sync functions stay in the component and are wired by name through `syncFnRegistry`.

What the grid does beyond editing cells:

- **Cascades**: editing one field runs a sync function that recomputes dependents, highlights them yellow (pending), mirrors them to their foreign-currency column, and reports them in a toast.
- **Bidirectional formulas**: most magnitudes can be driven from total, from without-VAT, or from per-m² (`syncPriceFromPerM2`, `syncMaintenanceFromWithoutVAT`, …).
- **Unit conversion**: columns render in m² **or** varas², one at a time. Area fields use `M2_TO_VARAS_SQUARED` (1.431); **linear** fields (`frontM2`, `depthM2`) use `M_TO_VARAS` (1.19) — always go through `getVarasFactor()` in [`lib/constants.ts`](lib/constants.ts).
- **Multi-currency**: one active non-USD currency at a time; local prices are editable and convert two-way against the USD pivot. Rates come from the project's `exchangeRateProfile.currencies` (normalized onto `project.currencies` by `normalizeProjectCurrenciesFromExchangeProfile`).
- **Dynamic zone columns**: `unitType` is a Strapi dynamic zone (`unit-types.housing` | `.offices` | `.industrial`). Column visibility, value read/write paths, and enum coercion live in [`lib/units/unit-type-dynamic-columns.ts`](lib/units/unit-type-dynamic-columns.ts) and `unit-type-zone.ts`.
- **Load reconciliation**: on open, stored formula fields are recomputed; mismatches are marked pending (yellow) and listed in a dialog. Persistent yellow means the DB disagrees with the current formulas — that is what the migration CLI exists to fix.
- **Batch save** via `updateUnitBatch` (last-wins per field — so *all* entries for a field must be patched on retry), with automatic next-available-`code` retry on unique-code conflicts through `/api/units/generate-code`, then an optional block-counter webhook.

### Country- and block-dependent business rules

Behavior keys off `block.project.country.isoCode2` (fallback `code`), so blocks/units deep-populate `populate[project][populate][country]`.

- **VAT** (`getVatRate` inside the datasheet): `SV` → `1.0` (0%, placeholder until a rate is approved); otherwise `1.12`, except usage "Venta" → `0.916`; Interior (`S1`/`S2`) + Lote → `1.12`.
- **Installment** (`INSTALLMENT_BY_ISO`): GT (default) 7.5% / 20y / 90% LTV; SV 8% / 25y / 85%. Unknown ISO falls back to GT.
- **Sizes**: `totalSizeM2 = habitableConstructionM2 + (isVertical ? parkingSizeM2 : 0)`; habitable = unitSize (+ balcony when vertical), or land area for lotes. Parking size = `parkingSpaces × 12.5` m².
- **Region** GAM vs Interior is derived from `quarter` (`T1–T4` vs `S1/S2`) — see [`lib/domain/region.ts`](lib/domain/region.ts) (re-exported with the badge colors by [`lib/region.ts`](lib/region.ts)). Departments/municipalities per ISO live in [`lib/domain/geo.ts`](lib/domain/geo.ts) (`GEO_BY_ISO`; a former `lib/departments.ts` was consolidated into it).

### Pure business rules — `lib/domain/`

The formula engine ([`lib/domain/units/formulas.ts`](lib/domain/units/formulas.ts)), the varas factors (`varas.ts`) and the block context that feeds the engine ([`lib/domain/units/context.ts`](lib/domain/units/context.ts): vertical / lote / industrial kind from the category, VAT rates, country ISO) are the **single copy** of these rules. The grid, the units page and the ETL formula report (`etl/`, `npm run load:formulas`) all import them. Files there import nothing from React or `@/` aliases and use relative `.ts` imports, so they run under `node --test` and `tsx`. UI bits (badge colors, labels) stay outside: `lib/region.ts`, `lib/block-domain-ui.ts`, `lib/block-category.ts`.

[`.migration/`](.migration/) has a **frozen** copy of an older engine (June 2026, before VAT-by-operation and industrial sizes). Nothing imports it and it is no longer a parity contract; don't mirror changes there. Read `.migration/README.md` before running anything against a real Strapi.

### Sibling repo — `../../scripts/sync-database`

A separate npm CLI toolkit (its own repo, its own `CLAUDE.md`) that syncs the **same Strapi** against Prime IQ's **legacy MySQL warehouse** (`housing_universe` / `housing_units`). Don't confuse it with `.migration/`: that one recomputes formulas *inside* Strapi, while `sync-database` is the only thing that crosses the MySQL boundary, in both directions (MySQL → Strapi export/prep/push and patch; Strapi → MySQL writeback). One row of `housing_universe` = one block here, joined by `cod_proyecto` ↔ `legacyId` (or ↔ `documentId` for blocks born in this app, which carry `legacyId` `null`/`""`).

Three field-level contracts bind the two repos. Maintenance VAT and the varas factors live in its `writeback-field-mapper.js`; the block usage contract spans the pull payload builders, the writeback mappers (housing/office/industrial) and `scripts/sync/repair/lib/usage-import.js`:

- **Maintenance VAT**: none in transit. Strapi is the source of truth, and the CLI copies `maintenanceTotalPriceM2USD` / `maintenancePricePerM2USD` 1:1 both ways (since 2026-09-29; it used to multiply by `1.12` on the way in and divide on the way out, which removed VAT twice from the per-m² value this app already computes net). If a maintenance field's VAT treatment changes here, the stored value itself changes. Don't compensate for it with a factor in the mapper.
- **Varas factors differ on purpose**: the CLI writes the warehouse's historical precision (`1.1976` linear / `1.4342` area) while the grid uses `M_TO_VARAS = 1.19` / `M2_TO_VARAS_SQUARED = 1.431` ([`lib/constants.ts`](lib/constants.ts)). Don't align one to the other without deciding which side owns the number.
- **Uso del bloque**: `blockUsage` (`Venta`/`Renta`) es la columna `uso` del universo, 1:1 y sin traducción. Sin dato nunca borra: el pull no lo manda si el `uso` no es válido, y el writeback no nombra `uso` si el bloque no lo tiene. El llenado inicial es el workflow manual `[Prime IQ] Sync Import Block Usage`.

Also relevant: it calls the same `block-counter-update` n8n webhook after pushing a block's units, and an unmerged GAM purge pipeline there cascade-deletes blocks/units in Strapi selected by country + quarter kind (`T*` vs `S*`) — the same `quarter` split this app reads as GAM vs Interior in [`lib/region.ts`](lib/region.ts).

## Exchange rates

Two separate things: **profiles** (`/exchange-rate-profiles`, a Strapi collection whose `currencies` component feeds project pricing) and the **live rates sidebar** (`components/exchange-rate-sidebar.tsx`), fed by `/api/exchange-rates` → n8n webhook, with an in-memory server cache that serves stale data on upstream failure and is flushed on logout (`DELETE`).

## Copilot

`/copilots` embeds `@n8n/chat` against an n8n Chat Trigger, proxied same-origin through `/api/copilot/n8n-chat`. `lib/copilot/` is largely DOM-level enhancements applied to the third-party widget (markdown bridge, tool logs, file icons, lightbox, composer tweaks) plus session management against n8n webhooks. Structured agent responses use the **UI Blocks** `:::directive` wire format — engine in `lib/copilot/ui-blocks-engine.ts`, renderer in `components/copilots/ui-blocks-renderer.tsx`, full spec in the `ui-blocks-engine` skill (`.claude/skills/`).

## Conventions

- **Versioning**: bump `package.json` `version` and add a dated entry to `CHANGELOG.md` (reverse chronological, grouped by release, calls out affected files and data dependencies). `APP_VERSION` is read from `package.json` and shown in the UI.
- **Plans**: implementation plans are kept in `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`.
- **Skills**: repo-local agent skills live in `.claude/skills/` and `.agents/skills/` (Next.js, shadcn, Tailwind v4, advanced TS).
- **Deployment**: Vercel only accepts pushes from the **`Admin-PrimeIQ`** GitHub account with commit email `engteam@primeiqlatam.com`; commits from any other account will not deploy. Full multi-account SSH setup is in `README.md`.
