"use client"

import { useParams, useRouter } from "next/navigation"
import { Check, History } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCopilotContext } from "@/components/copilots/copilot-context"
import { cn } from "@/lib/utils"

type CopilotSidebarConversationPickerProps = {
  onNavigate?: () => void
}

/**
 * Quick jump between conversations + n8n session ids — lives inside the sidebar only.
 */
export function CopilotSidebarConversationPicker({
  onNavigate,
}: CopilotSidebarConversationPickerProps) {
  const t = useTranslations("copilots")
  const router = useRouter()
  const params = useParams()
  const { conversations } = useCopilotContext()

  const currentId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : ""

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-9 w-full justify-center gap-2 rounded-lg border-sidebar-border bg-background/80 text-xs font-medium text-sidebar-foreground shadow-none hover:bg-sidebar-accent/60"
        >
          <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("previousChats")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[min(calc(100vw-2rem),17rem)] max-h-[min(320px,70dvh)] overflow-y-auto"
      >
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {t("recentConversations")}
        </DropdownMenuLabel>
        {conversations.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {t("noConversationsYet")}
          </p>
        ) : (
          conversations.map((c) => {
            const active = c.id === currentId
            return (
              <DropdownMenuItem
                key={c.id}
                className={cn("gap-2", active && "bg-accent")}
                onSelect={() => {
                  if (!active) {
                    router.push(`/copilots/c/${c.id}`)
                    onNavigate?.()
                  }
                }}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0 text-primary",
                    !active && "invisible"
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
              </DropdownMenuItem>
            )
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            router.push("/copilots")
            onNavigate?.()
          }}
        >
          {t("backToCopilotHome")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
