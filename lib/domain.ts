import type { BlockDomain } from "@/lib/api/strapi"

/**
 * El tipo de inmueble de un bloque, en la interfaz.
 *
 * Vive acá y no en cada tabla porque ya se dibuja en cuatro lugares —los chips
 * de filtro del listado de bloques, su columna, el selector de bloque de
 * unidades y la cabecera del listado de unidades— y el color es lo que hace que
 * se lean como la MISMA cosa. Tres copias del mapa divergirían en la primera
 * corrección de tono, y entonces el chip que se aprieta y la insignia que
 * resulta dejarían de parecer relacionados.
 */

/**
 * Los tipos de inmueble, en el orden en que se dibujan.
 *
 * Vive acá porque estaba cableado en tres pantallas —bloques, unidades y ahora
 * proyectos— y las tres se habían quedado en `['housing', 'office']`. Peor: el
 * color y la etiqueta salían de ternarios (`d === 'housing' ? violeta : cyan`)
 * que sólo pueden expresar DOS valores, así que agregar el tercero no era
 * sumarlo a una lista, era reescribir cada chip.
 *
 * Con la lista y los mapas acá, un dominio nuevo se agrega en un solo lugar.
 */
export const DOMINIOS = ['housing', 'office', 'industrial'] as const satisfies readonly BlockDomain[]

/** Sólido. Para chips de filtro y celdas de tabla, donde tiene que resaltar. */
export const DOMAIN_BADGE_CLASS: Record<BlockDomain, string> = {
  housing: "bg-violet-600 hover:bg-violet-700 text-white",
  office: "bg-cyan-700 hover:bg-cyan-800 text-white",
  industrial: "bg-amber-600 hover:bg-amber-700 text-white",
}

/**
 * Suave. Para cabeceras, donde convive con las insignias de región, categoría y
 * país: una sólida al lado de tres claras se lee como una alerta, no como una
 * etiqueta más.
 */
export const DOMAIN_PILL_CLASS: Record<BlockDomain, string> = {
  housing: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  office: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  industrial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
}

/**
 * La clave de traducción del tipo, dentro de `common.blockForm`.
 *
 * Las etiquetas viven con el formulario del bloque —es donde se elige el valor—
 * y todo lo demás las toma de ahí. Una sola definición de "Vivienda".
 */
export function domainLabelKey(domain: BlockDomain): string {
  return `domain${domain.charAt(0).toUpperCase()}${domain.slice(1)}`
}
