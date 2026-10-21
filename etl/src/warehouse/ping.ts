import { createConnection } from "mariadb"
import { connectionOnly, pingReadOnly, runPing } from "../db/read-only-ping"
import { WAREHOUSE_TABLES } from "../db/warehouse-tables"
import { warehousePoolConfig } from "./connection"

const WAREHOUSE_DATABASES = ["dbo_stage", "dbo"]

function placeholders(values: unknown[]): string {
  return values.map(() => "?").join(", ")
}

async function main(): Promise<boolean> {
  const config = connectionOnly(warehousePoolConfig())
  if (!(await pingReadOnly(config, { table: "dbo_stage.housing_universe" }))) return false

  const conn = await createConnection(config)
  try {
    const databases: string[] = (await conn.query("SHOW DATABASES")).map(
      (row: Record<string, string>) => Object.values(row)[0],
    )
    console.log(`\nbases visibles: ${databases.join(", ") || "ninguna"}`)

    // information_schema solo lista las tablas sobre las que el usuario tiene algún permiso.
    // TABLE_ROWS es la estimación de InnoDB, no un conteo.
    const tables: { db: string; name: string; estimate: bigint | number | null }[] = await conn.query(
      `SELECT TABLE_SCHEMA AS db, TABLE_NAME AS name, TABLE_ROWS AS estimate
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA IN (${placeholders(WAREHOUSE_DATABASES)})
          AND TABLE_NAME IN (${placeholders(WAREHOUSE_TABLES)})
        ORDER BY 1, 2`,
      [...WAREHOUSE_DATABASES, ...WAREHOUSE_TABLES],
    )
    for (const db of WAREHOUSE_DATABASES) {
      const visible = tables.filter((t) => t.db === db)
      console.log(`\n${db}: ${visible.length} de ${WAREHOUSE_TABLES.length} tablas del push visibles`)
      for (const t of visible) console.log(`  ${t.name.padEnd(22)} ≈${Number(t.estimate ?? 0).toLocaleString("en-US")} filas`)
      const seen = new Set(visible.map((t) => t.name))
      const missing = WAREHOUSE_TABLES.filter((name) => !seen.has(name))
      if (missing.length > 0) console.log(`  no visibles (no existen o sin permiso): ${missing.join(", ")}`)
    }
    return true
  } finally {
    await conn.end()
  }
}

runPing(main)
