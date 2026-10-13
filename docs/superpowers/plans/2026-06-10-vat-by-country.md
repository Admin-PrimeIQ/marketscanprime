# IVA (getVatRate) por país (ISO) — El Salvador = 0% — Plan corto

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** El IVA se separa por país (ISO). El Salvador (`SV`) usa **factor 1.0 = 0% IVA** (precio sin IVA = precio total) como placeholder hasta que aprueben su tasa. Guatemala / default → lógica actual (1.12 / 0.916). Replicar en UI y CLI.

**Por qué 1.0 = 0%:** `removeVat(total, 1.0)` = `total / 1.0` = total; `applyVat(base, 1.0)` = base. Identidad en ambos sentidos → no aplica IVA.

**El IVA pasa por un solo closure `unitVatRate` (54 usos), así que el threading es chico.**

---

## Task 1 — UI (`components/units/datasheet-units-table.tsx`)

1. `getVatRate` (~L1086): agregar `iso?: string` como ÚLTIMO parámetro y short-circuit SV al inicio:
```ts
const getVatRate = (q?: string, cat?: string, usageName?: string, iso?: string) => {
  if ((iso || '').toUpperCase() === 'SV') return 1.0 // El Salvador: sin IVA aprobado aún → 0% (precio sin IVA = total)
  const isInterior = q ? ['S1', 'S2'].includes(q) : false
  const isLote = !!(cat?.toLowerCase().includes('lote'))
  if (isInterior && isLote) return 1.12
  const usage = (usageName || '').toLowerCase()
  if (usage.includes('renta')) return 1.12
  if (usage.includes('venta')) return 0.916
  return 1.12
}
```
2. Corregir el comentario de arriba (~L1084-1085) que menciona `1.092 (9,2%)` (que `getVatRate` NUNCA devuelve). Nuevo comentario: describe los valores reales — `1.12` (12%) salvo "Uso Venta" → `0.916`; y `SV → 1.0` (0%, sin IVA aprobado).
3. `unitVatRate` (~L1095): pasar el ISO del bloque:
```ts
const unitVatRate = (unit: Record<string, unknown>) =>
  getVatRate(blockQuarter, blockCategory, (unit as any).unitUsage?.name, blockCountry?.isoCode2 || blockCountry?.code)
```
(`blockCountry` ya es prop destructurada.)
4. `vatRateRef` (~L1097-1100): pasar el ISO también (consistencia; está sin uso pero igual):
```ts
const vatRateRef = useRef(getVatRate(blockQuarter, blockCategory, undefined, blockCountry?.isoCode2 || blockCountry?.code))
useEffect(() => {
  vatRateRef.current = getVatRate(blockQuarter, blockCategory, undefined, blockCountry?.isoCode2 || blockCountry?.code)
}, [blockQuarter, blockCategory, blockCountry])
```
5. Verificar: `npx tsc --noEmit` → sin errores nuevos en el archivo (baseline global 152). NO threadear otros call sites: todos usan `unitVatRate`.

Commit: `feat(units): VAT (IVA) by country ISO — El Salvador = 0% placeholder`

## Task 2 — CLI (`.migration/`)

1. `src/core/formulas.js` `getVatRate(quarter, category, usageName)` (~L267): agregar `iso` como último parámetro y el mismo short-circuit `if ((iso||'').toUpperCase() === 'SV') return 1.0` al inicio. Resto idéntico.
2. `src/core/pipeline.js` (~L136): `const vat = getVatRate(block.quarter, block.categoryName, unit.unitUsage?.name, block.countryIso)`.
3. `src/formulas.parity.test.mjs`: agregar caso de IVA por país. Con `totalPriceUSD = 1234` y vatRate vía getVatRate:
   - GT (`getVatRate('T1','Casas','Uso Venta','GT')`) → factor distinto de 1; corré una unidad por `ensureUnitFormulasSynced(u, {}, false, getVatRate('T1','Casas',undefined,'GT'), false, 'GT')` con `u.totalPriceUSD=1234` y assertá que `u.priceWithoutVATUSD !== 1234` (se le restó IVA).
   - SV: `getVatRate(...,'SV')` debe ser `1.0`; corré `ensureUnitFormulasSynced(u2, {}, false, getVatRate('T1','Casas',undefined,'SV'), false, 'SV')` con `u2.totalPriceUSD=1234` y assertá `u2.priceWithoutVATUSD === 1234` (sin IVA).
   - Leé el estilo del test antes; usá `assert`. Correr `node ./src/formulas.parity.test.mjs` → `parity OK`.

Commit: `feat(migration): replicate VAT-by-ISO (El Salvador = 0%)`

## Verificación final
UI tsc limpio. CLI parity OK. Un bloque SV → precio sin IVA = precio total (0% IVA) y todo lo derivado (por m², renta, mantenimiento, cuota) encadena sin IVA. GT sin cambios.
