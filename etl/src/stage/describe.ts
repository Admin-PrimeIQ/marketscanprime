import pg from "pg"
import { stageClientConfig } from "./connection"

/**
 * Describe las tablas de un esquema del Postgres de staging (solo catálogo, SOLO LECTURA):
 * columnas con tipo y nulabilidad, llaves primarias, únicas y foráneas, índices y filas aproximadas.
 *
 *   npm run stage:describe                     → dbo_stage
 *   npm run stage:describe -- --schema dbo     → otro esquema
 *   npm run stage:describe -- --values         → además, valores frecuentes de dbo_stage.sec_*
 *
 * Lee de pg_catalog y no de information_schema: este último oculta las tablas sobre las que el
 * usuario no tiene permisos, y el catálogo muestra la estructura igual.
 */

const DEFAULT_SCHEMA = "dbo_stage"

const SAMPLE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["sec_universe", "tipo"],
  ["sec_universe", "periodo"],
  ["sec_universe", "mercado"],
  ["sec_universe", "status"],
  ["sec_universe", "fuente_origen"],
  ["sec_universe", "departamento"],
  ["sec_unit", "categoria_general"],
  ["sec_unit", "subcategoria"],
  ["sec_unit", "uso"],
  ["sec_unit", "fuente"],
  ["sec_unit", "exclusivo_compartido"],
]

function schemaArg(): string {
  const index = process.argv.indexOf("--schema")
  const schema = index === -1 ? DEFAULT_SCHEMA : process.argv[index + 1]
  if (!schema || !/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("--schema necesita un nombre de esquema válido")
  return schema
}

async function main() {
  const schema = schemaArg()
  const client = new pg.Client(stageClientConfig())
  await client.connect()
  try {
    // Las estadísticas de actividad son visibles sin permisos sobre la tabla: dicen si tiene filas
    // y si se escribe en ella, sin leer datos.
    const { rows: tables } = await client.query<{
      table: string
      readable: boolean
      live: string | null
      inserted: string | null
      changed: string | null
      analyzed: Date | null
    }>(
      `SELECT c.relname AS table,
              has_schema_privilege(n.oid, 'USAGE') AND has_table_privilege(c.oid, 'SELECT') AS readable,
              s.n_live_tup AS live, s.n_tup_ins AS inserted, s.n_tup_upd + s.n_tup_del AS changed,
              greatest(s.last_analyze, s.last_autoanalyze) AS analyzed
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
        WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm')
        ORDER BY 1`,
      [schema],
    )
    if (tables.length === 0) console.log(`El esquema ${schema} no tiene tablas (o no existe).`)

    const { rows: columns } = await client.query<{
      table: string
      column: string
      type: string
      notnull: boolean
      default: string | null
      identity: string
    }>(
      `SELECT c.relname AS table, a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type,
              a.attnotnull AS notnull, pg_get_expr(d.adbin, d.adrelid) AS default, a.attidentity AS identity
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm') AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum`,
      [schema],
    )
    const { rows: constraints } = await client.query<{ table: string; definition: string }>(
      `SELECT cl.relname AS table, con.conname || ': ' || pg_get_constraintdef(con.oid) AS definition
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = $1 AND con.contype IN ('p', 'u', 'f')
        ORDER BY 1, 2`,
      [schema],
    )
    const { rows: indexes } = await client.query<{ table: string; definition: string }>(
      `SELECT tablename AS table, indexdef AS definition FROM pg_indexes WHERE schemaname = $1 ORDER BY 1, 2`,
      [schema],
    )

    for (const { table, readable, live, inserted, changed, analyzed } of tables) {
      const stats = `vivas≈${live ?? "?"} insertadas=${inserted ?? "?"} upd+del=${changed ?? "?"} analyze=${analyzed?.toISOString() ?? "nunca"}`
      console.log(`\n=== ${schema}.${table}  (${stats})${readable ? "" : "  sin permiso de lectura"}`)
      for (const c of columns.filter((col) => col.table === table)) {
        const identity = c.identity === "a" ? "IDENTITY ALWAYS" : c.identity === "d" ? "IDENTITY BY DEFAULT" : ""
        const extra = [c.notnull ? "NOT NULL" : "", c.default ? `DEFAULT ${c.default}` : "", identity].filter(Boolean).join(" ")
        console.log(`  ${c.column.padEnd(42)} ${c.type.padEnd(28)} ${extra}`)
      }
      for (const k of constraints.filter((con) => con.table === table)) console.log(`  · ${k.definition}`)
      for (const i of indexes.filter((idx) => idx.table === table)) console.log(`  · ${i.definition}`)
    }

    if (process.argv.includes("--values") && schema === DEFAULT_SCHEMA) {
      console.log("\n=== Valores más frecuentes (columnas categóricas)")
      for (const [table, column] of SAMPLE_COLUMNS) {
        const { rows } = await client.query<{ value: string | null; n: string }>(
          `SELECT ${column}::text AS value, count(*) AS n FROM ${schema}.${table} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
        )
        console.log(`  ${table}.${column}: ${rows.map((r) => `${r.value ?? "NULL"} (${r.n})`).join(" · ")}`)
      }
      const { rows: range } = await client.query(
        `SELECT min(cod_proyecto) AS min, max(cod_proyecto) AS max, min(fecha_recoleccion) AS desde, max(fecha_recoleccion) AS hasta
           FROM ${schema}.sec_unit`,
      )
      console.log(`  sec_unit cod_proyecto/fecha_recoleccion: ${JSON.stringify(range[0])}`)
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error("Falló:", (error as Error).message)
  process.exitCode = 1
})
