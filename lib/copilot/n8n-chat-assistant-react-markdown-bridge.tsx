"use client"

import { createRoot, type Root } from "react-dom/client"

import {
  CopilotAssistantAboveBubble,
  CopilotAssistantMarkdown,
  CopilotUserAboveBubble,
} from "@/components/copilots/copilot-assistant-markdown"
import { normalizeRawMarkdown, RAW_MARKDOWN_ATTR } from "@/lib/copilot/n8n-chat-copy-markdown"
import { isN8nToolEnvelopeMarkdown } from "@/lib/copilot/n8n-chat-tool-log"
import { PRIMEIQ_MESSAGE_TYPE_ATTR } from "@/lib/copilot/n8n-chat-message-types"

export type N8nChatRow = { id: string; text: string; sender: "user" | "bot"; type?: string }

/** Chrome opcional fuera de la burbuja (nombre + avatar usuario, nombre asistente). */
export type N8nChatBubbleChromeOptions = {
  /** Texto junto al icono del asistente (ej. "Copilot"). */
  assistantDisplayName?: string
  /** Nombre mostrado arriba de cada burbuja de usuario (ej. email o username). */
  userDisplayName?: string
  /** Seed estable para `NotionAvatarComponent` (típ. email o username). */
  userAvatarSeed?: string
}

const mountedRoots: Root[] = []

const HOST_CLASS = "n8n-copilot-assistant-md-host"
/** Hermano previo a `.chat-message` del bot. */
const ABOVE_ASSISTANT_CLASS = "n8n-copilot-assistant-above-bubble"
/** Hermano previo a `.chat-message` del usuario. */
const ABOVE_USER_CLASS = "n8n-copilot-user-above-bubble"

function unwrapRef<T>(r: unknown): T | undefined {
  if (r && typeof r === "object" && "value" in r) return (r as { value: T }).value
  return r as T | undefined
}

function readGlobalPropertiesFromChatMount(container: HTMLElement): Record<string, unknown> | null {
  const withApp = container as HTMLElement & {
    __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } }
  }
  return withApp.__vue_app__?.config?.globalProperties ?? null
}

function readN8nChatRows(container: HTMLElement): N8nChatRow[] {
  const gp = readGlobalPropertiesFromChatMount(container)
  const chat = gp?.$chat as { initialMessages?: unknown; messages?: unknown } | undefined
  if (!chat?.messages) return []

  const initial = unwrapRef<N8nChatRow[]>(chat.initialMessages) ?? []
  const main = unwrapRef<N8nChatRow[]>(chat.messages) ?? []
  return [...initial, ...main]
}

function isBubbleChip(el: HTMLElement): boolean {
  return el.classList.contains(ABOVE_ASSISTANT_CLASS) || el.classList.contains(ABOVE_USER_CLASS)
}

/** Misma lógica que `syncHosts`: fila puede montar React markdown (asistente o usuario). */
function isMarkdownReactCandidate(el: HTMLElement, row: N8nChatRow): boolean {
  if (row.sender !== "bot" && row.sender !== "user") return false
  if (row.type === "component") return false
  if (typeof row.text !== "string") return false
  if (el.querySelector(".chat-message-markdown.n8n-chat-tool-log-message")) return false
  const sem = el.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR)
  if (sem === "tool_call" || sem === "tool_result") return false
  if (isN8nToolEnvelopeMarkdown(row.text)) return false
  const vueMd = el.querySelector<HTMLElement>(
    ".chat-message-markdown:not(.n8n-copilot-assistant-md-host)",
  )
  return !!vueMd
}

function cleanupOrphanedBubbleChip(removed: Node): void {
  if (!(removed instanceof HTMLElement)) return
  if (!removed.classList.contains("chat-message")) return
  const prev = removed.previousElementSibling
  if (!(prev instanceof HTMLElement) || !isBubbleChip(prev)) return
  const root = (prev as HTMLElement & { __primeiqRoot?: Root }).__primeiqRoot
  try {
    root?.unmount()
  } catch {
    /* noop */
  }
  if (root) {
    const i = mountedRoots.indexOf(root)
    if (i !== -1) mountedRoots.splice(i, 1)
  }
  prev.remove()
}

