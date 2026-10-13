"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, MessageSquare, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { useCopilotContext } from "@/components/copilots/copilot-context"

export default function CopilotsHomePage() {
  const t = useTranslations("copilots")
  const router = useRouter()
  const { register, conversations } = useCopilotContext()
  const [creating, setCreating] = useState(false)

  const startNew = async () => {
    setCreating(true)
    try {
      const id = await register()
      if (!id) return
      router.push(`/copilots/c/${id}`)
    } finally {
      setCreating(false)
    }
  }

  const openLatest = () => {
    const latest = conversations[0]
    if (latest) {
      router.push(`/copilots/c/${latest.id}`)
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-25"
        aria-hidden
      >
        <div className="absolute -left-1/4 top-0 h-[420px] w-[420px] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-[380px] w-[380px] rounded-full bg-chart-4/30 blur-3xl" />
      </div>

      <div className="relative z-[1] flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card shadow-lg">
          <Sparkles className="h-8 w-8 text-primary" aria-hidden />
        </div>
        <h1 className="max-w-lg text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {t("welcomeTitle")}
        </h1>
        <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("welcomeSubtitle")}
        </p>

        <ul className="mt-8 max-w-sm space-y-2 text-left text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {t("welcomeBullet1")}
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {t("welcomeBullet2")}
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {t("welcomeBullet3")}
          </li>
        </ul>
        <p className="mt-5 max-w-sm rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-left text-xs leading-relaxed text-muted-foreground">
          {t("welcomeBetaDisclaimer")}
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            size="lg"
            className="h-11 gap-2 rounded-xl px-6 text-base"
            onClick={() => void startNew()}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
            {t("startChat")}
          </Button>
          {conversations.length > 0 ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-11 gap-2 rounded-xl px-6 text-base"
              onClick={openLatest}
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              {t("resumeLatest")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
