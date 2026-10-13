/**
 * Replica el autosize de @n8n/chat (Input.vue `l9`): el textarea fija `height` en px
 * según scrollHeight. Al enviar, el valor se limpia pero ese handler no siempre corre
 * de inmediato (p. ej. envío con botón, o Enter donde `l9` va después del await largo).
 */
const N8N_TEXTAREA_MAX_PX = 480

function getChatTextArea(root: HTMLElement): HTMLTextAreaElement | null {
  return (
    root.querySelector<HTMLTextAreaElement>('[data-test-id="chat-input"]') ??
    root.querySelector<HTMLTextAreaElement>("textarea.chat-input")
  )
}

export function resetN8nChatComposerHeight(root: HTMLElement | null): void {
  if (!root) return
  const el = getChatTextArea(root)
  if (!el) return
  el.style.height = "var(--chat--textarea--height)"
  const h = Math.min(el.scrollHeight, N8N_TEXTAREA_MAX_PX)
  el.style.height = `${h}px`
}

/** Ejecuta el reset tras el flush de layout / Vue (mismo patrón que otros parches del embed). */
export function scheduleResetN8nChatComposerHeight(root: HTMLElement | null): void {
  if (!root) return
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      resetN8nChatComposerHeight(root)
      requestAnimationFrame(() => resetN8nChatComposerHeight(root))
    })
  })
}
