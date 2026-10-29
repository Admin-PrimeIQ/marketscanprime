import type { NextRequest } from "next/server"
import { resolveDataBackend } from "@/lib/api/data-backend"
import { PublicError } from "@/lib/db/action-result"
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

type Caller =
  | { status: "ok"; user: string }
  | { status: "unauthorized"; user: string }
  | { status: "unavailable"; user: string; error: string }

/**
 * Quién llama. Backend `prisma`: el usuario de la sesión de Better Auth (cookie), cargado con
 * `import()` para que el backend `strapi` nunca toque la base nueva. Si no, el bearer de Strapi.
 * Sin sesión es 401; si la base no responde no se sabe quién es, y es 503 (no un falso "sin sesión").
 */
async function caller(request: NextRequest): Promise<Caller> {
  if (resolveDataBackend() === "prisma") {
    const { requireUser } = await import("@/lib/db/session")
    try {
      return { status: "ok", user: (await requireUser()).email }
    } catch (error) {
      if (error instanceof PublicError) return { status: "unauthorized", user: "anon" }
      const code = (error as { code?: unknown } | null)?.code
      const message = error instanceof Error ? error.message : String(error)
      return { status: "unavailable", user: "anon", error: code ? `${String(code)}: ${message}` : message }
    }
  }
  const authorization = request.headers.get("authorization")
  const user = userFromBearer(authorization)
  return (await isValidStrapiBearer(authorization)) ? { status: "ok", user } : { status: "unauthorized", user }
}

/** Respuesta de 401/503 cuando no se pudo identificar a quien llama; `null` si puede seguir. */
function rejectCaller(who: Caller, tag: string, path: string, t0: number): Response | null {
  if (who.status === "ok") return null
  if (who.status === "unauthorized") {
    logApi({ tag, path, user: who.user, status: 401, durationMs: Date.now() - t0, error: "Unauthorized" })
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } })
  }
  logApi({ tag, path, user: who.user, status: 503, durationMs: Date.now() - t0, error: who.error })
  return Response.json({ error: "Service unavailable" }, { status: 503, headers: { "cache-control": "no-store" } })
}

export async function GET(request: NextRequest) {
  const t0   = Date.now()
  const path = request.nextUrl.pathname

  const who = await caller(request)
  const rejected = rejectCaller(who, "route:GET", path, t0)
  if (rejected) return rejected
  const { user } = who

  // Backend `prisma`: la tabla `exchange_rate` (la llena etl/src/exchange-rates desde Banguat). Sin
  // caché en memoria: la tabla ya guarda el último dato conocido aunque Banguat no responda.
  if (resolveDataBackend() === "prisma") {
    try {
      const { getLatestExchangeRateComparison } = await import("@/lib/db/exchange-rates")
      const data = await getLatestExchangeRateComparison()
      if (!data) {
        logApi({ tag: "route:GET", path, user, status: 503, durationMs: Date.now() - t0, error: "exchange_rate vacía" })
        return Response.json({ error: "exchange rates: empty table" }, { status: 503, headers: { "cache-control": "no-store" } })
      }
      logApi({ tag: "route:GET", path, user, status: 200, durationMs: Date.now() - t0, detail: "db" })
      return Response.json(data, { headers: { "cache-control": "no-store", "x-exchange-rates-source": "db" } })
    } catch (err) {
      const message = err instanceof Error ? err.message : "exchange rates error"
      logApi({ tag: "route:GET", path, user, status: 503, durationMs: Date.now() - t0, error: message })
      return Response.json({ error: "Service unavailable" }, { status: 503, headers: { "cache-control": "no-store" } })
    }
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

  const who = await caller(request)
  const rejected = rejectCaller(who, "route:DELETE", path, t0)
  if (rejected) return rejected
  const { user } = who

  clearExchangeRatesServerCache()
  logApi({ tag: "route:DELETE", path, user, status: 204, durationMs: Date.now() - t0, detail: "cache cleared" })

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  })
}
