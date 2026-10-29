import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { compareBlock, numericOrNull, summarize, type ParityBlock, type StoredCounters } from "./parity"

const EMPTY: StoredCounters = {
  availableUnits: null,
  availableM2: null,
  totalUnits: null,
  totalM2: null,
  averagePricePerM2USD: null,
  averageInstallmentUSD: null,
  averageIncomeUSD: null,
  assignedParking: null,
  averagePriceUSD: null,
  averageSizeM2: null,
}

const UNITS = [
  { availability: "Available", unitSizeM2: 80, totalPriceUSD: 100_000, parkingSpaces: 1 },
  { availability: "Not Available", unitSizeM2: 60, totalPriceUSD: 90_000.5, parkingSpaces: 1 },
]

const STORED: StoredCounters = {
  ...EMPTY,
  availableUnits: 1,
  availableM2: 80,
  totalUnits: 2,
  totalM2: 140,
  assignedParking: 2,
  averagePriceUSD: 95_000.25,
  averageSizeM2: 70,
}

const block = (fields: Partial<ParityBlock>): ParityBlock => ({
  id: 1,
  publicId: "b1",
  code: "B-1",
  legacyId: null,
  domain: "housing",
  stored: STORED,
  units: UNITS,
  ...fields,
})

describe("compareBlock", () => {
  test("igual cuando los 10 campos coinciden (null con null incluido)", () => {
    const r = compareBlock(block({}))
    assert.equal(r.status, "igual")
    assert.deepEqual(r.diffs, [])
  })

  test("compara en centésimas: 70.004 guardado = 70 calculado", () => {
    assert.equal(compareBlock(block({ stored: { ...STORED, averageSizeM2: 70.004 } })).status, "igual")
  })

  test("distinto: lista solo los campos que no coinciden", () => {
    const r = compareBlock(block({ stored: { ...STORED, totalUnits: 3, averagePriceUSD: null } }))
    assert.equal(r.status, "distinto")
    assert.deepEqual(r.diffs, [
      { field: "totalUnits", stored: 3, computed: 2 },
      { field: "averagePriceUSD", stored: null, computed: 95_000.25 },
    ])
  })

  test("sin-calcular: tiene unidades y las 10 columnas vacías", () => {
    const r = compareBlock(block({ stored: EMPTY }))
    assert.equal(r.status, "sin-calcular")
    assert.equal(r.diffs.length, 7)
  })

  test("sin unidades y columnas vacías: distinto, porque n8n escribiría 0 en los totales", () => {
    const r = compareBlock(block({ stored: EMPTY, units: [] }))
    assert.equal(r.status, "distinto")
    assert.deepEqual(r.diffs.map((d) => d.field), ["availableUnits", "availableM2", "totalUnits", "totalM2", "assignedParking"])
  })
})

test("summarize agrupa por estado, campo, origen y dominio", () => {
  const results = [
    compareBlock(block({ id: 1 })),
    compareBlock(block({ id: 2, legacyId: "123", stored: EMPTY })),
    compareBlock(block({ id: 3, legacyId: "456", domain: "office", stored: { ...STORED, totalM2: 1 } })),
    compareBlock(block({ id: 4, units: [], stored: { ...EMPTY, availableUnits: 0, availableM2: 0, totalUnits: 0, totalM2: 0, assignedParking: 0 } })),
  ]
  const s = summarize(results)
  assert.equal(s.blocks, 4)
  assert.equal(s.withoutUnits, 1)
  assert.deepEqual(s.byStatus, { igual: 2, "sin-calcular": 1, distinto: 1 })
  assert.equal(s.byField.totalM2, 1)
  assert.equal(s.byField.totalUnits, 0)
  assert.deepEqual(s.byOrigin["con-legacy"], { igual: 0, "sin-calcular": 1, distinto: 1 })
  assert.deepEqual(s.byDomain.office, { igual: 0, "sin-calcular": 0, distinto: 1 })
})

test("numericOrNull", () => {
  assert.equal(numericOrNull(null), null)
  assert.equal(numericOrNull("95000.25"), 95_000.25)
  assert.throws(() => numericOrNull("abc"))
})
