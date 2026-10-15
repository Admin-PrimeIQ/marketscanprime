import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ConnectionOptions } from "node:tls"
import type { ClientConfig } from "pg"
import { ETL_ROOT } from "../db/env"

/** Raíz autofirmada del Postgres de Railway; se obtiene con `npm run stage:cert`. */
export const STAGE_CA_FILE = resolve(ETL_ROOT, "certs/dbo-stage-ca.pem")

/**
 * Railway emite el certificado del servidor para `localhost` con una raíz propia: la cadena se
 * valida contra esa raíz fijada, y solo se omite la comprobación del nombre de host.
 */
export function stageSsl(): ConnectionOptions {
  if (!existsSync(STAGE_CA_FILE)) {
    throw new Error(`Falta ${STAGE_CA_FILE}. Ejecuta "npm run stage:cert" para obtener la raíz del certificado.`)
  }
  return { ca: readFileSync(STAGE_CA_FILE, "utf8"), rejectUnauthorized: true, checkServerIdentity: () => undefined }
}

export function stageUrl(): URL {
  const raw = process.env.DATABASE_URL_DBO_STAGE?.trim()
  if (!raw) {
    throw new Error("Falta DATABASE_URL_DBO_STAGE en el .env de la raíz (postgresql://usuario:clave@host:puerto/base).")
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    // El mensaje no incluye la URL: lleva la contraseña.
    throw new Error("DATABASE_URL_DBO_STAGE no es una URL válida. En la contraseña, codifica % como %25 y luego # como %23.")
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new Error(`DATABASE_URL_DBO_STAGE debe ser postgresql://…, no ${url.protocol}//…`)
  }
  return url
}

/**
 * Conexión a `DATABASE_URL_DBO_STAGE` (Postgres en Railway), de SOLO LECTURA: la sesión se abre con
 * `default_transaction_read_only=on`, así que el propio servidor rechaza cualquier escritura aunque
 * el usuario tenga permisos.
 */
export function stageClientConfig(): ClientConfig {
  const url = stageUrl()
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: stageSsl(),
    options: "-c default_transaction_read_only=on",
    application_name: "msp-etl-readonly",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  }
}
