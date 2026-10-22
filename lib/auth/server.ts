import "server-only"

import bcrypt from "bcryptjs"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { username } from "better-auth/plugins/username"
import { getAppPrisma } from "@/lib/db/client"

/**
 * Sesiones del backend `prisma` (Better Auth), guardadas en `msp_app.session`.
 *
 * - Login con correo o usuario y la clave de siempre: el hash bcrypt de Strapi vive en la cuenta
 *   `credential` (`msp_app.account`, la carga el ETL). Sin registro: solo entran los que ya existen.
 * - La cookie es httpOnly; dura 7 días y se renueva con el uso (valores por defecto).
 * - No hay ruta `/api/auth/*`: el login, el logout y la sesión pasan por Server Actions
 *   (`lib/db/auth-actions.ts`, `lib/db/session.ts`), que antes revisan `assertPrismaActionsAllowed()`.
 */
function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  if (!secret) throw new Error("Falta BETTER_AUTH_SECRET en el .env: firma las cookies de sesión del backend prisma.")

  return betterAuth({
    appName: "Market Scan",
    secret,
    baseURL: process.env.BETTER_AUTH_URL?.trim() || undefined,
    database: prismaAdapter(getAppPrisma(), { provider: "postgresql" }),
    advanced: { database: { generateId: "serial" } },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      password: {
        hash: (password) => bcrypt.hash(password, 10),
        verify: ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },
    user: {
      fields: { emailVerified: "confirmed" },
      additionalFields: {
        publicId: { type: "string", required: false, input: false },
        provider: { type: "string", required: false, input: false },
        role: { type: "string", required: false, input: false },
        blocked: { type: "boolean", required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Better Auth no conoce `blocked`: un usuario bloqueado no obtiene sesión.
          async before(session) {
            const user = await getAppPrisma().user.findUnique({
              where: { id: Number(session.userId) },
              select: { blocked: true },
            })
            if (!user || user.blocked) return false
          },
        },
      },
    },
    plugins: [
      // Los usernames de Strapi no siempre pasan el validador por defecto (solo letras, números, `_` y `.`).
      username({ usernameValidator: (value) => /^\S+$/.test(value), displayUsername: false }),
      nextCookies(),
    ],
  })
}

type Auth = ReturnType<typeof createAuth>

const globalForAuth = globalThis as unknown as { mspAuth?: Auth }

export function getAuth(): Auth {
  globalForAuth.mspAuth ??= createAuth()
  return globalForAuth.mspAuth
}
