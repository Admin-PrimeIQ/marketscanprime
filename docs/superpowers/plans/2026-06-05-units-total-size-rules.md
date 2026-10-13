# Tamaño Total rules + Lote unitSize sync + Load reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:**
1. `totalSizeM2 = habitableConstructionM2 + (isVertical ? parkingSizeM2 : 0)` for all categories.
2. Propagate it through cascades (incl. balcony recomputing total; parking only adds to total on vertical).
3. Lotes keep `unitSizeM2 = terreno = total` (bidirectional sync on edit + normalize on load).
4. On initial load, where a recomputed formula value differs from the DB-stored value, **mark that cell as a pending change (yellow)** and show one informational dialog so the user reviews and saves.

**Tech Stack:** React, TypeScript. No test framework → Node simulation for the formula + `npx tsc --noEmit`. Baseline `tsc` errors in the repo = 153 (unrelated); touched files must add none.

**Formula target:**
```
totalSizeM2 = habitableConstructionM2 + (isVertical ? parkingSizeM2 : 0)
```
Vertical → (unitSize+balcón)+parqueo · Horizontal → unitSize+0 · Lote → terreno+0

---

## File Structure

- **`components/units/datasheet-units-table.tsx`**
  - `syncUnitTotalSize` formula + signature (Task 1).
  - `syncFnRegistry`: reorder + pass isVertical + `syncParkingOnly` + 2 lote sync fns (Task 2).
  - `ensureUnitFormulasSynced`: isVertical to total, lote `unitSize=land` normalization, **return changed reconciled fields** (Task 3).
  - Load effect: collect changed fields → mark pending (+varas) → open dialog (Task 8).
  - New dialog state + JSX (Task 9).
- **`components/units/datasheet-units-table-config.ts`**
  - `isHorizontal` condition (Task 4); split parqueo (Task 5); balcony recomputes total (Task 6); lote cascades (Task 7).

---

## Task 1: Unified `syncUnitTotalSize` formula

**File:** `components/units/datasheet-units-table.tsx` (~371-377)

- [ ] **Step 1: Replace the function**

Find:
```ts
/** Total Size = Unit Size + Parking Size; actualiza totalSizeM2 y totalSizeVaras2 en el objeto unit */
function syncUnitTotalSize(unit: Record<string, unknown>): void {
  const unitSize = Number(unit.unitSizeM2) || 0
  const parkingSize = Number(unit.parkingSizeM2) || 0
  unit.totalSizeM2 = unitSize + parkingSize
  unit.totalSizeVaras2 = roundTo2((unitSize + parkingSize) * M2_TO_VARAS_SQUARED)
}
```
Replace with:
```ts
/**
 * Total Size = Construcción Habitable + (vertical: parqueo; horizontal/lote: 0).
 * Requiere habitableConstructionM2 ya sincronizado (llamar syncUnitHabitableConstruction antes).
 */
function syncUnitTotalSize(unit: Record<string, unknown>, isVertical = false): void {
  const habitable = Number(unit.habitableConstructionM2) || 0
  const parkingSize = isVertical ? (Number(unit.parkingSizeM2) || 0) : 0
  const total = habitable + parkingSize
  unit.totalSizeM2 = total
  unit.totalSizeVaras2 = roundTo2(total * M2_TO_VARAS_SQUARED)
}
```

- [ ] **Step 2: Simulation test** — create `/tmp/total-size.mjs`:
```js
const roundTo2 = (n) => Math.round(n * 100) / 100
function total(unit, isVertical = false) {
  const h = Number(unit.habitableConstructionM2) || 0
  const p = isVertical ? (Number(unit.parkingSizeM2) || 0) : 0
  return h + p
}
console.log("Vertical:", total({ habitableConstructionM2: 70, parkingSizeM2: 25 }, true) === 95 ? "✓" : "✗")
console.log("Horizontal:", total({ habitableConstructionM2: 60, parkingSizeM2: 25 }, false) === 60 ? "✓" : "✗")
console.log("Lote:", total({ habitableConstructionM2: 120, parkingSizeM2: 0 }, false) === 120 ? "✓" : "✗")
```
Run `node /tmp/total-size.mjs` → three ✓. Then `rm /tmp/total-size.mjs`.

