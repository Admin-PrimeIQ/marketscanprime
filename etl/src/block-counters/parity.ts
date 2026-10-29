import { BLOCK_COUNTER_FIELDS, computeBlockCounters, type BlockCounterField, type BlockCounters, type CounterUnit } from "../../../lib/domain/blocks/counters.ts"

/** Lo guardado en `msp_app.block`, con los nombres del workflow; `null` = columna vacía. */
export type StoredCounters = { [F in BlockCounterField]: number | null }

export type ParityBlock = {
  id: number
  publicId: string
  code: string | null
  legacyId: string | null
  domain: string
  stored: StoredCounters
  units: CounterUnit[]
}

/**
 * - `igual`: los 10 campos coinciden.
 * - `sin-calcular`: tiene unidades y los 10 campos están vacíos; el workflow nunca lo escribió.
 * - `distinto`: al menos un campo no coincide.
 */
export type ParityStatus = "igual" | "sin-calcular" | "distinto"

export type FieldDiff = { field: BlockCounterField; stored: number | null; computed: number | null }

export type BlockParity = {
  id: number
  publicId: string
  code: string | null
  legacyId: string | null
  domain: string
  units: number
  status: ParityStatus
  diffs: FieldDiff[]
}

export type ParitySummary = {
  blocks: number
  withoutUnits: number
  byStatus: Record<ParityStatus, number>
  /** Bloques `distinto` en los que ese campo no coincide. */
  byField: Record<BlockCounterField, number>
  /** `con-legacy` = vino del warehouse (lo empuja `sync-database`); `sin-legacy` = nació en el backoffice. */
  byOrigin: Record<"con-legacy" | "sin-legacy", Record<ParityStatus, number>>
  byDomain: Record<string, Record<ParityStatus, number>>
}

/** Las columnas tienen 2 decimales y la función redondea a 2: se comparan en centésimas. */
function sameValue(stored: number | null, computed: number | null): boolean {
  if (stored === null || computed === null) return stored === computed
  return Math.round(stored * 100) === Math.round(computed * 100)
}

export function compareBlock(block: ParityBlock): BlockParity {
  const computed: BlockCounters = computeBlockCounters(block.units)
  const diffs: FieldDiff[] = []
  for (const field of BLOCK_COUNTER_FIELDS) {
    if (!sameValue(block.stored[field], computed[field])) diffs.push({ field, stored: block.stored[field], computed: computed[field] })
  }
  const neverWritten = block.units.length > 0 && BLOCK_COUNTER_FIELDS.every((f) => block.stored[f] === null)
  const status: ParityStatus = diffs.length === 0 ? "igual" : neverWritten ? "sin-calcular" : "distinto"
  return {
    id: block.id,
    publicId: block.publicId,
    code: block.code,
    legacyId: block.legacyId,
    domain: block.domain,
    units: block.units.length,
    status,
    diffs,
  }
}

const emptyStatus = (): Record<ParityStatus, number> => ({ igual: 0, "sin-calcular": 0, distinto: 0 })

export function summarize(results: BlockParity[]): ParitySummary {
  const byField = Object.fromEntries(BLOCK_COUNTER_FIELDS.map((f) => [f, 0])) as Record<BlockCounterField, number>
  const summary: ParitySummary = {
    blocks: results.length,
    withoutUnits: 0,
    byStatus: emptyStatus(),
    byField,
    byOrigin: { "con-legacy": emptyStatus(), "sin-legacy": emptyStatus() },
    byDomain: {},
  }
  for (const r of results) {
    if (r.units === 0) summary.withoutUnits++
    summary.byStatus[r.status]++
    summary.byOrigin[r.legacyId ? "con-legacy" : "sin-legacy"][r.status]++
    ;(summary.byDomain[r.domain] ??= emptyStatus())[r.status]++
    if (r.status === "distinto") for (const d of r.diffs) summary.byField[d.field]++
  }
  return summary
}

/** `numeric` de Postgres llega como texto; null se conserva. */
export function numericOrNull(value: string | null): number | null {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`Valor numérico inválido en msp_app: "${value}"`)
  return n
}
