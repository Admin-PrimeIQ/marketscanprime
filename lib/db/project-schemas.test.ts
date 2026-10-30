import { test } from "node:test"
import assert from "node:assert/strict"
import { ProjectError } from "./project-list-mapping.ts"
import { parseProjectId, parseProjectListParams, parseProjectRequest } from "./project-schemas.ts"

const details = (work: () => unknown): string[] => {
  try {
    work()
  } catch (error) {
    assert.ok(error instanceof ProjectError)
    return error.details ?? []
  }
  assert.fail("no lanzó")
}

test("parseProjectListParams tipa los filtros avanzados y descarta id/displayValue de la UI", () => {
  assert.deepEqual(
    parseProjectListParams({
      advancedFilters: [{ id: "f1", field: "developer", operator: "equals", value: "dev-1", displayValue: "Constructora" }],
      filterLogic: "OR",
    }),
    { advancedFilters: [{ field: "developer", operator: "equals", value: "dev-1" }], filterLogic: "OR" },
  )
  assert.deepEqual(details(() => parseProjectListParams({ advancedFilters: [{ field: "name", value: "x" }] })), [
    "advancedFilters.0.operator: es obligatorio",
  ])
})

test("parseProjectRequest acepta el cuerpo del formulario", () => {
  const body = {
    code: "P-1",
    name: "Torre",
    developer: "dev-1",
    latitude: 14.6,
    longitude: -90.5,
    fha: true,
    muvi: false,
    downPaymentPercentage: 10,
    accessQuantity: 2,
    exchangeRateProfile: null,
    amenities: ["am-1", 2],
    services: [],
  }
  assert.deepEqual(parseProjectRequest(body), body)
})

test("parseProjectRequest aplica los topes de las columnas y rechaza campos desconocidos", () => {
  assert.deepEqual(
    details(() =>
      parseProjectRequest({
        latitude: 91,
        longitude: -181,
        accessQuantity: 1.5,
        downPaymentPercentage: 100_000_000,
        code: "x".repeat(101),
        currencies: {},
      }),
    ),
    [
      "code: máximo 100 caracteres",
      "latitude: máximo 90",
      "longitude: mínimo -180",
      "downPaymentPercentage: máximo 99999999.99",
      "accessQuantity: tipo inválido",
      "valor: campos no permitidos (currencies)",
    ],
  )
  assert.throws(() => parseProjectRequest({ latitude: Number.NaN }), ProjectError)
  assert.throws(() => parseProjectRequest({ amenities: Array.from({ length: 501 }, (_, i) => i + 1) }), ProjectError)
})

test("parseProjectId acepta número o texto", () => {
  assert.equal(parseProjectId(" proj-1 "), "proj-1")
  assert.equal(parseProjectId(3), 3)
  assert.throws(() => parseProjectId(""), ProjectError)
})
