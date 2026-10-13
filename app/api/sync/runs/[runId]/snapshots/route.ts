import type { NextRequest } from "next/server"
import { fetchStrapiUserFromBearer } from "@/lib/auth/verify-strapi-bearer"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"
import { logApi, userFromBearer } from "@/lib/server-logger"
import { listRunFiles, SyncApiError } from "@/lib/sync/runs-api"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Lists the S3 artifacts of a run.
 *
 * Restricted to super admins, checked HERE and not only in the UI: these objects
 * are raw dumps of production warehouse rows — the units, prices and flags of a
 * whole block — and a listing exposes which blocks a run touched. Hiding the
 * section stops nobody who can craft a GET with an operator's token.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const t0 = Date.now()
  const user = userFromBearer(request.headers.get("authorization"))
  const path = request.nextUrl.pathname
  const { runId } = await params

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

  try {
    const page = await listRunFiles(runId)
    logApi({
      tag: "route:GET",
      path,
      user,
      status: 200,
      durationMs: Date.now() - t0,
      detail: `files:${page.total}${page.truncated ? " truncated" : ""}`,
    })
    return Response.json(page, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    const status = err instanceof SyncApiError ? err.status : 502
    const message = err instanceof Error ? err.message : "sync api error"
    logApi({ tag: "route:GET", path, user, status, durationMs: Date.now() - t0, error: message })
    return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } })
  }
}
