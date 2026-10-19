/**
 * Forma canónica de los valores, la misma para lo que sale de Strapi, lo que se escribe en
 * `msp_app` y lo que se vuelve a leer al verificar. Todo es texto (o null) para que la
 * comparación sea exacta: `numeric` "12.5000" y Decimal "12.5" valen lo mismo.
 */

export type Value = string | null

export type RawValue = string | number | boolean | null | undefined

export function text(v: RawValue): Value {
  return v === null || v === undefined ? null : String(v)
}

export function int(v: RawValue): Value {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  if (!Number.isInteger(n)) throw new Error(`No es un entero: ${v}`)
  return String(n)
}

/** Decimal sin ceros sobrantes: "12.5000" → "12.5", "-0.00" → "0", "3." → "3". */
export function numeric(v: RawValue): Value {
  if (v === null || v === undefined || v === "") return null
  let s = String(v).trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`No es un decimal en notación normal: ${s}`)
  const negative = s.startsWith("-")
  if (negative) s = s.slice(1)
  let [whole, fraction = ""] = s.split(".")
  whole = whole.replace(/^0+(?=\d)/, "")
  fraction = fraction.replace(/0+$/, "")
  const out = fraction ? `${whole}.${fraction}` : whole
  return negative && out !== "0" ? `-${out}` : out
}

/** double precision: se compara por el número, no por el texto ("1e-07" y "1e-7" son iguales). */
export function float(v: RawValue): Value {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`No es un número: ${v}`)
  return String(n)
}

export function bool(v: RawValue): Value {
  if (v === null || v === undefined) return null
  if (v === true || v === "true" || v === "t" || v === 1 || v === "1") return "true"
  if (v === false || v === "false" || v === "f" || v === 0 || v === "0") return "false"
  throw new Error(`No es booleano: ${v}`)
}

/** Instante en ISO UTC con milisegundos: "2026-10-15T21:00:00.123Z". */
export function timestamp(v: RawValue): Value {
  if (v === null || v === undefined || v === "") return null
  const ms = Date.parse(String(v))
  if (Number.isNaN(ms)) throw new Error(`Fecha inválida: ${v}`)
  return new Date(ms).toISOString()
}

/** Fecha sin hora: "2026-10-15". */
export function date(v: RawValue): Value {
  if (v === null || v === undefined || v === "") return null
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return timestamp(s)!.slice(0, 10)
}

/** Monto con 2 decimales a centavos (BigInt) para sumar sin error de coma flotante. */
export function cents(v: RawValue): bigint {
  const n = numeric(v)
  if (n === null) return 0n
  const negative = n.startsWith("-")
  const [whole, fraction = ""] = (negative ? n.slice(1) : n).split(".")
  const value = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2))
  return negative ? -value : value
}
