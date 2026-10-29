/**
 * Tendencia del tipo de cambio que muestra la barra lateral (`components/exchange-rate-sidebar.tsx`).
 *
 * Pura: la usan la ruta `/api/exchange-rates` con los dos backends (el webhook de n8n o la tabla
 * `exchange_rate`), así que la barra recibe el mismo objeto venga de donde venga.
 */

export type ExchangeRateSnapshot = {
  /** `DD/MM/AAAA`, tal como lo muestra la barra. */
  date: string
  currency: string
  unit: string
  buy: number | null
  sell: number | null
  referenceRate: number | null
  source?: string
  lastUpdatedUtc?: string
}

/** Tendencia respecto al día anterior. */
export type ExchangeRateDirection = "up" | "down" | "flat" | "unknown"

export type ExchangeRateComparison = {
  current: ExchangeRateSnapshot
  /** Día anterior, para comparar con `current`. */
  previous: ExchangeRateSnapshot | null
  direction: ExchangeRateDirection
  /** Valor comparable actual − anterior (misma lógica que `comparableRate`). */
  delta: number | null
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

export function compareDirection(
  current: number,
  previous: number
): { direction: ExchangeRateDirection; delta: number } {
  const delta = current - previous
  if (Math.abs(delta) < DELTA_EPS) {
    return { direction: "flat", delta: 0 }
  }
  return { direction: delta > 0 ? "up" : "down", delta }
}

/** Arma la comparación de la barra a partir del día actual y el anterior. */
export function compareSnapshots(
  current: ExchangeRateSnapshot,
  previous: ExchangeRateSnapshot | null
): ExchangeRateComparison {
  const c = comparableRate(current)
  const p = previous ? comparableRate(previous) : null
  if (c == null || p == null) {
    return { current, previous, direction: "unknown", delta: null }
  }
  return { current, previous, ...compareDirection(c, p) }
}
