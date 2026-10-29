/**
 * Fechas del tipo de cambio: `DD/MM/AAAA` de Banguat y n8n ↔ `AAAA-MM-DD` de la tabla.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { daysInRange, formatDmy, parseDmy, rangeCoverage, recentRange, todayInGuatemala } from "./dates.ts"

test("DD/MM/AAAA: el día va primero, también cuando el mes podría ser día", () => {
  assert.equal(parseDmy("09/10/2026"), "2026-10-09")
  assert.equal(parseDmy("10/09/2026"), "2026-09-10")
  assert.equal(parseDmy("30/11/2006"), "2006-11-30")
  assert.equal(parseDmy(" 01/12/2006 "), "2006-12-01")
})

test("fechas imposibles o mal formadas lanzan", () => {
  for (const bad of ["31/02/2026", "29/02/2025", "00/10/2026", "2026-10-29", "9/10/2026", "", "29/10/26"]) {
    assert.throws(() => parseDmy(bad), /inválida/, bad)
  }
  assert.equal(parseDmy("29/02/2024"), "2024-02-29")
})

test("formatDmy es la inversa de parseDmy", () => {
  for (const dmy of ["29/10/2026", "01/01/2025", "30/11/2006", "29/02/2024"]) {
    assert.equal(formatDmy(parseDmy(dmy)), dmy)
  }
  assert.throws(() => formatDmy("29/10/2026"), /inválida/)
})

test("daysInRange incluye ambos extremos y cruza fin de mes y año bisiesto", () => {
  assert.deepEqual(daysInRange("2024-02-28", "2024-03-01"), ["2024-02-28", "2024-02-29", "2024-03-01"])
  assert.deepEqual(daysInRange("2026-10-29", "2026-10-29"), ["2026-10-29"])
  assert.equal(daysInRange("2006-11-30", "2026-10-29").length, 7274)
  assert.throws(() => daysInRange("2026-10-29", "2026-10-28"), /invertido/)
})

test("hoy en Guatemala es UTC-6", () => {
  assert.equal(todayInGuatemala(new Date("2026-10-30T05:59:59Z")), "2026-10-29")
  assert.equal(todayInGuatemala(new Date("2026-10-30T06:00:00Z")), "2026-10-30")
})

test("rangeCoverage: días faltantes y días fuera del rango", () => {
  assert.deepEqual(rangeCoverage(["2026-10-27", "2026-10-28"], "2026-10-27", "2026-10-29"), { missing: ["2026-10-29"], outside: [] })
  assert.deepEqual(rangeCoverage(["2026-10-26", "2026-10-27"], "2026-10-27", "2026-10-27"), { missing: [], outside: ["2026-10-26"] })
  assert.deepEqual(rangeCoverage([], "2026-10-28", "2026-10-29"), { missing: ["2026-10-28", "2026-10-29"], outside: [] })
})

test("recentRange: los últimos N días hasta hoy en Guatemala, hoy incluido", () => {
  const now = new Date("2026-10-29T13:00:00Z")
  const { from, to } = recentRange(15, now)
  assert.equal(to, "2026-10-29")
  assert.equal(from, "2026-10-15")
  assert.equal(daysInRange(from, to).length, 15)
  assert.deepEqual(recentRange(1, now), { from: "2026-10-29", to: "2026-10-29" })
  assert.deepEqual(recentRange(3, new Date("2026-03-01T12:00:00Z")), { from: "2026-02-27", to: "2026-03-01" })
  for (const bad of [0, -1, 1.5]) assert.throws(() => recentRange(bad, now), /inválida/)
})
