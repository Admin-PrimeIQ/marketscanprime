import {
  compareSnapshots,
  type ExchangeRateComparison,
  type ExchangeRateSnapshot,
} from "./domain/exchange-rates/compare.ts"

// La tendencia vive en lib/domain/exchange-rates/compare.ts (pura); se reexporta para que la
// barra lateral y la ruta sigan importando de acá.
export { comparableRate, compareDirection, compareSnapshots } from "./domain/exchange-rates/compare.ts"
export type {
  ExchangeRateComparison,
  ExchangeRateDirection,
  ExchangeRateSnapshot,
} from "./domain/exchange-rates/compare.ts"

const DEFAULT_EXCHANGE_RATES_URL =
  "https://n8n.primeiqlatam.com/webhook/primeiq/exchange-rates"

type JsonApiResource = {
  type?: string
  id?: string
  attributes?: {
    date?: string
    buy?: number | null
    sell?: number | null
    referenceRate?: number | null
    currency?: string
    unit?: string
  }
}

type JsonApiEnvelope = {
  data?: JsonApiResource[]
  meta?: {
    source?: string
    lastUpdatedUtc?: string
  }
}

function snapshotFromResource(
  resource: JsonApiResource,
  meta?: JsonApiEnvelope["meta"]
): ExchangeRateSnapshot | null {
  const a = resource.attributes
  if (!a?.date) return null
  return {
    date: a.date,
    currency: a.currency ?? "USD",
    unit: a.unit ?? "GTQ",
    buy: a.buy ?? null,
    sell: a.sell ?? null,
    referenceRate: a.referenceRate ?? null,
    source: meta?.source,
    lastUpdatedUtc: meta?.lastUpdatedUtc,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Llama al webhook n8n (sin caché de Next). Usado por la API route; cada invocación dispara red real.
 */
export async function loadExchangeRatesFromWebhook(): Promise<ExchangeRateComparison> {
  const url =
    process.env.EXCHANGE_RATES_WEBHOOK_URL?.trim() || DEFAULT_EXCHANGE_RATES_URL

  const maxAttempts = 3
  let lastErr: Error = new Error("exchange rates: no attempts")

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      })

      if (!res.ok) {
        throw new Error(`exchange rates HTTP ${res.status}`)
      }

      const raw: unknown = await res.json()
      if (!raw || typeof raw !== "object" || "message" in raw) {
        throw new Error("exchange rates: invalid JSON envelope")
      }

      const body = raw as JsonApiEnvelope

      const row0 = body.data?.[0]
      if (!row0) {
        throw new Error("exchange rates: empty data")
      }

      const current = snapshotFromResource(row0, body.meta)
      if (!current) {
        throw new Error("exchange rates: bad snapshot")
      }

      const row1 = body.data?.[1]
      const previous = row1 ? snapshotFromResource(row1, body.meta) : null

      return compareSnapshots(current, previous)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (attempt < maxAttempts - 1) {
        await sleep(500 * (attempt + 1))
      }
    }
  }

  throw lastErr
}
