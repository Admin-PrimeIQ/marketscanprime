import type { NextRequest } from "next/server"
import { resolveDataBackend } from "@/lib/api/data-backend"
import { isValidStrapiBearer } from "@/lib/auth/verify-strapi-bearer"
import { logApi, userFromBearer } from "@/lib/server-logger"
import {
  clearExchangeRatesServerCache,
  getFreshExchangeRatesFromCache,
  getStaleExchangeRatesFromCache,
  setExchangeRatesServerCache,
} from "@/lib/exchange-rates-server-cache"
import { loadExchangeRatesFromWebhook } from "@/lib/exchange-rates"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Quién llama. Backend `prisma`: el usuario de la sesión de Better Auth (cookie), cargado con
 * `import()` para que el backend `strapi` nunca toque la base nueva. Si no, el bearer de Strapi.
 */
async function caller(request: NextRequest): Promise<{ ok: boolean; user: string }> {
  if (resolveDataBackend() === "prisma") {
    const { requireUser } = await import("@/lib/db/session")
    try {
      return { ok: true, user: (await requireUser()).email }
    } catch {
      return { ok: false, user: "anon" }
    }
  }
  const authorization = request.headers.get("authorization")
  return { ok: await isValidStrapiBearer(authorization), user: userFromBearer(authorization) }
}

export async function GET(request: NextRequest) {
  const t0   = Date.now()
  const path = request.nextUrl.pathname

  const { ok, user } = await caller(request)
  if (!ok) {
    logApi({ tag: "route:GET", path, user, status: 401, durationMs: Date.now() - t0, error: "Unauthorized" })
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } }
    )
  }

  const fresh = getFreshExchangeRatesFromCache()
  if (fresh) {
    logApi({ tag: "route:GET", path, user, status: 200, durationMs: Date.now() - t0, detail: "cache:hit" })
    return Response.json(fresh, {
      headers: { "cache-control": "no-store", "x-exchange-rates-cache": "hit" },
    })
  }

  try {
    const data = await loadExchangeRatesFromWebhook()
    setExchangeRatesServerCache(data)
    logApi({ tag: "route:GET", path, user, status: 200, durationMs: Date.now() - t0, detail: "cache:miss" })
    return Response.json(data, {
      headers: { "cache-control": "no-store", "x-exchange-rates-cache": "miss" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "exchange rates error"
    const stale = getStaleExchangeRatesFromCache()
    if (stale) {
      logApi({ tag: "route:GET", path, user, status: 200, durationMs: Date.now() - t0, detail: "cache:stale", error: message })
      return Response.json(stale, {
        headers: { "cache-control": "no-store", "x-exchange-rates-stale": "1", "x-exchange-rates-cache": "stale" },
      })
    }
    logApi({ tag: "route:GET", path, user, status: 503, durationMs: Date.now() - t0, error: message })
    return Response.json(
      { error: message },
      { status: 503, headers: { "cache-control": "no-store" } }
    )
  }
}

/** Vacía la caché en memoria del tipo de cambio (p. ej. al cerrar sesión). */
export async function DELETE(request: NextRequest) {
  const t0   = Date.now()
  const path = request.nextUrl.pathname

  const { ok, user } = await caller(request)
  if (!ok) {
    logApi({ tag: "route:DELETE", path, user, status: 401, durationMs: Date.now() - t0, error: "Unauthorized" })
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } }
    )
  }

  clearExchangeRatesServerCache()
  logApi({ tag: "route:DELETE", path, user, status: 204, durationMs: Date.now() - t0, detail: "cache cleared" })

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  })
}
