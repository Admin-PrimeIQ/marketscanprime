import { PRIMEIQ_MESSAGE_TYPE_ATTR } from "@/lib/copilot/n8n-chat-message-types"

const ENHANCED_ATTR = "data-n8n-copy-md"
export const RAW_MARKDOWN_ATTR = "data-n8n-raw-markdown"

/** Hermano justo después de la burbuja: acciones fuera (copiar / reenviar usuario; copiar asistente). */
const USER_BELOW_ACTIONS_CLASS = "n8n-copilot-user-below-actions"
const BOT_BELOW_ACTIONS_CLASS = "n8n-copilot-from-bot-below-actions"
type BubbleActionLabels = {
  copy: string
  resend: string
}

type BubbleMessage = {
  sender: "user" | "bot"
  text: string
}

type RawQueueState = {
  messages: BubbleMessage[]
  nextIndex: number
}

function escapeInlineCode(text: string): string {
  return text.replace(/`/g, "\\`")
}

function normalizeMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function normalizeRawMarkdown(text: string): string {
  return text.replace(/\r\n/g, "\n").trim()
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|")
}

function renderTable(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"))
    .map((row) =>
      Array.from(row.children)
        .filter((cell) => {
          const tag = cell.tagName.toLowerCase()
          return tag === "th" || tag === "td"
        })
        .map((cell) =>
          escapeTableCell(
            renderNode(cell)
              .replace(/\n+/g, " ")
              .replace(/\s{2,}/g, " ")
              .trim(),
          ),
        ),
    )
    .filter((cells) => cells.length > 0)

  if (rows.length === 0) return ""

  const header = rows[0] ?? []
  if (header.length === 0) return ""

  const separator = header.map(() => "---")
  const body = rows.slice(1)
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((cells) => {
      const padded = [...cells]
      while (padded.length < header.length) {
        padded.push("")
      }
      return `| ${padded.slice(0, header.length).join(" | ")} |`
    }),
  ]

  return `${lines.join("\n")}\n\n`
}

function renderNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ""
  }

  if (!(node instanceof HTMLElement)) return ""
  const tag = node.tagName.toLowerCase()
  const children = Array.from(node.childNodes).map(renderNode).join("")

  if (tag === "br") return "\n"
  if (tag === "p") return `${children.trim()}\n\n`
  if (tag === "strong" || tag === "b") return `**${children.trim()}**`
  if (tag === "em" || tag === "i") return `*${children.trim()}*`
  if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") {
    return `\`${escapeInlineCode(children)}\``
  }
  if (tag === "pre") {
    const codeEl = node.querySelector("code")
    const className = codeEl?.className ?? ""
    const lang = className.match(/language-([\w-]+)/)?.[1] ?? ""
    const raw = (codeEl?.textContent ?? node.textContent ?? "").replace(/\n$/, "")
    return `\`\`\`${lang}\n${raw}\n\`\`\`\n\n`
  }
  if (tag === "a") {
    const href = node.getAttribute("href") ?? ""
    const label = children.trim() || href
    return href ? `[${label}](${href})` : label
  }
  if (tag === "img") {
    const alt = node.getAttribute("alt") ?? ""
    const src = node.getAttribute("src") ?? ""
    const title = node.getAttribute("title") ?? ""
    if (!src) return alt
    const titleChunk = title ? ` "${title.replace(/"/g, '\\"')}"` : ""
    return `![${alt}](${src}${titleChunk})`
  }
  if (tag === "blockquote") {
    const body = children
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
    return `${body}\n\n`
  }
  if (tag === "hr") return "---\n\n"
  if (tag === "table") return renderTable(node)
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1] ?? "1")
    return `${"#".repeat(level)} ${children.trim()}\n\n`
  }
  if (tag === "ul") {
    const items = Array.from(node.children)
      .filter((el) => el.tagName.toLowerCase() === "li")
      .map((li) => `- ${renderNode(li).trim()}`)
      .join("\n")
    return `${items}\n\n`
  }
  if (tag === "ol") {
    const items = Array.from(node.children)
      .filter((el) => el.tagName.toLowerCase() === "li")
      .map((li, i) => `${i + 1}. ${renderNode(li).trim()}`)
      .join("\n")
    return `${items}\n\n`
  }
  if (tag === "li") return children.replace(/\n{2,}/g, "\n").trim()

  return children
}

