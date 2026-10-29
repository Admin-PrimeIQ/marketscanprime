import type { NextRequest } from "next/server"
import { resolveDataBackend } from "@/lib/api/data-backend"
import { isCronSecretConfigured, isValidCronBearer } from "@/lib/cron-secret"
import { assertPrismaActionsAllowed } from "@/lib/db/guard"
import { logApi } from "@/lib/server-logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TAG = "cron:POST"
const NO_STORE = { "cache-control": "no-store" }

/**
 * Trae el tipo de cambio de Banguat a `msp_app.exchange_rate` (últimos 15 días). La dispara un
 * cron externo con `Authorization: Bearer <CRON_SECRET>`. Fuera del backend `prisma` en un
 * despliegue de staging (`MSP_STAGING_DEPLOY=true`), o sin `CRON_SECRET`, responde 404: en
 * producción la ruta existe pero no hace nada.
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now()
  const path = request.nextUrl.pathname
  const log = (status: number, extra: { detail?: string; error?: string } = {}) =>
    logApi({ tag: TAG, path, user: "cron", status, durationMs: Date.now() - t0, ...extra })

  let enabled = resolveDataBackend() === "prisma" && isCronSecretConfigured(process.env.CRON_SECRET)
  if (enabled) {
    try {
      assertPrismaActionsAllowed()
    } catch {
      enabled = false
    }
  }
  if (!enabled) {
    log(404, { error: "cron deshabilitado en este despliegue" })
    return Response.json({ error: "Not found" }, { status: 404, headers: NO_STORE })
  }

  if (!isValidCronBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    log(401, { error: "Unauthorized" })
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE })
  }

  const { syncRecentExchangeRates, ExchangeRateSourceError, ExchangeRateSyncBusyError } = await import("@/lib/db/exchange-rate-sync")
  try {
    const result = await syncRecentExchangeRates()
    log(200, {
      detail: `${result.from}..${result.to} recibidos ${result.received}, insertados ${result.inserted}, cambiados ${result.updated}, iguales ${result.unchanged}, faltan ${result.missingDays.length}`,
    })
    return Response.json({ ...result, ms: Date.now() - t0 }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof ExchangeRateSourceError) {
      log(502, { error: message })
      return Response.json({ error: "Banguat no disponible" }, { status: 502, headers: NO_STORE })
    }
    if (error instanceof ExchangeRateSyncBusyError) {
      log(409, { error: message })
      return Response.json({ error: "Otra carga en curso" }, { status: 409, headers: NO_STORE })
    }
    log(503, { error: message })
    return Response.json({ error: "Service unavailable" }, { status: 503, headers: NO_STORE })
  }
}
