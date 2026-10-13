/**
 * Cómo trata el motor de fórmulas a un bloque.
 *
 * Son TRES comportamientos y sólo tres. Un **lote** mide por terreno; un
 * **vertical** suma balcón a la construcción habitable y parqueo al total; y
 * **horizontal** es todo lo demás — no suma ninguno de los dos. No existe un
 * cuarto caso: cuando el motor no reconoce vertical ni lote, calcula
 * horizontal, no se detiene.
 *
 * Por eso la etiqueta se deriva de los MISMOS booleanos que usan las fórmulas
 * en vez de volver a leer el texto de la categoría. Antes eran dos pruebas
 * distintas sobre el mismo hecho: el motor preguntaba "¿dice vertical?" y, si
 * no, calculaba horizontal; el badge preguntaba además "¿dice horizontal?" y,
 * si no, mostraba "Desconocido". Un bloque industrial de categoría "Bodegas"
 * caía justo en esa grieta — se calculaba horizontal y se rotulaba desconocido.
 *
 * La categoría real (`Bodegas`, `Terrenos`, `Vivienda Vertical`) se sigue
 * mostrando aparte. Esto NO la reemplaza: dice qué hace el motor con ella.
 */
export type BlockBehavior = "Vertical" | "Lote" | "Horizontal"

/**
 * El orden importa y es el del motor: vertical gana sobre lote.
 *
 * `undefined` significa "no hay bloque cargado todavía", y cae en horizontal
 * por la misma razón que el motor: es lo que va a calcular mientras no sepa más.
 */
export function blockBehavior(isVertical?: boolean, isLote?: boolean): BlockBehavior {
  if (isVertical) return "Vertical"
  if (isLote) return "Lote"
  return "Horizontal"
}

/** Suave, para convivir con las insignias de tipo de inmueble, región y país. */
export const BEHAVIOR_BADGE_CLASS: Record<BlockBehavior, string> = {
  Vertical: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Horizontal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Lote: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
}
