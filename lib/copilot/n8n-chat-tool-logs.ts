import { detachAssistantReactHostFromBubble } from "@/lib/copilot/n8n-chat-assistant-react-markdown-bridge"
import {
  extractToolCallIdsFromAiToolCallsRaw,
  extractToolEnvelopeMeta,
  isKnownAssistantResponseText,
  normalizeToolName,
  parseToolLogEntry,
  type ToolLogEntry,
} from "@/lib/copilot/n8n-chat-tool-log"
import {
  PRIMEIQ_CLASS_CALLING_TOOLS,
  PRIMEIQ_CLASS_TOOL_MESSAGE,
  PRIMEIQ_MESSAGE_TYPE_ATTR,
} from "@/lib/copilot/n8n-chat-message-types"

type ToolUiKind = "tool_call" | "tool_result"

function applyToolMarkdownKindClasses(md: HTMLElement, kind: ToolUiKind): void {
  md.classList.remove(PRIMEIQ_CLASS_CALLING_TOOLS, PRIMEIQ_CLASS_TOOL_MESSAGE)
  md.classList.add(kind === "tool_call" ? PRIMEIQ_CLASS_CALLING_TOOLS : PRIMEIQ_CLASS_TOOL_MESSAGE)
}

/** Evita tocar `class` en cada scan si ya está bien (reduce ruido en DevTools y trabajo innecesario). */
function applyToolMarkdownKindClassesIfNeeded(md: HTMLElement, kind: ToolUiKind): void {
  const wantCalling = kind === "tool_call"
  const want = wantCalling ? PRIMEIQ_CLASS_CALLING_TOOLS : PRIMEIQ_CLASS_TOOL_MESSAGE
  const drop = wantCalling ? PRIMEIQ_CLASS_TOOL_MESSAGE : PRIMEIQ_CLASS_CALLING_TOOLS
  if (md.classList.contains(want) && !md.classList.contains(drop)) return
  applyToolMarkdownKindClasses(md, kind)
}

const ASSISTANT_REACT_MD_HOST_SEL = ".n8n-copilot-assistant-md-host"

const TOOL_LOG_ATTR = "data-n8n-tool-log"
const TOOL_LOG_SIG_ATTR = "data-n8n-tool-log-signature"
const TOOL_LOG_EXPANDED_ATTR = "data-n8n-tool-log-expanded"
const TOOL_LOG_RAW_ATTR = "data-n8n-tool-log-raw"

/** Burbuja tool_result oculta: contenido mostrado dentro del tool_call anterior. */
const PRIMEIQ_TOOL_RESULT_MERGED_ATTR = "data-primeiq-tool-result-merged"
const NESTED_RESPONSE_CLASS = "n8n-chat-tool-log-nested-response"
const NESTED_SIG_ATTR = "data-primeiq-nested-tool-signature"

