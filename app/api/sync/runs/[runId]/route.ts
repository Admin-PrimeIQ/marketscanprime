import type { NextRequest } from "next/server"
import { isValidStrapiBearer } from "@/lib/auth/verify-strapi-bearer"
import { logApi, userFromBearer } from "@/lib/server-logger"
import { getRun, SyncApiError } from "@/lib/sync/runs-api"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Detail of a single writeback run, including its per-block ledger.
 *
 * The caller only ever sees `/api/sync/runs/<id>`. Upstream this route needs
 * n8n's internal webhook id in front of the path because it carries a route
 * parameter; that detail is confined to lib/sync/runs-api.ts.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
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

  const { runId } = await context.params

  try {
    const run = await getRun(runId)
    logApi({
      tag: "route:GET",
      path,
      user,
      status: 200,
      durationMs: Date.now() - t0,
      detail: `${run.status} blocks:${run.blocks?.length ?? 0}`,
    })
    return Response.json(run, { headers: { "cache-control": "no-store" } })
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
