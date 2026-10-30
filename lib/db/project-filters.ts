/**
 * Filtros avanzados del listado de proyectos (`components/projects/advanced-filters.tsx`) traducidos
 * a un `where` de Prisma. Los mismos campos y operadores que la UI ofrece sobre Strapi, con la
 * semántica que un usuario espera, que en algunos casos corrige la de `strapi.ts`:
 *
 * - Texto sin distinguir mayúsculas (como el MySQL de Strapi).
 * - «Distinto de» y «no contiene» incluyen los vacíos.
 * - Amenidades y servicios: «en» = tiene alguna; «no en» = no tiene ninguna.
 * - «Entre» con lógica OR es una sola condición (Strapi la partía en dos sueltas).
 * - Las fechas valen el día completo: la UI manda la medianoche del día elegido.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import { refsWhere, splitRefs } from "./list-query.ts"

export const FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
  "in",
  "notIn",
  "between",
  "isNull",
  "isNotNull",
] as const
export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export interface AdvancedFilter {
  field: string
  operator: string
  value?: unknown
  value2?: unknown
}

type Where = Record<string, unknown>

const DAY_MS = 24 * 60 * 60 * 1000

const TEXT_OPERATORS: ReadonlySet<string> = new Set(["equals", "notEquals", "contains", "notContains", "isNull", "isNotNull"])
const RELATION_OPERATORS: ReadonlySet<string> = new Set(["equals", "notEquals", "in", "notIn", "isNull", "isNotNull"])
const DATE_OPERATORS: ReadonlySet<string> = new Set([
  "equals",
  "notEquals",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
  "between",
  "isNull",
  "isNotNull",
])

type FieldSpec =
  | { kind: "text"; nullable: boolean }
  | { kind: "toOne"; foreignKey: string }
  | { kind: "toMany"; target: string }
  | { kind: "date" }

const FIELDS: Record<string, FieldSpec> = {
  code: { kind: "text", nullable: true },
  name: { kind: "text", nullable: false },
  department: { kind: "text", nullable: true },
  developer: { kind: "toOne", foreignKey: "developerId" },
  country: { kind: "toOne", foreignKey: "countryId" },
  amenities: { kind: "toMany", target: "amenity" },
  services: { kind: "toMany", target: "service" },
  createdAt: { kind: "date" },
  updatedAt: { kind: "date" },
}

export const ADVANCED_FILTER_FIELDS: ReadonlySet<string> = new Set(Object.keys(FIELDS))

/** Ninguna fila cumple (`id IN ()`): «está vacío» sobre un campo obligatorio. */
const MATCH_NONE: Where = { id: { in: [] } }

class InvalidFilter extends Error {}

function text(value: unknown): string {
  const out = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : ""
  if (!out) throw new InvalidFilter("falta el valor")
  return out
}

function refs(value: unknown): Where {
  const list = Array.isArray(value) ? value : [value]
  const where = refsWhere(splitRefs(list.filter((ref): ref is string | number => typeof ref === "string" || typeof ref === "number")))
  if (!where) throw new InvalidFilter("falta el valor")
  return where
}

/** Medianoche (la UI manda `toISOString()` del día elegido) y el instante 24 h después. */
function day(value: unknown): { start: Date; end: Date } {
  const start = typeof value === "string" ? new Date(value) : new Date(Number.NaN)
  if (Number.isNaN(start.getTime())) throw new InvalidFilter("fecha inválida")
  return { start, end: new Date(start.getTime() + DAY_MS) }
}

function textCondition(field: string, nullable: boolean, filter: AdvancedFilter): Where {
  const orEmpty = (condition: Where): Where => (nullable ? { OR: [{ [field]: null }, condition] } : condition)
  switch (filter.operator) {
    case "equals":
      return { [field]: { equals: text(filter.value), mode: "insensitive" } }
    case "notEquals":
      return orEmpty({ NOT: { [field]: { equals: text(filter.value), mode: "insensitive" } } })
    case "contains":
      return { [field]: { contains: text(filter.value), mode: "insensitive" } }
    case "notContains":
      return orEmpty({ NOT: { [field]: { contains: text(filter.value), mode: "insensitive" } } })
    case "isNull":
      return nullable ? { [field]: null } : MATCH_NONE
    default:
      return nullable ? { [field]: { not: null } } : {}
  }
}

