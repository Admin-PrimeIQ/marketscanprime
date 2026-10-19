import { setTimeout as sleep } from "node:timers/promises"
import { createStrapiClient } from "../strapi/client"
import {
  emptyTables,
  STRAPI_TABLES,
  UNIT_SCALE_TABLES,
  type RawRow,
  type Snapshot,
  type StrapiTable,
} from "./snapshot"

/**
 * Lectura de SOLO LECTURA de la base de Strapi hacia un snapshot en memoria.
 *
 * Límites de la skill proteger-produccion: cliente que bloquea escrituras, pool ≤ 2, lotes de
 * 2,000 filas por cursor de `id` y una pausa entre lotes. Se leen todas las filas (también
 * borradores): la elección de la fila publicada la hace la validación, que así puede reportarla.
 */

const BATCH = 2_000
const IN_CHUNK = 1_000
const PAUSE_MS = 50
/** Pausa entre lotes cuando se lee en horario laboral: más lento, menos carga sobre Strapi. */
export const BUSINESS_HOURS_PAUSE_MS = 500

type StrapiClient = ReturnType<typeof createStrapiClient>
type Delegate = { findMany: (args: unknown) => Promise<Record<string, unknown>[]> }

function delegate(strapi: StrapiClient, table: StrapiTable): Delegate {
  return (strapi as unknown as Record<string, Delegate>)[table]
}

/** Date → ISO, Decimal → texto en notación normal (toFixed sin argumentos no redondea). */
function serialize(row: Record<string, unknown>): RawRow {
  const out: RawRow = {}
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) out[key] = null
    else if (value instanceof Date) out[key] = value.toISOString()
    else if (typeof value === "object" && typeof (value as { toFixed?: unknown }).toFixed === "function") {
      out[key] = (value as { toFixed: () => string }).toFixed()
    } else if (typeof value === "bigint") out[key] = Number(value)
    else out[key] = value as string | number | boolean
  }
  return out
}

let pauseMs = PAUSE_MS

async function readAll(strapi: StrapiClient, table: StrapiTable, where: Record<string, unknown> = {}): Promise<RawRow[]> {
  const rows: RawRow[] = []
  let cursor = 0
  for (;;) {
    const batch = await delegate(strapi, table).findMany({
      where: { AND: [where, { id: { gt: cursor } }] },
      orderBy: { id: "asc" },
      take: BATCH,
    })
    for (const row of batch) rows.push(serialize(row))
    if (batch.length < BATCH) return rows
    cursor = Number(batch.at(-1)!.id)
    await sleep(pauseMs)
  }
}

async function readIn(strapi: StrapiClient, table: StrapiTable, column: string, values: number[]): Promise<RawRow[]> {
  const rows: RawRow[] = []
  const unique = [...new Set(values)]
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    rows.push(...(await readAll(strapi, table, { [column]: { in: unique.slice(i, i + IN_CHUNK) } })))
  }
  return rows
}

const ids = (rows: RawRow[], column: string) =>
  rows.map((r) => r[column]).filter((v): v is number => typeof v === "number")

export interface ExtractOptions {
  /** `document_id` de bloques: solo se leen esos bloques y sus unidades. */
  sampleBlocks?: string[]
  /** Pausa entre lotes en ms (por defecto 50). */
  pauseMs?: number
  log?: (message: string) => void
}

export async function extract(options: ExtractOptions = {}): Promise<Snapshot> {
  const log = options.log ?? (() => {})
  const sample = options.sampleBlocks ?? []
  const mode = sample.length > 0 ? "sample" : "full"
  pauseMs = options.pauseMs ?? PAUSE_MS
  const startedAt = new Date().toISOString()
  const tables = emptyTables()
  const strapi = createStrapiClient()

  try {
    for (const table of STRAPI_TABLES) {
      if (mode === "sample" && UNIT_SCALE_TABLES.includes(table)) continue
      tables[table] = await readAll(strapi, table)
      log(`  ${table.padEnd(52)} ${String(tables[table].length).padStart(8)}`)
    }

    if (mode === "sample") {
      tables.blocks = tables.blocks.filter((b) => sample.includes(String(b.document_id)))
      const found = new Set(tables.blocks.map((b) => String(b.document_id)))
      const missing = sample.filter((d) => !found.has(d))
      if (missing.length > 0) throw new Error(`No existen en Strapi los bloques: ${missing.join(", ")}`)

      tables.units_block_lnk = await readIn(strapi, "units_block_lnk", "block_id", ids(tables.blocks, "id"))
      const unitIds = ids(tables.units_block_lnk, "unit_id")
      tables.units = await readIn(strapi, "units", "id", unitIds)
      tables.units_unit_usage_lnk = await readIn(strapi, "units_unit_usage_lnk", "unit_id", unitIds)
      tables.units_topography_lnk = await readIn(strapi, "units_topography_lnk", "unit_id", unitIds)
      tables.units_parking_type_lnk = await readIn(strapi, "units_parking_type_lnk", "unit_id", unitIds)
      tables.units_cmps = await readIn(strapi, "units_cmps", "entity_id", unitIds)
      const cmpIds = (type: string) => ids(tables.units_cmps.filter((c) => c.component_type === type), "cmp_id")
      tables.components_unit_types_housings = await readIn(strapi, "components_unit_types_housings", "id", cmpIds("unit-types.housing"))
      tables.components_unit_types_offices = await readIn(strapi, "components_unit_types_offices", "id", cmpIds("unit-types.offices"))
      tables.components_unit_types_industrials = await readIn(strapi, "components_unit_types_industrials", "id", cmpIds("unit-types.industrial"))
      for (const table of UNIT_SCALE_TABLES) log(`  ${table.padEnd(52)} ${String(tables[table].length).padStart(8)}  (muestra)`)
    }
  } finally {
    await strapi.$disconnect()
  }

  const finishedAt = new Date().toISOString()
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-")
  return {
    meta: {
      name: `${stamp}-${mode}`,
      mode,
      sampleBlocks: sample,
      startedAt,
      finishedAt,
      counts: Object.fromEntries(STRAPI_TABLES.map((t) => [t, tables[t].length])),
    },
    tables,
  }
}
