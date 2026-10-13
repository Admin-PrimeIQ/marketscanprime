"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { CircleStop, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAuth } from "@/context/AuthContext"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"
import { getSession } from "@/lib/auth/auth"

/**
 * Force-closes an active run.
 *
 * The button is hidden for non super admins, but that is only ergonomics — the
 * route handler rejects the request with 403 regardless of what the UI shows.
 */
export function StopRunButton({
  runId,
  onStopped,
  size = "sm",
}: {
  runId: string
  onStopped?: () => void
  size?: "sm" | "default"
}) {
  const t = useTranslations("sync")
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  if (!isStrapiSuperAdmin(user?.role)) return null

  const stop = async () => {
    setIsStopping(true)
    try {
      const token = getSession()?.token
      const res = await fetch(`/api/sync/runs/${encodeURIComponent(runId)}/release`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const json = await res.json().catch(() => null)

      // 409 means the run was already terminal — a normal race when someone acts
      // on a stale tab. Refreshing is the right answer, not a red error.
      if (res.status === 409) {
        toast.info(t("stopAlreadyFinished"))
        setOpen(false)
        onStopped?.()
        return
      }
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)

      toast.success(t("stopDone", { blocks: json?.releasedBlocks ?? 0 }))
      setOpen(false)
      onStopped?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStopping(false)
    }
  }

  return (
    <>
      <Button variant="destructive" size={size} onClick={() => setOpen(true)}>
        <CircleStop />
        {t("stop")}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("stopConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>{t("stopConfirmWhat")}</p>
                {/* Saying this plainly is the point: "stop" does not abort the
                    writes already in flight, and an operator who assumes it does
                    would fire a second writeback on top of them. */}
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-200">
                  {t("stopConfirmCaveat")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isStopping}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void stop()
              }}
              disabled={isStopping}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isStopping && <Loader2 className="animate-spin" />}
              {t("stopConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
