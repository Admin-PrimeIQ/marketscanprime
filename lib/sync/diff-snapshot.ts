/**
 * Compara el respaldo previo de MySQL contra las filas que la corrida escribió.
 *
 * Los dos lados describen las mismas tablas pero no vienen de la misma fuente,
 * y ahí está toda la dificultad: MySQL devuelve los DECIMAL como texto
 * (`"106900.44"`, `"145.00"`) mientras el mapper produce números (`106900.44`,
 * `145`). Comparar en crudo marcaría CADA campo numérico como modificado y el
 * contador diría que cambió todo — inútil, y peor que no tenerlo, porque parece
 * información.
 */

/**
 * Columnas que el lado escrito nunca trae, así que compararlas sólo produce
 * falsos cambios.
 *
 * `id`, `created_at` y `key_units` las administra MySQL. `cod_proyecto` es la
 * LLAVE: el mapper la excluye de la fila de universe porque va en el WHERE, no
 * en el SET, y el respaldo se consultó filtrando justamente por ella — no puede
 * diferir. Sin ignorarla, la vista lado a lado mostraba un cambio que el
 * contador no reportaba, y dos vistas del mismo dato contradiciéndose es peor
 * que omitir una columna de identidad.
 */
const IGNORED_FIELDS = new Set(["id", "created_at", "key_units", "cod_proyecto"])

export interface FieldChange {
  field: string
  before: unknown
  after: unknown
}

export interface RowChange {
  /** Cómo se identifica la fila: número de unidad, o el cod del proyecto. */
  rowKey: string
  fields: FieldChange[]
}

export interface TableDiff {
  table: string
  added: number
  removed: number
  changed: number
  unchanged: number
  /** Filas modificadas, con el detalle campo por campo. */
  rows: RowChange[]
  addedKeys: string[]
  removedKeys: string[]
}

export interface SnapshotDiff {
  tables: TableDiff[]
  totals: { added: number; removed: number; changed: number; unchanged: number }
}

type Row = Record<string, unknown>

/** Dos valores son iguales si representan lo mismo, aunque no sean del mismo tipo. */
export function sameValue(a: unknown, b: unknown): boolean {
  const vacio = (v: unknown) => v === null || v === undefined || v === ""
  if (vacio(a) && vacio(b)) return true
  if (vacio(a) !== vacio(b)) return false

  // El caso que importa: "145.00" y 145 son el mismo precio.
  //
  // Y se compara con la PRECISIÓN DE LA COLUMNA, que el lado "antes" revela:
  // viene de MySQL, así que sus decimales son exactamente los que el DECIMAL
  // guarda. El mapper calcula con más — construccion_habitable_v2 da 207.959 y
  // la columna guarda 207.96; absorcion_unitaria da 12 decimales y la columna
  // 11. Sin redondear, CADA push reportaría esos campos como modificados en
  // todas las filas, y los cambios de verdad quedarían enterrados en el ruido.
  //
  // No se pierde nada al hacerlo: una diferencia más fina que la columna es
  // indistinguible una vez escrita, porque MySQL la va a redondear igual.
  const na = Number(a)
  const nb = Number(b)
  if (
    typeof a !== "boolean" &&
    typeof b !== "boolean" &&
    Number.isFinite(na) &&
    Number.isFinite(nb) &&
    String(a).trim() !== "" &&
    String(b).trim() !== ""
  ) {
    // Se comparan por TOLERANCIA y no redondeando cada lado: una diferencia de
    // exactamente medio dígito en la última posición —absorcion_m2 difiere en
    // 5e-12 sobre una columna de 11 decimales— es un empate que el redondeo
    // binario resuelve hacia lados distintos, y el campo aparecía como
    // modificado en 35 de 90 filas sin que nada hubiera cambiado.
    //
    // El umbral es medio dígito de la columna: por debajo de eso los dos
    // valores se guardan igual. Con 2 decimales tolera menos de medio centavo
    // y sigue detectando un cambio de un centavo.
    const decimales = (String(a).split(".")[1] ?? "").length
    const tolerancia = 0.5 * Math.pow(10, -decimales) * (1 + 1e-6)
    return Math.abs(na - nb) <= tolerancia
  }

  // Fechas. Las columnas comparables aquí son DATE (fecha_recoleccion,
  // fecha_inicio, fecha_entrega): mysql2 las entrega como Date y al serializar
  // salen "2026-04-15T00:00:00.000Z", mientras el mapper manda "2026-04-15".
  // Se comparan por su parte de fecha para que esas dos formas del mismo día
  // no se reporten como un cambio. Los únicos datetime reales del esquema son
  // created_at —ignorado— y hora_recoleccion, que es TIME y no entra acá.
  const fecha = (v: unknown) => {
    const txt = String(v)
    if (!/^\d{4}-\d{2}-\d{2}/.test(txt)) return null
    const ms = Date.parse(txt)
    return Number.isFinite(ms) ? txt.slice(0, 10) : null
  }
  const fa = fecha(a)
  const fb = fecha(b)
  if (fa && fb) return fa === fb

  return String(a) === String(b)
}

