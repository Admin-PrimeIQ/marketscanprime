const EMPTY_HEADER_ATTR = "data-n8n-empty-header-hidden"

function hasVisibleText(el: HTMLElement): boolean {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().length > 0
}

function scan(container: HTMLElement): void {
  const header = container.querySelector<HTMLElement>(".chat-layout .chat-header")
  if (!header) return

  if (!hasVisibleText(header)) {
    header.style.setProperty("display", "none", "important")
    header.style.setProperty("border-bottom", "none", "important")
    header.setAttribute(EMPTY_HEADER_ATTR, "1")
    return
  }

  if (header.getAttribute(EMPTY_HEADER_ATTR) === "1") {
    header.style.removeProperty("display")
    header.style.removeProperty("border-bottom")
    header.removeAttribute(EMPTY_HEADER_ATTR)
  }
}

/**
 * Hides chat header when it has no visible text content.
 * Useful when title/subtitle are intentionally empty.
 */
export function attachHideEmptyHeader(container: HTMLElement) {
  let debounce: number | undefined

  const run = () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => scan(container), 30)
  }

  run()
  const observer = new MutationObserver(run)
  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  return () => {
    observer.disconnect()
    window.clearTimeout(debounce)
  }
}