function toOneCondition(field: string, foreignKey: string, filter: AdvancedFilter): Where {
  switch (filter.operator) {
    case "equals":
    case "in":
      return { [field]: { is: refs(filter.value) } }
    case "notEquals":
    case "notIn":
      return { OR: [{ [foreignKey]: null }, { NOT: { [field]: { is: refs(filter.value) } } }] }
    case "isNull":
      return { [foreignKey]: null }
    default:
      return { [foreignKey]: { not: null } }
  }
}

function toManyCondition(field: string, target: string, filter: AdvancedFilter): Where {
  switch (filter.operator) {
    case "equals":
    case "in":
      return { [field]: { some: { [target]: refs(filter.value) } } }
    case "notEquals":
    case "notIn":
      return { [field]: { none: { [target]: refs(filter.value) } } }
    case "isNull":
      return { [field]: { none: {} } }
    default:
      return { [field]: { some: {} } }
  }
}

function dateCondition(field: string, filter: AdvancedFilter): Where {
  switch (filter.operator) {
    case "equals": {
      const { start, end } = day(filter.value)
      return { [field]: { gte: start, lt: end } }
    }
    case "notEquals": {
      const { start, end } = day(filter.value)
      return { OR: [{ [field]: { lt: start } }, { [field]: { gte: end } }] }
    }
    case "greaterThan":
      return { [field]: { gte: day(filter.value).end } }
    case "greaterThanOrEqual":
      return { [field]: { gte: day(filter.value).start } }
    case "lessThan":
      return { [field]: { lt: day(filter.value).start } }
    case "lessThanOrEqual":
      return { [field]: { lt: day(filter.value).end } }
    case "between": {
      const from = day(filter.value).start
      const to = day(filter.value2).end
      if (to <= from) throw new InvalidFilter("la fecha final es anterior a la inicial")
      return { [field]: { gte: from, lt: to } }
    }
    case "isNull":
      return MATCH_NONE
    default:
      return {}
  }
}

function allowedOperators(spec: FieldSpec): ReadonlySet<string> {
  if (spec.kind === "text") return TEXT_OPERATORS
  if (spec.kind === "date") return DATE_OPERATORS
  return RELATION_OPERATORS
}

function condition(filter: AdvancedFilter): Where {
  const spec = FIELDS[filter.field]
  if (!spec) throw new InvalidFilter(`el campo "${filter.field}" no se puede filtrar`)
  if (!allowedOperators(spec).has(filter.operator)) {
    throw new InvalidFilter(`el operador "${filter.operator}" no aplica a "${filter.field}"`)
  }
  switch (spec.kind) {
    case "text":
      return textCondition(filter.field, spec.nullable, filter)
    case "toOne":
      return toOneCondition(filter.field, spec.foreignKey, filter)
    case "toMany":
      return toManyCondition(filter.field, spec.target, filter)
    case "date":
      return dateCondition(filter.field, filter)
  }
}

/**
 * `where` de los filtros avanzados combinados con `logic`, o `null` si no hay ninguno. Junta todos
 * los problemas y los lanza en un solo error de `toError`, uno por filtro.
 */
export function buildAdvancedFiltersWhere(
  filters: ReadonlyArray<AdvancedFilter> | undefined,
  logic: "AND" | "OR" = "AND",
  toError: (details: string[]) => Error,
): Where | null {
  if (!filters || filters.length === 0) return null
  const conditions: Where[] = []
  const problems: string[] = []
  filters.forEach((filter, index) => {
    try {
      conditions.push(condition(filter))
    } catch (error) {
      if (!(error instanceof InvalidFilter)) throw error
      problems.push(`advancedFilters.${index}: ${error.message}`)
    }
  })
  if (problems.length > 0) throw toError(problems)
  return { [logic]: conditions }
}
