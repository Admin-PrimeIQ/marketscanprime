import type { StrapiUserRole } from "@/lib/api/strapi"

/**
 * Role object from Strapi Users & Permissions, populated on the client via
 * `GET /api/users/me?populate=role` (see `strapiClient.getMe()` and `AuthContext`).
 * Detection uses `role.type` (Strapi slug) and `role.name` (display name).
 */

const SUPER_ADMIN_TYPES = new Set([
  "super-admin",
  "super_admin",
  "super-administrator",
  "super_administrator",
])

/** Display names normalized: lowercase, no accents, spaces/dashes/underscores removed */
const SUPER_ADMIN_NAME_COMPACT = new Set([
  "superadmin",
  "superadministrator",
  "superadministrador",
])

function compactRoleName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "")
}

export function isStrapiSuperAdmin(role: StrapiUserRole | null | undefined): boolean {
  if (!role) return false

  const type = (role.type ?? "").toLowerCase().trim()
  if (SUPER_ADMIN_TYPES.has(type)) return true

  const compact = compactRoleName(role.name ?? "")
  return SUPER_ADMIN_NAME_COMPACT.has(compact)
}
