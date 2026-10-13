/**
 * UI Blocks Engine — zero-dependency structured response renderer.
 *
 * Parses :::directive{attrs} markdown-like syntax into typed UIBlock objects.
 * See .claude/skills/ui-blocks-engine/SKILL.md for full docs, n8n usage, and React renderer.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BlockMeta {
  id?: string
  source?: string
  timestamp?: string
  confidence?: number
  tags?: string[]
}

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link"

export interface ButtonItem {
  label: string
  /** Semantic action key ("schedule_visit") or URL ("url:https://...") */
  action: string
  variant?: ButtonVariant
  disabled?: boolean
  icon?: string
}

export type TextVariant = "body" | "heading" | "subheading" | "label" | "caption"
export type NoteLevel  = "info" | "success" | "warning" | "error" | "tip"

export type UIBlock =
  | { type: "text";       content: string; variant?: TextVariant; meta?: BlockMeta }
  | { type: "list";       items: string[];  ordered?: boolean;    meta?: BlockMeta }
  | { type: "table";      headers: string[]; rows: string[][];    caption?: string; meta?: BlockMeta }
  | { type: "note";       content: string; level?: NoteLevel;    title?: string;   meta?: BlockMeta }
  | { type: "code";       code: string;    language?: string;    filename?: string; meta?: BlockMeta }
  | { type: "image";      src: string;     alt?: string;         caption?: string; width?: number; meta?: BlockMeta }
  | { type: "audio";      src: string;     label?: string;       duration?: number; meta?: BlockMeta }
  | { type: "file";       url: string;     filename: string;     size?: number;    mimeType?: string; meta?: BlockMeta }
  | {
      type: "hidden-file"
      url: string
      label: string
      /** Categoría del adjunto (línea `type:` del DSL, p.ej. pdf). */
      assetType?: string
      format?: string
      mimeType?: string
      /** Valor literal de la línea `size:` (p.ej. "130 bytes"). */
      sizeLabel?: string
      /** Contenido extraído en Markdown; no se muestra en el frontend. */
      body: string
      meta?: BlockMeta
    }
  | { type: "buttons";    items: ButtonItem[];                                      meta?: BlockMeta }
  | { type: "divider";    meta?: BlockMeta }
  | { type: "admonition"; title?: string;  open?: boolean;       children: UIBlock[]; meta?: BlockMeta }
  | {
      type: "email"
      /** Cuerpo del mensaje (Markdown). */
      body: string
      subject?: string
      to?: string
      from?: string
      meta?: BlockMeta
    }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2, 10)
}

function parseAttrs(raw: string): Record<string, string | boolean | number> {
  const attrs: Record<string, string | boolean | number> = {}
  const re = /(\w[\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(true|false|\d+(?:\.\d+)?)|(\S+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const [, key, dq, sq, literal, unquoted] = m
    if (dq !== undefined)                             attrs[key] = dq
    else if (sq !== undefined)                        attrs[key] = sq
    else if (literal === "true")                      attrs[key] = true
    else if (literal === "false")                     attrs[key] = false
    else if (literal !== undefined && /^\d/.test(literal)) attrs[key] = Number(literal)
    else if (unquoted !== undefined)                  attrs[key] = unquoted
    else                                              attrs[key] = true
  }
  return attrs
}

function parseMarkdownTable(raw: string): { headers: string[]; rows: string[][] } {
  const lines = raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !/^\s*\|[-:| ]+\|\s*$/.test(l))

  const parseRow = (line: string): string[] =>
    line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())

  const [headerLine, ...dataLines] = lines
  return {
    headers: parseRow(headerLine ?? ""),
    rows: dataLines.map(parseRow),
  }
}

function parseListContent(raw: string): { items: string[]; ordered: boolean } {
  const lines = raw.trim().split("\n").filter(Boolean)
  const ordered = /^\s*\d+[.)]\s/.test(lines[0] ?? "")
  const items = lines.map((l) => l.replace(/^\s*(?:\d+[.)]|[-*+])\s+/, "").trim())
  return { items, ordered }
}

