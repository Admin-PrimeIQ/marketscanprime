/**
 * Fila de `msp_app.audit_log` para un cambio: quién, qué tabla, qué fila (`id` y `publicId`) y las
 * filas antes y después en JSON. Puro: corre bajo `node --test`; la escritura está en `audit.ts`.
 */

export type AuditAction = "create" | "update" | "delete"

/** Lo mínimo que tiene toda fila auditable de `msp_app`. */
export interface AuditedRow {
  id: number
  publicId?: string | null
  [column: string]: unknown
}

export interface AuditEntryInput {
  userId: number
  /** Nombre del modelo de Prisma (`securityType`); se guarda como nombre de tabla (`security_type`). */
  model: string
  action: AuditAction
  before?: AuditedRow | null
  after?: AuditedRow | null
}

export type AuditJson = Record<string, unknown>

export interface AuditEntry {
  userId: number
  entity: string
  entityId: number
  publicId: string | null
  action: AuditAction
  before?: AuditJson
  after?: AuditJson
}

/** `securityType` → `security_type`, como el `@@map` de los modelos de `prisma/schema.prisma`. */
export function auditEntityName(model: string): string {
  return model.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/** Fila → JSON: las fechas quedan en ISO, los `Decimal` en texto y los `bigint` en texto. */
export function toAuditJson(row: AuditedRow): AuditJson {
  return JSON.parse(JSON.stringify(row, (_key, value) => (typeof value === "bigint" ? value.toString() : value)))
}

/** `create` lleva solo `after`; `delete`, solo `before`; `update`, las dos. */
export function buildAuditEntry({ userId, model, action, before, after }: AuditEntryInput): AuditEntry {
  if ((action === "create" || action === "update") && !after) throw new Error(`audit_log: ${action} sin fila nueva`)
  if ((action === "update" || action === "delete") && !before) throw new Error(`audit_log: ${action} sin fila anterior`)
  const row = (after ?? before) as AuditedRow
  return {
    userId,
    entity: auditEntityName(model),
    entityId: row.id,
    publicId: row.publicId ?? null,
    action,
    ...(action !== "create" && before ? { before: toAuditJson(before) } : {}),
    ...(action !== "delete" && after ? { after: toAuditJson(after) } : {}),
  }
}