function ensureToolLogRawAttr(md: HTMLElement, normalizedRaw: string): void {
  if (md.getAttribute(TOOL_LOG_RAW_ATTR) !== normalizedRaw) {
    md.setAttribute(TOOL_LOG_RAW_ATTR, normalizedRaw)
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function previousListBubble(el: HTMLElement, list: HTMLElement): HTMLElement | null {
  const bubbles = [...list.querySelectorAll<HTMLElement>(".chat-message:not(.chat-message-typing)")]
  const i = bubbles.indexOf(el)
  if (i <= 0) return null
  return bubbles[i - 1] ?? null
}

/** Salta burbujas tool_result ya fusionadas (display none) al buscar el tool_call emparejado. */
function previousNonMergedListBubble(el: HTMLElement, list: HTMLElement): HTMLElement | null {
  const bubbles = [...list.querySelectorAll<HTMLElement>(".chat-message:not(.chat-message-typing)")]
  const i = bubbles.indexOf(el)
  for (let j = i - 1; j >= 0; j--) {
    const b = bubbles[j]!
    if (b.getAttribute(PRIMEIQ_TOOL_RESULT_MERGED_ATTR) === "1") continue
    return b
  }
  return null
}

function callingBubbleTargets(callRaw: string): { names: Set<string>; ids: string[] } {
  const names = new Set<string>()
  const entry = parseToolLogEntry(callRaw)
  if (entry?.verb === "Calling") {
    names.add(entry.target.trim().toLowerCase())
  }
  const ids = extractToolCallIdsFromAiToolCallsRaw(callRaw)
  try {
    const parsed = JSON.parse(callRaw.trim()) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const tc = (parsed as Record<string, unknown>).tool_calls
      if (Array.isArray(tc)) {
        for (const t of tc) {
          if (t && typeof t === "object") {
            const fn = (t as { function?: { name?: string } }).function
            if (fn && typeof fn.name === "string") {
              names.add(normalizeToolName(fn.name).trim().toLowerCase())
            }
          }
        }
      }
    }
  } catch {
    /* noop */
  }
  return { names, ids }
}

function toolBubblePairEligible(callRaw: string, resultRaw: string): boolean {
  const r = parseToolLogEntry(resultRaw)
  if (!r || r.verb !== "Response") return false
  const rt = r.target.trim().toLowerCase()
  const { names, ids } = callingBubbleTargets(callRaw)
  const meta = extractToolEnvelopeMeta(resultRaw)
  if (meta?.toolCallId && ids.length > 0 && !ids.includes(meta.toolCallId)) return false
  if (names.size > 0 && !names.has(rt)) return false
  if (names.size === 0 && ids.length === 0) return false
  return true
}

function stripDonorUiKeepRaw(el: HTMLElement, md: HTMLElement): void {
  detachAssistantReactHostFromBubble(el)
  md.innerHTML = ""
  md.classList.remove(
    "n8n-chat-tool-log-message",
    PRIMEIQ_CLASS_CALLING_TOOLS,
    PRIMEIQ_CLASS_TOOL_MESSAGE,
  )
  md.removeAttribute(TOOL_LOG_ATTR)
  md.removeAttribute(TOOL_LOG_SIG_ATTR)
  md.removeAttribute(TOOL_LOG_EXPANDED_ATTR)
}

function unmergeDonor(el: HTMLElement, md: HTMLElement, list: HTMLElement): void {
  const callingEl = previousListBubble(el, list)
  callingEl?.querySelector(`.${NESTED_RESPONSE_CLASS}`)?.remove()
  el.removeAttribute(PRIMEIQ_TOOL_RESULT_MERGED_ATTR)
  el.removeAttribute("aria-hidden")
  el.style.removeProperty("display")
}

function mountNestedInCallingBubble(
  callMd: HTMLElement,
  callRaw: string,
  resRaw: string,
  resultEntry: ToolLogEntry,
): void {
  const details = callMd.querySelector<HTMLElement>(".n8n-chat-tool-log-details")
  if (!details) return

  const metaSig = `nested|${resultEntry.title}|${normalizeText(resRaw)}`
  const existing = details.querySelector<HTMLElement>(`.${NESTED_RESPONSE_CLASS}`)
  if (existing?.getAttribute(NESTED_SIG_ATTR) === metaSig) return

  existing?.remove()

  const wrap = document.createElement("div")
  wrap.className = `${NESTED_RESPONSE_CLASS} primeiq-nested-tool-result-card`
  wrap.setAttribute(NESTED_SIG_ATTR, metaSig)

  const callEntry = parseToolLogEntry(normalizeText(callRaw))
  const rt = resultEntry.target.trim()
  const toolDisplay =
    rt && rt.toLowerCase() !== "tool"
      ? resultEntry.target
      : callEntry?.verb === "Calling"
        ? callEntry.target
        : resultEntry.target

  const headerBtn = document.createElement("button")
  headerBtn.type = "button"
  headerBtn.className = "n8n-chat-tool-log-header n8n-chat-tool-log-header--nested-result"
  headerBtn.setAttribute("aria-expanded", "false")

  const verb = document.createElement("span")
  verb.className = "n8n-chat-tool-log-verb"
  verb.textContent = resultEntry.verb

  const sep = document.createElement("span")
  sep.className = "n8n-chat-tool-log-sep"
  sep.textContent = "-"

  const target = document.createElement("code")
  target.className = "n8n-chat-tool-log-target"
  target.textContent = toolDisplay.trim() || resultEntry.target

  headerBtn.append(verb, sep, target)

  const nestedDetails = document.createElement("div")
  nestedDetails.className = "n8n-chat-tool-log-details primeiq-nested-tool-result-details"
  nestedDetails.hidden = true

  const filtered = resultEntry.details.filter((d) => d.label !== "Tool Call ID")
  const contentRow = filtered.find((d) => d.label === "Content")
  const rowsToShow = contentRow
    ? [contentRow]
    : filtered.length > 0
      ? filtered
      : [{ label: "Content", value: resRaw, language: "json" as const }]

  for (const d of rowsToShow) {
    nestedDetails.appendChild(createDetailRow(d.label, d.value, d.language, "none"))
  }

  headerBtn.addEventListener("click", (ev) => {
    ev.stopPropagation()
    const next = nestedDetails.hidden
    nestedDetails.hidden = !next
    headerBtn.setAttribute("aria-expanded", next ? "true" : "false")
  })

  wrap.appendChild(headerBtn)
  wrap.appendChild(nestedDetails)
  details.appendChild(wrap)
}

/**
 * Vue/n8n a veces inserta una burbuja `.chat-message.tool_result` dentro del
 * `details` del calling; la sustituimos por el bloque compacto `mountNestedInCallingBubble`.
 */
function relocateMisnestedToolResultBubbles(container: HTMLElement): void {
  const outers = container.querySelectorAll<HTMLElement>(
    `.chat-message[${PRIMEIQ_MESSAGE_TYPE_ATTR}="tool_call"]`,
  )
  for (const outer of outers) {
    const outerMd = outer.querySelector<HTMLElement>(".chat-message-markdown")
    if (!outerMd?.classList.contains("n8n-chat-tool-log-message")) continue
    const hostDetails = outerMd.querySelector<HTMLElement>(".n8n-chat-tool-log-details")
    if (!hostDetails) continue

    const inners = [
      ...hostDetails.querySelectorAll<HTMLElement>(
        `.chat-message[${PRIMEIQ_MESSAGE_TYPE_ATTR}="tool_result"]`,
      ),
    ].reverse()

    for (const inner of inners) {
      if (!hostDetails.contains(inner)) continue
      if (inner.closest(`.${NESTED_RESPONSE_CLASS}`)) continue

      const innerMd = inner.querySelector<HTMLElement>(".chat-message-markdown")
      if (!innerMd) {
        inner.remove()
        continue
      }

      const resRaw = normalizeText(
        innerMd.getAttribute(TOOL_LOG_RAW_ATTR) ?? innerMd.innerText ?? innerMd.textContent ?? "",
      )
      const callRaw = normalizeText(
        outerMd.getAttribute(TOOL_LOG_RAW_ATTR) ?? outerMd.innerText ?? outerMd.textContent ?? "",
      )
      if (!resRaw) {
        inner.remove()
        continue
      }

      const entry = parseToolLogEntry(resRaw)
      if (!entry) {
        inner.remove()
        continue
      }
      if (!toolBubblePairEligible(callRaw, resRaw)) continue

      mountNestedInCallingBubble(outerMd, callRaw, resRaw, entry)
      inner.remove()
    }
  }
}

function syncNestedToolResponses(container: HTMLElement): void {
  const list = container.querySelector(".chat-messages-list")
  if (!(list instanceof HTMLElement)) return
  const bubbles = [...list.querySelectorAll<HTMLElement>(".chat-message:not(.chat-message-typing)")]
  for (const el of bubbles) {
    if (el.getAttribute(PRIMEIQ_TOOL_RESULT_MERGED_ATTR) !== "1") continue
    const md = el.querySelector<HTMLElement>(".chat-message-markdown")
    if (!md) continue
    const raw = normalizeText(md.getAttribute(TOOL_LOG_RAW_ATTR) ?? "")
    if (!raw) continue
    const callingEl = previousListBubble(el, list)
    const callMd = callingEl?.querySelector<HTMLElement>(".chat-message-markdown")
    const callRaw = callMd
      ? normalizeText(callMd.getAttribute(TOOL_LOG_RAW_ATTR) ?? callMd.innerText ?? "")
      : ""
    if (
      !callingEl ||
      !callMd ||
      callingEl.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR) !== "tool_call" ||
      !toolBubblePairEligible(callRaw, raw)
    ) {
      unmergeDonor(el, md, list)
      continue
    }
    const entry = parseToolLogEntry(raw)
    if (entry) mountNestedInCallingBubble(callMd, callRaw, raw, entry)
  }
}