function parseButtonsContent(raw: string): ButtonItem[] {
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && l.includes("|"))
    .map((line) => {
      const parts = line.replace(/^[-*]\s*/, "").split("|").map((p) => p.trim())
      const [label = "", action = "", variant = "secondary"] = parts
      return { label, action, variant: (variant as ButtonVariant) || "secondary" }
    })
    .filter((b) => b.label && b.action)
}

/** `:::success` / `:::warning` / … → mismo bloque `note` con `level` fijado por nombre. */
const NOTE_DIRECTIVE_BY_NAME = new Set<NoteLevel>(["info", "success", "warning", "error", "tip"])

/** Tabla estilo agente: `headers: A | B` + `rows:` + `- c1 | c2` */
function parseHeadersRowsDSL(raw: string): { headers: string[]; rows: string[][] } {
  const headers: string[] = []
  const rows: string[][] = []
  let mode: "seek" | "rows" = "seek"
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t) continue
    const hm = t.match(/^headers\s*:\s*(.+)$/i)
    if (hm) {
      headers.push(...hm[1].split("|").map((c) => c.trim()).filter(Boolean))
      continue
    }
    if (/^rows\s*:/i.test(t)) {
      mode = "rows"
      continue
    }
    if (mode === "rows" && t.startsWith("-")) {
      const cells = t.replace(/^\-\s*/, "").split("|").map((c) => c.trim())
      if (cells.some(Boolean)) rows.push(cells)
    }
  }
  return { headers, rows }
}

function parseFlexibleTable(innerRaw: string): { headers: string[]; rows: string[][] } {
  const body = innerRaw.trim()
  if (/^headers\s*:/im.test(body)) {
    const dsl = parseHeadersRowsDSL(body)
    if (dsl.headers.length > 0 && dsl.rows.length > 0) return dsl
  }
  return parseMarkdownTable(body)
}

function isMarkdownTableDelimiter(line: string): boolean {
  const t = line.trim()
  return /^\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?$/.test(t)
}

function parsePlainMarkdownTable(
  lines: string[],
  start: number,
): { block: { headers: string[]; rows: string[][] } | null; next: number } {
  const header = lines[start]?.trim() ?? ""
  const divider = lines[start + 1]?.trim() ?? ""
  if (!header.startsWith("|") || !isMarkdownTableDelimiter(divider)) {
    return { block: null, next: start }
  }
  let end = start + 2
  while (end < lines.length) {
    const t = lines[end].trim()
    if (!t || !t.startsWith("|")) break
    end++
  }
  const tableRaw = lines.slice(start, end).join("\n")
  return { block: parseMarkdownTable(tableRaw), next: end }
}

/** Líneas `clave: valor` (image / audio / file en formato agente). */
function parseKeyValueLines(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split("\n")) {
    const m = line.trim().match(/^([\w-]+)\s*:\s*(.*)$/)
    if (m) out[m[1].toLowerCase()] = m[2].trim()
  }
  return out
}

/**
 * Cabecera `clave: valor` al inicio del bloque; el resto (tras líneas en blanco
 * opcionales) es cuerpo libre (p.ej. Markdown). Usado por `:::hidden-file`.
 */
function parseKeyValueHeaderThenBody(raw: string): { kv: Record<string, string>; body: string } {
  const lines = raw.split("\n")
  const kv: Record<string, string> = {}
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      i++
      break
    }
    const m = trimmed.match(/^([\w-]+)\s*:\s*(.*)$/)
    if (!m) break
    kv[m[1].toLowerCase()] = m[2].trim()
    i++
  }
  while (i < lines.length && !lines[i].trim()) i++
  const body = lines.slice(i).join("\n").trim()
  return { kv, body }
}

function parseNumericAttr(v: string | number | boolean | undefined): number | undefined {
  if (v === undefined) return undefined
  if (typeof v === "number" && !Number.isNaN(v)) return v
  const n = Number(String(v).replace(/_/g, ""))
  return Number.isFinite(n) ? n : undefined
}

/**
 * Botones estilo agente: `- label: X | action: Y | variant: Z`
 * (tolerancia a `action:action:foo`).
 */
