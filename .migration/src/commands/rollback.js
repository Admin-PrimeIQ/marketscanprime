// Comando `rollback`: restaura los valores ORIGINALES de los campos que la
// migración cambió, re-PUTeando contra Strapi.
//
// Por cada bloque objetivo lee:
//   - runs/<ts>/blocks/<id>/original.jsonl  (snapshot previo a la migración)
//   - runs/<ts>/blocks/<id>/diff.jsonl       (qué unidades/campos cambiaron)
// Para cada unidad con entrada en el diff, construye un dataObj con los valores
// ORIGINALES de EXACTAMENTE los campos listados en su diff (intersectados con
// PERSISTED_FORMULA_FIELDS) y hace putUnit(documentId, dataObj).
//
// Resultados → rollback-results.jsonl; tee humano → rollback.log.
// Interactivo (sin flags): elige la corrida y el alcance (todo / un bloque).

import { Command, Flags } from '@oclif/core'
import { select } from '@inquirer/prompts'
import chalk from 'chalk'
import cliProgress from 'cli-progress'
import fs from 'node:fs'
import path from 'node:path'

import * as strapi from '../core/strapi.js'
import { createGate } from '../core/gate.js'
import { appendJsonl, packageRoot } from '../core/paths.js'
import { PERSISTED_FORMULA_FIELDS } from '../core/fields.js'

const PERSISTED = new Set(PERSISTED_FORMULA_FIELDS)

function runsRoot() {
  return path.join(packageRoot(), 'runs')
}

