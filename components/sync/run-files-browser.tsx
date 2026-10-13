"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import {
  AlertCircle,
  ChevronRight,
  Download,
  Eye,
  FileJson,
  Folder,
  GitCompare,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/empty-state"
import { POPSY_ILLUSTRATIONS } from "@/lib/popsy-illustrations"
import { SnapshotViewerDialog } from "@/components/sync/snapshot-viewer-dialog"
import { SnapshotDiffDialog } from "@/components/sync/snapshot-diff-dialog"
import { toast } from "sonner"

import { getSession } from "@/lib/auth/auth"
import { downloadRunFile } from "@/lib/sync/download-run-file"
import type { SyncRunFile, SyncRunFilesPage } from "@/lib/sync/runs-api"
import type { BlockNames } from "@/components/sync/run-blocks-table"

/** Rótulo por tipo de archivo. Sin esto los dos nuevos caían en "Otro". */
const KIND_LABEL: Record<string, string> = {
  "mysql-snapshot": "kindSnapshot",
  "strapi-source": "kindStrapiSource",
  written: "kindWritten",
  "apply-result": "kindApplyResult",
}

/** Rows per page once a folder holds more than this. */
const PAGE_SIZE = 25

interface FolderEntry {
  name: string
  prefix: string
  fileCount: number
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

export function RunFilesBrowser({
  runId,
  names = {},
  initialPath = "",
}: {
  runId: string
  /**
   * Nombres por documentId de bloque. Cada carpeta bajo `blocks/` ES un
   * documentId, y navegar entre veinte carpetas llamadas `ofzf0xln9yq…` no
   * dice a qué bloque se está entrando.
   */
  names?: BlockNames
  /**
   * Carpeta en la que abrir, relativa a la raíz de la corrida — p. ej.
   * `blocks/abc123/`. La usa el salto desde la tabla de bloques.
   *
   * Se lee sólo al montar, y alcanza porque el navegador se renderiza
   * condicionalmente: se entra desde una fila y se sale volviendo al listado,
   * así que cada entrada es un montaje nuevo, incluso al volver al mismo
   * bloque. Si algún día se lo dejara montado en paralelo al listado, esto
   * dejaría de reaccionar y habría que pasar la carpeta como estado controlado.
   */
  initialPath?: string
}) {
  const t = useTranslations("sync")

  const [page, setPage] = useState<SyncRunFilesPage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** Path relative to the run root, e.g. `blocks/abc123/`. "" is the root. */
  const [path, setPath] = useState(initialPath)
  const [pageIndex, setPageIndex] = useState(1)
  const [viewing, setViewing] = useState<SyncRunFile | null>(null)
  /** Intento cuyo antes/después se está comparando. */
  const [diffing, setDiffing] = useState<number | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const token = getSession()?.token
      const res = await fetch(`/api/sync/runs/${encodeURIComponent(runId)}/snapshots`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setPage(json as SyncRunFilesPage)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [runId])

  useEffect(() => {
    void load()
  }, [load])

  const root = page?.prefix ?? ""
  const allFiles = useMemo(() => page?.files ?? [], [page])

  // The tree is derived from the flat key list rather than fetched per level:
  // one request holds the whole run, so navigating a folder costs nothing and
  // cannot show a level that disagrees with the one above it.
  const { folders, files } = useMemo(() => {
    const here = `${root}${path}`
    const folderMap = new Map<string, FolderEntry>()
    const fileList: SyncRunFile[] = []

    for (const file of allFiles) {
      if (!file.key.startsWith(here)) continue
      const rest = file.key.slice(here.length)
      const slash = rest.indexOf("/")

      if (slash === -1) {
        fileList.push(file)
        continue
      }
      const name = rest.slice(0, slash)
      const existing = folderMap.get(name)
      if (existing) existing.fileCount += 1
      else folderMap.set(name, { name, prefix: `${path}${name}/`, fileCount: 1 })
    }

    return {
      // Mismo criterio que la tabla de bloques: alfabético por proyecto y luego
      // por bloque, y lo que no resolvió nombre queda al final en vez de
      // intercalar un documentId entre nombres reales.
      folders: [...folderMap.values()].sort((a, b) => {
        const ka = names[a.name]
        const kb = names[b.name]
        const cmp = (x: string, y: string) =>
          x.localeCompare(y, undefined, { sensitivity: "base", numeric: true })
        if (!ka && !kb) return cmp(a.name, b.name)
        if (!ka) return 1
        if (!kb) return -1
        return cmp(ka.projectName, kb.projectName) || cmp(ka.name, kb.name)
      }),
      files: fileList.sort((a, b) => a.fileName.localeCompare(b.fileName)),
    }
  }, [allFiles, root, path, names])

  /**
   * Pares comparables de la carpeta actual: un intento sólo se puede diffear si
   * están sus DOS archivos. Un `written` sin su respaldo —o al revés— no se
   * ofrece, en vez de abrir un diálogo que después dice que falta algo.
   */
  const diffables = useMemo(() => {
    const porIntento = new Map<number, { before?: string; after?: string }>()
    for (const f of files) {
      if (f.executionId == null) continue
      const par = porIntento.get(f.executionId) ?? {}
      if (f.kind === "mysql-snapshot") par.before = f.key
      if (f.kind === "written") par.after = f.key
      porIntento.set(f.executionId, par)
    }
    return new Map(
      [...porIntento.entries()].filter(([, p]) => p.before && p.after) as Array<
        [number, { before: string; after: string }]
      >
    )
  }, [files])

  const rowCount = folders.length + files.length
  const totalPages = Math.max(1, Math.ceil(rowCount / PAGE_SIZE))
  const safePage = Math.min(pageIndex, totalPages)
  const start = (safePage - 1) * PAGE_SIZE

  // Folders and files share one pagination window so a folder with 900 children
  // does not push its files onto a page the operator never looks at.
  const rows = [
    ...folders.map((f) => ({ type: "folder" as const, entry: f })),
    ...files.map((f) => ({ type: "file" as const, entry: f })),
  ].slice(start, start + PAGE_SIZE)

  const goTo = (next: string) => {
    setPath(next)
    setPageIndex(1)
  }

  /**
   * Migas de carpeta, relativas al punto de entrada y no a la raíz de S3.
   *
   * Entrando desde la fila de un bloque no queda ninguna —esa carpeta no tiene
   * subcarpetas—, y volver al listado es trabajo de la miga de la página. Las
   * de acá sólo aparecen cuando de verdad se bajó un nivel, que pasa al entrar
   * por la raíz de la corrida.
   */
  const relative = path.startsWith(initialPath) ? path.slice(initialPath.length) : path
  const crumbs = relative.split("/").filter(Boolean)

  const [downloading, setDownloading] = useState<string | null>(null)

  const download = async (file: SyncRunFile) => {
    setDownloading(file.key)
    try {
      await downloadRunFile(runId, file.key)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setDownloading(null)
    }
  }

  if (isLoading && !page) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-destructive/50 p-4">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("filesErrorTitle")}</p>
          <p className="font-mono text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="w-fit" onClick={() => void load()}>
            <RefreshCw />
            {t("refresh")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Migas de carpeta — sólo si se bajó por debajo del punto de entrada */}
      {crumbs.length > 0 && (
      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label={t("filesBreadcrumb")}>
          <button
            type="button"
            onClick={() => goTo(initialPath)}
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t("filesRoot")}
          </button>
          {crumbs.map((crumb, i) => {
            const target = `${initialPath}${crumbs.slice(0, i + 1).join("/")}/`
            const isLast = i === crumbs.length - 1
            return (
              <span key={target} className="flex items-center gap-1">
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => goTo(target)}
                  title={crumb}
                  className={
                    isLast
                      ? "rounded px-1.5 py-0.5 text-xs font-medium"
                      : "rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                >
                  {names[crumb] ? (
                    <>
                      {names[crumb].name}
                      <span className="text-muted-foreground"> · {names[crumb].projectName}</span>
                    </>
                  ) : (
                    <span className="font-mono">{crumb}</span>
                  )}
                </button>
              </span>
            )
          })}
        </nav>
      </div>
      )}

