import { test } from "node:test"
import assert from "node:assert/strict"
import { loginInputSchema } from "./auth-schemas.ts"
import { CatalogError } from "./catalog-mapping.ts"
import {
  parseCatalogEndpoint,
  parseCatalogId,
  parseCatalogListParams,
  parseCatalogRequest,
} from "./catalog-schemas.ts"

function catalogError(work: () => unknown): CatalogError {
  try {
    work()
  } catch (error) {
    assert.ok(error instanceof CatalogError)
    return error
  }
  assert.fail("debía lanzar CatalogError")
}

test("el cuerpo del catálogo pierde las claves desconocidas y null vacía el campo", () => {
  assert.deepEqual(parseCatalogRequest({ name: "Piscina", code: null, publishedAt: "x", id: 9 }), {
    name: "Piscina",
    code: "",
  })
})

test("los largos y tipos inválidos llegan como detalles en español", () => {
  const error = catalogError(() => parseCatalogRequest({ name: "a".repeat(256), description: 5 }))
  assert.equal(error.message, "Datos de catálogo inválidos")
  assert.deepEqual(error.details, ["name: máximo 255 caracteres", "description: tipo inválido"])
})

test("parámetros de lista: números enteros, tamaño de página acotado y textos cortos", () => {
  assert.deepEqual(parseCatalogListParams({ page: 2, pageSize: 1000, search: "gua" }), { page: 2, pageSize: 1000, search: "gua" })
  assert.equal(parseCatalogListParams(undefined), undefined)
  assert.deepEqual(catalogError(() => parseCatalogListParams({ pageSize: 5000 })).details, ["pageSize: máximo 1000"])
  assert.deepEqual(catalogError(() => parseCatalogListParams({ page: "1; DROP" })).details, ["page: tipo inválido"])
})

test("endpoint e id: texto corto o entero positivo", () => {
  assert.equal(parseCatalogEndpoint("countries"), "countries")
  assert.equal(parseCatalogId(" abc123 "), "abc123")
  assert.equal(parseCatalogId(7), 7)
  assert.deepEqual(catalogError(() => parseCatalogEndpoint("")).details, ["valor: es obligatorio"])
  catalogError(() => parseCatalogId(-1))
  catalogError(() => parseCatalogId({ id: 1 }))
})

test("login: identificador y clave obligatorios, con tope de largo", () => {
  assert.deepEqual(loginInputSchema.parse({ identifier: "  engteam ", password: "x" }), { identifier: "engteam", password: "x" })
  for (const input of [
    { identifier: "   ", password: "x" },
    { identifier: "engteam", password: "" },
    { identifier: "a".repeat(256), password: "x" },
    { identifier: "engteam", password: "x".repeat(257) },
    { identifier: ["engteam"], password: "x" },
  ]) {
    assert.equal(loginInputSchema.safeParse(input).success, false)
  }
})
