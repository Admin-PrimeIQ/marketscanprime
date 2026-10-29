/**
 * Puente entre Prisma y `computeBlockCounters` (lib/domain/blocks/counters.ts): unidad de Prisma →
 * `CounterUnit`, y contadores → columnas de `msp_app.block`. Puro: corre bajo `node --test`; la
 * transacción está en `block-counters.ts`.
 */

import type { BlockCounters, CounterUnit } from "../domain/blocks/counters.ts"

/** `Decimal` de Prisma, número o vacío. */
type DecimalLike = { toString(): string } | number | null

/** Columnas de la unidad que lee el cálculo; se pasa tal cual a `findMany({ select })`. */
export const COUNTER_UNIT_SELECT = {
  availability: true,
  unitSizeM2: true,
  totalSizeM2: true,
  totalPriceUsd: true,
  pricePerM2Usd: true,
  installmentUsd: true,
  incomeUsd: true,
  parkingSpaces: true,
} as const

export type CounterUnitRow = {
  availability: string | null
  unitSizeM2: DecimalLike
  totalSizeM2: DecimalLike
  totalPriceUsd: DecimalLike
  pricePerM2Usd: DecimalLike
  installmentUsd: DecimalLike
  incomeUsd: DecimalLike
  parkingSpaces: number | null
}

/** Los 10 campos del bloque con los nombres de `prisma/schema.prisma`. */
export type BlockCounterData = {
  availableUnits: number
  availableM2: number
  totalUnits: number
  totalM2: number
  averagePricePerM2Usd: number | null
  averageInstallmentUsd: number | null
  averageIncomeUsd: number | null
  assignedParking: number
  averagePriceUsd: number | null
  averageSizeM2: number | null
}

export type StoredBlockCounters = { [K in keyof BlockCounterData]: DecimalLike }

function toNumber(value: DecimalLike): number | null {
  if (value === null) return null
  return typeof value === "number" ? value : Number(value.toString())
}

export function toCounterUnit(row: CounterUnitRow): CounterUnit {
  return {
    availability: row.availability,
    unitSizeM2: toNumber(row.unitSizeM2),
    totalSizeM2: toNumber(row.totalSizeM2),
    totalPriceUSD: toNumber(row.totalPriceUsd),
    pricePerM2USD: toNumber(row.pricePerM2Usd),
    installmentUSD: toNumber(row.installmentUsd),
    incomeUSD: toNumber(row.incomeUsd),
    parkingSpaces: row.parkingSpaces,
  }
}

export function toBlockCounterData(counters: BlockCounters): BlockCounterData {
  return {
    availableUnits: counters.availableUnits,
    availableM2: counters.availableM2,
    totalUnits: counters.totalUnits,
    totalM2: counters.totalM2,
    averagePricePerM2Usd: counters.averagePricePerM2USD,
    averageInstallmentUsd: counters.averageInstallmentUSD,
    averageIncomeUsd: counters.averageIncomeUSD,
    assignedParking: counters.assignedParking,
    averagePriceUsd: counters.averagePriceUSD,
    averageSizeM2: counters.averageSizeM2,
  }
}

/** Las columnas tienen 2 decimales y los contadores vienen redondeados a 2: se comparan en centésimas. */
export function sameBlockCounters(stored: StoredBlockCounters, next: BlockCounterData): boolean {
  return (Object.keys(next) as (keyof BlockCounterData)[]).every((key) => {
    const a = toNumber(stored[key])
    const b = next[key]
    if (a === null || b === null) return a === b
    return Math.round(a * 100) === Math.round(b * 100)
  })
}
