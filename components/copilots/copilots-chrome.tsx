"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Home,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  PanelLeft,
  Sparkles,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { CopilotConversationList } from "@/components/copilots/copilot-conversation-list"
import { CopilotProvider } from "@/components/copilots/copilot-context"
import { useCopilotContext } from "@/components/copilots/copilot-context"

function CopilotsChromeInner({ children }: { children: React.ReactNode }) {
  const t = useTranslations("copilots")
  const router = useRouter()
  const { register } = useCopilotContext()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const [creatingCollapsed, setCreatingCollapsed] = useState(false)

  const handleCollapsedNewChat = async () => {
    setCreatingCollapsed(true)
    try {
      const id = await register()
      if (!id) return
      router.push(`/copilots/c/${id}`)
    } finally {
      setCreatingCollapsed(false)
    }
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col sm:h-[calc(100dvh-4rem)]">
      <div className="flex min-h-0 flex-1">
        {desktopCollapsed ? (
          <aside className="hidden w-12 shrink-0 border-r border-sidebar-border md:flex md:flex-col">
            <div className="flex h-14 items-center justify-center border-b border-sidebar-border sm:h-16">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t("openConversations")}
                title={t("openConversations")}
                onClick={() => setDesktopCollapsed(false)}
              >
                <PanelLeft className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center gap-2 p-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("newConversation")}
                title={t("newConversation")}
                onClick={() => void handleCollapsedNewChat()}
                disabled={creatingCollapsed}
              >
                {creatingCollapsed ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <MessageSquarePlus className="h-4 w-4" aria-hidden />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("previousChats")}
                title={t("previousChats")}
                onClick={() => setDesktopCollapsed(false)}
              >
                <MessageSquare className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="shrink-0 border-t border-border p-3 px-2">
              <Link
                href="/copilots"
                aria-label={t("backToCopilotHome")}
                title={t("backToCopilotHome")}
                className="flex items-center justify-center gap-3 rounded-lg px-3 py-[calc(var(--spacing)*1.5)] text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Home className="h-6 w-6 shrink-0" aria-hidden />
              </Link>
            </div>
          </aside>
        ) : (
          <aside className="hidden w-[min(100%,288px)] shrink-0 border-r border-sidebar-border md:flex md:flex-col">
            <CopilotConversationList
              onCollapseSidebar={() => setDesktopCollapsed(true)}
            />
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={t("openConversations")}
                >
                  <PanelLeft className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(100vw,320px)] p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>{t("conversationsTitle")}</SheetTitle>
                </SheetHeader>
                <CopilotConversationList onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate text-sm font-semibold">{t("productName")}</span>
            </div>
          </div>

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              desktopCollapsed && "md:pb-14",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CopilotsChrome({ children }: { children: React.ReactNode }) {
  return (
    <CopilotProvider>
      <CopilotsChromeInner>{children}</CopilotsChromeInner>
    </CopilotProvider>
  )
}
