import type { NextRequest } from "next/server"
import { fetchStrapiUserFromBearer } from "@/lib/auth/verify-strapi-bearer"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"
import { logApi, userFromBearer } from "@/lib/server-logger"
import { syncUnavailableInPrisma } from "@/lib/sync/prisma-unavailable"
import { fetchRunFile, SyncApiError } from "@/lib/sync/runs-api"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Streams one artifact of a run back to the browser.
 *
 * Super admin only, same reasoning as the listing: a single snapshot is the full
 * pre-write state of a block in the warehouse.
 *
 * The key is NOT validated here beyond being present — upstream confines it to
 * `sync-runs/<runId>/` and answers 400 otherwise. Re-implementing that check in a
 * second place would create two rules that can drift; the one that matters is the
 * one sitting next to the S3 node.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const unavailable = syncUnavailableInPrisma()
  if (unavailable) return unavailable
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

  const key = request.nextUrl.searchParams.get("key") ?? ""
  if (!key) {
    return Response.json({ error: "key is required" }, { status: 400, headers: { "cache-control": "no-store" } })
  }

  const download = request.nextUrl.searchParams.get("download") === "1"

  try {
    const upstream = await fetchRunFile(runId, key)
    const body = await upstream.arrayBuffer()
    const fileName = key.slice(key.lastIndexOf("/") + 1)

    logApi({
      tag: "route:GET",
      path,
      user,
      status: 200,
      durationMs: Date.now() - t0,
      detail: `${fileName} ${body.byteLength}B${download ? " download" : ""}`,
    })

    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(body.byteLength),
        // `inline` keeps the preview in the dialog; `attachment` is what makes the
        // browser save it under the artifact's own name instead of "snapshot".
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    })
  } catch (err) {
    const status = err instanceof SyncApiError ? err.status : 502
    const message = err instanceof Error ? err.message : "sync api error"
    logApi({ tag: "route:GET", path, user, status, durationMs: Date.now() - t0, error: message })
    return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } })
  }
}
