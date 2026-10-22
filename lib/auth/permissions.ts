/**
 * Qué puede hacer cada rol en la app nueva (backend `prisma`). Es la misma matriz que los roles de
 * Strapi (docs/manual-del-sistema.md, "Roles y permisos"):
 *
 * - authenticated: solo lectura.
 * - operator: crea, lee y edita; no borra.
 * - supervisor: CRUD completo.
 * - administrator: CRUD completo y gestiona usuarios.
 * - super_administrator: todo, incluidas las funciones de super admin del backoffice.
 *
 * Puro: corre bajo `node --test`.
 */

export type Permission = "read" | "create" | "update" | "delete" | "manageUsers" | "superAdmin"

/** Valores del enum `UserRole` de `msp_app`. */
export const USER_ROLES = ["authenticated", "operator", "supervisor", "administrator", "super_administrator"] as const

export type UserRole = (typeof USER_ROLES)[number]

const CRUD: readonly Permission[] = ["read", "create", "update", "delete"]

const PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  authenticated: new Set(["read"]),
  operator: new Set(["read", "create", "update"]),
  supervisor: new Set(CRUD),
  administrator: new Set([...CRUD, "manageUsers"]),
  super_administrator: new Set([...CRUD, "manageUsers", "superAdmin"]),
}

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" && (USER_ROLES as readonly string[]).includes(role)
}

/** Un rol desconocido o vacío no puede nada. */
export function can(role: unknown, permission: Permission): boolean {
  return isUserRole(role) && PERMISSIONS[role].has(permission)
}