function listRuns() {
  const root = runsRoot()
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function listBlockDirs(runDir) {
  const blocksRoot = path.join(runDir, 'blocks')
  if (!fs.existsSync(blocksRoot)) return []
  return fs
    .readdirSync(blocksRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

export default class Rollback extends Command {
  static description =
    'Restaura los valores originales (re-PUT) de los campos migrados, por corrida.'

  static flags = {
    run: Flags.string({ description: 'Timestamp de la corrida a revertir' }),
    block: Flags.string({ description: 'Revertir sólo este bloque (documentId)' }),
    all: Flags.boolean({ description: 'Revertir todos los bloques de la corrida' }),
    yes: Flags.boolean({ description: 'No preguntar: sí-a-todo' }),
  }

  async run() {
    const { flags } = await this.parse(Rollback)

    if (strapi.authMode() === 'unconfigured') {
      this.error(
        'Strapi no está configurado. Copiá .migration/.env.example a ' +
          '.migration/.env y definí STRAPI_URL + credenciales.',
        { exit: 1 }
      )
    }

    // Resolver corrida.
    let runTs = flags.run
    if (!runTs) {
      const runs = listRuns()
      if (runs.length === 0) {
        this.error('No hay corridas en runs/. Nada para revertir.', { exit: 1 })
      }
      runTs = await select({
        message: 'Elegí la corrida a revertir:',
        choices: runs.map((r) => ({ name: r, value: r })),
      })
    }

    const runDir = path.join(runsRoot(), String(runTs))
    if (!fs.existsSync(runDir)) {
      this.error(`No existe la corrida runs/${runTs}.`, { exit: 1 })
    }

    // Resolver alcance (qué bloques).
    let blockIds
    if (flags.block) {
      blockIds = [flags.block]
    } else if (flags.all) {
      blockIds = listBlockDirs(runDir)
    } else {
      const scope = await select({
        message: 'Alcance del rollback:',
        choices: [
          { name: 'Todos los bloques', value: 'all' },
          { name: 'Un bloque', value: 'one' },
        ],
      })
      if (scope === 'all') {
        blockIds = listBlockDirs(runDir)
      } else {
        const dirs = listBlockDirs(runDir)
        if (dirs.length === 0) {
          this.error('La corrida no tiene bloques.', { exit: 1 })
        }
        const picked = await select({
          message: 'Elegí el bloque:',
          choices: dirs.map((d) => ({ name: d, value: d })),
        })
        blockIds = [picked]
      }
    }

    if (!blockIds || blockIds.length === 0) {
      this.error('No hay bloques para revertir.', { exit: 1 })
    }

    const gate = createGate({ assumeYes: flags.yes })
    const resultsPath = path.join(runDir, 'rollback-results.jsonl')
    const logPath = path.join(runDir, 'rollback.log')
    const logStream = fs.createWriteStream(logPath, { flags: 'a' })
    const tee = (line) => {
      console.log(line)
      logStream.write(line.replace(/\[[0-9;]*m/g, '') + '\n')
    }

    tee(chalk.bold(`\nRollback de corrida ${runTs} — ${blockIds.length} bloque(s)`))

    const decision = await gate(`Rollback de ${blockIds.length} bloque(s)`)
    if (decision === 'abort') {
      tee(chalk.yellow('Rollback cancelado.'))
      return
    }

    let totalOk = 0
    let totalFail = 0
    let totalUnits = 0

    for (const blockId of blockIds) {
      const dir = path.join(runDir, 'blocks', String(blockId))
      const originals = readJsonl(path.join(dir, 'original.jsonl'))
      const diffs = readJsonl(path.join(dir, 'diff.jsonl'))

      if (diffs.length === 0) {
        tee(chalk.dim(`Bloque ${blockId}: sin cambios en el diff — salteado.`))
        continue
      }

      // Mapa documentId -> original.
      const origByDoc = new Map()
      for (const o of originals) origByDoc.set(o.documentId, o)

      // Targets: por cada diff, restaurar los campos cambiados con su ORIGINAL.
      const targets = []
      for (const d of diffs) {
        const orig = origByDoc.get(d.documentId)
        if (!orig) continue
        const dataObj = {}
        for (const c of d.changes || []) {
          if (!PERSISTED.has(c.field)) continue
          dataObj[c.field] = orig[c.field]
        }
        if (Object.keys(dataObj).length > 0) {
          targets.push({ documentId: d.documentId, unitNumber: d.unitNumber, dataObj })
        }
      }

      if (targets.length === 0) {
        tee(chalk.dim(`Bloque ${blockId}: nada que restaurar.`))
        continue
      }

      tee(chalk.cyan(`\nBloque ${blockId}: restaurando ${targets.length} unidad(es)…`))
      const bar = new cliProgress.SingleBar(
        {
          format: 'ROLLBACK |{bar}| {value}/{total}',
          hideCursor: true,
          clearOnComplete: false,
        },
        cliProgress.Presets.shades_classic
      )
      bar.start(targets.length, 0)

      let okCount = 0
      let failCount = 0

      await strapi.runPool(targets, async (u) => {
        const t0 = Date.now()
        const r = await strapi.putUnit(u.documentId, u.dataObj)
        const ms = Date.now() - t0
        appendJsonl(resultsPath, {
          blockId,
          documentId: u.documentId,
          status: r.status,
          ok: r.ok,
          ms,
          error: r.error,
          restored: u.dataObj,
        })
        if (r.ok) okCount++
        else failCount++
        bar.increment()
        return r
      })

      bar.stop()
      tee(
        `Bloque ${blockId}: ${chalk.green(okCount + ' ok')} / ${
          failCount > 0 ? chalk.red(failCount + ' fail') : chalk.dim('0 fail')
        }`
      )
      totalOk += okCount
      totalFail += failCount
      totalUnits += targets.length
    }

    tee(chalk.bold('\n═══════════ RESUMEN ROLLBACK ═══════════'))
    tee(`Unidades restauradas : ${totalUnits}`)
    tee(`OK                   : ${chalk.green.bold(totalOk)}`)
    tee(`Fallidas             : ${chalk.red.bold(totalFail)}`)
    tee(chalk.dim(`Resultados en: ${resultsPath}`))
    logStream.end()
  }
}
