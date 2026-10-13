// Pipeline por bloque: fetch → alinear → fórmulas → diff → PUT.
//
// Cada fase termina con una compuerta interactiva (gate). Si el usuario aborta,
// se lanza AbortError para que el comando llamante detenga la corrida con el
// checkpoint ya guardado. Todos los artefactos inmutables se escriben bajo
// blockDir(runDir, block.documentId): original.jsonl, corrected.jsonl,
// diff.jsonl, put-results.jsonl.
//
// Las etiquetas de fase van en español: Traer, Alinear, Fórmulas, Diff,
// Escribir (PUT).

import path from 'node:path'

import ora from 'ora'
import chalk from 'chalk'
import cliProgress from 'cli-progress'
import Table from 'cli-table3'

import {
  ensureUnitFormulasSynced,
  getVatRate,
  isVerticalBlock,
  isLoteBlock,
} from './formulas.js'
import { PERSISTED_FORMULA_FIELDS, CHANGE_TOLERANCE } from './fields.js'
import { blockDir, appendJsonl } from './paths.js'

/** Error que se propaga cuando el usuario aborta en una compuerta. */
export class AbortError extends Error {
  constructor(message = 'Migración interrumpida por el usuario.') {
    super(message)
    this.name = 'AbortError'
  }
}

