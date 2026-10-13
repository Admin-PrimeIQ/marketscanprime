"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

/**
 * Ancho reservado al botón de desbordamiento (⋮), en px: el botón mide ~28 (p-1.5 más un
 * ícono de 16) y va como elemento de flujo pegado al último grupo visible, así que hay que
 * contar también el `gap-x-3` (12) que lo separa de ese grupo. 44 deja un margen mínimo.
 */
const OVERFLOW_TRIGGER_WIDTH = 44

/**
 * Reparte los grupos de una franja horizontal entre "caben" y "no caben".
 *
 * La franja mantiene SIEMPRE todos los grupos montados y maquetados; el contenedor
 * los recorta con `overflow-hidden`. Eso es lo que hace estable la medición: lo que
 * se mide no depende del resultado del cálculo, así que no puede entrar en el bucle
 * clásico de ocultar → sobra espacio → mostrar → no cabe → ocultar.
 *
 * Cada elemento medible debe llevar `data-group-id`. El resultado es la lista de ids
 * que quedaron fuera, en orden; quien llama decide qué hacer con ellos (típicamente
 * duplicarlos dentro de un menú y marcar inertes las copias recortadas).
 *
 * @param contentKey Cambia cuando cambia el ancho del contenido — no solo al
 *   redimensionar la ventana: también cuando un contador pasa de 5 a 44, cuando
 *   aparece el selector de moneda o cuando se cambia de idioma. Vuelve a medir.
 */
export function useOverflowGroups(contentKey: string) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [overflowIds, setOverflowIds] = useState<string[]>([])
  const [contentWidth, setContentWidth] = useState<number | null>(null)

  const measure = useCallback(() => {
    const strip = stripRef.current
    if (!strip) return

    /**
     * Ancho ocupado por lo que se ve. Sin desbordamiento, `scrollWidth` es la suma de los
     * grupos y sus gaps, así que el borde derecho coincide con el del último grupo. Con
     * desbordamiento, `scrollWidth` incluye los grupos recortados (siguen maquetados), por
     * lo que el mínimo con `clientWidth` lo deja en el ancho de la franja. Se mide sin
     * conocer el tamaño del botón ⋮.
     */
    setContentWidth((prev) => {
      const next = Math.min(strip.scrollWidth, strip.clientWidth)
      return prev === next ? prev : next
    })

    const groups = Array.from(strip.querySelectorAll<HTMLElement>("[data-group-id]"))
    if (groups.length === 0) {
      setOverflowIds((prev) => (prev.length === 0 ? prev : []))
      return
    }

    const gap = Number.parseFloat(getComputedStyle(strip).columnGap) || 0
    const available = strip.clientWidth
    const widths = groups.map((g) => g.offsetWidth)
    const totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (groups.length - 1)

    // Caben todos: sin botón de desbordamiento, sin ancho reservado.
    if (totalWidth <= available) {
      setOverflowIds((prev) => (prev.length === 0 ? prev : []))
      return
    }

    const budget = available - OVERFLOW_TRIGGER_WIDTH
    const hidden: string[] = []
    let used = 0

    for (const [i, group] of groups.entries()) {
      const id = group.dataset.groupId
      if (!id) continue
      // Una vez que uno no entra, los siguientes van al menú aunque sean más angostos:
      // reordenar visualmente los grupos confundiría más de lo que ahorra.
      if (hidden.length > 0) {
        hidden.push(id)
        continue
      }
      const next = used === 0 ? widths[i] : used + gap + widths[i]
      if (next <= budget) used = next
      else hidden.push(id)
    }

    setOverflowIds((prev) =>
      prev.length === hidden.length && prev.every((id, i) => id === hidden[i]) ? prev : hidden
    )
  }, [])

  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip || typeof ResizeObserver === "undefined") return

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(strip)
    // También cada grupo: su ancho cambia por contenido, no solo por resize de la franja.
    strip
      .querySelectorAll<HTMLElement>("[data-group-id]")
      .forEach((group) => observer.observe(group))

    return () => observer.disconnect()
  }, [measure, contentKey])

  return { stripRef, overflowIds, contentWidth }
}
