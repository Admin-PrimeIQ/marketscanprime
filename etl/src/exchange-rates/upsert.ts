import type pg from "pg"
import type { ExchangeRateRow } from "../../../lib/domain/exchange-rates/banguat.ts"
import { APP_SCHEMA } from "../app/connection"

export type UpsertCounts = { inserted: number; updated: number; unchanged: number }

/**
 * Escribe las filas en `msp_app.exchange_rate` en una sola sentencia, por `(date, currency)`.
 * Idempotente: una fila igual a la guardada no se toca (ni su `fetched_at`); una distinta se
 * sobrescribe (Banguat corrigió el día). Corre dentro de la transacción de quien llama.
 */
export async function upsertExchangeRates(client: pg.ClientBase, rows: ExchangeRateRow[]): Promise<UpsertCounts> {
  if (rows.length === 0) return { inserted: 0, updated: 0, unchanged: 0 }
  const table = `"${APP_SCHEMA}"."exchange_rate"`
  const { rows: result } = await client.query<{ inserted: string; updated: string }>(
    `WITH input AS (
       SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::text[])
         AS t(date, currency, unit, buy, sell, reference_rate, source)
     ), upserted AS (
       INSERT INTO ${table} AS er (date, currency, unit, buy, sell, reference_rate, source, fetched_at)
       SELECT date, currency, unit, buy, sell, reference_rate, source, now() FROM input
       ON CONFLICT (date, currency) DO UPDATE SET
         unit = EXCLUDED.unit,
         buy = EXCLUDED.buy,
         sell = EXCLUDED.sell,
         reference_rate = EXCLUDED.reference_rate,
         source = EXCLUDED.source,
         fetched_at = EXCLUDED.fetched_at
       WHERE (er.unit, er.buy, er.sell, er.reference_rate, er.source)
         IS DISTINCT FROM (EXCLUDED.unit, EXCLUDED.buy, EXCLUDED.sell, EXCLUDED.reference_rate, EXCLUDED.source)
       RETURNING (xmax = 0) AS inserted
     )
     SELECT count(*) FILTER (WHERE inserted) AS inserted, count(*) FILTER (WHERE NOT inserted) AS updated FROM upserted`,
    [
      rows.map((r) => r.date),
      rows.map((r) => r.currency),
      rows.map((r) => r.unit),
      rows.map((r) => r.buy),
      rows.map((r) => r.sell),
      rows.map((r) => r.referenceRate),
      rows.map((r) => r.source),
    ],
  )
  const inserted = Number(result[0].inserted)
  const updated = Number(result[0].updated)
  return { inserted, updated, unchanged: rows.length - inserted - updated }
}
