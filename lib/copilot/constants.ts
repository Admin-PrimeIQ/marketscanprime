/**
 * n8n Chat Trigger (Embedded chat) registers POST at …/webhook/<id>/chat — not …/webhook/<id> alone.
 * @n8n/chat still uses POST (same as the CDN example); “embed” means the UI mounts in your app, not an iframe.
 *
 * Browser → `/api/copilot/n8n-chat` (proxy). Server → upstream below. Override: N8N_CHAT_WEBHOOK_UPSTREAM_URL
 * or NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL (must include `/chat` when using production Chat Trigger URL).
 */
export const COPILOT_N8N_WEBHOOK_DEFAULT =
  "https://n8n.primeiqlatam.com/webhook/506f62e4-284a-4d21-b20a-877944adfe1e/chat"

/** Appends `/chat` when the URL looks like a bare n8n webhook path (copy-paste from the node often omits it). */
export function normalizeN8nChatWebhookUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, "")
  if (!u) return u
  if (/\/chat$/i.test(u)) return u
  if (/\/webhook\/[^/?#]+$/i.test(u)) return `${u}/chat`
  return u
}

/** Public/env URL used as the proxy upstream (and default when no server-only override). */
export function getCopilotN8nWebhookUrl(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL?.trim()
      : ""
  const raw = fromEnv || COPILOT_N8N_WEBHOOK_DEFAULT
  return normalizeN8nChatWebhookUrl(raw)
}

/** Target n8n webhook for the API proxy (server-side only). */
export function getCopilotN8nUpstreamWebhookUrl(): string {
  const serverOnly =
    typeof process !== "undefined"
      ? process.env.N8N_CHAT_WEBHOOK_UPSTREAM_URL?.trim()
      : ""
  if (serverOnly) return normalizeN8nChatWebhookUrl(serverOnly)
  return getCopilotN8nWebhookUrl()
}

/** Absolute URL the @n8n/chat client should call (our proxy). Use only in the browser. */
export function getCopilotN8nChatProxyWebhookUrl(): string {
  if (typeof window === "undefined") {
    return "/api/copilot/n8n-chat"
  }
  return new URL("/api/copilot/n8n-chat", window.location.origin).toString()
}

/** Enable streaming UI when the Chat Trigger uses streaming response mode */
export function isCopilotN8nStreamingEnabled(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_N8N_CHAT_STREAMING === "true"
  )
}

/**
 * When true, the widget calls the webhook with action loadPreviousSession before showing the composer.
 * If that request fails (404/CORS/wrong URL), @n8n/chat never sets sessionId and the message input stays hidden.
 * Default is false so the composer always appears; set NEXT_PUBLIC_N8N_CHAT_LOAD_PREVIOUS_SESSION=true when
 * your Chat Trigger correctly implements loadPreviousSession.
 */
export function isCopilotChatLoadPreviousSessionEnabled(): boolean {
  if (typeof process === "undefined") return false
  return process.env.NEXT_PUBLIC_N8N_CHAT_LOAD_PREVIOUS_SESSION === "true"
}

/**
 * Valor para `allowedFilesMimeTypes` de @n8n/chat (lista separada por comas).
 * Incluye multimedia y documentos habituales (PDF, Excel, Word, PowerPoint, CSV, ODF, texto).
 */
export const COPILOT_N8N_CHAT_ALLOWED_FILE_MIME_TYPES = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "text/plain",
].join(",")
