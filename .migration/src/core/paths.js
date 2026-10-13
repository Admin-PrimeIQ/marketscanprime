// Resolución de rutas de artefactos de cada corrida, relativas a la raíz del
// paquete .migration/ (no al cwd). Todas las funciones aseguran que el
// directorio exista (mkdir recursivo) antes de devolver la ruta.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// .../.migration/src/core/paths.js -> raíz del paquete = .../.migration
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..')
const RUNS_ROOT = path.join(PACKAGE_ROOT, 'runs')

/** Raíz del paquete .migration/ (útil para tests / otros módulos). */
export function packageRoot() {
  return PACKAGE_ROOT
}

/**
 * Crea (si no existe) y devuelve `runs/<timestamp>/`.
 * @param {string} timestamp p. ej. "2026-06-07_2230"
 */
export function newRunDir(timestamp) {
  const dir = path.join(RUNS_ROOT, String(timestamp))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Crea (si no existe) y devuelve `runs/<ts>/blocks/<blockId>/`.
 * @param {string} runDir devuelto por newRunDir
 * @param {string|number} blockId
 */
export function blockDir(runDir, blockId) {
  const dir = path.join(runDir, 'blocks', String(blockId))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Añade una línea JSONL (`JSON.stringify(obj) + "\n"`) al archivo dado. */
export function appendJsonl(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify(obj) + '\n')
}

/** Escribe un objeto como JSON con sangría (sobrescribe). */
export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n')
}