function isUserMessage(el: HTMLElement): boolean {
  return el.classList.contains("chat-message-from-user")
}

function clearToolLogPresentation(el: HTMLElement): void {
  const md = el.querySelector<HTMLElement>(".chat-message-markdown")
  if (!md) {
    el.classList.remove("n8n-chat-tool-log-message")
    el.removeAttribute(TOOL_LOG_ATTR)
    el.removeAttribute(TOOL_LOG_SIG_ATTR)
    el.removeAttribute(TOOL_LOG_EXPANDED_ATTR)
    return
  }
  md.querySelector(`.${NESTED_RESPONSE_CLASS}`)?.remove()
  const preservedRaw = md.getAttribute(TOOL_LOG_RAW_ATTR)
  if (preservedRaw && md.getAttribute(TOOL_LOG_ATTR) === "1") {
    md.textContent = preservedRaw
  }
  md.classList.remove(
    "n8n-chat-tool-log-message",
    PRIMEIQ_CLASS_CALLING_TOOLS,
    PRIMEIQ_CLASS_TOOL_MESSAGE,
  )
  md.removeAttribute(TOOL_LOG_ATTR)
  md.removeAttribute(TOOL_LOG_SIG_ATTR)
  md.removeAttribute(TOOL_LOG_EXPANDED_ATTR)
  md.removeAttribute(TOOL_LOG_RAW_ATTR)
  el.classList.remove("n8n-chat-tool-log-message")
  el.removeAttribute(TOOL_LOG_ATTR)
  el.removeAttribute(TOOL_LOG_SIG_ATTR)
  el.removeAttribute(TOOL_LOG_EXPANDED_ATTR)
}

