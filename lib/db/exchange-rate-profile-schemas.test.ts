import { test } from "node:test"
import assert from "node:assert/strict"
import { ExchangeRateProfileError } from "./exchange-rate-profile-mapping.ts"
import { MAX_PROJECT_REFS, parseProfileId, parseProfileListParams, parseProfileRequest } from "./exchange-rate-profile-schemas.ts"

const withDetail = (detail: string) => (error: unknown) => {
  assert.ok(error instanceof ExchangeRateProfileError)
  assert.ok(error.details?.includes(detail), `details: ${JSON.stringify(error.details)}`)
  return true
}

test("parseProfileRequest acepta el cuerpo del formulario y descarta ids anidados de Strapi", () => {
  assert.deepEqual(
    parseProfileRequest({
      name: "Perfil",
      code: "GT",
      description: "",
      currencies: { id: 5, gtq: { id: 9, buyRate: 7.75, sellRate: 0.129 }, mxn: null },
      projects: { connect: ["p-1", 2], disconnect: [] },
    }),
    {
      name: "Perfil",
      code: "GT",
      description: "",
      currencies: { gtq: { buyRate: 7.75, sellRate: 0.129 } },
      projects: { connect: ["p-1", 2], disconnect: [] },
    },
  )
  assert.deepEqual(parseProfileRequest({ name: "P", currencies: null, projects: ["a"] }), {
    name: "P",
    currencies: null,
    projects: ["a"],
  })
})

test("parseProfileRequest rechaza tasas no positivas, textos largos y demasiados proyectos", () => {
  assert.throws(() => parseProfileRequest({ name: "P", currencies: { gtq: { buyRate: 0 } } }), ExchangeRateProfileError)
  assert.throws(() => parseProfileRequest({ name: "P", currencies: { gtq: { buyRate: "7.7" } } }), withDetail("currencies.gtq.buyRate: tipo inválido"))
  assert.throws(() => parseProfileRequest({ name: "x".repeat(256) }), withDetail("name: máximo 255 caracteres"))
  const many = Array.from({ length: MAX_PROJECT_REFS + 1 }, (_, i) => i + 1)
  assert.throws(() => parseProfileRequest({ name: "P", projects: many }), ExchangeRateProfileError)
})

test("parseProfileId y parseProfileListParams validan tipos", () => {
  assert.equal(parseProfileId(" doc-1 "), "doc-1")
  assert.throws(() => parseProfileId(""), ExchangeRateProfileError)
  assert.throws(() => parseProfileId({}), ExchangeRateProfileError)
  assert.equal(parseProfileListParams(undefined), undefined)
  assert.throws(() => parseProfileListParams({ page: 0 }), withDetail("page: mínimo 1"))
})
