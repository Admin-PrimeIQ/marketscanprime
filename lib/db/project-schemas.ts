/**
 * Entrada de la Server Action del listado de proyectos. Tipos y topes; que los filtros avanzados y
 * el de fase no estén migrados lo responde `buildProjectWhere` con su mensaje.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import { z } from "zod"
import { MAX_PAGE_SIZE } from "./catalog-mapping.ts"
import { parseInput } from "./input.ts"
import { BLOCK_DOMAINS, ProjectError, type ProjectListParams } from "./project-list-mapping.ts"

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
    advancedFilters: z.array(z.unknown()).max(50).optional(),
    filterLogic: z.enum(["AND", "OR"]).optional(),
  })
  .optional()

const invalid = (details: string[]) => new ProjectError("Parámetros de proyectos inválidos", details)

export function parseProjectListParams(value: unknown): ProjectListParams | undefined {
  return parseInput(projectListParamsSchema, value, invalid)
}
