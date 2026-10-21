import pg from "pg"
import { WAREHOUSE_TABLES } from "../db/warehouse-tables"
import { stageClientConfig } from "./connection"

/**
 * Prueba de conexión de SOLO LECTURA contra `DATABASE_URL_DBO_STAGE` (Postgres).
 *
 * Solo consulta el catálogo del sistema: quién es el usuario, qué puede hacer y qué esquemas y
 * tablas hay. Sirve para saber, antes de leer datos, si la base es el `dbo` de producción
 * (compartido con otros proyectos) o una base propia de la migración.
 */
async function main() {
  const client = new pg.Client(stageClientConfig())
  const started = Date.now()
  await client.connect()
  try {
    const { rows: [who] } = await client.query(
      "SELECT current_user AS user, current_database() AS db, current_setting('server_version') AS version, current_setting('default_transaction_read_only') AS read_only",
    )
    const { rows: [ssl] } = await client.query("SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()")
    console.log(`conectado en ${Date.now() - started} ms`)
    console.log(`  usuario:  ${who.user}`)
    console.log(`  base:     ${who.db} (Postgres ${who.version})`)
    console.log(`  SSL:      ${ssl?.ssl ? ssl.version : "SIN CIFRADO"}`)
    console.log(`  sesión de solo lectura: ${who.read_only}`)

    const { rows: [role] } = await client.query(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
              has_database_privilege(current_database(), 'CREATE') AS create_schema
         FROM pg_roles WHERE rolname = current_user`,
    )
    console.log("\natributos del usuario:")
    console.log(`  superusuario: ${role.rolsuper} | crear bases: ${role.rolcreatedb} | crear roles: ${role.rolcreaterole}`)
    console.log(`  replicación: ${role.rolreplication} | ignora RLS: ${role.rolbypassrls} | crear esquemas: ${role.create_schema}`)

    const { rows: schemas } = await client.query(
      `SELECT n.nspname AS schema,
              pg_get_userbyid(n.nspowner) AS owner,
              has_schema_privilege(n.oid, 'USAGE') AS usage,
              has_schema_privilege(n.oid, 'CREATE') AS can_create,
              count(c.oid) FILTER (WHERE c.relkind IN ('r', 'p')) AS tables,
              count(c.oid) FILTER (WHERE c.relkind IN ('r', 'p') AND has_table_privilege(c.oid, 'SELECT')) AS readable,
              count(c.oid) FILTER (WHERE c.relkind IN ('r', 'p') AND (
                has_table_privilege(c.oid, 'INSERT') OR has_table_privilege(c.oid, 'UPDATE') OR
                has_table_privilege(c.oid, 'DELETE') OR has_table_privilege(c.oid, 'TRUNCATE'))) AS writable
         FROM pg_namespace n
         LEFT JOIN pg_class c ON c.relnamespace = n.oid
        WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'
        GROUP BY n.oid, n.nspname, n.nspowner
        ORDER BY n.nspname`,
    )
    console.log("\nesquemas:")
    console.log(`  ${"esquema".padEnd(24)} ${"dueño".padEnd(18)} uso   crear  tablas  lectura  escritura`)
    for (const s of schemas) {
      console.log(
        `  ${s.schema.padEnd(24)} ${String(s.owner).padEnd(18)} ${String(s.usage).padEnd(5)} ${String(s.can_create).padEnd(6)} ${String(s.tables).padStart(6)}  ${String(s.readable).padStart(7)}  ${String(s.writable).padStart(9)}`,
      )
    }

    // pg_class y no information_schema: este último oculta las tablas sin permisos del usuario.
    const { rows: warehouse } = await client.query<{ schema: string; table: string; readable: boolean }>(
      `SELECT n.nspname AS schema, c.relname AS table,
              has_schema_privilege(n.oid, 'USAGE') AND has_table_privilege(c.oid, 'SELECT') AS readable
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v') AND c.relname = ANY($1)
        ORDER BY 1, 2`,
      [WAREHOUSE_TABLES],
    )
    console.log(`\ntablas del push al warehouse (${WAREHOUSE_TABLES.length} esperadas):`)
    if (warehouse.length === 0) console.log("  ninguna")
    for (const t of warehouse) console.log(`  ${t.schema}.${t.table}${t.readable ? "" : "  (sin permiso de lectura)"}`)
    const found = new Set(warehouse.map((t) => t.table))
    const missing = WAREHOUSE_TABLES.filter((t) => !found.has(t))
    if (missing.length > 0) console.log(`  faltan: ${missing.join(", ")}`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error("Falló la conexión:", (error as Error).message)
  process.exitCode = 1
})