function getMessageMarkdown(md: HTMLElement): string {
  const raw = md.getAttribute(RAW_MARKDOWN_ATTR)
  if (raw) return normalizeRawMarkdown(raw)
  const markdown = Array.from(md.childNodes).map(renderNode).join("")
  return normalizeMarkdown(markdown || md.innerText)
}

function inferMessageSender(el: HTMLElement): "user" | "bot" {
  return el.classList.contains("chat-message-from-user") ? "user" : "bot"
}

function attachRawMarkdownFromQueue(
  el: HTMLElement,
  md: HTMLElement,
  rawQueue?: RawQueueState,
) {
  if (!rawQueue) return
  if (md.getAttribute(RAW_MARKDOWN_ATTR)) return
  if (rawQueue.nextIndex >= rawQueue.messages.length) return

  const sender = inferMessageSender(el)
  const current = rawQueue.messages[rawQueue.nextIndex]
  if (current?.sender === sender) {
    md.setAttribute(RAW_MARKDOWN_ATTR, normalizeRawMarkdown(current.text))
    rawQueue.nextIndex += 1
    return
  }

  // Attempt a tiny lookahead in case n8n injected a non-historic bubble.
  for (
    let offset = 1;
    offset <= 3 && rawQueue.nextIndex + offset < rawQueue.messages.length;
    offset += 1
  ) {
    const candidate = rawQueue.messages[rawQueue.nextIndex + offset]
    if (candidate?.sender !== sender) continue
    rawQueue.nextIndex += offset + 1
    md.setAttribute(RAW_MARKDOWN_ATTR, normalizeRawMarkdown(candidate.text))
    return
  }
}

function createCopyButton(
  md: HTMLElement,
  labels: BubbleActionLabels,
): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "n8n-chat-message-action-btn n8n-chat-copy-markdown-btn"
  btn.setAttribute("aria-label", labels.copy)
  btn.setAttribute("data-tooltip", labels.copy)
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'

  btn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    void navigator.clipboard.writeText(getMessageMarkdown(md))
    btn.classList.add("n8n-chat-copy-markdown-btn--done")
    window.setTimeout(() => {
      btn.classList.remove("n8n-chat-copy-markdown-btn--done")
    }, 1500)
  })

  return btn
}

function createResendButton(
  el: HTMLElement,
  md: HTMLElement,
  labels: BubbleActionLabels,
): HTMLButtonElement | null {
  if (!el.classList.contains("chat-message-from-user")) return null

  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "n8n-chat-message-action-btn n8n-chat-resend-markdown-btn"
  btn.setAttribute("aria-label", labels.resend)
  btn.setAttribute("data-tooltip", labels.resend)
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 2 4 20 3.8-7.6L18 11 3 2z"/></svg>'

  btn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()

    const root = el.closest(".n8n-chat")
    if (!root) return

    const input =
      root.querySelector<HTMLTextAreaElement>('[data-test-id="chat-input"]') ??
      root.querySelector<HTMLTextAreaElement>(".chat-input")
    if (!input) return

    input.focus()
    const nextMessage = getMessageMarkdown(md)
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set
    if (valueSetter) {
      valueSetter.call(input, nextMessage)
    } else {
      input.value = nextMessage
    }
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
    btn.classList.add("n8n-chat-resend-markdown-btn--done")
    window.setTimeout(() => {
      btn.classList.remove("n8n-chat-resend-markdown-btn--done")
    }, 1500)
  })

  return btn
}

function belowHostIsValid(host: HTMLElement): boolean {
  const prev = host.previousElementSibling
  if (!(prev instanceof HTMLElement)) return false
  if (host.classList.contains(USER_BELOW_ACTIONS_CLASS)) {
    return prev.classList.contains("chat-message-from-user")
  }
  if (host.classList.contains(BOT_BELOW_ACTIONS_CLASS)) {
    return prev.classList.contains("chat-message-from-bot")
  }
  return false
}

function removeOrphanBelowActionHosts(container: HTMLElement): void {
  for (const host of [
    ...container.querySelectorAll<HTMLElement>(
      `.${USER_BELOW_ACTIONS_CLASS}, .${BOT_BELOW_ACTIONS_CLASS}`,
    ),
  ]) {
    if (!belowHostIsValid(host)) {
      ;(host as HTMLElement & { __primeiqBelowRo?: ResizeObserver }).__primeiqBelowRo?.disconnect()
      host.remove()
    }
  }
}