- [ ] **Step 3: Commit** — `git commit -m "feat(units): totalSize = habitable + (vertical ? parking : 0)"`

---

## Task 2: Registry sync fns (isVertical + lote bidirectional + parking-only)

**File:** `components/units/datasheet-units-table.tsx` (~1374-1379)

- [ ] **Step 1: Replace the four medidas registry entries**

Find:
```ts
    syncMedidasWithTotal:    (u) => { syncUnitTotalSize(u); syncUnitHabitableConstruction(u, isVerticalRef.current, isLoteRef.current); syncUnitPriceFromTotal(u, unitVatRate(u)); syncUnitRentalFromTotal(u, unitVatRate(u)); syncUnitMaintenancePerM2(u, unitVatRate(u)); syncUnitAbsorptionPerM2(u) },
    syncMedidasWithoutTotal: (u) => { syncUnitHabitableConstruction(u, isVerticalRef.current, isLoteRef.current); syncUnitPriceFromTotal(u, unitVatRate(u)); syncUnitRentalFromTotal(u, unitVatRate(u)); syncUnitMaintenancePerM2(u, unitVatRate(u)); syncUnitAbsorptionPerM2(u) },
    syncMedidasTotalOnly:    (u) => { syncUnitTotalSize(u) },
    syncMedidasParqueo:      (u) => { syncUnitParkingSize(u); syncUnitTotalSize(u) },
  }), [])
```
Replace with:
```ts
    syncMedidasWithTotal:    (u) => { syncUnitHabitableConstruction(u, isVerticalRef.current, isLoteRef.current); syncUnitTotalSize(u, isVerticalRef.current); syncUnitPriceFromTotal(u, unitVatRate(u)); syncUnitRentalFromTotal(u, unitVatRate(u)); syncUnitMaintenancePerM2(u, unitVatRate(u)); syncUnitAbsorptionPerM2(u) },
    syncMedidasWithoutTotal: (u) => { syncUnitHabitableConstruction(u, isVerticalRef.current, isLoteRef.current); syncUnitPriceFromTotal(u, unitVatRate(u)); syncUnitRentalFromTotal(u, unitVatRate(u)); syncUnitMaintenancePerM2(u, unitVatRate(u)); syncUnitAbsorptionPerM2(u) },
    syncMedidasTotalOnly:    (u) => { syncUnitTotalSize(u, isVerticalRef.current) },
    syncMedidasParqueo:      (u) => { syncUnitParkingSize(u); syncUnitTotalSize(u, isVerticalRef.current) },
    syncParkingOnly:         (u) => { syncUnitParkingSize(u) },
    // Lote: unitSize = terreno = total. Editar terreno iguala unitSize (y viceversa).
    syncMedidasLoteFromLand: (u) => {
      const land = Number(u.landM2) || 0
      u.unitSizeM2 = land
      u.unitSizeVaras2 = roundTo2(land * M2_TO_VARAS_SQUARED)
      syncUnitHabitableConstruction(u, false, true)
      syncUnitTotalSize(u, false)
      syncUnitPriceFromTotal(u, unitVatRate(u)); syncUnitRentalFromTotal(u, unitVatRate(u))
      syncUnitMaintenancePerM2(u, unitVatRate(u)); syncUnitAbsorptionPerM2(u)
    },
    syncMedidasLoteFromUnitSize: (u) => {
      const size = Number(u.unitSizeM2) || 0
      u.landM2 = size
      u.landVaras2 = roundTo2(size * M2_TO_VARAS_SQUARED)
      syncUnitHabitableConstruction(u, false, true)
      syncUnitTotalSize(u, false)
      syncUnitPriceFromTotal(u, unitVatRate(u)); syncUnitRentalFromTotal(u, unitVatRate(u))
      syncUnitMaintenancePerM2(u, unitVatRate(u)); syncUnitAbsorptionPerM2(u)
    },
  }), [])
```

