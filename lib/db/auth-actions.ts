"use server"

import { headers } from "next/headers"
import { APIError } from "better-auth/api"
import type { StrapiUser } from "@/lib/api/strapi"
import { getAuth } from "@/lib/auth/server"
import { actionFailure, type ActionResult } from "./action-result"
import { assertPrismaActionsAllowed } from "./guard"
import { requireUser } from "./session"
import { fromAuthUser, INVALID_CREDENTIALS, toSessionUser } from "./user-mapping"

/**
 * Login del backend `prisma` con Better Auth contra `msp_app`: correo o usuario y la clave de
 * siempre (hash bcrypt de Strapi, decisión 13). Deja la cookie de sesión httpOnly con `nextCookies`.
 * Nunca llama a Strapi. Usuario inexistente, clave mala o usuario bloqueado dan el mismo mensaje.
 */
export async function loginAction(identifier: string, password: string): Promise<ActionResult<StrapiUser>> {
  try {
    assertPrismaActionsAllowed()
    const id = typeof identifier === "string" ? identifier.trim() : ""
    if (!id || typeof password !== "string" || !password) return { ok: false, message: INVALID_CREDENTIALS }

    const auth = getAuth()
    const requestHeaders = await headers()
    try {
      const { user } = id.includes("@")
        ? await auth.api.signInEmail({ body: { email: id, password }, headers: requestHeaders })
        : await auth.api.signInUsername({ body: { username: id, password }, headers: requestHeaders })
      return { ok: true, data: toSessionUser(fromAuthUser(user)) }
    } catch (error) {
      if (error instanceof APIError) return { ok: false, message: INVALID_CREDENTIALS }
      throw error
    }
  } catch (error) {
    return actionFailure(error, "Error inesperado al iniciar sesión")
  }
}

/** Revoca la sesión en la base y borra la cookie. Sin sesión no hay nada que cerrar. */
export async function logoutAction(): Promise<ActionResult<null>> {
  try {
    assertPrismaActionsAllowed()
    await getAuth().api.signOut({ headers: await headers() })
    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof APIError) return { ok: true, data: null }
    return actionFailure(error, "Error inesperado al cerrar sesión")
  }
}

export async function getMeAction(): Promise<ActionResult<StrapiUser>> {
  try {
    return { ok: true, data: toSessionUser(await requireUser()) }
  } catch (error) {
    return actionFailure(error, "Error inesperado al leer la sesión")
  }
}
