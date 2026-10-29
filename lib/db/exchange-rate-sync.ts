import "server-only"

import { fetchTipoCambioRango } from "../domain/exchange-rates/banguat-client.ts"
import { rangeCoverage, recentRange } from "../domain/exchange-rates/dates.ts"
import { EXCHANGE_RATES_LOCK_KEY, upsertCounts, upsertExchangeRatesQuery, type UpsertCounts } from "../domain/exchange-rates/upsert-sql.ts"
import { getAppPrisma } from "./client"
import { APP_SCHEMA } from "./connection"

/** Días que pide cada corrida: si una falla, la siguiente rellena el hueco. */
export const SYNC_DAYS = 15

export type ExchangeRateSyncResult = UpsertCounts & {
  from: string
  to: string
  received: number
  missingDays: string[]
  banguatMs: number
}

/** Banguat no respondió o respondió algo que no se pudo usar. La tabla no se tocó. */
export class ExchangeRateSourceError extends Error {}

/** Otra carga (`etl` o la ruta) tiene el lock. La tabla no se tocó. */
export class ExchangeRateSyncBusyError extends Error {}

/**
 * Trae de Banguat los últimos `SYNC_DAYS` días y hace upsert en `msp_app.exchange_rate`, con el
 * mismo SQL y la misma llave de lock que `etl/src/exchange-rates`. La consulta a Banguat va fuera
 * de la transacción. Quien llama ya validó el permiso (guarda de staging y `CRON_SECRET`).
 */
export async function syncRecentExchangeRates(now: Date = new Date()): Promise<ExchangeRateSyncResult> {
  const { from, to } = recentRange(SYNC_DAYS, now)

  let fetched: Awaited<ReturnType<typeof fetchTipoCambioRango>>
  try {
    fetched = await fetchTipoCambioRango(from, to, { timeoutMs: 20_000, attempts: 2 })
  } catch (error) {
    throw new ExchangeRateSourceError(`Banguat: ${(error as Error).message}`)
  }
  const { rows, ms } = fetched
  const { missing, outside } = rangeCoverage(rows.map((r) => r.date), from, to)
  if (rows.length === 0) throw new ExchangeRateSourceError(`Banguat no devolvió días entre ${from} y ${to}`)
  if (outside.length > 0) throw new ExchangeRateSourceError(`Banguat devolvió ${outside.length} días fuera del rango: ${outside.slice(0, 5).join(", ")}`)

  const { text, values } = upsertExchangeRatesQuery(APP_SCHEMA, rows)
  const counts = await getAppPrisma().$transaction(
    async (tx) => {
      const lock = await tx.$queryRawUnsafe<{ locked: boolean }[]>("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", EXCHANGE_RATES_LOCK_KEY)
      if (!lock[0]?.locked) throw new ExchangeRateSyncBusyError("Otra carga del tipo de cambio está en curso sobre msp_app")
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'")
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'")
      const result = await tx.$queryRawUnsafe<{ inserted: unknown; updated: unknown }[]>(text, ...values)
      return upsertCounts(rows.length, result[0])
    },
    { maxWait: 10_000, timeout: 40_000 },
  )

  return { from, to, received: rows.length, missingDays: missing, banguatMs: ms, ...counts }
}
