/**
 * Traducción de `TipoCambioRango` de Banguat a filas de `exchange_rate`.
 *
 * Los fixtures son respuestas reales del servicio (29 oct 2026). Los valores esperados son los
 * que el GET de n8n devolvía ese día para las mismas fechas.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { BANGUAT_SOURCE, parseTipoCambioRango, rowFromBanguat, tipoCambioRangoEnvelope } from "./banguat.ts"

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")

test("octubre 2026: compra = venta → solo referencia, como n8n", () => {
  const { rows, totalItems } = parseTipoCambioRango(fixture("tipo-cambio-rango-2026-10-15_29.xml"))
  assert.equal(totalItems, 15)
  assert.equal(rows.length, 15)
  assert.equal(rows[0].date, "2026-10-15")
  assert.equal(rows.at(-1)?.date, "2026-10-29")
  assert.deepEqual(rows.at(-1), {
    date: "2026-10-29",
    currency: "USD",
    unit: "GTQ",
    buy: null,
    sell: null,
    referenceRate: 7.64382,
    source: BANGUAT_SOURCE,
  })
  const n8n: Record<string, number> = {
    "2026-10-20": 7.63672, "2026-10-21": 7.63916, "2026-10-22": 7.63938, "2026-10-23": 7.6419,
    "2026-10-24": 7.6419, "2026-10-25": 7.6419, "2026-10-26": 7.63622, "2026-10-27": 7.63979,
    "2026-10-28": 7.64427, "2026-10-29": 7.64382,
  }
  for (const row of rows.filter((r) => r.date in n8n)) {
    assert.equal(row.referenceRate, n8n[row.date], row.date)
    assert.equal(row.buy, null)
    assert.equal(row.sell, null)
  }
})

test("fines de semana: Banguat repite el valor del último día hábil", () => {
  const { rows } = parseTipoCambioRango(fixture("tipo-cambio-rango-2026-10-15_29.xml"))
  const byDate = new Map(rows.map((r) => [r.date, r.referenceRate]))
  assert.equal(byDate.get("2026-10-17"), byDate.get("2026-10-16"))
  assert.equal(byDate.get("2026-10-18"), byDate.get("2026-10-16"))
})

test("2006: compra ≠ venta → compra y venta, referencia en null, como n8n", () => {
  const { rows } = parseTipoCambioRango(fixture("tipo-cambio-rango-2006-11-30_12-02.xml"))
  assert.deepEqual(
    rows.map(({ date, buy, sell, referenceRate }) => ({ date, buy, sell, referenceRate })),
    [
      { date: "2006-11-30", buy: 7.62637, sell: 7.64582, referenceRate: null },
      { date: "2006-12-01", buy: 7.63316, sell: 7.65673, referenceRate: null },
      { date: "2006-12-02", buy: null, sell: null, referenceRate: 7.639 },
    ],
  )
})

test("rowFromBanguat compara números, no textos", () => {
  assert.equal(rowFromBanguat("2026-10-29", 7.639, 7.639).referenceRate, 7.639)
  assert.equal(rowFromBanguat("2026-10-29", 7.1, 7.2).referenceRate, null)
})

const wrap = (vars: string, total: number) =>
  `<soap:Envelope><soap:Body><TipoCambioRangoResponse><TipoCambioRangoResult><Vars>${vars}</Vars>` +
  `<TotalItems>${total}</TotalItems></TipoCambioRangoResult></TipoCambioRangoResponse></soap:Body></soap:Envelope>`
const v = (fecha: string, compra = "7.6", venta = compra, moneda = "2") =>
  `<Var><moneda>${moneda}</moneda><fecha>${fecha}</fecha><venta>${venta}</venta><compra>${compra}</compra></Var>`

test("devuelve las filas en orden de fecha aunque lleguen desordenadas", () => {
  const { rows } = parseTipoCambioRango(wrap(v("02/01/2025") + v("01/01/2025"), 2))
  assert.deepEqual(rows.map((r) => r.date), ["2025-01-01", "2025-01-02"])
})

test("rango sin datos: cero filas, sin error", () => {
  assert.deepEqual(parseTipoCambioRango(wrap("", 0)).rows, [])
})

test("lanza en vez de guardar algo incompleto o raro", () => {
  assert.throws(() => parseTipoCambioRango(wrap(v("01/01/2025"), 2)), /TotalItems=2/)
  assert.throws(() => parseTipoCambioRango(wrap(v("01/01/2025") + v("01/01/2025"), 2)), /repetida/)
  assert.throws(() => parseTipoCambioRango(wrap(v("01/01/2025", "7.6", "7.6", "24"), 1)), /moneda inesperada/)
  assert.throws(() => parseTipoCambioRango(wrap(v("01/01/2025", "abc"), 1)), /compra inválida/)
  assert.throws(() => parseTipoCambioRango(wrap(v("01/01/2025", "0"), 1)), /compra inválida/)
  assert.throws(() => parseTipoCambioRango(wrap(v("31/02/2025"), 1)), /inválida/)
  assert.throws(() => parseTipoCambioRango("<html>mantenimiento</html>"), /sin TipoCambioRangoResult/)
  assert.throws(
    () => parseTipoCambioRango("<soap:Fault><faultstring>Server was unable to process request.</faultstring></soap:Fault>"),
    /error SOAP: Server was unable/,
  )
})

test("el sobre manda las fechas en DD/MM/AAAA", () => {
  const xml = tipoCambioRangoEnvelope("2006-11-30", "2026-10-29")
  assert.match(xml, /<fechainit>30\/11\/2006<\/fechainit><fechafin>29\/10\/2026<\/fechafin>/)
  assert.match(xml, /<TipoCambioRango xmlns="http:\/\/www\.banguat\.gob\.gt\/variables\/ws\/">/)
})
