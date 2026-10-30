/**
 * Entrada de las Server Actions de proyectos. Tipos, largos y los topes de las columnas de
 * `msp_app.project`; lo demás (operadores por campo, `code`/`name` obligatorios al crear,
 * referencias existentes) sigue en `project-filters.ts`, el mapeo y el repositorio.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import { z } from "zod"
import { MAX_PAGE_SIZE } from "./catalog-mapping.ts"
import { parseInput } from "./input.ts"
import { BLOCK_DOMAINS, ProjectError, type ProjectListParams } from "./project-list-mapping.ts"
import { INVALID_PROJECT, type ProjectRequest } from "./project-mapping.ts"

/** Amenidades o servicios por proyecto: hoy son unas decenas; acota un `POST` armado a mano. */
export const MAX_PROJECT_LINKS = 500

const idSchema = z.union([z.number().int().positive(), z.string().trim().min(1).max(64)])

const filterValue = z
  .union([z.string().max(200), z.number().finite(), z.array(z.union([z.string().max(64), z.number().finite()])).max(MAX_PROJECT_LINKS)])
  .nullable()
  .optional()

// La UI también manda `id` y `displayValue`; Zod los descarta (claves desconocidas).
const advancedFilterSchema = z.object({
  field: z.string().max(50),
  operator: z.string().max(30),
  value: filterValue,
  value2: filterValue,
})

export const projectListParamsSchema = z
  .object({
    page: z.number().int().min(1).max(100_000).optional(),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    sort: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
    domain: z.enum(BLOCK_DOMAINS).optional(),
    region: z.enum(["GAM", "Interior"]).optional(),
    country: z.string().max(64).optional(),
    availability: z.array(z.string().max(64)).max(20).optional(),
    filters: z.record(z.unknown()).optional(),
    advancedFilters: z.array(advancedFilterSchema).max(50).optional(),
    filterLogic: z.enum(["AND", "OR"]).optional(),
  })
  .optional()

const text = (max: number) => z.string().max(max).nullable().optional()
const flag = z.boolean().nullable().optional()
const ref = idSchema.or(z.literal("")).nullable().optional()
const refs = z.array(idSchema).max(MAX_PROJECT_LINKS).optional()

/** Sin claves desconocidas: un campo mal escrito no se ignora en silencio. */
export const projectRequestSchema = z
  .object({
    code: text(100),
    name: z.string().max(255).optional(),
    department: text(255),
    municipality: text(255),
    zone: text(255),
    subzone: text(255),
    imageUrl: text(2000),
    // `numeric(10, 8)` y `numeric(11, 8)`; el rango geográfico cabe en los dos.
    latitude: z.number().finite().min(-90).max(90).nullable().optional(),
    longitude: z.number().finite().min(-180).max(180).nullable().optional(),
    // `numeric(10, 2)`: hasta 8 dígitos enteros.
    downPaymentPercentage: z.number().finite().min(-99_999_999.99).max(99_999_999.99).nullable().optional(),
    accessQuantity: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
    muvi: flag,
    showroom: flag,
    modelHouse: flag,
    fha: flag,
    fractionalDownPayment: flag,
    developer: ref,
    country: ref,
    nse: ref,
    securityType: ref,
    exchangeRateProfile: ref,
    amenities: refs,
    services: refs,
  })
  .strict()

const invalidParams = (details: string[]) => new ProjectError("Parámetros de proyectos inválidos", details)
const invalidProject = (details: string[]) => new ProjectError(INVALID_PROJECT, details)

export function parseProjectListParams(value: unknown): ProjectListParams | undefined {
  return parseInput(projectListParamsSchema, value, invalidParams)
}

export function parseProjectId(value: unknown): string | number {
  return parseInput(idSchema, value, invalidProject)
}

export function parseProjectRequest(value: unknown): ProjectRequest {
  return parseInput(projectRequestSchema, value, invalidProject)
}
