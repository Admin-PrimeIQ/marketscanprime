// Comando `run`: migración real, bloque a bloque, con compuerta interactiva,
// checkpoint (progress.json) y reanudación (--resume <ts>).
//
//   - Sin --resume: crea una corrida nueva (runs/<ts>/) con progreso vacío.
//   - Con --resume <ts>: reusa runs/<ts>/ y su progress.json (lista de blockIds
//     ya hechos); los salta.
//   - Por cada bloque NO hecho: processBlock(..., dryRun:false). Al terminar OK,
//     se persiste el blockId en progress.json y se anexa el resultado a
//     manifest.json. La persistencia es DESPUÉS de cada bloque.
//   - AbortError (compuerta = No) → mensaje de reanudación y exit 0.
//
// Invocado SIN ningún flag, primero muestra un menú select
// (Dry-run / Migrar / Rollback / Estado) y enruta.

import { Command, Flags } from '@oclif/core'
import { select } from '@inquirer/prompts'
import chalk from 'chalk'
import path from 'node:path'
import fs from 'node:fs'

import * as strapi from '../core/strapi.js'
import { processBlock, AbortError } from '../core/pipeline.js'
import { createLogger } from '../core/logger.js'
import { createGate } from '../core/gate.js'
import { newRunDir, writeJson, packageRoot } from '../core/paths.js'

function runTimestamp() {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
}

function filterBlocks(blocks, flags) {
  let out = blocks
  if (flags.block) {
    out = out.filter((b) => String(b.documentId) === String(flags.block))
  }
  if (Number.isInteger(flags['from-block'])) {
    out = out.slice(flags['from-block'])
  }
  return out
}

function readJsonIf(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    /* corrupto → fallback */
  }
  return fallback
}

export default class Run extends Command {
  static description =
    'Migración real bloque a bloque, con compuerta, checkpoint y --resume.'

  static flags = {
    yes: Flags.boolean({ description: 'No preguntar: sí-a-todo (no interactivo)' }),
    block: Flags.string({ description: 'Procesar sólo el bloque con este documentId' }),
    'from-block': Flags.integer({ description: 'Saltar los primeros N bloques' }),
    resume: Flags.string({ description: 'Reanudar la corrida con este timestamp' }),
    concurrency: Flags.integer({ description: 'Concurrencia de PUTs por bloque' }),
  }

  async run() {
    const { flags, argv } = await this.parse(Run)

    // Menú interactivo si se invoca SIN flags.
    if (argv.length === 0 && Object.keys(flags).length === 0) {
      const choice = await select({
        message: '¿Qué querés hacer?',
        choices: [
          { name: 'Dry-run (sin escribir)', value: 'dry-run' },
          { name: 'Migrar (escribe en Strapi)', value: 'run' },
          { name: 'Rollback', value: 'rollback' },
          { name: 'Estado', value: 'status' },
        ],
      })
      if (choice === 'dry-run') {
        return this.config.runCommand('dry-run', [])
      }
      if (choice === 'rollback') {
        console.log(chalk.yellow('Usá: migrate rollback --run <ts> [--block <id> | --all]'))
        return
      }
      if (choice === 'status') {
        return this.config.runCommand('status', [])
      }
      // 'run' → continúa con la migración interactiva más abajo.
    }

    if (strapi.authMode() === 'unconfigured') {
      this.error(
        'Strapi no está configurado. Copiá .migration/.env.example a ' +
          '.migration/.env y definí STRAPI_URL + (STRAPI_API_TOKEN o ' +
          'STRAPI_USERNAME/STRAPI_PASSWORD).',
        { exit: 1 }
      )
    }

    // Resolver run dir + progreso.
    let timestamp
    let runDir
    if (flags.resume) {
      timestamp = flags.resume
      runDir = path.join(packageRoot(), 'runs', String(timestamp))
      if (!fs.existsSync(runDir)) {
        this.error(`No existe la corrida runs/${timestamp} para reanudar.`, { exit: 1 })
      }
    } else {
      timestamp = runTimestamp()
      runDir = newRunDir(timestamp)
    }

    const progressPath = path.join(runDir, 'progress.json')
    const manifestPath = path.join(runDir, 'manifest.json')
    const progress = readJsonIf(progressPath, [])
    const manifest = readJsonIf(manifestPath, {
      timestamp,
      dryRun: false,
      blocks: [],
      totals: { blocks: 0, units: 0, changed: 0, written: 0, failed: 0 },
    })
    // Normaliza por si se reanuda un manifest con shape distinto (evita NaN).
    if (!Array.isArray(manifest.blocks)) manifest.blocks = []
    manifest.totals = {
      blocks: 0, units: 0, changed: 0, written: 0, failed: 0,
      ...(manifest.totals || {}),
    }
    for (const k of ['blocks', 'units', 'changed', 'written', 'failed']) {
      manifest.totals[k] = Number(manifest.totals[k]) || 0
    }
    const done = new Set(progress)

    const log = createLogger(runDir)
    const gate = createGate({ assumeYes: flags.yes })

    log.info(flags.resume ? 'Reanudando corrida' : 'Corrida nueva', {
      runDir,
      timestamp,
      yaHechos: done.size,
    })

    let blocks
    try {
      blocks = await strapi.listBlocks()
    } catch (err) {
      this.error(String(err?.message || err), { exit: 1 })
    }
    const targets = filterBlocks(blocks, flags)
    const total = targets.length

    for (let i = 0; i < targets.length; i++) {
      const block = targets[i]
      if (done.has(block.documentId)) {
        console.log(
          chalk.dim(`(${i + 1}/${total}) ${block.documentId} ya hecho — salteado`)
        )
        continue
      }

      console.log(
        chalk.cyan(
          `\n━━ bloque ${i + 1}/${total}: ${block.name || block.documentId} ━━`
        )
      )

      let res
      try {
        res = await processBlock(block, {
          runDir,
          log,
          gate,
          strapi,
          dryRun: false,
          concurrency: flags.concurrency,
        })
      } catch (err) {
        if (err instanceof AbortError) {
          console.log(
            chalk.yellow(
              `\nInterrumpido. Reanudá con: migrate run --resume ${timestamp}`
            )
          )
          log.warn('Corrida interrumpida por el usuario', { timestamp })
          return // exit 0; checkpoint intacto
        }
        log.error('Error procesando bloque', {
          blockId: block.documentId,
          error: String(err?.message || err),
        })
        this.error(String(err?.message || err), { exit: 1 })
      }

      // Checkpoint: persistir DESPUÉS de cada bloque.
      progress.push(res.blockId)
      done.add(res.blockId)
      writeJson(progressPath, progress)

      manifest.blocks.push(res)
      manifest.totals.blocks += 1
      manifest.totals.units += Number(res.units) || 0
      manifest.totals.changed += Number(res.changed) || 0
      manifest.totals.written += Number(res.written) || 0
      manifest.totals.failed += Number(res.failed) || 0
      writeJson(manifestPath, manifest)

      log.info('Bloque completo', {
        blockId: res.blockId,
        progreso: `${i + 1}/${total}`,
        written: res.written,
        failed: res.failed,
      })
    }

    console.log(chalk.bold('\n═══════════ CORRIDA COMPLETA ═══════════'))
    console.log(`Bloques escritos : ${chalk.bold(manifest.totals.blocks)}/${total}`)
    console.log(`Unidades escritas: ${chalk.green.bold(manifest.totals.written)}`)
    console.log(`Fallidas         : ${chalk.red.bold(manifest.totals.failed)}`)
    console.log(chalk.dim(`Artefactos en: ${runDir}`))
  }
}
