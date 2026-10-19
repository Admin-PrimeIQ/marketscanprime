import type pg from "pg"
import { SPECS, type AppData, type AppRow, type AppTable, type TableSpec } from "./specs"
import { pgType, q } from "./sql"

/**
 * Escritura en `msp_app` dentro de la transacción abierta por el llamador (no hace COMMIT).
 *
 * - Upsert por llave natural (`public_id` o la llave de la tabla hija): los `id` de msp_app se
 *   mantienen entre corridas y una fila idéntica no se reescribe (`IS DISTINCT FROM`).
 * - Tablas hijas: se borran las filas del padre que ya no existen en Strapi.
 * - Modo `full` (espejo): lo que ya no está en Strapi se borra; en `sample` solo se tocan las filas
 *   de la muestra y nunca se borra nada fuera de ella.
 */

export type Mode = "full" | "sample"

export interface TableStats {
  expected: number
  inserted: number
  updated: number
  deleted: number
}

const BATCH = 2_000

/** Error con el paso en que ocurrió, para que el reporte diga dónde y por qué. */
export class StepError extends Error {
  constructor(
    readonly step: string,
    readonly cause: unknown,
  ) {
    const pgError = cause as { message?: string; detail?: string; constraint?: string; table?: string; column?: string }
    const parts = [pgError.message ?? String(cause)]
    if (pgError.detail) parts.push(`detalle: ${pgError.detail}`)
    if (pgError.constraint) parts.push(`restricción: ${pgError.constraint}`)
    if (pgError.table) parts.push(`tabla: ${pgError.table}`)
    if (pgError.column) parts.push(`columna: ${pgError.column}`)
    super(`${step}: ${parts.join(" | ")}`)
  }
}

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof StepError) throw error
    throw new StepError(name, error)
  }
}

type IdMaps = Partial<Record<AppTable, Map<string, string>>>

/** Valores de la fila listos para Postgres: las `ref` pasan de public_id del padre a id numérico. */
function resolveRefs(spec: TableSpec, rows: AppRow[], ids: IdMaps): AppRow[] {
  const refs = spec.columns.filter((c) => c.kind === "ref")
  if (refs.length === 0) return rows
  return rows.map((row) => {
    const out = { ...row }
    for (const column of refs) {
      const publicId = row[column.name]
      if (publicId === null) continue
      const id = ids[column.ref!]?.get(publicId)
      if (id === undefined) throw new Error(`${spec.table}.${column.name}: ${column.ref} con public_id ${publicId} no existe en msp_app`)
      out[column.name] = id
    }
    return out
  })
}

async function upsert(client: pg.Client, spec: TableSpec, rows: AppRow[]): Promise<{ inserted: number; updated: number }> {
  const columns = spec.columns.map((c) => c.name)
  const nonKey = spec.columns.filter((c) => !spec.key.includes(c.name)).map((c) => c.name)
  const select = spec.columns.map((c) => `s.${q(c.name)}::${pgType(c)}`).join(", ")
  const unnest = columns.map((_, i) => `$${i + 1}::text[]`).join(", ")
  const conflict = nonKey.length
    ? `DO UPDATE SET ${nonKey.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(", ")}
       WHERE (${nonKey.map((c) => `t.${q(c)}`).join(", ")}) IS DISTINCT FROM (${nonKey.map((c) => `EXCLUDED.${q(c)}`).join(", ")})`
    : "DO NOTHING"
  const sql = `
    INSERT INTO ${q(spec.table)} AS t (${columns.map(q).join(", ")})
    SELECT ${select} FROM unnest(${unnest}) AS s(${columns.map(q).join(", ")})
    ON CONFLICT (${spec.key.map(q).join(", ")}) ${conflict}
    RETURNING (xmax = 0) AS inserted`

  let inserted = 0
  let updated = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const result = await step(`upsert ${spec.table} (filas ${i + 1}–${i + batch.length})`, () =>
      client.query<{ inserted: boolean }>(sql, columns.map((c) => batch.map((r) => r[c]))),
    )
    for (const row of result.rows) row.inserted ? inserted++ : updated++
  }
  return { inserted, updated }
}

async function loadIds(client: pg.Client, table: AppTable, mode: Mode, publicIds: string[]): Promise<Map<string, string>> {
  const result = await step(`ids de ${table}`, () =>
    mode === "full"
      ? client.query<{ id: string; public_id: string }>(`SELECT id::text AS id, public_id FROM ${q(table)}`)
      : client.query<{ id: string; public_id: string }>(`SELECT id::text AS id, public_id FROM ${q(table)} WHERE public_id = ANY($1::text[])`, [publicIds]),
  )
  return new Map(result.rows.map((r) => [r.public_id, r.id]))
}

