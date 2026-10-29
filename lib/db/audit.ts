import type { Prisma } from "./generated/client"
import { buildAuditEntry, type AuditEntryInput } from "./audit-entry"

/** Quién hace el cambio: el usuario de la sesión (`requireRole`). */
export interface AuditActor {
  userId: number
}

function toAuditData(input: AuditEntryInput): Prisma.AuditLogCreateManyInput {
  const { before, after, ...entry } = buildAuditEntry(input)
  return {
    ...entry,
    ...(before ? { before: before as Prisma.InputJsonObject } : {}),
    ...(after ? { after: after as Prisma.InputJsonObject } : {}),
  }
}

/**
 * Escribe la fila de auditoría con el cliente de la transacción (`tx`) del cambio: si el cambio se
 * revierte, la auditoría también, y si la auditoría falla, el cambio no se guarda.
 */
export async function writeAudit(tx: Prisma.TransactionClient, input: AuditEntryInput): Promise<void> {
  await tx.auditLog.create({ data: toAuditData(input) })
}

/** Igual que `writeAudit` para varias filas (un cambio que toca muchas, como vincular proyectos), en un solo `INSERT`. */
export async function writeAuditMany(tx: Prisma.TransactionClient, inputs: AuditEntryInput[]): Promise<void> {
  if (inputs.length === 0) return
  await tx.auditLog.createMany({ data: inputs.map(toAuditData) })
}
