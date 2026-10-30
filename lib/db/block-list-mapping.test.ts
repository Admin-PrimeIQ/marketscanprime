import { test } from "node:test"
import assert from "node:assert/strict"
import {
  BLOCK_RAW_FILTERS_NOT_MIGRATED,
  BlockError,
  buildBlockWhere,
  INVALID_BLOCK_FILTERS,
  parseBlockSort,
  toBlockListResponse,
  toStrapiBlock,
  type BlockListRow,
} from "./block-list-mapping.ts"

const decimal = (value: string) => ({ toString: () => value })

const blockRow: BlockListRow = {
  id: 7,
  publicId: "blk-7",
  code: "torre-norte",
  name: "Torre Norte",
  legacyId: null,
  domain: "housing",
  quarter: "T2",
  market: "Primary",
  blockUsage: null,
  phase: "Fase 1",
  tower: null,
  sector: null,
  year: 2026,
  collectionDate: new Date("2026-03-15T00:00:00.000Z"),
  startDate: null,
  deliveryDate: new Date("2027-12-01T00:00:00.000Z"),
  commercializationMonths: 20,
  totalUnits: 40,
  totalM2: decimal("3200.50"),
  availableUnits: 12,
  availableM2: null,
  visitorParking: 0,
  assignedParking: null,
  totalProjectParking: null,
  parkingForSale: null,
  migNumber: null,
  averagePriceUsd: decimal("150000.00"),
  averageSizeM2: null,
  averagePricePerM2Usd: null,
  averageInstallmentUsd: null,
  averageIncomeUsd: null,
  additionalParkingPriceUsd: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  project: {
    id: 3,
    publicId: "proj-3",
    code: "P-3",
    name: "Proyecto Norte",
    department: "Guatemala",
    municipality: null,
    zone: null,
    subzone: null,
    country: { id: 1, publicId: "gt", code: "GT", name: "Guatemala", description: null, isoCode: "GTM", isoCode2: "GT" },
  },
  category: { id: 2, publicId: "cat-2", code: null, name: "Apartamentos", description: null },
  focus: null,
  status: null,
}

test("toStrapiBlock: documentId, fechas YYYY-MM-DD, decimales en número, sin nulos y con el país del proyecto", () => {
  const block = toStrapiBlock(blockRow)
  assert.equal(block.documentId, "blk-7")
  assert.equal(block.collectionDate, "2026-03-15")
  assert.equal(block.deliveryDate, "2027-12-01")
  assert.equal("startDate" in block, false)
  assert.equal(block.totalM2, 3200.5)
  assert.equal(block.averagePriceUSD, 150000)
  assert.equal(block.visitorParking, 0)
  assert.equal("availableM2" in block, false)
  assert.equal(block.blockUsage, null)
  assert.deepEqual(block.project, {
    id: 3,
    documentId: "proj-3",
    code: "P-3",
    name: "Proyecto Norte",
    department: "Guatemala",
    country: { id: 1, documentId: "gt", code: "GT", name: "Guatemala", isoCode: "GTM", isoCode2: "GT" },
  })
  assert.deepEqual(block.blockCategory, { id: 2, documentId: "cat-2", name: "Apartamentos" })
  assert.equal("blockFocus" in block, false)
  assert.equal("financing" in block, false)
})

test("toBlockListResponse arma la paginación de Strapi", () => {
  const response = toBlockListResponse([blockRow], 41, { page: 2, pageSize: 20 })
  assert.deepEqual(response.meta.pagination, { page: 2, pageSize: 20, pageCount: 3, total: 41 })
  assert.equal(response.data.length, 1)
})

test("buildBlockWhere: búsqueda en cinco campos y filtros rápidos con AND", () => {
  const where = buildBlockWhere({
    search: " norte ",
    projectIds: ["proj-3", "12"],
    region: "Interior",
    country: "gt",
    countryIso: "GT",
    domain: "office",
  })
  assert.deepEqual(where, {
    AND: [
      {
        OR: [
          { name: { contains: "norte", mode: "insensitive" } },
          { code: { contains: "norte", mode: "insensitive" } },
          { phase: { contains: "norte", mode: "insensitive" } },
          { tower: { contains: "norte", mode: "insensitive" } },
          { sector: { contains: "norte", mode: "insensitive" } },
        ],
      },
      { project: { is: { OR: [{ id: { in: [12] } }, { publicId: { in: ["proj-3"] } }] } } },
      { quarter: { in: ["S1", "S2"] } },
      { project: { is: { country: { is: { publicId: "gt" } } } } },
      { project: { is: { country: { is: { isoCode2: { equals: "GT", mode: "insensitive" } } } } } },
      { domain: "office" },
    ],
  })
  assert.deepEqual(buildBlockWhere({}), {})
  assert.deepEqual(buildBlockWhere({ projectIds: [" "] }), {})
})

test("buildBlockWhere: project.department con «distinto de» incluye los vacíos", () => {
  assert.deepEqual(buildBlockWhere({ advancedFilters: [{ field: "project.department", operator: "equals", value: "Escuintla" }] }), {
    AND: [{ AND: [{ project: { is: { department: { equals: "Escuintla", mode: "insensitive" } } } }] }],
  })
  assert.deepEqual(
    buildBlockWhere({
      advancedFilters: [{ field: "project.department", operator: "notEquals", value: "Escuintla" }],
      filterLogic: "OR",
    }),
    {
      AND: [
        {
          OR: [
            {
              project: {
                is: { OR: [{ department: null }, { NOT: { department: { equals: "Escuintla", mode: "insensitive" } } }] },
              },
            },
          ],
        },
      ],
    },
  )
})

test("buildBlockWhere rechaza campos u operadores no soportados y el filters libre", () => {
  assert.throws(
    () => buildBlockWhere({ advancedFilters: [{ field: "department", operator: "equals", value: "x" }, { field: "project.department", operator: "between", value: "a" }] }),
    (error: unknown) => {
      assert.ok(error instanceof BlockError)
      assert.equal(error.message, INVALID_BLOCK_FILTERS)
      assert.deepEqual(error.details, [
        'advancedFilters.0: el campo "department" no se puede filtrar',
        'advancedFilters.1: el operador "between" no aplica a "project.department"',
      ])
      return true
    },
  )
  assert.throws(() => buildBlockWhere({ filters: { name: "x" } }), { message: BLOCK_RAW_FILTERS_NOT_MIGRATED })
})

test("parseBlockSort: campos anidados, vacíos como en MySQL y desempate por id", () => {
  assert.deepEqual(parseBlockSort("createdAt:desc"), [{ createdAt: "desc" }, { id: "asc" }])
  assert.deepEqual(parseBlockSort("project.name:asc"), [{ project: { name: "asc" } }, { id: "asc" }])
  assert.deepEqual(parseBlockSort("project.department:desc"), [
    { project: { department: { sort: "desc", nulls: "last" } } },
    { id: "asc" },
  ])
  assert.deepEqual(parseBlockSort("blockCategory.name:asc"), [{ category: { name: "asc" } }, { id: "asc" }])
  assert.deepEqual(parseBlockSort("year"), [{ year: { sort: "asc", nulls: "first" } }, { id: "asc" }])
  assert.deepEqual(parseBlockSort("id:desc"), [{ id: "desc" }])
  assert.deepEqual(parseBlockSort(undefined), [{ id: "asc" }])
  assert.throws(() => parseBlockSort("project.country:asc"), BlockError)
  assert.throws(() => parseBlockSort("toString"), BlockError)
  assert.throws(() => parseBlockSort("name:up"), BlockError)
})
