import { randomUUID } from "node:crypto"
import { parseArgs } from "node:util"
import pg from "pg"
import { appPoolConfig } from "../app/connection"
import { BUSINESS_END, BUSINESS_START, isBusinessHours } from "./business-hours"
import { BUSINESS_HOURS_PAUSE_MS, extract } from "./extract"
import { checkUnits, formulaDiffs, summarizeFormulas, writeFormulaReport, type FormulaReport } from "./formulas"
import { CATEGORIES } from "./model"
import { printValidation, printVerify, RunLog, summarizeValidation, writeReportFile, type RunReport } from "./report"
import { readSnapshot, writeSnapshot, type Snapshot } from "./snapshot"
import { countRows, transform } from "./transform"
import { validate } from "./validate"
import { verify } from "./verify"
import { massDeletions, write } from "./write"

/**
 * ETL de Strapi (MySQL, solo lectura) → `msp_app` (Postgres).
 *
 *   validate  extrae (o reusa un snapshot), valida y transforma; no toca msp_app. Los campos de
 *             fórmula se copian tal cual de Strapi; el motor de la hoja (lib/domain/units) solo
 *             los compara y deja las diferencias en etl/reports/formulas-*.
 *   run       además escribe y verifica en UNA transacción: si algo falla, ROLLBACK y no queda
 *             nada de esta corrida. Con --dry-run termina en ROLLBACK aunque todo cuadre.
 *   verify    compara msp_app con un snapshot en una transacción de solo lectura.
 *   formulas  recalcula las unidades del snapshot con el motor de la hoja (lib/domain/units) y
 *             reporta qué campos guardados no coinciden; no abre conexión a msp_app.
 *
 * Opciones:
 *   --snapshot <nombre>  reusa etl/.snapshots/<nombre> (no lee el RDS; vale a cualquier hora)
 *   --sample <doc,doc>   solo esos bloques y sus unidades; siempre en modo prueba (--dry-run)
 *   --allow <cat,cat>    acepta esas categorías de incidencia excluyendo la fila y sus dependientes
 *   --dry-run            ejecuta todo y deshace al final
 *   --allow-business-hours  permite la lectura completa del RDS entre 7:00 y 19:00 (Guatemala),
 *                        con pausas más largas entre lotes; decisión explícita del usuario
 *   --allow-mass-delete  acepta que el espejo vacíe una tabla o borre más del 5 % (y más de 50
 *                        filas); sin el flag la carga hace ROLLBACK
 */

const USAGE = `Uso: tsx src/load/index.ts <validate|run|verify|formulas> [--snapshot nombre] [--sample doc1,doc2] [--allow cat1,cat2] [--dry-run] [--allow-business-hours] [--allow-mass-delete]`

const LOCK_KEY = "msp_app_etl_load"

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean)

async function loadSnapshot(name: string | undefined, sampleBlocks: string[], allowBusinessHours: boolean): Promise<Snapshot> {
  if (name) {
    console.log(`Snapshot reusado: ${name}`)
    return readSnapshot(name)
  }
  const fullInBusinessHours = sampleBlocks.length === 0 && isBusinessHours()
  if (fullInBusinessHours && !allowBusinessHours) {
    throw new Error(
      `La lectura completa del RDS de producción solo se permite fuera de ${BUSINESS_START}:00–${BUSINESS_END}:00 (hora de Guatemala). ` +
        `Usa --sample con unos bloques, --snapshot para reusar uno ya extraído, o --allow-business-hours para leer igual (más lento).`,
    )
  }
  if (fullInBusinessHours) {
    console.warn(
      `AVISO: lectura completa del RDS de producción en horario laboral (--allow-business-hours). ` +
        `Solo lectura, pool ≤ 2, lotes de 2,000 con ${BUSINESS_HOURS_PAUSE_MS} ms de pausa. Ctrl+C la detiene sin efectos.`,
    )
  }
  console.log(`Extrayendo de Strapi (solo lectura)${sampleBlocks.length ? ` — muestra de ${sampleBlocks.length} bloques` : ""}…`)
  const snapshot = await extract({
    sampleBlocks,
    pauseMs: fullInBusinessHours ? BUSINESS_HOURS_PAUSE_MS : undefined,
    log: console.log,
  })
  const dir = await writeSnapshot(snapshot)
  console.log(`Snapshot guardado en ${dir}`)
  return snapshot
}

