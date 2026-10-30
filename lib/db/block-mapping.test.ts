import { test } from "node:test"
import assert from "node:assert/strict"
import { BlockError, type BlockListRow } from "./block-list-mapping.ts"
import {
  BLOCK_NOT_FOUND,
  DUPLICATE_BLOCK_CODE,
  fromFinancingRows,
  INVALID_BLOCK,
  isUniqueViolation,
  MISSING_REFERENCES,
  toBlockAuditRow,
  toBlockError,
  toBlockWriteData,
  toFinancingWrite,
  toStrapiBlockDetail,
  type BlockAuditSource,
  type FinancingRow,
} from "./block-mapping.ts"

const decimal = (value: string) => ({ toString: () => value })
const created = new Date("2026-01-01T00:00:00.000Z")
const updated = new Date("2026-01-02T00:00:00.000Z")

const columns = {
  id: 7,
  publicId: "blk-7",
  code: "torre-norte",
  name: "Torre Norte",
  legacyId: "1234",
  domain: "housing",
  quarter: "S1",
  market: null,
  blockUsage: "Venta",
  phase: null,
  tower: null,
  sector: null,
  year: 2026,
  collectionDate: new Date("2026-03-15T00:00:00.000Z"),
  startDate: null,
  deliveryDate: null,
  commercializationMonths: null,
  totalUnits: 40,
  totalM2: decimal("3200.50"),
  availableUnits: null,
  availableM2: null,
  visitorParking: null,
  assignedParking: null,
  totalProjectParking: null,
  parkingForSale: null,
  migNumber: 3,
  averagePriceUsd: decimal("150000.00"),
  averageSizeM2: null,
  averagePricePerM2Usd: null,
  averageInstallmentUsd: null,
  averageIncomeUsd: null,
  additionalParkingPriceUsd: null,
  createdAt: created,
  updatedAt: updated,
}

const financing: FinancingRow = {
  downPaymentPercent: decimal("10.00"),
  fractionalDownPayment: true,
  fractionalDownPaymentFha: null,
  fractionalInstallmentsOtherBanks: decimal("24.00"),
  minDownPaymentFha: null,
  minDownPaymentOtherBanks: null,
  maxLoanTermYearsFha: 30,
  maxLoanTermYearsBanks: 25,
  maxLoanTermYearsOwner: null,
}

const bankRates = [
  { bank: "ownerFinancing", annualRatePercent: null },
  { bank: "fha", annualRatePercent: decimal("5.50") },
  { bank: "bi", annualRatePercent: decimal("7.25") },
]

const listRow: BlockListRow = {
  ...columns,
  project: {
    id: 3,
    publicId: "proj-3",
    code: null,
    name: "Proyecto Norte",
    department: null,
    municipality: null,
    zone: null,
    subzone: null,
    country: null,
  },
  category: null,
  focus: null,
  status: null,
}

test("fromFinancingRows: términos en número, bancos presentes en el orden de BANCOS y tasa vacía como null", () => {
  assert.deepEqual(fromFinancingRows(financing, bankRates), {
    downPaymentPercent: 10,
    fractionalDownPayment: true,
    fractionalDownPaymentFHA: null,
    fractionalInstallmentsOtherBanks: 24,
    minDownPaymentFHA: null,
    minDownPaymentOtherBanks: null,
    maxLoanTermYearsFHA: 30,
    maxLoanTermYearsBanks: 25,
    maxLoanTermYearsOwner: null,
    fha: { annualRatePercent: 5.5 },
    bi: { annualRatePercent: 7.25 },
    ownerFinancing: { annualRatePercent: null },
  })
  assert.deepEqual(Object.keys(fromFinancingRows(financing, bankRates)!).slice(9), ["fha", "bi", "ownerFinancing"])
  assert.equal(fromFinancingRows(null, bankRates), null)
})

test("toStrapiBlockDetail suma el financiamiento; sin fila queda en null", () => {
  const detail = toStrapiBlockDetail({ ...listRow, financing, bankRates })
  assert.equal(detail.financing?.bi?.annualRatePercent, 7.25)
  assert.equal(detail.blockUsage, "Venta")
  assert.equal(toStrapiBlockDetail({ ...listRow, financing: null, bankRates: [] }).financing, null)
})

