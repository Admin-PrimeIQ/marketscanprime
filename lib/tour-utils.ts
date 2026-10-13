"use client"

const STORAGE_KEY_PREFIX = "tour_completed_"

/**
 * El tour guiado está APAGADO.
 *
 * Se apagó a pedido el 2026-09-13, hasta nuevo aviso. No se borró nada: el
 * recorrido, sus pasos y la tarjeta de Ajustes siguen en su lugar, y la tarjeta
 * sigue visible con la nota de que está desactivado, para que nadie la busque
 * pensando que se perdió.
 *
 * **Para reactivarlo alcanza con poner `true` acá.** Todo lo demás lo lee de
 * esta constante: `useTour` deja de activarse solo en las cinco páginas que lo
 * usan, y el botón de Ajustes deja de responder. No hace falta tocar ninguna de
 * esas páginas.
 *
 * Lo que está en `localStorage` no se toca a propósito: si vuelve a encenderse,
 * quien ya lo completó no lo vuelve a ver.
 */
export const TOUR_ENABLED = false

/**
 * Resetea todos los tours completados
 */
export function resetAllTours() {
  const sections = ['projects', 'blocks', 'units', 'catalogs', 'units-table']
  sections.forEach(section => {
    const storageKey = `${STORAGE_KEY_PREFIX}${section}`
    localStorage.removeItem(storageKey)
  })
}

/**
 * Verifica si algún tour ha sido completado
 */
export function hasAnyTourCompleted(): boolean {
  const sections = ['projects', 'blocks', 'units', 'catalogs']
  return sections.some(section => {
    const storageKey = `${STORAGE_KEY_PREFIX}${section}`
    return localStorage.getItem(storageKey) === 'true'
  })
}
