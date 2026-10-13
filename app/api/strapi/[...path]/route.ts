/**
 * /api/strapi/[...path]
 *
 * Generic transparent proxy that forwards every request to Strapi and logs:
 *   • method + path + query string
 *   • authenticated user (decoded from JWT — no signature verification needed)
 *   • HTTP status code
 *   • round-trip duration
 *   • short request body summary
 *   • error message when the upstream returns a non-2xx response
 *
 * The StrapiClient uses /api/strapi as its baseURL when running in the browser,
 * so ALL Strapi API calls are routed here.
 */

import { type NextRequest, NextResponse } from "next/server"
import { logApi, resolveUserEmail } from "@/lib/server-logger"

const STRAPI_API_URL =
  process.env.NEXT_PUBLIC_STRAPI_URL
    ? `${process.env.NEXT_PUBLIC_STRAPI_URL}/api`
    : "http://localhost:1337/api"

// Headers that must not be forwarded to the upstream
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
])

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const method  = request.method
  const segment = path.join("/")
  const search  = request.nextUrl.search          // "?populate=block&…"
  const upstream = `${STRAPI_API_URL}/${segment}${search}`

  const user = await resolveUserEmail(request.headers.get("authorization"), STRAPI_API_URL)
  const logPath = `/${segment}${search.length > 60 ? search.slice(0, 60) + "…" : search}`

  // ── Forward headers (strip hop-by-hop + host) ──────────────────────────────
  const forwardHeaders = new Headers()
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) forwardHeaders.set(key, value)
  })

  // ── Read request body (for logging + forwarding) ──────────────────────────
  let bodyText: string | undefined
  let bodyForLog = ""
  const hasBody = method !== "GET" && method !== "HEAD"

  if (hasBody) {
    try {
      bodyText = await request.text()
      if (bodyText) {
        // POST/PUT: log the full payload so nothing is hidden in server logs
        bodyForLog = bodyText
      }
    } catch {
      bodyForLog = "(unreadable body)"
    }
  }

  // ── Call Strapi ────────────────────────────────────────────────────────────
  const t0 = Date.now()
  let status = 0
  let responseText = ""

  try {
    const upstreamRes = await fetch(upstream, {
      method,
      headers: forwardHeaders,
      body: hasBody ? bodyText : undefined,
      // Disable Next.js request caching — we always want fresh data
      cache: "no-store",
    })

    status = upstreamRes.status
    const durationMs = Date.now() - t0

    // ── Read response body ─────────────────────────────────────────────────
    responseText = await upstreamRes.text()

    // ── Log ───────────────────────────────────────────────────────────────
    let detail = bodyForLog || undefined
    let error: string | undefined

    if (!upstreamRes.ok) {
      try {
        const parsed = JSON.parse(responseText) as {
          error?: { message?: string; details?: unknown }
          message?: string
        }
        error =
          parsed?.error?.message ||
          parsed?.message ||
          responseText.slice(0, 200)
      } catch {
        error = responseText.slice(0, 200)
      }
    } else if (method === "GET") {
      // For GET, log how many records came back
      try {
        const parsed = JSON.parse(responseText) as {
          data?: unknown[]
          meta?: { pagination?: { total?: number } }
        }
        const total = parsed?.meta?.pagination?.total
        const count = Array.isArray(parsed?.data) ? parsed.data.length : undefined
        if (total !== undefined) detail = `total:${total}`
        else if (count !== undefined) detail = `count:${count}`
      } catch { /* non-JSON response */ }
    }

    logApi({
      tag:       `strapi:${method}`,
      path:      logPath,
      user,
      status,
      durationMs,
      detail,
      error,
    })

    // ── Return upstream response to the client ─────────────────────────────
    const responseHeaders = new Headers()
    upstreamRes.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.set(key, value)
    })
    // Ensure content-type is preserved
    const ct = upstreamRes.headers.get("content-type")
    if (ct) responseHeaders.set("content-type", ct)

    return new NextResponse(responseText, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    })

  } catch (err) {
    const durationMs = Date.now() - t0
    const errorMessage = err instanceof Error ? err.message : String(err)

    logApi({
      tag:       `strapi:${method}`,
      path:      logPath,
      user,
      status:    status || 503,
      durationMs,
      error:     errorMessage,
    })

    return NextResponse.json(
      { error: "Proxy error", detail: errorMessage },
      { status: 503 }
    )
  }
}

// ── Route handlers ─────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, (await params).path)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, (await params).path)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, (await params).path)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, (await params).path)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, (await params).path)
}