function diffRows(table: string, before: Row[], after: Row[], keyOf: (r: Row) => string): TableDiff {
  const antes = new Map(before.map((r) => [keyOf(r), r]))
  const despues = new Map(after.map((r) => [keyOf(r), r]))

  const d: TableDiff = {
    table, added: 0, removed: 0, changed: 0, unchanged: 0,
    rows: [], addedKeys: [], removedKeys: [],
  }

  for (const [key, filaDespues] of despues) {
    const filaAntes = antes.get(key)
    if (!filaAntes) {
      d.added += 1
      d.addedKeys.push(key)
      continue
    }
    const fields: FieldChange[] = []
    for (const campo of Object.keys(filaDespues)) {
      if (IGNORED_FIELDS.has(campo)) continue
      if (!sameValue(filaAntes[campo], filaDespues[campo])) {
        fields.push({ field: campo, before: filaAntes[campo], after: filaDespues[campo] })
      }
    }
    if (fields.length > 0) {
      d.changed += 1
      d.rows.push({ rowKey: key, fields })
    } else {
      d.unchanged += 1
    }
  }

  for (const key of antes.keys()) {
    if (!despues.has(key)) {
      d.removed += 1
      d.removedKeys.push(key)
    }
  }

  return d
}

const asArray = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : v ? [v as Row] : [])

/**
 * @param before contenido de `mysql-snapshot-<id>.json`
 * @param after  contenido de `written-<id>.json`
 */
export function diffSnapshot(before: unknown, after: unknown): SnapshotDiff {
  const b = (before ?? {}) as Record<string, unknown>
  const a = (after ?? {}) as Record<string, unknown>

  // Las filas de banderas viajan en `flags: [{ table, row }]`.
  const flagRow = (tabla: string): Row[] => {
    const flags = Array.isArray(a.flags) ? (a.flags as Array<Record<string, unknown>>) : []
    const f = flags.find((x) => x.table === tabla)
    return f?.row ? [f.row as Row] : []
  }

  // El cod identifica al universo y a las filas de banderas: hay una sola por
  // bloque, así que cualquier clave estable sirve mientras sea la misma en los
  // dos lados. Se toma del archivo escrito, que siempre lo trae.
  const cod = String(a.cod ?? "")

  const tablas: TableDiff[] = [
    diffRows("housing_universe", asArray(b.universe), asArray(a.universe), () => cod),
    diffRows("housing_units", asArray(b.units), asArray(a.units),
      (r) => String(r.num_unidad ?? r.unidad ?? "")),
    diffRows("housing_amenities", asArray(b.amenities), flagRow("housing_amenities"), () => cod),
    diffRows("housing_services", asArray(b.services), flagRow("housing_services"), () => cod),
  ]

  const totals = tablas.reduce(
    (acc, t) => ({
      added: acc.added + t.added,
      removed: acc.removed + t.removed,
      changed: acc.changed + t.changed,
      unchanged: acc.unchanged + t.unchanged,
    }),
    { added: 0, removed: 0, changed: 0, unchanged: 0 }
  )

  return { tables: tablas, totals }
}


// ─── Vista lado a lado ───────────────────────────────────────────────────────

