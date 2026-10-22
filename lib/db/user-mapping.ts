/**
 * Usuario de `msp_app` → forma de `StrapiUser`, que es lo que la UI guarda en la sesión.
 * Puro: corre bajo `node --test`.
 */

import type { StrapiUser } from "../api/strapi.ts"

export interface UserRow {
  id: number
  username: string
  email: string
  provider: string
  passwordHash: string | null
  role: string
  confirmed: boolean
  blocked: boolean
  createdAt: Date
  updatedAt: Date
}

/** Valores del enum `UserRole` → nombre visible del rol en Strapi. */
const ROLE_NAMES: Record<string, string> = {
  authenticated: "Authenticated",
  operator: "Operator",
  supervisor: "Supervisor",
  administrator: "Administrator",
  super_administrator: "Super Administrator",
}

/** Mismo mensaje que `POST /api/auth/local` de Strapi: no dice si falló el usuario o la clave. */
export const INVALID_CREDENTIALS = "Invalid identifier or password"

/** Solo cuentas locales, no bloqueadas y con hash; Strapi rechaza las demás igual. */
export function canPasswordLogin(user: UserRow | null): user is UserRow & { passwordHash: string } {
  return !!user && user.provider === "local" && !user.blocked && !!user.passwordHash
}

/**
 * Cuenta de desarrollo opcional del `.env` (`DEV_LOGIN_EMAIL` + `DEV_LOGIN_PASSWORD_HASH`,
 * un hash bcrypt), para entrar con una cuenta que no está en `msp_app.user` sin escribir en la base.
 */
export function devLoginAccount(env: Record<string, string | undefined>): { email: string; passwordHash: string } | null {
  const email = env.DEV_LOGIN_EMAIL?.trim()
  const passwordHash = env.DEV_LOGIN_PASSWORD_HASH?.trim()
  return email && passwordHash ? { email, passwordHash } : null
}

export function devAccountUser(email: string): UserRow {
  const epoch = new Date(0)
  return {
    id: 0,
    username: email.split("@")[0] || email,
    email,
    provider: "local",
    passwordHash: null,
    role: "administrator",
    confirmed: true,
    blocked: false,
    createdAt: epoch,
    updatedAt: epoch,
  }
}

export function toSessionUser(user: UserRow): StrapiUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    provider: user.provider,
    confirmed: user.confirmed,
    blocked: user.blocked,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    // `type` con el valor del enum: `isStrapiSuperAdmin` reconoce `super_administrator`.
    role: { id: 0, name: ROLE_NAMES[user.role] ?? user.role, type: user.role },
  }
}
