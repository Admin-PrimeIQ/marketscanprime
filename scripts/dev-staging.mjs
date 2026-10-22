/**
 * `pnpm dev:staging`: corre `next dev` con el backend `prisma` contra el Postgres nuevo, sin el
 * `.env` de producción.
 *
 * Next carga `.env*` por su cuenta y no hay opción para apagarlo. Este lanzador:
 *   1. Lee solo `.env.staging.local` si existe; si no, el `.env` único (plantilla en
 *      `.env.staging.example`). En los dos casos se niega si trae credenciales de Strapi o de sync
 *      sin comentar.
 *   2. Define vacía cada variable que aparece en los `.env` que Next cargaría y que staging no
 *      redefine: Next nunca pisa una variable que ya existe, ni siquiera al recargar en caliente.
 *   3. Marca el entorno como ya procesado (`__NEXT_PROCESSED_ENV`), así Next no lee ningún `.env`.
 * Los valores nunca se imprimen.
 */

import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { parseEnv } from "node:util"

const root = process.cwd()
const STAGING_FILE = existsSync(resolve(root, ".env.staging.local")) ? ".env.staging.local" : ".env"
const NEXT_ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"]
// Credenciales de producción que ninguna corrida paralela puede llevar.
const FORBIDDEN = ["STRAPI_USERNAME", "STRAPI_PASSWORD", "SYNC_API_KEY", "SYNC_API_URL", "NEXT_PUBLIC_STRAPI_URL", "STRAPI_URL"]

function fail(message) {
  console.error(`dev:staging: ${message}`)
  process.exit(1)
}

function readEnvFile(file) {
  return parseEnv(readFileSync(resolve(root, file), "utf8"))
}

if (!existsSync(resolve(root, STAGING_FILE))) {
  fail(`falta ${STAGING_FILE}. Copia .env.staging.example como .env y completa DATABASE_URL_APP.`)
}

const staging = readEnvFile(STAGING_FILE)
if (!staging.DATABASE_URL_APP?.trim()) fail(`${STAGING_FILE} no define DATABASE_URL_APP.`)
const forbidden = FORBIDDEN.filter((key) => staging[key]?.trim())
if (forbidden.length > 0) fail(`${STAGING_FILE} no puede definir ${forbidden.join(", ")}.`)

const neutralized = {}
for (const file of NEXT_ENV_FILES) {
  if (!existsSync(resolve(root, file))) continue
  for (const key of Object.keys(readEnvFile(file))) {
    if (!(key in staging)) neutralized[key] = ""
  }
}

const env = {
  ...process.env,
  ...neutralized,
  ...staging,
  NEXT_PUBLIC_DATA_BACKEND: "prisma",
  NEXT_PUBLIC_STRAPI_URL: "",
  __NEXT_PROCESSED_ENV: "true",
}

console.log(
  `dev:staging: backend prisma (msp_app), variables de ${STAGING_FILE}: ${Object.keys(staging).length}, ` +
    `del .env ignoradas: ${Object.keys(neutralized).length}.`,
)

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next")
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], { stdio: "inherit", env })
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
