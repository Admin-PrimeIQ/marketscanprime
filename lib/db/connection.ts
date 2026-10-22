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
 * Railway emite el certificado del servidor para `localhost` con una raíz propia: la cadena se
 * valida contra esa raíz fijada y solo se omite la comprobación del nombre de host. La raíz llega
 * como PEM en `DATABASE_CA_APP` (entornos sin disco, como Vercel) o como archivo.
 */
function appSsl(env: Env): ConnectionOptions {
  let ca = env.DATABASE_CA_APP?.trim()
  if (!ca) {
    const file = resolve(process.cwd(), env.DATABASE_CA_FILE_APP?.trim() || DEFAULT_CA_FILE)
    if (!existsSync(file)) {
      throw new Error(`Falta la raíz del certificado (${file}). Obtenla con "npm run stage:cert" en etl/ o define DATABASE_CA_APP.`)
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
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  }
}
