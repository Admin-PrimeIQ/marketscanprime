import "server-only"

import { headers } from "next/headers"
import { can, type Permission } from "@/lib/auth/permissions"
import { getAuth } from "@/lib/auth/server"
import { PublicError } from "./action-result"
import { assertPrismaActionsAllowed } from "./guard"
import { fromAuthUser, type UserRow } from "./user-mapping"

export const NO_SESSION = "No hay una sesión válida. Vuelve a iniciar sesión."
export const FORBIDDEN = "Tu rol no tiene permiso para esta acción."

/**
 * Usuario de la sesión (cookie de Better Auth) para las Server Actions y Route Handlers del backend
 * `prisma`. Lee la sesión y el usuario de la base en cada llamada: un rol cambiado o un usuario
 * bloqueado surten efecto sin esperar a que venza la cookie.
 */
export async function requireUser(): Promise<UserRow> {
  assertPrismaActionsAllowed()
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) throw new PublicError(NO_SESSION)
  const user = fromAuthUser(session.user)
  if (user.blocked) throw new PublicError(NO_SESSION)
  return user
}

/** Igual que `requireUser`, y además exige el permiso según la matriz de roles (`lib/auth/permissions.ts`). */
export async function requireRole(permission: Permission): Promise<UserRow> {
  const user = await requireUser()
  if (!can(user.role, permission)) throw new PublicError(FORBIDDEN)
  return user
}
