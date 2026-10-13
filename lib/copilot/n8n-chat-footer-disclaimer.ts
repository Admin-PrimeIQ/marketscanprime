const DISCLAIMER_ATTR = "data-n8n-footer-disclaimer"

type AttachFooterDisclaimerOptions = {
  text: string
}

function ensureDisclaimer(container: HTMLElement, text: string) {
  const footers = container.querySelectorAll<HTMLElement>(".chat-footer")
  footers.forEach((footer) => {
    let note = footer.querySelector<HTMLElement>(".n8n-chat-footer-disclaimer")
    if (!note) {
      note = document.createElement("p")
      note.className = "n8n-chat-footer-disclaimer"
      note.setAttribute(DISCLAIMER_ATTR, "1")
    }

    // Support both real newlines and literal "\n" from i18n payloads.
    note.textContent = text.replace(/\\n/g, "\n")
    note.style.display = "block"
    note.style.textAlign = "center"
    note.style.fontSize = "var(--n8n-disclaimer-size, 0.66rem)"
    note.style.lineHeight = "1.25"
    note.style.letterSpacing = "0.015em"
    note.style.fontWeight = "400"
    note.style.color = "var(--n8n-disclaimer-color, #b6b6c2)"
    note.style.opacity = "var(--n8n-disclaimer-opacity, 0.82)"
    note.style.whiteSpace = "pre-line"
    note.style.margin = "0 auto"
    note.style.padding = "0 0.5rem"

    // Keep disclaimer inside chat-footer, right below the input bubble.
    const inputs = footer.querySelector<HTMLElement>(".chat-inputs")
    if (inputs) {
      if (note.previousElementSibling !== inputs) {
        inputs.insertAdjacentElement("afterend", note)
      }
      return
    }

    if (!footer.contains(note)) {
      footer.appendChild(note)
    }
  })
}

export function attachFooterDisclaimer(
  container: HTMLElement,
  options: AttachFooterDisclaimerOptions,
) {
  let debounce: number | undefined

  const run = () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => {
      ensureDisclaimer(container, options.text)
    }, 40)
  }

  run()
  const observer = new MutationObserver(run)
  observer.observe(container, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    window.clearTimeout(debounce)
  }
}
