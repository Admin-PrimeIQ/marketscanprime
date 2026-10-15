import { defineConfig } from "prisma/config"
import { strapiDatabaseUrl } from "./src/strapi/connection"

// Solo db pull necesita conexión; validate y generate funcionan sin ella.
function urlIfConfigured(): string | undefined {
  return process.env.DATABASE_HOST_STRAPI ? strapiDatabaseUrl() : undefined
}

export default defineConfig({
  schema: "prisma/strapi/schema.prisma",
  datasource: { url: urlIfConfigured() },
})
