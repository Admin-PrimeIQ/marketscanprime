/**
 * Archivar sesiones en el sidebar sin borrarlas en el servidor.
 * Usa sessionStorage para que se limpie al cerrar la pestaña.
 * Migra desde la clave antigua "hidden" si existe.
 */
const KEY = "primeiq/archived-copilot-session-ids"
const LEGACY_HIDDEN_KEY = "primeiq/hidden-copilot-session-ids"

function read(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    let raw = sessionStorage.getItem(KEY)
    if (!raw) {
      raw = sessionStorage.getItem(LEGACY_HIDDEN_KEY)
      if (raw) {
        sessionStorage.setItem(KEY, raw)
        sessionStorage.removeItem(LEGACY_HIDDEN_KEY)
      }
    }
    if (!raw) return new Set()
    const a: unknown = JSON.parse(raw)
    if (!Array.isArray(a)) return new Set()
    return new Set(
      a.filter((x): x is string => typeof x === "string" && x.length > 0),
    )
  } catch {
    return new Set()
  }
}

function write(ids: Set<string>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...ids]))
  } catch {
    /* private mode */
  }
}

export function archiveSessionInSidebar(sessionId: string) {
  const s = read()
  s.add(sessionId.trim())
  write(s)
}

export function isSessionArchived(sessionId: string): boolean {
  return read().has(sessionId.trim())
}

export function unarchiveSessionInSidebar(sessionId: string) {
  const s = read()
  s.delete(sessionId.trim())
  write(s)
}

/**
 * Archiva o desarchiva varias de una vez.
 *
 * Existe para que la selección múltiple no lea y escriba el storage —y no
 * refresque la lista— una vez por conversación: marcar veinte disparaba veinte
 * pasadas. Acá se lee una vez, se aplica todo y se escribe una vez.
 */
export function setSessionsArchived(sessionIds: string[], archivado: boolean) {
  const s = read()
  for (const id of sessionIds) {
    const limpio = String(id ?? "").trim()
    if (!limpio) continue
    if (archivado) s.add(limpio)
    else s.delete(limpio)
  }
  write(s)
}
