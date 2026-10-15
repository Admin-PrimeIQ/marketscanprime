import { createConnection, type ConnectionConfig } from "mariadb"

/**
 * Prueba de conexión de SOLO LECTURA contra una base de producción.
 *
 * Se niega a seguir si el usuario tiene algún privilegio distinto de SELECT: con ese usuario
 * el ETL no debe correr. Solo hace consultas de metadatos y un conteo pequeño.
 */

const ALLOWED_PRIVILEGES = new Set(["SELECT", "USAGE", "SHOW VIEW"])

function privilegesOf(grant: string): string[] {
  const match = /^GRANT (.+?) ON /i.exec(grant)
  // Sin «ON» es la asignación de un rol (p. ej. rds_superuser_role): no se puede asumir que sea de lectura.
  if (!match) return [`ROL (${grant.replace(/^GRANT /i, "").split(" TO ")[0]})`]
  return match[1].split(",").map((privilege) => privilege.trim().toUpperCase())
}

export interface PingSample {
  table: string
  /** Conteo del manual, solo de referencia. */
  expected: number
}

export async function pingReadOnly(connectionConfig: ConnectionConfig, sample: PingSample): Promise<boolean> {
  const started = Date.now()
  // Conexión directa y no pool: el pool reintenta y tapa errores como «Access denied» con un timeout.
  const conn = await createConnection(connectionConfig)
  try {
    const [identity] = await conn.query("SELECT CURRENT_USER() AS user, VERSION() AS version, DATABASE() AS db")
    const [ssl] = await conn.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'")
    console.log(`conectado en ${Date.now() - started} ms`)
    console.log(`  usuario: ${identity.user}`)
    console.log(`  base:    ${identity.db} (MySQL ${identity.version})`)
    console.log(`  SSL:     ${ssl?.Value || "SIN CIFRADO"}`)

    const grants: string[] = (await conn.query("SHOW GRANTS FOR CURRENT_USER()")).map(
      (row: Record<string, string>) => Object.values(row)[0],
    )
    const forbidden = grants.flatMap(privilegesOf).filter((privilege) => !ALLOWED_PRIVILEGES.has(privilege))
    console.log("\npermisos:")
    for (const grant of grants) console.log(`  ${grant.replace(/IDENTIFIED BY .*/i, "")}`)

    if (forbidden.length > 0) {
      console.error(`\nALTO: el usuario tiene privilegios de escritura o administración (${[...new Set(forbidden)].join(", ")}).`)
      console.error("No uses este usuario para el ETL. Pide uno con solo SELECT.")
      return false
    }

    try {
      const [row] = await conn.query(`SELECT COUNT(*) AS n FROM \`${sample.table}\``)
      console.log(`\nprueba de lectura: ${sample.table} = ${Number(row.n)} filas (manual: ${sample.expected.toLocaleString("en-US")})`)
    } catch (error) {
      console.log(`\nprueba de lectura: no se pudo contar ${sample.table} (${(error as Error).message.split("\n")[0]})`)
    }
    console.log("\nOK: conexión de solo lectura verificada.")
    return true
  } finally {
    await conn.end()
  }
}

/** Quita las opciones del pool que createConnection no acepta. */
export function connectionOnly<T extends { connectionLimit?: number; minimumIdle?: number }>(config: T) {
  const { connectionLimit, minimumIdle, ...rest } = config
  return rest
}

export function runPing(task: () => Promise<boolean>) {
  task()
    .then((ok) => {
      if (!ok) process.exitCode = 1
    })
    .catch((error) => {
      console.error("Falló la conexión:", (error as Error).message)
      process.exitCode = 1
    })
}