- [ ] **Step 2: Typecheck** the file → no output. **Commit** — `git commit -m "feat(units): isVertical in total sync, lote bidi sync, syncParkingOnly"`

---

## Task 3: `ensureUnitFormulasSynced` — lote normalize + return changed fields

**File:** `components/units/datasheet-units-table.tsx` (~575-593)

- [ ] **Step 1: Add the reconciled-fields constant** immediately above `function ensureUnitFormulasSynced`:
```ts
/** Campos de fórmula que se reconcilian en carga (si difieren de la DB → se marcan como cambio). */
const RECONCILED_FORMULA_FIELDS = [
  "parkingSizeM2", "totalSizeM2", "habitableConstructionM2",
  "priceWithoutVATUSD", "pricePerM2USD",
  "rentalPriceWithoutVATUSD",
  "maintenanceWithoutVATUSD", "maintenancePricePerM2USD",
  "installmentUSD", "incomeUSD",
  "unitAbsorption", "absorptionPerM2",
  "unitSizeM2", // lote: unitSize = terreno
] as const
```

- [ ] **Step 2: Replace the function** body.

Find:
```ts
function ensureUnitFormulasSynced(
  unit: Record<string, unknown>,
  blockDates?: { collectionDate?: string; startDate?: string },
  isVertical = false,
  vatRate = VAT_RATE,
  isLote = false
): void {
  syncUnitParkingSize(unit)
  syncUnitHabitableConstruction(unit, isVertical, isLote)
  syncUnitTotalSize(unit)
  syncUnitPriceFromTotal(unit, vatRate)
  syncUnitRentalFromTotal(unit, vatRate)
  syncUnitMaintenancePerM2(unit, vatRate)
  syncUnitInstallment(unit, vatRate)
  syncUnitIncome(unit)
  syncUnitAbsorption(unit, blockDates?.collectionDate, blockDates?.startDate)
  syncUnitAbsorptionPerM2(unit)
}
```
Replace with:
```ts
function ensureUnitFormulasSynced(
  unit: Record<string, unknown>,
  blockDates?: { collectionDate?: string; startDate?: string },
  isVertical = false,
  vatRate = VAT_RATE,
  isLote = false
): string[] {
  // Snapshot para reconciliación: detectar qué campos de fórmula cambian respecto a lo guardado.
  const before: Record<string, number> = {}
  for (const f of RECONCILED_FORMULA_FIELDS) before[f] = Number((unit as Record<string, unknown>)[f]) || 0

  syncUnitParkingSize(unit)
  // Lote: unitSize = terreno = total (igualar el tamaño de unidad al terreno).
  if (isLote) {
    const land = Number(unit.landM2) || 0
    unit.unitSizeM2 = land
    unit.unitSizeVaras2 = roundTo2(land * M2_TO_VARAS_SQUARED)
  }
  syncUnitHabitableConstruction(unit, isVertical, isLote)
  syncUnitTotalSize(unit, isVertical)
  syncUnitPriceFromTotal(unit, vatRate)
  syncUnitRentalFromTotal(unit, vatRate)
  syncUnitMaintenancePerM2(unit, vatRate)
  syncUnitInstallment(unit, vatRate)
  syncUnitIncome(unit)
  syncUnitAbsorption(unit, blockDates?.collectionDate, blockDates?.startDate)
  syncUnitAbsorptionPerM2(unit)

  const changed: string[] = []
  for (const f of RECONCILED_FORMULA_FIELDS) {
    const after = Number((unit as Record<string, unknown>)[f]) || 0
    if (Math.abs(after - before[f]) > 0.01) changed.push(f)
  }
  return changed
}
```

Note: existing callers that ignore the return value still compile (return type widened from `void` to `string[]`).

- [ ] **Step 3: Typecheck** → no output for the file. **Commit** — `git commit -m "feat(units): ensureUnitFormulasSynced normalizes lote unitSize and reports changed fields"`

---

## Task 4: `isHorizontal` cascade condition

**File:** `components/units/datasheet-units-table-config.ts`

