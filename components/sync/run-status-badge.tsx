"use client"

import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

/**
 * A run's state carries operational meaning, so colour is not decoration here:
 * amber means work is still in flight, green means it closed clean, red means
 * someone has to look. `completed_with_skips` is deliberately amber and not
 * green — it finished, but blocks were skipped or failed, and that must not
 * read as success at a glance.
 */
const RUN_TONE: Record<string, string> = {
  resolving: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  running: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  completed_with_skips: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  // Gris, no rojo: alguien la detuvo a propósito. Compartir el rojo de `failed`
  // era exactamente lo que hacía leer un stop como una falla de SQL.
  aborted: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

/** Per-block statuses reuse the same vocabulary. */
const BLOCK_TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: RUN_TONE.running,
  done: RUN_TONE.completed,
  failed: RUN_TONE.failed,
  skipped_ambiguous: RUN_TONE.completed_with_skips,
  failed_sanity: RUN_TONE.completed_with_skips,
  stopped: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

/**
 * Textos que el release escribe al detener una corrida a mano.
 *
 * Detener y fallar se guardaban igual, como 'failed'. La corrida ya pasa a
 * 'aborted', pero los BLOQUES no pueden: el CHECK de sync_run_blocks no lo
 * admite. Y las corridas detenidas ANTES de ese cambio siguen guardadas como
 * 'failed'. Reconocer el centinela cubre los dos casos sin migrar nada ni
 * reescribir historia.
 *
 * Fijados en el arnés de n8n: si el SQL cambia el texto, el test falla.
 */
const STOPPED_SENTINEL = { run: "manually released", block: "run manually released" } as const

/** Traduce un 'failed' que en realidad fue una parada manual. */
function resolveStatus(status: string, error: string | null | undefined, variant: "run" | "block") {
  if (status !== "failed" || !error) return status
  if (variant === "run" && error === STOPPED_SENTINEL.run) return "aborted"
  if (variant === "block" && error === STOPPED_SENTINEL.block) return "stopped"
  return status
}

export function isStoppedError(error: string | null | undefined) {
  return error === STOPPED_SENTINEL.run || error === STOPPED_SENTINEL.block
}

const RUN_STATUSES = new Set(Object.keys(RUN_TONE))
const BLOCK_STATUSES = new Set(Object.keys(BLOCK_TONE))

export function RunStatusBadge({
  status: rawStatus,
  error,
  variant = "run",
  className,
}: {
  status: string
  /** Necesario para distinguir una parada manual de una falla real. */
  error?: string | null
  variant?: "run" | "block"
  className?: string
}) {
  const t = useTranslations("sync")
  const status = resolveStatus(rawStatus, error, variant)

  const known = variant === "block" ? BLOCK_STATUSES.has(status) : RUN_STATUSES.has(status)
  const tone = (variant === "block" ? BLOCK_TONE : RUN_TONE)[status] ?? "bg-muted text-muted-foreground"

  // An unknown status means the backend introduced a state this build does not
  // know. Showing the raw value beats throwing on a missing translation key.
  const label = known
    ? t(variant === "block" ? `blockStatus.${status}` : `runStatus.${status}`)
    : status

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-mono text-[11px] font-medium", tone, className)}
    >
      {label}
    </Badge>
  )
}
