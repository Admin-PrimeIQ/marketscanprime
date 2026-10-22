import { test } from "node:test"
import assert from "node:assert/strict"
import {
  buildCatalogSearch,
  CatalogError,
  catalogWhereUnique,
  MAX_PAGE_SIZE,
  normalizePagination,
  parseCatalogSort,
  resolveCatalogModel,
  toCatalogError,
  toCatalogItem,
  toCatalogListResponse,
  toCatalogWriteData,
  type CatalogRow,
} from "./catalog-mapping.ts"
import { assertPrismaActionsAllowed } from "./guard.ts"
import { productionN8nDefault } from "../api/data-backend.ts"

const row = (overrides: Partial<CatalogRow> = {}): CatalogRow => ({
  id: 7,
  publicId: "abc123documentid",
  name: "Guatemala",
  code: "GT",
  description: null,
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  updatedAt: new Date("2026-02-03T04:05:06.000Z"),
  ...overrides,
})

test("cada endpoint de catálogo apunta a su modelo; block-types no existe", () => {
  assert.equal(resolveCatalogModel("security-types"), "securityType")
  assert.equal(resolveCatalogModel("unit-usages"), "unitUsage")
  assert.throws(() => resolveCatalogModel("block-types"), CatalogError)
  assert.throws(() => resolveCatalogModel("toString"), CatalogError)
})

test("la paginación por defecto es 25 y se acota", () => {
  assert.deepEqual(normalizePagination(), { page: 1, pageSize: 25, skip: 0, take: 25 })
  assert.deepEqual(normalizePagination({ page: 3, pageSize: 10 }), { page: 3, pageSize: 10, skip: 20, take: 10 })
  assert.equal(normalizePagination({ pageSize: 50_000 }).pageSize, MAX_PAGE_SIZE)
  assert.equal(normalizePagination({ page: -4 }).page, 1)
})

test("el sort de Strapi se traduce y siempre desempata por id", () => {
  assert.deepEqual(parseCatalogSort("name:asc"), [{ name: "asc" }, { id: "asc" }])
  assert.deepEqual(parseCatalogSort("code:DESC"), [{ code: "desc" }, { id: "asc" }])
  assert.deepEqual(parseCatalogSort("name"), [{ name: "asc" }, { id: "asc" }])
  assert.deepEqual(parseCatalogSort(undefined), [{ id: "asc" }])
  assert.throws(() => parseCatalogSort("password:asc"), CatalogError)
  assert.throws(() => parseCatalogSort("name:sideways"), CatalogError)
})

test("la búsqueda cubre name y code sin distinguir mayúsculas", () => {
  assert.deepEqual(buildCatalogSearch("  "), {})
  assert.deepEqual(buildCatalogSearch(" gt "), {
    OR: [
      { name: { contains: "gt", mode: "insensitive" } },
      { code: { contains: "gt", mode: "insensitive" } },
    ],
  })
})

test("el id de la UI es documentId, o el id numérico", () => {
  assert.deepEqual(catalogWhereUnique("abc123documentid"), { publicId: "abc123documentid" })
  assert.deepEqual(catalogWhereUnique("42"), { id: 42 })
  assert.deepEqual(catalogWhereUnique(42), { id: 42 })
  assert.throws(() => catalogWhereUnique(" "), CatalogError)
})

test("la fila vuelve con la forma de CatalogItem", () => {
  assert.deepEqual(toCatalogItem(row({ isoCode: "GT", isoCode2: null })), {
    id: 7,
    documentId: "abc123documentid",
    name: "Guatemala",
    code: "GT",
    isoCode: "GT",
    createdAt: "2026-01-02T03:04:05.000Z",
    updatedAt: "2026-02-03T04:05:06.000Z",
  })
})

test("la lista trae meta.pagination como Strapi", () => {
  const response = toCatalogListResponse([row()], 51, { page: 2, pageSize: 25 })
  assert.equal(response.data[0].documentId, "abc123documentid")
  assert.deepEqual(response.meta.pagination, { page: 2, pageSize: 25, pageCount: 3, total: 51 })
  assert.equal(toCatalogListResponse([], 0, { page: 1, pageSize: 25 }).meta.pagination.pageCount, 1)
})

