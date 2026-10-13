// Logger con "tee": cada evento se escribe en tres destinos a la vez:
//   1. runDir/run.ndjson  — JSON estructurado (pino multistream)
//   2. consola             — línea humana legible
//   3. runDir/run.log      — la misma línea humana, persistida
//
// API: createLogger(runDir) -> { info, warn, error, phase }

import fs from 'node:fs'
import path from 'node:path'
import { pino } from 'pino'

function ts() {
  return new Date().toISOString()
}

function humanLine(level, msg, data) {
  const base = `${ts()} ${level.toUpperCase().padEnd(5)} ${msg}`
  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    let extra
    try {
      extra = JSON.stringify(data)
    } catch {
      extra = String(data)
    }
    return `${base} ${extra}`
  }
  return base
}

/**
 * @param {string} runDir directorio de la corrida (ya creado)
 * @returns {{info:Function, warn:Function, error:Function, phase:Function}}
 */
export function createLogger(runDir) {
  fs.mkdirSync(runDir, { recursive: true })

  const ndjsonPath = path.join(runDir, 'run.ndjson')
  const logPath = path.join(runDir, 'run.log')

  // pino escribe NDJSON estructurado al archivo run.ndjson.
  const ndjsonStream = pino.destination({ dest: ndjsonPath, sync: true })
  const pinoLogger = pino({ level: 'info', base: undefined }, ndjsonStream)

  // run.log recibe las líneas humanas (append).
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })

  function emit(level, msg, data) {
    // 1. NDJSON estructurado
    if (data && typeof data === 'object') pinoLogger[level](data, msg)
    else pinoLogger[level](msg)
    // 2 + 3. Línea humana a consola y a run.log
    const line = humanLine(level, msg, data)
    const sink = level === 'error' ? process.stderr : process.stdout
    sink.write(line + '\n')
    logStream.write(line + '\n')
  }

  return {
    info: (msg, data) => emit('info', msg, data),
    warn: (msg, data) => emit('warn', msg, data),
    error: (msg, data) => emit('error', msg, data),
    /** Banner de fase claramente visible en todos los destinos. */
    phase: (name) => {
      const banner = `═══ FASE: ${name} ═══`
      pinoLogger.info({ phase: name }, banner)
      const line = `\n${ts()} ${banner}`
      process.stdout.write(line + '\n')
      logStream.write(line + '\n')
    },
  }
}
