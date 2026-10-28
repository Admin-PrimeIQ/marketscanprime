import "server-only"

import { PrismaPg } from "@prisma/adapter-pg"
import { attachDatabasePool } from "@vercel/functions"
import { Pool } from "pg"
import { PrismaClient } from "./generated/client"
import { APP_SCHEMA, appPoolConfig } from "./connection"

// Una sola instancia por proceso: el recargado en caliente de `next dev` reevalúa los módulos.
const globalForPrisma = globalThis as unknown as { mspAppPrisma?: PrismaClient }

/** Cliente Prisma del esquema `msp_app`. Se crea en la primera consulta, no al importar. */
export function getAppPrisma(): PrismaClient {
  if (!globalForPrisma.mspAppPrisma) {
    const pool = new Pool(appPoolConfig())
    // Fuera de Vercel no hace nada; en Vercel cierra las conexiones inactivas antes de congelar la función.
    attachDatabasePool(pool)
    globalForPrisma.mspAppPrisma = new PrismaClient({
      adapter: new PrismaPg(pool, {
        schema: APP_SCHEMA,
        onPoolError: (error) => console.error("[db] Conexión inactiva cerrada por el servidor:", error.message),
      }),
    })
  }
  return globalForPrisma.mspAppPrisma
}
