/**
 * Tendencia de la barra lateral: el mismo resultado venga el dato de n8n o de la tabla.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { comparableRate, compareSnapshots, type ExchangeRateSnapshot } from "./compare.ts"

const snap = (over: Partial<ExchangeRateSnapshot>): ExchangeRateSnapshot => ({
  date: "29/10/2026",
  currency: "USD",
  unit: "GTQ",
  buy: null,
  sell: null,
  referenceRate: null,
  ...over,
})

test("comparableRate: referencia, luego promedio compra/venta, luego la que haya", () => {
  assert.equal(comparableRate(snap({ referenceRate: 7.64382, buy: 1, sell: 2 })), 7.64382)
  assert.equal(comparableRate(snap({ buy: 7.62637, sell: 7.64582 })), (7.62637 + 7.64582) / 2)
  assert.equal(comparableRate(snap({ sell: 7.6 })), 7.6)
  assert.equal(comparableRate(snap({})), null)
})

test("29 vs 28 oct 2026 baja; 25 vs 24 queda igual; 27 vs 26 sube", () => {
  const down = compareSnapshots(snap({ referenceRate: 7.64382 }), snap({ date: "28/10/2026", referenceRate: 7.64427 }))
  assert.equal(down.direction, "down")
  assert.ok(Math.abs((down.delta ?? 0) + 0.00045) < 1e-9)

  assert.deepEqual(
    compareSnapshots(snap({ referenceRate: 7.6419 }), snap({ referenceRate: 7.6419 })).direction,
    "flat",
  )
  assert.equal(compareSnapshots(snap({ referenceRate: 7.63979 }), snap({ referenceRate: 7.63622 })).direction, "up")
})

test("sin día anterior o sin valor comparable: unknown", () => {
  const only = compareSnapshots(snap({ referenceRate: 7.64382 }), null)
  assert.equal(only.direction, "unknown")
  assert.equal(only.delta, null)
  assert.equal(compareSnapshots(snap({}), snap({ referenceRate: 7.6 })).direction, "unknown")
})
