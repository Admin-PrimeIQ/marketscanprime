"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { AlertCircle, RefreshCw, Timer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RunStatusBar } from "@/components/sync/run-status-bar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { SyncRunsTable } from "@/components/sync/sync-runs-table"
import { RunStatusBadge } from "@/components/sync/run-status-badge"
import { RunOperationBadge } from "@/components/sync/run-operation-badge"
import { RunDuration } from "@/components/sync/run-duration"
import { StopRunButton } from "@/components/sync/stop-run-button"
import { NewRunDialog } from "@/components/sync/new-run-dialog"
import { getSession } from "@/lib/auth/auth"
import type { SyncRunsPage } from "@/lib/sync/runs-api"

const PAGE_SIZE = 20
const POLL_MS = 5000

export default function SyncRunsPage() {
  const t = useTranslations("sync")

  const [page, setPage] = useState<SyncRunsPage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  // Kept in a ref so the polling effect does not restart on every fetch.
  const pageRef = useRef(currentPage)
  pageRef.current = currentPage

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsLoading(true)
    try {
      const token = getSession()?.token
      const offset = (pageRef.current - 1) * PAGE_SIZE
      const res = await fetch(`/api/sync/runs?limit=${PAGE_SIZE}&offset=${offset}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setPage(json as SyncRunsPage)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, currentPage])

  // Only poll while something is actually running: an idle list has nothing to
  // refresh, and every tick costs a Supabase query.
  useEffect(() => {
    if (!page?.active) return
    const id = setInterval(() => void load({ silent: true }), POLL_MS)
    return () => clearInterval(id)
  }, [page?.active, load])

  const active = page?.active ?? null

  /**
   * Estados para la barra del banner, reconstruidos desde los contadores.
   *
   * El listado no trae el estado bloque por bloque —serían mil filas por
   * corrida sólo para pintar una barra—, así que acá las proporciones son
   * ciertas pero las posiciones no. Se agrupan por resultado, que es como se
   * lee una barra apilada, en vez de repartirlos para aparentar un orden.
   */
  const bannerStatuses = useMemo(() => {
    if (!active) return []
    const { done, failed, skipped, total } = active.progress
    const pending = Math.max(0, total - done - failed - skipped)
    return [
      ...Array<string>(done).fill("done"),
      ...Array<string>(skipped).fill("skipped_ambiguous"),
      ...Array<string>(failed).fill("failed"),
      ...Array<string>(pending).fill("pending"),
    ]
  }, [active])
  const totalItems = page?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs sm:text-sm">{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
            {t("title")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className={isLoading ? "animate-spin" : undefined} />
            <span className="hidden sm:inline">{t("refresh")}</span>
          </Button>
          {/* Disabled with the reason visible beats letting the operator hit a
              409: only one writeback may touch the warehouse at a time. */}
          <NewRunDialog
            disabled={Boolean(active)}
            disabledReason={t("runInProgress")}
            onStarted={() => void load()}
          />
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-card">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t("errorTitle")}</p>
              <p className="font-mono text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* The active run sits outside the history: it is the only thing on this
          page that changes, and nobody should have to hunt for it in the table. */}
      {active && (
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
                </span>
                {t("activeRun")}
              </CardTitle>
              <div className="flex items-center gap-2">
                <RunOperationBadge operation={active.operation} />
                <RunStatusBadge status={active.status} error={active.error} />
                <StopRunButton runId={active.runId} onStopped={() => void load()} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
              <Link
                href={`/sync/${active.runId}`}
                className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs"
              >
                {active.runId.slice(0, 8)}
              </Link>
              <span className="text-muted-foreground">
                {t("requestedBy")}: {active.requestedBy}
              </span>
              {/* Cronómetro vivo: es lo único de la tarjeta que dice, sin leer
                  números, que la corrida sigue avanzando. */}
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Timer className="size-3.5" />
                <RunDuration
                  startedAt={active.createdAt}
                  finishedAt={active.finishedAt}
                  className="font-mono tabular-nums text-foreground"
                />
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {/* Acá la barra es PROPORCIONAL, no posicional: el endpoint del
                  listado sólo trae totales, no el estado de cada bloque. Se
                  agrupa por resultado para que las proporciones sean ciertas y
                  se lea como una barra apilada. La versión con posiciones
                  reales está en el detalle, a un clic. */}
              <RunStatusBar statuses={bannerStatuses} />
              <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
                <span>
                  {t("progressDone")}: {active.progress.done}/{active.progress.total}
                </span>
                {active.progress.failed > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {t("progressFailed")}: {active.progress.failed}
                  </span>
                )}
                {active.progress.skipped > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {t("progressSkipped")}: {active.progress.skipped}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">{t("history")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SyncRunsTable
            runs={page?.runs ?? []}
            isLoading={isLoading}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>
    </div>
  )
}
