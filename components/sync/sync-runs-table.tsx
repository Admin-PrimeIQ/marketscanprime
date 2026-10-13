"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { ChevronsLeft } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/empty-state"
import { POPSY_ILLUSTRATIONS } from "@/lib/popsy-illustrations"
import { RunStatusBadge } from "@/components/sync/run-status-badge"
import { RunOperationBadge } from "@/components/sync/run-operation-badge"
import { RunDuration } from "@/components/sync/run-duration"
import type { SyncRunSummary } from "@/lib/sync/runs-api"

interface Column {
  id: string
  label: string
  width: number
  minWidth: number
}

interface SyncRunsTableProps {
  runs: SyncRunSummary[]
  isLoading?: boolean
  currentPage?: number
  totalPages?: number
  totalItems?: number
  pageSize?: number
  onPageChange?: (page: number) => void
}

const formatDate = (value: string | null): string => {
  if (!value) return "—"
  try {
    return format(new Date(value), "dd MMM yyyy HH:mm", { locale: es })
  } catch {
    return "—"
  }
}

export function SyncRunsTable({
  runs,
  isLoading = false,
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 20,
  onPageChange,
}: SyncRunsTableProps) {
  const t = useTranslations("sync")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [goToPageValue, setGoToPageValue] = useState("")

  const columns: Column[] = [
    { id: "run", label: t("colRun"), width: 130, minWidth: 110 },
    { id: "status", label: t("colStatus"), width: 130, minWidth: 110 },
    { id: "operation", label: t("colOperationType"), width: 110, minWidth: 90 },
    { id: "requestedBy", label: t("colRequestedBy"), width: 200, minWidth: 150 },
    { id: "started", label: t("colStarted"), width: 170, minWidth: 140 },
    { id: "duration", label: t("colDuration"), width: 110, minWidth: 90 },
    { id: "blocks", label: t("colBlocks"), width: 150, minWidth: 130 },
  ]

  const open = (runId: string) => router.push(`/sync/${runId}`)

  /** Written / failed / total, with colour only where it means something. */
  const BlockCounts = ({ run }: { run: SyncRunSummary }) => (
    <span className="font-mono text-xs tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-400">{run.done}</span>
      {run.failed > 0 && (
        <span className="text-red-600 dark:text-red-400"> / {run.failed}</span>
      )}
      {run.skipped > 0 && (
        <span className="text-amber-600 dark:text-amber-400"> / {run.skipped}</span>
      )}
      <span className="text-muted-foreground"> {t("ofTargets", { total: run.targetsCount ?? 0 })}</span>
    </span>
  )

  if (isLoading && runs.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  const emptyState = (
    <EmptyState
      illustrationSrc={POPSY_ILLUSTRATIONS.emptyState}
      title={t("empty")}
      description={t("emptyDescription")}
      illustrationSize={200}
      className="py-8"
    />
  )

  return (
    <div className="space-y-4">
      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {runs.length === 0
          ? emptyState
          : runs.map((run) => (
              <Card
                key={run.runId}
                className="p-4 border border-border bg-card cursor-pointer"
                onClick={() => open(run.runId)}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                    {run.runId.slice(0, 8)}
                  </span>
                  <span className="flex items-center gap-2">
                    <RunOperationBadge operation={run.operation} />
                    <RunStatusBadge status={run.status} error={run.error} />
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">{run.requestedBy}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(run.createdAt)} ·{" "}
                    <RunDuration startedAt={run.createdAt} finishedAt={run.finishedAt} />
                  </p>
                  <BlockCounts run={run} />
                </div>
              </Card>
            ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className="px-4 py-4 text-sm font-medium text-muted-foreground text-left"
                  style={{ width: column.width, minWidth: column.minWidth }}
                >
                  <span className="uppercase">{column.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  {emptyState}
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr
                  key={run.runId}
                  className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => open(run.runId)}
                >
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                      {run.runId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <RunStatusBadge status={run.status} error={run.error} />
                  </td>
                  <td className="px-4 py-4">
                    <RunOperationBadge operation={run.operation} />
                  </td>
                  <td className="px-4 py-4 text-sm">{run.requestedBy}</td>
                  <td className="px-4 py-4 text-sm text-muted-foreground tabular-nums">
                    {formatDate(run.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted-foreground tabular-nums">
                    <RunDuration startedAt={run.createdAt} finishedAt={run.finishedAt} />
                  </td>
                  <td className="px-4 py-4">
                    <BlockCounts run={run} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalItems > pageSize && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {tCommon("showing")} {(currentPage - 1) * pageSize + 1} -{" "}
            {Math.min(currentPage * pageSize, totalItems)} {tCommon("of")} {totalItems}
          </span>

          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(1)}
              disabled={currentPage === 1}
              className="flex-shrink-0"
              title={tCommon("first")}
            >
              <ChevronsLeft className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">{tCommon("first")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(currentPage - 1)}
              disabled={currentPage === 1}
              className="flex-shrink-0"
            >
              {tCommon("previous")}
            </Button>

            <div className="flex items-center gap-1 px-1">
              <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">
                {tCommon("page")}
              </span>
              <Input
                type="number"
                min={1}
                max={totalPages}
                value={goToPageValue}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === "" || (Number(value) >= 1 && Number(value) <= totalPages)) {
                    setGoToPageValue(value)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && goToPageValue) {
                    const page = Number(goToPageValue)
                    if (page >= 1 && page <= totalPages) {
                      onPageChange?.(page)
                      setGoToPageValue("")
                    }
                  }
                }}
                placeholder={currentPage.toString()}
                className="w-16 sm:w-20 h-8 text-center text-sm"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                / {totalPages}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="flex-shrink-0"
            >
              {tCommon("next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
