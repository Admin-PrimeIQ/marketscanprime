/**
 * Piezas de listado que comparten los módulos sobre Prisma que no son catálogos (perfiles de tipo
 * de cambio, proyectos): el `sort` de Strapi con una lista de campos permitidos y referencias
 * (`id` numérico o `documentId`) agrupadas para un `where ... in`.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

type Direction = "asc" | "desc"
export type OrderBy = Array<Record<string, Direction | { sort: Direction; nulls: "first" | "last" }>>

/**
 * `"name:asc"`, `"code:desc"` o `"name"` (asc), como el `sort` de Strapi, limitado a `allowed`.
 * Siempre desempata por `id`. `toError` arma el error del módulo con el mensaje en español.
 *
 * En `nullable`, los vacíos quedan donde los dejaba el MySQL de Strapi (primeros en `asc`, últimos
 * en `desc`); Postgres los ordena al revés.
 */
export function parseSort(
  sort: string | undefined,
  allowed: ReadonlySet<string>,
  toError: (message: string) => Error,
  nullable: ReadonlySet<string> = new Set(),
): OrderBy {
  const orderBy: OrderBy = []
  for (const part of (sort ?? "").split(",")) {
    const [rawField, rawDirection] = part.trim().split(":")
    if (!rawField) continue
    if (!allowed.has(rawField)) throw toError(`No se puede ordenar por "${rawField}".`)
    const direction = (rawDirection ?? "asc").toLowerCase()
    if (direction !== "asc" && direction !== "desc") throw toError(`Dirección de orden inválida: "${rawDirection}".`)
    orderBy.push({
      [rawField]: nullable.has(rawField) ? { sort: direction, nulls: direction === "asc" ? "first" : "last" } : direction,
    })
  }
  if (!orderBy.some((entry) => "id" in entry)) orderBy.push({ id: "asc" })
  return orderBy
}

export interface SplitRefs {
  ids: number[]
  publicIds: string[]
}

/** La UI manda `documentId`; algún flujo viejo, el `id` numérico (o como texto). Sin repetidos. */
export function splitRefs(refs: ReadonlyArray<string | number>): SplitRefs {
  const ids = new Set<number>()
  const publicIds = new Set<string>()
  for (const ref of refs) {
    if (typeof ref === "number") {
      ids.add(ref)
      continue
    }
    const value = ref.trim()
    if (!value) continue
    if (/^\d+$/.test(value)) ids.add(Number(value))
    else publicIds.add(value)
  }
  return { ids: [...ids], publicIds: [...publicIds] }
}

/** `where` de Prisma para las referencias, o `null` si no hay ninguna. */
export function refsWhere({ ids, publicIds }: SplitRefs) {
  const or: Array<{ id: { in: number[] } } | { publicId: { in: string[] } }> = []
  if (ids.length > 0) or.push({ id: { in: ids } })
  if (publicIds.length > 0) or.push({ publicId: { in: publicIds } })
  return or.length > 0 ? { OR: or } : null
}

/** Referencias que no aparecen entre las filas encontradas, para nombrarlas en el error. */
export function missingRefs(refs: SplitRefs, found: ReadonlyArray<{ id: number; publicId: string }>): string[] {
  const foundIds = new Set(found.map((row) => row.id))
  const foundPublicIds = new Set(found.map((row) => row.publicId))
  return [
    ...refs.ids.filter((id) => !foundIds.has(id)).map(String),
    ...refs.publicIds.filter((publicId) => !foundPublicIds.has(publicId)),
  ]
}

/** `{ id }` para un número o texto numérico; `{ publicId }` para el resto. */
export function whereUnique(id: string | number, toError: (message: string) => Error): { id: number } | { publicId: string } {
  if (typeof id === "number") return { id }
  const value = id.trim()
  if (!value) throw toError("ID vacío.")
  return /^\d+$/.test(value) ? { id: Number(value) } : { publicId: value }
}