function parseButtonsLoose(raw: string): ButtonItem[] {
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const cleaned = line.replace(/^[-*]\s*/, "")
      const parts = cleaned.split("|").map((p) => p.trim())
      const map: Record<string, string> = {}
      for (const p of parts) {
        const idx = p.indexOf(":")
        if (idx === -1) continue
        const k = p.slice(0, idx).trim().toLowerCase()
        const v = p.slice(idx + 1).trim()
        map[k] = v
      }
      let action = map.action ?? ""
      action = action.replace(/^action:action:/i, "action:")
      return {
        label: map.label ?? "",
        action,
        variant: (map.variant as ButtonVariant) || "secondary",
        disabled: map.disabled === "true" || map.disabled === "1",
      }
    })
    .filter((b) => b.label)
}

function stripInlineMarkdown(text: string): string {
  return String(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim()
}

function actionFromLabel(label: string): string {
  const slug = stripInlineMarkdown(label)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return `action:${slug || "quick_action"}`
}

function parseButtonsNarrative(raw: string): ButtonItem[] {
  const out: ButtonItem[] = []
  for (const rawLine of raw.trim().split("\n")) {
    const line = rawLine.trim()
    if (!/^[-*]\s+/.test(line)) continue
    const withoutBullet = line.replace(/^[-*]\s+/, "").trim()
    const parts = withoutBullet.split(/\s+[—-]\s+/)
    const label = stripInlineMarkdown(parts[0] ?? "")
    if (!label) continue
    out.push({
      label,
      action: actionFromLabel(label),
      variant: "secondary",
    })
  }
  return out
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Inner parser — operates on a `lines` slice with a mutable index object
 * so nested admonitions can recurse cleanly without mutating the parent array.
 */
function parseLines(
  lines: string[],
  cursor: { i: number },
  meta: Partial<BlockMeta> | undefined,
): UIBlock[] {
  const result: UIBlock[] = []
  let textBuffer: string[] = []

  function flushText() {
    const content = textBuffer.join("\n").trim()
    if (content) {
      result.push({
        type: "text",
        content,
        meta: meta ? { ...meta, id: generateId() } : undefined,
      })
    }
    textBuffer = []
  }

  while (cursor.i < lines.length) {
    const rawLine = lines[cursor.i]
    // Important: do not strip orphan close markers that are the only content of the line.
    // Example that must work:
    //   :::image
    //   https://...
    //     :::   (indented closing delimiter)
    const rawTrimmed = rawLine.trim()
    const line = /^:{3,}\s*$/.test(rawTrimmed)
      ? rawTrimmed
      : rawLine.replace(/\s+:::\s*$/, "")
    const t = line.trim()
    const openMatch = t.match(/^:{3,}([\w-]+)(?:\[([^\]]*)\])?(?:\{([^}]*)\})?\s*$/)
    const closeMatch = /^:{3,}\s*$/.test(t)
    /**
     * Directiva escrita SIN los `:::`.
     *
     * El modelo a veces emite `note{title="…"}` o `buttons` a secas. El prompt
     * se lo prohíbe y aun así ocurre, y sin esto la línea sale impresa tal cual
     * al usuario —"note{title=..." como texto— que es peor que no tener el
     * bloque. Se acepta la forma degradada en vez de castigar al lector.
     */
    const plainMatch = t.match(/^([a-z-]+)(?:\[([^\]]*)\])?(?:\{([^}]*)\})?\s*$/i)
    const plainDirective = plainMatch ? plainMatch[1].toLowerCase() : t.toLowerCase()
    const plainTitle = plainMatch
      ? (plainMatch[2]?.trim() ||
         (plainMatch[3] ? (parseAttrs(plainMatch[3]).title as string | undefined) : undefined))
      : undefined

    if (closeMatch) {
      // Ignore orphan closers so malformed output does not print raw `:::`.
      cursor.i++
      continue
    }

    if (!openMatch && /^-{3,}\s*$/.test(t)) {
      flushText()
      result.push({ type: "divider", meta: { id: generateId(), ...meta } })
      cursor.i++
      continue
    }

    if (openMatch) {
      flushText()
      const [, directive, bracketRaw = "", attrStr = ""] = openMatch
      const attrs = parseAttrs(attrStr)
      const bracket = bracketRaw.trim()
      if (bracket && attrs.title === undefined) {
        ;(attrs as Record<string, string | boolean | number>).title = bracket
      }
      cursor.i++

      // Collect raw inner content until matching :::  (depth-aware)
      const innerLines: string[] = []
      let depth = 1
      while (cursor.i < lines.length) {
        const inner = lines[cursor.i]
        const innerTrimmed = inner.trim()
        if (/^:{3,}\w/.test(innerTrimmed)) depth++
        if (/^:{3,}\s*$/.test(innerTrimmed)) {
          depth--
          if (depth === 0) { cursor.i++; break }
        }
        innerLines.push(inner)
        cursor.i++
      }

      const innerRaw = innerLines.join("\n")
      const blockMeta: BlockMeta = { id: generateId(), ...meta }
      const d = directive.toLowerCase()

      if (d === "note" || d === "callout") {
        result.push({
          type: "note",
          content: innerRaw.trim(),
          level: (attrs.level as NoteLevel) ?? "info",
          title: attrs.title as string | undefined,
          meta: blockMeta,
        })
      } else if (NOTE_DIRECTIVE_BY_NAME.has(d as NoteLevel)) {
        let title = attrs.title as string | undefined
        let content = innerRaw.trim()
        // One-line `:::tip …` → `:::tip[…]` with empty inner: body landed in title by mistake.
        if (!content && title && /^tip$/i.test(d) && !/\btitle\s*=/.test(attrStr)) {
          content = title
          title = undefined
        }
        result.push({
          type: "note",
          content,
          level: d as NoteLevel,
          title,
          meta: blockMeta,
        })
      } else if (d === "table") {
        const { headers, rows } = parseFlexibleTable(innerRaw)
        result.push({
          type: "table",
          headers,
          rows,
          caption: attrs.caption as string | undefined,
          meta: blockMeta,
        })
      } else if (d === "list") {
        let { items, ordered } = parseListContent(innerRaw)
        if (attrs.ordered === true || attrs.ordered === "true") ordered = true
        result.push({ type: "list", items, ordered, meta: blockMeta })
      } else if (d === "code") {
        result.push({
          type: "code",
          code: innerRaw.trimEnd(),
          language: attrs.language as string | undefined,
          filename: attrs.filename as string | undefined,
          meta: blockMeta,
        })
      } else if (d === "image") {
        const kv = parseKeyValueLines(innerRaw)
        const src =
          (attrs.src as string | undefined) ||
          kv.src ||
          kv.url ||
          innerRaw.trim()
        result.push({
          type: "image",
          src,
          alt: (attrs.alt as string | undefined) || kv.alt,
          caption: (attrs.caption as string | undefined) || kv.caption,
          width: parseNumericAttr(attrs.width) ?? parseNumericAttr(kv.width),
          meta: blockMeta,
        })
      } else if (d === "audio") {
        const kv = parseKeyValueLines(innerRaw)
        const src =
          (attrs.src as string | undefined) ||
          kv.src ||
          kv.url ||
          innerRaw.trim()
        result.push({
          type: "audio",
          src,
          label: (attrs.label as string | undefined) || kv.label,
          duration: parseNumericAttr(attrs.duration) ?? parseNumericAttr(kv.duration),
          meta: blockMeta,
        })
      } else if (d === "file") {
        const kv = parseKeyValueLines(innerRaw)
        result.push({
          type: "file",
          url: (attrs.url as string | undefined) || kv.url || "#",
          filename: (attrs.filename as string | undefined) || kv.filename || "archivo",
          size: parseNumericAttr(attrs.size) ?? parseNumericAttr(kv.size),
          mimeType: (attrs.mimeType as string | undefined) || kv.mimetype || kv.mimeType,
          meta: blockMeta,
        })
      } else if (d === "hidden-file") {
        const { kv, body } = parseKeyValueHeaderThenBody(innerRaw)
        result.push({
          type: "hidden-file",
          url: (attrs.url as string | undefined) || kv.src || kv.url || "#",
          label: (attrs.label as string | undefined) || kv.label || kv.filename || "archivo",
          assetType: kv.type,
          format: kv.format,
          mimeType: kv.mimetype,
          sizeLabel: kv.size,
          body,
          meta: blockMeta,
        })
      } else if (d === "buttons") {
        let items = parseButtonsContent(innerRaw)
        if (items.length === 0 || items.every((b) => !b.label || b.label.includes(":"))) {
          items = parseButtonsLoose(innerRaw)
        }
        if (items.length === 0) {
          items = parseButtonsNarrative(innerRaw)
        }
        result.push({ type: "buttons", items, meta: blockMeta })
      } else if (d === "divider" || d === "hr") {
        result.push({ type: "divider", meta: blockMeta })
      } else if (d === "footer") {
        result.push({
          type: "text",
          content: innerRaw.trim(),
          variant: "caption",
          meta: blockMeta,
        })
      } else if (d === "admonition" || d === "details" || d === "collapse") {
        // Recurse into inner content with a fresh cursor — no shared mutable state
        const innerCursor = { i: 0 }
        const children = parseLines(innerLines, innerCursor, meta)
        const openRaw = attrs.open
        const isClosed =
          openRaw === false ||
          openRaw === "false" ||
          String(openRaw ?? "").toLowerCase() === "false"
        result.push({
          type: "admonition",
          title: attrs.title as string | undefined,
          open: !isClosed,
          children,
          meta: blockMeta,
        })
      } else if (d === "email") {
        const subject =
          (attrs.subject as string | undefined)?.trim() ||
          (attrs.subjet as string | undefined)?.trim() ||
          (attrs.title as string | undefined)?.trim()
        result.push({
          type: "email",
          body: innerRaw.trim(),
          subject: subject || undefined,
          to: (attrs.to as string | undefined)?.trim() || undefined,
          from: (attrs.from as string | undefined)?.trim() || undefined,
          meta: blockMeta,
        })
      } else {
        // Unknown directive — preserve content as text
        result.push({ type: "text", content: innerRaw.trim(), meta: blockMeta })
      }
      continue
    }

    // Tolerant parse: model emitted `table` (without :::) + markdown table next.
    if (plainDirective === "table") {
      const parsed = parsePlainMarkdownTable(lines, cursor.i + 1)
      if (parsed.block) {
        flushText()
        result.push({
          type: "table",
          headers: parsed.block.headers,
          rows: parsed.block.rows,
          meta: { id: generateId(), ...meta },
        })
        cursor.i = parsed.next
        continue
      }
    }

    // Tolerant parse: model emitted `note|info|success|warning|error|tip` in plain text.
    if (plainDirective === "note" || NOTE_DIRECTIVE_BY_NAME.has(plainDirective as NoteLevel)) {
      let j = cursor.i + 1
      const contentLines: string[] = []
      while (j < lines.length) {
        const t = lines[j].trim()
        if (!t) break
        if (/^:::\w/.test(t) || /^:::$/.test(t)) break
        if (/^(note|table|list|buttons|code|image|audio|file|hidden-file|divider|admonition|email)\s*$/i.test(t)) break
        contentLines.push(lines[j])
        j++
      }
      if (contentLines.length > 0) {
        flushText()
        result.push({
          type: "note",
          title: plainTitle,
          content: contentLines.join("\n").trim(),
          level: plainDirective === "note" ? "info" : (plainDirective as NoteLevel),
          meta: { id: generateId(), ...meta },
        })
        cursor.i = j
        continue
      }
    }

    // Tolerante: el modelo emitió `buttons` sin `:::`. Se consumen las líneas
    // de viñeta que le siguen, que es la forma en que las escribe siempre.
    if (plainDirective === "buttons") {
      let j = cursor.i + 1
      const itemLines: string[] = []
      while (j < lines.length) {
        const t2 = lines[j].trim()
        if (!t2) {
          // Una línea en blanco no corta: el modelo suele dejar una entre el
          // nombre y la primera viñeta.
          if (itemLines.length === 0) { j++; continue }
          break
        }
        if (/^:{3,}/.test(t2)) break
        if (!/^-\s+/.test(t2)) break
        itemLines.push(lines[j])
        j++
      }
      if (itemLines.length > 0) {
        const innerRaw = itemLines.join("\n")
        let items = parseButtonsContent(innerRaw)
        if (items.length === 0 || items.every((b) => !b.label || b.label.includes(":"))) {
          items = parseButtonsLoose(innerRaw)
        }
        if (items.length === 0) items = parseButtonsNarrative(innerRaw)
        if (items.length > 0) {
          flushText()
          result.push({ type: "buttons", items, meta: { id: generateId(), ...meta } })
          cursor.i = j
          continue
        }
      }
    }

    textBuffer.push(line)
    cursor.i++
  }

  flushText()
  return result
}

