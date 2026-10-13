import type { StrapiUser } from "@/lib/api/strapi"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"

/**
 * Valida un JWT de Strapi contra /api/users/me (solo servidor).
 */

function strapiBaseUrl(): string {
  return (
    process.env.STRAPI_URL?.trim() ||
    process.env.NEXT_PUBLIC_STRAPI_URL?.trim() ||
    "http://localhost:1337"
  )
}

/**
 * Devuelve el usuario de Strapi con su rol poblado, o null si el token no sirve.
 *
 * Es la misma llamada que hace `isValidStrapiBearer`, pero conservando el cuerpo:
 * quien necesita el rol no debería pagar un segundo viaje a Strapi.
 */
export async function fetchStrapiUserFromBearer(
  authorizationHeader: string | null
): Promise<StrapiUser | null> {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null
  }
  const token = authorizationHeader.slice(7).trim()
  if (!token) return null

  const base = strapiBaseUrl().replace(/\/$/, "")
  try {
    const res = await fetch(`${base}/api/users/me?populate=role`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    return (await res.json()) as StrapiUser
  } catch {
    return null
  }
}

export async function isValidStrapiBearer(
  authorizationHeader: string | null
): Promise<boolean> {
  return (await fetchStrapiUserFromBearer(authorizationHeader)) !== null
}

/**
 * Verdadero sólo si el token pertenece a un super admin.
 *
 * Esto es la autorización de verdad, no el `isStrapiSuperAdmin` del cliente:
 * esconder un botón no impide un POST hecho a mano con un token de operador.
 * El rol se resuelve contra Strapi en cada petición, así que revocarlo allá
 * surte efecto sin necesidad de que el usuario vuelva a iniciar sesión.
 */
export async function isSuperAdminBearer(
  authorizationHeader: string | null
): Promise<boolean> {
  const user = await fetchStrapiUserFromBearer(authorizationHeader)
  return isStrapiSuperAdmin(user?.role)
}
