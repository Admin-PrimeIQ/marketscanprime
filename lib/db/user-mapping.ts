/**
 * Usuario de la sesión (Better Auth sobre `msp_app.user`) → forma de `StrapiUser`, que es lo que la
 * UI guarda y muestra. Puro: corre bajo `node --test`.
 */

import type { StrapiUser } from "../api/strapi.ts"

export interface UserRow {
  id: number
  username: string
  email: string
  provider: string
  role: string
  confirmed: boolean
  blocked: boolean
  createdAt: Date
  updatedAt: Date
}

/** Lo que devuelve Better Auth como `user` (con `additionalFields` y el plugin `username`). */
export interface AuthUser {
  id: string | number
  email: string
  username?: string | null
  emailVerified?: boolean | null
  provider?: string | null
  role?: string | null
  blocked?: boolean | null
  createdAt: Date | string
  updatedAt: Date | string
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

export function fromAuthUser(user: AuthUser): UserRow {
  return {
    id: Number(user.id),
    username: user.username ?? "",
    email: user.email,
    provider: user.provider ?? "local",
    role: user.role ?? "",
    confirmed: user.emailVerified === true,
    blocked: user.blocked === true,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
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
