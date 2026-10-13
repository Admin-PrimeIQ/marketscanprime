/** Expuesto en DOM para CSS y lógica (tool logs, copiar, etc.). */
export const PRIMEIQ_MESSAGE_TYPE_ATTR = "data-primeiq-message-type" as const

/**
 * Clases en `.chat-message-markdown` del activity log (Vue no las pisa como la `class` del `.chat-message`).
 * Mutuamente excluyentes: tool call vs respuesta de tool.
 */
export const PRIMEIQ_CLASS_CALLING_TOOLS = "primeiq-calling-tools"
export const PRIMEIQ_CLASS_TOOL_MESSAGE = "primeiq-tool-message"

export type PrimeIqMessageTypeAttr =
  | "human"
  | "assistant"
  | "tool_call"
  | "tool_result"
