"use client"

import { useEffect, useMemo, useRef } from "react"
import { useTranslations } from "next-intl"
import {
  COPILOT_N8N_CHAT_ALLOWED_FILE_MIME_TYPES,
  getCopilotN8nChatProxyWebhookUrl,
} from "@/lib/copilot/constants"
import { fetchChatHistory } from "@/lib/copilot/n8n-load-history"
import { attachCopyMarkdownToBubbles } from "@/lib/copilot/n8n-chat-copy-markdown"
import { attachFooterDisclaimer } from "@/lib/copilot/n8n-chat-footer-disclaimer"
import { attachHideEmptyHeader } from "@/lib/copilot/n8n-chat-hide-empty-header"
import { attachAssistantReactMarkdownBubbles } from "@/lib/copilot/n8n-chat-assistant-react-markdown-bridge"
import { attachProfessionalMarkdownToBubbles } from "@/lib/copilot/n8n-chat-professional-markdown"
import { attachMessageSemantics } from "@/lib/copilot/n8n-chat-message-semantics"
import { attachToolLogs } from "@/lib/copilot/n8n-chat-tool-logs"
import { attachComposerFileTypeIcons } from "@/lib/copilot/n8n-chat-composer-file-icons"
import { attachTypingStatusLabel } from "@/lib/copilot/n8n-chat-typing-status"
import { scheduleResetN8nChatComposerHeight } from "@/lib/copilot/n8n-chat-reset-composer-height"
import {
  buildCopilotWelcomeMessage,
  type CopilotWelcomeButton,
} from "@/lib/copilot/copilot-welcome-initial-message"
import { useAuth } from "@/context/AuthContext"
import { cn } from "@/lib/utils"

type CopilotChatEmbedProps = {
  sessionId: string
  /** Incrementar para forzar re-mount del widget (ej. al cambiar de sesión en la misma ruta). */
  mountKey?: number
  className?: string
}

/**
 * Monta @n8n/chat en modo fullscreen con:
 * - Historial cargado desde n8n antes de mostrar el widget
 * - Acciones por burbuja: copiar y reenviar (en mensajes del usuario)
 * - Indicador de escritura estilo Claude ("Generando respuesta…")
 * - Streaming + subida de archivos (multimedia, PDF, hojas de cálculo, documentos, etc.)
 */
