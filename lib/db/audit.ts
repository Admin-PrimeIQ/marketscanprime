import type { Prisma } from "./generated/client"
import { buildAuditEntry, type AuditEntryInput } from "./audit-entry"

/** Quién hace el cambio: el usuario de la sesión (`requireRole`). */
export interface AuditActor {
  userId: number
}

/**
 * Escribe la fila de auditoría con el cliente de la transacción (`tx`) del cambio: si el cambio se
 * revierte, la auditoría también, y si la auditoría falla, el cambio no se guarda.
 */
export async function writeAudit(tx: Prisma.TransactionClient, input: AuditEntryInput): Promise<void> {
  const { before, after, ...entry } = buildAuditEntry(input)
  await tx.auditLog.create({
    data: {
      ...entry,
      ...(before ? { before: before as Prisma.InputJsonObject } : {}),
      ...(after ? { after: after as Prisma.InputJsonObject } : {}),
    },
  })
}