/** Misma anchura en px que la burbuja para alinear la franja de acciones. */
function attachBelowActionsWidthSync(host: HTMLElement, messageEl: HTMLElement): void {
  const apply = () => {
    const w = Math.round(messageEl.getBoundingClientRect().width)
    if (w > 0) {
      host.style.width = `${w}px`
      host.style.boxSizing = "border-box"
    }
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(apply)
  })
  const ro = new ResizeObserver(apply)
  ro.observe(messageEl)
  ;(host as HTMLElement & { __primeiqBelowRo?: ResizeObserver }).__primeiqBelowRo = ro
}

function findBubbleMarkdownRoot(el: HTMLElement): HTMLElement | null {
  return (
    el.querySelector<HTMLElement>(`.n8n-copilot-assistant-md-host[${RAW_MARKDOWN_ATTR}]`) ??
    el.querySelector<HTMLElement>(`[${RAW_MARKDOWN_ATTR}]`) ??
    el.querySelector<HTMLElement>(".chat-message-markdown:not(.n8n-copilot-assistant-md-host)")
  )
}

function enhanceMessage(
  el: HTMLElement,
  labels: BubbleActionLabels,
  rawQueue?: RawQueueState,
) {
  if (el.getAttribute(ENHANCED_ATTR)) return
  const sem = el.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR)
  if (sem === "tool_call" || sem === "tool_result") return
  if (el.querySelector(".chat-message-markdown.n8n-chat-tool-log-message")) return
  const md = findBubbleMarkdownRoot(el)
  if (!md || (!md.innerHTML.trim() && !md.getAttribute(RAW_MARKDOWN_ATTR))) return

  attachRawMarkdownFromQueue(el, md, rawQueue)
  el.setAttribute(ENHANCED_ATTR, "1")

  const actions = document.createElement("div")
  actions.className = "n8n-chat-message-actions"
  actions.appendChild(createCopyButton(md, labels))
  const resendBtn = createResendButton(el, md, labels)
  if (resendBtn) actions.appendChild(resendBtn)

  if (el.classList.contains("chat-message-from-user")) {
    const host = document.createElement("div")
    host.className = USER_BELOW_ACTIONS_CLASS
    host.appendChild(actions)
    el.parentElement?.insertBefore(host, el.nextSibling)
    attachBelowActionsWidthSync(host, el)
  } else if (el.classList.contains("chat-message-from-bot")) {
    const host = document.createElement("div")
    host.className = BOT_BELOW_ACTIONS_CLASS
    host.appendChild(actions)
    el.parentElement?.insertBefore(host, el.nextSibling)
    attachBelowActionsWidthSync(host, el)
  } else {
    el.appendChild(actions)
  }
}

function scan(
  container: HTMLElement,
  labels: BubbleActionLabels,
  rawQueue?: RawQueueState,
) {
  removeOrphanBelowActionHosts(container)
  container
    .querySelectorAll<HTMLElement>(".chat-message:not(.chat-message-typing)")
    .forEach((el) => enhanceMessage(el, labels, rawQueue))
}

/**
 * Añade un botón "copiar" a cada burbuja con `.chat-message-markdown`.
 */
export function attachCopyMarkdownToBubbles(
  container: HTMLElement,
  options?: {
    labels?: Partial<BubbleActionLabels>
    rawMessageHistory?: BubbleMessage[]
  },
) {
  const labels: BubbleActionLabels = {
    copy: options?.labels?.copy ?? "Copiar mensaje",
    resend: options?.labels?.resend ?? "Reenviar mensaje",
  }
  const rawQueue = options?.rawMessageHistory?.length
    ? { messages: options.rawMessageHistory, nextIndex: 0 }
    : undefined
  let debounce: number | undefined

  const run = () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => scan(container, labels, rawQueue), 40)
  }

  run()
  const observer = new MutationObserver(run)
  observer.observe(container, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    window.clearTimeout(debounce)
    container
      .querySelectorAll<HTMLElement>(
        ".n8n-copilot-user-below-actions, .n8n-copilot-from-bot-below-actions",
      )
      .forEach((host) => {
        ;(host as HTMLElement & { __primeiqBelowRo?: ResizeObserver }).__primeiqBelowRo?.disconnect()
        host.remove()
      })
  }
}