export function CopilotChatEmbed({
  sessionId,
  mountKey = 0,
  className,
}: CopilotChatEmbedProps) {
  const { user } = useAuth()
  const tEmbed = useTranslations("copilots.embed")
  const hostRef = useRef<HTMLDivElement>(null)
  const userDisplayName = (user?.username || user?.email || "").trim()
  const userAvatarSeed = (user?.email || user?.username || userDisplayName || "user").trim()
  const assistantBubbleName = tEmbed("bubbleAssistantName")
  const embedGetStarted = tEmbed("getStarted")
  const embedInputPlaceholder = tEmbed("inputPlaceholder")
  const embedCloseTooltip = tEmbed("closeButtonTooltip")
  const embedRepostButton = tEmbed("repostButton")
  const embedReuseButton = tEmbed("reuseButton")
  const embedCopyTooltip = tEmbed("copyButtonTooltip")
  const embedResendTooltip = tEmbed("resendButtonTooltip")
  const embedDisclaimer = tEmbed("disclaimer")
  const embedTypingStatus = tEmbed("typingStatus")

  const welcomeInitialMessage = useMemo(() => {
    const buttons: CopilotWelcomeButton[] = [
      { label: tEmbed("welcomeBtnSecondaryMarket"), variant: "primary" },
      { label: tEmbed("welcomeBtnPrimaryMarket"), variant: "secondary" },
      { label: tEmbed("welcomeBtnWebProperties"), variant: "ghost" },
      { label: tEmbed("welcomeBtnDocuments"), variant: "secondary" },
      { label: tEmbed("welcomeBtnDraftEmail"), variant: "link" },
    ]
    return buildCopilotWelcomeMessage({
      lead: tEmbed("welcomeLead"),
      quote: tEmbed("welcomeQuote"),
      scopeListMarkdown: tEmbed("welcomeScopeList"),
      tip: tEmbed("welcomeTip"),
      freeFormNote: tEmbed("welcomeFreeFormNote"),
      footer: tEmbed("welcomeFooter"),
      buttons,
    })
  }, [tEmbed])

  useEffect(() => {
    if (!hostRef.current) return

    let vueApp: { unmount: () => void } | null = null
    let cancelled = false
    let detachCopy: (() => void) | undefined
    let detachDisclaimer: (() => void) | undefined
    let detachHideHeader: (() => void) | undefined
    let detachMessageSemantics: (() => void) | undefined
    let detachToolLogs: (() => void) | undefined
    let detachAssistantReactMarkdown: (() => void) | undefined
    let detachProfessionalMarkdown: (() => void) | undefined
    let detachTyping: (() => void) | undefined
    let detachComposerFileIcons: (() => void) | undefined

    // Shared trigger — runs remark/React assistant host + DOM markdown enhancements.
    let triggerMarkdownScan: (() => void) | null = null

    const webhookUrl = getCopilotN8nChatProxyWebhookUrl()

    void (async () => {
      // Cargar historial antes de montar el widget
      let messageHistory: Awaited<ReturnType<typeof fetchChatHistory>> = []
      try {
        messageHistory = await fetchChatHistory(webhookUrl, sessionId)
      } catch {
        /* red / CORS — el widget arranca sin historial */
      }

      if (cancelled || !hostRef.current) return

      hostRef.current.innerHTML = ""

      try {
        const { createChat } = await import("@n8n/chat")
        if (cancelled || !hostRef.current) return

        const initialMessages = [welcomeInitialMessage]
        const welcomeBubbleCount = initialMessages.length

        vueApp = createChat({
          webhookUrl,
          target: hostRef.current,
          mode: "fullscreen",
          showWelcomeScreen: false,
          loadPreviousSession: false,
          enableStreaming: true,
          allowFileUploads: true,
          allowedFilesMimeTypes: COPILOT_N8N_CHAT_ALLOWED_FILE_MIME_TYPES,
          sessionId,
          messageHistory,
          initialMessages,
          defaultLanguage: "en",
          i18n: {
            en: {
              title: "",
              subtitle: "",
              footer: "",
              getStarted: embedGetStarted,
              inputPlaceholder: embedInputPlaceholder,
              closeButtonTooltip: embedCloseTooltip,
              repostButton: embedRepostButton,
              reuseButton: embedReuseButton,
            },
          },
          // ── Lifecycle hooks ──────────────────────────────────────────────
          beforeMessageSent: (message) => {
            console.log("[Copilot] beforeMessageSent", { message, hasTrigger: !!triggerMarkdownScan })
            triggerMarkdownScan?.()
            scheduleResetN8nChatComposerHeight(hostRef.current)
          },
          afterMessageSent: (message, response) => {
            console.log("[Copilot] afterMessageSent", { message, response, hasTrigger: !!triggerMarkdownScan })
            triggerMarkdownScan?.()
            scheduleResetN8nChatComposerHeight(hostRef.current)
          },
        })

        const root = hostRef.current
        if (root) {
          detachMessageSemantics = attachMessageSemantics(root, {
            history: messageHistory,
            welcomeBubbleCount,
          })
          detachCopy = attachCopyMarkdownToBubbles(root, {
            labels: {
              copy: embedCopyTooltip,
              resend: embedResendTooltip,
            },
            rawMessageHistory: messageHistory.map(({ sender, text }) => ({
              sender,
              text,
            })),
          })
          detachDisclaimer = attachFooterDisclaimer(root, {
            text: embedDisclaimer,
          })
          detachHideHeader = attachHideEmptyHeader(root)
          detachToolLogs = attachToolLogs(root)
          const reactMdHandle = attachAssistantReactMarkdownBubbles(root, {
            assistantDisplayName: assistantBubbleName,
            ...(userDisplayName
              ? { userDisplayName, userAvatarSeed }
              : {}),
          })
          detachAssistantReactMarkdown = reactMdHandle.detach
          const mdHandle = attachProfessionalMarkdownToBubbles(root)
          detachProfessionalMarkdown = mdHandle.detach
          triggerMarkdownScan = () => {
            reactMdHandle.triggerScan()
            mdHandle.triggerScan()
          }
          console.log("[Copilot] attachProfessionalMarkdownToBubbles mounted", { sessionId })
          detachTyping = attachTypingStatusLabel(root, {
            text: embedTypingStatus,
          })
          detachComposerFileIcons = attachComposerFileTypeIcons(root)
        }
      } catch (err) {
        console.error("[CopilotChatEmbed] createChat failed:", err)
      }
    })()

    return () => {
      cancelled = true
      detachCopy?.()
      detachDisclaimer?.()
      detachHideHeader?.()
      detachMessageSemantics?.()
      detachToolLogs?.()
      detachAssistantReactMarkdown?.()
      detachProfessionalMarkdown?.()
      detachTyping?.()
      detachComposerFileIcons?.()
      vueApp?.unmount()
      vueApp = null
      if (hostRef.current) {
        hostRef.current.innerHTML = ""
      }
    }
  }, [
    sessionId,
    mountKey,
    embedGetStarted,
    embedInputPlaceholder,
    embedCloseTooltip,
    embedRepostButton,
    embedReuseButton,
    embedCopyTooltip,
    embedResendTooltip,
    embedDisclaimer,
    embedTypingStatus,
    assistantBubbleName,
    userDisplayName,
    userAvatarSeed,
    welcomeInitialMessage,
  ])

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      <div
        ref={hostRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      />
    </div>
  )
}
