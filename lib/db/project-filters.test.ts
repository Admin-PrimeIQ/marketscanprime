import { test } from "node:test"
import assert from "node:assert/strict"
import { buildAdvancedFiltersWhere, type AdvancedFilter } from "./project-filters.ts"

class FilterError extends Error {
  details: string[]
  constructor(details: string[]) {
    super("invalid")
    this.details = details
  }
}
const toError = (details: string[]) => new FilterError(details)

const one = (filter: AdvancedFilter) => buildAdvancedFiltersWhere([filter], "AND", toError)?.AND
const single = (filter: AdvancedFilter) => (one(filter) as object[])[0]

const MIDNIGHT = "2026-03-10T06:00:00.000Z"
const NEXT_MIDNIGHT = new Date("2026-03-11T06:00:00.000Z")

test("sin filtros devuelve null", () => {
  assert.equal(buildAdvancedFiltersWhere(undefined, "AND", toError), null)
  assert.equal(buildAdvancedFiltersWhere([], "OR", toError), null)
})

test("texto: sin distinguir mayúsculas y los «distinto»/«no contiene» incluyen los vacíos", () => {
  assert.deepEqual(single({ field: "name", operator: "equals", value: " Torre " }), {
    name: { equals: "Torre", mode: "insensitive" },
  })
  assert.deepEqual(single({ field: "code", operator: "contains", value: "P-" }), {
    code: { contains: "P-", mode: "insensitive" },
  })
  assert.deepEqual(single({ field: "code", operator: "notEquals", value: "P-1" }), {
    OR: [{ code: null }, { NOT: { code: { equals: "P-1", mode: "insensitive" } } }],
  })
  assert.deepEqual(single({ field: "department", operator: "notContains", value: "Gua" }), {
    OR: [{ department: null }, { NOT: { department: { contains: "Gua", mode: "insensitive" } } }],
  })
  // `name` es obligatorio: no hay vacíos que sumar.
  assert.deepEqual(single({ field: "name", operator: "notEquals", value: "x" }), {
    NOT: { name: { equals: "x", mode: "insensitive" } },
  })
})

test("texto: vacío / no vacío", () => {
  assert.deepEqual(single({ field: "department", operator: "isNull" }), { department: null })
  assert.deepEqual(single({ field: "department", operator: "isNotNull" }), { department: { not: null } })
  assert.deepEqual(single({ field: "name", operator: "isNull" }), { id: { in: [] } })
  assert.deepEqual(single({ field: "name", operator: "isNotNull" }), {})
})

test("relación a uno: por documentId o id, y «distinto» incluye los proyectos sin relación", () => {
  assert.deepEqual(single({ field: "developer", operator: "equals", value: "dev-1" }), {
    developer: { is: { OR: [{ publicId: { in: ["dev-1"] } }] } },
  })
  assert.deepEqual(single({ field: "country", operator: "in", value: ["gt", "7"] }), {
    country: { is: { OR: [{ id: { in: [7] } }, { publicId: { in: ["gt"] } }] } },
  })
  assert.deepEqual(single({ field: "developer", operator: "notEquals", value: "dev-1" }), {
    OR: [{ developerId: null }, { NOT: { developer: { is: { OR: [{ publicId: { in: ["dev-1"] } }] } } } }],
  })
  assert.deepEqual(single({ field: "country", operator: "notIn", value: "gt" }), {
    OR: [{ countryId: null }, { NOT: { country: { is: { OR: [{ publicId: { in: ["gt"] } }] } } } }],
  })
  assert.deepEqual(single({ field: "developer", operator: "isNull" }), { developerId: null })
  assert.deepEqual(single({ field: "country", operator: "isNotNull" }), { countryId: { not: null } })
})

test("amenidades y servicios: «en» = tiene alguna, «no en» = no tiene ninguna", () => {
  assert.deepEqual(single({ field: "amenities", operator: "in", value: "am-1" }), {
    amenities: { some: { amenity: { OR: [{ publicId: { in: ["am-1"] } }] } } },
  })
  assert.deepEqual(single({ field: "services", operator: "notIn", value: ["sv-1", "sv-2"] }), {
    services: { none: { service: { OR: [{ publicId: { in: ["sv-1", "sv-2"] } }] } } },
  })
})

test("fechas: el día completo desde la medianoche que manda la UI", () => {
  const start = new Date(MIDNIGHT)
  assert.deepEqual(single({ field: "createdAt", operator: "equals", value: MIDNIGHT }), {
    createdAt: { gte: start, lt: NEXT_MIDNIGHT },
  })
  assert.deepEqual(single({ field: "createdAt", operator: "notEquals", value: MIDNIGHT }), {
    OR: [{ createdAt: { lt: start } }, { createdAt: { gte: NEXT_MIDNIGHT } }],
  })
  assert.deepEqual(single({ field: "updatedAt", operator: "greaterThan", value: MIDNIGHT }), { updatedAt: { gte: NEXT_MIDNIGHT } })
  assert.deepEqual(single({ field: "updatedAt", operator: "greaterThanOrEqual", value: MIDNIGHT }), { updatedAt: { gte: start } })
  assert.deepEqual(single({ field: "updatedAt", operator: "lessThan", value: MIDNIGHT }), { updatedAt: { lt: start } })
  assert.deepEqual(single({ field: "updatedAt", operator: "lessThanOrEqual", value: MIDNIGHT }), { updatedAt: { lt: NEXT_MIDNIGHT } })
  assert.deepEqual(single({ field: "createdAt", operator: "isNull" }), { id: { in: [] } })
  assert.deepEqual(single({ field: "createdAt", operator: "isNotNull" }), {})
})

test("«entre» es una sola condición, también con lógica OR", () => {
  const where = buildAdvancedFiltersWhere(
    [
      { field: "createdAt", operator: "between", value: MIDNIGHT, value2: "2026-03-12T06:00:00.000Z" },
      { field: "name", operator: "contains", value: "torre" },
    ],
    "OR",
    toError,
  )
  assert.deepEqual(where, {
    OR: [
      { createdAt: { gte: new Date(MIDNIGHT), lt: new Date("2026-03-13T06:00:00.000Z") } },
      { name: { contains: "torre", mode: "insensitive" } },
    ],
  })
})

test("junta todos los problemas en un solo error, uno por filtro", () => {
  assert.throws(
    () =>
      buildAdvancedFiltersWhere(
        [
          { field: "phase", operator: "equals", value: "x" },
          { field: "name", operator: "between", value: "a" },
          { field: "code", operator: "equals", value: "  " },
          { field: "createdAt", operator: "equals", value: "no-es-fecha" },
          { field: "createdAt", operator: "between", value: MIDNIGHT },
          { field: "developer", operator: "equals", value: [] },
          { field: "updatedAt", operator: "between", value: "2026-03-12T06:00:00.000Z", value2: "2026-03-10T06:00:00.000Z" },
        ],
        "AND",
        toError,
      ),
    (error: unknown) => {
      assert.ok(error instanceof FilterError)
      assert.deepEqual(error.details, [
        'advancedFilters.0: el campo "phase" no se puede filtrar',
        'advancedFilters.1: el operador "between" no aplica a "name"',
        "advancedFilters.2: falta el valor",
        "advancedFilters.3: fecha inválida",
        "advancedFilters.4: fecha inválida",
        "advancedFilters.5: falta el valor",
        "advancedFilters.6: la fecha final es anterior a la inicial",
      ])
      return true
    },
  )
})
