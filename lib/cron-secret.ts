import { createHash, timingSafeEqual } from "node:crypto"

/** Largo mínimo de `CRON_SECRET`; uno más corto deja la ruta del cron apagada. */
export const CRON_SECRET_MIN_LENGTH = 32

/** `true` si el secreto está definido y es lo bastante largo para habilitar la ruta. */
export function isCronSecretConfigured(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.trim().length >= CRON_SECRET_MIN_LENGTH
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest()

/**
 * Compara `Authorization: Bearer <secreto>` con `CRON_SECRET` en tiempo constante. Se comparan
 * los SHA-256 para que el largo del encabezado no se filtre por el tiempo de respuesta.
 */
export function isValidCronBearer(authorization: string | null | undefined, secret: string | undefined): boolean {
  if (!isCronSecretConfigured(secret)) return false
  if (!authorization?.startsWith("Bearer ")) return false
  return timingSafeEqual(digest(authorization.slice(7).trim()), digest(secret.trim()))
}
