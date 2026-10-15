import { createAppClient } from "./client"

/** Prueba de conexión al esquema `msp_app`: esquema de la sesión y filas por tabla. Solo lee. */
async function main() {
  const app = createAppClient()
  try {
    const [session] = await app.$queryRaw<{ user: string; schema: string }[]>`
      SELECT current_user AS "user", current_schema() AS "schema"`
    console.log(`usuario: ${session.user} | esquema de la sesión: ${session.schema}`)

    const counts = {
      country: await app.country.count(),
      project: await app.project.count(),
      block: await app.block.count(),
      unit: await app.unit.count(),
      user: await app.user.count(),
      sync_run: await app.syncRun.count(),
    }
    for (const [table, rows] of Object.entries(counts)) console.log(`  ${table.padEnd(10)} ${rows}`)
  } finally {
    await app.$disconnect()
  }
}

main().catch((error) => {
  console.error("Falló la conexión:", (error as Error).message)
  process.exitCode = 1
})
