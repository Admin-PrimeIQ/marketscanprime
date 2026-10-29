import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import pg from "pg"
import { BLOCK_COUNTER_FIELDS, type CounterUnit } from "../../../lib/domain/blocks/counters.ts"
import { APP_SCHEMA, appPoolConfig } from "../app/connection"
import { ETL_ROOT } from "../db/env"
import { compareBlock, numericOrNull, summarize, type BlockParity, type ParityBlock, type StoredCounters } from "./parity"

/**
 * Paridad de los contadores del bloque (paso 2 de docs/migration/N8N_WORKFLOWS.md, workflow 6).
 *
 *   parity  recalcula con `lib/domain/blocks/counters.ts` los contadores de cada bloque de
 *           `msp_app` a partir de sus unidades y los compara con lo que guardó el workflow de n8n
 *           (las columnas que copió el ETL desde Strapi). Sesión y transacción de solo lectura:
 *           no escribe nada. Deja el detalle en etl/reports/block-counters-parity-*.{json,csv}.
 *
 * Lo guardado es la foto de la última carga del ETL; si alguien guardó unidades en la hoja después,
 * Strapi ya tiene otros valores, pero `msp_app` no.
 */

const USAGE = "Uso: tsx src/block-counters/index.ts parity"
const REPORTS_DIR = resolve(ETL_ROOT, "reports")

const STORED_COLUMNS: Record<keyof StoredCounters, string> = {
  availableUnits: "available_units",
  availableM2: "available_m2",
  totalUnits: "total_units",
  totalM2: "total_m2",
  averagePricePerM2USD: "average_price_per_m2_usd",
  averageInstallmentUSD: "average_installment_usd",
  averageIncomeUSD: "average_income_usd",
  assignedParking: "assigned_parking",
  averagePriceUSD: "average_price_usd",
  averageSizeM2: "average_size_m2",
}

type BlockRow = { id: number; public_id: string; code: string | null; legacy_id: string | null; domain: string } & Record<string, string | null>

type UnitRow = {
  block_id: number
  availability: string | null
  unit_size_m2: string | null
  total_size_m2: string | null
  total_price_usd: string | null
  price_per_m2_usd: string | null
  installment_usd: string | null
  income_usd: string | null
  parking_spaces: number | null
}

const n = (v: number) => v.toLocaleString("es-GT")

async function readBlocks(): Promise<ParityBlock[]> {
  const client = new pg.Client({ ...appPoolConfig(), options: `-c search_path=${APP_SCHEMA} -c default_transaction_read_only=on` })
  await client.connect()
  try {
    await client.query("BEGIN READ ONLY")
    const { rows: ro } = await client.query<{ ro: string }>("SELECT current_setting('transaction_read_only') AS ro")
    if (ro[0].ro !== "on") throw new Error("La transacción no quedó en solo lectura; no se sigue.")

    const storedSelect = BLOCK_COUNTER_FIELDS.map((f) => `"${STORED_COLUMNS[f]}"::text AS "${STORED_COLUMNS[f]}"`).join(", ")
    const { rows: blocks } = await client.query<BlockRow>(
      `SELECT id, public_id, code, legacy_id, domain::text AS domain, ${storedSelect} FROM "${APP_SCHEMA}"."block" ORDER BY id`,
    )
    // Orden por id: es el que devolvía Strapi sin `sort`, y el orden de la suma puede mover el último decimal.
    const { rows: units } = await client.query<UnitRow>(
      `SELECT block_id, availability::text AS availability, unit_size_m2::text, total_size_m2::text, total_price_usd::text,
              price_per_m2_usd::text, installment_usd::text, income_usd::text, parking_spaces
         FROM "${APP_SCHEMA}"."unit" ORDER BY block_id, id`,
    )
    await client.query("COMMIT")

    const unitsByBlock = new Map<number, CounterUnit[]>()
    for (const u of units) {
      const list = unitsByBlock.get(u.block_id) ?? []
      list.push({
        availability: u.availability,
        unitSizeM2: numericOrNull(u.unit_size_m2),
        totalSizeM2: numericOrNull(u.total_size_m2),
        totalPriceUSD: numericOrNull(u.total_price_usd),
        pricePerM2USD: numericOrNull(u.price_per_m2_usd),
        installmentUSD: numericOrNull(u.installment_usd),
        incomeUSD: numericOrNull(u.income_usd),
        parkingSpaces: u.parking_spaces,
      })
      unitsByBlock.set(u.block_id, list)
    }

    return blocks.map((b) => ({
      id: b.id,
      publicId: b.public_id,
      code: b.code,
      legacyId: b.legacy_id || null,
      domain: b.domain,
      stored: Object.fromEntries(BLOCK_COUNTER_FIELDS.map((f) => [f, numericOrNull(b[STORED_COLUMNS[f]])])) as StoredCounters,
      units: unitsByBlock.get(b.id) ?? [],
    }))
  } finally {
    await client.end().catch(() => {})
  }
}

