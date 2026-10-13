/**
 * Strapi datetime fields for "calendar" dates are often stored as UTC midnight (e.g.
 * 2026-04-09T00:00:00.000Z). Parsing with `new Date` and formatting in America/Guatemala
 * shifts the calendar day. For these fields, the YYYY-MM-DD prefix is authoritative.
 */

export function calendarDateKeyFromIso(iso?: string | null): string | null {
  if (!iso || typeof iso !== "string") return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim())
  return m ? m[1]! : null
}

/** Value for `<input type="date" />` from an API ISO string. */
export function toHtmlDateInputValue(iso?: string | null): string {
  return calendarDateKeyFromIso(iso) ?? ""
}

/** Display as dd/MM/yyyy (matches block view locale style). */
export function formatCalendarDateGt(iso?: string | null): string {
  const key = calendarDateKeyFromIso(iso)
  if (!key) return "-"
  const [y, m, d] = key.split("-")
  return `${d}/${m}/${y}`
}