type ToolLogDetailTreeTier = "none" | "under-call" | "under-response"

function createDetailRow(
  label: string,
  value: string,
  language?: "json" | "text",
  treeTier: ToolLogDetailTreeTier = "none",
) {
  const row = document.createElement("div")
  row.className = "n8n-chat-tool-log-detail"
  if (treeTier === "under-call") row.classList.add("n8n-chat-tool-log-detail--tree-call")
  if (treeTier === "under-response") row.classList.add("n8n-chat-tool-log-detail--tree-response")

  const labelEl = document.createElement("span")
  labelEl.className = "n8n-chat-tool-log-detail-label"
  labelEl.textContent = label

  const pre = document.createElement("pre")
  pre.className = "n8n-chat-tool-log-pre"
  pre.setAttribute("data-n8n-plain-code", "1")
  const code = document.createElement("code")
  code.className = "n8n-chat-tool-log-code"
  code.setAttribute("data-n8n-plain-code", "1")
  if (language === "json") {
    code.setAttribute("data-n8n-lang", "json")
  }
  code.textContent = value
  pre.appendChild(code)

  row.appendChild(labelEl)
  row.appendChild(pre)
  return row
}

function renderToolLog(
  el: HTMLElement,
  md: HTMLElement,
  entry: ToolLogEntry,
  fallbackRaw: string,
  toolUiKind: ToolUiKind,
): void {
  const signature = `${entry.title}|${fallbackRaw}`
  const alreadyRendered =
    md.getAttribute(TOOL_LOG_ATTR) === "1" && md.getAttribute(TOOL_LOG_SIG_ATTR) === signature

  if (alreadyRendered) {
    if (el.querySelector(ASSISTANT_REACT_MD_HOST_SEL)) detachAssistantReactHostFromBubble(el)
    applyToolMarkdownKindClassesIfNeeded(md, toolUiKind)
    return
  }

  detachAssistantReactHostFromBubble(el)
  const isExpanded = md.getAttribute(TOOL_LOG_EXPANDED_ATTR) === "1"

  md.innerHTML = ""

  const headerBtn = document.createElement("button")
  headerBtn.type = "button"
  headerBtn.className = "n8n-chat-tool-log-header"
  headerBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false")

  const verb = document.createElement("span")
  verb.className = "n8n-chat-tool-log-verb"
  verb.textContent = entry.verb

  const sep = document.createElement("span")
  sep.className = "n8n-chat-tool-log-sep"
  sep.textContent = "-"

  const target = document.createElement("code")
  target.className = "n8n-chat-tool-log-target"
  target.textContent = entry.target

  headerBtn.appendChild(verb)
  headerBtn.appendChild(sep)
  headerBtn.appendChild(target)

  const details = document.createElement("div")
  details.className = "n8n-chat-tool-log-details"

  const detailItems = entry.details.length
    ? entry.details
    : [{ label: "Raw", value: fallbackRaw, language: "text" as const }]

  const rowTreeTier: ToolLogDetailTreeTier = toolUiKind === "tool_call" ? "under-call" : "none"
  for (const detail of detailItems) {
    details.appendChild(
      createDetailRow(detail.label, detail.value, detail.language, rowTreeTier),
    )
  }

  if (!isExpanded) {
    details.hidden = true
  }

  headerBtn.addEventListener("click", () => {
    const nextExpanded = details.hidden
    details.hidden = !nextExpanded
    headerBtn.setAttribute("aria-expanded", nextExpanded ? "true" : "false")
    md.setAttribute(TOOL_LOG_EXPANDED_ATTR, nextExpanded ? "1" : "0")
  })

  md.appendChild(headerBtn)
  md.appendChild(details)

  md.classList.add("n8n-chat-tool-log-message")
  applyToolMarkdownKindClasses(md, toolUiKind)
  md.setAttribute(TOOL_LOG_ATTR, "1")
  md.setAttribute(TOOL_LOG_SIG_ATTR, signature)
}

