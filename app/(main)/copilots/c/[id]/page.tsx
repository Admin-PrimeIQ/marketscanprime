"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CopilotChatEmbed } from "@/components/copilots/copilot-chat-embed"
import { useCopilotContext } from "@/components/copilots/copilot-context"

export default function CopilotChatPage() {
  const params = useParams()
  const t = useTranslations("copilots")
  const { conversations } = useCopilotContext()

  const id =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : ""

  const title = useMemo(() => {
    return conversations.find((c) => c.id === id)?.title ?? t("newChat")
  }, [conversations, id, t])

  if (!id) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {t("invalidConversation")}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-2.5 px-3 sm:h-16 sm:px-4 md:px-6">
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight sm:text-lg">
            {title}
          </h1>
          <Button asChild type="button" variant="ghost" size="icon">
            <Link
              href="/copilots"
              aria-label={t("backToCopilotHome")}
              title={t("backToCopilotHome")}
            >
              <X className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </header>
      <CopilotChatEmbed sessionId={id} />
    </div>
  )
}
