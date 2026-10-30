/**
 * Reglas puras del listado de bloques sobre Prisma (`getBlocks`): búsqueda, filtros rápidos
 * (proyectos, región GAM/Interior, país por `documentId` o por ISO, tipo de inmueble), el filtro
 * avanzado `project.department`, el orden (también por campos del proyecto y de la categoría) y la
 * fila con sus relaciones con la forma de `StrapiBlock` (`documentId` = `publicId`). El `filters`
 * libre no tiene equivalente y responde con un error claro.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import type { BlockDomain, StrapiBlock, StrapiBlocksResponse } from "../api/strapi.ts"
import { PublicError } from "./action-result.ts"
import { decimalToNumber, type DecimalLike } from "./exchange-rate-profile-mapping.ts"
import { refsWhere, splitRefs } from "./list-query.ts"
import { buildAdvancedFiltersWhere, type AdvancedFilter, type AdvancedFilterFields } from "./project-filters.ts"
import { BLOCK_DOMAINS, REGION_QUARTERS, toRelated, withoutNulls, type ProjectRegion, type RelatedRow } from "./project-list-mapping.ts"

export const QUARTERS = ["T1", "T2", "T3", "T4", "S1", "S2"] as const
export const MARKETS = ["Primary", "Secondary"] as const
export const BLOCK_USAGES = ["Venta", "Renta"] as const
export { BLOCK_DOMAINS }

export const BLOCK_RAW_FILTERS_NOT_MIGRATED = "El parámetro `filters` de bloques no está migrado a la base nueva: usa los filtros avanzados."
export const INVALID_BLOCK_FILTERS = "Filtros avanzados de bloques inválidos"

/** Error con el mismo contrato que los de `strapiClient`: `message` y, si hay, `details`. Llega al navegador. */
export class BlockError extends PublicError {
  constructor(message: string, details?: string[]) {
    super(message, details)
    this.name = "BlockError"
  }
}

export const blockError = (message: string) => new BlockError(message)

export interface BlockListParams {
  page?: number
  pageSize?: number
  sort?: string
  search?: string
  projectIds?: string[]
  region?: ProjectRegion
  country?: string
  countryIso?: string
  domain?: BlockDomain
  filters?: Record<string, unknown>
  advancedFilters?: AdvancedFilter[]
  filterLogic?: "AND" | "OR"
}

/** Los únicos filtros avanzados de bloques en la UI (`app/(main)/blocks/page.tsx`, `/units`). */
export const BLOCK_FILTER_FIELDS: AdvancedFilterFields = {
  "project.department": { kind: "text", nullable: true, relation: "project", column: "department" },
}

/**
 * `where` de Prisma equivalente al de `getBlocks` de Strapi, todo con AND: búsqueda en
 * `name`/`code`/`phase`/`tower`/`sector`, filtros rápidos y el grupo de filtros avanzados
 * (combinados entre sí con `filterLogic`).
 */
export function buildBlockWhere(params: BlockListParams = {}) {
  if (Object.keys(params.filters ?? {}).length > 0) throw new BlockError(BLOCK_RAW_FILTERS_NOT_MIGRATED)

  const and: object[] = []
  const term = params.search?.trim()
  if (term) {
    and.push({
      OR: ["name", "code", "phase", "tower", "sector"].map((field) => ({ [field]: { contains: term, mode: "insensitive" } })),
    })
  }
  const projects = refsWhere(splitRefs(params.projectIds ?? []))
  if (projects) and.push({ project: { is: projects } })
  if (params.region) and.push({ quarter: { in: [...REGION_QUARTERS[params.region]] } })
  const country = params.country?.trim()
  if (country) and.push({ project: { is: { country: { is: { publicId: country } } } } })
  const iso = params.countryIso?.trim()
  if (iso) and.push({ project: { is: { country: { is: { isoCode2: { equals: iso, mode: "insensitive" } } } } } })
  if (params.domain) and.push({ domain: params.domain })
  const advanced = buildAdvancedFiltersWhere(
    params.advancedFilters,
    params.filterLogic,
    (details) => new BlockError(INVALID_BLOCK_FILTERS, details),
    BLOCK_FILTER_FIELDS,
  )
  if (advanced) and.push(advanced)
  return and.length > 0 ? { AND: and } : {}
}

type Direction = "asc" | "desc"

/** Campo de `sort` (como lo manda `components/blocks/blocks-table.tsx`) → ruta en Prisma. */
const SORT_PATHS: Record<string, { path: string[]; nullable: boolean }> = {
  id: { path: ["id"], nullable: false },
  code: { path: ["code"], nullable: true },
  name: { path: ["name"], nullable: true },
  year: { path: ["year"], nullable: true },
  quarter: { path: ["quarter"], nullable: true },
  market: { path: ["market"], nullable: true },
  domain: { path: ["domain"], nullable: false },
  totalUnits: { path: ["totalUnits"], nullable: true },
  availableUnits: { path: ["availableUnits"], nullable: true },
  createdAt: { path: ["createdAt"], nullable: false },
  updatedAt: { path: ["updatedAt"], nullable: false },
  "project.name": { path: ["project", "name"], nullable: false },
  "project.department": { path: ["project", "department"], nullable: true },
  // La categoría puede faltar, pero su `name` no es nulo: Prisma no acepta `nulls` ahí.
  "blockCategory.name": { path: ["category", "name"], nullable: false },
}

export const BLOCK_SORTABLE_FIELDS: ReadonlySet<string> = new Set(Object.keys(SORT_PATHS))

