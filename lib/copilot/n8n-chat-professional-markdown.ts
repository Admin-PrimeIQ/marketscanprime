/**
 * Enhances ALL n8n chat message bubbles (user + bot) with:
 * - Syntax highlighting via highlight.js
 * - Language badge + copy-code button on each code block
 * - Bare URL → clickable link conversion
 * - Image lightbox (click to expand full-screen)
 */

import { find as linkifyFind } from "linkifyjs"

import hljs, { COPILOT_HLJS_LANGUAGE_IDS } from "@/lib/copilot/n8n-chat-hljs"
import { openN8nChatImageLightbox } from "@/lib/copilot/n8n-chat-image-lightbox"
import { PRIMEIQ_MESSAGE_TYPE_ATTR } from "@/lib/copilot/n8n-chat-message-types"

// ── Constants ─────────────────────────────────────────────────────────────────

const IMG_ENHANCED_ATTR = "data-img-enhanced"
const TABLE_ENHANCED_ATTR = "data-n8n-table-enhanced"

/** Docusaurus / MDX-style `:::type` … `:::` blocks rendered as <aside> */
function sanitizeAdmonitionType(t: string): string {
  const s = t.replace(/[^a-zA-Z0-9_-]/g, "")
  return s || "note"
}

/**
 * Opening line: `:::type` or `:::type Título opcional` (rest of line = title).
 * Closing: paragraph that is only `:::`
 */
function parseAdmonitionOpenLine(line: string): { type: string; title: string } | null {
  const t = line.trim()
  const m = t.match(/^:::([\w-]+)(?:\s+(.*))?$/)
  if (!m) return null
  const type = m[1] ?? "note"
  const title = (m[2] ?? "").trim()
  return { type, title }
}

/**
 * Converts a leading `:::type` / `:::type title` paragraph, following nodes, and closing `:::`
 * paragraph into a single `.n8n-chat-admonition` (one call = one block).
 */
function materializeOneAdmonition(md: HTMLElement): boolean {
  const openEl = [...md.children].find((c) => {
    if (!(c instanceof HTMLParagraphElement)) return false
    return parseAdmonitionOpenLine(c.textContent?.trim() ?? "") !== null
  }) as HTMLParagraphElement | undefined
  if (!openEl) return false

  const parsed = parseAdmonitionOpenLine(openEl.textContent?.trim() ?? "")
  if (!parsed) return false
  const { type: rawType, title } = parsed
  const type = rawType ?? "note"
  const safeType = sanitizeAdmonitionType(type)
  const isDetails = safeType === "details"

  const body: HTMLElement[] = []
  let cur: Element | null = openEl.nextElementSibling
  let closeEl: HTMLParagraphElement | null = null
  while (cur) {
    if (
      cur instanceof HTMLParagraphElement &&
      /^:::\s*$/.test(cur.textContent?.trim() ?? "")
    ) {
      closeEl = cur
      break
    }
    if (cur instanceof HTMLElement) body.push(cur)
    cur = cur.nextElementSibling
  }
  if (!closeEl) return false

  const root: HTMLElement = isDetails ? document.createElement("details") : document.createElement("aside")
  root.className = `n8n-chat-admonition n8n-chat-admonition--${safeType}`
  root.dataset.admonitionType = type
  if (isDetails) {
    ;(root as HTMLDetailsElement).open = true
  }

  const inner = document.createElement("div")
  inner.className = "n8n-chat-admonition__inner"

  md.insertBefore(root, openEl)
  openEl.remove()
  closeEl.remove()

  if (title) {
    if (isDetails) {
      const summary = document.createElement("summary")
      summary.className = "n8n-chat-admonition__title n8n-chat-admonition__summary"
      summary.textContent = title
      root.appendChild(summary)
    } else {
      const titleEl = document.createElement("div")
      titleEl.className = "n8n-chat-admonition__title"
      titleEl.textContent = title
      inner.appendChild(titleEl)
    }
  } else if (isDetails) {
    const summary = document.createElement("summary")
    summary.className = "n8n-chat-admonition__title n8n-chat-admonition__summary"
    summary.textContent = "Detalles"
    root.appendChild(summary)
  }

  for (const b of body) inner.appendChild(b)
  root.appendChild(inner)
  return true
}