test("toFinancingWrite: ida y vuelta con fromFinancingRows, sin id y sin bancos en null", () => {
  const component = {
    id: 99,
    downPaymentPercent: 10,
    fractionalDownPayment: false,
    maxLoanTermYearsBanks: 25,
    fha: { id: 5, annualRatePercent: 5.5 },
    gtc: null,
    bac: { annualRatePercent: null },
  }
  const write = toFinancingWrite(component)
  assert.deepEqual(write, {
    terms: {
      downPaymentPercent: 10,
      fractionalDownPayment: false,
      fractionalDownPaymentFha: null,
      fractionalInstallmentsOtherBanks: null,
      minDownPaymentFha: null,
      minDownPaymentOtherBanks: null,
      maxLoanTermYearsFha: null,
      maxLoanTermYearsBanks: 25,
      maxLoanTermYearsOwner: null,
    },
    bankRates: [
      { bank: "fha", annualRatePercent: 5.5 },
      { bank: "bac", annualRatePercent: null },
    ],
  })
  const back = fromFinancingRows(write.terms as unknown as FinancingRow, write.bankRates)
  assert.deepEqual(back, {
    downPaymentPercent: 10,
    fractionalDownPayment: false,
    fractionalDownPaymentFHA: null,
    fractionalInstallmentsOtherBanks: null,
    minDownPaymentFHA: null,
    minDownPaymentOtherBanks: null,
    maxLoanTermYearsFHA: null,
    maxLoanTermYearsBanks: 25,
    maxLoanTermYearsOwner: null,
    fha: { annualRatePercent: 5.5 },
    bac: { annualRatePercent: null },
  })
})

test("toBlockWriteData al crear exige name, project y domain, y junta los problemas", () => {
  assert.throws(() => toBlockWriteData({ name: " ", project: "" }, "create"), (error: unknown) => {
    assert.ok(error instanceof BlockError)
    assert.equal(error.message, INVALID_BLOCK)
    assert.deepEqual(error.details, ["name: es obligatorio", "project: es obligatorio", "domain: es obligatorio"])
    return true
  })
})

test("toBlockWriteData traduce nombres, fechas y vacíos; undefined no cambia", () => {
  assert.deepEqual(toBlockWriteData({}, "update"), { scalars: {}, relations: {} })
  const write = toBlockWriteData(
    {
      name: " Proyecto Norte - Fase 1 ",
      legacyId: "",
      phase: " Fase 1 ",
      quarter: "T3",
      market: "",
      blockUsage: undefined,
      collectionDate: "2026-03-15",
      startDate: "",
      year: 2026,
      totalUnits: 40,
      averagePriceUSD: 150000.5,
      additionalParkingPriceUSD: null,
      project: " proj-3 ",
      blockCategory: "",
      blockFocus: 4,
      financing: null,
    },
    "update",
  )
  assert.deepEqual(write, {
    scalars: {
      name: "Proyecto Norte - Fase 1",
      legacyId: null,
      phase: "Fase 1",
      quarter: "T3",
      market: null,
      collectionDate: new Date("2026-03-15T00:00:00.000Z"),
      startDate: null,
      year: 2026,
      totalUnits: 40,
      averagePriceUsd: 150000.5,
      additionalParkingPriceUsd: null,
    },
    relations: { project: "proj-3", blockCategory: null, blockFocus: 4 },
    financing: null,
  })
  assert.throws(() => toBlockWriteData({ name: "" }, "update"), BlockError)
  assert.throws(() => toBlockWriteData({ project: null }, "update"), BlockError)
})

test("toBlockAuditRow: decimales en texto, fechas YYYY-MM-DD, ids, términos y bancos ordenados", () => {
  const source: BlockAuditSource = {
    ...columns,
    projectId: 3,
    categoryId: null,
    focusId: 4,
    statusId: null,
    financing,
    bankRates,
  }
  const audit = toBlockAuditRow(source)
  assert.equal(audit.totalM2, "3200.50")
  assert.equal(audit.collectionDate, "2026-03-15")
  assert.equal(audit.projectId, 3)
  assert.equal(audit.financing?.downPaymentPercent, "10.00")
  assert.deepEqual(audit.bankRates, [
    { bank: "fha", annualRatePercent: "5.50" },
    { bank: "bi", annualRatePercent: "7.25" },
    { bank: "ownerFinancing", annualRatePercent: null },
  ])
  assert.equal(toBlockAuditRow({ ...source, financing: null, bankRates: [] }).financing, null)
})

test("toBlockError traduce P2025, P2003 y P2002 y deja pasar lo demás", () => {
  assert.equal((toBlockError({ code: "P2025" }) as Error).message, BLOCK_NOT_FOUND)
  assert.equal((toBlockError({ code: "P2003" }) as Error).message, `${MISSING_REFERENCES}.`)
  assert.equal((toBlockError({ code: "P2002" }) as Error).message, DUPLICATE_BLOCK_CODE)
  const other = new Error("x")
  assert.equal(toBlockError(other), other)
  assert.equal(isUniqueViolation({ code: "P2002" }), true)
  assert.equal(isUniqueViolation(other), false)
})
