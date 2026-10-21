import type { PoolConfig } from "mariadb"
import { MAX_CONNECTIONS, rdsSsl } from "../db/env"
import { rejectStrapiAppUser } from "../strapi/connection"

/**
 * Warehouse MySQL (instancia RDS distinta de la de Strapi, us-east-2): bases `dbo_stage` y `dbo`.
 * Producción y compartido con otros proyectos: solo lectura.
 */

export interface WarehouseDbEnv {
  host: string
  port: number
  user: string
  password: string
}

/** Usuario y contraseña propios si existen; si no, los de Strapi (hoy es el mismo usuario de solo SELECT). */
export function readWarehouseDbEnv(): WarehouseDbEnv {
  const host = process.env.DATABASE_HOST_WAREHOUSE?.trim()
  if (!host) throw new Error("Falta DATABASE_HOST_WAREHOUSE en el .env de la raíz.")

  const userVariable = process.env.DATABASE_USER_WAREHOUSE?.trim() ? "DATABASE_USER_WAREHOUSE" : "DATABASE_USER_STRAPI"
  const user = process.env[userVariable]?.trim()
  const password = process.env.DATABASE_PASSWORD_WAREHOUSE || process.env.DATABASE_PASSWORD_STRAPI
  if (!user || !password) {
    throw new Error("Faltan credenciales: DATABASE_USER_WAREHOUSE / DATABASE_PASSWORD_WAREHOUSE (o las de Strapi).")
  }
  rejectStrapiAppUser(userVariable, user)

  return {
    host,
    port: Number(process.env.DATABASE_PORT_WAREHOUSE?.trim() || 3306),
    user,
    password,
  }
}

/** Sin base por defecto: las consultas nombran `dbo_stage.` o `dbo.` explícitamente. */
export function warehousePoolConfig(env: WarehouseDbEnv = readWarehouseDbEnv()): PoolConfig {
  return {
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    connectionLimit: MAX_CONNECTIONS,
    minimumIdle: 1,
    connectTimeout: 10_000,
    ssl: rdsSsl(),
  }
}
