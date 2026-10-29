/** Un día del tipo de cambio, venga de la tabla o de n8n. `date` en `AAAA-MM-DD`. */
export type ParityRate = { date: string; currency: string; unit: string; buy: number | null; sell: number | null; referenceRate: number | null }

const FIELDS = ["currency", "unit", "buy", "sell", "referenceRate"] as const
type Field = (typeof FIELDS)[number]

export type ParityDiff = { date: string; field: Field; table: string | number | null; n8n: string | number | null }

export type ParityResult = {
  table: number
  n8n: number
  matched: number
  onlyInTable: string[]
  onlyInN8n: string[]
  duplicatesInN8n: string[]
  diffs: ParityDiff[]
}

/**
 * Compara día por día, sin tolerancia: los dos lados vienen del mismo Banguat con 5 decimales,
 * así que cualquier diferencia es real. Los números se comparan como números (7.6419 = 7.64190000).
 */
export function compareParity(table: ParityRate[], n8n: ParityRate[]): ParityResult {
  const byDate = new Map(table.map((r) => [r.date, r]))
  const seen = new Set<string>()
  const duplicatesInN8n: string[] = []
  const onlyInN8n: string[] = []
  const diffs: ParityDiff[] = []
  let matched = 0

  for (const theirs of n8n) {
    if (seen.has(theirs.date)) {
      duplicatesInN8n.push(theirs.date)
      continue
    }
    seen.add(theirs.date)
    const ours = byDate.get(theirs.date)
    if (!ours) {
      onlyInN8n.push(theirs.date)
      continue
    }
    let same = true
    for (const field of FIELDS) {
      if (ours[field] !== theirs[field]) {
        same = false
        diffs.push({ date: theirs.date, field, table: ours[field], n8n: theirs[field] })
      }
    }
    if (same) matched++
  }

  const onlyInTable = table.filter((r) => !seen.has(r.date)).map((r) => r.date)
  const sort = (a: string[]) => a.sort()
  return {
    table: table.length,
    n8n: n8n.length,
    matched,
    onlyInTable: sort(onlyInTable),
    onlyInN8n: sort(onlyInN8n),
    duplicatesInN8n: sort(duplicatesInN8n),
    diffs: diffs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  }
}

/** `numeric` de Postgres llega como texto; null se conserva. */
export function numericOrNull(value: string | null): number | null {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`Valor numérico inválido en la tabla: "${value}"`)
  return n
}
