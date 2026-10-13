type ToolLogOptions = {
  toolNameHint?: string
}

const TOOL_MESSAGE_PREFIX = "[[N8N_TOOL_MESSAGE]]:"
const TOOL_MESSAGE_PREFIX_RE =
  /^(?:\[\[N8N_TOOL_MESSAGE\]\]|__N8N_TOOL_MESSAGE__|N8N_TOOL_MESSAGE)\s*:/

/** Raw assistant line that must be handled by tool-log UI, not the React markdown bridge. */
export function isN8nToolEnvelopeMarkdown(text: string): boolean {
  return TOOL_MESSAGE_PREFIX_RE.test(text.trim())
}

/** Metadatos del JSON tras `[[N8N_TOOL_MESSAGE]]:` (emparejar con el tool_call anterior). */
export function extractToolEnvelopeMeta(rawText: string): {
  name: string
  toolCallId?: string
} | null {
  const text = rawText.trim()
  if (!TOOL_MESSAGE_PREFIX_RE.test(text)) return null
  const rawPayload = text.replace(TOOL_MESSAGE_PREFIX_RE, "").trim()
  const parsed = safeParseJson(rawPayload)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { name: "Tool" }
  }
  const payload = parsed as Record<string, unknown>
  return {
    name: normalizeToolName(typeof payload.name === "string" ? payload.name : "Tool"),
    toolCallId: typeof payload.tool_call_id === "string" ? payload.tool_call_id : undefined,
  }
}

/** IDs de `tool_calls` en el JSON de un AIMessage (texto crudo de la burbuja tool_call). */
export function extractToolCallIdsFromAiToolCallsRaw(rawText: string): string[] {
  try {
    const text = rawText.trim()
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return []
    const o = parsed as Record<string, unknown>
    const tc = o.tool_calls
    if (!Array.isArray(tc)) return []
    const ids: string[] = []
    for (const item of tc) {
      if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
        ids.push((item as { id: string }).id)
      }
    }
    return ids
  } catch {
    return []
  }
}

export type ToolLogDetail = {
  label: string
  value: string
  language?: "json" | "text"
}

