import type { ChatHistoryMessage } from "@/lib/copilot/n8n-load-history"
import { parseToolLogEntry } from "@/lib/copilot/n8n-chat-tool-log"
import {
  PRIMEIQ_MESSAGE_TYPE_ATTR,
  type PrimeIqMessageTypeAttr,
} from "@/lib/copilot/n8n-chat-message-types"

export { PRIMEIQ_MESSAGE_TYPE_ATTR, type PrimeIqMessageTypeAttr }

/**
 * Solo `data-*` en la raíz `.chat-message`: Vue sobrescribe `class` en cada render
 * y pelear por `classList` provoca parpadeo infinito.
 */
export function applyPrimeIqMessageSemantics(
  el: HTMLElement,
  type: PrimeIqMessageTypeAttr,
): void {
  if (el.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR) === type) return
  el.setAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR, type)
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function inferEphemeralMessageType(el: HTMLElement): PrimeIqMessageTypeAttr {
  if (el.classList.contains("chat-message-from-user")) return "human"
  const md = el.querySelector<HTMLElement>(".chat-message-markdown")
  const raw = (md?.innerText ?? md?.textContent ?? "").trim()
  if (!raw) return "assistant"
  const entry = parseToolLogEntry(normalizeText(raw))
  if (!entry) return "assistant"
  if (entry.verb === "Calling") return "tool_call"
  if (entry.verb === "Response") return "tool_result"
  return "assistant"
}

function listMessageBubbles(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      ".chat-message:not(.chat-message-typing)",
    ),
  ]
}

export type AttachMessageSemanticsOptions = {
  history: ChatHistoryMessage[]
  welcomeBubbleCount: number
}

/**
 * Marca cada `.chat-message` con `data-primeiq-message-type` (sin tocar `class`;
 * estiliza con `[data-primeiq-message-type="…"]` en CSS).
 */
export function attachMessageSemantics(
  container: HTMLElement,
  options: AttachMessageSemanticsOptions,
): () => void {
  const { history, welcomeBubbleCount } = options
  let debounce: number | undefined

  const runCore = () => {
    const bubbles = listMessageBubbles(container)
    const skip = Math.max(0, welcomeBubbleCount)
    const historyEnd = skip + history.length

    for (let i = 0; i < bubbles.length; i++) {
      const el = bubbles[i]
      let type: PrimeIqMessageTypeAttr
      if (i < skip) {
        type = "assistant"
      } else if (i < historyEnd) {
        type = history[i - skip]!.messageType
      } else {
        type = inferEphemeralMessageType(el)
      }
      applyPrimeIqMessageSemantics(el, type)
    }
  }

  const runDebounced = () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(runCore, 20)
  }

  runCore()
  const observer = new MutationObserver(runDebounced)
  observer.observe(container, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    window.clearTimeout(debounce)
  }
}
