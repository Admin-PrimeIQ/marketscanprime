import type { NextRequest } from "next/server"
import { fetchStrapiUserFromBearer } from "@/lib/auth/verify-strapi-bearer"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"
import { logApi, userFromBearer } from "@/lib/server-logger"
import { syncUnavailableInPrisma } from "@/lib/sync/prisma-unavailable"
import { listSqlProjects, SyncApiError, type SyncDomain } from "@/lib/sync/runs-api"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Universo de bloques del warehouse legado, agrupado en proyectos — lo que
 * elige el selector de un pull.
 *
 * El proxy existe por lo mismo que el de `runs`: `SYNC_API_KEY` no puede viajar
 * al bundle. Con esa llave cualquiera dispara una corrida contra la bodega de
 * producción.
 *
 * Restringido a super admin y comprobado ACÁ, no sólo en la UI: esto expone la
 * cartera completa de proyectos del warehouse —nombres, constructoras, países—
 * y esconder un botón no detiene a nadie capaz de armar un GET con el token de
 * un operador.
 */
export async function GET(request: NextRequest) {
  const unavailable = syncUnavailableInPrisma()
  if (unavailable) return unavailable
  const t0 = Date.now()
  const user = userFromBearer(request.headers.get("authorization"))
  const path = request.nextUrl.pathname

  const strapiUser = await fetchStrapiUserFromBearer(request.headers.get("authorization"))
  if (!strapiUser) {
    logApi({ tag: "route:GET", path, user, status: 401, durationMs: Date.now() - t0, error: "Unauthorized" })
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } })
  }

  if (!isStrapiSuperAdmin(strapiUser.role)) {
    logApi({
      tag: "route:GET",
      path,
      user,
      status: 403,
      durationMs: Date.now() - t0,
      error: `Forbidden role:${strapiUser.role?.name ?? "?"}`,
    })
    return Response.json({ error: "Forbidden" }, { status: 403, headers: { "cache-control": "no-store" } })
  }

  const params = request.nextUrl.searchParams
  const limit = Number(params.get("limit") ?? NaN)

  try {
    const page = await listSqlProjects({
      // Se pasa tal cual: quien valida el enum y resuelve la TABLA es n8n, con
      // un mapa cerrado. Duplicar la lista acá crearía dos verdades que se
      // pueden desincronizar.
      domain: (params.get("domain") as SyncDomain | null) ?? undefined,
      country: params.get("country") ?? undefined,
      search: params.get("search") ?? undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    })
    logApi({
      tag: "route:GET",
      path,
      user,
      status: 200,
      durationMs: Date.now() - t0,
      detail: `projects:${page.totalProjects} blocks:${page.totalBlocks}${page.truncated ? " TRUNCATED" : ""}`,
    })
    return Response.json(page, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    const status = err instanceof SyncApiError ? err.status : 502
    const message = err instanceof Error ? err.message : "sync api error"
    logApi({ tag: "route:GET", path, user, status, durationMs: Date.now() - t0, error: message })
    return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } })
  }
}
