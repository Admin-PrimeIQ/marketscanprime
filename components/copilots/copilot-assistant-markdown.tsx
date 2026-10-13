"use client"

import { memo, useMemo } from "react"
import { Sparkles } from "lucide-react"

import { NotionAvatarComponent } from "@/components/notion-avatar"
import { UIBlocksRenderer } from "@/components/copilots/ui-blocks-renderer"
import { normalizeBlocks, parseMarkdownToBlocks } from "@/lib/copilot/ui-blocks-engine"
import { preprocessAgentCompactUIBlocks } from "@/lib/copilot/preprocess-agent-compact-ui-blocks"
import { preprocessCopilotDirectiveTitles } from "@/lib/copilot/preprocess-copilot-directive-titles"

/** Nick tipo @local si parece email; si ya lleva @, se respeta. */
function formatUserMention(label: string): string {
  const t = label.trim()
  if (!t) return "@user"
  if (t.startsWith("@")) return t
  const at = t.indexOf("@")
  if (at > 0 && at < t.length - 1 && !/\s/.test(t)) {
    return `@${t.slice(0, at)}`
  }
  return `@${t}`
}

/**
 * Indicador visual del asistente: se monta **fuera** de `.chat-message` (hermano previo),
 * vía `n8n-chat-assistant-react-markdown-bridge`.
 */
function CopilotAssistantAboveBubbleImpl({ assistantDisplayName }: { assistantDisplayName: string }) {
  const mention = "@copilot"
  const title = assistantDisplayName.trim() || "Copilot"
  return (
    <div
      className="copilot-assistant-above-root flex w-full min-w-0 items-center justify-start gap-2"
      role="group"
      aria-label={mention}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground ring-1 ring-border/80 dark:bg-muted/50"
        title={title}
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 truncate font-mono text-xs font-semibold tracking-tight text-foreground">{mention}</span>
    </div>
  )
}

export const CopilotAssistantAboveBubble = memo(CopilotAssistantAboveBubbleImpl)

function CopilotUserAboveBubbleImpl({
  displayName,
  avatarSeed,
}: {
  displayName: string
  avatarSeed: string
}) {
  const mention = formatUserMention(displayName)
  return (
    <div
      className="copilot-user-above-root flex w-full min-w-0 items-center justify-end gap-2.5"
      role="group"
      aria-label={mention}
    >
      <span className="min-w-0 truncate text-right font-mono text-xs font-semibold tracking-tight text-foreground max-w-[min(100%,14rem)]">
        {mention}
      </span>
      <NotionAvatarComponent
        seed={avatarSeed}
        size={28}
        shape="circle"
        bgColor="f7f6f3"
        random={false}
        className="shrink-0 ring-1 ring-border/80"
      />
    </div>
  )
}

export const CopilotUserAboveBubble = memo(CopilotUserAboveBubbleImpl)

/**
 * Markdown del asistente: mismo pipeline que el demo `/copilots/ui-blocks-demo`
 * (`parseMarkdownToBlocks` + `UIBlocksRenderer`), incl. tablas `headers:`/`rows:`,
 * `:::success` / `:::warning`, botones con `label:`, etc.
 */
function CopilotAssistantMarkdownImpl({
  source,
  uiBlocksActionsEnabled = true,
}: {
  source: string
  /** Solo la última burbuja del asistente con React debe tener botones activos (evita clics viejos). */
  uiBlocksActionsEnabled?: boolean
}) {
  const blocks = useMemo(() => {
    const normalized = preprocessAgentCompactUIBlocks(preprocessCopilotDirectiveTitles(source))
    return normalizeBlocks(parseMarkdownToBlocks(normalized))
  }, [source])

  return (
    <div className="copilot-assistant-md-root min-w-0 w-full max-w-full space-y-3">
      <UIBlocksRenderer
        blocks={blocks}
        className="copilot-ui-blocks-in-chat"
        renderTextAsMarkdown
        actionsEnabled={uiBlocksActionsEnabled}
      />
    </div>
  )
}

/** Evita re-renders cuando el bridge de n8n llama `root.render` con el mismo `source`. */
export const CopilotAssistantMarkdown = memo(CopilotAssistantMarkdownImpl)
