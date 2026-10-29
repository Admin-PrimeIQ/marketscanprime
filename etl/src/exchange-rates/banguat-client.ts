import {
  BANGUAT_ENDPOINT,
  BANGUAT_RANGO_ACTION,
  parseTipoCambioRango,
  tipoCambioRangoEnvelope,
  type ExchangeRateRow,
} from "../../../lib/domain/exchange-rates/banguat.ts"

const TIMEOUT_MS = 120_000
const MAX_ATTEMPTS = 3

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * `TipoCambioRango` de Banguat (servicio público, sin credenciales). SOAP exige `POST`, pero es
 * una consulta: no escribe nada. Todo el histórico (7,274 días) cabe en una sola respuesta de
 * ~0.7 MB (verificado el 29 oct 2026). Reintenta 3 veces; los errores de traducción no se
 * reintentan, porque repetir no los arregla.
 */
export async function fetchTipoCambioRango(from: string, to: string): Promise<{ rows: ExchangeRateRow[]; totalItems: number; ms: number }> {
  let lastError: Error = new Error("Banguat: sin intentos")
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now()
    let xml: string
    try {
      const res = await fetch(BANGUAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: BANGUAT_RANGO_ACTION },
        body: tipoCambioRangoEnvelope(from, to),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      xml = await res.text()
      if (!res.ok) throw new Error(`Banguat HTTP ${res.status}`)
    } catch (error) {
      lastError = error as Error
      console.warn(`Banguat: intento ${attempt}/${MAX_ATTEMPTS} falló: ${lastError.message}`)
      if (attempt < MAX_ATTEMPTS) await sleep(1_000 * attempt)
      continue
    }
    return { ...parseTipoCambioRango(xml), ms: Date.now() - t0 }
  }
  throw lastError
}
