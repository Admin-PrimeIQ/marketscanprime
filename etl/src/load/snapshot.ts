import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createInterface } from "node:readline"
import { finished } from "node:stream/promises"
import { ETL_ROOT } from "../db/env"

/**
 * Foto de las 52 tablas de Strapi tal como se leyeron, en NDJSON (una fila por línea).
 * Contiene datos reales: vive en `etl/.snapshots/`, ignorada por git. Permite repetir la validación
 * o la verificación sin volver a leer el RDS de producción.
 */

export const SNAPSHOTS_DIR = resolve(ETL_ROOT, ".snapshots")

/** Colecciones con `document_id` y `published_at` (draft & publish de Strapi v5). */
export const COLLECTIONS = [
  "amenities",
  "services",
  "countries",
  "developers",
  "nses",
  "security_types",
  "block_categories",
  "block_focuses",
  "block_statuses",
  "unit_parking_types",
  "unit_topographies",
  "unit_usages",
  "exchange_rate_profiles",
  "projects",
  "blocks",
  "units",
  "up_roles",
  "up_users",
] as const

export const STRAPI_TABLES = [
  ...COLLECTIONS,
  "exchange_rate_profiles_cmps",
  "components_currencies_currencies",
  "components_currencies_currencies_cmps",
  "components_currencies_currency_quetzals",
  "components_currencies_currency_peso_mexicanos",
  "components_currencies_currency_balboas",
  "components_currencies_currency_belizes",
  "components_currencies_currency_colon_costarricenses",
  "components_currencies_currency_cordobas",
  "components_currencies_currency_lempiras",
  "projects_amenities_lnk",
  "projects_country_lnk",
  "projects_developer_lnk",
  "projects_exchange_rate_profile_lnk",
  "projects_nse_lnk",
  "projects_security_type_lnk",
  "services_projects_lnk",
  "blocks_project_lnk",
  "blocks_block_category_lnk",
  "blocks_block_focus_lnk",
  "blocks_block_status_lnk",
  "blocks_cmps",
  "components_financing_financings",
  "components_financing_financings_cmps",
  "components_financing_bank_rates",
  "units_block_lnk",
  "units_unit_usage_lnk",
  "units_topography_lnk",
  "units_parking_type_lnk",
  "units_cmps",
  "components_unit_types_housings",
  "components_unit_types_offices",
  "components_unit_types_industrials",
  "up_users_role_lnk",
] as const

export type Collection = (typeof COLLECTIONS)[number]
export type StrapiTable = (typeof STRAPI_TABLES)[number]

/** Tablas del tamaño de las unidades (~240 mil filas): en modo muestra solo se leen las del bloque. */
export const UNIT_SCALE_TABLES: readonly StrapiTable[] = [
  "units",
  "units_block_lnk",
  "units_unit_usage_lnk",
  "units_topography_lnk",
  "units_parking_type_lnk",
  "units_cmps",
  "components_unit_types_housings",
  "components_unit_types_offices",
  "components_unit_types_industrials",
]

export type RawRow = Record<string, string | number | boolean | null>

export interface SnapshotMeta {
  name: string
  mode: "full" | "sample"
  /** `document_id` de los bloques de la muestra. */
  sampleBlocks: string[]
  startedAt: string
  finishedAt: string
  counts: Partial<Record<StrapiTable, number>>
}

export interface Snapshot {
  meta: SnapshotMeta
  tables: Record<StrapiTable, RawRow[]>
}

export function emptyTables(): Record<StrapiTable, RawRow[]> {
  return Object.fromEntries(STRAPI_TABLES.map((t) => [t, []])) as unknown as Record<StrapiTable, RawRow[]>
}

export async function writeSnapshot(snapshot: Snapshot): Promise<string> {
  const dir = resolve(SNAPSHOTS_DIR, snapshot.meta.name)
  mkdirSync(dir, { recursive: true })
  for (const table of STRAPI_TABLES) {
    const out = createWriteStream(resolve(dir, `${table}.ndjson`))
    for (const row of snapshot.tables[table]) {
      if (!out.write(`${JSON.stringify(row)}\n`)) await new Promise<void>((ok) => out.once("drain", () => ok()))
    }
    out.end()
    await finished(out)
  }
  writeFileSync(resolve(dir, "meta.json"), JSON.stringify(snapshot.meta, null, 2))
  return dir
}

export async function readSnapshot(name: string): Promise<Snapshot> {
  const dir = resolve(SNAPSHOTS_DIR, name)
  const metaFile = resolve(dir, "meta.json")
  if (!existsSync(metaFile)) throw new Error(`No existe el snapshot ${dir} (falta meta.json).`)
  const meta = JSON.parse(readFileSync(metaFile, "utf8")) as SnapshotMeta
  const tables = emptyTables()
  for (const table of STRAPI_TABLES) {
    const file = resolve(dir, `${table}.ndjson`)
    if (!existsSync(file)) throw new Error(`Snapshot incompleto: falta ${table}.ndjson`)
    const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity })
    for await (const line of lines) if (line) tables[table].push(JSON.parse(line) as RawRow)
  }
  return { meta, tables }
}
