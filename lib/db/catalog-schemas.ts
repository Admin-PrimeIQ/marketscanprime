/**
 * Entrada de las Server Actions de catálogos. Tipos y largos; lo demás (obligatorios, mayúsculas
 * del ISO, endpoint existente) sigue en `catalog-mapping.ts`.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import { z } from "zod"
import type { CatalogRequest } from "../api/strapi.ts"
import { CatalogError, MAX_PAGE_SIZE, type CatalogListParams } from "./catalog-mapping.ts"
import { parseInput } from "./input.ts"

// `null` pasa a `""` (vaciar el campo): `toCatalogWriteData` lo convertiría en el texto "null".
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === null ? "" : value))

// El endpoint desconocido lo rechaza `resolveCatalogModel`, con un mensaje que nombra el catálogo.
export const catalogEndpointSchema = z.string().min(1).max(64)

export const catalogIdSchema = z.union([z.number().int().positive(), z.string().trim().min(1).max(64)])

export const catalogListParamsSchema = z
  .object({
    page: z.number().int().min(1).max(100_000).optional(),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    sort: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
  })
  .optional()

// El largo de `isoCode`/`isoCode2` sigue sin decidir (alfa-2 o alfa-3, README §10): el tope solo
// evita cualquier cosa.
export const catalogRequestSchema = z.object({
  name: z.string().max(255).optional(),
  code: optionalText(100),
  description: optionalText(2000),
  isoCode: optionalText(10),
  isoCode2: optionalText(10),
})

const invalid = (details: string[]) => new CatalogError("Datos de catálogo inválidos", details)

export function parseCatalogEndpoint(value: unknown): string {
  return parseInput(catalogEndpointSchema, value, invalid)
}

export function parseCatalogId(value: unknown): string | number {
  return parseInput(catalogIdSchema, value, invalid)
}

export function parseCatalogListParams(value: unknown): CatalogListParams | undefined {
  return parseInput(catalogListParamsSchema, value, invalid)
}

/** Sin claves desconocidas. `name` obligatorio al crear lo exige `toCatalogWriteData`. */
export function parseCatalogRequest(value: unknown): CatalogRequest {
  return parseInput(catalogRequestSchema, value, invalid) as CatalogRequest
}