/**
 * `"name:asc"`, `"project.name:desc"`, … limitado a `SORT_PATHS`, siempre con desempate por `id`.
 * Los vacíos quedan donde los dejaba el MySQL de Strapi (primeros en `asc`, últimos en `desc`).
 */
export function parseBlockSort(sort: string | undefined): Array<Record<string, unknown>> {
  const orderBy: Array<Record<string, unknown>> = []
  let hasId = false
  for (const part of (sort ?? "").split(",")) {
    const [rawField, rawDirection] = part.trim().split(":")
    if (!rawField) continue
    const spec = Object.hasOwn(SORT_PATHS, rawField) ? SORT_PATHS[rawField] : undefined
    if (!spec) throw new BlockError(`No se puede ordenar por "${rawField}".`)
    const direction = (rawDirection ?? "asc").toLowerCase()
    if (direction !== "asc" && direction !== "desc") throw new BlockError(`Dirección de orden inválida: "${rawDirection}".`)
    const leaf: Direction | { sort: Direction; nulls: "first" | "last" } = spec.nullable
      ? { sort: direction, nulls: direction === "asc" ? "first" : "last" }
      : direction
    let entry: Record<string, unknown> = { [spec.path[spec.path.length - 1]]: leaf }
    for (let index = spec.path.length - 2; index >= 0; index--) entry = { [spec.path[index]]: entry }
    orderBy.push(entry)
    if (rawField === "id") hasId = true
  }
  if (!hasId) orderBy.push({ id: "asc" })
  return orderBy
}

export interface BlockProjectRow {
  id: number
  publicId: string
  code: string | null
  name: string
  department: string | null
  municipality: string | null
  zone: string | null
  subzone: string | null
  country: (RelatedRow & { isoCode: string | null; isoCode2: string | null }) | null
}

export interface BlockListRow {
  id: number
  publicId: string
  code: string | null
  name: string | null
  legacyId: string | null
  domain: string
  quarter: string | null
  market: string | null
  blockUsage: string | null
  phase: string | null
  tower: string | null
  sector: string | null
  year: number | null
  collectionDate: Date | null
  startDate: Date | null
  deliveryDate: Date | null
  commercializationMonths: number | null
  totalUnits: number | null
  totalM2: DecimalLike | null
  availableUnits: number | null
  availableM2: DecimalLike | null
  visitorParking: number | null
  assignedParking: number | null
  totalProjectParking: number | null
  parkingForSale: number | null
  migNumber: number | null
  averagePriceUsd: DecimalLike | null
  averageSizeM2: DecimalLike | null
  averagePricePerM2Usd: DecimalLike | null
  averageInstallmentUsd: DecimalLike | null
  averageIncomeUsd: DecimalLike | null
  additionalParkingPriceUsd: DecimalLike | null
  createdAt: Date
  updatedAt: Date
  project: BlockProjectRow
  category: RelatedRow | null
  focus: RelatedRow | null
  status: RelatedRow | null
}

/** Columna `date` → `"YYYY-MM-DD"`, como la devolvía Strapi. */
export function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

function toBlockProject(project: BlockProjectRow) {
  const { country, ...rest } = project
  return { ...toRelated(rest), ...(country ? { country: toRelated(country) } : {}) }
}

/** Lo que poblaba `getBlocks` de Strapi: proyecto con su país, categoría, enfoque y estado. */
export function toStrapiBlock(row: BlockListRow): StrapiBlock {
  const scalars = withoutNulls({
    code: row.code,
    name: row.name,
    legacyId: row.legacyId,
    phase: row.phase,
    tower: row.tower,
    sector: row.sector,
    year: row.year,
    quarter: row.quarter,
    collectionDate: toDateOnly(row.collectionDate),
    market: row.market,
    startDate: toDateOnly(row.startDate),
    deliveryDate: toDateOnly(row.deliveryDate),
    commercializationMonths: row.commercializationMonths,
    totalUnits: row.totalUnits,
    totalM2: decimalToNumber(row.totalM2),
    availableUnits: row.availableUnits,
    availableM2: decimalToNumber(row.availableM2),
    averagePriceUSD: decimalToNumber(row.averagePriceUsd),
    averageSizeM2: decimalToNumber(row.averageSizeM2),
    averagePricePerM2USD: decimalToNumber(row.averagePricePerM2Usd),
    averageInstallmentUSD: decimalToNumber(row.averageInstallmentUsd),
    averageIncomeUSD: decimalToNumber(row.averageIncomeUsd),
    additionalParkingPriceUSD: decimalToNumber(row.additionalParkingPriceUsd),
    visitorParking: row.visitorParking,
    assignedParking: row.assignedParking,
    totalProjectParking: row.totalProjectParking,
    parkingForSale: row.parkingForSale,
    migNumber: row.migNumber,
  })
  return {
    id: row.id,
    documentId: row.publicId,
    ...scalars,
    domain: row.domain as BlockDomain,
    blockUsage: (row.blockUsage as StrapiBlock["blockUsage"]) ?? null,
    project: toBlockProject(row.project),
    ...(row.category ? { blockCategory: toRelated(row.category) } : {}),
    ...(row.focus ? { blockFocus: toRelated(row.focus) } : {}),
    ...(row.status ? { blockStatus: toRelated(row.status) } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as StrapiBlock
}

export function toBlockListResponse(
  rows: BlockListRow[],
  total: number,
  pagination: { page: number; pageSize: number },
): StrapiBlocksResponse {
  return {
    data: rows.map(toStrapiBlock),
    meta: {
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
        total,
      },
    },
  }
}
