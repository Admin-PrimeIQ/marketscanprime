# Units Auto-Correlative Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When saving a unit whose `code` collides with an existing one (Strapi "unique" rejection), automatically fetch the next available code (correlative `-1`, `-2`, …) and retry the save **silently**, so renames like A→C resolve to `code = unidad-c-1` without user intervention.

**Architecture:** Mirror the existing blocks flow. A new server route `/api/units/generate-code` asks Strapi's `content-manager/uid/generate` for the next free `code` (UID generator auto-appends the correlative). On the client, `handleSave` (both edit and create paths) wraps the Strapi write in a retry loop: on a code-uniqueness error it fetches the next code, swaps it into the payload, and retries (max 5 attempts). The unit `name` never changes — only `code`. No toast on auto-reassignment (silent).

**Tech Stack:** Next.js App Router (route handlers), TypeScript, React, Strapi v4 admin API, `sileo` (toasts, only for non-recoverable errors).

**Note on verification:** This repo has no automated test framework (`package.json` scripts = `build`, `dev`, `lint`, `start`). Verification steps therefore use `npx tsc --noEmit` (type safety) + `npm run lint` + a manual reproduction scenario. There is no test runner to add `.test.ts` files to.

---

## File Structure

- **Create:** `app/api/units/generate-code/route.ts` — server route returning the next available unit `code` for a given `name` (mirror of `app/api/blocks/generate-code/route.ts`, UID changed to `api::unit.unit`).
- **Modify:** `lib/api/strapi.ts` — attach `.strapiError` to the errors thrown by `updateUnitBatch` and `createUnit` so the client can reliably detect a `code` uniqueness violation.
- **Modify:** `components/units/datasheet-units-table.tsx` — add two module-level helpers (`isUnitCodeConflict`, `fetchNextAvailableUnitCode`), import `StrapiError`, and wire silent retry-with-correlative into both `handleSave` write paths.

---

## Task 1: New endpoint `/api/units/generate-code`

**Files:**
- Create: `app/api/units/generate-code/route.ts`
- Reference (do not modify): `app/api/blocks/generate-code/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/units/generate-code/route.ts` with exactly this content (identical to the blocks route except `contentTypeUID` is `api::unit.unit`):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { logApi, userFromBearer } from "@/lib/server-logger"

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || 'http://localhost:1337'
const STRAPI_USERNAME = process.env.STRAPI_USERNAME
const STRAPI_PASSWORD = process.env.STRAPI_PASSWORD

// Cache del JWT de admin en memoria (válido ~30 días en Strapi por defecto)
let cachedToken: string | null = null

async function getAdminToken(): Promise<string> {
  if (cachedToken) return cachedToken

  const res = await fetch(`${STRAPI_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STRAPI_USERNAME, password: STRAPI_PASSWORD }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Strapi admin login failed: ${text}`)
  }

  const data = await res.json()
  cachedToken = data.data.token as string
  return cachedToken
}

