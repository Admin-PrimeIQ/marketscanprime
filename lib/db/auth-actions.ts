"use server"

import { headers } from "next/headers"
import { APIError } from "better-auth/api"
import type { StrapiUser } from "@/lib/api/strapi"
import { clientIp, throttleKeys, tooManyAttemptsMessage } from "@/lib/auth/login-throttle"
import { getAuth } from "@/lib/auth/server"
import { actionFailure, type ActionResult } from "./action-result"
import { loginInputSchema } from "./auth-schemas"
import { getAppPrisma } from "./client"
import { assertPrismaActionsAllowed } from "./guard"
import { createLoginThrottle } from "./login-throttle"
import { requireUser } from "./session"
import { fromAuthUser, INVALID_CREDENTIALS, toSessionUser } from "./user-mapping"

/**
 * Login del backend `prisma` con Better Auth contra `msp_app`: correo o usuario y la clave de
 * siempre (hash bcrypt de Strapi, decisión 13). Deja la cookie de sesión httpOnly con `nextCookies`.
 * Nunca llama a Strapi. Usuario inexistente, clave mala o usuario bloqueado dan el mismo mensaje.
 *
 * Cada intento cuenta contra la cuenta y la IP antes de comprobar la clave (`lib/auth/login-throttle.ts`):
 * pasado el límite se rechaza sin llegar a bcrypt, exista o no la cuenta.
 */
export async function loginAction(identifier: string, password: string): Promise<ActionResult<StrapiUser>> {
  try {
    assertPrismaActionsAllowed()
    const input = loginInputSchema.safeParse({ identifier, password })
    if (!input.success) return { ok: false, message: INVALID_CREDENTIALS }
    const { identifier: id, password: secret } = input.data

    const requestHeaders = await headers()
    const throttle = createLoginThrottle(getAppPrisma())
    const keys = throttleKeys(id, clientIp(requestHeaders))
    const gate = await throttle.attempt(keys)
    if (!gate.allowed) return { ok: false, message: tooManyAttemptsMessage(gate.retryAfterMs) }

    const auth = getAuth()
    try {
      const { user } = id.includes("@")
        ? await auth.api.signInEmail({ body: { email: id, password: secret }, headers: requestHeaders })
        : await auth.api.signInUsername({ body: { username: id, password: secret }, headers: requestHeaders })
      // La sesión ya está creada: si limpiar el contador falla, el login sigue siendo válido.
      await throttle.succeeded(keys).catch((error) => console.error("[login-throttle] No se pudo limpiar el contador:", error))
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