- [ ] **Step 1:** Find `condition?: "isVertical" | "isLote" | "isNotLote"` → replace with `condition?: "isVertical" | "isLote" | "isNotLote" | "isHorizontal"`.

- [ ] **Step 2:** In `findDimensionCascadeRule`, find:
```ts
    if (group.condition === "isVertical" && !isVertical) continue
    if (group.condition === "isLote"    && !isLote) continue
    if (group.condition === "isNotLote" && isLote)  continue
```
Replace with:
```ts
    if (group.condition === "isVertical"   && !isVertical) continue
    if (group.condition === "isLote"       && !isLote) continue
    if (group.condition === "isNotLote"    && isLote)  continue
    if (group.condition === "isHorizontal" && (isVertical || isLote)) continue
```

- [ ] **Step 3: Typecheck** → no output. **Commit** — `git commit -m "feat(units): add isHorizontal cascade condition"`

---

## Task 5: Split parking cascade (only vertical adds to total)

**File:** `components/units/datasheet-units-table-config.ts` (~612-625)

- [ ] **Step 1:** Find the `parqueo:` group block and replace it with `parqueo_vertical` (condition `"isVertical"`, syncFn `"syncMedidasParqueo"`, affects/pending `["parkingSizeM2","totalSizeM2"]`) + `parqueo_horizontal` (condition `"isHorizontal"`, syncFn `"syncParkingOnly"`, affects/pending `["parkingSizeM2"]`). Full replacement:
```ts
      parqueo_vertical: {
        label: "Parqueo",
        condition: "isVertical",
        mirrorVaras: true,
        rules: [
          { triggerField: "parkingSpaces", syncFn: "syncMedidasParqueo",
            affects: ["parkingSizeM2", "totalSizeM2"], pendingFields: ["parkingSizeM2", "totalSizeM2"], pendingMirroredFields: [] },
        ],
      } satisfies DimensionCascadeGroup,

      parqueo_horizontal: {
        label: "Parqueo",
        condition: "isHorizontal",
        mirrorVaras: true,
        rules: [
          { triggerField: "parkingSpaces", syncFn: "syncParkingOnly",
            affects: ["parkingSizeM2"], pendingFields: ["parkingSizeM2"], pendingMirroredFields: [] },
        ],
      } satisfies DimensionCascadeGroup,
```

- [ ] **Step 2: Typecheck** → no output. **Commit** — `git commit -m "feat(units): split parking cascade — only vertical adds to total"`

---

## Task 6: Balcony cascade recomputes total (vertical)

**File:** `components/units/datasheet-units-table-config.ts` — `medidas_balcony`, both rules.

- [ ] **Step 1: housing rule** — change `syncFn: "syncMedidasWithoutTotal"` → `"syncMedidasWithTotal"`; prepend `"totalSizeM2"` to `affects`; add `"totalSizeM2"` to `pendingFields`. Exact:

Find (housing):
```ts
            triggerField: "housing.balconyTerraceM2",
            syncFn: "syncMedidasWithoutTotal",
            affects: [
              "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["habitableConstructionM2", "absorptionPerM2"],
```
Replace:
```ts
            triggerField: "housing.balconyTerraceM2",
            syncFn: "syncMedidasWithTotal",
            affects: [
              "totalSizeM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["totalSizeM2", "habitableConstructionM2", "absorptionPerM2"],
```

- [ ] **Step 2: offices rule** — identical change for `triggerField: "offices.balconyTerraceM2"`.

- [ ] **Step 3:** Update the comment at ~722 from `totalSizeM2 is NOT affected ...` to `totalSizeM2 IS recomputed (total = habitable + parqueo).`

- [ ] **Step 4: Typecheck** → no output. **Commit** — `git commit -m "feat(units): balcony cascade recomputes totalSize (vertical)"`

---

## Task 7: Lote cascades → new sync fns + full propagation

**File:** `components/units/datasheet-units-table-config.ts`