export function parseMarkdownToBlocks(markdown: string, meta?: Partial<BlockMeta>): UIBlock[] {
  return parseLines(markdown.split("\n"), { i: 0 }, meta)
}

// ─── Serializer ──────────────────────────────────────────────────────────────

export function serializeBlocksToMarkdown(blocks: UIBlock[]): string {
  return blocks.map(serializeBlock).join("\n\n")
}

function serializeBlock(block: UIBlock): string {
  switch (block.type) {
    case "text":
      return block.content

    case "list": {
      const lines = block.items.map((item, idx) =>
        block.ordered ? `${idx + 1}. ${item}` : `- ${item}`
      )
      return `:::list\n${lines.join("\n")}\n:::`
    }

    case "table": {
      const header = `| ${block.headers.join(" | ")} |`
      const divider = `| ${block.headers.map(() => "---").join(" | ")} |`
      const rows = block.rows.map((r) => `| ${r.join(" | ")} |`)
      const caption = block.caption ? `{caption="${block.caption}"}` : ""
      return `:::table${caption}\n${[header, divider, ...rows].join("\n")}\n:::`
    }

    case "note": {
      const attrs = [`level="${block.level ?? "info"}"`]
      if (block.title) attrs.push(`title="${block.title}"`)
      return `:::note{${attrs.join(" ")}}\n${block.content}\n:::`
    }

    case "code": {
      const parts: string[] = []
      if (block.language) parts.push(`language="${block.language}"`)
      if (block.filename) parts.push(`filename="${block.filename}"`)
      return `:::code${parts.length ? `{${parts.join(" ")}}` : ""}\n${block.code}\n:::`
    }

    case "image": {
      const parts = [`src="${block.src}"`]
      if (block.alt)     parts.push(`alt="${block.alt}"`)
      if (block.caption) parts.push(`caption="${block.caption}"`)
      if (block.width)   parts.push(`width=${block.width}`)
      return `:::image{${parts.join(" ")}}\n:::`
    }

    case "audio": {
      const parts = [`src="${block.src}"`]
      if (block.label)    parts.push(`label="${block.label}"`)
      if (block.duration) parts.push(`duration=${block.duration}`)
      return `:::audio{${parts.join(" ")}}\n:::`
    }

    case "file": {
      const parts = [`url="${block.url}" filename="${block.filename}"`]
      if (block.size)     parts.push(`size=${block.size}`)
      if (block.mimeType) parts.push(`mimeType="${block.mimeType}"`)
      return `:::file{${parts.join(" ")}}\n:::`
    }

    case "hidden-file": {
      const lines = [
        `src: ${block.url}`,
        `label: ${block.label}`,
        ...(block.assetType ? [`type: ${block.assetType}`] : []),
        ...(block.format ? [`format: ${block.format}`] : []),
        ...(block.mimeType ? [`mimetype: ${block.mimeType}`] : []),
        ...(block.sizeLabel ? [`size: ${block.sizeLabel}`] : []),
        "",
        block.body,
      ]
      return `:::hidden-file\n${lines.join("\n")}\n:::`
    }

    case "buttons": {
      const lines = block.items.map(
        (b) => `- ${b.label} | ${b.action} | ${b.variant ?? "secondary"}`
      )
      return `:::buttons\n${lines.join("\n")}\n:::`
    }

    case "divider":
      return `:::divider\n:::`

    case "admonition": {
      const parts: string[] = []
      if (block.title)         parts.push(`title="${block.title}"`)
      if (block.open === false) parts.push("open=false")
      const inner = serializeBlocksToMarkdown(block.children)
      return `:::admonition${parts.length ? `{${parts.join(" ")}}` : ""}\n${inner}\n:::`
    }

    case "email": {
      const parts: string[] = []
      if (block.subject) parts.push(`subject="${block.subject}"`)
      if (block.to) parts.push(`to="${block.to}"`)
      if (block.from) parts.push(`from="${block.from}"`)
      return `:::email${parts.length ? `{${parts.join(" ")}}` : ""}\n${block.body}\n:::`
    }

    default:
      return ""
  }
}

