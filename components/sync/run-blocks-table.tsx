"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { FolderOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/empty-state"
import { POPSY_ILLUSTRATIONS } from "@/lib/popsy-illustrations"
import { RunStatusBadge, isStoppedError } from "@/components/sync/run-status-badge"
import type { SyncRunBlock } from "@/lib/sync/runs-api"

interface Column {
  id: string
  label: string
  width: number
  minWidth: number
}

/** Nombres resueltos desde Strapi; un bloque borrado después de la corrida no está. */
export type BlockNames = Record<string, { name: string; code: string; projectName: string }>

/**
 * Qué clase de filas lleva esta tabla. Decide las columnas: un catálogo no
 * tiene `cod_proyecto`, ni modo, ni escritura, y mostrarlas siempre vacías era
 * parte de lo que hacía ilegible el detalle de un pull.
 */
export type RunRowKind = "catalogs" | "projects" | "blocks"

/**
 * Cómo se lee la fila según su clase.
 *
 * El `documentId` del ledger no es un id opaco en las fases 1 y 2: un catálogo
 * es `coleccion/valor` y un proyecto es su clave natural separada por barras
 * verticales. Partirlos muestra el dato en vez del identificador.
 */
function describeRow(
  kind: RunRowKind,
  b: SyncRunBlock,
  names: BlockNames
): { primary: string; secondary: string | null; mono: boolean } {
  if (kind === "catalogs") {
    const i = b.documentId.indexOf("/")
    return i > 0
      ? { primary: b.documentId.slice(i + 1), secondary: b.documentId.slice(0, i), mono: false }
      : { primary: b.documentId, secondary: null, mono: true }
  }
  if (kind === "projects") {
    const [nombre, ...resto] = b.documentId.split("|")
    return { primary: nombre.trim(), secondary: resto.join(" · ").trim() || null, mono: false }
  }
  const n = names[b.documentId]
  return n
    ? { primary: n.name, secondary: n.code, mono: false }
    : { primary: b.documentId, secondary: null, mono: true }
}

/**
 * Alfabético por proyecto y, dentro de cada uno, por bloque.
 *
 * Los que no resolvieron nombre van al final: ordenar un documentId entre
 * nombres reales rompería la lectura de la lista justo donde sirve. `names`
 * llega después que `blocks`, así que esto se reordena solo al resolverse.
 *
 * Es un criterio de LECTURA, para buscar un bloque por nombre. La barra de
 * estado del detalle deliberadamente no lo usa: ahí el orden es el de trabajo.
 */
function orderRunBlocks(blocks: SyncRunBlock[], names: BlockNames): SyncRunBlock[] {
  const cmp = (a: string, z: string) =>
    a.localeCompare(z, undefined, { sensitivity: "base", numeric: true })

  return [...blocks].sort((a, z) => {
    const ka = names[a.documentId]
    const kz = names[z.documentId]
    if (!ka && !kz) return cmp(a.documentId, z.documentId)
    if (!ka) return 1
    if (!kz) return -1
    return cmp(ka.projectName, kz.projectName) || cmp(ka.name, kz.name)
  })
}


