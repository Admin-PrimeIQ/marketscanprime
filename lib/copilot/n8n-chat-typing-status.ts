const ENHANCED_ATTR = "data-n8n-typing-enhanced"

function hideCircles(body: HTMLElement): void {
  body
    .querySelectorAll<HTMLElement>(".chat-message-typing-circle")
    .forEach((el) => {
      // Inline style survives Vue's virtual-DOM patching of class attributes.
      el.style.setProperty("display", "none", "important")
      el.setAttribute("aria-hidden", "true")
    })
}

function ensureStatusSpan(body: HTMLElement, displayText: string): void {
  let status = body.querySelector<HTMLElement>(".n8n-chat-typing-status-text")
  if (!status) {
    status = document.createElement("span")
    status.className = "n8n-chat-typing-status-text"
    body.appendChild(status)
  }
  status.textContent = displayText
}

function enhanceTypingBody(body: HTMLElement, displayText: string): void {
  hideCircles(body)
  ensureStatusSpan(body, displayText)
  body.setAttribute(ENHANCED_ATTR, "1")
}

function scan(container: HTMLElement, displayText: string) {
  container
    .querySelectorAll<HTMLElement>(".chat-message-typing-body")
    .forEach((body) => enhanceTypingBody(body, displayText))
}

/**
 * Sustituye los tres puntos animados del paquete por una línea de texto (estilo Claude).
 *
 * Usa inline style en lugar de clase CSS para ocultar los círculos, de modo que
 * Vue no pueda restaurarlos al re-renderizar el componente de escritura.
 * El MutationObserver re-aplica el override sin debounce si Vue vuelve a pintar.
 */
export function attachTypingStatusLabel(
  container: HTMLElement,
  options?: { text?: string },
) {
  const displayText = options?.text ?? "Generando respuesta…"

  // Run immediately — catches any typing bubble already in the DOM.
  scan(container, displayText)

  const observer = new MutationObserver((mutations) => {
    // If any added node is (or contains) a typing body, enhance it immediately.
    let needsScan = false
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) {
          needsScan = true
          break
        }
      }
      if (needsScan) break
    }
    if (needsScan) scan(container, displayText)
  })

  observer.observe(container, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
  }
}
