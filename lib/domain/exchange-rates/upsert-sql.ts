import type { ExchangeRateRow } from "./banguat.ts"

/** Llave del `pg_try_advisory_xact_lock` que comparten la carga de `etl/` y la ruta del cron. */
export const EXCHANGE_RATES_LOCK_KEY = "msp_app_exchange_rates"

export type UpsertCounts = { inserted: number; updated: number; unchanged: number }

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/

/**
 * Sentencia única de upsert en `<schema>.exchange_rate` por `(date, currency)`. Idempotente: una
 * fila igual a la guardada no se toca (ni su `fetched_at`); una distinta se sobrescribe (Banguat
 * corrigió el día). Devuelve una fila con `inserted` y `updated`. Sin dependencia de `pg`: `etl/`
 * la corre con `client.query` y la app con `$queryRawUnsafe` de Prisma.
 */
export function upsertExchangeRatesQuery(schema: string, rows: ExchangeRateRow[]): { text: string; values: unknown[] } {
  if (!SCHEMA_RE.test(schema)) throw new Error(`Esquema inválido: ${schema}`)
  const table = `"${schema}"."exchange_rate"`
  const text = `WITH input AS (
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
     SELECT count(*) FILTER (WHERE inserted) AS inserted, count(*) FILTER (WHERE NOT inserted) AS updated FROM upserted`
  const values = [
    rows.map((r) => r.date),
    rows.map((r) => r.currency),
    rows.map((r) => r.unit),
    rows.map((r) => r.buy),
    rows.map((r) => r.sell),
    rows.map((r) => r.referenceRate),
    rows.map((r) => r.source),
  ]
  return { text, values }
}

/** Conteos a partir de la fila que devuelve la sentencia (`pg` da texto; Prisma, `bigint`). */
export function upsertCounts(total: number, result: { inserted: unknown; updated: unknown } | undefined): UpsertCounts {
  const inserted = Number(result?.inserted ?? 0)
  const updated = Number(result?.updated ?? 0)
  return { inserted, updated, unchanged: total - inserted - updated }
}