function enhanceMessage(el: HTMLElement): void {
  const md = el.querySelector<HTMLElement>(".chat-message-markdown")
  if (!md) return

  const rawText = md.getAttribute(TOOL_LOG_RAW_ATTR) ?? md.innerText ?? md.textContent ?? ""
  const normalizedRaw = normalizeText(rawText)
  if (!normalizedRaw) return

  const list = el.closest(".chat-messages-list")

  if (el.getAttribute(PRIMEIQ_TOOL_RESULT_MERGED_ATTR) === "1") {
    if (list instanceof HTMLElement) {
      const callingEl = previousListBubble(el, list)
      const callMd = callingEl?.querySelector<HTMLElement>(".chat-message-markdown")
      const callRaw = callMd
        ? normalizeText(callMd.getAttribute(TOOL_LOG_RAW_ATTR) ?? callMd.innerText ?? "")
        : ""
      if (
        callingEl &&
        callMd &&
        callingEl.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR) === "tool_call" &&
        toolBubblePairEligible(callRaw, normalizedRaw)
      ) {
        ensureToolLogRawAttr(md, normalizedRaw)
        const mergedEntry = parseToolLogEntry(normalizedRaw)
        if (mergedEntry) mountNestedInCallingBubble(callMd, callRaw, normalizedRaw, mergedEntry)
        return
      }
      unmergeDonor(el, md, list)
    } else {
      el.removeAttribute(PRIMEIQ_TOOL_RESULT_MERGED_ATTR)
    }
  }

  if (isUserMessage(el)) {
    clearToolLogPresentation(el)
    return
  }

  const semantic = el.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR)

  if (semantic === "human" || semantic === "assistant") {
    clearToolLogPresentation(el)
    return
  }

  if (semantic === "tool_call" || semantic === "tool_result") {
    const entry = parseToolLogEntry(normalizedRaw)
    if (!entry) {
      clearToolLogPresentation(el)
      return
    }
    ensureToolLogRawAttr(md, normalizedRaw)

    if (semantic === "tool_result" && list instanceof HTMLElement) {
      const callingEl = previousNonMergedListBubble(el, list)
      const callMd = callingEl?.querySelector<HTMLElement>(".chat-message-markdown")
      const callRaw = callMd
        ? normalizeText(callMd.getAttribute(TOOL_LOG_RAW_ATTR) ?? callMd.innerText ?? "")
        : ""
      if (
        callingEl &&
        callMd &&
        callingEl.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR) === "tool_call" &&
        toolBubblePairEligible(callRaw, normalizedRaw)
      ) {
        stripDonorUiKeepRaw(el, md)
        el.setAttribute(PRIMEIQ_TOOL_RESULT_MERGED_ATTR, "1")
        el.setAttribute("aria-hidden", "true")
        el.style.setProperty("display", "none", "important")
        mountNestedInCallingBubble(callMd, callRaw, normalizedRaw, entry)
        return
      }
    }

    renderToolLog(el, md, entry, normalizedRaw, semantic)
    return
  }

  // Streaming / mensajes sin marcar aún: no convertir respuestas finales del asistente.
  if (isKnownAssistantResponseText(normalizedRaw)) {
    clearToolLogPresentation(el)
    return
  }

  const entry = parseToolLogEntry(normalizedRaw)
  if (!entry) {
    clearToolLogPresentation(el)
    return
  }

  const toolUiKind: ToolUiKind =
    entry.verb === "Calling" ? "tool_call" : entry.verb === "Response" ? "tool_result" : "tool_call"

  ensureToolLogRawAttr(md, normalizedRaw)
  renderToolLog(el, md, entry, normalizedRaw, toolUiKind)
}

function scan(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLElement>(".chat-message:not(.chat-message-typing)")
    .forEach((el) => enhanceMessage(el))
  syncNestedToolResponses(container)
  relocateMisnestedToolResultBubbles(container)
}

/**
 * Collapses tool-call/tool-response messages into compact "activity logs",
 * both for hydrated history and for real-time stream updates.
 */
export function attachToolLogs(container: HTMLElement) {
  let debounce: number | undefined

  const run = () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => scan(container), 20)
  }

  scan(container)

  const observer = new MutationObserver(run)
  observer.observe(container, {
    childList: true,
    subtree: true,
  })

  return () => {
    observer.disconnect()
    window.clearTimeout(debounce)
  }
}
