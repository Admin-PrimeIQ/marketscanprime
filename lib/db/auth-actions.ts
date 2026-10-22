"use server"

import bcrypt from "bcryptjs"
import type { StrapiUser } from "@/lib/api/strapi"
import { actionFailure, type ActionResult } from "./action-result"
import { getAppPrisma } from "./client"
import { assertPrismaActionsAllowed } from "./guard"
import {
  canPasswordLogin,
  devAccountUser,
  devLoginAccount,
  INVALID_CREDENTIALS,
  toSessionUser,
} from "./user-mapping"

/**
 * Login del backend `prisma` contra la tabla `user` de `msp_app`, con los hashes bcrypt que el ETL
 * copió de Strapi (decisión 13): cada quien entra con su correo o usuario y su clave de siempre.
 * Si el correo no está en la tabla, se prueba la cuenta de desarrollo del `.env`.
 * Todavía no crea una sesión del lado del servidor; eso llega con Auth.js. Por eso, como el resto
 * de `lib/db/`, pasa por `assertPrismaActionsAllowed()`: backend `prisma`, y `next dev` o un
 * despliegue de staging con `MSP_STAGING_DEPLOY=true`.
 */
export async function devLoginAction(identifier: string, password: string): Promise<ActionResult<StrapiUser>> {
  try {
    assertPrismaActionsAllowed()
    const id = typeof identifier === "string" ? identifier.trim() : ""
    if (!id || typeof password !== "string" || !password) return { ok: false, message: INVALID_CREDENTIALS }

    const user = await getAppPrisma().user.findFirst({
      where: { OR: [{ email: { equals: id, mode: "insensitive" } }, { username: id }] },
    })
    if (user) {
      if (!canPasswordLogin(user) || !(await bcrypt.compare(password, user.passwordHash))) {
        return { ok: false, message: INVALID_CREDENTIALS }
      }
      return { ok: true, data: toSessionUser(user) }
    }

    const devAccount = devLoginAccount(process.env)
    if (devAccount && devAccount.email.toLowerCase() === id.toLowerCase()) {
      if (await bcrypt.compare(password, devAccount.passwordHash)) {
        return { ok: true, data: toSessionUser(devAccountUser(devAccount.email)) }
      }
    }
    return { ok: false, message: INVALID_CREDENTIALS }
  } catch (error) {
    return actionFailure(error, "Error inesperado al iniciar sesión")
  }
}