function materializeAdmonitions(md: HTMLElement): void {
  let guard = 0
  while (materializeOneAdmonition(md) && guard < 200) {
    guard += 1
  }
}

/** Nested `:::assistant` → `:::tip` etc. inside `.n8n-chat-admonition__inner` */
function materializeAdmonitionsDeep(md: HTMLElement): void {
  for (let r = 0; r < 30; r++) {
    materializeAdmonitions(md)
    for (const inner of md.querySelectorAll<HTMLElement>(".n8n-chat-admonition__inner")) {
      materializeAdmonitions(inner)
    }
  }
}

const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
const CHECK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
// ── Code blocks ───────────────────────────────────────────────────────────────

function decodeHtmlEntities(value: string): string {
  const textarea = document.createElement("textarea")
  textarea.innerHTML = value
  return textarea.value
}

function materializeLiteralPreCodeBlocks(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("p, div").forEach((el) => {
    if (el.querySelector("pre, code")) return
    const raw = el.textContent?.trim()
    if (!raw) return

    const decoded = decodeHtmlEntities(raw)
    const match = decoded.match(/^<pre><code>([\s\S]*?)<\/code><\/pre>$/i)
    if (!match) return

    const pre = document.createElement("pre")
    const code = document.createElement("code")
    code.textContent = decodeHtmlEntities(match[1] ?? "")
    pre.appendChild(code)
    el.replaceWith(pre)
  })
}

function enhanceCodeBlock(pre: HTMLElement): void {
  if (pre.closest(".n8n-chat-tool-log-message")) return
  if (pre.closest(".copilot-ui-blocks-in-chat")) return
  if (pre.hasAttribute("data-n8n-plain-code")) return
  // Primary guard: already wrapped in our container.
  if (pre.parentElement?.classList.contains("n8n-chat-code-block")) return

  let code = pre.querySelector<HTMLElement>("code")
  if (!code) {
    code = document.createElement("code")
    code.textContent = pre.textContent ?? ""
    pre.textContent = ""
    pre.appendChild(code)
  }

  // If the code block is still empty (streaming not started) skip and let
  // the observer retry once content arrives.
  if (!code.textContent?.trim()) return

  const langClass = [...code.classList].find((c) => c.startsWith("language-"))
  const langKey = langClass?.replace("language-", "") ?? ""
  const initialLanguage = langKey || "markdown"
  const sourceText = code.textContent ?? ""

  const applyHighlight = (language: string) => {
    code.className = ""
    code.textContent = sourceText

    if (language === "plaintext") return

    code.classList.add(`language-${language}`)
    try {
      hljs.highlightElement(code)
    } catch {
      /* unrecognised language — no-op */
    }
  }

  applyHighlight(initialLanguage)

  const wrapper = document.createElement("div")
  wrapper.className = "n8n-chat-code-block"
  pre.parentNode?.insertBefore(wrapper, pre)
  wrapper.appendChild(pre)

  const header = document.createElement("div")
  header.className = "n8n-chat-code-header"

  const controls = document.createElement("div")
  controls.className = "n8n-chat-code-controls"

  const langSelect = document.createElement("select")
  langSelect.className = "n8n-chat-code-lang-select"
  langSelect.setAttribute("aria-label", "Seleccionar lenguaje")
  for (const option of COPILOT_HLJS_LANGUAGE_IDS) {
    const opt = document.createElement("option")
    opt.value = option
    opt.textContent = option
    langSelect.appendChild(opt)
  }
  if ((COPILOT_HLJS_LANGUAGE_IDS as readonly string[]).includes(initialLanguage)) {
    langSelect.value = initialLanguage
  } else {
    langSelect.value = "markdown"
  }
  langSelect.addEventListener("change", () => {
    applyHighlight(langSelect.value)
  })
  controls.appendChild(langSelect)
  header.appendChild(controls)

  const copyBtn = document.createElement("button")
  copyBtn.type = "button"
  copyBtn.className = "n8n-chat-code-copy"
  copyBtn.setAttribute("aria-label", "Copiar código")
  copyBtn.innerHTML = `${COPY_ICON}<span>Copiar</span>`
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    const payload = (code?.textContent ?? "").trimEnd()
    void navigator.clipboard.writeText(payload).then(() => {
      copyBtn.innerHTML = `${CHECK_ICON}<span>Copiado</span>`
      copyBtn.classList.add("n8n-chat-code-copy--done")
      window.setTimeout(() => {
        copyBtn.innerHTML = `${COPY_ICON}<span>Copiar</span>`
        copyBtn.classList.remove("n8n-chat-code-copy--done")
      }, 1800)
    })
  })

  header.appendChild(copyBtn)
  wrapper.insertBefore(header, pre)
}