test("crear exige name; los textos vacíos quedan en null", () => {
  assert.deepEqual(toCatalogWriteData("nse", { name: " A ", code: "", description: " x " }, "create"), {
    name: "A",
    code: null,
    description: "x",
  })
  assert.throws(() => toCatalogWriteData("nse", { name: "  " }, "create"), (error: CatalogError) => {
    assert.deepEqual(error.details, ["name: es obligatorio"])
    return true
  })
})

test("actualizar sin un campo lo deja como está", () => {
  assert.deepEqual(toCatalogWriteData("nse", { name: "B", code: undefined }, "update"), { name: "B" })
})

test("los códigos ISO solo aplican a países, en mayúsculas y sin imponer largo", () => {
  assert.deepEqual(toCatalogWriteData("nse", { name: "A", isoCode: "GT" }, "create"), { name: "A" })
  // Así están en msp_app: isoCode alfa-3, isoCode2 alfa-2.
  assert.deepEqual(toCatalogWriteData("country", { name: "Guatemala", isoCode: "gtm", isoCode2: "gt" }, "create"), {
    name: "Guatemala",
    isoCode: "GTM",
    isoCode2: "GT",
  })
  assert.deepEqual(toCatalogWriteData("country", { name: "Guatemala", isoCode2: "" }, "update"), {
    name: "Guatemala",
    isoCode2: null,
  })
  assert.throws(() => toCatalogWriteData("country", { name: "X" }, "create"), CatalogError)
})

test("los errores de Prisma conocidos se traducen", () => {
  const unique = toCatalogError({ code: "P2002", meta: { target: ["iso_code"] } }) as CatalogError
  assert.deepEqual(unique.details, ["iso_code: debe ser único"])
  const adapterUnique = toCatalogError({
    code: "P2002",
    meta: { driverAdapterError: { cause: { constraint: { fields: ["iso_code_2"] } } } },
  }) as CatalogError
  assert.deepEqual(adapterUnique.details, ["iso_code_2: debe ser único"])
  assert.match((toCatalogError({ code: "P2003" }) as Error).message, /en uso/)
  const other = new Error("conexión rechazada")
  assert.equal(toCatalogError(other), other)
})

test("las acciones sobre Prisma solo corren en desarrollo con el backend prisma", () => {
  assert.doesNotThrow(() => assertPrismaActionsAllowed({ NODE_ENV: "development", NEXT_PUBLIC_DATA_BACKEND: "prisma" }))
  assert.throws(() => assertPrismaActionsAllowed({ NODE_ENV: "production", NEXT_PUBLIC_DATA_BACKEND: "prisma" }))
  assert.throws(() => assertPrismaActionsAllowed({ NODE_ENV: "development", NEXT_PUBLIC_DATA_BACKEND: "strapi" }))
  assert.throws(() => assertPrismaActionsAllowed({ NODE_ENV: "development" }))
})

test("un despliegue de staging corre las acciones solo si se marca y no trae credenciales de producción", () => {
  const staging = { NODE_ENV: "production", NEXT_PUBLIC_DATA_BACKEND: "prisma", MSP_STAGING_DEPLOY: "true" }
  assert.doesNotThrow(() => assertPrismaActionsAllowed(staging))
  assert.throws(() => assertPrismaActionsAllowed({ ...staging, MSP_STAGING_DEPLOY: "1" }))
  assert.throws(() => assertPrismaActionsAllowed({ ...staging, NEXT_PUBLIC_DATA_BACKEND: "strapi" }))
  assert.throws(() => assertPrismaActionsAllowed({ ...staging, STRAPI_PASSWORD: "x" }), /STRAPI_PASSWORD/)
  assert.throws(() => assertPrismaActionsAllowed({ ...staging, SYNC_API_KEY: "x" }), /SYNC_API_KEY/)
})

test("con el backend prisma no hay URL de n8n de producción por omisión", () => {
  assert.equal(productionN8nDefault("https://n8n.example/webhook", "prisma"), "")
  assert.equal(productionN8nDefault("https://n8n.example/webhook", "strapi"), "https://n8n.example/webhook")
  assert.equal(productionN8nDefault("https://n8n.example/webhook", undefined), "https://n8n.example/webhook")
})
