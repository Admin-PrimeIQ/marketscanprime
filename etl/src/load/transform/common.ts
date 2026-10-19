import type { Present } from "../model"
import { bool, date, int, numeric, text, timestamp, type RawValue, type Value } from "../normalize"
import type { Collection, RawRow } from "../snapshot"

export { bool, date, int, numeric, text }

/** `public_id` del destino de una relación (o null si no hay). */
export function refDoc(present: Present, table: Collection, id: number | undefined): Value {
  if (id === undefined) return null
  const row = present[table].get(id)
  if (!row) throw new Error(`Referencia sin resolver: ${table}.id = ${id} (la validación debió excluirla)`)
  return text(row.document_id)
}

/** created_at / updated_at de Strapi; si falta uno se usa el otro (o published_at). */
export function stamps(row: RawRow): { created_at: Value; updated_at: Value } {
  const created = (row.created_at ?? row.updated_at ?? row.published_at) as RawValue
  const updated = (row.updated_at ?? row.created_at ?? row.published_at) as RawValue
  return { created_at: timestamp(created), updated_at: timestamp(updated) }
}

export const doc = (row: RawRow): Value => text(row.document_id)
