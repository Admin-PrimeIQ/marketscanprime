import { computeBlockCounters, type BlockCounters } from "../domain/blocks/counters"
import { PublicError } from "./action-result"
import { writeAudit, type AuditActor } from "./audit"
import { COUNTER_UNIT_SELECT, sameBlockCounters, toBlockCounterData, toCounterUnit } from "./block-counter-mapping"
import type { Prisma } from "./generated/client"

/**
 * Contadores del bloque dentro de la transacción del guardado de unidades. Reemplaza el workflow
 * de n8n "Block Edit Queue" (docs/migration/N8N_WORKFLOWS.md, workflow 6): sin webhook, sin Redis y
 * sin espera; si el cálculo o la escritura fallan, el guardado entero se revierte.
 *
 * Decidido con el usuario (29 oct): recalcular en la misma transacción y pasar a una cola de BullMQ
 * solo si la medición lo pide (más de 500 ms o cuando exista el servicio de workers). Para ese
 * cambio basta con reemplazar la llamada a `recalculateBlockCounters` por el encolado.
 *
 * Orden de uso en `saveUnitChanges` (agente de módulos, ROADMAP.md §4.8):
 *   1. `lockBlockForUpdate(tx, blockId)`: dos guardados del mismo bloque se esperan entre sí; los
 *      de bloques distintos no se tocan.
 *   2. revisar versiones (`findStaleUnits`, lib/domain/units/concurrency.ts) y escribir las unidades;
 *   3. `recalculateBlockCounters(tx, blockId, actor)`.
 */

export const BLOCK_NOT_FOUND = "El bloque no existe."

/** `SELECT … FOR UPDATE` sobre la fila del bloque; dura hasta el fin de la transacción. */
export async function lockBlockForUpdate(tx: Prisma.TransactionClient, blockId: number): Promise<void> {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "block" WHERE id = ${blockId} FOR UPDATE`
  if (rows.length === 0) throw new PublicError(BLOCK_NOT_FOUND)
}

export type BlockCountersResult = { changed: boolean; counters: BlockCounters }

/**
 * Lee todas las unidades del bloque, calcula y escribe las 10 columnas. Si no cambió nada, no
 * escribe ni deja fila en `audit_log`. Toma el bloqueo por su cuenta (repetirlo en la misma
 * transacción no espera), así que también sirve fuera del guardado de la hoja.
 */
export async function recalculateBlockCounters(
  tx: Prisma.TransactionClient,
  blockId: number,
  actor: AuditActor,
): Promise<BlockCountersResult> {
  await lockBlockForUpdate(tx, blockId)
  const before = await tx.block.findUniqueOrThrow({ where: { id: blockId } })
  // Orden por id, el mismo que el reporte de paridad: el orden de la suma puede mover el último decimal.
  const units = await tx.unit.findMany({ where: { blockId }, select: COUNTER_UNIT_SELECT, orderBy: { id: "asc" } })
  const counters = computeBlockCounters(units.map(toCounterUnit))
  const data = toBlockCounterData(counters)
  if (sameBlockCounters(before, data)) return { changed: false, counters }

  const after = await tx.block.update({ where: { id: blockId }, data })
  await writeAudit(tx, { userId: actor.userId, model: "block", action: "update", before, after })
  return { changed: true, counters }
}