export type LineState = "same" | "changed" | "added" | "removed"

export interface SideLine {
  /** Número de línea de cada lado; null donde ese lado no tiene línea. */
  n1: number | null
  n2: number | null
  left: string | null
  right: string | null
  state: LineState
}

const json = (v: unknown) => (v === undefined ? "null" : JSON.stringify(v))

/**
 * Arma las dos columnas del diff, línea por línea y ya alineadas.
 *
 * NO es un diff de texto sobre los archivos crudos, y no puede serlo: los dos
 * tienen forma distinta —el respaldo trae `universe/units/amenities/services`,
 * lo escrito trae `operation/cod/universe/units/flags`—, distinto orden de
 * claves, `id` y `created_at` de un solo lado, y números como texto contra
 * números. Un diff de líneas sobre eso marcaría el archivo entero como
 * cambiado.
 *
 * En vez de eso se recorre la estructura ya emparejada por fila y por campo, y
 * se emite un par de líneas por cada una. La alineación sale exacta por
 * construcción: no hay heurística que pueda desfasarse.
 */
export function sideBySide(before: unknown, after: unknown): SideLine[] {
  const b = (before ?? {}) as Record<string, unknown>
  const a = (after ?? {}) as Record<string, unknown>

  const flagRow = (tabla: string): Row[] => {
    const flags = Array.isArray(a.flags) ? (a.flags as Array<Record<string, unknown>>) : []
    const f = flags.find((x) => x.table === tabla)
    return f?.row ? [f.row as Row] : []
  }
  const cod = String(a.cod ?? "")

  const tablas: Array<[string, Row[], Row[], (r: Row) => string]> = [
    ["housing_universe", asArray(b.universe), asArray(a.universe), () => cod],
    ["housing_units", asArray(b.units), asArray(a.units), (r) => String(r.num_unidad ?? r.unidad ?? "")],
    ["housing_amenities", asArray(b.amenities), flagRow("housing_amenities"), () => cod],
    ["housing_services", asArray(b.services), flagRow("housing_services"), () => cod],
  ]

  const lines: SideLine[] = []
  let n1 = 0
  let n2 = 0
  const push = (left: string | null, right: string | null, state: LineState) => {
    lines.push({
      n1: left === null ? null : ++n1,
      n2: right === null ? null : ++n2,
      left,
      right,
      state,
    })
  }
  const ambos = (texto: string) => push(texto, texto, "same")

  ambos("{")
  for (const [tabla, antes, despues, keyOf] of tablas) {
    ambos(`  "${tabla}": [`)

    const mapAntes = new Map(antes.map((r) => [keyOf(r), r]))
    const mapDespues = new Map(despues.map((r) => [keyOf(r), r]))
    const claves = [...mapDespues.keys(), ...[...mapAntes.keys()].filter((k) => !mapDespues.has(k))]

    for (const clave of claves) {
      const filaA = mapAntes.get(clave)
      const filaB = mapDespues.get(clave)
      const estadoFila: LineState = !filaA ? "added" : !filaB ? "removed" : "same"

      const abre = "    {"
      if (estadoFila === "added") push(null, abre, "added")
      else if (estadoFila === "removed") push(abre, null, "removed")
      else ambos(abre)

      const campos = [
        ...new Set([...Object.keys(filaA ?? {}), ...Object.keys(filaB ?? {})]),
      ]
        .filter((c) => !IGNORED_FIELDS.has(c))
        .sort()

      for (const campo of campos) {
        const va = filaA?.[campo]
        const vb = filaB?.[campo]
        const izq = filaA ? `      "${campo}": ${json(va)}` : null
        const der = filaB ? `      "${campo}": ${json(vb)}` : null
        if (!filaA) push(null, der, "added")
        else if (!filaB) push(izq, null, "removed")
        else push(izq, der, sameValue(va, vb) ? "same" : "changed")
      }

      const cierra = "    },"
      if (estadoFila === "added") push(null, cierra, "added")
      else if (estadoFila === "removed") push(cierra, null, "removed")
      else ambos(cierra)
    }

    ambos("  ],")
  }
  ambos("}")

  return lines
}
