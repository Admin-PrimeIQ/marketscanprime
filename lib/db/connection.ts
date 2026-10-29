import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ConnectionOptions } from "node:tls"
import type { PoolConfig } from "pg"

/**
 * Conexión de la app Next.js al esquema `msp_app` del Postgres nuevo (Railway).
 *
 * Solo lee `DATABASE_URL_APP`: a diferencia del ETL, no cae a `DATABASE_URL_DBO_STAGE`, para que la
 * app nunca herede por accidente otra base. Queda fijada a `msp_app` por el `search_path` de la
 * sesión y por el `schema` del adaptador (`lib/db/client.ts`).
 */
export const APP_SCHEMA = "msp_app"

// Mismo tope que el ETL: el servidor de Railway también aloja el `dbo` de producción.
export const APP_MAX_CONNECTIONS = 2

// El límite de conexiones es del rol (`j_stage_admin`) y lo comparten `next dev`, cada instancia de
// Vercel y el ETL: una conexión inactiva se devuelve pronto. En Vercel, `attachDatabasePool`
// (`lib/db/client.ts`) mantiene viva la función ese tiempo para que el cierre ocurra antes de congelarla.
export const APP_IDLE_TIMEOUT_MS = 5_000

const DEFAULT_CA_FILE = "etl/certs/dbo-stage-ca.pem"

type Env = Record<string, string | undefined>

function appUrl(env: Env): URL {
  const raw = env.DATABASE_URL_APP?.trim()
  if (!raw) {
    throw new Error("Falta DATABASE_URL_APP (postgresql://usuario:clave@host:puerto/base). Ver .env.staging.example.")
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    // El mensaje no incluye la URL: lleva la contraseña.
    throw new Error("DATABASE_URL_APP no es una URL válida. En la contraseña, codifica % como %25 y luego # como %23.")
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new Error(`DATABASE_URL_APP debe ser postgresql://…, no ${url.protocol}//…`)
  }
  return url
}

/**
 * `DATABASE_CA_APP` tal como suele quedar al pegarlo en un panel: PEM con saltos de línea, PEM con
 * `\n` literales o el PEM entero en base64 (una sola línea).
 */
export function normalizeCaPem(raw: string): string {
  const value = raw.trim().replace(/^["']|["']$/g, "")
  if (value.includes("-----BEGIN")) return value.replace(/\\n/g, "\n")
  const decoded = Buffer.from(value, "base64").toString("utf8")
  if (decoded.includes("-----BEGIN CERTIFICATE-----")) return decoded
  throw new Error("DATABASE_CA_APP no es un certificado PEM (ni en texto ni en base64).")
}

/**
 * Railway emite el certificado del servidor para `localhost` con una raíz propia: la cadena se
 * valida contra esa raíz fijada y solo se omite la comprobación del nombre de host. La raíz llega
 * en `DATABASE_CA_APP` (entornos sin disco, como Vercel; ver `normalizeCaPem`) o como archivo.
 */
function appSsl(env: Env): ConnectionOptions {
  const fromEnv = env.DATABASE_CA_APP?.trim()
  let ca = fromEnv ? normalizeCaPem(fromEnv) : undefined
  if (!ca) {
    // El .pem llega al bundle por `outputFileTracingIncludes` (next.config.mjs); sin el ignore,
    // Turbopack rastrearía el proyecto entero.
    const file = resolve(/*turbopackIgnore: true*/ process.cwd(), env.DATABASE_CA_FILE_APP?.trim() || DEFAULT_CA_FILE)
    if (!existsSync(file)) {
      const where = env.VERCEL_ENV ? ` (entorno de Vercel: ${env.VERCEL_ENV})` : ""
      throw new Error(
        `Falta la raíz del certificado: DATABASE_CA_APP no está definida en este despliegue${where} y no existe ${file}. ` +
          `Define DATABASE_CA_APP o, en local, corre "npm run stage:cert" en etl/.`,
      )
    }
    ca = readFileSync(file, "utf8")
  }
  return { ca, rejectUnauthorized: true, checkServerIdentity: () => undefined }
}

export function appPoolConfig(env: Env = process.env): PoolConfig {
  const url = appUrl(env)
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: appSsl(env),
    options: `-c search_path=${APP_SCHEMA}`,
    application_name: "msp-app-next",
    max: APP_MAX_CONNECTIONS,
    idleTimeoutMillis: APP_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  }
}
