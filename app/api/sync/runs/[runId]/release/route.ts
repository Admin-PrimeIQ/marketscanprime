import type { NextRequest } from "next/server"
import { fetchStrapiUserFromBearer } from "@/lib/auth/verify-strapi-bearer"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"
import { logApi, userFromBearer } from "@/lib/server-logger"
import { releaseRun, SyncApiError } from "@/lib/sync/runs-api"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Force-closes an active run and frees the global writeback lock.
 *
 * Restricted to super admins, and the check lives HERE rather than only in the
 * UI: hiding a button does not stop a hand-made POST carrying an operator's
 * token. The role is resolved against Strapi on every request, so revoking it
 * there takes effect without waiting for the user to sign in again.
 *
 * Releasing affects everyone — it frees `sync_runs_one_active_idx`, after which
 * anybody can start a new writeback against the same warehouse.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const t0 = Date.now()
  const user = userFromBearer(request.headers.get("authorization"))
  const path = request.nextUrl.pathname

  const strapiUser = await fetchStrapiUserFromBearer(request.headers.get("authorization"))
  if (!strapiUser) {
    logApi({ tag: "route:POST", path, user, status: 401, durationMs: Date.now() - t0, error: "Unauthorized" })
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } }
    )
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
    return Response.json(
      { error: "Forbidden" },
      { status: 403, headers: { "cache-control": "no-store" } }
    )
  }

  const { runId } = await context.params

  try {
    const result = await releaseRun(runId)
    logApi({
      tag: "route:POST",
      path,
      user,
      status: 200,
      durationMs: Date.now() - t0,
      detail: `released blocks:${result.releasedBlocks ?? 0}`,
    })
    return Response.json(result, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    const status = err instanceof SyncApiError ? err.status : 502
    const message = err instanceof Error ? err.message : "sync api error"
    logApi({ tag: "route:POST", path, user, status, durationMs: Date.now() - t0, error: message })
    return Response.json(
      { error: message, released: false },
      { status, headers: { "cache-control": "no-store" } }
    )
  }
}
