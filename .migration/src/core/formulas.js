// ⚠ CONGELADO — 2026-09-11. Ya NO es una réplica de la fuente.
//
// Esto fue una copia verbatim del motor que vivía dentro de
// `datasheet-units-table.tsx`, hecha en junio de 2026 para una migración de una
// sola vez. Nadie lo importa desde la aplicación y ningún CI lo corre.
//
// La fuente se movió a `lib/units/formulas.ts` y cambió dos reglas que esta
// copia NO tiene:
//   • la tasa de IVA la manda la operación (venta ÷ renta por separado), no el
//     uso declarado de la unidad;
//   • en industrial, el tamaño de unidad es bodega + oficina + mezzanine (o el
//     terreno en Terrenos), y se recalcula al editar cualquiera de esas partes.
//
// Se deja tal cual a propósito: fue correcto para los datos que migró y volver
// a correrlo con reglas nuevas daría resultados distintos de los de entonces.
// **Para cualquier cálculo nuevo, usar `lib/units/formulas.ts`**, que además se
// puede ejecutar (`npm test`). Si alguna vez hace falta migrar otra vez, esto se
// borra y se importa el motor de verdad, en vez de volver a copiarlo.

// Motor de fórmulas de unidades — RÉPLICA EXACTA (no re-derivada) de las funciones puras de
// `components/units/datasheet-units-table.tsx` y `lib/constants.ts`.
// Las firmas y la lógica deben coincidir VERBATIM con la fuente (solo se quitaron los tipos de TS).
// Cualquier divergencia rompe el test de paridad (`src/formulas.parity.test.mjs`).

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de conversión (lib/constants.ts)
// ─────────────────────────────────────────────────────────────────────────────

// 1 mts² = 1.431 varas cuadradas (medidas de ÁREA)
export const M2_TO_VARAS_SQUARED = 1.431

// 1 m = 1.19 varas (medidas de UNA DIMENSIÓN: frente y profundidad)
export const M_TO_VARAS = 1.19

/** Claves de campo lineal (frente/profundidad) — usan M_TO_VARAS, no M2_TO_VARAS_SQUARED */
const LINEAR_VARAS_KEYS = new Set([
  "frontM2", "frontVaras2",
  "depthM2", "depthVaras2",
])

/**
 * Retorna el factor de conversión correcto para un campo de varas.
 *   Lineal  (frente, profundidad) → M_TO_VARAS   (1.19)
 *   Área    (todo lo demás)       → M2_TO_VARAS_SQUARED (1.431)
 */
