# Cuota (installmentUSD) por país (ISO) — Plan corto

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** La Cuota (USD) usa parámetros distintos por país (hardcode por ISO), misma base `priceWithoutVATUSD`. Replicar en UI y en el CLI de migración para no divergir.

**Parámetros (hardcode por ISO):**
| ISO | Tasa anual | Plazo (años) | Financiado | Enganche |
|---|---|---|---|---|
| GT (default) | 0.075 | 20 (240 cuotas) | 0.90 | 10% |
| SV | 0.08 | 25 (300 cuotas) | 0.85 | 15% |

PMT estándar: `loan = pwo × loanRatio; pmt = (r/12 × loan) / (1 − (1 + r/12)^(−años×12))`. Base `pwo = priceWithoutVATUSD` (igual que hoy). País desconocido → GT.

**Config compartida (definir idéntica en UI y CLI):**
```js
const INSTALLMENT_BY_ISO = {
  GT: { annualRate: 0.075, years: 20, loanRatio: 0.90 },
  SV: { annualRate: 0.08,  years: 25, loanRatio: 0.85 },
}
function installmentParamsForIso(iso) {
  return INSTALLMENT_BY_ISO[(iso || '').toUpperCase()] ?? INSTALLMENT_BY_ISO.GT
}
function calcInstallmentFromPriceWithoutVAT(priceWithoutVAT, iso) {
  const { annualRate, years, loanRatio } = installmentParamsForIso(iso)
  const loanAmount = priceWithoutVAT * loanRatio
  if (loanAmount <= 0) return 0
  const monthlyRate = annualRate / 12
  const nper = years * 12
  const pmt = (monthlyRate * loanAmount) / (1 - Math.pow(1 + monthlyRate, -nper))
  return roundTo2(Math.abs(pmt))
}
function syncUnitInstallment(unit, vatRate, iso) {
  const priceWithoutVAT = Number(unit.priceWithoutVATUSD) || removeVat(Number(unit.totalPriceUSD) || 0, vatRate)
  unit.installmentUSD = calcInstallmentFromPriceWithoutVAT(priceWithoutVAT, iso)
}
```
`ensureUnitFormulasSynced(..., iso)` recibe el ISO (último parámetro) y se lo pasa a `syncUnitInstallment`.

---

## Task 1 — UI (`components/units/datasheet-units-table.tsx`)

1. Reemplazar las constantes `INSTALLMENT_ANNUAL_RATE/YEARS/NPER/LOAN_RATIO` por `INSTALLMENT_BY_ISO` + `installmentParamsForIso`.
2. `calcInstallmentFromPriceWithoutVAT(priceWithoutVAT, iso?)` y `syncUnitInstallment(unit, vatRate, iso?)` como arriba.
3. `ensureUnitFormulasSynced(...)` → agregar `countryIso?: string` como ÚLTIMO parámetro; dentro, `syncUnitInstallment(unit, vatRate, countryIso)`.
4. En el componente, agregar `countryIsoRef` (espejo de `isVerticalRef`):
   ```ts
   const countryIsoRef = useRef<string | undefined>(blockCountry?.isoCode2 || blockCountry?.code || undefined)
   useEffect(() => { countryIsoRef.current = blockCountry?.isoCode2 || blockCountry?.code || undefined }, [blockCountry])
   ```
5. Threadear `countryIsoRef.current` en TODOS los call sites:
   - 4× `ensureUnitFormulasSynced(... isLoteRef.current)` → agregar `, countryIsoRef.current`.
   - 3× registry: `syncUnitInstallment(u, unitVatRate(u))` → `syncUnitInstallment(u, unitVatRate(u), countryIsoRef.current)` (replace_all).
   - 8× handlers: `syncUnitInstallment(unit as any, unitVatRate(unit as any))` → `..., countryIsoRef.current)` (replace_all).
   - 4× display en getCellContent: `calcInstallmentFromPriceWithoutVAT(...)` → agregar `, countryIsoRef.current` como último arg.
6. Verificar: `npx tsc --noEmit` sin errores nuevos en el archivo (baseline global 152).

## Task 2 — CLI (`.migration/`)

1. `src/core/formulas.js`: replicar EXACTO la config + `calcInstallmentFromPriceWithoutVAT(pwo, iso)` + `syncUnitInstallment(unit, vatRate, iso)` + `ensureUnitFormulasSynced(..., iso)` (último param), pasándolo a `syncUnitInstallment`.
2. `src/core/strapi.js`:
   - `blocksListUrl`: agregar `populate[project][populate][country]=true` (modo REST y content-manager).
   - `normalizeBlock`: agregar `countryIso: raw?.project?.country?.isoCode2 || raw?.project?.country?.code`.
3. `src/core/pipeline.js`: en la fase Fórmulas, `ensureUnitFormulasSynced(clone, blockDates, isV, vat, isL, block.countryIso)`.
4. `src/formulas.parity.test.mjs`: agregar un caso de cuota que compute el PMT esperado de forma independiente para GT y SV (mismo `pwo`, ej. 100000) y asserte que `ensureUnitFormulasSynced` produce esos valores y que GT ≠ SV. Correr `node ./src/formulas.parity.test.mjs` → `parity OK`.

## Verificación final
- UI tsc limpio. CLI parity OK. La Cuota de un bloque SV usa 8% / 25 años / 85%; un bloque GT (o país desconocido) sigue 7.5% / 20 / 90%.
