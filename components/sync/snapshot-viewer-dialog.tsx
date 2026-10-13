"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { AlertCircle, Download, Loader2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

import { getSession } from "@/lib/auth/auth"
import { downloadRunFile } from "@/lib/sync/download-run-file"
import type { SyncRunFile } from "@/lib/sync/runs-api"

/**
 * Loaded on demand: CodeMirror has no business travelling in the bundle of a page
 * that is usually opened just to look at the file list.
 */
const JsonCodeViewer = dynamic(
  () => import("@/components/sync/json-code-viewer").then((m) => m.JsonCodeViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[55vh] items-center justify-center rounded-md border border-border">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    ),
  }
)

/**
 * Above this the file is offered as a download instead of rendered: a snapshot of
 * a large block runs to several MB of JSON, and pretty-printing that into the DOM
 * freezes the tab.
 */
const MAX_INLINE_BYTES = 2 * 1024 * 1024

interface Summary {
  /** The MySQL table, not the snapshot's key: it is what an operator restores into. */
  table: string
  rows: number
}

/** How many rows the snapshot backs up, per table. */
function summarise(parsed: unknown): Summary[] {
  if (!parsed || typeof parsed !== "object") return []
  const obj = parsed as Record<string, unknown>

  const spec: Array<{ key: string; table: string }> = [
    { key: "universe", table: "housing_universe" },
    { key: "units", table: "housing_units" },
    { key: "amenities", table: "housing_amenities" },
    { key: "services", table: "housing_services" },
  ]

  return spec.flatMap(({ key, table }) =>
    Array.isArray(obj[key]) ? [{ table, rows: (obj[key] as unknown[]).length }] : []
  )
}

export function SnapshotViewerDialog({
  runId,
  file,
  onClose,
}: {
  runId: string
  file: SyncRunFile | null
  onClose: () => void
}) {
  const t = useTranslations("sync")

  const [text, setText] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const tooLarge = Boolean(file && file.size > MAX_INLINE_BYTES)

  useEffect(() => {
    if (!file || tooLarge) {
      setText(null)
      setSummary([])
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const token = getSession()?.token
    fetch(
      `/api/sync/runs/${encodeURIComponent(runId)}/snapshot?key=${encodeURIComponent(file.key)}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    )
      .then(async (res) => {
        const raw = await res.text()
        if (!res.ok) {
          let message = raw.slice(0, 200)
          try {
            const j = JSON.parse(raw) as { error?: string }
            if (j?.error) message = j.error
          } catch {
            // The upstream can answer HTML; the raw text is the better message.
          }
          throw new Error(message || `HTTP ${res.status}`)
        }
        if (cancelled) return

        // Re-indenting is what makes the file readable, but if it does not parse
        // the raw text is shown as-is: a corrupt snapshot is exactly the case an
        // operator opens this for, and hiding it behind a parse error would tell
        // them nothing about what is actually stored.
        try {
          const parsed: unknown = JSON.parse(raw)
          setText(JSON.stringify(parsed, null, 2))
          setSummary(summarise(parsed))
        } catch {
          setText(raw)
          setSummary([])
        }
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
  }, [file, runId, tooLarge])

  const download = async () => {
    if (!file) return
    setDownloading(true)
    try {
      await downloadRunFile(runId, file.key)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={Boolean(file)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 font-mono text-sm">
            {file?.fileName}
            {file?.restorable && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                <ShieldCheck className="size-3" />
                {t("fileRestorable")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">
            {file?.key}
          </DialogDescription>
        </DialogHeader>

        {file?.restorable && (
          <p className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
            {t("fileRestorableHint")}
          </p>
        )}
        {file && !file.restorable && file.kind === "mysql-snapshot" && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            {t("fileRetryHint")}
          </p>
        )}

        {summary.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t("snapshotRows")}</p>
            <div className="flex flex-wrap gap-2">
              {summary.map((s) => (
                <Badge
                  key={s.table}
                  variant="secondary"
                  className="gap-1.5 font-normal tabular-nums"
                >
                  <span className="font-mono">{s.table}</span>
                  <span className="text-muted-foreground">
                    {t("snapshotRowCount", { count: s.rows, plural: s.rows === 1 ? "" : "s" })}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {tooLarge ? (
            <div className="flex flex-col items-start gap-3 rounded-md border border-border p-4">
              <p className="text-sm text-muted-foreground">
                {t("fileTooLarge", { max: Math.round(MAX_INLINE_BYTES / 1024 / 1024) })}
              </p>
              <Button size="sm" disabled={downloading} onClick={() => void download()}>
                {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                {t("fileDownload")}
              </Button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("fileLoading")}
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 rounded-md border border-destructive/50 p-4">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="font-mono text-xs text-muted-foreground">{error}</p>
            </div>
          ) : (
            <JsonCodeViewer value={text ?? ""} />
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={downloading} onClick={() => void download()}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            {t("fileDownload")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