- [ ] **Step 1: `medidas_lote` (landM2)** — find:
```ts
            triggerField: "landM2",
            syncFn: "syncMedidasWithoutTotal",
            affects: [
              "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["habitableConstructionM2", "absorptionPerM2"],
```
Replace:
```ts
            triggerField: "landM2",
            syncFn: "syncMedidasLoteFromLand",
            affects: [
              "totalSizeM2", "unitSizeM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["totalSizeM2", "unitSizeM2", "habitableConstructionM2", "absorptionPerM2"],
```

- [ ] **Step 2: `medidas_unitsize_lote` (unitSizeM2)** — find:
```ts
            triggerField: "unitSizeM2",
            syncFn: "syncMedidasTotalOnly",
            affects: ["totalSizeM2"],
            pendingFields: ["totalSizeM2"],
            pendingMirroredFields: [],
```
Replace:
```ts
            triggerField: "unitSizeM2",
            syncFn: "syncMedidasLoteFromUnitSize",
            affects: [
              "totalSizeM2", "landM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["totalSizeM2", "landM2", "habitableConstructionM2", "absorptionPerM2"],
            pendingMirroredFields: [
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD", "maintenancePricePerM2USD",
            ],
```

- [ ] **Step 3: Typecheck** (`npx tsc --noEmit` → 153 baseline, none new). **Commit** — `git commit -m "feat(units): lote cascades keep unitSize=terreno=total and propagate perM2"`

---

## Task 8: Load reconciliation — mark mismatches pending + collect summary

**File:** `components/units/datasheet-units-table.tsx` — load effect (~1630-1640) + a ref.

- [ ] **Step 1: Add a ref** next to the other refs (near `pendingChangesRef`, ~1180):
```ts
  // Evita re-abrir el dialog de reconciliación cuando el efecto corre por cambio de categoría (no de units)
  const reconciledUnitsRef = useRef<StrapiUnit[] | null>(null)
```

- [ ] **Step 2: Replace the load `forEach`** (~1631-1632). Find:
```ts
      dataRef.current = units
      dataRef.current.forEach((u) => ensureUnitFormulasSynced(u as Record<string, unknown>, { collectionDate: blockCollectionDate, startDate: blockStartDate }, isVerticalRef.current, unitVatRate(u as any), isLoteRef.current))
```
Replace with:
```ts
      dataRef.current = units
      const shouldReconcile = reconciledUnitsRef.current !== units
      const reconciledRows: Array<{ rowIndex: number; fields: string[] }> = []
      dataRef.current.forEach((u, idx) => {
        const changed = ensureUnitFormulasSynced(u as Record<string, unknown>, { collectionDate: blockCollectionDate, startDate: blockStartDate }, isVerticalRef.current, unitVatRate(u as any), isLoteRef.current)
        if (!shouldReconcile || changed.length === 0) return
        const rowKey = getUnitRowKey(u)
        if (!rowKey || isNewUnit(u)) return
        for (const f of changed) {
          addPendingChange(rowKey, f)
          const varasKey = M2_TO_VARAS_MAP[f]
          if (varasKey) addPendingChange(rowKey, varasKey)
        }
        reconciledRows.push({ rowIndex: idx + 1, fields: changed })
      })
      if (shouldReconcile) {
        reconciledUnitsRef.current = units
        if (reconciledRows.length > 0) setFormulaSyncAlert({ open: true, rows: reconciledRows })
      }
```

- [ ] **Step 3: Add effect deps** — extend the load effect's dependency array (~1642) from
`}, [units, blockId, blockCategory, blockCategoryCode, blockIsVertical, blockIsLote])`
to
`}, [units, blockId, blockCategory, blockCategoryCode, blockIsVertical, blockIsLote, addPendingChange, isNewUnit])`

