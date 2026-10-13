---
name: ui-blocks-engine
description: >
  UI Blocks / Admonitions Engine for structured AI responses. Use when building AI agent
  responses that include cards, tables, notes, warnings, code blocks, file attachments,
  audio, images, or button actions. Provides the full TypeScript implementation, wire
  format (:::directive syntax), parsing, serialization, rendering hooks, and usage examples
  for both n8n webhook responses and Next.js/React chat bubbles.
---

# UI Blocks Engine

A zero-dependency TypeScript engine for structured, richly-formatted AI responses.
Blocks are first-class data — the agent emits `:::directive{attrs}` syntax; the frontend
parses it into typed `UIBlock` objects and renders them appropriately.

---

## Table of Contents

1. [Block Types Reference](#1-block-types-reference)
2. [Wire Format — `:::directive` Syntax](#2-wire-format----directive-syntax)
3. [Core TypeScript Types](#3-core-typescript-types)
4. [Full Engine Implementation](#4-full-engine-implementation)
5. [Usage: n8n Webhook / Code Node](#5-usage-n8n-webhook--code-node)
6. [Usage: Next.js / React Chat Bubble](#6-usage-nextjs--react-chat-bubble)
7. [Rendering Hints & CSS Classes](#7-rendering-hints--css-classes)
8. [Edge Cases & Error Handling](#8-edge-cases--error-handling)
9. [Extending the Engine](#9-extending-the-engine)

---

## 1. Block Types Reference

| Type | Purpose | Key Fields |
|------|---------|-----------|
| `text` | Paragraph / heading / label | `content`, `variant` (`body`\|`heading`\|`label`\|`caption`) |
| `list` | Ordered or unordered list | `items[]`, `ordered` |
| `table` | Data table | `headers[]`, `rows[][]`, `caption` |
| `note` | Informational callout | `content`, `level` (`info`\|`success`\|`warning`\|`error`\|`tip`) |
| `code` | Code block | `code`, `language`, `filename` |
| `image` | Inline image with lightbox hint | `src`, `alt`, `caption`, `width` |
| `audio` | Playable audio clip | `src`, `label`, `duration` |
| `file` | Downloadable file attachment | `url`, `filename`, `size`, `mimeType` |
| `buttons` | CTA / action buttons | `items[]` (label, action, variant, url) |
| `divider` | Horizontal rule between sections | — |
| `admonition` | Collapsible container with nested blocks | `title`, `open`, `children[]` |

---

## 2. Wire Format — `:::directive` Syntax

The agent (LLM) outputs plain text with special fenced directives.
Everything outside a fence is treated as a `text` block.

### Basic syntax

```
:::note{level="warning"}
El plazo vence mañana. Revisa el contrato antes de firmar.
:::
```

```
:::table{caption="Comparativa de propiedades"}
| Dirección | Precio | m² | Recámaras |
|-----------|--------|-----|-----------|
| Av. Reforma 120 | $4,200,000 | 85 | 2 |
| Calle Olmedo 7  | $3,800,000 | 78 | 2 |
:::
```

```
:::buttons
- Agendar visita | action:schedule_visit | primary
- Ver en mapa    | url:https://maps.google.com?q=... | secondary
:::
```

```
:::code{language="json" filename="lead.json"}
{
  "name": "María García",
  "budget": 4500000
}
:::
```

```
:::admonition{title="Detalles adicionales" open=false}
:::note{level="info"}
Esta propiedad tiene HOA de $2,500/mes.
:::
:::list
- Amenidades: gym, alberca, roof garden
- Mascotas: permitidas
:::
:::
```

### Attribute rules
- String values: `key="value"` or `key='value'`
- Boolean values: `key=true` / `key=false` or bare `key` (means `true`)
- Numeric values: `key=42`
- Directive names are **case-insensitive**: `:::NOTE` = `:::note`
- Unknown directives fall back to `text` blocks (content preserved)

---

## 3. Core TypeScript Types

```typescript
// ─── Meta ────────────────────────────────────────────────────────────────────

export interface BlockMeta {
  id?: string           // stable UUID for keying React lists
  source?: string       // e.g. "n8n:orchestrator", "tool:property_search"
  timestamp?: string    // ISO-8601
  confidence?: number   // 0–1, used by note/info blocks
  tags?: string[]
}

// ─── Button item ─────────────────────────────────────────────────────────────

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link"

export interface ButtonItem {
  label: string
  /** Either a semantic action key ("schedule_visit") or a URL ("url:https://...") */
  action: string
  variant?: ButtonVariant
  disabled?: boolean
  icon?: string   // icon name from your design system
}

// ─── Block union ─────────────────────────────────────────────────────────────

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
  | { type: "buttons";    items: ButtonItem[];                                      meta?: BlockMeta }
  | { type: "divider";    meta?: BlockMeta }
  | { type: "admonition"; title?: string;  open?: boolean;       children: UIBlock[]; meta?: BlockMeta }
```

---

## 4. Full Engine Implementation

```typescript
// ui-blocks-engine.ts
// Zero external dependencies. Works in Node.js (n8n Code node) and in the browser.

// ─── Re-export types (copy the types from section 3 here in your project) ────

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2, 10)
}

/** Parse `key="value" key2=true key3=42` attribute strings. */
function parseAttrs(raw: string): Record<string, string | boolean | number> {
  const attrs: Record<string, string | boolean | number> = {}
  // Match: key="val", key='val', key=val, key=true/false, bare key
  const re = /(\w[\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(true|false|\d+(?:\.\d+)?)|(\S+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const [, key, dq, sq, literal, unquoted] = m
    if (dq !== undefined)       attrs[key] = dq
    else if (sq !== undefined)  attrs[key] = sq
    else if (literal === "true")  attrs[key] = true
    else if (literal === "false") attrs[key] = false
    else if (literal !== undefined && /^\d/.test(literal)) attrs[key] = Number(literal)
    else if (unquoted !== undefined) attrs[key] = unquoted
    else attrs[key] = true   // bare key
  }
  return attrs
}

/** Parse a Markdown table inside a :::table block. */
function parseMarkdownTable(raw: string): { headers: string[]; rows: string[][] } {
  const lines = raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !/^\s*\|[-:| ]+\|\s*$/.test(l))  // drop separator row

  const parseRow = (line: string): string[] =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim())

  const [headerLine, ...dataLines] = lines
  const headers = parseRow(headerLine ?? "")
  const rows = dataLines.map(parseRow)
  return { headers, rows }
}

/** Parse a :::list block — lines starting with `-`, `*`, `+`, or `1.` */
function parseListContent(raw: string): { items: string[]; ordered: boolean } {
  const lines = raw.trim().split("\n").filter(Boolean)
  const ordered = /^\s*\d+[.)]\s/.test(lines[0] ?? "")
  const items = lines.map((l) => l.replace(/^\s*(?:\d+[.)]|[-*+])\s+/, "").trim())
  return { items, ordered }
}

/** Parse :::buttons — one button per line: `label | action | variant` */
function parseButtonsContent(raw: string): ButtonItem[] {
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const parts = line.replace(/^[-*]\s*/, "").split("|").map((p) => p.trim())
      const [label = "", action = "", variant = "secondary"] = parts
      return {
        label,
        action,
        variant: (variant as ButtonVariant) || "secondary",
      }
    })
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Inner parser — operates on a lines slice with a mutable cursor object
 * so nested admonitions can recurse cleanly without mutating the parent array.
 */
function parseLines(lines, cursor, meta) {
  const result = []
  let textBuffer = []

  function flushText() {
    const content = textBuffer.join("\n").trim()
    if (content) {
      result.push({ type: "text", content, meta: meta ? { ...meta, id: generateId() } : undefined })
    }
    textBuffer = []
  }

  while (cursor.i < lines.length) {
    const line = lines[cursor.i]
    const openMatch = line.match(/^:::(\w+)(?:\{([^}]*)\})?$/)
    const closeMatch = /^:::$/.test(line)

    if (closeMatch) {
      flushText()
      cursor.i++
      return result
    }

    if (openMatch) {
      flushText()
      const [, directive, attrStr = ""] = openMatch
      const attrs = parseAttrs(attrStr)
      cursor.i++

      const innerLines = []
      let depth = 1
      while (cursor.i < lines.length) {
        const inner = lines[cursor.i]
        if (/^:::\w/.test(inner)) depth++
        if (/^:::$/.test(inner)) { depth--; if (depth === 0) { cursor.i++; break } }
        innerLines.push(inner)
        cursor.i++
      }
      const innerRaw = innerLines.join("\n")
      const blockMeta = { id: generateId(), ...meta }
      const d = directive.toLowerCase()

      if (d === "note" || d === "callout") {
        result.push({ type: "note", content: innerRaw.trim(), level: attrs.level ?? "info", title: attrs.title, meta: blockMeta })
      } else if (d === "table") {
        const { headers, rows } = parseMarkdownTable(innerRaw)
        result.push({ type: "table", headers, rows, caption: attrs.caption, meta: blockMeta })
      } else if (d === "list") {
        const { items, ordered } = parseListContent(innerRaw)
        result.push({ type: "list", items, ordered, meta: blockMeta })
      } else if (d === "code") {
        result.push({ type: "code", code: innerRaw, language: attrs.language, filename: attrs.filename, meta: blockMeta })
      } else if (d === "image") {
        result.push({ type: "image", src: attrs.src ?? innerRaw.trim(), alt: attrs.alt, caption: attrs.caption, width: attrs.width, meta: blockMeta })
      } else if (d === "audio") {
        result.push({ type: "audio", src: attrs.src ?? innerRaw.trim(), label: attrs.label, duration: attrs.duration, meta: blockMeta })
      } else if (d === "file") {
        result.push({ type: "file", url: attrs.url ?? innerRaw.trim(), filename: attrs.filename ?? "archivo", size: attrs.size, mimeType: attrs.mimeType, meta: blockMeta })
      } else if (d === "buttons") {
        result.push({ type: "buttons", items: parseButtonsContent(innerRaw), meta: blockMeta })
      } else if (d === "divider" || d === "hr") {
        result.push({ type: "divider", meta: blockMeta })
      } else if (d === "admonition" || d === "details" || d === "collapse") {
        // Recurse with a fresh cursor — no shared mutable state
        const children = parseLines(innerLines, { i: 0 }, meta)
        result.push({ type: "admonition", title: attrs.title, open: attrs.open ?? true, children, meta: blockMeta })
      } else {
        result.push({ type: "text", content: innerRaw.trim(), meta: blockMeta })
      }
      continue
    }

    textBuffer.push(line)
    cursor.i++
  }

  flushText()
  return result
}

/**
 * Parse a mixed markdown + :::directive string into an array of UIBlocks.
 * Handles nesting: :::admonition can contain other directives.
 */
export function parseMarkdownToBlocks(markdown, meta) {
  return parseLines(markdown.split("\n"), { i: 0 }, meta)
}

// ─── Serializer ──────────────────────────────────────────────────────────────

/** Serialize UIBlocks back to :::directive markdown. Useful for storing/transmitting. */
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
      const sep = block.headers.map(() => "---").join(" | ")
      const header = `| ${block.headers.join(" | ")} |`
      const divider = `| ${sep} |`
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
      const attrs: string[] = []
      if (block.language) attrs.push(`language="${block.language}"`)
      if (block.filename) attrs.push(`filename="${block.filename}"`)
      const attrStr = attrs.length ? `{${attrs.join(" ")}}` : ""
      return `:::code${attrStr}\n${block.code}\n:::`
    }

    case "image": {
      const attrs = [`src="${block.src}"`]
      if (block.alt)     attrs.push(`alt="${block.alt}"`)
      if (block.caption) attrs.push(`caption="${block.caption}"`)
      if (block.width)   attrs.push(`width=${block.width}`)
      return `:::image{${attrs.join(" ")}}\n:::`
    }

    case "audio": {
      const attrs = [`src="${block.src}"`]
      if (block.label)    attrs.push(`label="${block.label}"`)
      if (block.duration) attrs.push(`duration=${block.duration}`)
      return `:::audio{${attrs.join(" ")}}\n:::`
    }

    case "file": {
      const attrs = [`url="${block.url}" filename="${block.filename}"`]
      if (block.size)     attrs.push(`size=${block.size}`)
      if (block.mimeType) attrs.push(`mimeType="${block.mimeType}"`)
      return `:::file{${attrs.join(" ")}}\n:::`
    }

    case "buttons": {
      const lines = block.items.map((b) => `- ${b.label} | ${b.action} | ${b.variant ?? "secondary"}`)
      return `:::buttons\n${lines.join("\n")}\n:::`
    }

    case "divider":
      return `:::divider\n:::`

    case "admonition": {
      const attrs: string[] = []
      if (block.title) attrs.push(`title="${block.title}"`)
      if (block.open === false) attrs.push("open=false")
      const attrStr = attrs.length ? `{${attrs.join(" ")}}` : ""
      const inner = serializeBlocksToMarkdown(block.children)
      return `:::admonition${attrStr}\n${inner}\n:::`
    }

    default:
      return ""
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Validate a single block — returns array of error strings (empty = valid). */
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
  }
  return errors
}

/** Recursively flatten nested admonitions into a flat array. */
export function flattenBlocks(blocks: UIBlock[]): UIBlock[] {
  const result: UIBlock[] = []
  for (const block of blocks) {
    if (block.type === "admonition") {
      result.push(block)
      result.push(...flattenBlocks(block.children))
    } else {
      result.push(block)
    }
  }
  return result
}

/** Normalize blocks: trim text content, ensure IDs, coerce unknown note levels. */
export function normalizeBlocks(blocks: UIBlock[]): UIBlock[] {
  const validLevels = new Set<NoteLevel>(["info", "success", "warning", "error", "tip"])

  return blocks.map((block): UIBlock => {
    const id = block.meta?.id ?? generateId()
    const meta: BlockMeta = { ...block.meta, id }

    switch (block.type) {
      case "text":
        return { ...block, content: block.content.trim(), meta }
      case "note":
        return {
          ...block,
          content: block.content.trim(),
          level: validLevels.has(block.level as NoteLevel) ? block.level : "info",
          meta,
        }
      case "admonition":
        return { ...block, children: normalizeBlocks(block.children), meta }
      default:
        return { ...block, meta }
    }
  })
}

/** Filter blocks by type (useful for extracting e.g. all buttons from a response). */
export function filterBlocks<T extends UIBlock["type"]>(
  blocks: UIBlock[],
  type: T
): Extract<UIBlock, { type: T }>[] {
  return flattenBlocks(blocks).filter((b): b is Extract<UIBlock, { type: T }> => b.type === type)
}

/** Create a single block programmatically with a generated ID. */
export function createBlock<T extends UIBlock>(block: Omit<T, "meta"> & { meta?: BlockMeta }): T {
  return { ...block, meta: { id: generateId(), ...block.meta } } as T
}
```

---

## 5. Usage: n8n Webhook / Code Node

### 5a — Agent outputs :::directive text, Code node parses it

```javascript
// n8n Code node (JavaScript)
// Input: $input.first().json.text  →  agent raw output string
// Output: { blocks: UIBlock[], raw: string }

const { parseMarkdownToBlocks, normalizeBlocks, validateBlock } = require('./ui-blocks-engine')
// Or paste the engine inline for n8n compatibility

const raw = $input.first().json.text ?? ""
const meta = {
  source: "n8n:orchestrator",
  timestamp: new Date().toISOString(),
}

let blocks = parseMarkdownToBlocks(raw, meta)
blocks = normalizeBlocks(blocks)

const errors = blocks.flatMap(validateBlock)
if (errors.length > 0) {
  console.warn("[UIBlocks] validation warnings:", errors)
}

return [{ json: { blocks, raw } }]
```

### 5b — Emit blocks from a tool/function node

```javascript
// n8n Code node: build a property comparison response programmatically
const { createBlock, serializeBlocksToMarkdown } = require('./ui-blocks-engine')

const properties = $input.all().map(p => p.json)

const blocks = [
  createBlock({
    type: "text",
    content: `Encontré **${properties.length} propiedades** que coinciden con tu búsqueda.`,
    variant: "heading",
  }),
  createBlock({
    type: "table",
    headers: ["Dirección", "Precio", "m²", "Recámaras"],
    rows: properties.map(p => [p.address, `$${p.price.toLocaleString()}`, `${p.sqm}`, `${p.bedrooms}`]),
    caption: "Propiedades disponibles",
  }),
  createBlock({
    type: "buttons",
    items: properties.slice(0, 3).map(p => ({
      label: `Ver ${p.address.split(",")[0]}`,
      action: `view_property:${p.id}`,
      variant: "secondary",
    })),
  }),
  createBlock({
    type: "note",
    level: "tip",
    content: "Puedes pedirme comparar dos propiedades en detalle, calcular el ROI, o agendar una visita.",
  }),
]

// If sending to an AI Agent for further processing, serialize back:
const text = serializeBlocksToMarkdown(blocks)
return [{ json: { text, blocks } }]
```

### 5c — System prompt instruction for the AI Agent

Add this to the agent's system prompt so it knows when and how to use blocks:

```
## Formato de respuesta enriquecido

Cuando tu respuesta incluya datos estructurados, usa los siguientes bloques:

:::note{level="info|success|warning|error|tip"}
Mensaje corto (1-3 líneas). Usa "warning" para alertas de precio, vencimiento o riesgo.
:::

:::table{caption="título opcional"}
| Columna 1 | Columna 2 |
|-----------|-----------|
| valor     | valor     |
:::

:::list
- Elemento uno
- Elemento dos
:::

:::buttons
- Etiqueta del botón | action:nombre_accion | primary
- Ver en mapa        | url:https://...      | secondary
:::

:::admonition{title="Sección colapsable" open=false}
:::note{level="info"}
Contenido interno.
:::
:::

REGLAS:
1. Usa :::note{level="warning"} para cualquier riesgo o plazo inminente.
2. Usa :::table para comparar 3+ propiedades o mostrar métricas.
3. Usa :::buttons al final si hay una acción clara que el usuario puede tomar.
4. No anides más de 2 niveles de admonition.
5. El texto ordinario fuera de bloques se renderiza como markdown normal.
```

---

## 6. Usage: Next.js / React Chat Bubble

### 6a — Parse and render blocks

```typescript
// components/copilots/ui-blocks-renderer.tsx
"use client"

import { parseMarkdownToBlocks, normalizeBlocks, UIBlock } from "@/lib/copilot/ui-blocks-engine"
import ReactMarkdown from "react-markdown"

interface UIBlocksRendererProps {
  content: string
}

export function UIBlocksRenderer({ content }: UIBlocksRendererProps) {
  const blocks = normalizeBlocks(parseMarkdownToBlocks(content))
  return (
    <div className="ui-blocks-root space-y-3">
      {blocks.map((block) => (
        <BlockRenderer key={block.meta?.id} block={block} />
      ))}
    </div>
  )
}

function BlockRenderer({ block }: { block: UIBlock }) {
  switch (block.type) {
    case "text":
      return (
        <div className={`ui-block-text ui-block-text--${block.variant ?? "body"}`}>
          <ReactMarkdown>{block.content}</ReactMarkdown>
        </div>
      )

    case "note": {
      const icons: Record<string, string> = {
        info: "ℹ️", success: "✅", warning: "⚠️", error: "❌", tip: "💡",
      }
      return (
        <div className={`ui-block-note ui-block-note--${block.level ?? "info"}`}>
          <span className="ui-block-note__icon">{icons[block.level ?? "info"]}</span>
          <div className="ui-block-note__body">
            {block.title && <strong className="ui-block-note__title">{block.title}</strong>}
            <ReactMarkdown>{block.content}</ReactMarkdown>
          </div>
        </div>
      )
    }

    case "table":
      return (
        <div className="ui-block-table-scroll">
          {block.caption && <p className="ui-block-table-caption">{block.caption}</p>}
          <table className="ui-block-table">
            <thead>
              <tr>{block.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case "list":
      return block.ordered ? (
        <ol className="ui-block-list ui-block-list--ordered">
          {block.items.map((item, i) => <li key={i}><ReactMarkdown>{item}</ReactMarkdown></li>)}
        </ol>
      ) : (
        <ul className="ui-block-list">
          {block.items.map((item, i) => <li key={i}><ReactMarkdown>{item}</ReactMarkdown></li>)}
        </ul>
      )

    case "code":
      return (
        <div className="ui-block-code">
          {block.filename && <div className="ui-block-code__filename">{block.filename}</div>}
          <pre><code className={block.language ? `language-${block.language}` : ""}>{block.code}</code></pre>
        </div>
      )

    case "image":
      return (
        <figure className="ui-block-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.src} alt={block.alt ?? ""} style={block.width ? { maxWidth: block.width } : {}} />
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      )

    case "audio":
      return (
        <div className="ui-block-audio">
          {block.label && <span className="ui-block-audio__label">{block.label}</span>}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={block.src} />
        </div>
      )

    case "file":
      return (
        <a
          className="ui-block-file"
          href={block.url}
          download={block.filename}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="ui-block-file__icon">📎</span>
          <span className="ui-block-file__name">{block.filename}</span>
          {block.size && (
            <span className="ui-block-file__size">
              {(block.size / 1024).toFixed(1)} KB
            </span>
          )}
        </a>
      )

    case "buttons":
      return (
        <div className="ui-block-buttons">
          {block.items.map((btn, i) => {
            if (btn.action.startsWith("url:")) {
              return (
                <a
                  key={i}
                  className={`ui-block-btn ui-block-btn--${btn.variant ?? "secondary"}`}
                  href={btn.action.slice(4)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {btn.label}
                </a>
              )
            }
            return (
              <button
                key={i}
                className={`ui-block-btn ui-block-btn--${btn.variant ?? "secondary"}`}
                onClick={() => console.log("[UIBlock] button action:", btn.action)}
                disabled={btn.disabled}
              >
                {btn.label}
              </button>
            )
          })}
        </div>
      )

    case "divider":
      return <hr className="ui-block-divider" />

    case "admonition":
      return (
        <details className="ui-block-admonition" open={block.open !== false}>
          {block.title && <summary className="ui-block-admonition__title">{block.title}</summary>}
          <div className="ui-block-admonition__body space-y-3">
            {block.children.map((child) => (
              <BlockRenderer key={child.meta?.id} block={child} />
            ))}
          </div>
        </details>
      )

    default:
      return null
  }
}
```

### 6b — Detecting and splitting mixed content

If the agent output mixes plain markdown with :::directive blocks, use the renderer
for the whole string — `text` blocks handle the plain markdown parts:

```typescript
// In your chat bubble component:
import { UIBlocksRenderer } from "@/components/copilots/ui-blocks-renderer"

// Replace:
<ReactMarkdown>{message.content}</ReactMarkdown>

// With (if the message may contain directive blocks):
<UIBlocksRenderer content={message.content} />
```

### 6c — Button action handler

Wire up a central dispatcher for semantic button actions:

```typescript
// lib/copilot/block-action-handler.ts
export type BlockAction =
  | { type: "schedule_visit"; propertyId: string }
  | { type: "view_property"; propertyId: string }
  | { type: "calculate_roi"; propertyId: string }

export function parseBlockAction(raw: string): BlockAction | null {
  const [type, ...args] = raw.split(":")
  switch (type) {
    case "schedule_visit":  return { type, propertyId: args[0] }
    case "view_property":   return { type, propertyId: args[0] }
    case "calculate_roi":   return { type, propertyId: args[0] }
    default: return null
  }
}
```

---

## 7. Rendering Hints & CSS Classes

Suggested class names (Tailwind or custom CSS):

| Class | Element | Notes |
|-------|---------|-------|
| `ui-block-note--info` | Note callout | Blue left border |
| `ui-block-note--warning` | Note callout | Amber left border |
| `ui-block-note--error` | Note callout | Red left border |
| `ui-block-note--success` | Note callout | Green left border |
| `ui-block-note--tip` | Note callout | Purple left border |
| `ui-block-table-scroll` | Table wrapper | `overflow-x: auto` |
| `ui-block-btn--primary` | Button | Brand color fill |
| `ui-block-btn--secondary` | Button | Border only |
| `ui-block-btn--danger` | Button | Red fill |
| `ui-block-btn--ghost` | Button | No border, subtle hover |
| `ui-block-admonition` | `<details>` | Collapsible container |
| `ui-block-code__filename` | Code filename bar | Monospace, dimmed |

---

## 8. Edge Cases & Error Handling

### Unclosed directive

If a `:::directive` is never closed by `:::`, the parser treats everything until
end-of-string as the block's content. This is intentional for streaming — the block
renders partial content and re-parses as more tokens arrive.

### Nested `:::` depth tracking

The parser tracks depth correctly for nested admonitions. A `:::` line only closes
the innermost open scope at depth 1.

### Unknown directives

Unknown directive names (e.g. `:::chart`) fall back to `{ type: "text", content: innerContent }`.
This means the raw content is not silently dropped.

### Mixed agent output

Agents sometimes emit mixed output like:

```
Aquí está el resumen:

:::table{caption="Resumen"}
| Campo | Valor |
|-------|-------|
| Precio | $4,200,000 |
:::

¿Quieres que busque más opciones?
```

The text before and after the directive becomes `text` blocks, so the output is:
1. `text`: "Aquí está el resumen:"
2. `table`: 1 row
3. `text`: "¿Quieres que busque más opciones?"

### Streaming compatibility

When streaming, call `parseMarkdownToBlocks` on each chunk. Incomplete blocks render
as partial text until the closing `:::` arrives. The `id` field on `meta` will be
consistent only if you pass a stable seed — otherwise each re-parse generates new IDs.
Use `content` equality for React reconciliation when streaming.

---

## 9. Extending the Engine

### Add a new block type (e.g. `map`)

1. Add to the `UIBlock` union:
   ```typescript
   | { type: "map"; lat: number; lng: number; zoom?: number; label?: string; meta?: BlockMeta }
   ```

2. Add a branch in `parseMarkdownToBlocks`:
   ```typescript
   } else if (d === "map") {
     result.push({
       type: "map",
       lat: Number(attrs.lat),
       lng: Number(attrs.lng),
       zoom: attrs.zoom as number | undefined,
       label: attrs.label as string | undefined,
       meta: blockMeta,
     })
   }
   ```

3. Add a branch in `serializeBlock`:
   ```typescript
   case "map":
     return `:::map{lat=${block.lat} lng=${block.lng}${block.zoom ? ` zoom=${block.zoom}` : ""}}\n:::`
   ```

4. Add a `<MapBlockRenderer>` in your React component.

### Recommended extensions for PrimeIQ / Real Estate SaaS

| Block type | Use case |
|------------|----------|
| `map` | Embed a property location (Leaflet / Google Maps) |
| `chart` | Price trend charts (Chart.js / Recharts) |
| `timeline` | Mortgage amortization, transaction history |
| `metric` | KPI cards: "ROI esperado: 8.2%" |
| `contact` | Agent card with photo, phone, WhatsApp CTA |
| `gallery` | Property photo grid with lightbox |
| `form` | Inline mini-form for lead capture |
