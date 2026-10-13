// Compuerta interactiva por fase: sí / no / sí-a-todo.
// Usa @inquirer/prompts `select` → menú navegable con flechas ↑/↓ + Enter.
// Recuerda "sí a todo" para no volver a preguntar.

import { select } from '@inquirer/prompts'

/**
 * @param {{ assumeYes?: boolean }} [opts]
 * @returns {(phaseLabel: string) => Promise<'continue'|'abort'>}
 */
export function createGate({ assumeYes = false } = {}) {
  let all = assumeYes
  return async function gate(phaseLabel) {
    if (all) return 'continue'
    const ans = await select({
      message: `${phaseLabel} — ¿continuar?`,
      choices: [
        { name: 'Sí (avanzar)', value: 'continue' },
        { name: 'No (interrumpir)', value: 'abort' },
        { name: 'Sí a todo (no volver a preguntar)', value: 'all' },
      ],
    })
    if (ans === 'all') {
      all = true
      return 'continue'
    }
    return ans // 'continue' | 'abort'
  }
}
