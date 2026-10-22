import { resolveDataBackend } from "../api/data-backend.ts"

/**
 * Las Server Actions son endpoints públicos y todavía no hay sesión del lado del servidor
 * (Auth.js llega después). Hasta entonces solo responden en `next dev` con el backend `prisma`:
 * en un build de producción, aunque exista `DATABASE_URL_APP`, se niegan.
 */
export function assertPrismaActionsAllowed(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV !== "development") {
    throw new Error("Las acciones sobre la base nueva solo corren en desarrollo local hasta que exista la autenticación.")
  }
  if (resolveDataBackend(env.NEXT_PUBLIC_DATA_BACKEND) !== "prisma") {
    throw new Error('Las acciones sobre la base nueva requieren NEXT_PUBLIC_DATA_BACKEND="prisma".')
  }
}
