/**
 * Reglas puras del listado de proyectos sobre Prisma (`getProjects`): búsqueda, orden, los filtros
 * rápidos (dominio, región GAM/Interior y país) y los avanzados (`project-filters.ts`), y la fila con
 * sus relaciones vuelve con la forma de `StrapiProject` (`documentId` = `publicId`). El filtro de
 * fase y el `filters` libre no tienen equivalente en `msp_app` y responden con un error claro.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import type { StrapiProject, StrapiProjectsResponse } from "../api/strapi.ts"
import { PublicError } from "./action-result.ts"
import { decimalToNumber, type DecimalLike } from "./exchange-rate-profile-mapping.ts"
import { buildAdvancedFiltersWhere, type AdvancedFilter } from "./project-filters.ts"

export const PROJECT_SORTABLE_FIELDS: ReadonlySet<string> = new Set(["id", "name", "code", "department", "createdAt", "updatedAt"])
export const PROJECT_NULLABLE_SORT_FIELDS: ReadonlySet<string> = new Set(["code", "department"])

export const BLOCK_DOMAINS = ["housing", "office", "industrial"] as const
export type ProjectDomain = (typeof BLOCK_DOMAINS)[number]

/** Igual que `getProjects` de Strapi: GAM son los trimestres `T1–T4`, Interior `S1/S2` (`lib/domain/region.ts`). */
export const REGION_QUARTERS = {
  GAM: ["T1", "T2", "T3", "T4"],
  Interior: ["S1", "S2"],
} as const
export type ProjectRegion = keyof typeof REGION_QUARTERS

export const RAW_FILTERS_NOT_MIGRATED = "El parámetro `filters` de proyectos no está migrado a la base nueva: usa los filtros avanzados."
export const INVALID_ADVANCED_FILTERS = "Filtros avanzados inválidos"
export const PHASE_FILTER_UNAVAILABLE = "El filtro de fase no está disponible en la base nueva: los proyectos no tienen ese campo."

/** Error con el mismo contrato que los de `strapiClient`: `message` y, si hay, `details`. Llega al navegador. */
export class ProjectError extends PublicError {
  constructor(message: string, details?: string[]) {
    super(message, details)
    this.name = "ProjectError"
  }
}

export const projectError = (message: string) => new ProjectError(message)

export interface ProjectListParams {
  page?: number
  pageSize?: number
  sort?: string
  search?: string
  domain?: ProjectDomain
  region?: ProjectRegion
  country?: string
  availability?: string[]
  filters?: Record<string, unknown>
  advancedFilters?: AdvancedFilter[]
  filterLogic?: "AND" | "OR"
}

/**
 * `where` de Prisma equivalente al de Strapi: búsqueda en `name`/`code`/`developer.name`, filtros
 * rápidos y el grupo de filtros avanzados (combinados entre sí con `filterLogic`), todo con AND. Por
 * dominio o región, el proyecto entra si alguno de sus bloques cumple.
 */
export function buildProjectWhere(params: ProjectListParams = {}) {
  if ((params.availability?.length ?? 0) > 0) throw new ProjectError(PHASE_FILTER_UNAVAILABLE)
  if (Object.keys(params.filters ?? {}).length > 0) throw new ProjectError(RAW_FILTERS_NOT_MIGRATED)

  const and: object[] = []
  const term = params.search?.trim()
  if (term) {
    and.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { code: { contains: term, mode: "insensitive" } },
        { developer: { is: { name: { contains: term, mode: "insensitive" } } } },
      ],
    })
  }
  if (params.domain) and.push({ blocks: { some: { domain: params.domain } } })
  if (params.region) and.push({ blocks: { some: { quarter: { in: [...REGION_QUARTERS[params.region]] } } } })
  const country = params.country?.trim()
  if (country) and.push({ country: { is: { publicId: country } } })
  const advanced = buildAdvancedFiltersWhere(
    params.advancedFilters,
    params.filterLogic,
    (details) => new ProjectError(INVALID_ADVANCED_FILTERS, details),
  )
  if (advanced) and.push(advanced)
  return and.length > 0 ? { AND: and } : {}
}

export interface RelatedRow {
  id: number
  publicId: string
  code: string | null
  name: string
  description?: string | null
  category?: string | null
}

export interface ProjectListRow {
  id: number
  publicId: string
  code: string | null
  name: string
  department: string | null
  municipality: string | null
  zone: string | null
  subzone: string | null
  latitude: DecimalLike | null
  longitude: DecimalLike | null
  muvi: boolean | null
  showroom: boolean | null
  modelHouse: boolean | null
  accessQuantity: number | null
  imageUrl: string | null
  fha: boolean | null
  fractionalDownPayment: boolean | null
  downPaymentPercentage: DecimalLike | null
  createdAt: Date
  updatedAt: Date
  developer: RelatedRow | null
  country: (RelatedRow & { isoCode: string | null; isoCode2: string | null }) | null
  amenities: Array<{ amenity: RelatedRow }>
  services: Array<{ service: RelatedRow }>
  blocks: Array<{ id: number; publicId: string; quarter: string | null; domain: string }>
}

/** Copia las claves con valor: Strapi devolvía `null`, pero los tipos `StrapiProject` las declaran opcionales. */
export function withoutNulls<T extends Record<string, unknown>>(value: T): Partial<{ [K in keyof T]: NonNullable<T[K]> }> {
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== null && item !== undefined) out[key] = item
  }
  return out as Partial<{ [K in keyof T]: NonNullable<T[K]> }>
}

export function toRelated({ id, publicId, ...rest }: RelatedRow) {
  return { id, documentId: publicId, ...withoutNulls(rest) }
}

export function toStrapiProject(row: ProjectListRow): StrapiProject {
  const scalars = withoutNulls({
    code: row.code,
    department: row.department,
    municipality: row.municipality,
    zone: row.zone,
    subzone: row.subzone,
    latitude: decimalToNumber(row.latitude),
    longitude: decimalToNumber(row.longitude),
    muvi: row.muvi,
    showroom: row.showroom,
    modelHouse: row.modelHouse,
    accessQuantity: row.accessQuantity,
    imageUrl: row.imageUrl,
    fha: row.fha,
    fractionalDownPayment: row.fractionalDownPayment,
    downPaymentPercentage: decimalToNumber(row.downPaymentPercentage),
  })
  return {
    id: row.id,
    documentId: row.publicId,
    name: row.name,
    ...scalars,
    ...(row.developer ? { developer: toRelated(row.developer) } : {}),
    ...(row.country ? { country: toRelated(row.country) } : {}),
    amenities: row.amenities.map(({ amenity }) => toRelated(amenity)),
    services: row.services.map(({ service }) => toRelated(service)),
    blocks: row.blocks.map((block) => ({
      id: block.id,
      documentId: block.publicId,
      quarter: block.quarter,
      domain: block.domain as ProjectDomain,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as StrapiProject
}

export function toProjectListResponse(
  rows: ProjectListRow[],
  total: number,
  pagination: { page: number; pageSize: number },
): StrapiProjectsResponse {
  return {
    data: rows.map(toStrapiProject),
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
