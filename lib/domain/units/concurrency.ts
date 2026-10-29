/**
 * Bloqueo optimista de unidades: que dos personas editando la misma hoja no se pisen.
 *
 * Decidido con el usuario (29 oct): al guardar, una unidad que cambió desde que se cargó la hoja no
 * se sobrescribe; se rechaza y se avisa ("otra persona editó esta unidad; recarga"). Con Strapi
 * ganaba el último que guardaba, sin aviso.
 *
 * La hoja manda, por cada unidad editada, el `updatedAt` con el que la cargó. `saveUnitChanges`
 * (agente de módulos, ROADMAP.md §4.8) bloquea primero la fila del bloque (`lockBlockForUpdate` en
 * lib/db/block-counters.ts), así que los guardados del mismo bloque van de uno en uno; luego lee el
 * `updatedAt` actual de esas unidades y llama a `findStaleUnits`. Leer y comparar después del
 * bloqueo evita la carrera entre la lectura y la escritura.
 *
 * Se compara en milisegundos: es la precisión de `Date` en JavaScript, la que recibe la hoja de
 * Prisma. Postgres guarda microsegundos; compararlos en SQL contra el valor de la hoja daría
 * conflictos falsos.
 *
 * Pura: sin React ni alias `@/`, corre con `node --test`.
 */

/** Lo que manda la hoja: id de la unidad (`documentId` = `publicId`) y su `updatedAt` en ISO. */
export type ExpectedVersion = { id: string; updatedAt: string }

/** Lo que hay en la base al guardar, leído después del bloqueo. */
export type CurrentVersion = { id: string; updatedAt: Date | string }

export type StaleReason = "modificada" | "borrada" | "sin-version"

export type StaleUnit = { id: string; reason: StaleReason; expected: string; current: string | null }

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value)
}

/** Las unidades que no se pueden guardar: cambiaron, ya no existen o la hoja no mandó una fecha válida. */
export function findStaleUnits(expected: readonly ExpectedVersion[], current: readonly CurrentVersion[]): StaleUnit[] {
  const currentById = new Map(current.map((c) => [c.id, c]))
  const stale: StaleUnit[] = []
  for (const e of expected) {
    const now = currentById.get(e.id)
    const expectedMs = Date.parse(e.updatedAt)
    if (!now) {
      stale.push({ id: e.id, reason: "borrada", expected: e.updatedAt, current: null })
    } else if (Number.isNaN(expectedMs)) {
      stale.push({ id: e.id, reason: "sin-version", expected: e.updatedAt, current: new Date(toMillis(now.updatedAt)).toISOString() })
    } else if (toMillis(now.updatedAt) !== expectedMs) {
      stale.push({ id: e.id, reason: "modificada", expected: e.updatedAt, current: new Date(toMillis(now.updatedAt)).toISOString() })
    }
  }
  return stale
}
