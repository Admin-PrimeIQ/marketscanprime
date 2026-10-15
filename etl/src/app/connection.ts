import type { PoolConfig } from "pg"
import { MAX_CONNECTIONS } from "../db/env"
import { STAGE_CA_FILE, stageSsl, stageUrl } from "../stage/connection"

/**
 * Conexión de ESCRITURA al esquema de la app nueva (`msp_app`) en el Postgres de Railway.
 *
 * Es el mismo servidor y la misma base (`railway`) que `dbo_stage`, por eso queda fijada a
 * `msp_app` por tres lados: el `search_path` de la sesión, el `schema` del adaptador de Prisma y
 * el parámetro `schema` de la URL del CLI. La conexión a `dbo_stage` sigue siendo de solo lectura
 * (`src/stage/connection.ts`).
 */
export const APP_SCHEMA = "msp_app"

/** `DATABASE_URL_APP` si existe; si no, las credenciales de `DATABASE_URL_DBO_STAGE`. */
function appUrl(): URL {
  const raw = process.env.DATABASE_URL_APP?.trim()
  if (!raw) return stageUrl()
  try {
    return new URL(raw)
  } catch {
    // El mensaje no incluye la URL: lleva la contraseña.
    throw new Error("DATABASE_URL_APP no es una URL válida. En la contraseña, codifica % como %25 y luego # como %23.")
  }
}

export function appPoolConfig(): PoolConfig {
  const url = appUrl()
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: stageSsl(),
    options: `-c search_path=${APP_SCHEMA}`,
    application_name: "msp-etl-app",
    max: MAX_CONNECTIONS,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
  }
}

/** Puerto del proxy local que abre `src/app/prisma-cli.ts` para el CLI de Prisma. */
export const APP_TUNNEL_PORT_ENV = "MSP_APP_TUNNEL_PORT"

export function appUpstream(): { host: string; port: number } {
  const url = appUrl()
  return { host: url.hostname, port: Number(url.port || 5432) }
}

/**
 * URL para el CLI de Prisma (`migrate deploy`, `db pull`), que no recibe un objeto de configuración.
 * Solo existe dentro de `prisma-cli.ts`: apunta al proxy en `localhost`, que es el nombre del
 * certificado de Railway, y valida la cadena contra la raíz fijada.
 */
export function appDatabaseUrl(): string | undefined {
  const tunnelPort = process.env[APP_TUNNEL_PORT_ENV]
  if (!tunnelPort) return undefined
  const url = appUrl()
  const params = new URLSearchParams({
    schema: APP_SCHEMA,
    sslmode: "require",
    sslaccept: "strict",
    sslcert: STAGE_CA_FILE,
  })
  return `postgresql://${url.username}:${url.password}@localhost:${tunnelPort}${url.pathname}?${params}`
}