// ── URL linkification ──────────────────────────────────────────────────────────

/**
 * Walks text nodes and converts bare URLs to <a> elements.
 * Skips nodes inside <a>, <pre>, and <code> to avoid double-linking or
 * breaking code block content.
 */
function linkifyNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ""
    const matches = linkifyFind(text, "url")
    if (matches.length === 0) return

    const frag = document.createDocumentFragment()
    let lastIndex = 0

    for (const match of matches) {
      if (match.start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.start)))
      }
      const a = document.createElement("a")
      a.href = match.href
      a.textContent = match.value
      a.target = "_blank"
      a.rel = "noopener noreferrer"
      a.className = "n8n-chat-auto-link"
      frag.appendChild(a)
      lastIndex = match.end
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)))
    }

    node.parentNode?.replaceChild(frag, node)
    return
  }

  // Recurse into children, but skip elements where we must not modify content.
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === "a" || tag === "pre" || tag === "code" || tag === "script" || tag === "style") return
    // React UI blocks (:::code cabecera, :::email, etc.): linkify interpreta "archivo.js" como URL;
    // no tocar ese DOM (misma idea que enhanceTables con .copilot-ui-blocks-in-chat).
    if (el.classList.contains("copilot-ui-blocks-in-chat")) return
  }

  for (const child of [...node.childNodes]) {
    linkifyNode(child)
  }
}

function enhanceLinks(md: HTMLElement): void {
  // No element-level guard here — linkifyNode already skips <a> nodes,
  // so re-running on a partially-rendered streaming message is safe and necessary.
  linkifyNode(md)
}

function enhanceOneImage(img: HTMLImageElement): void {
  if (img.getAttribute(IMG_ENHANCED_ATTR)) return
  if (img.closest(".chat-message-typing")) return
  img.setAttribute(IMG_ENHANCED_ATTR, "1")
  img.setAttribute("title", "Click para ampliar")
  img.style.cursor = "zoom-in"
  console.log("[Copilot/Markdown] image enhanced — click listener attached", { src: img.src, alt: img.alt })
  img.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log("[Copilot/Markdown] image clicked", { src: img.src })
    openN8nChatImageLightbox(img.src, img.alt)
  })
}

function enhanceImages(md: HTMLElement): void {
  md.querySelectorAll<HTMLImageElement>("img").forEach(enhanceOneImage)
}

/**
 * Direct scan for un-enhanced images across the whole container.
 * Called immediately when the observer detects a new <img> node — does not
 * wait for the throttled debounce windows.
 */
function scanImages(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLImageElement>(
      `.chat-message-markdown img:not([${IMG_ENHANCED_ATTR}]), .n8n-copilot-assistant-md-host img:not([${IMG_ENHANCED_ATTR}])`,
    )
    .forEach(enhanceOneImage)
}

function enhanceTables(md: HTMLElement): void {
  md.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    if (table.closest(".copilot-ui-blocks-in-chat")) return
    if (table.getAttribute(TABLE_ENHANCED_ATTR)) return
    if (table.parentElement?.classList.contains("n8n-chat-table-scroll")) {
      table.setAttribute(TABLE_ENHANCED_ATTR, "1")
      return
    }

    const wrapper = document.createElement("div")
    wrapper.className = "n8n-chat-table-scroll"
    table.parentNode?.insertBefore(wrapper, table)
    wrapper.appendChild(table)
    table.setAttribute(TABLE_ENHANCED_ATTR, "1")
  })
}

// ── Per-message enhancement ────────────────────────────────────────────────────

