// Comando `status`: lee manifest.json + progress.json de una corrida y muestra
// progreso (bloques hechos/total, unidades procesadas, cambiadas, escritas,
// fallidas) y la lista de bloques con fallos (escaneando put-results.jsonl).

import { Command, Flags } from '@oclif/core'
import { select } from '@inquirer/prompts'
import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'

import { packageRoot } from '../core/paths.js'

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

function readJsonIf(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    /* corrupto */
  }
  return fallback
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

export default class Status extends Command {
  static description = 'Muestra el estado/progreso de una corrida.'

  static flags = {
    run: Flags.string({ description: 'Timestamp de la corrida a inspeccionar' }),
  }

  async run() {
    const { flags } = await this.parse(Status)

    let runTs = flags.run
    if (!runTs) {
      const runs = listRuns()
      if (runs.length === 0) {
        console.log(chalk.yellow('No hay corridas en runs/.'))
        return
      }
      runTs = await select({
        message: 'Elegí la corrida:',
        choices: runs.map((r) => ({ name: r, value: r })),
      })
    }

    const runDir = path.join(runsRoot(), String(runTs))
    if (!fs.existsSync(runDir)) {
      console.log(chalk.yellow(`No existe la corrida runs/${runTs}.`))
      return
    }

    const manifest = readJsonIf(path.join(runDir, 'manifest.json'), null)
    const progress = readJsonIf(path.join(runDir, 'progress.json'), [])

    console.log(chalk.bold(`\n═══════════ ESTADO: ${runTs} ═══════════`))

    if (!manifest) {
      console.log(chalk.yellow('Sin manifest.json (corrida no iniciada o vacía).'))
    }

    const totals = manifest?.totals || {}
    const blocksDone = Array.isArray(progress) ? progress.length : 0
    const blocksInManifest = manifest?.blocks?.length ?? 0

    console.log(`Bloques hechos     : ${chalk.bold(blocksDone || blocksInManifest)}`)
    console.log(`Unidades procesadas: ${chalk.bold(totals.units ?? 0)}`)
    console.log(`Unidades cambiadas : ${chalk.yellow(totals.changed ?? 0)}`)
    console.log(`Unidades escritas  : ${chalk.green(totals.written ?? 0)}`)
    console.log(`Unidades fallidas  : ${chalk.red(totals.failed ?? 0)}`)
    if (manifest?.dryRun) console.log(chalk.dim('(corrida dry-run: nada escrito)'))

    // Bloques con fallos: escanear put-results.jsonl de cada bloque.
    const blocksRoot = path.join(runDir, 'blocks')
    const failing = []
    if (fs.existsSync(blocksRoot)) {
      const dirs = fs
        .readdirSync(blocksRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
      for (const blockId of dirs) {
        const results = readJsonl(path.join(blocksRoot, blockId, 'put-results.jsonl'))
        const fails = results.filter((r) => r.ok === false)
        if (fails.length > 0) failing.push({ blockId, fails: fails.length })
      }
    }

    if (failing.length > 0) {
      console.log(chalk.bold.red('\nBloques con fallos:'))
      for (const f of failing) {
        console.log(`  ${f.blockId}  ${chalk.red(f.fails + ' PUT fallidos')}`)
      }
    } else {
      console.log(chalk.green('\nSin fallos registrados.'))
    }

    console.log(chalk.dim(`\nArtefactos en: ${runDir}`))
  }
}