      {page?.truncated && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          {t("filesTruncated", { cap: page.cap })}
        </p>
      )}

      {rowCount === 0 ? (
        <EmptyState
          illustrationSrc={POPSY_ILLUSTRATIONS.emptyState}
          title={t("noFiles")}
          description={t("noFilesDescription")}
          illustrationSize={200}
          className="py-8"
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.map((row) =>
              row.type === "folder" ? (
                <Card
                  key={`d:${row.entry.prefix}`}
                  className="flex items-center gap-3 border border-border bg-card p-4"
                  onClick={() => goTo(row.entry.prefix)}
                >
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  {names[row.entry.name] ? (
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{names[row.entry.name].name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {names[row.entry.name].projectName}
                      </span>
                    </span>
                  ) : (
                    <span className="flex-1 truncate font-mono text-xs">{row.entry.name}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{row.entry.fileCount}</span>
                </Card>
              ) : (
                <Card key={`f:${row.entry.key}`} className="border border-border bg-card p-4">
                  <div className="mb-2 flex items-start gap-3">
                    <FileJson className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 break-all font-mono text-xs">
                      {row.entry.fileName}
                    </span>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {row.entry.restorable && (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                        <ShieldCheck className="size-3" />
                        {t("fileRestorable")}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(row.entry.size)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setViewing(row.entry)}>
                      <Eye />
                      {t("fileView")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={downloading === row.entry.key}
                      onClick={() => void download(row.entry)}
                    >
                      {downloading === row.entry.key ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Download />
                      )}
                      {t("fileDownload")}
                    </Button>
                  </div>
                </Card>
              )
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th
                    className="px-4 py-4 text-left text-sm font-medium uppercase text-muted-foreground"
                    style={{ width: 420, minWidth: 260 }}
                  >
                    {t("colName")}
                  </th>
                  <th
                    className="px-4 py-4 text-left text-sm font-medium uppercase text-muted-foreground"
                    style={{ width: 150, minWidth: 120 }}
                  >
                    {t("colKind")}
                  </th>
                  <th
                    className="px-4 py-4 text-left text-sm font-medium uppercase text-muted-foreground"
                    style={{ width: 110, minWidth: 90 }}
                  >
                    {t("colSize")}
                  </th>
                  <th
                    className="px-4 py-4 text-left text-sm font-medium uppercase text-muted-foreground"
                    style={{ width: 180, minWidth: 140 }}
                  >
                    {t("colModified")}
                  </th>
                  <th
                    className="px-4 py-4 text-right text-sm font-medium uppercase text-muted-foreground"
                    style={{ width: 140, minWidth: 120 }}
                  >
                    {t("colActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.type === "folder" ? (
                    <tr
                      key={`d:${row.entry.prefix}`}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-muted/50"
                      onClick={() => goTo(row.entry.prefix)}
                    >
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-2">
                          <Folder className="size-4 shrink-0 text-muted-foreground" />
                          {names[row.entry.name] ? (
                            <span className="flex min-w-0 flex-col" title={row.entry.name}>
                              <span className="truncate text-sm">
                                {names[row.entry.name].name}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {names[row.entry.name].projectName}
                              </span>
                            </span>
                          ) : (
                            <span className="font-mono text-xs">{row.entry.name}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {t("kindFolder")}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {t("filesCount", { count: row.entry.fileCount })}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">—</td>
                      <td className="px-4 py-4 text-right">
                        <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={`f:${row.entry.key}`}
                      className="border-b border-border transition-colors hover:bg-muted/50"
                    >
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-2">
                          <FileJson className="size-4 shrink-0 text-muted-foreground" />
                          <span className="font-mono text-xs">{row.entry.fileName}</span>
                          {row.entry.restorable && (
                            <Badge
                              className="bg-emerald-600 text-white hover:bg-emerald-600"
                              title={t("fileRestorableHint")}
                            >
                              <ShieldCheck className="size-3" />
                              {t("fileRestorable")}
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {t(KIND_LABEL[row.entry.kind] ?? "kindOther")}
                      </td>
                      <td className="px-4 py-4 text-sm tabular-nums text-muted-foreground">
                        {formatBytes(row.entry.size)}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {row.entry.lastModified
                          ? new Date(row.entry.lastModified).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {row.entry.kind === "mysql-snapshot" &&
                            row.entry.executionId != null &&
                            diffables.has(row.entry.executionId) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 px-2"
                                title={t("diffOpen")}
                                onClick={() => setDiffing(row.entry.executionId)}
                              >
                                <GitCompare className="size-4" />
                                <span className="hidden lg:inline">{t("diffOpen")}</span>
                              </Button>
                            )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("fileView")}
                            onClick={() => setViewing(row.entry)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("fileDownload")}
                            disabled={downloading === row.entry.key}
                            onClick={() => void download(row.entry)}
                          >
                            {downloading === row.entry.key ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Download className="size-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t("filesRange", {
                  from: start + 1,
                  to: Math.min(start + PAGE_SIZE, rowCount),
                  total: rowCount,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPageIndex(safePage - 1)}
                >
                  {t("previous")}
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {safePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPageIndex(safePage + 1)}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <SnapshotDiffDialog
        runId={runId}
        executionId={diffing}
        beforeKey={diffing != null ? (diffables.get(diffing)?.before ?? null) : null}
        afterKey={diffing != null ? (diffables.get(diffing)?.after ?? null) : null}
        onClose={() => setDiffing(null)}
      />

      <SnapshotViewerDialog
        runId={runId}
        file={viewing}
        onClose={() => setViewing(null)}
      />
    </div>
  )
}
