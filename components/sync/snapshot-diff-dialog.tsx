"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { AlertCircle, Loader2 } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getSession } from "@/lib/auth/auth"
import {
  diffSnapshot,
  sideBySide,
  type SideLine,
  type SnapshotDiff,
} from "@/lib/sync/diff-snapshot"

/** Contador al estilo de GitHub: agregadas, eliminadas y modificadas. */
function DiffCounter({
  added,
  removed,
  changed,
  className,
}: {
  added: number
  removed: number
  changed: number
  className?: string
}) {
  const t = useTranslations("sync")
  return (
    <span className={`flex items-center gap-2 font-mono text-xs tabular-nums ${className ?? ""}`}>
      <span className="text-emerald-600 dark:text-emerald-400" title={t("diffAdded")}>
        +{added}
      </span>
      <span className="text-red-600 dark:text-red-400" title={t("diffRemoved")}>
        −{removed}
      </span>
      <span className="text-amber-600 dark:text-amber-400" title={t("diffChanged")}>
        ~{changed}
      </span>
    </span>
  )
}


/** Cuántas líneas iguales se dejan a cada lado de un cambio, como contexto. */
const CONTEXTO = 3

const TONO: Record<string, { fila: string; izq: string; der: string }> = {
  same: { fila: "", izq: "", der: "" },
  changed: {
    fila: "",
    izq: "bg-red-500/10 dark:bg-red-500/15",
    der: "bg-emerald-500/10 dark:bg-emerald-500/15",
  },
  removed: { fila: "", izq: "bg-red-500/10 dark:bg-red-500/15", der: "bg-muted/30" },
  added: { fila: "", izq: "bg-muted/30", der: "bg-emerald-500/10 dark:bg-emerald-500/15" },
}

/**
 * Las dos columnas del JSON, alineadas línea a línea.
 *
 * Con "sólo cambios" los tramos largos sin diferencias se pliegan en una banda
 * que dice cuántas líneas oculta — el mismo gesto que hace GitHub, y por la
 * misma razón: sobre 5.000 líneas, ver las 20 que cambiaron es el trabajo.
 */
function SplitDiff({ lines, soloCambios }: { lines: SideLine[]; soloCambios: boolean }) {
  const t = useTranslations("sync")

  const visibles = new Set<number>()
  if (soloCambios) {
    lines.forEach((l, i) => {
      if (l.state === "same") return
      for (let j = Math.max(0, i - CONTEXTO); j <= Math.min(lines.length - 1, i + CONTEXTO); j++) {
        visibles.add(j)
      }
    })
  }

  const filas: Array<{ tipo: "linea"; l: SideLine } | { tipo: "salto"; n: number }> = []
  let ocultas = 0
  lines.forEach((l, i) => {
    if (!soloCambios || visibles.has(i)) {
      if (ocultas > 0) {
        filas.push({ tipo: "salto", n: ocultas })
        ocultas = 0
      }
      filas.push({ tipo: "linea", l })
    } else {
      ocultas += 1
    }
  })
  if (ocultas > 0) filas.push({ tipo: "salto", n: ocultas })

  return (
    <ScrollArea className="h-[60vh] rounded-md border border-border">
      <table className="w-full border-collapse font-mono text-[11px] leading-relaxed">
        <tbody>
          {filas.map((f, i) =>
            f.tipo === "salto" ? (
              <tr key={`s${i}`}>
                <td colSpan={4} className="bg-muted/50 px-3 py-1 text-center text-muted-foreground">
                  ⋯ {t("diffCollapsed", { count: f.n })}
                </td>
              </tr>
            ) : (
              <tr key={`l${i}`}>
                <td className="w-10 select-none border-r border-border px-2 text-right align-top text-muted-foreground/60">
                  {f.l.n1 ?? ""}
                </td>
                <td className={`w-1/2 whitespace-pre-wrap break-all px-2 align-top ${TONO[f.l.state].izq}`}>
                  {f.l.left ?? ""}
                </td>
                <td className="w-10 select-none border-x border-border px-2 text-right align-top text-muted-foreground/60">
                  {f.l.n2 ?? ""}
                </td>
                <td className={`w-1/2 whitespace-pre-wrap break-all px-2 align-top ${TONO[f.l.state].der}`}>
                  {f.l.right ?? ""}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </ScrollArea>
  )
}

export function SnapshotDiffDialog({
  runId,
  beforeKey,
  afterKey,
  executionId,
  onClose,
}: {
  runId: string
  beforeKey: string | null
  afterKey: string | null
  executionId: number | null
  onClose: () => void
}) {
  const t = useTranslations("sync")
  const [diff, setDiff] = useState<SnapshotDiff | null>(null)
  const [lines, setLines] = useState<SideLine[] | null>(null)
  /**
   * Por defecto sólo los cambios: un bloque de 90 unidades da ~5.000 líneas por
   * columna, y dibujarlas todas para mirar veinte es caro y peor de leer.
   */
  const [soloCambios, setSoloCambios] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!beforeKey || !afterKey) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setDiff(null)
    setLines(null)

    const token = getSession()?.token
    const traer = (key: string) =>
      fetch(
        `/api/sync/runs/${encodeURIComponent(runId)}/snapshot?key=${encodeURIComponent(key)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      ).then(async (res) => {
        const raw = await res.text()
        if (!res.ok) throw new Error(raw.slice(0, 160) || `HTTP ${res.status}`)
        return JSON.parse(raw) as unknown
      })

    Promise.all([traer(beforeKey), traer(afterKey)])
      .then(([antes, despues]) => {
        if (cancelled) return
        setDiff(diffSnapshot(antes, despues))
        setLines(sideBySide(antes, despues))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [runId, beforeKey, afterKey])

  const sinCambios =
    diff && diff.totals.added + diff.totals.removed + diff.totals.changed === 0

  return (
    <Dialog open={Boolean(beforeKey && afterKey)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            {t("diffTitle")}
            {diff && (
              <DiffCounter
                added={diff.totals.added}
                removed={diff.totals.removed}
                changed={diff.totals.changed}
              />
            )}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("diffSubtitle", { exec: executionId ?? "—" })}</span>
            {lines && (
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Switch checked={soloCambios} onCheckedChange={setSoloCambios} />
                {t("diffOnlyChanges")}
              </label>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("diffLoading")}
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 rounded-md border border-destructive/50 p-4">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="font-mono text-xs text-muted-foreground">{error}</p>
            </div>
          ) : sinCambios ? (
            <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
              {t("diffNoChanges")}
            </p>
          ) : diff && lines ? (
            <SplitDiff lines={lines} soloCambios={soloCambios} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