export async function POST(request: NextRequest) {
  const t0   = Date.now()
  const user = userFromBearer(request.headers.get("authorization"))
  const path = request.nextUrl.pathname

  if (!STRAPI_USERNAME || !STRAPI_PASSWORD) {
    logApi({ tag: "route:POST", path, user, status: 500, durationMs: Date.now() - t0, error: "Admin credentials not configured" })
    return NextResponse.json({ error: 'Admin credentials not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { name } = body

  if (!name) {
    logApi({ tag: "route:POST", path, user, status: 400, durationMs: Date.now() - t0, error: "name is required" })
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  try {
    const token = await getAdminToken()

    const res = await fetch(`${STRAPI_URL}/content-manager/uid/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ contentTypeUID: 'api::unit.unit', field: 'code', data: { name } }),
    })

    // Si el token expiró, limpiar cache y reintentar una vez
    if (res.status === 401) {
      cachedToken = null
      const freshToken = await getAdminToken()

      const retry = await fetch(`${STRAPI_URL}/content-manager/uid/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
        body: JSON.stringify({ contentTypeUID: 'api::unit.unit', field: 'code', data: { name } }),
      })

      if (!retry.ok) {
        const text = await retry.text()
        logApi({ tag: "route:POST", path, user, status: retry.status, durationMs: Date.now() - t0, detail: `name:${name}`, error: text.slice(0, 200) })
        return NextResponse.json({ error: `Strapi error: ${text}` }, { status: retry.status })
      }

      const retryData = await retry.json()
      logApi({ tag: "route:POST", path, user, status: 200, durationMs: Date.now() - t0, detail: `name:${name} code:${retryData.data}` })
      return NextResponse.json({ code: retryData.data })
    }

    if (!res.ok) {
      const text = await res.text()
      logApi({ tag: "route:POST", path, user, status: res.status, durationMs: Date.now() - t0, detail: `name:${name}`, error: text.slice(0, 200) })
      return NextResponse.json({ error: `Strapi error: ${text}` }, { status: res.status })
    }

    const data = await res.json()
    logApi({ tag: "route:POST", path, user, status: 200, durationMs: Date.now() - t0, detail: `name:${name} → ${data.data}` })
    return NextResponse.json({ code: data.data })

  } catch (err: any) {
    logApi({ tag: "route:POST", path, user, status: 500, durationMs: Date.now() - t0, error: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "app/api/units/generate-code"`
Expected: no output (no type errors for the new file).

- [ ] **Step 3: Commit**

```bash
git add app/api/units/generate-code/route.ts
git commit -m "feat(units): add generate-code route for next available unit code"
```

---

## Task 2: Attach `strapiError` to unit write errors

**Files:**
- Modify: `lib/api/strapi.ts` — `updateUnitBatch` error block (~lines 2698-2713) and `createUnit` error block (~lines 2755-2765)

`StrapiError` is already declared and exported in this file (`export interface StrapiError` near line 75), so no new import is needed.

- [ ] **Step 1: Update `updateUnitBatch` error handling**

Find this block inside `updateUnitBatch`:

```ts
    if (!response.ok) {
      let errorMessage = 'Error al actualizar unidad'
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText)
            errorMessage = parsed.error?.message || errorMessage
          } catch {
            errorMessage = errorText || response.statusText || errorMessage
          }
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      throw new Error(errorMessage)
    }
```

Replace it with:

```ts
    if (!response.ok) {
      let errorMessage = 'Error al actualizar unidad'
      let strapiError: StrapiError | null = null
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            strapiError = JSON.parse(errorText)
            errorMessage = strapiError?.error?.message || errorMessage
          } catch {
            errorMessage = errorText || response.statusText || errorMessage
          }
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      const customError = new Error(errorMessage) as Error & { strapiError?: StrapiError }
      customError.strapiError = strapiError ?? undefined
      throw customError
    }
```

- [ ] **Step 2: Update `createUnit` error handling**

Find this block inside `createUnit`:

```ts
      if (!response.ok) {
        let errorMessage = 'Error al crear unidad'
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = errorData.error.message || errorMessage
          }
        } catch {
          // If error response is not JSON, use default message
        }
        throw new Error(errorMessage)
      }
```

Replace it with:

```ts
      if (!response.ok) {
        let errorMessage = 'Error al crear unidad'
        let strapiError: StrapiError | null = null
        try {
          const errorData = await response.json()
          strapiError = errorData
          if (errorData.error) {
            errorMessage = errorData.error.message || errorMessage
          }
        } catch {
          // If error response is not JSON, use default message
        }
        const customError = new Error(errorMessage) as Error & { strapiError?: StrapiError }
        customError.strapiError = strapiError ?? undefined
        throw customError
      }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "lib/api/strapi.ts"`
Expected: no NEW errors referencing the edited lines (repo has pre-existing unrelated errors elsewhere; this file should not gain any).

- [ ] **Step 4: Commit**

```bash
git add lib/api/strapi.ts
git commit -m "feat(units): attach strapiError detail to unit create/update errors"
```

---

## Task 3: Silent retry-with-correlative in `handleSave`

**Files:**
- Modify: `components/units/datasheet-units-table.tsx`
  - Import `StrapiError` (import block at lines 37-43)
  - Add two module-level helpers (after the `showUnitSaveErrorToast` helper, ~line 290)
  - Edit path: the `try { await strapiClient.updateUnitBatch(...) }` block inside the `for (const { unitId, blockDocumentId, unit, updates } of unitsToUpdate)` loop (~lines 2743-2760)
  - Create path: the `const createdUnit = await strapiClient.createUnit(unitData)` line (~line 2959)

- [ ] **Step 1: Import `StrapiError`**

Change the import block at lines 37-43 from:

```ts
import {
  StrapiUnit,
  type CatalogItem,
  strapiClient,
  localCurrencyUnitsPerOneUsd,
  getStrapiPublicBaseUrl,
} from "@/lib/api/strapi"
```

to:

```ts
import {
  StrapiUnit,
  type StrapiError,
  type CatalogItem,
  strapiClient,
  localCurrencyUnitsPerOneUsd,
  getStrapiPublicBaseUrl,
} from "@/lib/api/strapi"
```

- [ ] **Step 2: Add module-level helpers**

Immediately after the closing `}` of `showUnitSaveErrorToast` (just before `interface DatasheetUnitsTableProps {`), insert:

```ts
/**
 * Detecta si un error de guardado proviene de un `code` duplicado
 * (constraint unique de Strapi). Usa el detalle adjunto (strapiError) cuando
 * está disponible, con fallback al texto del mensaje.
 */
function isUnitCodeConflict(error: unknown): boolean {
  const strapiError = (error as { strapiError?: StrapiError } | undefined)?.strapiError
  const details = strapiError?.error?.details as
    | { errors?: Array<{ path?: unknown; message?: string }> }
    | undefined
  if (details?.errors && Array.isArray(details.errors)) {
    const codeErr = details.errors.some((e) => {
      const inCode = Array.isArray(e.path) ? e.path.includes("code") : e.path === "code"
      const isUnique = /unique|únic|unic/i.test(String(e.message ?? ""))
      return inCode && isUnique
    })
    if (codeErr) return true
  }
  const msg = error instanceof Error ? error.message : String(error)
  return /code/i.test(msg) && /unique|únic|unic/i.test(msg)
}

/**
 * Pide a Strapi el siguiente `code` disponible (con correlativo -1, -2, …)
 * para el `name` dado, vía el endpoint /api/units/generate-code.
 */
async function fetchNextAvailableUnitCode(name: string): Promise<string> {
  const res = await fetch("/api/units/generate-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error("No se pudo generar el código de la unidad")
  const json = await res.json()
  return json.code as string
}
```

- [ ] **Step 3: Wire the EDIT path retry loop**

Find this block inside the `for (const { unitId, blockDocumentId, unit, updates } of unitsToUpdate)` loop:

```ts
        try {
          await strapiClient.updateUnitBatch(unitId, updates, blockDocumentId)
          const blockIdForWebhook = blockId
          if (blockIdForWebhook) void notifyBlockCounterUpdate(String(blockIdForWebhook))
        } catch (err) {
```

Replace ONLY the `try { ... }` portion (leave the `catch (err) {` and everything after it untouched) so it becomes:

```ts
        try {
          let codeAttempts = 0
          while (true) {
            try {
              await strapiClient.updateUnitBatch(unitId, updates, blockDocumentId)
              break
            } catch (writeErr) {
              if (isUnitCodeConflict(writeErr) && codeAttempts < 5) {
                codeAttempts++
                // Pedir el siguiente code disponible y reintentar (silencioso)
                const nameForCode = String((unit as { name?: unknown }).name ?? "")
                const nextCode = await fetchNextAvailableUnitCode(nameForCode)
                const codeEntry = updates.find((u) => u.field === "code")
                if (codeEntry) codeEntry.value = nextCode
                else updates.push({ field: "code", value: nextCode })
                ;(unit as { code?: unknown }).code = nextCode
                continue
              }
              throw writeErr
            }
          }
          if (codeAttempts > 0) setRefreshKey((k) => k + 1) // redibujar la celda code con el correlativo
          const blockIdForWebhook = blockId
          if (blockIdForWebhook) void notifyBlockCounterUpdate(String(blockIdForWebhook))
        } catch (err) {
```

Note: `codeAttempts` is declared inside the outer `try`, so the `if (codeAttempts > 0)` line after the `while` loop is in the same scope — valid.

- [ ] **Step 4: Wire the CREATE path retry loop**

Find this line inside the create loop (`for (let i = 0; i < newUnits.length; i++)`):

```ts
        // Create unit via API
        const createdUnit = await strapiClient.createUnit(unitData)
```

Replace it with:

```ts
        // Create unit via API (con retry silencioso si el code ya está tomado)
        let createdUnit: StrapiUnit
        let createCodeAttempts = 0
        while (true) {
          try {
            createdUnit = await strapiClient.createUnit(unitData)
            break
          } catch (createErr) {
            if (isUnitCodeConflict(createErr) && createCodeAttempts < 5) {
              createCodeAttempts++
              const nextCode = await fetchNextAvailableUnitCode(String((unitData as { name?: unknown }).name ?? ""))
              ;(unitData as { code?: unknown }).code = nextCode
              continue
            }
            throw createErr
          }
        }
```

This sits inside the existing outer `try { ... } catch (error) { ... }` (which shows the sileo error toast). Non-`code` errors and exhausted retries propagate to that catch unchanged.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "datasheet-units-table.tsx"`
Expected: no output (no type errors in this file).

- [ ] **Step 6: Lint the changed files**

Run: `npx eslint app/api/units/generate-code/route.ts lib/api/strapi.ts components/units/datasheet-units-table.tsx`
Expected: no new errors introduced by these changes.

- [ ] **Step 7: Commit**

```bash
git add components/units/datasheet-units-table.tsx
git commit -m "feat(units): auto-assign next available code on duplicate, silently retry save"
```

---

## Manual Verification Scenario

After all tasks, with the app running (`npm run dev`, units page at `/units/list/<block>`):

1. Create three units so names slugify to `unidad-a`, `unidad-b`, `unidad-c` (distinct codes).
2. Rename unit A so its name/`unitNumber` matches C (its computed `code` becomes `unidad-c`).
3. Save.

**Expected:**
- Save succeeds with no error toast (silent).
- Unit A now has `name = "unidad-c"` (display unchanged from the rename) and `code = unidad-c-1` (visible in the `code` column after redraw).
- Units B and C are untouched.

Repeat for the **create** path: add a new unit whose name collides with an existing one → it saves with the correlative code, no toast.

Negative check: trigger a non-`code` save error (e.g. a genuinely invalid field) → the existing sileo error toast still appears (retry logic does not swallow unrelated errors).

---

## Self-Review Notes

- **Spec coverage:** Endpoint (Task 1) ✓; reliable conflict detection (Task 2) ✓; edit + create silent retry (Task 3, Steps 3-4) ✓; silent (no toast on reassignment — only `setRefreshKey`) ✓; name unchanged, only `code` mutated ✓.
- **Type consistency:** Helper names `isUnitCodeConflict` / `fetchNextAvailableUnitCode` used identically in both paths; `StrapiError` imported in Task 3 Step 1 before use in Step 2; `createdUnit` kept as `StrapiUnit` so downstream `mappedUnit` usage compiles.
- **Slugify parity risk (accepted, low):** existing unit codes were produced by the app's `slugify()` (datasheet-units-table.tsx:722); Strapi's UID generator slugifies independently. For `"blockName - unitNumber"` (alphanumeric) both agree, so Strapi's collision check finds the existing code and appends the correlative. If a future name uses characters where the two slugifiers diverge, the correlative base could differ — out of scope here.