export function RunBlocksTable({
  blocks,
  names = {},
  isLoading = false,
  onOpenFiles,
  kind = "blocks",
}: {
  blocks: SyncRunBlock[]
  names?: BlockNames
  /** Clase de filas; decide columnas y cómo se lee el identificador. */
  kind?: RunRowKind
  /**
   * Los nombres llegan después que las filas. Sin esperarlos, la tabla se
   * dibujaba con documentIds y saltaba de orden al resolverse — leer una lista
   * que se reacomoda sola es peor que esperar medio segundo.
   */
  isLoading?: boolean
  /**
   * Entra a los archivos de este bloque.
   *
   * Es la única puerta a la carpeta de un bloque: sin esto había que leer el
   * nombre acá y volver a buscarlo entre cientos de carpetas. Sólo llega
   * definido para quien puede ver archivos: la columna no existe si no, en vez
   * de ofrecer un botón que sólo podría dar 403.
   */
  onOpenFiles?: (documentId: string) => void
}) {
  const t = useTranslations("sync")

  // Sólo los bloques llevan el juego completo. Un catálogo no tiene proyecto,
  // cod_proyecto, modo ni escritura; un proyecto no tiene modo ni escritura.
  const esBloque = kind === "blocks"
  const columns: Column[] = [
    ...(esBloque ? [{ id: "project", label: t("colProject"), width: 200, minWidth: 150 }] : []),
    {
      id: "main",
      label: kind === "catalogs" ? t("colCatalog") : esBloque ? t("colBlock") : t("colProject"),
      width: 300,
      minWidth: 220,
    },
    ...(kind === "catalogs" ? [] : [{ id: "cod", label: t("colCod"), width: 130, minWidth: 110 }]),
    ...(esBloque
      ? [
          { id: "mode", label: t("colMode"), width: 100, minWidth: 80 },
          { id: "operation", label: t("colOperation"), width: 110, minWidth: 90 },
        ]
      : []),
    { id: "status", label: t("colStatus"), width: 130, minWidth: 110 },
    { id: "error", label: t("colError"), width: 320, minWidth: 200 },
    ...(onOpenFiles
      ? [{ id: "actions", label: t("colActions"), width: 130, minWidth: 110 }]
      : []),
  ]

  const ordered = useMemo(() => orderRunBlocks(blocks, names), [blocks, names])

  if (isLoading) {
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
      title={t("noBlocks")}
      description={t("noBlocksDescription")}
      illustrationSize={200}
      className="py-8"
    />
  )

  const mono = "inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs"

  return (
    <div className="space-y-4">
      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {ordered.length === 0
          ? emptyState
          : ordered.map((b) => (
              <Card key={b.documentId} className="p-4 border border-border bg-card">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className={mono}>
                    {b.codProyecto ?? (kind === "catalogs" ? t("phaseCatalogs") : b.documentId.slice(0, 10))}
                  </span>
                  <RunStatusBadge status={b.status} error={b.error} variant="block" />
                </div>
                <div className="space-y-1 text-sm">
                  {esBloque && names[b.documentId] && (
                    <p className="text-xs text-muted-foreground">
                      {names[b.documentId].projectName}
                    </p>
                  )}
                  {(() => {
                    const d = describeRow(kind, b, names)
                    return (
                      <>
                        <p className={d.mono ? "font-mono text-xs break-all" : "font-medium"}>
                          {d.primary}
                        </p>
                        {d.secondary && (
                          <p className="text-xs text-muted-foreground">{d.secondary}</p>
                        )}
                      </>
                    )
                  })()}
                  {esBloque && (
                    <p className="text-xs text-muted-foreground">
                      {[b.mode, b.operation].filter(Boolean).join(" · ") || "—"}
                    </p>
                  )}
                  {b.error && !isStoppedError(b.error) && (
                    <p className="font-mono text-xs text-destructive break-words">{b.error}</p>
                  )}
                </div>
                {onOpenFiles && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full gap-1.5"
                    onClick={() => onOpenFiles(b.documentId)}
                  >
                    <FolderOpen className="size-4" />
                    {t("blockFiles")}
                  </Button>
                )}
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
            {ordered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  {emptyState}
                </td>
              </tr>
            ) : (
              ordered.map((b) => (
                <tr
                  key={b.documentId}
                  className="border-b border-border hover:bg-muted/50 transition-colors"
                >
                  {esBloque && (
                    <td className="px-4 py-4 text-sm">
                      {names[b.documentId]?.projectName ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-4">
                    {/* El id no dice nada de qué está avanzando; el nombre sí.
                        Si el bloque ya no existe en Strapi cae al id, que es la
                        verdad disponible, en vez de inventar un nombre. En las
                        fases 1 y 2 el id TAMPOCO es opaco —`coleccion/valor` y
                        la clave natural del proyecto—, así que se parte. */}
                    {(() => {
                      const d = describeRow(kind, b, names)
                      return (
                        <div className="flex flex-col gap-0.5" title={b.documentId}>
                          <span
                            className={
                              d.mono ? "font-mono text-xs text-muted-foreground" : "truncate text-sm"
                            }
                          >
                            {d.primary}
                          </span>
                          {d.secondary && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {d.secondary}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  {kind !== "catalogs" && (
                    <td className="px-4 py-4">
                      {b.codProyecto ? (
                        <span className={mono}>{b.codProyecto}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  {esBloque && (
                    <>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{b.mode ?? "—"}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {b.operation ?? "—"}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-4">
                    <RunStatusBadge status={b.status} error={b.error} variant="block" />
                  </td>
                  <td className="px-4 py-4">
                    {b.error && !isStoppedError(b.error) ? (
                      <span className="font-mono text-xs text-destructive">{b.error}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {onOpenFiles && (
                    <td className="px-4 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 px-2"
                        title={t("blockFilesHint")}
                        onClick={() => onOpenFiles(b.documentId)}
                      >
                        <FolderOpen className="size-4" />
                        <span className="hidden lg:inline">{t("blockFiles")}</span>
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
