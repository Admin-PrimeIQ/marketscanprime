/**
 * Contadores y promedios de un bloque a partir de sus unidades.
 *
 * Reemplaza el nodo "Compute counters" del workflow de n8n "Block Edit Queue (webhook + Redis
 * debounce)" (docs/migration/N8N_WORKFLOWS.md, workflow 6), que corría después de cada guardado
 * de la hoja y hacía `PUT` del bloque en Strapi. Es una copia exacta, decidida con el usuario el
 * 29 oct: las reglas raras se conservan hasta que el reporte de paridad (`npm run counters:parity`
 * en `etl/`) diga si conviene cambiarlas. Por eso:
 *
 *   - se cuentan todas las unidades, disponibles o no, en totales y promedios;
 *   - el tamaño de una unidad es `unitSizeM2`, y si es 0 o falta, `totalSizeM2`;
 *   - `averageSizeM2` divide entre todas las unidades, incluidas las de tamaño 0;
 *   - los promedios de precio, precio por m², cuota e ingreso solo usan valores > 0, y son `null`
 *     si ninguna unidad tiene uno;
 *   - un valor que no es número (null, texto, NaN) cuenta como 0, igual que `num()` en n8n.
 *
 * Pura: sin React ni alias `@/`, para que corra con `node --test` y desde `etl/`. Quien la llame
 * convierte antes los `Decimal` de Prisma o los `numeric` de Postgres a `number`.
 */

export type CounterUnit = {
  availability?: string | null
  unitSizeM2?: number | null
  totalSizeM2?: number | null
  totalPriceUSD?: number | null
  pricePerM2USD?: number | null
  installmentUSD?: number | null
  incomeUSD?: number | null
  parkingSpaces?: number | null
}

/** Los mismos nombres que el workflow escribía en el bloque de Strapi. */
export type BlockCounters = {
  availableUnits: number
  availableM2: number
  totalUnits: number
  totalM2: number
  averagePricePerM2USD: number | null
  averageInstallmentUSD: number | null
  averageIncomeUSD: number | null
  assignedParking: number
  averagePriceUSD: number | null
  averageSizeM2: number | null
}

export const BLOCK_COUNTER_FIELDS = [
  "availableUnits",
  "availableM2",
  "totalUnits",
  "totalM2",
  "averagePricePerM2USD",
  "averageInstallmentUSD",
  "averageIncomeUSD",
  "assignedParking",
  "averagePriceUSD",
  "averageSizeM2",
] as const satisfies readonly (keyof BlockCounters)[]

export type BlockCounterField = (typeof BLOCK_COUNTER_FIELDS)[number]

function num(value: unknown): number {
  return typeof value === "number" && !Number.isNaN(value) ? value : 0
}

function isAvailable(availability: string | null | undefined): boolean {
  return availability === "Available" || availability === "available"
}

/** `Math.round(x * 100) / 100`, como n8n (no es redondeo bancario ni `toFixed`). */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function average(total: number, count: number): number | null {
  return count ? round2(total / count) : null
}

export function computeBlockCounters(units: readonly CounterUnit[]): BlockCounters {
  let availableUnits = 0
  let availableM2 = 0
  let totalSize = 0
  let countSize = 0
  let totalPrice = 0
  let countPrice = 0
  let totalPricePerM2 = 0
  let countPricePerM2 = 0
  let totalInstallment = 0
  let countInstallment = 0
  let totalIncome = 0
  let countIncome = 0
  let assignedParking = 0

  for (const unit of units) {
    const size = num(unit.unitSizeM2) || num(unit.totalSizeM2)
    const price = num(unit.totalPriceUSD)
    const pricePerM2 = num(unit.pricePerM2USD)
    const installment = num(unit.installmentUSD)
    const income = num(unit.incomeUSD)

    if (isAvailable(unit.availability)) {
      availableUnits++
      availableM2 += size
    }

    totalSize += size
    countSize++
    if (price > 0) {
      totalPrice += price
      countPrice++
    }
    if (pricePerM2 > 0) {
      totalPricePerM2 += pricePerM2
      countPricePerM2++
    }
    if (installment > 0) {
      totalInstallment += installment
      countInstallment++
    }
    if (income > 0) {
      totalIncome += income
      countIncome++
    }

    assignedParking += num(unit.parkingSpaces)
  }

  return {
    availableUnits,
    availableM2: round2(availableM2),
    totalUnits: units.length,
    totalM2: round2(totalSize),
    averagePricePerM2USD: average(totalPricePerM2, countPricePerM2),
    averageInstallmentUSD: average(totalInstallment, countInstallment),
    averageIncomeUSD: average(totalIncome, countIncome),
    assignedParking,
    averagePriceUSD: average(totalPrice, countPrice),
    averageSizeM2: average(totalSize, countSize),
  }
}
