import "server-only"

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "./generated/client"
import { APP_SCHEMA, appPoolConfig } from "./connection"

// Una sola instancia por proceso: el recargado en caliente de `next dev` reevalúa los módulos.
const globalForPrisma = globalThis as unknown as { mspAppPrisma?: PrismaClient }

/** Cliente Prisma del esquema `msp_app`. Se crea en la primera consulta, no al importar. */
export function getAppPrisma(): PrismaClient {
  globalForPrisma.mspAppPrisma ??= new PrismaClient({
    adapter: new PrismaPg(appPoolConfig(), { schema: APP_SCHEMA }),
  })
  return globalForPrisma.mspAppPrisma
}
