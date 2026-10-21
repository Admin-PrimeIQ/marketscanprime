import type { PoolConfig } from "mariadb"
import { MAX_CONNECTIONS, RDS_CA_BUNDLE, rdsSsl } from "../db/env"

// Prefijo del usuario con el que corre Strapi (manual del sistema, «Variables de entorno»): tiene escritura.
const STRAPI_APP_USER_PREFIX = "adm"

export interface StrapiDbEnv {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export function rejectStrapiAppUser(variable: string, user: string) {
  if (user.toLowerCase().startsWith(STRAPI_APP_USER_PREFIX)) {
    throw new Error(
      `${variable} parece el usuario de Strapi («${STRAPI_APP_USER_PREFIX}…»), que tiene escritura. ` +
        "Usa un usuario con solo SELECT (p. ej. msp_readonly).",
    )
  }
}

export function readStrapiDbEnv(): StrapiDbEnv {
  const required = {
    DATABASE_HOST_STRAPI: process.env.DATABASE_HOST_STRAPI,
    DATABASE_NAME_STRAPI: process.env.DATABASE_NAME_STRAPI,
    DATABASE_USER_STRAPI: process.env.DATABASE_USER_STRAPI,
    DATABASE_PASSWORD_STRAPI: process.env.DATABASE_PASSWORD_STRAPI,
  }
  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key)
  if (missing.length > 0) {
    throw new Error(`Faltan variables en el .env de la raíz: ${missing.join(", ")}`)
  }

  const user = required.DATABASE_USER_STRAPI!.trim()
  rejectStrapiAppUser("DATABASE_USER_STRAPI", user)

  return {
    host: required.DATABASE_HOST_STRAPI!.trim(),
    port: Number(process.env.DATABASE_PORT_STRAPI?.trim() || 3306),
    database: required.DATABASE_NAME_STRAPI!.trim(),
    user,
    password: required.DATABASE_PASSWORD_STRAPI!,
  }
}

/** Pool de solo lectura: tope de conexiones y SSL validando el certificado de RDS. */
export function strapiPoolConfig(env: StrapiDbEnv = readStrapiDbEnv()): PoolConfig {
  return {
    host: env.host,
    port: env.port,
    database: env.database,
    user: env.user,
    password: env.password,
    connectionLimit: MAX_CONNECTIONS,
    // Con 0, el pool de mariadb 3.4 nunca abre una conexión y todo termina en «pool timeout».
    minimumIdle: 1,
    connectTimeout: 10_000,
    ssl: rdsSsl(),
  }
}

/** URL para `prisma db pull --print` (el CLI de Prisma no recibe un objeto de configuración). */
export function strapiDatabaseUrl(env: StrapiDbEnv = readStrapiDbEnv()): string {
  const user = encodeURIComponent(env.user)
  const password = encodeURIComponent(env.password)
  return `mysql://${user}:${password}@${env.host}:${env.port}/${env.database}?sslaccept=strict&sslcert=${encodeURIComponent(RDS_CA_BUNDLE)}`
}
