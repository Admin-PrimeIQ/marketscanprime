import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import pg from "pg"
import { appPoolConfig } from "../app/connection"
import { ETL_ROOT } from "../db/env"
import { describeCategory, type ValidationResult } from "./validate"
import type { Check, VerifyResult } from "./verify"
import type { TableStats } from "./write"

export const REPORTS_DIR = resolve(ETL_ROOT, "reports")

/** `validated` solo lo usa `validate`, que no escribe en msp_app ni en etl_run. */
export type RunStatus = "running" | "validated" | "committed" | "rolled_back" | "aborted" | "failed"

export interface RunReport {
  id: string
  command: "validate" | "run" | "verify"
  mode: "full" | "sample"
  dryRun: boolean
  snapshot: string | null
  allowed: string[]
  status: RunStatus
  startedAt: string
  finishedAt: string | null
  /** Por qué terminó así (error de escritura, verificación fallida, incidencias bloqueantes). */
  error: string | null
  validation: {
    issues: number
    blocking: number
    warnings: number
    byCategory: Record<string, { fatal: number; warning: number; allowed: boolean; why: string }>
    excluded: Record<string, number>
    ignoredLinks: Record<string, number>
  } | null
  write: Record<string, TableStats> | null
  verify: VerifyResult | null
}

export function summarizeValidation(result: ValidationResult, allowed: ReadonlySet<string>): NonNullable<RunReport["validation"]> {
  const byCategory: NonNullable<RunReport["validation"]>["byCategory"] = {}
  for (const issue of result.issues) {
    const entry = (byCategory[issue.category] ??= { fatal: 0, warning: 0, allowed: allowed.has(issue.category), why: describeCategory(issue.category) })
    entry[issue.severity]++
  }
  const excluded: Record<string, number> = {}
  for (const e of result.exclusions) excluded[e.table] = (excluded[e.table] ?? 0) + 1
  return {
    issues: result.issues.length,
    blocking: result.blocking.length,
    warnings: result.issues.filter((i) => i.severity === "warning").length,
    byCategory,
    excluded,
    ignoredLinks: result.ignoredLinks as Record<string, number>,
  }
}

// ── consola ─────────────────────────────────────────────────────────────────

const MAX_LISTED = 15

export function printValidation(result: ValidationResult, allowed: ReadonlySet<string>) {
  const summary = summarizeValidation(result, allowed)
  console.log(`\nValidación: ${summary.issues} incidencias (${summary.blocking} bloqueantes, ${summary.warnings} advertencias)`)
  for (const [category, entry] of Object.entries(summary.byCategory)) {
    const tag = entry.fatal === 0 ? "advertencia" : entry.allowed ? "aceptada con --allow" : "BLOQUEA"
    console.log(`  [${tag}] ${category}: ${entry.fatal + entry.warning}`)
    console.log(`      ${entry.why}`)
    for (const issue of result.issues.filter((i) => i.category === category).slice(0, MAX_LISTED)) {
      console.log(`      - ${issue.table} id=${issue.id} doc=${issue.documentId ?? "∅"}: ${issue.detail}`)
    }
    const total = entry.fatal + entry.warning
    if (total > MAX_LISTED) console.log(`      … y ${total - MAX_LISTED} más (ver el reporte JSON)`)
  }
  if (Object.keys(summary.excluded).length) {
    console.log(`  Excluidas por --allow (con sus dependientes): ${Object.entries(summary.excluded).map(([t, n]) => `${t} ${n}`).join(", ")}`)
  }
  if (Object.keys(summary.ignoredLinks).length) {
    console.log(`  Vínculos de borradores ignorados: ${Object.entries(summary.ignoredLinks).map(([t, n]) => `${t} ${n}`).join(", ")}`)
  }
  if (summary.blocking > 0) {
    const categories = [...new Set(result.blocking.map((i) => i.category))]
    console.log(`\n  Para cargar sin esas filas (y lo que depende de ellas): --allow ${categories.join(",")}`)
  }
}

function printChecks(title: string, checks: Check[]) {
  const bad = checks.filter((c) => c.missing + c.extra + c.changed > 0)
  console.log(`  ${title}: ${checks.length - bad.length}/${checks.length} cuadran`)
  for (const c of bad) {
    console.log(`    ✗ ${c.name}: esperadas ${c.expected}, hay ${c.actual} | faltan ${c.missing}, sobran ${c.extra}, distintas ${c.changed}`)
    for (const example of c.examples) console.log(`        ${example}`)
  }
}

export function printVerify(result: VerifyResult) {
  console.log(`\nVerificación: ${result.ok ? "OK" : "FALLÓ"}`)
  printChecks("tablas", result.tables)
  printChecks("relaciones", result.relations)
  printChecks("agregados", [result.aggregates])
}

// ── persistencia ────────────────────────────────────────────────────────────

export function writeReportFile(report: RunReport, details?: unknown): string {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const file = resolve(REPORTS_DIR, `${report.startedAt.replace(/[:.]/g, "-")}-${report.id}.json`)
  writeFileSync(file, JSON.stringify({ ...report, details }, null, 2))
  return file
}

/**
 * Bitácora en `msp_app.etl_run` por una conexión propia en autocommit: sobrevive al ROLLBACK de
 * la carga. Si la tabla aún no existe (migración sin aplicar) solo avisa; el reporte JSON queda.
 */
export class RunLog {
  private client: pg.Client | null = null
  private disabled = false

  async save(report: RunReport) {
    if (this.disabled) return
    try {
      if (!this.client) {
        this.client = new pg.Client(appPoolConfig())
        await this.client.connect()
      }
      await this.client.query(
        `INSERT INTO etl_run (id, command, mode, dry_run, status, snapshot, allowed, counts, issues, error, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, snapshot = EXCLUDED.snapshot, counts = EXCLUDED.counts,
           issues = EXCLUDED.issues, error = EXCLUDED.error, finished_at = EXCLUDED.finished_at`,
        [
          report.id,
          report.command,
          report.mode,
          report.dryRun,
          report.status,
          report.snapshot,
          report.allowed,
          JSON.stringify({ write: report.write, verify: report.verify && { ok: report.verify.ok } }),
          JSON.stringify(report.validation),
          report.error,
          report.startedAt,
          report.finishedAt,
        ],
      )
    } catch (error) {
      this.disabled = true
      console.warn(`  (no se pudo registrar en etl_run: ${(error as Error).message}; queda solo el reporte JSON)`)
    }
  }

  async close() {
    await this.client?.end().catch(() => {})
  }
}