function ensureAssistantAboveBubbleHost(messageEl: HTMLElement, assistantDisplayName: string): void {
  const parent = messageEl.parentElement
  if (!parent) return

  const prev = messageEl.previousElementSibling
  const existingAbove =
    prev instanceof HTMLElement && prev.classList.contains(ABOVE_ASSISTANT_CLASS) ? prev : null

  let aboveHost = existingAbove
  if (!aboveHost) {
    aboveHost = document.createElement("div")
    aboveHost.className = ABOVE_ASSISTANT_CLASS
    parent.insertBefore(aboveHost, messageEl)
  }

  let root = (aboveHost as HTMLElement & { __primeiqRoot?: Root }).__primeiqRoot
  if (!root) {
    root = createRoot(aboveHost)
    mountedRoots.push(root)
    ;(aboveHost as HTMLElement & { __primeiqRoot?: Root }).__primeiqRoot = root
  }

  root.render(<CopilotAssistantAboveBubble assistantDisplayName={assistantDisplayName} />)
}

function ensureUserAboveBubbleHost(
  messageEl: HTMLElement,
  userDisplayName: string,
  userAvatarSeed: string,
): void {
  const parent = messageEl.parentElement
  if (!parent) return

  const prev = messageEl.previousElementSibling
  const existingAbove =
    prev instanceof HTMLElement && prev.classList.contains(ABOVE_USER_CLASS) ? prev : null

  let aboveHost = existingAbove
  if (!aboveHost) {
    aboveHost = document.createElement("div")
    aboveHost.className = ABOVE_USER_CLASS
    parent.insertBefore(aboveHost, messageEl)
  }

  let root = (aboveHost as HTMLElement & { __primeiqRoot?: Root }).__primeiqRoot
  if (!root) {
    root = createRoot(aboveHost)
    mountedRoots.push(root)
    ;(aboveHost as HTMLElement & { __primeiqRoot?: Root }).__primeiqRoot = root
  }

  root.render(
    <CopilotUserAboveBubble displayName={userDisplayName} avatarSeed={userAvatarSeed} />,
  )
}

/** Quitar host React del markdown del bot (p. ej. si montó antes que tool-logs transformara la burbuja). */
export function detachAssistantReactHostFromBubble(messageEl: HTMLElement): void {
  const host = messageEl.querySelector<HTMLElement>(`.${HOST_CLASS}`)
  if (host) {
    const typed = host as HTMLElement & { __primeiqRoot?: Root }
    const root = typed.__primeiqRoot
    try {
      root?.unmount()
    } catch {
      /* noop */
    }
    if (root) {
      const i = mountedRoots.indexOf(root)
      if (i !== -1) mountedRoots.splice(i, 1)
    }
    delete typed.__primeiqRoot
    try {
      host.remove()
    } catch {
      /* noop */
    }
  }
  for (const vueMd of messageEl.querySelectorAll<HTMLElement>(".chat-message-markdown")) {
    if (vueMd.classList.contains(HOST_CLASS)) continue
    if ("primeiqAssistantReact" in vueMd.dataset) {
      delete vueMd.dataset.primeiqAssistantReact
    }
    const st = vueMd.getAttribute("style")
    if (st?.includes("none")) {
      vueMd.removeAttribute("style")
    }
  }
}

function ensureReactHost(
  messageEl: HTMLElement,
  vueMd: HTMLElement,
  source: string,
  uiBlocksActionsEnabled: boolean,
): void {
  if (isN8nToolEnvelopeMarkdown(source)) return
  const sem = messageEl.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR)
  if (sem === "tool_call" || sem === "tool_result") return
  if (vueMd.classList.contains("n8n-chat-tool-log-message")) return

  let host = messageEl.querySelector<HTMLElement>(`.${HOST_CLASS}`)
  if (!host) {
    host = document.createElement("div")
    host.className = HOST_CLASS
    vueMd.parentElement?.insertBefore(host, vueMd)
    vueMd.dataset.primeiqAssistantReact = "1"
    vueMd.setAttribute("style", "display:none !important")
    const root = createRoot(host)
    mountedRoots.push(root)
    ;(host as HTMLElement & { __primeiqRoot?: Root }).__primeiqRoot = root
  }
  const root = (host as HTMLElement & { __primeiqRoot?: Root }).__primeiqRoot
  if (!root) return

  host.setAttribute(RAW_MARKDOWN_ATTR, normalizeRawMarkdown(source))
  vueMd.removeAttribute(RAW_MARKDOWN_ATTR)

  root.render(
    <CopilotAssistantMarkdown source={source} uiBlocksActionsEnabled={uiBlocksActionsEnabled} />,
  )
}

export interface AssistantReactMarkdownHandle {
  detach: () => void
  triggerScan: () => void
}

