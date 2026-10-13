/**
 * El agente a veces emite `:::note{…}` y `:::file` en la **misma línea**, con pares
 * `clave: valor` del archivo separados por espacios. El parser de ui-blocks exige que
 * cada `:::name{…}` ocupe su propia línea y el cuerpo vaya en líneas siguientes hasta `:::`.
 */

function splitInlineKeyValueChunk(chunk: string): string {
  const t = chunk.trim()
  if (!t) return ""
  const parts = t.split(/\s+(?=[\w-]+\s*:)/)
  return parts.map((p) => p.trim()).filter(Boolean).join("\n")
}

/**
 * `:::file` del agente suele usar `label:` y `src:`; el motor espera `filename:` y `url:`.
 */
function normalizeAgentFileKeyValueBody(inner: string): string {
  const lines = inner
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  const map = new Map<string, string>()
  for (const line of lines) {
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/)
    if (m) map.set(m[1].toLowerCase(), m[2].trim())
  }
  if (!map.has("filename") && map.has("label")) {
    map.set("filename", map.get("label")!)
    map.delete("label")
  }
  if (!map.has("url") && map.has("src")) {
    map.set("url", map.get("src")!)
    map.delete("src")
  }
  return [...map.entries()].map(([k, v]) => `${k}: ${v}`).join("\n")
}

/**
 * `:::note{attrs} :::file body... ::: :::` → `:::tip{attrs}` + `:::file` como **bloques hermanos**.
 * (El contenido de `:::note` no se re-parsea; anidar `:::file` dentro dejaría el DSL como texto plano.)
 * Se usa el nombre `tip` para que `title=` se muestre en la UI (las `note` nivel info ocultan el título).
 */
function expandCompactNoteFileDirective(directive: string): string | null {
  const m = directive.match(/^(\s*):::note(\{[^}]*\})\s+:::file\s+(.+)\s+:::\s*:::\s*$/)
  if (!m) return null
  const [, indent, noteAttrs, fileRest] = m
  const rawInner = splitInlineKeyValueChunk(fileRest)
  const fileInner = normalizeAgentFileKeyValueBody(rawInner)
  return `${indent}:::tip${noteAttrs}\n\n${indent}:::\n\n${indent}:::file\n${fileInner}\n\n${indent}:::`
}

/** `:::file key: val ... :::` en una sola línea (sin cuerpo multilínea). */
function expandCompactFileOnlyLine(line: string): string | null {
  const m = line.match(/^(\s*):::file\s+(.+)\s+:::\s*$/)
  if (!m) return null
  const [, indent, body] = m
  if (/^:::file\s*\{/i.test(line.trim())) return null
  const rawInner = splitInlineKeyValueChunk(body)
  const inner = normalizeAgentFileKeyValueBody(rawInner)
  return `${indent}:::file\n${inner}\n\n${indent}:::`
}

/**
 * Normaliza directivas compactas del agente para que `parseMarkdownToBlocks` las reconozca.
 */
function processOneLine(line: string): string {
  const whole = expandCompactNoteFileDirective(line)
  if (whole) return whole

  const noteIdx = line.search(/:::note\s*\{/)
  if (noteIdx >= 0) {
    const before = line.slice(0, noteIdx).trimEnd()
    const rest = line.slice(noteIdx).replace(/^\s*/, "")
    const embedded = expandCompactNoteFileDirective(rest)
    if (embedded) {
      return before ? `${before}\n\n${embedded}` : embedded
    }
  }

  const fileOnly = expandCompactFileOnlyLine(line)
  if (fileOnly) return fileOnly

  return line
}

export function preprocessAgentCompactUIBlocks(source: string): string {
  const lines = String(source ?? "").split("\n")
  const out: string[] = []
  for (const line of lines) {
    const transformed = processOneLine(line)
    out.push(...transformed.split("\n"))
  }
  return out.join("\n")
}
