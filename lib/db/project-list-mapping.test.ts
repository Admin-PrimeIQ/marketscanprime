import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ADVANCED_FILTERS_NOT_MIGRATED,
  buildProjectWhere,
  PHASE_FILTER_UNAVAILABLE,
  ProjectError,
  toProjectListResponse,
  toStrapiProject,
  type ProjectListRow,
} from "./project-list-mapping.ts"
import { parseProjectListParams } from "./project-schemas.ts"

const decimal = (value: string) => ({ toString: () => value })

const row: ProjectListRow = {
  id: 10,
  publicId: "proj-10",
  code: "P-10",
  name: "Torre Norte",
  department: "Guatemala",
  municipality: null,
  zone: "10",
  subzone: null,
  latitude: decimal("14.60000000"),
  longitude: decimal("-90.50000000"),
  muvi: false,
  showroom: null,
  modelHouse: null,
  accessQuantity: 2,
  imageUrl: null,
  fha: null,
  fractionalDownPayment: null,
  downPaymentPercentage: decimal("10.00"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  developer: { id: 1, publicId: "dev-1", code: null, name: "Constructora", description: null },
  country: { id: 2, publicId: "gt", code: "GT", name: "Guatemala", description: null, isoCode: "GTM", isoCode2: "GT" },
  amenities: [{ amenity: { id: 3, publicId: "am-3", code: null, name: "Piscina", description: null, category: "Recreación" } }],
  services: [],
  blocks: [{ id: 4, publicId: "blk-4", quarter: "T2", domain: "housing" }],
}

test("toStrapiProject devuelve la forma de Strapi: documentId, decimales como número y sin nulos", () => {
  assert.deepEqual(toStrapiProject(row), {
    id: 10,
    documentId: "proj-10",
    name: "Torre Norte",
    code: "P-10",
    department: "Guatemala",
    zone: "10",
    latitude: 14.6,
    longitude: -90.5,
    muvi: false,
    accessQuantity: 2,
    downPaymentPercentage: 10,
    developer: { id: 1, documentId: "dev-1", name: "Constructora" },
    country: { id: 2, documentId: "gt", code: "GT", name: "Guatemala", isoCode: "GTM", isoCode2: "GT" },
    amenities: [{ id: 3, documentId: "am-3", name: "Piscina", category: "Recreación" }],
    services: [],
    blocks: [{ id: 4, documentId: "blk-4", quarter: "T2", domain: "housing" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  })
})

test("toStrapiProject omite developer y country ausentes", () => {
  const project = toStrapiProject({ ...row, developer: null, country: null })
  assert.equal("developer" in project, false)
  assert.equal("country" in project, false)
})

test("toProjectListResponse arma meta.pagination como Strapi", () => {
  assert.deepEqual(toProjectListResponse([row], 0, { page: 1, pageSize: 100 }).meta.pagination, {
    page: 1,
    pageSize: 100,
    pageCount: 1,
    total: 0,
  })
})

test("buildProjectWhere sin parámetros no filtra", () => {
  assert.deepEqual(buildProjectWhere(), {})
  assert.deepEqual(buildProjectWhere({ search: "  ", country: " ", filterLogic: "OR", availability: [] }), {})
})

test("buildProjectWhere combina búsqueda, dominio, región y país con AND", () => {
  assert.deepEqual(buildProjectWhere({ search: " torre ", domain: "office", region: "Interior", country: "gt" }), {
    AND: [
      {
        OR: [
          { name: { contains: "torre", mode: "insensitive" } },
          { code: { contains: "torre", mode: "insensitive" } },
          { developer: { is: { name: { contains: "torre", mode: "insensitive" } } } },
        ],
      },
      { blocks: { some: { domain: "office" } } },
      { blocks: { some: { quarter: { in: ["S1", "S2"] } } } },
      { country: { is: { publicId: "gt" } } },
    ],
  })
  assert.deepEqual(buildProjectWhere({ region: "GAM" }), {
    AND: [{ blocks: { some: { quarter: { in: ["T1", "T2", "T3", "T4"] } } } }],
  })
})

test("buildProjectWhere rechaza el filtro de fase y los avanzados con un error claro", () => {
  assert.throws(() => buildProjectWhere({ availability: ["planning"] }), (error: unknown) => {
    assert.ok(error instanceof ProjectError)
    assert.equal(error.message, PHASE_FILTER_UNAVAILABLE)
    return true
  })
  assert.throws(
    () => buildProjectWhere({ advancedFilters: [{ field: "name", operator: "equals", value: "x" }] }),
    new RegExp(ADVANCED_FILTERS_NOT_MIGRATED),
  )
  assert.throws(() => buildProjectWhere({ filters: { name: "x" } }), new RegExp(ADVANCED_FILTERS_NOT_MIGRATED))
})

test("parseProjectListParams valida dominio y región", () => {
  assert.deepEqual(parseProjectListParams({ page: 1, pageSize: 100, sort: "name:asc" }), { page: 1, pageSize: 100, sort: "name:asc" })
  assert.throws(() => parseProjectListParams({ domain: "retail" }), ProjectError)
  assert.throws(() => parseProjectListParams({ region: "Costa" }), ProjectError)
  assert.throws(() => parseProjectListParams({ pageSize: 5000 }), (error: unknown) => {
    assert.ok(error instanceof ProjectError)
    assert.deepEqual(error.details, ["pageSize: máximo 1000"])
    return true
  })
})
