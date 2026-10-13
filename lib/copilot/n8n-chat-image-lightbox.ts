/**
 * Shared image lightbox for copilot markdown (Vue / n8n DOM and React assistant host).
 */

let lightboxOverlay: HTMLElement | null = null
let lightboxImgEl: HTMLImageElement | null = null

function getLightbox(): { overlay: HTMLElement; img: HTMLImageElement; close: () => void } {
  if (lightboxOverlay && lightboxImgEl) {
    const overlay = lightboxOverlay
    const img = lightboxImgEl
    const close = () => {
      overlay.classList.remove("n8n-chat-lightbox--open")
      document.body.style.overflow = ""
    }
    return { overlay, img, close }
  }

  const overlay = document.createElement("div")
  overlay.className = "n8n-chat-lightbox"
  overlay.setAttribute("role", "dialog")
  overlay.setAttribute("aria-modal", "true")
  overlay.setAttribute("aria-label", "Vista de imagen")

  const img = document.createElement("img")
  img.className = "n8n-chat-lightbox-img"
  img.alt = ""
  overlay.appendChild(img)

  const closeBtn = document.createElement("button")
  closeBtn.className = "n8n-chat-lightbox-close"
  closeBtn.type = "button"
  closeBtn.setAttribute("aria-label", "Cerrar")
  closeBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  overlay.appendChild(closeBtn)

  const close = () => {
    overlay.classList.remove("n8n-chat-lightbox--open")
    document.body.style.overflow = ""
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close()
  })
  closeBtn.addEventListener("click", close)

  document.body.appendChild(overlay)
  lightboxOverlay = overlay
  lightboxImgEl = img
  return { overlay, img, close }
}

export function openN8nChatImageLightbox(src: string, alt: string): void {
  const { overlay, img, close } = getLightbox()
  img.src = src
  img.alt = alt
  overlay.classList.add("n8n-chat-lightbox--open")
  document.body.style.overflow = "hidden"

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close()
      document.removeEventListener("keydown", onKey)
    }
  }
  document.addEventListener("keydown", onKey)
}
