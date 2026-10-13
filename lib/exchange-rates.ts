const DEFAULT_EXCHANGE_RATES_URL =
  "https://n8n.primeiqlatam.com/webhook/primeiq/exchange-rates"

export type ExchangeRateSnapshot = {
  date: string
  currency: string
  unit: string
  buy: number | null
  sell: number | null
  referenceRate: number | null
  source?: string
  lastUpdatedUtc?: string
}

/** Tendencia respecto a `data[1]` (posición 1 del arreglo). */
export type ExchangeRateDirection = "up" | "down" | "flat" | "unknown"

export type ExchangeRateComparison = {
  current: ExchangeRateSnapshot
  /** Registro en `data[1]` para comparar con `data[0]`. */
  previous: ExchangeRateSnapshot | null
  direction: ExchangeRateDirection
  /** Valor comparable actual − anterior (misma lógica que `comparableRate`). */
  delta: number | null
}

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

/**
 * Valor único para comparar días: referencia si existe; si no, promedio compra/venta; si no, compra o venta.
 */
export function comparableRate(s: ExchangeRateSnapshot): number | null {
  if (s.referenceRate != null && !Number.isNaN(s.referenceRate)) {
    return s.referenceRate
  }
  if (s.buy != null && s.sell != null) {
    return (s.buy + s.sell) / 2
  }
  const one = s.buy ?? s.sell
  return one != null && !Number.isNaN(one) ? one : null
}

const DELTA_EPS = 1e-5

function compareDirection(
  current: number,
  previous: number
): { direction: ExchangeRateDirection; delta: number } {
  const delta = current - previous
  if (Math.abs(delta) < DELTA_EPS) {
    return { direction: "flat", delta: 0 }
  }
  return { direction: delta > 0 ? "up" : "down", delta }
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

      const c = comparableRate(current)
      const p = previous ? comparableRate(previous) : null

      if (c == null || p == null) {
        return {
          current,
          previous,
          direction: "unknown",
          delta: null,
        }
      }

      const { direction, delta } = compareDirection(c, p)

      return {
        current,
        previous,
        direction,
        delta,
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (attempt < maxAttempts - 1) {
        await sleep(500 * (attempt + 1))
      }
    }
  }

  throw lastErr
}
