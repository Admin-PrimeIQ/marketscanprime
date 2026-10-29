/**
 * La barra lateral recibe de la tabla `exchange_rate` lo mismo que recibía de n8n.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { toExchangeRateComparison, type ExchangeRateDbRow } from "./exchange-rate-mapping.ts"

const dec = (s: string) => ({ toString: () => s })
const row = (date: string, ref: string | null, over: Partial<ExchangeRateDbRow> = {}): ExchangeRateDbRow => ({
  date: new Date(`${date}T00:00:00.000Z`),
  currency: "USD",
  unit: "GTQ",
  buy: null,
  sell: null,
  referenceRate: ref == null ? null : dec(ref),
  source: "Bank of Guatemala (Banguat)",
  fetchedAt: new Date("2026-10-29T15:00:00.000Z"),
  ...over,
})

test("29 y 28 oct 2026: la misma forma que el GET de n8n", () => {
  const cmp = toExchangeRateComparison([row("2026-10-29", "7.64382000"), row("2026-10-28", "7.64427000")])
  assert.deepEqual(cmp?.current, {
    date: "29/10/2026",
    currency: "USD",
    unit: "GTQ",
    buy: null,
    sell: null,
    referenceRate: 7.64382,
    source: "Bank of Guatemala (Banguat)",
    lastUpdatedUtc: "2026-10-29T15:00:00.000Z",
  })
  assert.equal(cmp?.previous?.date, "28/10/2026")
  assert.equal(cmp?.direction, "down")
})

test("compra y venta sin referencia (30/11/2006)", () => {
  const cmp = toExchangeRateComparison([row("2006-11-30", null, { buy: dec("7.62637000"), sell: dec("7.64582000") })])
  assert.equal(cmp?.current.buy, 7.62637)
  assert.equal(cmp?.current.sell, 7.64582)
  assert.equal(cmp?.current.referenceRate, null)
  assert.equal(cmp?.previous, null)
  assert.equal(cmp?.direction, "unknown")
})

test("tabla vacía: null", () => {
  assert.equal(toExchangeRateComparison([]), null)
})
