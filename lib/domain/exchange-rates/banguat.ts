/**
 * Servicio web del Banco de Guatemala: operación `TipoCambioRango` (SOAP 1.1).
 *
 *   https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx?op=TipoCambioRango
 *
 * Pura: arma el sobre de la consulta y traduce la respuesta a filas de `exchange_rate`. La llamada
 * de red vive en quien la use (`etl/src/exchange-rates/`).
 *
 * Regla de compra/venta, la misma del workflow de n8n que reemplaza (verificada contra su GET el
 * 29 oct 2026): si Banguat da compra = venta, se guarda solo `referenceRate` y `buy`/`sell` quedan
 * en null; si difieren (solo el 30/11/2006 y el 01/12/2006 en todo el histórico), se guardan
 * `buy`/`sell` y `referenceRate` queda en null.
 */

import { formatDmy, parseDmy } from "./dates.ts"

export const BANGUAT_ENDPOINT = "https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx"
export const BANGUAT_RANGO_ACTION = '"http://www.banguat.gob.gt/variables/ws/TipoCambioRango"'
export const BANGUAT_SOURCE = "Bank of Guatemala (Banguat)"
/** Código de Banguat para el dólar. `TipoCambioRango` solo devuelve dólares. */
export const BANGUAT_USD = "2"

/** Fila de `msp_app.exchange_rate`. `date` en `AAAA-MM-DD`. */
export type ExchangeRateRow = {
  date: string
  currency: "USD"
  unit: "GTQ"
  buy: number | null
  sell: number | null
  referenceRate: number | null
  source: string
}

/** Sobre SOAP de `TipoCambioRango`; `from`/`to` en `AAAA-MM-DD`. */
export function tipoCambioRangoEnvelope(from: string, to: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><TipoCambioRango xmlns="http://www.banguat.gob.gt/variables/ws/">` +
    `<fechainit>${formatDmy(from)}</fechainit><fechafin>${formatDmy(to)}</fechafin>` +
    `</TipoCambioRango></soap:Body></soap:Envelope>`
  )
}

const VAR_RE = /<Var>([\s\S]*?)<\/Var>/g
const TOTAL_RE = /<TotalItems>\s*(\d+)\s*<\/TotalItems>/
const FAULT_RE = /<faultstring>([\s\S]*?)<\/faultstring>/

function tagText(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block)
  return m ? m[1].trim() : null
}

function rate(value: string | null, field: string, date: string): number {
  const n = value == null || value === "" ? Number.NaN : Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Banguat: ${field} inválida el ${date}: "${value}"`)
  return n
}

/** Aplica la regla de compra/venta de n8n (ver cabecera). */
export function rowFromBanguat(date: string, compra: number, venta: number): ExchangeRateRow {
  const same = compra === venta
  return {
    date,
    currency: "USD",
    unit: "GTQ",
    buy: same ? null : compra,
    sell: same ? null : venta,
    referenceRate: same ? compra : null,
    source: BANGUAT_SOURCE,
  }
}

/**
 * Respuesta de `TipoCambioRango` → filas ordenadas por fecha. Lanza ante un `soap:Fault`, una
 * moneda que no sea el dólar, un número inválido, una fecha repetida o un `TotalItems` que no
 * cuadra con las filas leídas: mejor no guardar nada que guardar algo incompleto.
 */
export function parseTipoCambioRango(xml: string): { rows: ExchangeRateRow[]; totalItems: number } {
  const fault = FAULT_RE.exec(xml)
  if (fault) throw new Error(`Banguat respondió un error SOAP: ${fault[1].trim()}`)
  if (!xml.includes("<TipoCambioRangoResult>")) throw new Error("Banguat: respuesta sin TipoCambioRangoResult")

  const total = TOTAL_RE.exec(xml)
  if (!total) throw new Error("Banguat: respuesta sin TotalItems")
  const totalItems = Number(total[1])

  const rows: ExchangeRateRow[] = []
  const seen = new Set<string>()
  for (const [, block] of xml.matchAll(VAR_RE)) {
    const rawDate = tagText(block, "fecha") ?? ""
    const date = parseDmy(rawDate)
    const moneda = tagText(block, "moneda")
    if (moneda !== BANGUAT_USD) throw new Error(`Banguat: moneda inesperada "${moneda}" el ${rawDate}`)
    if (seen.has(date)) throw new Error(`Banguat: fecha repetida ${rawDate}`)
    seen.add(date)
    rows.push(rowFromBanguat(date, rate(tagText(block, "compra"), "compra", rawDate), rate(tagText(block, "venta"), "venta", rawDate)))
  }

  if (rows.length !== totalItems) {
    throw new Error(`Banguat: TotalItems=${totalItems} pero se leyeron ${rows.length} filas`)
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { rows, totalItems }
}
