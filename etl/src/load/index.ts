import { randomUUID } from "node:crypto"
import { parseArgs } from "node:util"
import pg from "pg"
import { appPoolConfig } from "../app/connection"
import { BUSINESS_END, BUSINESS_START, isBusinessHours } from "./business-hours"
import { BUSINESS_HOURS_PAUSE_MS, extract } from "./extract"
import { CATEGORIES } from "./model"
import { printValidation, printVerify, RunLog, summarizeValidation, writeReportFile, type RunReport } from "./report"
import { readSnapshot, writeSnapshot, type Snapshot } from "./snapshot"
import { countRows, transform } from "./transform"
import { validate } from "./validate"
import { verify } from "./verify"
import { write } from "./write"

/**
 * ETL de Strapi (MySQL, solo lectura) → `msp_app` (Postgres).
 *
 *   validate  extrae (o reusa un snapshot), valida y transforma; no toca msp_app.
 *   run       además escribe y verifica en UNA transacción: si algo falla, ROLLBACK y no queda
 *             nada de esta corrida. Con --dry-run termina en ROLLBACK aunque todo cuadre.
 *   verify    compara msp_app con un snapshot en una transacción de solo lectura.
 *
 * Opciones:
 *   --snapshot <nombre>  reusa etl/.snapshots/<nombre> (no lee el RDS; vale a cualquier hora)
 *   --sample <doc,doc>   solo esos bloques y sus unidades; siempre en modo prueba (--dry-run)
 *   --allow <cat,cat>    acepta esas categorías de incidencia excluyendo la fila y sus dependientes
 *   --dry-run            ejecuta todo y deshace al final
 *   --allow-business-hours  permite la lectura completa del RDS entre 7:00 y 19:00 (Guatemala),
 *                        con pausas más largas entre lotes; decisión explícita del usuario
 */

const USAGE = `Uso: tsx src/load/index.ts <validate|run|verify> [--snapshot nombre] [--sample doc1,doc2] [--allow cat1,cat2] [--dry-run] [--allow-business-hours]`

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

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      snapshot: { type: "string" },
      sample: { type: "string" },
      allow: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "allow-business-hours": { type: "boolean", default: false },
    },
  })
  const command = positionals[0]
  if (command !== "validate" && command !== "run" && command !== "verify") {
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  const allowed = new Set(list(values.allow))
  const unknown = [...allowed].filter((c) => !(c in CATEGORIES))
  if (unknown.length) throw new Error(`Categorías desconocidas en --allow: ${unknown.join(", ")}. Válidas: ${Object.keys(CATEGORIES).join(", ")}`)

  const report: RunReport = {
    id: randomUUID(),
    command,
    mode: "full",
    dryRun: values["dry-run"],
    snapshot: null,
    allowed: [...allowed],
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    validation: null,
    write: null,
    verify: null,
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