// ─── Hidden file (adjunto analizado; cuerpo no se muestra en UI) ─────────────

/** Categoría derivada de `type` / `mimetype` / `format` / extensión del `label`. */
export type HiddenFileAnalysisKind =
  | "image"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "audio"
  | "video"
  | "archive"
  | "code"
  | "default"

function hiddenFileExtensionHint(block: Extract<UIBlock, { type: "hidden-file" }>): string {
  const fmt = (block.format || "").toLowerCase().trim()
  if (fmt) return fmt
  const label = block.label || ""
  const base = label.trim().split(/[/\\]/).pop() ?? ""
  const i = base.lastIndexOf(".")
  if (i > 0 && i < base.length - 1) return base.slice(i + 1).toLowerCase()
  return ""
}

const HF_IMG = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
])
const HF_VID = new Set(["mp4", "mov", "avi", "webm", "mkv", "m4v", "wmv", "flv", "mpeg", "mpg", "3gp"])
const HF_AUD = new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "alac"])
const HF_SHEET = new Set(["xls", "xlsx", "ods", "csv", "tsv"])
const HF_PRES = new Set(["ppt", "pptx", "odp", "key"])
const HF_DOC = new Set(["doc", "docx", "odt", "rtf", "txt", "md", "markdown"])
const HF_ARCH = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"])
const HF_CODE = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "rb",
  "php",
  "html",
  "htm",
  "css",
  "scss",
  "sql",
  "yaml",
  "yml",
  "json",
  "xml",
  "vue",
  "sh",
  "env",
  "toml",
])

