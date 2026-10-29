import {
  BANGUAT_ENDPOINT,
  BANGUAT_RANGO_ACTION,
  parseTipoCambioRango,
  tipoCambioRangoEnvelope,
  type ExchangeRateRow,
} from "./banguat.ts"

export type FetchTipoCambioOptions = {
  timeoutMs?: number
  attempts?: number
  onRetry?: (attempt: number, attempts: number, error: Error) => void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * `TipoCambioRango` de Banguat (servicio público, sin credenciales). SOAP exige `POST`, pero es
 * una consulta: no escribe nada. Todo el histórico (7,274 días) cabe en una sola respuesta de
 * ~0.7 MB (verificado el 29 oct 2026). Los errores de red se reintentan; los de traducción no,
 * porque repetir no los arregla. Lo usan `etl/` (carga del histórico) y la ruta del cron.
 */
export async function fetchTipoCambioRango(
  from: string,
  to: string,
  { timeoutMs = 120_000, attempts = 3, onRetry }: FetchTipoCambioOptions = {},
): Promise<{ rows: ExchangeRateRow[]; totalItems: number; ms: number }> {
  let lastError: Error = new Error("Banguat: sin intentos")
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const t0 = Date.now()
    let xml: string
    try {
      const res = await fetch(BANGUAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: BANGUAT_RANGO_ACTION },
        body: tipoCambioRangoEnvelope(from, to),
        signal: AbortSignal.timeout(timeoutMs),
      })
      xml = await res.text()
      if (!res.ok) throw new Error(`Banguat HTTP ${res.status}`)
    } catch (error) {
      lastError = error as Error
      onRetry?.(attempt, attempts, lastError)
      if (attempt < attempts) await sleep(1_000 * attempt)
      continue
    }
    return { ...parseTipoCambioRango(xml), ms: Date.now() - t0 }
  }
  throw lastError
}
