/**
 * Entrada de las Server Actions de unidades. El bloque es obligatorio: no hay listado de todas las
 * unidades de la base. Aquí solo se valida la forma; los campos de una escritura los revisa
 * `unit-write-mapping.ts`, que necesita el tipo del bloque.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import { z } from "zod"
import { MAX_PAGE_SIZE } from "./catalog-mapping.ts"
import { parseInput } from "./input.ts"
import { INVALID_UNIT_PARAMS, UNIT_BLOCK_REQUIRED, UnitError, type UnitListParams } from "./unit-mapping.ts"

const blockIdSchema = z.union([z.number().int().positive(), z.string().trim().min(1).max(64)])

export const unitListParamsSchema = z
  .object({
    blockDocumentId: blockIdSchema,
    page: z.number().int().min(1).max(100_000).optional(),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    search: z.string().max(200).optional(),
  })
  .strict()

export function parseUnitListParams(value: unknown): UnitListParams {
  const blockId = (value as { blockDocumentId?: unknown } | null | undefined)?.blockDocumentId
  if (blockId === undefined || blockId === null || blockId === "") throw new UnitError(UNIT_BLOCK_REQUIRED)
  return parseInput(unitListParamsSchema, value, (details) => new UnitError(INVALID_UNIT_PARAMS, details))
}

const toInvalidUnit = (details: string[]) => new UnitError(INVALID_UNIT_PARAMS, details)

// Guardar envía un lote por unidad: los pendientes, los campos de fórmula y la zona dinámica.
const MAX_UNIT_UPDATES = 300

export const unitIdSchema = blockIdSchema

export const unitUpdatesSchema = z
  .array(z.object({ field: z.string().trim().min(1).max(200), value: z.unknown() }).strict())
  .min(1)
  .max(MAX_UNIT_UPDATES)

export const unitCreateSchema = z.record(z.string(), z.unknown())

export const NEW_UNIT_BLOCK_REQUIRED = "Falta el bloque de la unidad nueva."

export function parseUnitId(value: unknown): string | number {
  return parseInput(unitIdSchema, value, toInvalidUnit)
}

export function parseUnitUpdates(value: unknown): Array<{ field: string; value: unknown }> {
  return parseInput(unitUpdatesSchema, value, toInvalidUnit) as Array<{ field: string; value: unknown }>
}

/** La fila nueva de la hoja, con `block` como `documentId` o `id` (lo que manda `handleSave`). */
export function parseUnitCreate(value: unknown): Record<string, unknown> & { block: string | number } {
  const data = parseInput(unitCreateSchema, value, toInvalidUnit)
  if (!blockIdSchema.safeParse(data.block).success) throw new UnitError(NEW_UNIT_BLOCK_REQUIRED)
  return data as Record<string, unknown> & { block: string | number }
}