// Orden estable: por unitNumber "numérico-ish", desempatando por documentId.
function numericish(v) {
  if (v == null) return Number.POSITIVE_INFINITY
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

function stableSortUnits(units) {
  return units
    .map((u, i) => ({ u, i }))
    .sort((a, b) => {
      const na = numericish(a.u.unitNumber)
      const nb = numericish(b.u.unitNumber)
      if (na !== nb) return na - nb
      const da = String(a.u.documentId || '')
      const db = String(b.u.documentId || '')
      if (da !== db) return da < db ? -1 : 1
      return a.i - b.i // estabilidad final
    })
    .map((x) => x.u)
}

function fieldChanged(original, corrected, f) {
  const a = Number(original?.[f]) || 0
  const b = Number(corrected?.[f]) || 0
  return Math.abs(b - a) > CHANGE_TOLERANCE
}

function fmtNum(n) {
  const v = Number(n) || 0
  // Hasta 2 decimales, sin ceros colgantes innecesarios.
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/**
 * Procesa un bloque completo a través de las cinco fases.
 *
 * @param {object} block bloque normalizado de strapi.listBlocks()
 * @param {object} ctx
 * @param {string} ctx.runDir directorio de la corrida (de newRunDir)
 * @param {object} ctx.log    logger de createLogger
 * @param {(label:string)=>Promise<'continue'|'abort'|'all'>} ctx.gate
 * @param {object} ctx.strapi módulo importado (listUnitsForBlock, putUnit, runPool)
 * @param {boolean} ctx.dryRun si true, se omite la fase PUT
 * @param {number} [ctx.concurrency] concurrencia de PUTs (opcional)
 * @returns {Promise<{blockId:string, units:number, changed:number, written:number, failed:number}>}
 */
export async function processBlock(block, ctx) {
  const { runDir, log, gate, strapi, dryRun } = ctx
  const dir = blockDir(runDir, block.documentId)
  const originalPath = path.join(dir, 'original.jsonl')
  const correctedPath = path.join(dir, 'corrected.jsonl')
  const diffPath = path.join(dir, 'diff.jsonl')
  const putResultsPath = path.join(dir, 'put-results.jsonl')

  const blockLabel = block.name || block.documentId

  // ── Fase 1: Traer ───────────────────────────────────────────────────────────
  log.phase(`Traer — bloque ${blockLabel}`)
  const fetchSpinner = ora('Trayendo unidades…').start()
  let units
  try {
    units = await strapi.listUnitsForBlock(block.documentId)
  } catch (err) {
    fetchSpinner.fail('Error trayendo unidades')
    throw err
  }
  for (const u of units) appendJsonl(originalPath, u)
  fetchSpinner.succeed(`${units.length} unidades`)
  log.info('Unidades traídas', { blockId: block.documentId, units: units.length })

  {
    const decision = await gate('Traer')
    if (decision === 'abort') throw new AbortError()
  }

  // ── Fase 2: Alinear ──────────────────────────────────────────────────────────
  log.phase('Alinear')
  // original.jsonl ya es el snapshot verbatim; el orden ordenado se usa para procesar.
  const sorted = stableSortUnits(units)
  log.info('Unidades alineadas', { units: sorted.length })

  {
    const decision = await gate('Alinear')
    if (decision === 'abort') throw new AbortError()
  }

  // ── Fase 3: Fórmulas ─────────────────────────────────────────────────────────
  log.phase('Fórmulas')
  const isV = isVerticalBlock(block.categoryName, block.categoryCode)
  const isL = isLoteBlock(block.categoryName, block.categoryCode)
  const blockDates = {
    collectionDate: block.collectionDate,
    startDate: block.startDate,
  }

  const formulaSpinner = ora('Recalculando fórmulas…').start()
  const corrected = []
  for (const unit of sorted) {
    const clone = structuredClone(unit)
    const vat = getVatRate(block.quarter, block.categoryName, unit.unitUsage?.name, block.countryIso)
    ensureUnitFormulasSynced(clone, blockDates, isV, vat, isL, block.countryIso)
    appendJsonl(correctedPath, clone)
    corrected.push(clone)
  }
  formulaSpinner.succeed(
    `Fórmulas recalculadas (${corrected.length}) — vertical=${isV} lote=${isL}`
  )
  log.info('Fórmulas recalculadas', {
    units: corrected.length,
    isVertical: isV,
    isLote: isL,
  })

  {
    const decision = await gate('Fórmulas')
    if (decision === 'abort') throw new AbortError()
  }

  // ── Fase 4: Diff ─────────────────────────────────────────────────────────────
  log.phase('Diff')
  const changedUnits = []
  for (let i = 0; i < sorted.length; i++) {
    const original = sorted[i]
    const cor = corrected[i]
    const changes = []
    for (const f of PERSISTED_FORMULA_FIELDS) {
      if (fieldChanged(original, cor, f)) {
        changes.push({
          field: f,
          before: Number(original?.[f]) || 0,
          after: Number(cor?.[f]) || 0,
        })
      }
    }
    if (changes.length > 0) {
      const entry = {
        documentId: original.documentId,
        unitNumber: original.unitNumber,
        changes,
      }
      appendJsonl(diffPath, entry)
      changedUnits.push(entry)
    }
  }

  renderDiffTable(changedUnits, units.length)
  log.info('Diff calculado', {
    changed: changedUnits.length,
    total: units.length,
  })

  {
    const decision = await gate('Diff')
    if (decision === 'abort') throw new AbortError()
  }

  // ── Fase 5: Escribir (PUT) ───────────────────────────────────────────────────
  log.phase('Escribir (PUT)')

  if (dryRun) {
    log.info('dry-run: no se escribe', { changed: changedUnits.length })
    return {
      blockId: block.documentId,
      units: units.length,
      changed: changedUnits.length,
      written: 0,
      failed: 0,
    }
  }

  let writtenOk = 0
  let failedCount = 0

  if (changedUnits.length === 0) {
    log.info('Sin cambios: nada que escribir.')
  } else {
    // Construir el dataObj de cada unidad cambiada: sólo {campo: after}.
    const targets = changedUnits.map((cu) => {
      const dataObj = {}
      for (const c of cu.changes) dataObj[c.field] = c.after
      return { documentId: cu.documentId, unitNumber: cu.unitNumber, dataObj }
    })

    const bar = new cliProgress.SingleBar(
      {
        format: 'PUT |{bar}| {value}/{total} unidades',
        hideCursor: true,
        clearOnComplete: false,
      },
      cliProgress.Presets.shades_classic
    )
    bar.start(targets.length, 0)

    await strapi.runPool(
      targets,
      async (u) => {
        const t0 = Date.now()
        const r = await strapi.putUnit(u.documentId, u.dataObj)
        const ms = Date.now() - t0
        appendJsonl(putResultsPath, {
          documentId: u.documentId,
          status: r.status,
          ok: r.ok,
          ms,
          error: r.error,
        })
        if (r.ok) {
          writtenOk++
        } else {
          failedCount++
          log.warn('PUT falló', {
            documentId: u.documentId,
            status: r.status,
            error: r.error,
          })
        }
        bar.increment()
        return r
      },
      ctx.concurrency
    )

    bar.stop()
  }

  log.info('Escritura completa', {
    written: writtenOk,
    failed: failedCount,
    changed: changedUnits.length,
  })

  return {
    blockId: block.documentId,
    units: units.length,
    changed: changedUnits.length,
    written: writtenOk,
    failed: failedCount,
  }
}

/**
 * Imprime en consola una tabla cli-table3 con hasta las primeras 10 unidades
 * cambiadas (una fila por campo) y una línea de totales.
 */
function renderDiffTable(changedUnits, totalUnits) {
  if (changedUnits.length === 0) {
    console.log(chalk.green(`✓ 0 de ${totalUnits} unidades cambian.`))
    return
  }

  const table = new Table({
    head: [
      chalk.bold('Fila'),
      chalk.bold('Campo'),
      chalk.bold('DB'),
      chalk.bold('Nuevo'),
      chalk.bold('Δ'),
    ],
    colAligns: ['left', 'left', 'right', 'right', 'right'],
  })

  const shown = changedUnits.slice(0, 10)
  for (const cu of shown) {
    for (const c of cu.changes) {
      const delta = (Number(c.after) || 0) - (Number(c.before) || 0)
      const deltaStr = `${delta >= 0 ? '+' : ''}${fmtNum(delta)}`
      const colored = delta >= 0 ? chalk.green(deltaStr) : chalk.red(deltaStr)
      table.push([
        String(cu.unitNumber ?? cu.documentId),
        c.field,
        fmtNum(c.before),
        fmtNum(c.after),
        colored,
      ])
    }
  }

  console.log(table.toString())
  if (changedUnits.length > shown.length) {
    console.log(
      chalk.dim(`… y ${changedUnits.length - shown.length} unidades cambiadas más.`)
    )
  }
  console.log(
    chalk.bold(`${changedUnits.length} de ${totalUnits} unidades cambian.`)
  )
}
