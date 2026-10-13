"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

/**
 * Barra de estado por segmentos — la misma idea que la barra de uptime de
 * statuspage: ancho fijo, N segmentos, cada uno pintado por lo que pasó ahí.
 *
 * Sustituye a una barra de progreso lisa porque ésta dice CUÁNDO. Un 96% liso
 * y un 96% con tres fallas se ven idénticos; acá las tres fallas son tres
 * marcas rojas ubicadas en el momento de la corrida en que ocurrieron.
 *
 * Es una LÍNEA DE TIEMPO, no un listado: los bloques llegan en el orden del
 * bigserial del ledger, que es el mismo con el que el drainer elige el
 * siguiente. Por eso no se reordena acá — la tabla sí se ordena alfabéticamente
 * para poder buscar, pero aplicar ese orden a la barra movería cada marca a una
 * posición que no corresponde a cuándo pasó nada.
 *
 * La barra siempre ocupa el ancho completo, tenga la corrida 5 bloques o 1300:
 * es porcentual. Con muchos, un segmento cubre un rango y se pinta con el PEOR
 * estado del rango —promediar perdería justo la falla que se busca—. Con pocos,
 * un bloque abarca varios segmentos.
 */

/** Relleno sólido. A este grosor un fondo tenue no se distingue del vacío. */
const TONE: Record<string, string> = {
  done: "bg-emerald-500",
  running: "bg-amber-400",
  pending: "bg-muted-foreground/25",
  failed: "bg-red-500",
  skipped_ambiguous: "bg-amber-500",
  failed_sanity: "bg-amber-500",
  // Gris y no rojo, igual que en la insignia: alguien la detuvo a propósito.
  stopped: "bg-slate-400",
}

const TONE_UNKNOWN = "bg-muted-foreground/50"

/**
 * De menos a más grave. Manda el mayor del rango.
 *
 * `pending` gana sobre `done` a propósito: así un segmento sólo se pone verde
 * cuando TODO su rango terminó, y la barra no aparenta avance que no hubo.
 */
const SEVERITY = [
  "done",
  "pending",
  "running",
  "stopped",
  "skipped_ambiguous",
  "failed_sanity",
  "failed",
]

/**
 * Un estado que este build no conoce pesa casi como una falla: significa que el
 * backend introdujo un estado nuevo, y esconderlo bajo el verde sería peor que
 * mostrarlo gris.
 */
const RANK_UNKNOWN = SEVERITY.indexOf("skipped_ambiguous")

function rank(status: string): number {
  const i = SEVERITY.indexOf(status)
  return i === -1 ? RANK_UNKNOWN : i
}

/** Ancho objetivo por segmento, en px, contando su separación. */
const SLOT_PX = 9
const MIN_SLOTS = 12
/** Tope: la barra representa porcentaje, así que 100 segmentos es 1% cada uno. */
const MAX_SLOTS = 100

interface Segment {
  status: string
  /** Rango de bloques que cubre, en base 0 y con `to` exclusivo. */
  from: number
  to: number
}

export function RunStatusBar({
  statuses,
  className,
}: {
  /**
   * Estado de cada bloque en el orden en que la corrida los trabaja — tal como
   * los devuelve la API, sin reordenar. Ese orden es lo que convierte la
   * posición de una marca en información.
   */
  statuses: string[]
  className?: string
}) {
  const t = useTranslations("sync")
  const ref = useRef<HTMLDivElement>(null)

  /**
   * Cuántos segmentos caben. Fijar 100 dejaba marcas de menos de 2px en móvil,
   * donde un rojo suelto es indistinguible del borde de su vecino.
   */
  const [slots, setSlots] = useState(MAX_SLOTS)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const ancho = entry.contentRect.width
      if (!ancho) return
      setSlots(Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, Math.floor(ancho / SLOT_PX))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const segments: Segment[] = useMemo(() => {
    const total = statuses.length
    if (total === 0) return []

    // Siempre `slots`, nunca `min(slots, total)`: la barra representa el 100% de
    // la corrida y tiene que verse igual de larga con 5 bloques que con 1300.
    // Con pocos, varios segmentos consecutivos caen sobre el mismo bloque.
    const n = slots

    return Array.from({ length: n }, (_, i) => {
      const from = Math.floor((i * total) / n)
      // `max(from + 1, ...)` para que un segmento nunca quede sin bloque cuando
      // hay menos bloques que segmentos.
      const to = Math.max(from + 1, Math.floor(((i + 1) * total) / n))
      let peor = statuses[from]
      for (let j = from + 1; j < to; j++) {
        if (rank(statuses[j]) > rank(peor)) peor = statuses[j]
      }
      return { status: peor, from, to }
    })
  }, [statuses, slots])

  return (
    <div
      ref={ref}
      className={cn("flex h-8 w-full items-stretch gap-[2px]", className)}
      role="img"
      aria-label={t("statusBarLabel", { total: statuses.length })}
    >
      {segments.length === 0
        ? // Sin bloques todavía: el hueco tiene que ocupar el mismo alto, o la
          // tarjeta salta cuando llegan.
          Array.from({ length: slots }).map((_, i) => (
            <span key={i} className="min-w-0 flex-1 rounded-[2px] bg-muted-foreground/15" />
          ))
        : // La clave es el índice del segmento, no su `from`: con menos bloques que
          // segmentos varios comparten el mismo bloque y las claves chocarían.
          segments.map((s, i) => (
            <span
              key={i}
              // El rango va en base 1 y con el `to` inclusivo: es lo que el
              // operador cuenta en la tabla, no un índice de arreglo.
              title={`${
                s.to - s.from > 1 ? `${s.from + 1}–${s.to}` : `${s.from + 1}`
              } · ${TONE[s.status] ? t(`blockStatus.${s.status}`) : s.status}`}
              className={cn(
                "min-w-0 flex-1 rounded-[2px] transition-colors",
                TONE[s.status] ?? TONE_UNKNOWN
              )}
            />
          ))}
    </div>
  )
}
