import { config } from "dotenv"
import { defineConfig } from "prisma/config"

// Las variables viven en el .env de la raíz del repo; los scripts se corren desde etl/.
config({ path: "../.env", quiet: true })

export default defineConfig({
  schema: "prisma/strapi/schema.prisma",
  // Solo db pull la necesita; validate y generate funcionan sin conexión.
  datasource: { url: process.env.STRAPI_DATABASE_URL },
})
