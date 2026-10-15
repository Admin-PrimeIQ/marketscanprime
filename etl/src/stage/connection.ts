import type { PoolConfig } from "mariadb"
import { MAX_CONNECTIONS, rdsSsl } from "../db/env"

/**
 * Conexión al warehouse de staging (`dbo_stage`), de SOLO LECTURA: hasta el corte, el ETL
 * escribe en una copia sombra, nunca aquí (docs/migration/ROADMAP.md, fase 4).
 */
export function stagePoolConfig(): PoolConfig {
  const raw = process.env.DATABASE_URL_DBO_STAGE?.trim()
  if (!raw) {
    throw new Error("Falta DATABASE_URL_DBO_STAGE en el .env de la raíz (mysql://usuario:clave@host:3306/base).")
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    // El mensaje no incluye la URL: lleva la contraseña.
    throw new Error("DATABASE_URL_DBO_STAGE no es una URL válida. En la contraseña, codifica % como %25 y luego # como %23.")
  }

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    connectionLimit: MAX_CONNECTIONS,
    // Con 0, el pool de mariadb 3.4 nunca abre una conexión y todo termina en «pool timeout».
    minimumIdle: 1,
    connectTimeout: 10_000,
    ssl: rdsSsl(),
  }
}
