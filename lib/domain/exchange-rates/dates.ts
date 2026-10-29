/**
 * Fechas del tipo de cambio.
 *
 * Banguat y el webhook de n8n escriben las fechas como `DD/MM/AAAA`. Nunca pasan por
 * `new Date(texto)`: JavaScript lee `09/10/2026` como 10 de septiembre sin avisar. Adentro se
 * trabaja con `AAAA-MM-DD`, que es lo que guarda la columna `date` de `exchange_rate`.
 */

const DMY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

function utcDay(year: number, month: number, day: number): number | null {
  const ms = Date.UTC(year, month - 1, day)
  const d = new Date(ms)
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? ms : null
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** `"29/10/2026"` → `"2026-10-29"`. Lanza si el texto no es una fecha real (p. ej. `31/02/2026`). */
export function parseDmy(value: string): string {
  const m = DMY_RE.exec(value.trim())
  const ms = m ? utcDay(Number(m[3]), Number(m[2]), Number(m[1])) : null
  if (ms == null) throw new Error(`Fecha DD/MM/AAAA inválida: "${value}"`)
  return isoFromMs(ms)
}

/** `"2026-10-29"` → `"29/10/2026"`. */
export function formatDmy(iso: string): string {
  const [, y, mo, d] = isoParts(iso)
  return `${d}/${mo}/${y}`
}

function isoParts(iso: string): [string, string, string, string] {
  const m = ISO_RE.exec(iso)
  if (!m || utcDay(Number(m[1]), Number(m[2]), Number(m[3])) == null) throw new Error(`Fecha AAAA-MM-DD inválida: "${iso}"`)
  return [m[0], m[1], m[2], m[3]]
}

/** Milisegundos UTC de una fecha `AAAA-MM-DD`. */
export function isoToUtcMs(iso: string): number {
  const [, y, mo, d] = isoParts(iso)
  return Date.UTC(Number(y), Number(mo) - 1, Number(d))
}

/** Todos los días de `from` a `to`, ambos incluidos, en `AAAA-MM-DD`. */
export function daysInRange(from: string, to: string): string[] {
  const start = isoToUtcMs(from)
  const end = isoToUtcMs(to)
  if (end < start) throw new Error(`Rango invertido: ${from} > ${to}`)
  const days: string[] = []
  for (let ms = start; ms <= end; ms += DAY_MS) days.push(isoFromMs(ms))
  return days
}

/** Hoy en Guatemala (UTC-6, sin horario de verano) como `AAAA-MM-DD`. */
export function todayInGuatemala(now: Date = new Date()): string {
  return isoFromMs(now.getTime() - 6 * 3_600_000)
}

/** Qué días del rango faltan en `dates` y cuáles de `dates` caen fuera del rango. */
export function rangeCoverage(dates: string[], from: string, to: string): { missing: string[]; outside: string[] } {
  const got = new Set(dates)
  return {
    missing: daysInRange(from, to).filter((d) => !got.has(d)),
    outside: dates.filter((d) => d < from || d > to),
  }
}

/** Los últimos `days` días hasta hoy en Guatemala, hoy incluido. */
export function recentRange(days: number, now: Date = new Date()): { from: string; to: string } {
  if (!Number.isInteger(days) || days < 1) throw new Error(`Cantidad de días inválida: ${days}`)
  const to = todayInGuatemala(now)
  return { from: isoFromMs(isoToUtcMs(to) - (days - 1) * DAY_MS), to }
}