/**
 * Antes del upsert, deja en NULL los valores únicos que van a cambiar de dueño (un code que pasa
 * de una fila a otra) y, en modo espejo, los de filas que se van a borrar. Si no, el índice único
 * fallaría a mitad de la carga aunque el estado final sea válido.
 */
async function releaseUniques(client: pg.Client, spec: TableSpec, rows: AppRow[], mode: Mode) {
  for (const column of spec.uniques ?? []) {
    const c = q(column)
    await step(`liberar ${spec.table}.${column}`, async () => {
      await client.query(
        `UPDATE ${q(spec.table)} AS t SET ${c} = NULL
           FROM unnest($1::text[], $2::text[]) AS s(public_id, value)
          WHERE t.public_id = s.public_id AND t.${c} IS NOT NULL AND t.${c} IS DISTINCT FROM s.value`,
        [rows.map((r) => r.public_id), rows.map((r) => r[column])],
      )
      if (mode === "full") {
        await client.query(
          `UPDATE ${q(spec.table)} SET ${c} = NULL WHERE ${c} IS NOT NULL AND public_id NOT IN (SELECT unnest($1::text[]))`,
          [rows.map((r) => r.public_id)],
        )
      }
    })
  }
}

/** Borra las filas hijas cuyo padre está en el alcance pero que ya no existen en Strapi. */
async function deleteStaleChildren(client: pg.Client, spec: TableSpec, rows: AppRow[], mode: Mode, scopeIds: string[]): Promise<number> {
  const keys = spec.key.map((k) => `${q(k)}::text`)
  const tuple = keys.length === 1 ? keys[0] : `(${keys.join(", ")})`
  const unnest = spec.key.map((_, i) => `$${i + 1}::text[]`).join(", ")
  const params: unknown[] = spec.key.map((k) => rows.map((r) => r[k]))
  let sql = `DELETE FROM ${q(spec.table)} WHERE ${tuple} NOT IN (SELECT * FROM unnest(${unnest}))`
  if (mode === "sample") {
    params.push(scopeIds)
    sql += ` AND ${q(spec.scope!)} = ANY($${params.length}::integer[])`
  }
  const result = await step(`borrar hijas obsoletas de ${spec.table}`, () => client.query(sql, params))
  return result.rowCount ?? 0
}

async function prune(client: pg.Client, table: AppTable, publicIds: string[]): Promise<number> {
  const result = await step(`borrar de ${table} lo que ya no está en Strapi`, () =>
    client.query(`DELETE FROM ${q(table)} WHERE public_id NOT IN (SELECT unnest($1::text[]))`, [publicIds]),
  )
  return result.rowCount ?? 0
}

export async function write(
  client: pg.Client,
  data: AppData,
  mode: Mode,
  log: (message: string) => void = () => {},
): Promise<Record<AppTable, TableStats>> {
  const stats = Object.fromEntries(
    SPECS.map((s) => [s.table, { expected: data[s.table].length, inserted: 0, updated: 0, deleted: 0 }]),
  ) as Record<AppTable, TableStats>
  const publicIds = (table: AppTable) => data[table].map((r) => r.public_id!)
  const ids: IdMaps = {}

  if (mode === "full") {
    // Primero lo que se va: libera codes y deja a los bloques sin unidades ajenas antes de reasignar.
    stats.unit.deleted += await prune(client, "unit", publicIds("unit"))
    stats.user.deleted += await prune(client, "user", publicIds("user"))
  }

  for (const spec of SPECS) {
    const rows = data[spec.table]
    if (spec.publicId) await releaseUniques(client, spec, rows, mode)
    const resolved = await step(`resolver relaciones de ${spec.table}`, async () => resolveRefs(spec, rows, ids))
    const { inserted, updated } = await upsert(client, spec, resolved)
    stats[spec.table].inserted += inserted
    stats[spec.table].updated += updated
    if (spec.publicId) {
      ids[spec.table] = await loadIds(client, spec.table, mode, publicIds(spec.table))
    } else {
      const scopeTable = spec.columns.find((c) => c.name === spec.scope)!.ref!
      const scopeIds = data[scopeTable].map((r) => ids[scopeTable]!.get(r.public_id!)!)
      stats[spec.table].deleted += await deleteStaleChildren(client, spec, resolved, mode, scopeIds)
    }
    log(`  ${spec.table.padEnd(32)} esperadas ${String(rows.length).padStart(7)} | nuevas ${String(inserted).padStart(7)} | cambiadas ${String(updated).padStart(7)}`)
  }

  if (mode === "full") {
    for (const spec of SPECS.toReversed()) {
      if (!spec.publicId || spec.table === "unit" || spec.table === "user") continue
      stats[spec.table].deleted += await prune(client, spec.table, publicIds(spec.table))
    }
  }
  return stats
}
