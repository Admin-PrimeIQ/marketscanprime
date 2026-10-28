/**
 * Reglas puras de los catálogos sobre Prisma: qué modelo atiende cada endpoint de Strapi, cómo se
 * traducen paginación, orden y búsqueda, y cómo vuelve cada fila con la forma de `CatalogItem`
 * (`documentId` = `publicId`, que la carga del ETL llenó con el `document_id` de Strapi).
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import type { CatalogItem, CatalogListResponse, CatalogRequest } from "../api/strapi.ts"
import { PublicError } from "./action-result.ts"

/** Endpoint de `CATALOG_TYPES` → delegado del cliente Prisma. `block-types` no tiene tabla en `msp_app`. */
export const CATALOG_MODELS = {
  amenities: "amenity",
  countries: "country",
  developers: "developer",
  nses: "nse",
  "security-types": "securityType",
  services: "service",
  "block-categories": "blockCategory",
  "block-focuses": "blockFocus",
  "block-statuses": "blockStatus",
  "unit-parking-types": "unitParkingType",
  "unit-topographies": "unitTopography",
  "unit-usages": "unitUsage",
} as const

export type CatalogEndpoint = keyof typeof CATALOG_MODELS
export type CatalogModel = (typeof CATALOG_MODELS)[CatalogEndpoint]

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 1000

const SORTABLE_FIELDS = new Set(["id", "name", "code", "createdAt", "updatedAt"])

/** Error con el mismo contrato que los de `strapiClient`: `message` y, si hay, `details`. Llega al navegador. */
export class CatalogError extends PublicError {
  constructor(message: string, details?: string[]) {
    super(message, details)
    this.name = "CatalogError"
  }
}

export function resolveCatalogModel(endpoint: string): CatalogModel {
  if (Object.hasOwn(CATALOG_MODELS, endpoint)) return CATALOG_MODELS[endpoint as CatalogEndpoint]
  throw new CatalogError(`El catálogo "${endpoint}" no existe en la base nueva.`)
}

export interface CatalogListParams {
  page?: number
  pageSize?: number
  sort?: string
  search?: string
}

export function normalizePagination(params: CatalogListParams = {}) {
  const page = Math.max(1, Math.trunc(Number(params.page) || 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(params.pageSize) || DEFAULT_PAGE_SIZE)))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

export type CatalogOrderBy = Array<Record<string, "asc" | "desc">>

/** `"name:asc"`, `"code:desc"` o `"name"` (asc), como el `sort` de Strapi. Siempre desempata por `id`. */
export function parseCatalogSort(sort?: string): CatalogOrderBy {
  const orderBy: CatalogOrderBy = []
  for (const part of (sort ?? "").split(",")) {
    const [rawField, rawDirection] = part.trim().split(":")
    if (!rawField) continue
    if (!SORTABLE_FIELDS.has(rawField)) {
      throw new CatalogError(`No se puede ordenar el catálogo por "${rawField}".`)
    }
    const direction = (rawDirection ?? "asc").toLowerCase()
    if (direction !== "asc" && direction !== "desc") {
      throw new CatalogError(`Dirección de orden inválida: "${rawDirection}".`)
    }
    orderBy.push({ [rawField]: direction })
  }
  if (!orderBy.some((entry) => "id" in entry)) orderBy.push({ id: "asc" })
  return orderBy
}

/** Equivale a `filters[$or]` de `name`/`code` con `$containsi` en Strapi. */
export function buildCatalogSearch(search?: string) {
  const term = search?.trim()
  if (!term) return {}
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" as const } },
      { code: { contains: term, mode: "insensitive" as const } },
    ],
  }
}

/** La UI manda `documentId` (o el `id` numérico en algún filtro viejo). */
export function catalogWhereUnique(id: string | number): { id: number } | { publicId: string } {
  if (typeof id === "number") return { id }
  const value = id.trim()
  if (!value) throw new CatalogError("ID de catálogo vacío.")
  return /^\d+$/.test(value) ? { id: Number(value) } : { publicId: value }
}

/** Columnas comunes a todos los catálogos; algunos modelos traen más (developer, amenity, service). */
export interface CatalogRow {
  id: number
  publicId: string
  name: string
  code: string | null
  description: string | null
  createdAt: Date
  updatedAt: Date
  [extra: string]: unknown
}

export function toCatalogItem(row: CatalogRow): CatalogItem {
  const { id, publicId, createdAt, updatedAt, ...rest } = row
  const item: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (value !== null && value !== undefined) item[key] = value
  }
  return {
    ...item,
    id,
    documentId: publicId,
    name: row.name,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  } as CatalogItem
}

export function toCatalogListResponse(
  rows: CatalogRow[],
  total: number,
  pagination: { page: number; pageSize: number },
): CatalogListResponse {
  return {
    data: rows.map(toCatalogItem),
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

export interface CatalogWriteData {
  name?: string
  code?: string | null
  description?: string | null
  isoCode?: string | null
  isoCode2?: string | null
}

/** `undefined` deja el campo como está (igual que omitirlo en el `PUT` de Strapi); `""` lo vacía. */
function optionalText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined
  const text = String(value).trim()
  return text === "" ? null : text
}

function upperOrSame(value: string | null | undefined): string | null | undefined {
  return typeof value === "string" ? value.toUpperCase() : value
}

/**
 * Cuerpo de escritura validado. `isoCode`/`isoCode2` solo existen en `country`; en el resto se
 * ignoran, como hacía la UI al mandarlos únicamente para países.
 */
export function toCatalogWriteData(
  model: CatalogModel,
  request: CatalogRequest,
  mode: "create" | "update",
): CatalogWriteData {
  const errors: string[] = []
  const data: CatalogWriteData = {}

  const name = typeof request?.name === "string" ? request.name.trim() : ""
  if (name) data.name = name
  else if (mode === "create" || request?.name !== undefined) errors.push("name: es obligatorio")

  data.code = optionalText(request?.code)
  data.description = optionalText(request?.description)

  if (model === "country") {
    data.isoCode = upperOrSame(optionalText(request?.isoCode))
    data.isoCode2 = upperOrSame(optionalText(request?.isoCode2))
    // Sin validar el largo: en los datos `isoCode` es alfa-3 ("GTM") e `isoCode2` alfa-2 ("GT"),
    // al revés de lo que asume el formulario, y el IVA y la cuota leen `isoCode2`.
    if (mode === "create" && !data.isoCode) errors.push("isoCode: es obligatorio")
  }

  if (errors.length > 0) throw new CatalogError("Datos de catálogo inválidos", errors)
  for (const key of Object.keys(data) as Array<keyof CatalogWriteData>) {
    if (data[key] === undefined) delete data[key]
  }
  return data
}

/** Traduce los errores conocidos de Prisma; el resto se propaga tal cual. */
export function toCatalogError(error: unknown): CatalogError | unknown {
  if (error instanceof CatalogError) return error
  const code = (error as { code?: unknown } | null)?.code
  if (code === "P2002") {
    const meta = (error as { meta?: Record<string, any> }).meta
    // Con driver adapters los campos llegan en `driverAdapterError`, no en `target`.
    const target = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields
    const fields = Array.isArray(target) ? target.join(", ") : typeof target === "string" ? target : ""
    return new CatalogError("Ya existe un elemento con ese valor", fields ? [`${fields}: debe ser único`] : undefined)
  }
  if (code === "P2003") return new CatalogError("No se puede eliminar: el elemento está en uso.")
  if (code === "P2025") return new CatalogError("El elemento del catálogo no existe.")
  return error
}
