import type { PrimeIqMessageTypeAttr } from "@/lib/copilot/n8n-chat-message-types"

/** Formato que acepta `messageHistory` en `createChat` (campos extra se conservan en el spread del paquete). */
export type ChatHistoryMessage = {
  id: string
  text: string
  sender: "user" | "bot"
  messageType: PrimeIqMessageTypeAttr
}

const TOOL_MESSAGE_PREFIX = "[[N8N_TOOL_MESSAGE]]:"

function isToolMessageRow(row: Record<string, unknown>): boolean {
  const idField = row.id
  if (Array.isArray(idField)) {
    const last = idField[idField.length - 1]
    if (last === "ToolMessage") return true
  }
  if (typeof idField === "string" && idField.includes("ToolMessage")) return true
  return row.type === "tool"
}

/** Último segmento del `id` LangChain (`["langchain_core","messages","AIMessage"]`). */
function lcConstructorKind(
  row: Record<string, unknown>,
): "HumanMessage" | "AIMessage" | "ToolMessage" | null {
  const idField = row.id
  if (Array.isArray(idField)) {
    const last = idField[idField.length - 1]
    if (last === "HumanMessage" || last === "AIMessage" || last === "ToolMessage") {
      return last
    }
  }
  if (typeof idField === "string") {
    if (idField.includes("HumanMessage")) return "HumanMessage"
    if (idField.includes("ToolMessage")) return "ToolMessage"
    if (idField.includes("AIMessage")) return "AIMessage"
  }
  return null
}

function hasNonEmptyToolCalls(kwargs: Record<string, unknown> | undefined): boolean {
  if (!kwargs) return false
  const tc = kwargs.tool_calls
  return Array.isArray(tc) && tc.length > 0
}

/**
 * Clasificación estable para UI: no usar heurísticas de texto en mensajes finales del asistente.
 */
function inferMessageTypeFromRow(
  row: Record<string, unknown>,
  kwargs: Record<string, unknown> | undefined,
): PrimeIqMessageTypeAttr {
  const kind = lcConstructorKind(row)
  if (kind === "HumanMessage") return "human"
  if (kind === "ToolMessage") return "tool_result"
  if (kind === "AIMessage") {
    return hasNonEmptyToolCalls(kwargs) ? "tool_call" : "assistant"
  }

  const type = row.type
  if (type === "human" || type === "user") return "human"
  if (type === "tool") return "tool_result"

  const role = row.role
  if (role === "human" || role === "user") return "human"

  return "assistant"
}

/**
 * true = mensaje del usuario (burbuja izquierda en @n8n/chat).
 * Importante: "ToolMessage" contiene la subcadena "AIMessage"; no usar `.includes("AIMessage")` en el id unido.
 */
function inferIsUser(row: Record<string, unknown>): boolean {
  return inferMessageTypeFromRow(row, row.kwargs as Record<string, unknown> | undefined) === "human"
}

/**
 * Interpreta la respuesta de n8n a `action: loadPreviousSession` y la convierte
 * a mensajes que entiende @n8n/chat (mismo criterio que el paquete: LangChain-like).
 */
export function parseLoadPreviousSessionJson(json: unknown): ChatHistoryMessage[] {
  const rows = extractRawRows(json)
  const out: ChatHistoryMessage[] = []
  let i = 0
  for (const rawItem of rows) {
    let item: unknown = rawItem
    if (typeof item === "string") {
      const s = item.trim()
      if (!s) continue
      try {
        item = JSON.parse(s) as unknown
      } catch {
        continue
      }
    }
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const kwargs = row.kwargs as Record<string, unknown> | undefined
    const content = kwargs?.content ?? row.content ?? row.text
    if (content === undefined || content === null) continue
    let text = typeof content === "string" ? content : JSON.stringify(content)
    const messageType = inferMessageTypeFromRow(row, kwargs)

    if (isToolMessageRow(row)) {
      const payload = {
        name: typeof kwargs?.name === "string" ? kwargs.name : undefined,
        tool_call_id:
          typeof kwargs?.tool_call_id === "string"
            ? kwargs.tool_call_id
            : undefined,
        content: text,
      }
      text = `${TOOL_MESSAGE_PREFIX}${JSON.stringify(payload)}`
    }

    const sender = inferIsUser(row) ? "user" : "bot"
    out.push({
      id: `h-${i++}-${crypto.randomUUID()}`,
      text,
      sender,
      messageType,
    })
  }
  return out
}

/**
 * n8n puede envolver el historial en `data`, `json`, `output`, `body` (string JSON), etc.
 * Tomamos el array más largo que parezca una lista de mensajes.
 */
function extractRawRows(json: unknown): unknown[] {
  const arrays = collectMessageArrays(json, 0)
  if (!arrays.length) return []
  arrays.sort((a, b) => b.length - a.length)
  return arrays[0] ?? []
}

function collectMessageArrays(node: unknown, depth: number): unknown[][] {
  if (depth > 6 || node == null) return []
  if (typeof node === "string") {
    try {
      return collectMessageArrays(JSON.parse(node) as unknown, depth + 1)
    } catch {
      return []
    }
  }
  if (!node || typeof node !== "object") return []
  const o = node as Record<string, unknown>
  const found: unknown[][] = []

  const take = (v: unknown) => {
    if (Array.isArray(v) && v.length > 0 && looksLikeMessageList(v)) {
      found.push(v)
    }
  }

  take(o.data)
  take(o.messages)
  take(o.chatHistory)

  const output = o.output
  if (output && typeof output === "object") {
    const out = output as Record<string, unknown>
    take(out.data)
    take(out.messages)
    take(out.chatHistory)
  }

  const j = o.json
  if (j && typeof j === "object") {
    const jo = j as Record<string, unknown>
    take(jo.data)
    take(jo.messages)
    take(jo.chatHistory)
  }

  if (typeof o.body === "string") {
    found.push(...collectMessageArrays(o.body, depth + 1))
  }

  const nestedObjects = [o.data, o.result, o.response, o.item]
  for (const v of nestedObjects) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      found.push(...collectMessageArrays(v, depth + 1))
    }
  }

  return found
}

function looksLikeMessageList(arr: unknown[]): boolean {
  const sample = arr[0]
  if (!sample || typeof sample !== "object") return false
  const row = sample as Record<string, unknown>
  return !!(
    row.kwargs ||
    row.content != null ||
    row.text != null ||
    row.type === "human" ||
    row.type === "ai" ||
    row.role
  )
}

export async function fetchChatHistory(
  webhookUrl: string,
  sessionId: string,
  headers: Record<string, string> = {},
): Promise<ChatHistoryMessage[]> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      action: "loadPreviousSession",
      sessionId,
    }),
    mode: "cors",
    cache: "no-cache",
  })

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return []
  }

  const parsed = parseLoadPreviousSessionJson(json)
  if (parsed.length > 0) return parsed
  if (!res.ok) return []

  return []
}
