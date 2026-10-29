import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import pg from "pg"
import { daysInRange, parseDmy, todayInGuatemala } from "../../../lib/domain/exchange-rates/dates.ts"
import { APP_SCHEMA, appPoolConfig } from "../app/connection"
import { ETL_ROOT } from "../db/env"
import { fetchTipoCambioRango } from "./banguat-client"
import { fetchN8nHistory } from "./n8n-get"
import { compareParity, numericOrNull, type ParityRate } from "./parity"
import { upsertExchangeRates } from "./upsert"

/**
 * Tipo de cambio USD/GTQ de Banguat → `msp_app.exchange_rate` (paso 1 de
 * docs/migration/N8N_WORKFLOWS.md). No toca n8n, S3 ni ninguna base de producción.
 *
 *   load    consulta `TipoCambioRango` de Banguat y hace upsert en `msp_app.exchange_rate`, en una
 *           transacción. Con --dry-run termina en ROLLBACK aunque todo cuadre.
 *   parity  compara la tabla, en una transacción de solo lectura, con el GET público de n8n
 *           (la única llamada a n8n permitida). No escribe nada.
 *
 * Opciones de load:
 *   --from DD/MM/AAAA   por defecto 30/11/2006, el primer día que sirve n8n
 *   --to DD/MM/AAAA     por defecto hoy en Guatemala
 *   --dry-run           ejecuta todo y deshace al final
 * Opciones de parity:
 *   --size N            filas por página del GET de n8n (por defecto 100)
 */

const USAGE = "Uso: tsx src/exchange-rates/index.ts <load|parity> [--from DD/MM/AAAA] [--to DD/MM/AAAA] [--dry-run] [--size N]"
const HISTORY_START = "2006-11-30"
const LOCK_KEY = "msp_app_exchange_rates"
const REPORTS_DIR = resolve(ETL_ROOT, "reports")

function writeReport(command: string, report: unknown): string {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const file = resolve(REPORTS_DIR, `exchange-rates-${command}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
  writeFileSync(file, JSON.stringify(report, null, 2))
  return file
}

const n = (v: number) => v.toLocaleString("es-GT")

async function load(fromArg: string | undefined, toArg: string | undefined, dryRun: boolean) {
  const from = fromArg ? parseDmy(fromArg) : HISTORY_START
  const to = toArg ? parseDmy(toArg) : todayInGuatemala()
  const expected = daysInRange(from, to)
  const startedAt = new Date().toISOString()

  console.log(`Banguat TipoCambioRango ${from} → ${to} (${n(expected.length)} días)…`)
  const { rows, totalItems, ms } = await fetchTipoCambioRango(from, to)
  console.log(`  ${n(rows.length)} filas (TotalItems ${n(totalItems)}) en ${n(ms)} ms`)

  const outside = rows.filter((r) => r.date < from || r.date > to).map((r) => r.date)
  if (outside.length > 0) throw new Error(`Banguat devolvió ${outside.length} días fuera del rango pedido: ${outside.slice(0, 5).join(", ")}…`)
  const got = new Set(rows.map((r) => r.date))
  const missing = expected.filter((d) => !got.has(d))
  const withBuySell = rows.filter((r) => r.referenceRate == null).map((r) => r.date)
  if (missing.length > 0) console.warn(`  AVISO: Banguat no trae ${missing.length} días del rango: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`)
  if (withBuySell.length > 0) console.log(`  Días con compra ≠ venta (se guardan compra y venta, sin referencia): ${withBuySell.join(", ")}`)

  const client = new pg.Client(appPoolConfig())
  await client.connect()
  let status: "committed" | "rolled_back" | "failed" = "failed"
  let counts = null
  let tableRows: number | null = null
  let error: string | null = null
  try {
    await client.query("BEGIN")
    const { rows: lock } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", [LOCK_KEY])
    if (!lock[0].locked) throw new Error("Otra carga del tipo de cambio está en curso sobre msp_app")
    await client.query("SET LOCAL statement_timeout = '2min'")
    await client.query("SET LOCAL lock_timeout = '30s'")

    counts = await upsertExchangeRates(client, rows)
    const { rows: c } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM "${APP_SCHEMA}"."exchange_rate"`)
    tableRows = Number(c[0].n)
    console.log(`  msp_app.exchange_rate: insertadas ${n(counts.inserted)}, actualizadas ${n(counts.updated)}, sin cambio ${n(counts.unchanged)}; total en la tabla ${n(tableRows)}`)

    if (dryRun) {
      await client.query("ROLLBACK")
      status = "rolled_back"
    } else {
      await client.query("COMMIT")
      status = "committed"
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    error = (e as Error).message
  } finally {
    await client.end().catch(() => {})
  }

  const file = writeReport("load", {
    command: "load",
    dryRun,
    status,
    error,
    startedAt,
    finishedAt: new Date().toISOString(),
    range: { from, to, days: expected.length },
    banguat: { rows: rows.length, totalItems, ms, missing, withBuySell },
    counts,
    tableRows,
  })
  const note = status === "rolled_back" ? " (modo prueba: se hizo ROLLBACK, msp_app quedó como estaba)" : ""
  console.log(`\nResultado: ${status}${note}${error ? ` — ${error} (ROLLBACK: msp_app quedó como estaba)` : ""}`)
  console.log(`Reporte: ${file}`)
  if (status === "failed") process.exitCode = 1
}

