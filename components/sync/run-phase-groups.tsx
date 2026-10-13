"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { RunBlocksTable, type BlockNames, type RunRowKind } from "@/components/sync/run-blocks-table"
import { isStoppedError } from "@/components/sync/run-status-badge"
import type { SyncRunBlock } from "@/lib/sync/runs-api"

/**
 * El detalle de una corrida, agrupado por fase.
 *
 * Un pull escribe tres clases de cosa —catálogos, proyectos y bloques— y la
 * vista las listaba juntas bajo el rótulo "Bloques": un pull de UN bloque decía
 * 8, y encontrar el bloque obligaba a leer seis filas de catálogo primero.
 *
 * Un push manda `phase = 3` en todas sus filas, así que agrupar por fase sirve
 * para las dos operaciones sin casos especiales. Y cuando sólo hay un grupo
 * —todo push, y cualquier pull de una sola fase— se dibuja la tabla sin el
 * envoltorio de secciones: la vista del push queda igual que siempre.
 */

const GRUPOS: { phase: 1 | 2 | 3; kind: RunRowKind; label: string; hint: string | null }[] = [
  { phase: 1, kind: "catalogs", label: "phaseCatalogs", hint: "phaseCatalogsHint" },
  { phase: 2, kind: "projects", label: "phaseProjects", hint: null },
  { phase: 3, kind: "blocks", label: "phaseBlocks", hint: null },
]

/** Una fila sin fase es de una corrida anterior a la columna: todas fueron pushes. */
const faseDe = (b: SyncRunBlock) => b.phase ?? 3

function cuenta(filas: SyncRunBlock[]) {
  let hechos = 0
  let fallidos = 0
  for (const b of filas) {
    if (b.status === "done") hechos += 1
    // Una parada manual se guarda como `failed` porque el CHECK del ledger no
    // admite otra cosa, pero no es una incidencia que revisar.
    else if (b.status !== "pending" && b.status !== "running" && !isStoppedError(b.error)) {
      fallidos += 1
    }
  }
  return { hechos, fallidos, total: filas.length }
}

export function RunPhaseGroups({
  blocks,
  names = {},
  isLoading = false,
  onOpenFiles,
}: {
  blocks: SyncRunBlock[]
  names?: BlockNames
  isLoading?: boolean
  /** Sólo las filas de bloque producen artefactos, así que sólo ellas lo reciben. */
  onOpenFiles?: (documentId: string) => void
}) {
  const t = useTranslations("sync")

  const grupos = useMemo(
    () =>
      GRUPOS.map((g) => ({ ...g, filas: blocks.filter((b) => faseDe(b) === g.phase) })).filter(
        (g) => g.filas.length > 0
      ),
    [blocks]
  )

  // Una sola clase de fila no necesita secciones: sería un encabezado de más
  // sobre la única tabla que hay.
  if (isLoading || grupos.length <= 1) {
    const solo = grupos[0]
    return (
      <RunBlocksTable
        blocks={blocks}
        names={names}
        isLoading={isLoading}
        kind={solo?.kind ?? "blocks"}
        onOpenFiles={solo?.kind === "blocks" || !solo ? onOpenFiles : undefined}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {grupos.map((g) => (
        <Seccion
          key={g.phase}
          titulo={t(g.label)}
          pista={g.hint ? t(g.hint) : null}
          filas={g.filas}
          // Los catálogos son maquinaria: cuando todo sale bien no aportan, y
          // cuando algo falla su insignia roja lleva hasta ahí.
          abiertoPorDefecto={g.kind !== "catalogs"}
        >
          <RunBlocksTable
            blocks={g.filas}
            names={names}
            kind={g.kind}
            onOpenFiles={g.kind === "blocks" ? onOpenFiles : undefined}
          />
        </Seccion>
      ))}
    </div>
  )
}

function Seccion({
  titulo,
  pista,
  filas,
  abiertoPorDefecto,
  children,
}: {
  titulo: string
  pista: string | null
  filas: SyncRunBlock[]
  abiertoPorDefecto: boolean
  children: React.ReactNode
}) {
  const t = useTranslations("sync")
  const [abierto, setAbierto] = useState(abiertoPorDefecto)
  const { hechos, fallidos, total } = cuenta(filas)

  return (
    <Collapsible
      open={abierto}
      onOpenChange={setAbierto}
      className="rounded-lg border border-border"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors">
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            abierto ? "" : "-rotate-90"
          }`}
        />
        <span className="text-sm font-medium">{titulo}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {hechos}/{total}
        </span>
        {fallidos > 0 && (
          <span className="font-mono text-xs tabular-nums text-red-600 dark:text-red-400">
            {t("withIssues", { count: fallidos })}
          </span>
        )}
        {pista && (
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{pista}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-4 pb-4 pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