function withFormatSuffix(base: string, ext: string): string {
  const e = ext.trim().toLowerCase()
  if (!e) return base
  const up = e.toUpperCase()
  if (base.toUpperCase().includes(up)) return base
  return `${base} (${up})`
}

/**
 * Texto corto en español para mostrar que el adjunto fue analizado (sin exponer el cuerpo).
 */
export function summarizeHiddenFileBlock(
  block: Extract<UIBlock, { type: "hidden-file" }>,
): { message: string; kind: HiddenFileAnalysisKind } {
  const asset = (block.assetType || "").toLowerCase().trim()
  const mime = (block.mimeType || "").toLowerCase().trim()
  const ext = hiddenFileExtensionHint(block)

  if (mime.startsWith("image/") || asset === "image" || HF_IMG.has(ext)) {
    return { kind: "image", message: withFormatSuffix("Se analizó una imagen", ext) }
  }
  if (mime === "application/pdf" || asset === "pdf" || ext === "pdf") {
    return { kind: "pdf", message: "Se analizó un documento PDF" }
  }
  if (mime.startsWith("video/") || asset === "video" || HF_VID.has(ext)) {
    return { kind: "video", message: withFormatSuffix("Se analizó un vídeo", ext) }
  }
  if (mime.startsWith("audio/") || asset === "audio" || HF_AUD.has(ext)) {
    return { kind: "audio", message: withFormatSuffix("Se analizó un audio", ext) }
  }
  if (
    asset === "spreadsheet" ||
    asset === "sheet" ||
    HF_SHEET.has(ext) ||
    mime.includes("spreadsheet")
  ) {
    return { kind: "spreadsheet", message: withFormatSuffix("Se analizó una hoja de cálculo", ext) }
  }
  if (
    asset === "presentation" ||
    HF_PRES.has(ext) ||
    mime.includes("presentation") ||
    mime.includes("powerpoint")
  ) {
    return { kind: "presentation", message: withFormatSuffix("Se analizó una presentación", ext) }
  }
  if (asset === "archive" || HF_ARCH.has(ext)) {
    return { kind: "archive", message: withFormatSuffix("Se analizó un archivo comprimido", ext) }
  }
  if (HF_CODE.has(ext)) {
    return { kind: "code", message: withFormatSuffix("Se analizó un archivo de código", ext) }
  }
  if (
    asset === "document" ||
    HF_DOC.has(ext) ||
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    mime === "text/plain"
  ) {
    return { kind: "document", message: withFormatSuffix("Se analizó un documento de texto", ext) }
  }
  if (ext) {
    return { kind: "default", message: `Se analizó un archivo (${ext.toUpperCase()})` }
  }
  return { kind: "default", message: "Se analizó un documento" }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function validateBlock(block: UIBlock): string[] {
  const errors: string[] = []
  switch (block.type) {
    case "text":
      if (!block.content?.trim()) errors.push("text block: content is empty")
      break
    case "table":
      if (!block.headers?.length) errors.push("table block: headers array is empty")
      if (!block.rows?.length)    errors.push("table block: rows array is empty")
      block.rows?.forEach((row, i) => {
        if (row.length !== block.headers.length)
          errors.push(`table block: row ${i} has ${row.length} cells, expected ${block.headers.length}`)
      })
      break
    case "list":
      if (!block.items?.length) errors.push("list block: items array is empty")
      break
    case "note":
      if (!block.content?.trim()) errors.push("note block: content is empty")
      break
    case "code":
      if (!block.code?.trim()) errors.push("code block: code is empty")
      break
    case "image":
      if (!block.src?.trim()) errors.push("image block: src is required")
      break
    case "audio":
      if (!block.src?.trim()) errors.push("audio block: src is required")
      break
    case "file":
      if (!block.url?.trim())      errors.push("file block: url is required")
      if (!block.filename?.trim()) errors.push("file block: filename is required")
      break
    case "hidden-file":
      if (!block.url?.trim())  errors.push("hidden-file block: url/src is required")
      if (!block.label?.trim()) errors.push("hidden-file block: label is required")
      break
    case "buttons":
      if (!block.items?.length) errors.push("buttons block: items array is empty")
      block.items?.forEach((b, i) => {
        if (!b.label)  errors.push(`buttons block item ${i}: label is required`)
        if (!b.action) errors.push(`buttons block item ${i}: action is required`)
      })
      break
    case "admonition":
      if (!block.children?.length) errors.push("admonition block: children array is empty")
      break
    case "email":
      if (!block.body?.trim() && !block.subject?.trim()) {
        errors.push("email block: body or subject should be non-empty")
      }
      break
  }
  return errors
}

export function flattenBlocks(blocks: UIBlock[]): UIBlock[] {
  const result: UIBlock[] = []
  for (const block of blocks) {
    result.push(block)
    if (block.type === "admonition") {
      result.push(...flattenBlocks(block.children))
    }
  }
  return result
}

const VALID_NOTE_LEVELS = new Set<NoteLevel>(["info", "success", "warning", "error", "tip"])

/**
 * Si hay varios `:::divider` seguidos, solo se conserva el primero (misma lista plana).
 */
function collapseConsecutiveDividerBlocks(blocks: UIBlock[]): UIBlock[] {
  const out: UIBlock[] = []
  let prevWasDivider = false
  for (const b of blocks) {
    if (b.type === "divider") {
      if (prevWasDivider) continue
      prevWasDivider = true
      out.push(b)
    } else {
      prevWasDivider = false
      out.push(b)
    }
  }
  return out
}

export function normalizeBlocks(blocks: UIBlock[]): UIBlock[] {
  const normalized = blocks.map((block): UIBlock => {
    const id = block.meta?.id ?? generateId()
    const meta: BlockMeta = { ...block.meta, id }

    switch (block.type) {
      case "text":
        return { ...block, content: block.content.trim(), meta }
      case "note":
        return {
          ...block,
          content: block.content.trim(),
          level: VALID_NOTE_LEVELS.has(block.level as NoteLevel) ? block.level : "info",
          meta,
        }
      case "admonition":
        return { ...block, children: normalizeBlocks(block.children), meta }
      case "email":
        return { ...block, body: block.body.trim(), meta }
      case "hidden-file":
        return { ...block, body: block.body.trim(), meta }
      default:
        return { ...block, meta }
    }
  })
  return collapseConsecutiveDividerBlocks(normalized)
}

export function filterBlocks<T extends UIBlock["type"]>(
  blocks: UIBlock[],
  type: T,
): Extract<UIBlock, { type: T }>[] {
  return flattenBlocks(blocks).filter(
    (b): b is Extract<UIBlock, { type: T }> => b.type === type,
  )
}

export function createBlock<T extends UIBlock>(
  block: Omit<T, "meta"> & { meta?: BlockMeta },
): T {
  return { ...block, meta: { id: generateId(), ...block.meta } } as T
}
