import { compareSnapshots, type ExchangeRateComparison, type ExchangeRateSnapshot } from "../domain/exchange-rates/compare.ts"
import { formatDmy } from "../domain/exchange-rates/dates.ts"

/** Lo que trae Prisma de `exchange_rate`: `date` es medianoche UTC; los `Decimal` se leen con `toString()`. */
export type ExchangeRateDbRow = {
  date: Date
  currency: string
  unit: string | null
  buy: { toString(): string } | null
  sell: { toString(): string } | null
  referenceRate: { toString(): string } | null
  source: string | null
  fetchedAt: Date
}

function decimal(value: { toString(): string } | null): number | null {
  if (value == null) return null
  const n = Number(value.toString())
  return Number.isFinite(n) ? n : null
}

/** Fila de la tabla → el snapshot que ya recibía la barra desde n8n (fecha `DD/MM/AAAA`). */
export function toExchangeRateSnapshot(row: ExchangeRateDbRow): ExchangeRateSnapshot {
  return {
    date: formatDmy(row.date.toISOString().slice(0, 10)),
    currency: row.currency,
    unit: row.unit ?? "GTQ",
    buy: decimal(row.buy),
    sell: decimal(row.sell),
    referenceRate: decimal(row.referenceRate),
    source: row.source ?? undefined,
    lastUpdatedUtc: row.fetchedAt.toISOString(),
  }
}

/** Las filas más recientes primero; `null` si la tabla está vacía. */
export function toExchangeRateComparison(rows: ExchangeRateDbRow[]): ExchangeRateComparison | null {
  if (rows.length === 0) return null
  return compareSnapshots(toExchangeRateSnapshot(rows[0]), rows[1] ? toExchangeRateSnapshot(rows[1]) : null)
}
