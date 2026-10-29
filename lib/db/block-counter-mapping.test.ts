import { test } from "node:test"
import assert from "node:assert/strict"

import { computeBlockCounters } from "../domain/blocks/counters.ts"
import { sameBlockCounters, toBlockCounterData, toCounterUnit, type StoredBlockCounters } from "./block-counter-mapping.ts"

const decimal = (value: string) => ({ toString: () => value })

test("toCounterUnit convierte los Decimal de Prisma a número y conserva los vacíos", () => {
  assert.deepEqual(
    toCounterUnit({
      availability: "Not_Available",
      unitSizeM2: decimal("85.5000"),
      totalSizeM2: null,
      totalPriceUsd: decimal("100000.50"),
      pricePerM2Usd: 1_200,
      installmentUsd: null,
      incomeUsd: decimal("0"),
      parkingSpaces: 2,
    }),
    {
      availability: "Not_Available",
      unitSizeM2: 85.5,
      totalSizeM2: null,
      totalPriceUSD: 100_000.5,
      pricePerM2USD: 1_200,
      installmentUSD: null,
      incomeUSD: 0,
      parkingSpaces: 2,
    },
  )
})

test("el enum de Prisma 'Not_Available' no cuenta como disponible; 'Available' sí", () => {
  const counters = computeBlockCounters(
    [
      { availability: "Available", unitSizeM2: decimal("50"), totalSizeM2: null, totalPriceUsd: null, pricePerM2Usd: null, installmentUsd: null, incomeUsd: null, parkingSpaces: null },
      { availability: "Not_Available", unitSizeM2: decimal("70"), totalSizeM2: null, totalPriceUsd: null, pricePerM2Usd: null, installmentUsd: null, incomeUsd: null, parkingSpaces: null },
    ].map(toCounterUnit),
  )
  assert.equal(counters.availableUnits, 1)
  assert.equal(counters.availableM2, 50)
})

test("toBlockCounterData usa los nombres de prisma/schema.prisma", () => {
  const data = toBlockCounterData(computeBlockCounters([{ availability: "Available", unitSizeM2: 80, totalPriceUSD: 100_000 }]))
  assert.deepEqual(data, {
    availableUnits: 1,
    availableM2: 80,
    totalUnits: 1,
    totalM2: 80,
    averagePricePerM2Usd: null,
    averageInstallmentUsd: null,
    averageIncomeUsd: null,
    assignedParking: 0,
    averagePriceUsd: 100_000,
    averageSizeM2: 80,
  })
})

test("sameBlockCounters compara en centésimas y trata null solo igual a null", () => {
  const next = toBlockCounterData(computeBlockCounters([{ unitSizeM2: 80, totalPriceUSD: 100_000 }]))
  const stored: StoredBlockCounters = {
    availableUnits: 0,
    availableM2: decimal("0.00"),
    totalUnits: 1,
    totalM2: decimal("80.00"),
    averagePricePerM2Usd: null,
    averageInstallmentUsd: null,
    averageIncomeUsd: null,
    assignedParking: 0,
    averagePriceUsd: decimal("100000.00"),
    averageSizeM2: decimal("80.00"),
  }
  assert.equal(sameBlockCounters(stored, next), true)
  assert.equal(sameBlockCounters({ ...stored, averagePriceUsd: null }, next), false)
  assert.equal(sameBlockCounters({ ...stored, totalM2: decimal("80.01") }, next), false)
})
