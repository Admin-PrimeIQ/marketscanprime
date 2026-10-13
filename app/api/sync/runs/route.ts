import type { NextRequest } from "next/server"
import { isValidStrapiBearer, fetchStrapiUserFromBearer } from "@/lib/auth/verify-strapi-bearer"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"
import { logApi, userFromBearer } from "@/lib/server-logger"
import { listRuns, triggerWriteback, SyncApiError } from "@/lib/sync/runs-api"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Lists writeback runs, proxying n8n.
 *
 * The proxy exists so `SYNC_API_KEY` stays on the server. If the browser called
 * n8n directly the token would ship in the bundle, and with it anyone could
 * trigger a writeback with `force: true` — which disables the guard that stops
 * a block's units from being deleted without replacement.
 */
export async function GET(request: NextRequest) {
  const t0 = Date.now()
  const user = userFromBearer(request.headers.get("authorization"))
  const path = request.nextUrl.pathname

  const ok = await isValidStrapiBearer(request.headers.get("authorization"))
  if (!ok) {
    logApi({ tag: "route:GET", path, user, status: 401, durationMs: Date.now() - t0, error: "Unauthorized" })
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } }
    )
  }

  const params = request.nextUrl.searchParams
  const limit = Number(params.get("limit") ?? 20)
  const offset = Number(params.get("offset") ?? 0)
  const status = params.get("status") ?? undefined

  try {
    const page = await listRuns({
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
      status,
    })
    logApi({
      tag: "route:GET",
      path,
      user,
      status: 200,
      durationMs: Date.now() - t0,
      detail: `runs:${page.runs.length}/${page.total}${page.active ? " active" : ""}`,
    })
    return Response.json(page, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    const status = err instanceof SyncApiError ? err.status : 502
    const message = err instanceof Error ? err.message : "sync api error"
    logApi({ tag: "route:GET", path, user, status, durationMs: Date.now() - t0, error: message })
    return Response.json(
      { error: message },
      { status, headers: { "cache-control": "no-store" } }
    )
  }
}

/**
 * Starts a writeback run.
 *
 * Restricted to super admins, checked HERE and not only in the UI: this writes
 * to a production warehouse, and hiding a button stops nobody who can craft a
 * POST with an operator's token.
 *
 * `force` is accepted but deliberately not surfaced by the UI — it disables the
 * guard that refuses to delete a block's units when Strapi returned none.
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now()
  const user = userFromBearer(request.headers.get("authorization"))
  const path = request.nextUrl.pathname

  const strapiUser = await fetchStrapiUserFromBearer(request.headers.get("authorization"))
  if (!strapiUser) {
    logApi({ tag: "route:POST", path, user, status: 401, durationMs: Date.now() - t0, error: "Unauthorized" })
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } })
  }

  if (!isStrapiSuperAdmin(strapiUser.role)) {
    logApi({
      tag: "route:POST",
      path,
      user,
      status: 403,
      durationMs: Date.now() - t0,
      error: `Forbidden role:${strapiUser.role?.name ?? "?"}`,
    })
    return Response.json({ error: "Forbidden" }, { status: 403, headers: { "cache-control": "no-store" } })
  }

  const body = (await request.json().catch(() => null)) as
    | { blockIds?: unknown; force?: unknown; operation?: unknown; domain?: unknown }
    | null

  // Una corrida tiene operación: `push` lleva lo de Strapi al warehouse MySQL,
  // `pull` trae las filas del warehouse a Strapi. Las dos están implementadas —
  // la resolución bifurca por operación y cada una tiene su worker.
  //
  // `purge` no: borraría en cascada dentro de Strapi y no existe todavía. Se
  // rechaza ACÁ y no sólo en la UI, porque una operación desconocida que cayera
  // a `triggerWriteback` no fallaría: correría un push en silencio, escribiendo
  // sobre el warehouse cuando le pidieron lo contrario.
  const OPERACIONES = ["push", "pull"] as const
  const bruta = body?.operation === undefined ? "push" : String(body.operation)
  const operation = OPERACIONES.find((o) => o === bruta)
  if (!operation) {
    logApi({
      tag: "route:POST",
      path,
      user,
      status: 400,
      durationMs: Date.now() - t0,
      error: `operation:${bruta}`,
    })
    return Response.json(
      { error: `operation "${bruta}" is not available yet; today only "push" and "pull" run` },
      { status: 400, headers: { "cache-control": "no-store" } }
    )
  }

  // El dominio decide QUÉ TABLAS lee la corrida. Se valida acá además de en
  // n8n por lo mismo que la operación: dejar pasar uno desconocido no fallaría
  // ruidosamente — n8n lo rechazaría, pero el operador vería un 502 opaco en
  // vez de saber qué eligió mal.
  //
  // Se valida el PAR operación×dominio, no el dominio suelto, porque las dos
  // listas NO coinciden: `industrial` se puede traer y no se puede devolver.
  // Sus columnas ya están traducidas para bajar a Strapi, pero nadie escribió
  // el mapper inverso, así que un push industrial se rechaza acá — mirar el
  // dominio suelto lo dejaría entrar y moriría adentro del worker.
  const DOMINIOS = ["housing", "office", "industrial"] as const
  const CON_MAPPER: Record<(typeof OPERACIONES)[number], readonly (typeof DOMINIOS)[number][]> = {
    push: ["housing", "office", "industrial"],
    pull: ["housing", "office", "industrial"],
  }
  const dominioCrudo = body?.domain === undefined ? "housing" : String(body.domain)
  const domain = DOMINIOS.find((d) => d === dominioCrudo)
  if (!domain || !CON_MAPPER[operation].includes(domain)) {
    logApi({
      tag: "route:POST",
      path,
      user,
      status: 400,
      durationMs: Date.now() - t0,
      error: `domain:${dominioCrudo}`,
    })
    return Response.json(
      {
        error: `operation "${operation}" has no mapper for domain "${dominioCrudo}" yet; today ${operation} runs: ${CON_MAPPER[operation].join(", ")}`,
      },
      { status: 400, headers: { "cache-control": "no-store" } }
    )
  }

  const blockIds = Array.isArray(body?.blockIds)
    ? body.blockIds.map((v) => String(v).trim()).filter(Boolean)
    : undefined

  try {
    // requestedBy comes from the verified session, never from the request body:
    // the ledger records who fired it, so it must not be spoofable.
    const result = await triggerWriteback({
      requestedBy: strapiUser.email ?? strapiUser.username ?? `user:${strapiUser.id}`,
      operation,
      domain,
      blockIds,
      force: body?.force === true,
    })
    logApi({
      tag: "route:POST",
      path,
      user,
      status: 202,
      durationMs: Date.now() - t0,
      detail: `run:${result.runId} ${operation}/${domain} targets:${blockIds?.length ?? "all"}`,
    })
    return Response.json(result, { status: 202, headers: { "cache-control": "no-store" } })
  } catch (err) {
    const status = err instanceof SyncApiError ? err.status : 502
    const message = err instanceof Error ? err.message : "sync api error"
    logApi({ tag: "route:POST", path, user, status, durationMs: Date.now() - t0, error: message })
    return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } })
  }
}