- [ ] **Step 4: Typecheck** → no output for the file. (Will reference `setFormulaSyncAlert` — added in Task 9; if Task 9 not yet applied, this step's typecheck shows a "Cannot find name" error. Apply Task 9 before final typecheck — they are committed together conceptually; for subagent ordering, do Task 9 first or in the same pass.)

> **Ordering note for the executor:** apply Task 9 (state + JSX) **before** typechecking Task 8, since Task 8 references `setFormulaSyncAlert` / `formulaSyncAlert`.

- [ ] **Step 5: Commit** — `git commit -m "feat(units): on load, mark formula mismatches as pending changes"`

---

## Task 9: Reconciliation dialog (state + JSX + labels)

**File:** `components/units/datasheet-units-table.tsx`

- [ ] **Step 1: Field-label map** — add near `RECONCILED_FORMULA_FIELDS` (module scope, Task 3):
```ts
const RECONCILE_FIELD_LABELS: Record<string, string> = {
  parkingSizeM2: "Tamaño Parqueo", totalSizeM2: "Tamaño Total",
  habitableConstructionM2: "Construcción Habitable",
  priceWithoutVATUSD: "Precio sin IVA", pricePerM2USD: "Precio por m²",
  rentalPriceWithoutVATUSD: "Renta sin IVA",
  maintenanceWithoutVATUSD: "Mantenimiento sin IVA", maintenancePricePerM2USD: "Mantenimiento por m²",
  installmentUSD: "Cuota", incomeUSD: "Ingreso",
  unitAbsorption: "Absorción", absorptionPerM2: "Absorción por m²",
  unitSizeM2: "Tamaño Unidad",
}
```

- [ ] **Step 2: Dialog state** — add next to `validationAlert` (~1141):
```ts
  // Dialog de reconciliación: valores recalculados que difieren de lo guardado (marcados en amarillo)
  const [formulaSyncAlert, setFormulaSyncAlert] = useState<{
    open: boolean
    rows: Array<{ rowIndex: number; fields: string[] }>
  }>({ open: false, rows: [] })
```

- [ ] **Step 3: Dialog JSX** — add immediately after the `validationAlert` `</AlertDialog>` (~7415):
```tsx
      <AlertDialog open={formulaSyncAlert.open} onOpenChange={(open) => {
        if (!open) setFormulaSyncAlert({ open: false, rows: [] })
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Valores a sincronizar</AlertDialogTitle>
            <AlertDialogDescription>
              Notamos que algunos valores guardados no coinciden con las fórmulas actuales. Los recalculamos y marcamos en amarillo. Revisa los cambios, ajusta lo que no estés de acuerdo y presiona Guardar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className={`py-2 ${formulaSyncAlert.rows.length > 5 ? 'max-h-64 overflow-y-auto' : ''}`}>
            <ul className="space-y-2 text-sm">
              {formulaSyncAlert.rows.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>Fila {item.rowIndex}: {item.fields.map((f) => RECONCILE_FIELD_LABELS[f] ?? f).join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setFormulaSyncAlert({ open: false, rows: [] })}>
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 4: Typecheck** (`npx tsc --noEmit` → 153 baseline; none in the two touched files). **Commit** — `git commit -m "feat(units): reconciliation dialog for load-time formula mismatches"`

---

## Verification (manual, after deploy/dev)

- **Formulas**: Vertical balcón → Habitable + **Total** suben; Parqueo (vertical) → Total sube; Parqueo (horizontal) → Total **no** cambia; Lote terreno/tamaño → unitSize=terreno=total, perM2 recalcula.
- **Reconciliación**: abrir un bloque con datos viejos → filas con valores recalculados quedan en **amarillo** y aparece el dialog "Valores a sincronizar" con la lista de filas/campos. Guardar persiste. Reabrir → ya no marca (queda limpio).
- **Sin falsos positivos**: un bloque ya consistente no marca nada ni abre el dialog.

## Decisiones registradas

- Reconciliación se dispara solo cuando cambia la **referencia de `units`** (no en cambios de categoría), vía `reconciledUnitsRef`.
- Tolerancia de comparación: `> 0.01`. Ajustable.
- El dialog es **informativo** (un botón "Entendido"); no escribe nada solo — el usuario revisa el amarillo y usa Guardar normal (con su guard de >5 filas).
- Primera carga post-deploy marcará muchas filas (la fórmula del Total cambió). Esperado y aceptado; se autolimpia al guardar.
- Strings del dialog en español hardcodeadas (consistente con otros dialogs del componente); se pueden mover a i18n después.