export type ToolLogEntry = {
  verb: string
  target: string
  title: string
  details: ToolLogDetail[]
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export function normalizeToolName(toolName: string | undefined): string {
  if (!toolName) return "Tool"
  return toolName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
}

function clipText(value: string, maxChars = 1000): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n... (truncated)`
}

function toPrettyJson(value: unknown): string {
  try {
    return clipText(JSON.stringify(value, null, 2))
  } catch {
    return clipText(String(value))
  }
}

function pickToolPayload(content: string): Record<string, unknown> | null {
  const parsed = safeParseJson(content)
  if (!parsed) return null

  let payload: unknown = parsed
  if (Array.isArray(payload) && payload.length > 0) {
    payload = payload[0]
  }

  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>
    if (typeof obj.response === "string") {
      const nested = safeParseJson(obj.response)
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        return nested as Record<string, unknown>
      }
    }
    if (!Array.isArray(obj)) return obj
  }

  return null
}

function looksLikeToolResponse(content: string): boolean {
  const parsed = safeParseJson(content)
  if (!parsed) return false

  if (Array.isArray(parsed) && parsed.length > 0) {
    const first = parsed[0]
    if (first && typeof first === "object") {
      const row = first as Record<string, unknown>
      if (typeof row.response === "string") return true
      if (typeof row.tool_call_id === "string") return true
    }
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const row = parsed as Record<string, unknown>
    if (typeof row.response === "string") return true
    if (typeof row.action === "string") return true
    if (typeof row.ok === "boolean") return true
    if (typeof row.count === "number") return true
    if (Array.isArray(row.items)) return true
  }

  return false
}

function summarizeToolCall(toolName: string, inputJson: string): string {
  const payload = safeParseJson(inputJson)
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return `Calling ${normalizeToolName(toolName)}`
  }
  const action = (payload as Record<string, unknown>).action
  if (typeof action === "string" && action.trim().length > 0) {
    return `Calling ${normalizeToolName(toolName)} (${action})`
  }
  return `Calling ${normalizeToolName(toolName)}`
}

function summarizeToolResponse(content: string, toolNameHint?: string): string {
  const payload = pickToolPayload(content)
  const toolName = normalizeToolName(toolNameHint)
  if (!payload) return `${toolName} response received`

  const action = payload.action
  const count = payload.count

  const details: string[] = []
  if (typeof action === "string" && action.trim().length > 0) {
    details.push(action)
  }
  if (typeof count === "number" && Number.isFinite(count)) {
    details.push(`count: ${count}`)
  } else if (Array.isArray(payload.items)) {
    details.push(`count: ${payload.items.length}`)
  }

  if (details.length === 0) return `${toolName} response received`
  return `${toolName} response received (${details.join(", ")})`
}

function parseCallingEvent(text: string): ToolLogEntry | null {
  const match = text.match(
    /^Calling\s+([A-Za-z0-9_.:-]+)\s+with input:\s*([\s\S]+)$/,
  )
  if (!match) return null

  const [, rawToolName, rawInput] = match
  const toolName = normalizeToolName(rawToolName)
  const inputJson = rawInput?.trim() ?? ""
  const parsedInput = safeParseJson(inputJson)

  const details: ToolLogDetail[] = [
    {
      label: "Input",
      value:
        parsedInput && typeof parsedInput === "object"
          ? toPrettyJson(parsedInput)
          : clipText(inputJson),
      language: parsedInput ? "json" : "text",
    },
  ]

  if (parsedInput && typeof parsedInput === "object") {
    details.push({
      label: "Args",
      value: toPrettyJson(parsedInput),
      language: "json",
    })
  }

  return {
    verb: "Calling",
    target: toolName,
    title: `Calling - ${toolName}`,
    details,
  }
}

function parseToolMessageEnvelope(text: string): ToolLogEntry | null {
  if (!TOOL_MESSAGE_PREFIX_RE.test(text)) return null
  const rawPayload = text.replace(TOOL_MESSAGE_PREFIX_RE, "").trim()
  const parsed = safeParseJson(rawPayload)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      verb: "Response",
      target: "Tool",
      title: "Response - Tool",
      details: [
        {
          label: "Content",
          value: clipText(rawPayload),
          language:
            rawPayload.startsWith("{") || rawPayload.startsWith("[")
              ? "json"
              : "text",
        },
      ],
    }
  }

  const payload = parsed as Record<string, unknown>
  const toolName = normalizeToolName(
    typeof payload.name === "string" ? payload.name : "Tool",
  )
  const content =
    typeof payload.content === "string"
      ? payload.content
      : toPrettyJson(payload.content)
  const toolCallId =
    typeof payload.tool_call_id === "string" ? payload.tool_call_id : undefined

  const details: ToolLogDetail[] = [
    {
      label: "Content",
      value: clipText(content),
      language:
        content.trim().startsWith("{") || content.trim().startsWith("[")
          ? "json"
          : "text",
    },
  ]

  if (toolCallId) {
    details.unshift({
      label: "Tool Call ID",
      value: toolCallId,
      language: "text",
    })
  }

  return {
    verb: "Response",
    target: toolName,
    title: `Response - ${toolName}`,
    details,
  }
}

function parseNormalizedCallingEvent(text: string): ToolLogEntry | null {
  const match = text.match(/^Calling\s+(.+?)(?:\s+\(.+\))?$/)
  if (!match) return null
  const toolName = normalizeToolName(match[1] ?? "Tool")
  return {
    verb: "Calling",
    target: toolName,
    title: `Calling - ${toolName}`,
    details: [],
  }
}

function parseResponseEvent(
  text: string,
  options?: ToolLogOptions,
): ToolLogEntry | null {
  if ((text.startsWith("[") || text.startsWith("{")) && looksLikeToolResponse(text)) {
    const payload = pickToolPayload(text)
    const toolName = normalizeToolName(options?.toolNameHint)
    const details: ToolLogDetail[] = []

    if (payload) {
      const payloadSummary: Record<string, unknown> = {
        ok: payload.ok,
        action: payload.action,
        count:
          typeof payload.count === "number"
            ? payload.count
            : Array.isArray(payload.items)
              ? payload.items.length
              : undefined,
      }
      details.push({
        label: "Summary",
        value: toPrettyJson(payloadSummary),
        language: "json",
      })
      details.push({
        label: "Payload",
        value: toPrettyJson(payload),
        language: "json",
      })
    } else {
      details.push({
        label: "Payload",
        value: clipText(text),
        language: "text",
      })
    }

    return {
      verb: "Response",
      target: toolName,
      title: `Response - ${toolName}`,
      details,
    }
  }

  const normalized = text.match(
    /^([A-Za-z0-9_.:\- ]+)\s+response received(?:\s+\((.+)\))?$/,
  )
  if (!normalized) return null
  const toolName = normalizeToolName(normalized[1] ?? "Tool")
  const extra = normalized[2]?.trim()
  return {
    verb: "Response",
    target: toolName,
    title: `Response - ${toolName}`,
    details: extra ? [{ label: "Summary", value: extra, language: "text" }] : [],
  }
}

export function parseToolLogEntry(
  rawText: string,
  options?: ToolLogOptions,
): ToolLogEntry | null {
  const text = rawText.trim()
  if (!text) return null

  const toolMessageEnvelope = parseToolMessageEnvelope(text)
  if (toolMessageEnvelope) return toolMessageEnvelope

  const callingWithInput = parseCallingEvent(text)
  if (callingWithInput) return callingWithInput

  const response = parseResponseEvent(text, options)
  if (response) return response

  const calling = parseNormalizedCallingEvent(text)
  if (calling) return calling

  return null
}

/**
 * Converts raw tool-call / tool-response payloads into short human-readable logs.
 * Returns null when text does not look like a tool event.
 */
export function toToolLogText(
  rawText: string,
  options?: ToolLogOptions,
): string | null {
  const parsed = parseToolLogEntry(rawText, options)
  if (!parsed) return null

  if (parsed.verb === "Calling") {
    const callingMatch = rawText.trim().match(
      /^Calling\s+([A-Za-z0-9_.:-]+)\s+with input:\s*([\s\S]+)$/,
    )
    if (callingMatch) {
      return summarizeToolCall(callingMatch[1] ?? "Tool", callingMatch[2] ?? "{}")
    }
  }
  if (parsed.verb === "Response") {
    const text = rawText.trim()
    if (TOOL_MESSAGE_PREFIX_RE.test(text)) {
      return parsed.title
    }
    if ((text.startsWith("[") || text.startsWith("{")) && looksLikeToolResponse(text)) {
      return summarizeToolResponse(text, options?.toolNameHint)
    }
  }
  return parsed.title
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

/**
 * Heuristic for "assistant final response" bubbles.
 * Everything else on bot side can be displayed as activity log.
 */
export function isKnownAssistantResponseText(rawText: string): boolean {
  const text = rawText.trim()
  if (!text) return false

  // Explicit tool events are never treated as final assistant responses.
  if (toToolLogText(text)) return false

  // Rich markdown / multi-line answers from assistant.
  const hasMarkdownRichStructure =
    text.includes("\n\n") ||
    /(^|\n)\s*#{1,6}\s+/.test(text) ||
    /(^|\n)\s*[-*]\s+/.test(text) ||
    /(^|\n)\s*\d+\.\s+/.test(text) ||
    /(^|\n)\s*\|.+\|/.test(text) ||
    text.includes("**") ||
    text.includes("```")

  if (hasMarkdownRichStructure) return true

  // Plain-text but clearly conversational/answer-like sentence.
  const words = countWords(text)
  const hasSentencePunctuation = /[.!?…]$/.test(text)
  const hasUrl = /https?:\/\//i.test(text)
  const hasNaturalQuestion = /[¿?]/.test(text)
  if (words >= 6 && (hasSentencePunctuation || hasUrl || hasNaturalQuestion)) {
    return true
  }

  return false
}