function csvCell(value: string | number | null): string {
  if (value === null) return ""
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function writeReports(report: unknown, results: BlockParity[]): { json: string; csv: string } {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const json = resolve(REPORTS_DIR, `block-counters-parity-${stamp}.json`)
  const csv = resolve(REPORTS_DIR, `block-counters-parity-${stamp}.csv`)
  writeFileSync(json, JSON.stringify(report, null, 2))
  const lines = ["block_id,public_id,code,legacy_id,domain,units,status,field,stored,computed"]
  for (const r of results) {
    for (const d of r.diffs) {
      lines.push([r.id, r.publicId, r.code, r.legacyId, r.domain, r.units, r.status, d.field, d.stored, d.computed].map(csvCell).join(","))
    }
  }
  writeFileSync(csv, lines.join("\n"))
  return { json, csv }
}

async function parity() {
  const startedAt = new Date().toISOString()
  const blocks = await readBlocks()
  const results = blocks.map(compareBlock)
  const summary = summarize(results)
  const unitCount = blocks.reduce((acc, b) => acc + b.units.length, 0)

  console.log(`msp_app: ${n(summary.blocks)} bloques, ${n(unitCount)} unidades (${n(summary.withoutUnits)} bloques sin unidades)`)
  console.log(`\nIgual a lo guardado: ${n(summary.byStatus.igual)} · nunca calculados: ${n(summary.byStatus["sin-calcular"])} · distintos: ${n(summary.byStatus.distinto)}`)
  for (const [origin, s] of Object.entries(summary.byOrigin)) {
    console.log(`  ${origin}: igual ${n(s.igual)}, sin calcular ${n(s["sin-calcular"])}, distinto ${n(s.distinto)}`)
  }
  for (const [domain, s] of Object.entries(summary.byDomain)) {
    console.log(`  ${domain}: igual ${n(s.igual)}, sin calcular ${n(s["sin-calcular"])}, distinto ${n(s.distinto)}`)
  }
  console.log("\nCampos que no coinciden (bloques distintos):")
  for (const [field, count] of Object.entries(summary.byField)) console.log(`  ${field}: ${n(count)}`)

  const examples = results.filter((r) => r.status === "distinto").slice(0, 10)
  if (examples.length > 0) console.log("\nPrimeros bloques distintos:")
  for (const r of examples) {
    const detail = r.diffs.map((d) => `${d.field} ${d.stored ?? "∅"}→${d.computed ?? "∅"}`).join(", ")
    console.log(`  ${r.code ?? r.publicId} (${r.units} u.): ${detail}`)
  }

  const files = writeReports(
    { command: "parity", startedAt, finishedAt: new Date().toISOString(), units: unitCount, summary, blocks: results.filter((r) => r.status !== "igual") },
    results,
  )
  console.log(`\nReporte: ${files.json}`)
  console.log(`CSV: ${files.csv}`)
}

async function main() {
  const command = process.argv[2]
  if (command === "parity") return parity()
  console.error(USAGE)
  process.exitCode = 2
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
