import type pg from "pg"
import type { ExchangeRateRow } from "../../../lib/domain/exchange-rates/banguat.ts"
import { upsertCounts, upsertExchangeRatesQuery, type UpsertCounts } from "../../../lib/domain/exchange-rates/upsert-sql.ts"
import { APP_SCHEMA } from "../app/connection"

export type { UpsertCounts }

/**
 * Escribe las filas en `msp_app.exchange_rate` en una sola sentencia (la misma que usa la ruta del
 * cron, `lib/domain/exchange-rates/upsert-sql.ts`). Corre dentro de la transacción de quien llama.
 */
export async function upsertExchangeRates(client: pg.ClientBase, rows: ExchangeRateRow[]): Promise<UpsertCounts> {
  if (rows.length === 0) return { inserted: 0, updated: 0, unchanged: 0 }
  const { text, values } = upsertExchangeRatesQuery(APP_SCHEMA, rows)
  const { rows: result } = await client.query<{ inserted: string; updated: string }>(text, values)
  return upsertCounts(rows.length, result[0])
}
