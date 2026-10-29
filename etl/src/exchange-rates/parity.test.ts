import assert from "node:assert/strict"
import { test } from "node:test"
import { compareParity, numericOrNull, type ParityRate } from "./parity"

const r = (date: string, over: Partial<ParityRate> = {}): ParityRate => ({
  date,
  currency: "USD",
  unit: "GTQ",
  buy: null,
  sell: null,
  referenceRate: 7.6419,
  ...over,
})

test("iguales: todo cuadra", () => {
  const res = compareParity([r("2026-10-28"), r("2026-10-29")], [r("2026-10-29"), r("2026-10-28")])
  assert.equal(res.matched, 2)
  assert.deepEqual([res.onlyInTable, res.onlyInN8n, res.duplicatesInN8n, res.diffs], [[], [], [], []])
})

test("días de un solo lado, repetidos y valores distintos", () => {
  const res = compareParity(
    [r("2026-10-27"), r("2026-10-28", { referenceRate: 7.64427 }), r("2006-11-30", { buy: 7.62637, sell: 7.64582, referenceRate: null })],
    [r("2026-10-28", { referenceRate: 7.6443 }), r("2026-10-29"), r("2026-10-29"), r("2006-11-30", { buy: 7.62637, sell: 7.64582, referenceRate: null })],
  )
  assert.equal(res.matched, 1)
  assert.deepEqual(res.onlyInTable, ["2026-10-27"])
  assert.deepEqual(res.onlyInN8n, ["2026-10-29"])
  assert.deepEqual(res.duplicatesInN8n, ["2026-10-29"])
  assert.deepEqual(res.diffs, [{ date: "2026-10-28", field: "referenceRate", table: 7.64427, n8n: 7.6443 }])
})

test("null contra valor es diferencia", () => {
  const res = compareParity([r("2026-10-29", { buy: 7.6 })], [r("2026-10-29")])
  assert.deepEqual(res.diffs, [{ date: "2026-10-29", field: "buy", table: 7.6, n8n: null }])
})

test("numeric de Postgres: escala distinta, mismo número", () => {
  assert.equal(numericOrNull("7.64190000"), 7.6419)
  assert.equal(numericOrNull(null), null)
  assert.throws(() => numericOrNull("abc"), /inválido/)
})
