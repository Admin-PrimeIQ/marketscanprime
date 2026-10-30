import { test } from "node:test"
import assert from "node:assert/strict"
import { BlockError } from "./block-list-mapping.ts"
import { INVALID_BLOCK } from "./block-mapping.ts"
import { parseBlockId, parseBlockListParams, parseBlockRequest } from "./block-schemas.ts"

const invalid = (fn: () => unknown, details: string[]) =>
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof BlockError)
    assert.deepEqual(error.details, details)
    return true
  })

test("parseBlockRequest acepta lo que manda el formulario y descarta los id del financiamiento", () => {
  const request = parseBlockRequest({
    name: "Proyecto Norte - Fase 1",
    legacyId: "",
    phase: "Fase 1",
    year: 2026,
    quarter: "T1",
    collectionDate: "",
    startDate: "2026-02-28",
    project: "proj-3",
    blockCategory: undefined,
    domain: "housing",
    market: undefined,
    totalUnits: undefined,
    averagePriceUSD: 150000.123,
    parkingForSale: undefined,
    financing: {
      id: 12,
      downPaymentPercent: 10,
      fractionalDownPayment: true,
      maxLoanTermYearsFHA: 30,
      fha: { id: 4, annualRatePercent: 5.5 },
      bi: { annualRatePercent: null },
      gtc: null,
    },
  })
  assert.deepEqual(request.financing, {
    downPaymentPercent: 10,
    fractionalDownPayment: true,
    maxLoanTermYearsFHA: 30,
    fha: { annualRatePercent: 5.5 },
    bi: { annualRatePercent: null },
    gtc: null,
  })
  assert.equal(request.startDate, "2026-02-28")
  assert.equal(parseBlockRequest({ financing: null }).financing, null)
})

test("parseBlockRequest rechaza code, claves desconocidas, bancos inventados y enumerados inválidos", () => {
  invalid(() => parseBlockRequest({ code: "torre" }), ["valor: campos no permitidos (code)"])
  invalid(() => parseBlockRequest({ financing: { banco: { annualRatePercent: 1 } } }), [
    "financing: campos no permitidos (banco)",
  ])
  invalid(() => parseBlockRequest({ financing: { fha: { annualRatePercent: 1, plazo: 2 } } }), [
    "financing.fha: campos no permitidos (plazo)",
  ])
  invalid(() => parseBlockRequest({ quarter: "T5", domain: "retail", market: "Tertiary" }), [
    "quarter: valor inválido",
    "domain: valor inválido",
    "market: valor inválido",
  ])
})

test("parseBlockRequest valida topes: enteros ≥ 0, numeric(10,2), fechas reales y largos", () => {
  invalid(() => parseBlockRequest({ totalUnits: -1 }), ["totalUnits: mínimo 0"])
  invalid(() => parseBlockRequest({ totalUnits: 1.5 }), ["totalUnits: tipo inválido"])
  invalid(() => parseBlockRequest({ totalM2: 100_000_000 }), ["totalM2: máximo 99999999.99"])
  invalid(() => parseBlockRequest({ startDate: "2026-02-30" }), ["startDate: valor inválido"])
  invalid(() => parseBlockRequest({ deliveryDate: "15/03/2026" }), ["deliveryDate: valor inválido"])
  invalid(() => parseBlockRequest({ phase: "x".repeat(256) }), ["phase: máximo 255 caracteres"])
  invalid(() => parseBlockRequest({ financing: { maxLoanTermYearsBanks: 7.5 } }), [
    "financing.maxLoanTermYearsBanks: tipo inválido",
  ])
  assert.throws(() => parseBlockRequest("x"), { message: INVALID_BLOCK })
})

test("parseBlockListParams y parseBlockId", () => {
  assert.deepEqual(parseBlockListParams({ page: 1, pageSize: 200, sort: "name:asc", countryIso: "GT", region: undefined }), {
    page: 1,
    pageSize: 200,
    sort: "name:asc",
    countryIso: "GT",
    region: undefined,
  })
  assert.equal(parseBlockListParams(undefined), undefined)
  assert.throws(() => parseBlockListParams({ region: "Costa" }), BlockError)
  assert.equal(parseBlockId(" blk-7 "), "blk-7")
  assert.equal(parseBlockId(7), 7)
  assert.throws(() => parseBlockId(""), BlockError)
})