async function parity(size: number) {
  const startedAt = new Date().toISOString()
  const client = new pg.Client(appPoolConfig())
  await client.connect()
  let table: ParityRate[]
  try {
    await client.query("BEGIN READ ONLY")
    const { rows } = await client.query<{ date: string; currency: string; unit: string | null; buy: string | null; sell: string | null; reference_rate: string | null }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, currency, unit, buy::text, sell::text, reference_rate::text
         FROM "${APP_SCHEMA}"."exchange_rate" ORDER BY date`,
    )
    await client.query("COMMIT")
    table = rows.map((r) => ({
      date: r.date,
      currency: r.currency,
      unit: r.unit ?? "",
      buy: numericOrNull(r.buy),
      sell: numericOrNull(r.sell),
      referenceRate: numericOrNull(r.reference_rate),
    }))
  } finally {
    await client.end().catch(() => {})
  }
  console.log(`msp_app.exchange_rate: ${n(table.length)} filas`)

  console.log(`GET público de n8n, ${size} por página…`)
  const { rates, totalRecords } = await fetchN8nHistory(size)
  if (rates.length !== totalRecords) console.warn(`  AVISO: n8n anuncia ${n(totalRecords)} registros y se leyeron ${n(rates.length)}`)

  const result = compareParity(table, rates)
  const ok = result.diffs.length === 0 && result.onlyInTable.length === 0 && result.onlyInN8n.length === 0 && result.duplicatesInN8n.length === 0
  console.log(`\nParidad: ${n(result.matched)} días iguales de ${n(result.table)} en la tabla y ${n(result.n8n)} en n8n (anuncia ${n(totalRecords)})`)
  console.log(`  solo en la tabla ${result.onlyInTable.length}${result.onlyInTable.length ? `: ${result.onlyInTable.slice(0, 10).join(", ")}` : ""}`)
  console.log(`  solo en n8n ${result.onlyInN8n.length}${result.onlyInN8n.length ? `: ${result.onlyInN8n.slice(0, 10).join(", ")}` : ""}`)
  console.log(`  repetidos en n8n ${result.duplicatesInN8n.length}`)
  console.log(`  valores distintos ${result.diffs.length}`)
  for (const d of result.diffs.slice(0, 20)) console.log(`    ${d.date} ${d.field}: tabla ${d.table} · n8n ${d.n8n}`)

  const file = writeReport("parity", { command: "parity", ok, startedAt, finishedAt: new Date().toISOString(), n8nTotalRecords: totalRecords, ...result })
  console.log(`\nResultado: ${ok ? "sin diferencias" : "HAY DIFERENCIAS"}`)
  console.log(`Reporte: ${file}`)
  if (!ok) process.exitCode = 1
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      size: { type: "string" },
    },
  })
  const command = positionals[0]
  if (command === "load") return load(values.from, values.to, values["dry-run"])
  if (command === "parity") {
    const size = values.size ? Number(values.size) : 100
    if (!Number.isInteger(size) || size < 1) throw new Error(`--size inválido: ${values.size}`)
    return parity(size)
  }
  console.error(USAGE)
  process.exitCode = 2
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