const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)} %` : "—")

function printFormulas(report: FormulaReport) {
  const { units } = report
  const n = (v: number) => v.toLocaleString("es-GT")
  console.log(`\nFórmulas (tolerancia ${report.tolerance}):`)
  console.log(`  unidades revisadas ${n(units.checked)} de ${n(units.total)} (sin contexto: ${n(units.withoutContext)}; sin categoría: ${n(units.withoutCategory)})`)
  console.log(`  con diferencias ${n(units.withDiffs)} (${pct(units.withDiffs, units.checked)}); limpias ${n(units.clean)}`)
  console.log(`\n  Por campo (unidades con diferencia / de ellas vacías en la base):`)
  for (const [field, s] of Object.entries(report.byField)) {
    if (s.units > 0) console.log(`    ${field.padEnd(26)} ${n(s.units).padStart(8)}  vacías ${n(s.storedNull)}`)
  }
  console.log(`\n  Por período y dominio (con diferencias / unidades):`)
  for (const p of report.byPeriod) {
    console.log(`    ${p.period.padEnd(12)} ${String(p.domain ?? "—").padEnd(12)} ${n(p.withDiffs).padStart(8)} / ${n(p.units).padEnd(8)} ${pct(p.withDiffs, p.units)}`)
  }
}

async function runFormulas(snapshotName: string | undefined, allowed: Set<string>, allowBusinessHours: boolean) {
  const snapshot = await loadSnapshot(snapshotName, [], allowBusinessHours)
  const validation = validate(snapshot, allowed)
  printValidation(validation, allowed)
  if (validation.blocking.length > 0) {
    console.error(`\n${validation.blocking.length} incidencias bloqueantes; no se calcula el reporte de fórmulas`)
    process.exitCode = 1
    return
  }
  const checks = checkUnits(transform(validation.resolved))
  const report = summarizeFormulas(checks, snapshot.meta.name)
  printFormulas(report)
  const files = writeFormulaReport(report, checks)
  console.log(`\nReporte: ${files.json}\nDetalle por unidad: ${files.csv}`)
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      snapshot: { type: "string" },
      sample: { type: "string" },
      allow: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "allow-business-hours": { type: "boolean", default: false },
      "allow-mass-delete": { type: "boolean", default: false },
    },
  })
  const command = positionals[0]
  if (command !== "validate" && command !== "run" && command !== "verify" && command !== "formulas") {
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  const allowed = new Set(list(values.allow))
  const unknown = [...allowed].filter((c) => !(c in CATEGORIES))
  if (unknown.length) throw new Error(`Categorías desconocidas en --allow: ${unknown.join(", ")}. Válidas: ${Object.keys(CATEGORIES).join(", ")}`)

  if (command === "formulas") {
    await runFormulas(values.snapshot, allowed, values["allow-business-hours"])
    return
  }

  const report: RunReport = {
    id: randomUUID(),
    command,
    mode: "full",
    dryRun: values["dry-run"],
    snapshot: null,
    allowed: [...allowed],
    allowMassDelete: values["allow-mass-delete"],
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    validation: null,
    write: null,
    verify: null,
    formulas: null,
  }
  const runLog = new RunLog()
  let client: pg.Client | null = null
  let details: unknown

  const finish = async (status: RunReport["status"], error: string | null = null) => {
    report.status = status
    report.error = error
    report.finishedAt = new Date().toISOString()
    if (command === "run") await runLog.save(report)
    const file = writeReportFile(report, details)
    console.log(`\nResultado: ${status}${error ? ` — ${error}` : ""}`)
    console.log(`Reporte: ${file}`)
    if (status !== "committed" && status !== "validated" && !(status === "rolled_back" && report.dryRun)) process.exitCode = 1
  }

  try {
    const snapshot = await loadSnapshot(values.snapshot, list(values.sample), values["allow-business-hours"])
    report.snapshot = snapshot.meta.name
    report.mode = snapshot.meta.mode
    if (report.mode === "sample") report.dryRun = true

    const validation = validate(snapshot, allowed)
    report.validation = summarizeValidation(validation, allowed)
    details = { issues: validation.issues, exclusions: validation.exclusions }
    printValidation(validation, allowed)
    if (validation.blocking.length > 0) {
      await finish("aborted", `${validation.blocking.length} incidencias bloqueantes; no se escribió nada en msp_app`)
      return
    }

    const data = transform(validation.resolved)
    console.log(`\nTransformación: ${Object.entries(countRows(data)).map(([t, n]) => `${t} ${n}`).join(", ")}`)

    const checks = checkUnits(data)
    const summary = summarizeFormulas(checks, snapshot.meta.name)
    const files = writeFormulaReport(summary, checks)
    report.formulas = { ...formulaDiffs(summary), report: files.json, csv: files.csv }
    console.log(
      `Fórmulas (solo reporte; se carga lo que trae Strapi): ${report.formulas.units.toLocaleString("es-GT")} unidades ` +
        `difieren del motor de la hoja (${Object.entries(report.formulas.byField).map(([f, n]) => `${f} ${n}`).join(", ")}). ` +
        `Detalle: ${files.csv}`,
    )
    if (command === "validate") {
      await finish("validated", "Sin incidencias bloqueantes; no se escribió nada en msp_app")
      return
    }

    if (command === "run") await runLog.save(report)
    client = new pg.Client(appPoolConfig())
    await client.connect()

    if (command === "verify") {
      await client.query("BEGIN READ ONLY")
      await client.query("SET LOCAL statement_timeout = '15min'")
      report.verify = await verify(client, snapshot, validation.resolved.present, data, report.mode)
      await client.query("COMMIT")
      printVerify(report.verify)
      await finish(report.verify.ok ? "committed" : "failed", report.verify.ok ? null : "msp_app no coincide con el snapshot")
      return
    }

    await client.query("BEGIN")
    try {
      const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", [LOCK_KEY])
      if (!rows[0].locked) throw new Error("Otra carga del ETL está en curso sobre msp_app")
      await client.query("SET LOCAL statement_timeout = '15min'")
      await client.query("SET LOCAL lock_timeout = '30s'")
      await client.query("SET LOCAL work_mem = '128MB'")

      console.log(`\nEscribiendo en msp_app (${report.mode === "full" ? "espejo completo" : "solo la muestra"})…`)
      report.write = await write(client, data, report.mode, console.log)

      const mass = report.mode === "full" ? massDeletions(report.write) : []
      if (mass.length > 0) {
        const detail = mass
          .map((m) => `${m.table} borraría ${m.deleted.toLocaleString("es-GT")} de ${m.before.toLocaleString("es-GT")} filas (${((m.deleted / m.before) * 100).toFixed(1)} %)`)
          .join("; ")
        if (!report.allowMassDelete) {
          throw new Error(
            `Borrado masivo detenido: ${detail}. Puede ser un snapshot incompleto o un vaciado en Strapi. ` +
              `Si el borrado es real, repetir con --allow-mass-delete`,
          )
        }
        console.warn(`\nAVISO: borrado masivo aceptado con --allow-mass-delete: ${detail}`)
      }

      console.log(`\nVerificando antes del COMMIT…`)
      report.verify = await verify(client, snapshot, validation.resolved.present, data, report.mode)
      printVerify(report.verify)

      if (!report.verify.ok) {
        await client.query("ROLLBACK")
        await finish("failed", "La verificación no cuadró: se hizo ROLLBACK y msp_app quedó como estaba")
      } else if (report.dryRun) {
        await client.query("ROLLBACK")
        await finish("rolled_back", "Modo prueba: todo cuadró y se deshizo (ROLLBACK)")
      } else {
        await client.query("COMMIT")
        await finish("committed")
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    }
  } catch (error) {
    const message = (error as Error).message
    await finish("failed", command === "run" ? `${message} (ROLLBACK: msp_app quedó como estaba)` : message)
  } finally {
    await client?.end().catch(() => {})
    await runLog.close()
  }
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
