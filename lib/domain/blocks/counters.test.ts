/**
 * Contadores del bloque, ejecutados.
 *
 * `n8nComputeCounters` es el código del nodo "Compute counters" del workflow de n8n, copiado tal
 * cual (solo se le quitó la lectura del `$input`). Las pruebas al azar exigen que la función nueva
 * dé exactamente lo mismo, así que una regla no puede cambiar sin que algo falle.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { BLOCK_COUNTER_FIELDS, computeBlockCounters, type CounterUnit } from "./counters.ts"

// ── Código de n8n, copiado tal cual ───────────────────────────────────────────
function n8nComputeCounters(allUnits: any[]) {
  function get(u: any) { return u?.attributes ?? u; }
  function num(v: unknown) { return typeof v === 'number' && !Number.isNaN(v) ? v : 0; }
  function isAvailable(u: any) { const a = get(u).availability; return a === 'Available' || a === 'available'; }

  let availableUnits = 0, availableM2 = 0, totalPricePerM2 = 0, countPricePerM2 = 0, totalInstallment = 0, countInstallment = 0, totalIncome = 0, countIncome = 0, assignedParking = 0, totalPrice = 0, countPrice = 0, totalSize = 0, countSize = 0;

  for (const u of allUnits){
    const att = get(u);
    const size = num(att.unitSizeM2) || num(att.totalSizeM2);
    const price = num(att.totalPriceUSD);
    const pricePerM2 = num(att.pricePerM2USD);
    const installment = num(att.installmentUSD);
    const income = num(att.incomeUSD);
    const parking = num(att.parkingSpaces);

    if (isAvailable(u)){ availableUnits++; availableM2 += size; }

    totalSize += size; countSize++;
    if (price > 0){ totalPrice += price; countPrice++; }
    if (pricePerM2 > 0){ totalPricePerM2 += pricePerM2; countPricePerM2++; }
    if (installment > 0){ totalInstallment += installment; countInstallment++; }
    if (income > 0){ totalIncome += income; countIncome++; }

    assignedParking += parking;
  }

  const totalUnits = allUnits.length;

  return {
    availableUnits,
    availableM2: Math.round(availableM2 * 100) / 100,
    totalUnits,
    totalM2: Math.round(totalSize * 100) / 100,
    averagePricePerM2USD: countPricePerM2 ? Math.round((totalPricePerM2 / countPricePerM2) * 100) / 100 : null,
    averageInstallmentUSD: countInstallment ? Math.round((totalInstallment / countInstallment) * 100) / 100 : null,
    averageIncomeUSD: countIncome ? Math.round((totalIncome / countIncome) * 100) / 100 : null,
    assignedParking,
    averagePriceUSD: countPrice ? Math.round((totalPrice / countPrice) * 100) / 100 : null,
    averageSizeM2: countSize ? Math.round((totalSize / countSize) * 100) / 100 : null
  };
}
// ──────────────────────────────────────────────────────────────────────────────

test("bloque sin unidades: totales en 0 y promedios null", () => {
  assert.deepEqual(computeBlockCounters([]), {
    availableUnits: 0,
    availableM2: 0,
    totalUnits: 0,
    totalM2: 0,
    averagePricePerM2USD: null,
    averageInstallmentUSD: null,
    averageIncomeUSD: null,
    assignedParking: 0,
    averagePriceUSD: null,
    averageSizeM2: null,
  })
})

test("disponibles: solo 'Available' o 'available'", () => {
  const counters = computeBlockCounters([
    { availability: "Available", unitSizeM2: 50 },
    { availability: "available", unitSizeM2: 30 },
    { availability: "Not Available", unitSizeM2: 70 },
    { availability: "AVAILABLE", unitSizeM2: 10 },
    { availability: null, unitSizeM2: 5 },
  ])
  assert.equal(counters.availableUnits, 2)
  assert.equal(counters.availableM2, 80)
  assert.equal(counters.totalUnits, 5)
  assert.equal(counters.totalM2, 165)
})

test("tamaño: unitSizeM2 y, si es 0 o falta, totalSizeM2", () => {
  const counters = computeBlockCounters([
    { unitSizeM2: 80, totalSizeM2: 95 },
    { unitSizeM2: 0, totalSizeM2: 60 },
    { unitSizeM2: null, totalSizeM2: 40 },
  ])
  assert.equal(counters.totalM2, 180)
})

test("el tamaño promedio cuenta también las unidades de 0 m²", () => {
  const counters = computeBlockCounters([{ unitSizeM2: 100 }, { unitSizeM2: null, totalSizeM2: null }])
  assert.equal(counters.averageSizeM2, 50)
})

test("promedios de precio, por m², cuota e ingreso: solo valores > 0, de todas las unidades", () => {
  const counters = computeBlockCounters([
    { availability: "Available", totalPriceUSD: 100_000, pricePerM2USD: 1_000, installmentUSD: 500, incomeUSD: 2_000 },
    { availability: "Not Available", totalPriceUSD: 200_000, pricePerM2USD: 0, installmentUSD: null, incomeUSD: -5 },
    { availability: "Not Available", totalPriceUSD: 0 },
  ])
  assert.equal(counters.averagePriceUSD, 150_000)
  assert.equal(counters.averagePricePerM2USD, 1_000)
  assert.equal(counters.averageInstallmentUSD, 500)
  assert.equal(counters.averageIncomeUSD, 2_000)
})

test("sin ningún valor > 0, el promedio es null", () => {
  const counters = computeBlockCounters([{ totalPriceUSD: 0 }, { totalPriceUSD: null }])
  assert.equal(counters.averagePriceUSD, null)
  assert.equal(counters.averageSizeM2, 0)
})

test("parqueos: suma de parkingSpaces de todas las unidades", () => {
  const counters = computeBlockCounters([
    { availability: "Available", parkingSpaces: 2 },
    { availability: "Not Available", parkingSpaces: 1 },
    { parkingSpaces: null },
  ])
  assert.equal(counters.assignedParking, 3)
})

test("lo que no es número cuenta como 0, como num() de n8n", () => {
  const units = [{ unitSizeM2: "85.5", totalSizeM2: 90, totalPriceUSD: Number.NaN }] as unknown as CounterUnit[]
  const counters = computeBlockCounters(units)
  assert.equal(counters.totalM2, 90)
  assert.equal(counters.averagePriceUSD, null)
})

test("redondeo a 2 decimales con Math.round, como n8n", () => {
  const counters = computeBlockCounters([{ totalPriceUSD: 1.005 }, { totalPriceUSD: 2.335 }, { totalPriceUSD: 3.3333 }])
  assert.equal(counters.averagePriceUSD, Math.round(((1.005 + 2.335 + 3.3333) / 3) * 100) / 100)
})

test("devuelve exactamente los campos que el workflow escribía en el bloque", () => {
  assert.deepEqual(Object.keys(computeBlockCounters([])).sort(), [...BLOCK_COUNTER_FIELDS].sort())
})

// Generador determinista (mulberry32) para que una falla se pueda reproducir.
function random(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test("igual al código de n8n en 2,000 bloques al azar", () => {
  const rnd = random(20261029)
  const pick = <T,>(values: readonly T[]) => values[Math.floor(rnd() * values.length)]
  const decimal = (max: number) => pick([null, 0, -1, Math.round(rnd() * max * 10_000) / 10_000, rnd() * max])
  const availabilities = ["Available", "available", "Not Available", null, "Reservado"] as const

  for (let block = 0; block < 2_000; block++) {
    const units: CounterUnit[] = Array.from({ length: Math.floor(rnd() * 60) }, () => ({
      availability: pick(availabilities),
      unitSizeM2: decimal(400),
      totalSizeM2: decimal(450),
      totalPriceUSD: decimal(900_000),
      pricePerM2USD: decimal(4_000),
      installmentUSD: decimal(8_000),
      incomeUSD: decimal(30_000),
      parkingSpaces: pick([null, 0, 1, 2, 3]),
    }))
    assert.deepEqual(computeBlockCounters(units), n8nComputeCounters(units), `bloque ${block}`)
  }
})

test("n8n también aceptaba unidades con `attributes` (Strapi v4); la nueva recibe la unidad plana", () => {
  const flat: CounterUnit = { availability: "Available", unitSizeM2: 70, totalPriceUSD: 120_000, parkingSpaces: 1 }
  assert.deepEqual(computeBlockCounters([flat]), n8nComputeCounters([{ attributes: flat }]))
})