export function getVarasFactor(fieldKey) {
  return LINEAR_VARAS_KEYS.has(fieldKey) ? M_TO_VARAS : M2_TO_VARAS_SQUARED
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes del componente (datasheet-units-table.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const PARKING_M2_PER_SPACE = 12.5

const VAT_RATE = 1.092 // Tasa base del sistema (se sobreescribe dinámicamente por bloque)

// Cuota (hipoteca) por país (ISO). País desconocido → GT (default).
const INSTALLMENT_BY_ISO = {
  GT: { annualRate: 0.075, years: 20, loanRatio: 0.9 },
  SV: { annualRate: 0.08, years: 25, loanRatio: 0.85 },
}
function installmentParamsForIso(iso) {
  return INSTALLMENT_BY_ISO[(iso || '').toUpperCase()] ?? INSTALLMENT_BY_ISO.GT
}

// ─────────────────────────────────────────────────────────────────────────────
// Funciones puras (datasheet-units-table.tsx L359-L674)
// ─────────────────────────────────────────────────────────────────────────────

// Redondear a 2 decimales para visualización y para el "fragmento" (lado no editado)
export function roundTo2(n) {
  return Math.round(n * 100) / 100
}

/** Parking Size (m²) = parkingSpaces × 12.5; actualiza parkingSizeM2 y parkingSizeVaras2 en el objeto unit */
function syncUnitParkingSize(unit) {
  const spaces = Number(unit.parkingSpaces) || 0
  unit.parkingSizeM2 = spaces * PARKING_M2_PER_SPACE
  unit.parkingSizeVaras2 = roundTo2(spaces * PARKING_M2_PER_SPACE * M2_TO_VARAS_SQUARED)
}

/**
 * Total Size = Construcción Habitable + (vertical: parqueo; horizontal/lote: 0).
 * Requiere habitableConstructionM2 ya sincronizado (llamar syncUnitHabitableConstruction antes).
 */
function syncUnitTotalSize(unit, isVertical = false) {
  const habitable = Number(unit.habitableConstructionM2) || 0
  const parkingSize = isVertical ? (Number(unit.parkingSizeM2) || 0) : 0
  const total = habitable + parkingSize
  unit.totalSizeM2 = total
  unit.totalSizeVaras2 = roundTo2(total * M2_TO_VARAS_SQUARED)
}

/** Habitable Construction: para lotes usa Terreno (landM2); para vertical = Tamaño + Balcón; resto = Tamaño */
function syncUnitHabitableConstruction(unit, isVertical = false, isLote = false) {
  let habitable
  if (isLote) {
    habitable = Number(unit.landM2) || 0
  } else {
    const unitSize = Number(unit.unitSizeM2) || 0
    const balcony = isVertical ? (Number(unit.unitType?.[0]?.balconyTerraceSizeM2) || 0) : 0
    habitable = unitSize + balcony
  }
  unit.habitableConstructionM2 = habitable
  unit.habitableConstructionVaras2 = roundTo2(habitable * M2_TO_VARAS_SQUARED)
}

/**
 * Quita IVA: total → sinIVA.
 * vatRate < 1 (ej. 0.916): sinIVA = total × vatRate
 * vatRate ≥ 1 (ej. 1.12):  sinIVA = total ÷ vatRate
 */
function removeVat(total, vatRate) {
  return vatRate < 1 ? total * vatRate : total / vatRate
}

/**
 * Pone IVA: sinIVA → total.
 * vatRate < 1 (ej. 0.916): total = sinIVA ÷ vatRate
 * vatRate ≥ 1 (ej. 1.12):  total = sinIVA × vatRate
 */
function applyVat(base, vatRate) {
  return vatRate < 1 ? base / vatRate : base * vatRate
}

/** Price Without VAT = removeVat(Total, vatRate); Price per m² = Price Without VAT / Habitable m² */
function syncUnitPriceFromTotal(unit, vatRate = VAT_RATE) {
  const totalPrice = Number(unit.totalPriceUSD) || 0
  const priceWithoutVAT = removeVat(totalPrice, vatRate)
  unit.priceWithoutVATUSD = roundTo2(priceWithoutVAT)
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  unit.pricePerM2USD = habitable > 0 ? roundTo2(priceWithoutVAT / habitable) : 0
}

/** Renta sin IVA = removeVat(Renta, vatRate); Renta por m² = Renta sin IVA / Espacio habitable */
function syncUnitRentalFromTotal(unit, vatRate = VAT_RATE) {
  const rental = Number(unit.rentalPriceUSD) || 0
  const rentalWithoutVAT = removeVat(rental, vatRate)
  unit.rentalPriceWithoutVATUSD = roundTo2(rentalWithoutVAT)
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  unit.rentalPricePerM2WithoutVATUSD = habitable > 0 ? roundTo2(rentalWithoutVAT / habitable) : 0
}

/** Mantenimiento sin IVA (USD) = removeVat(Total, vatRate) */
function maintenanceWithoutVatUsd(unit, vatRate = VAT_RATE) {
  const total = Number(unit.maintenanceTotalPriceM2USD) || 0
  return roundTo2(removeVat(total, vatRate))
}

/** Mantenimiento por m² = Mantenimiento sin IVA ÷ construcción habitable (m²) */
function syncUnitMaintenancePerM2(unit, vatRate = VAT_RATE) {
  const withoutVat = maintenanceWithoutVatUsd(unit, vatRate)
  unit.maintenanceWithoutVATUSD = withoutVat
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  unit.maintenancePricePerM2USD = habitable > 0 ? roundTo2(withoutVat / habitable) : 0
}

/** Calcula cuota mensual desde precio sin IVA (para sync y para fallback de vista) */
function calcInstallmentFromPriceWithoutVAT(priceWithoutVAT, iso) {
  const { annualRate, years, loanRatio } = installmentParamsForIso(iso)
  const loanAmount = priceWithoutVAT * loanRatio
  if (loanAmount <= 0) return 0
  const monthlyRate = annualRate / 12
  const nper = years * 12
  const pmt = (monthlyRate * loanAmount) / (1 - Math.pow(1 + monthlyRate, -nper))
  return roundTo2(Math.abs(pmt))
}

/** Cuota mensual hipoteca por país (ISO). PMT(rate, nper, -pv) → valor positivo */
function syncUnitInstallment(unit, vatRate = VAT_RATE, iso) {
  const priceWithoutVAT = Number(unit.priceWithoutVATUSD) || removeVat(Number(unit.totalPriceUSD) || 0, vatRate)
  unit.installmentUSD = calcInstallmentFromPriceWithoutVAT(priceWithoutVAT, iso)
}

/** Ingreso = cuota × 4 */
function syncUnitIncome(unit) {
  const installment = Number(unit.installmentUSD) || 0
  unit.incomeUSD = roundTo2(installment * 4)
}

/**
 * Absorción de unidad: si disponibilidad es "Not Available",
 * 1 / (días entre fecha_recolección y fecha_inicio / 30) = unidades vendidas por mes.
 * Sin redondear (float). Si fechas faltan o diffDays <= 0, retorna 0.
 */
function syncUnitAbsorption(unit, collectionDateStr, startDateStr) {
  const availability = unit.availability
  if (availability !== "Not Available" && availability !== "No Disponible") {
    unit.unitAbsorption = 0
    return
  }
  if (!collectionDateStr || !startDateStr) {
    unit.unitAbsorption = 0
    return
  }
  const collection = new Date(collectionDateStr).getTime()
  const start = new Date(startDateStr).getTime()
  const diffMs = collection - start
  const diffDays = diffMs / (24 * 60 * 60 * 1000)
  if (diffDays <= 0) {
    unit.unitAbsorption = 0
    return
  }
  const raw = 1 / (diffDays / 30)
  unit.unitAbsorption = Math.round(raw * 1e12) / 1e12
}

/**
 * Absorción por m² = absorción de unidad × tamaño habitable.
 * Si absorción es 0 o tamaño habitable es null/0, resultado 0. Float, no redondear.
 */
function syncUnitAbsorptionPerM2(unit) {
  const absorption = Number(unit.unitAbsorption) || 0
  if (absorption === 0) {
    unit.absorptionPerM2 = 0
    return
  }
  const habitable = Number(unit.habitableConstructionM2) ?? Number(unit.unitSizeM2) ?? 0
  if (habitable === 0) {
    unit.absorptionPerM2 = 0
    return
  }
  unit.absorptionPerM2 = absorption * habitable
}

/**
 * Campos de fórmula que se reconcilian en carga (si difieren de la DB → se marcan como cambio).
 * Solo deben incluirse campos que Strapi PERSISTE; un campo derivado solo-cliente que no se
 * guarda siempre vendría en 0 desde la DB y se marcaría como "cambio" en cada carga (falso positivo).
 * Por eso se excluye `maintenanceWithoutVATUSD` (ver CLIENT_ONLY_USD_FIELDS en lib/api/strapi.ts:
 * es derivado de maintenanceTotalPriceM2USD y nunca se persiste).
 */
export const RECONCILED_FORMULA_FIELDS = [
  "parkingSizeM2", "totalSizeM2", "habitableConstructionM2",
  "priceWithoutVATUSD", "pricePerM2USD",
  "rentalPriceWithoutVATUSD",
  "maintenancePricePerM2USD",
  "installmentUSD", "incomeUSD",
  "unitAbsorption", "absorptionPerM2",
  "unitSizeM2", // lote: unitSize = terreno
]

/** Sincroniza todos los campos con fórmula en la unidad (para que existan en memoria y se persistan al guardar) */
export function ensureUnitFormulasSynced(
  unit,
  blockDates,
  isVertical = false,
  vatRate = VAT_RATE,
  isLote = false,
  countryIso
) {
  // Snapshot para reconciliación: detectar qué campos de fórmula cambian respecto a lo guardado.
  const before = {}
  for (const f of RECONCILED_FORMULA_FIELDS) before[f] = Number(unit[f]) || 0

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
  syncUnitInstallment(unit, vatRate, countryIso)
  syncUnitIncome(unit)
  syncUnitAbsorption(unit, blockDates?.collectionDate, blockDates?.startDate)
  syncUnitAbsorptionPerM2(unit)

  const changed = []
  for (const f of RECONCILED_FORMULA_FIELDS) {
    const after = Number(unit[f]) || 0
    if (Math.abs(after - before[f]) > 0.01) changed.push({ field: f, before: before[f], after })
  }
  return changed
}

// ─────────────────────────────────────────────────────────────────────────────
// getVatRate — versión standalone (componente L1076-1084)
// ─────────────────────────────────────────────────────────────────────────────

export function getVatRate(quarter, category, usageName, iso) {
  if ((iso || '').toUpperCase() === 'SV') return 1.0 // El Salvador: sin IVA aprobado aún → 0% (precio sin IVA = total)
  const isInterior = quarter ? ['S1', 'S2'].includes(quarter) : false
  const isLote = !!(category && category.toLowerCase().includes('lote'))
  if (isInterior && isLote) return 1.12
  const usage = (usageName || '').toLowerCase()
  if (usage.includes('renta')) return 1.12
  if (usage.includes('venta')) return 0.916
  return 1.12
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de contexto de bloque (espejo de app/(main)/units/list/[id]/page.tsx L119-121)
// ─────────────────────────────────────────────────────────────────────────────

export function isVerticalBlock(categoryName, categoryCode) {
  const s = `${categoryName || ''} ${categoryCode || ''}`.toLowerCase()
  return s.includes('vertical') || s.includes('vert')
}

export function isLoteBlock(categoryName, categoryCode) {
  const s = `${categoryName || ''} ${categoryCode || ''}`.toLowerCase()
  return s.includes('lote') || s.includes('lot')
}
