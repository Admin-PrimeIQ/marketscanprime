// Comando `dry-run`: recorre los bloques, aplica fórmulas y calcula el diff
// completo, pero NO escribe nada en Strapi. Genera los artefactos
// (original/corrected/diff por bloque) y un manifest.json con totales, más un
// resumen final con conteos de cambios por campo.
//
// La compuerta corre en modo `assumeYes:true` (sweep sin preguntar): un dry-run
// nunca escribe, así que no tiene sentido pausar fase a fase.

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'

import * as strapi from '../core/strapi.js'
import { processBlock } from '../core/pipeline.js'
import { createLogger } from '../core/logger.js'
import { createGate } from '../core/gate.js'
import { newRunDir, writeJson } from '../core/paths.js'
import { PERSISTED_FORMULA_FIELDS } from '../core/fields.js'
import path from 'node:path'
import fs from 'node:fs'

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
  if (Number.isInteger(flags.limit)) {
    out = out.slice(0, flags.limit)
  }
  return out
}

export default class DryRun extends Command {
  static description =
    'Recalcula fórmulas y muestra el diff por bloque SIN escribir nada en Strapi.'

  static flags = {
    block: Flags.string({ description: 'Procesar sólo el bloque con este documentId' }),
    'from-block': Flags.integer({ description: 'Saltar los primeros N bloques' }),
    limit: Flags.integer({ description: 'Procesar como máximo N bloques' }),
  }

  async run() {
    const { flags } = await this.parse(DryRun)

    if (strapi.authMode() === 'unconfigured') {
      this.error(
        'Strapi no está configurado. Copiá .migration/.env.example a ' +
          '.migration/.env y definí STRAPI_URL + (STRAPI_API_TOKEN o ' +
          'STRAPI_USERNAME/STRAPI_PASSWORD).',
        { exit: 1 }
      )
    }

    const timestamp = runTimestamp()
    const runDir = newRunDir(timestamp)
    const log = createLogger(runDir)
    // dry-run no escribe: la compuerta avanza sola.
    const gate = createGate({ assumeYes: true })

    log.info('Dry-run iniciado', { runDir, timestamp })

    let blocks
    try {
      blocks = await strapi.listBlocks()
    } catch (err) {
      this.error(String(err?.message || err), { exit: 1 })
    }
    const targets = filterBlocks(blocks, flags)
    log.info('Bloques a procesar', { total: targets.length, deTotal: blocks.length })

    const manifestPath = path.join(runDir, 'manifest.json')
    const manifest = {
      timestamp,
      dryRun: true,
      blocks: [],
      totals: { blocks: 0, units: 0, changed: 0 },
    }
    const byField = Object.fromEntries(PERSISTED_FORMULA_FIELDS.map((f) => [f, 0]))

    for (let i = 0; i < targets.length; i++) {
      const block = targets[i]
      console.log(
        chalk.cyan(
          `\n━━ Bloque ${i + 1}/${targets.length}: ${block.name || block.documentId} ━━`
        )
      )
      let res
      try {
        res = await processBlock(block, {
          runDir,
          log,
          gate,
          strapi,
          dryRun: true,
        })
      } catch (err) {
        log.error('Error procesando bloque (dry-run)', {
          blockId: block.documentId,
          error: String(err?.message || err),
        })
        this.error(String(err?.message || err), { exit: 1 })
      }

      manifest.blocks.push({ blockId: res.blockId, units: res.units, changed: res.changed })
      manifest.totals.blocks += 1
      manifest.totals.units += res.units
      manifest.totals.changed += res.changed

      // Conteo por campo desde el diff.jsonl del bloque.
      const diffPath = path.join(runDir, 'blocks', String(block.documentId), 'diff.jsonl')
      if (fs.existsSync(diffPath)) {
        const lines = fs.readFileSync(diffPath, 'utf8').split('\n').filter(Boolean)
        for (const line of lines) {
          let entry
          try {
            entry = JSON.parse(line)
          } catch {
            continue
          }
          for (const c of entry.changes || []) {
            if (c.field in byField) byField[c.field] += 1
          }
        }
      }

      writeJson(manifestPath, manifest)
    }

    this.printSummary(manifest, byField, runDir)
  }

  printSummary(manifest, byField, runDir) {
    console.log(chalk.bold('\n═══════════ RESUMEN DRY-RUN ═══════════'))
    console.log(`Bloques procesados : ${chalk.bold(manifest.totals.blocks)}`)
    console.log(`Unidades totales   : ${chalk.bold(manifest.totals.units)}`)
    console.log(
      `Unidades a cambiar : ${chalk.bold.yellow(manifest.totals.changed)}`
    )
    console.log(chalk.bold('\nCambios por campo:'))
    const entries = Object.entries(byField).filter(([, n]) => n > 0)
    if (entries.length === 0) {
      console.log(chalk.green('  (ningún campo cambia)'))
    } else {
      for (const [field, n] of entries) {
        console.log(`  ${field.padEnd(28)} ${chalk.yellow(n)}`)
      }
    }
    console.log(chalk.dim(`\nArtefactos en: ${runDir}`))
    console.log(chalk.dim('Nada fue escrito en Strapi (dry-run).'))
  }
}
