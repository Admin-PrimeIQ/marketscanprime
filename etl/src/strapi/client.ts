import { config } from "dotenv"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../../generated/strapi/client"

// Las variables viven en el .env de la raíz del repo; los scripts se corren desde etl/.
config({ path: "../.env", quiet: true })

/**
 * Cliente de la base MySQL de Strapi. Debe conectarse con un usuario de SOLO LECTURA:
 * este paquete nunca escribe en `strapi` (ni migrate, ni db push, ni create/update/delete).
 */
export function createStrapiClient(): PrismaClient {
  const url = process.env.STRAPI_DATABASE_URL
  if (!url) {
    throw new Error("Falta STRAPI_DATABASE_URL en el .env de la raíz (mysql://usuario:clave@host:3306/strapi).")
  }
  return new PrismaClient({ adapter: new PrismaMariaDb(url) })
}
