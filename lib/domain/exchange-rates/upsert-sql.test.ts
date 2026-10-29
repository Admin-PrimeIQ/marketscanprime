/**
 * Sentencia de upsert de `exchange_rate` que comparten `etl/` y la ruta del cron.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { rowFromBanguat } from "./banguat.ts"
import { upsertCounts, upsertExchangeRatesQuery } from "./upsert-sql.ts"

test("arma una columna por campo, en el orden de los parámetros $1…$7", () => {
  const rows = [rowFromBanguat("2026-10-29", 7.64382, 7.64382), rowFromBanguat("2006-11-30", 7.6, 7.7)]
  const { text, values } = upsertExchangeRatesQuery("msp_app", rows)
  assert.match(text, /INSERT INTO "msp_app"\."exchange_rate"/)
  assert.match(text, /IS DISTINCT FROM/)
  assert.equal(values.length, 7)
  assert.deepEqual(values[0], ["2026-10-29", "2006-11-30"])
  assert.deepEqual(values[1], ["USD", "USD"])
  assert.deepEqual(values[2], ["GTQ", "GTQ"])
  assert.deepEqual(values[3], [rows[0].buy, rows[1].buy])
  assert.deepEqual(values[5], [rows[0].referenceRate, rows[1].referenceRate])
})

test("rechaza un esquema que no sea un identificador simple", () => {
  for (const bad of ['msp_app"; DROP TABLE x; --', "msp-app", "", "MSP"]) {
    assert.throws(() => upsertExchangeRatesQuery(bad, []), /inválido/, bad)
  }
})

test("upsertCounts acepta el texto de pg y el bigint de Prisma", () => {
  assert.deepEqual(upsertCounts(15, { inserted: "1", updated: "2" }), { inserted: 1, updated: 2, unchanged: 12 })
  assert.deepEqual(upsertCounts(15, { inserted: BigInt(1), updated: BigInt(0) }), { inserted: 1, updated: 0, unchanged: 14 })
  assert.deepEqual(upsertCounts(0, undefined), { inserted: 0, updated: 0, unchanged: 0 })
})
