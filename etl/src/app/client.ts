import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../generated/app/client"
import { APP_SCHEMA, appPoolConfig } from "./connection"

/** Cliente de escritura del esquema `msp_app` (destino de la carga de la Fase 3). */
export function createAppClient() {
  return new PrismaClient({ adapter: new PrismaPg(appPoolConfig(), { schema: APP_SCHEMA }) })
}