function enhanceMessage(el: HTMLElement): void {
  if (el.querySelector(".chat-message-markdown.n8n-chat-tool-log-message")) return
  const sem = el.getAttribute(PRIMEIQ_MESSAGE_TYPE_ATTR)
  if (sem === "tool_call" || sem === "tool_result") return

  const reactHost = el.querySelector<HTMLElement>(".n8n-copilot-assistant-md-host")
  const vueMd =
    el.querySelector<HTMLElement>(".chat-message-markdown:not(.n8n-copilot-assistant-md-host)") ?? null

  if (reactHost) {
    materializeLiteralPreCodeBlocks(reactHost)
  } else if (vueMd) {
    materializeLiteralPreCodeBlocks(vueMd)
    materializeAdmonitionsDeep(vueMd)
  }

  // Code highlighting — applies to both user and bot messages.
  el.querySelectorAll<HTMLElement>("pre").forEach(enhanceCodeBlock)

  const proseRoot = reactHost ?? vueMd ?? el
  enhanceTables(proseRoot)
  enhanceLinks(proseRoot)
  enhanceImages(proseRoot)
}

function scan(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLElement>(".chat-message:not(.chat-message-typing)")
    .forEach(enhanceMessage)
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface ProfessionalMarkdownHandle {
  /** Remove the observer and clean up all timers. */
  detach: () => void
  /**
   * Run a full enhancement pass immediately.
   * Call this from n8n chat event hooks (afterMessageSent, beforeMessageSent)
   * so enhancements fire at precise lifecycle moments without relying only on
   * the MutationObserver timers.
   */
  triggerScan: () => void
}

export function attachProfessionalMarkdownToBubbles(
  container: HTMLElement,
): ProfessionalMarkdownHandle {
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
    set(window.setTimeout(() => { set(undefined); scan(container) }, ms))
  }

  // Throttled observer passes — handle characterData streaming updates.
  const scheduleAll = () => {
    schedule(40, "near")
    schedule(180, "a")
    schedule(420, "b")
  }

  /**
   * Immediate full pass: waits one rAF so Vue has committed its reactive
   * DOM updates before we read the tree.
   */
  const triggerScan = () => {
    console.log("[Copilot/Markdown] triggerScan called — scheduling rAF pass")
    requestAnimationFrame(() => {
      const before = {
        messages: container.querySelectorAll(".chat-message").length,
        images: container.querySelectorAll(`img[${IMG_ENHANCED_ATTR}]`).length,
        pendingImgs: container.querySelectorAll(`img:not([${IMG_ENHANCED_ATTR}])`).length,
      }
      scan(container)
      scanImages(container)
      console.log("[Copilot/Markdown] triggerScan rAF pass done", before)
    })
  }

  // Initial passes — covers history messages already in DOM at mount time.
  triggerScan()
  scheduleAll()

  // Delegated click handler: guarantees lightbox works even when images are
  // re-rendered dynamically and per-image listeners are lost/replaced.
  const onContainerClick = (event: Event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const img = target.closest("img")
    if (!(img instanceof HTMLImageElement)) return
    if (!img.closest(".chat-message-markdown") && !img.closest(".n8n-copilot-assistant-md-host"))
      return
    if (img.closest(".chat-message-typing")) return

    event.preventDefault()
    event.stopPropagation()
    console.log("[Copilot/Markdown] delegated image click", { src: img.src })
    openN8nChatImageLightbox(img.currentSrc || img.src, img.alt)
  }
  container.addEventListener("click", onContainerClick, true)

  const observer = new MutationObserver((mutations) => {
    let hasPre = false
    let hasImg = false

    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        if (!hasPre && (node.tagName === "PRE" || node.querySelector("pre"))) hasPre = true
        if (!hasImg && (node.tagName === "IMG" || node.querySelector("img"))) hasImg = true
        if (hasPre && hasImg) break
      }
      if (hasPre && hasImg) break
    }

    if (hasPre) {
      console.log("[Copilot/Markdown] observer fast-path: <pre> detected → scan()")
      scan(container)
    }
    if (hasImg) {
      console.log("[Copilot/Markdown] observer fast-path: <img> detected → scanImages()")
      scanImages(container)
    }
    scheduleAll()
  })

  observer.observe(container, { childList: true, subtree: true, characterData: true })

  return {
    detach: () => {
      container.removeEventListener("click", onContainerClick, true)
      observer.disconnect()
      window.clearTimeout(nearPass)
      window.clearTimeout(latePassA)
      window.clearTimeout(latePassB)
    },
    triggerScan,
  }
}
