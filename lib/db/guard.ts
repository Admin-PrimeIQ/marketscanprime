import { resolveDataBackend } from "../api/data-backend.ts"

// Credenciales de producción que un despliegue de la app paralela nunca puede tener a la mano.
const PRODUCTION_SECRETS = ["STRAPI_USERNAME", "STRAPI_PASSWORD", "SYNC_API_KEY"]

/**
 * Las Server Actions son endpoints públicos. Antes de mirar la sesión (`requireUser` /
 * `requireRole` en `lib/db/session.ts`) solo responden con el backend `prisma` y, además, en
 * `next dev` o en un despliegue de staging marcado a propósito con `MSP_STAGING_DEPLOY=true`, que
 * se niega si el entorno trae credenciales de producción. El despliegue de staging sigue detrás de
 * la protección de Vercel mientras la app nueva no tenga su propio endurecimiento (límite de
 * intentos de login, auditoría).
 */
export function assertPrismaActionsAllowed(env: Record<string, string | undefined> = process.env): void {
  if (resolveDataBackend(env.NEXT_PUBLIC_DATA_BACKEND) !== "prisma") {
    throw new Error('Las acciones sobre la base nueva requieren NEXT_PUBLIC_DATA_BACKEND="prisma".')
  }
  if (env.NODE_ENV === "development") return
  const flag = env.MSP_STAGING_DEPLOY
  if (flag?.trim() !== "true") {
    const seen = flag === undefined ? "no está definida" : `vale ${JSON.stringify(flag)}`
    const where = env.VERCEL_ENV ? ` (entorno de Vercel: ${env.VERCEL_ENV})` : ""
    throw new Error(
      `Las acciones sobre la base nueva solo corren en desarrollo local o en un despliegue con MSP_STAGING_DEPLOY=true. ` +
        `En este despliegue MSP_STAGING_DEPLOY ${seen}${where}.`,
    )
  }
  const leaked = PRODUCTION_SECRETS.filter((key) => env[key]?.trim())
  if (leaked.length > 0) {
    throw new Error(`Este despliegue de staging no puede tener ${leaked.join(", ")}.`)
  }
}