export function attachAssistantReactMarkdownBubbles(
  container: HTMLElement,
  chrome?: N8nChatBubbleChromeOptions,
): AssistantReactMarkdownHandle {
  const opts: N8nChatBubbleChromeOptions = chrome ?? {}
  const assistantName = (opts.assistantDisplayName ?? "Copilot").trim() || "Copilot"
  const userName = opts.userDisplayName?.trim() ?? ""
  const userSeed = (opts.userAvatarSeed ?? userName).trim() || "user"

  function syncHosts(): void {
    const rows = readN8nChatRows(container)
    const list = container.querySelector(".chat-messages-list")
    if (!list) return

    const domMessages = [
      ...list.querySelectorAll<HTMLElement>(
        ":scope > .chat-message:not(.chat-message-typing)",
      ),
    ]

    if (rows.length === 0 || domMessages.length === 0) return

    const n = Math.min(rows.length, domMessages.length)
    let lastAssistantReactIndex = -1
    let lastUserReactIndex = -1
    for (let i = 0; i < n; i++) {
      const row = rows[i]
      const el = domMessages[i]
      if (!row || !el) continue
      if (!isMarkdownReactCandidate(el, row)) continue
      if (row.sender === "bot") lastAssistantReactIndex = i
      if (row.sender === "user") lastUserReactIndex = i
    }

    for (let i = 0; i < n; i++) {
      const row = rows[i]
      const el = domMessages[i]
      if (!row || !el) continue
      if (el.querySelector(".chat-message-markdown.n8n-chat-tool-log-message")) continue
      const sem = el.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR)
      if (sem === "tool_call" || sem === "tool_result") continue
      if (typeof row.text === "string" && isN8nToolEnvelopeMarkdown(row.text)) continue
      if (row.type === "component") continue

      if (row.sender === "user") {
        if (userName) {
          ensureUserAboveBubbleHost(el, userName, userSeed)
        }
        if (typeof row.text !== "string") continue
        const vueMdUser = el.querySelector<HTMLElement>(
          ".chat-message-markdown:not(.n8n-copilot-assistant-md-host)",
        )
        if (!vueMdUser) continue
        ensureReactHost(el, vueMdUser, row.text ?? "", i === lastUserReactIndex)
        continue
      }

      if (row.sender !== "bot") continue
      if (typeof row.text !== "string") continue

      const vueMd = el.querySelector<HTMLElement>(
        ".chat-message-markdown:not(.n8n-copilot-assistant-md-host)",
      )
      if (!vueMd) continue

      ensureAssistantAboveBubbleHost(el, assistantName)
      const uiBlocksActionsEnabled = i === lastAssistantReactIndex
      ensureReactHost(el, vueMd, row.text ?? "", uiBlocksActionsEnabled)
    }
  }

  let nearPass: number | undefined
  let latePassA: number | undefined
  let latePassB: number | undefined

  const schedule = (ms: number, kind: "near" | "a" | "b") => {
    const get = () =>
      kind === "near" ? nearPass : kind === "a" ? latePassA : latePassB
    const set = (id: number | undefined) => {
      if (kind === "near") nearPass = id
      else if (kind === "a") latePassA = id
      else latePassB = id
    }
    if (get() !== undefined) return
    set(
      window.setTimeout(() => {
        set(undefined)
        requestAnimationFrame(() => syncHosts())
      }, ms),
    )
  }

  const scheduleAll = () => {
    schedule(40, "near")
    schedule(120, "a")
    schedule(320, "b")
  }

  const triggerScan = () => {
    requestAnimationFrame(() => syncHosts())
  }

  triggerScan()
  scheduleAll()

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        cleanupOrphanedBubbleChip(node)
      }
    }
    scheduleAll()
  })
  observer.observe(container, { childList: true, subtree: true, characterData: true })

  return {
    detach: () => {
      observer.disconnect()
      window.clearTimeout(nearPass)
      window.clearTimeout(latePassA)
      window.clearTimeout(latePassB)
      for (const r of mountedRoots) {
        try {
          r.unmount()
        } catch {
          /* noop */
        }
      }
      mountedRoots.length = 0
      container
        .querySelectorAll<HTMLElement>(`.${ABOVE_ASSISTANT_CLASS}, .${ABOVE_USER_CLASS}`)
        .forEach((el) => {
          try {
            el.remove()
          } catch {
            /* noop */
          }
        })
    },
    triggerScan,
  }
}
