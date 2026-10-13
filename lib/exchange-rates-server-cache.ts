import type { ExchangeRateComparison } from "@/lib/exchange-rates"

/** Duración del caché en memoria (segundos). Override: EXCHANGE_RATES_CACHE_SECONDS */
const DEFAULT_CACHE_SECONDS = 6 * 3600

function cacheTtlMs(): number {
  const raw = process.env.EXCHANGE_RATES_CACHE_SECONDS?.trim()
  if (!raw) return DEFAULT_CACHE_SECONDS * 1000
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 30) return DEFAULT_CACHE_SECONDS * 1000
  return n * 1000
}

type CacheEntry = {
  data: ExchangeRateComparison
  fetchedAt: number
}

let serverCache: CacheEntry | null = null

export function clearExchangeRatesServerCache(): void {
  serverCache = null
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < cacheTtlMs()
}

/** Datos válidos y dentro del TTL, o null. */
export function getFreshExchangeRatesFromCache(): ExchangeRateComparison | null {
  if (!serverCache || !isFresh(serverCache)) return null
  return serverCache.data
}

export function setExchangeRatesServerCache(data: ExchangeRateComparison): void {
  serverCache = { data, fetchedAt: Date.now() }
}

/** Último valor guardado aunque haya expirado (fallback si n8n falla). */
export function getStaleExchangeRatesFromCache(): ExchangeRateComparison | null {
  return serverCache?.data ?? null
}
