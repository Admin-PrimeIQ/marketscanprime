import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

export const ETL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

// El .env vive en la raíz del repo; se resuelve desde este archivo, no desde el directorio de trabajo.
config({ path: resolve(ETL_ROOT, "../.env"), quiet: true })

export const RDS_CA_BUNDLE = resolve(ETL_ROOT, "certs/rds-global-bundle.pem")

// La skill proteger-produccion fija el tope para cualquier base de producción.
export const MAX_CONNECTIONS = 2

/** SSL validando el certificado con el bundle público de AWS RDS. */
export function rdsSsl() {
  return { ca: readFileSync(RDS_CA_BUNDLE, "utf8"), rejectUnauthorized: true }
}
