import { defineConfig } from "prisma/config"
import { appDatabaseUrl } from "./src/app/connection"

// Esquema de la app nueva (raíz del repo). validate, generate y diff --from-empty no se conectan;
// los comandos con conexión van por `npm run app:*`, que abre el proxy de src/app/prisma-cli.ts.
export default defineConfig({
  schema: "../prisma/schema.prisma",
  migrations: { path: "../prisma/migrations" },
  datasource: { url: appDatabaseUrl() },
})
