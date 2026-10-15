import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../../generated/strapi/client"
import { strapiPoolConfig } from "./connection"

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "$executeRaw",
  "$executeRawUnsafe",
])

/**
 * Cliente de la base MySQL de Strapi. Debe conectarse con un usuario de SOLO LECTURA:
 * este paquete nunca escribe en `strapi` (ni migrate, ni db push, ni create/update/delete).
 * Además del permiso en la base, el cliente rechaza cualquier operación de escritura.
 */
export function createStrapiClient() {
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(strapiPoolConfig()) })
  return prisma.$extends({
    name: "solo-lectura",
    query: {
      async $allOperations({ operation, args, query }) {
        if (WRITE_OPERATIONS.has(operation)) {
          throw new Error(`Operación de escritura bloqueada contra la base strapi: ${operation}`)
        }
        return query(args)
      },
    },
  })
}
