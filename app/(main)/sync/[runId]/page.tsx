"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { AlertCircle, ArrowLeft, FolderOpen, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { RunStatusBadge } from "@/components/sync/run-status-badge"
import { RunOperationBadge } from "@/components/sync/run-operation-badge"
import { RunDuration } from "@/components/sync/run-duration"
import { type BlockNames } from "@/components/sync/run-blocks-table"
import { RunPhaseGroups } from "@/components/sync/run-phase-groups"
import { RunStatusBar } from "@/components/sync/run-status-bar"
import { isStoppedError } from "@/components/sync/run-status-badge"
import { StopRunButton } from "@/components/sync/stop-run-button"
import { RunFilesBrowser } from "@/components/sync/run-files-browser"
import { useAuth } from "@/context/AuthContext"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"
import { getSession } from "@/lib/auth/auth"
import { dataClient } from "@/lib/api/client"
import type { SyncRunDetail } from "@/lib/sync/runs-api"

const POLL_MS = 5000
const ACTIVE = new Set(["resolving", "running"])

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—"
}

export default function SyncRunDetailPage() {
  const t = useTranslations("sync")
  const { user } = useAuth()
  const canSeeFiles = isStrapiSuperAdmin(user?.role)
  const params = useParams<{ runId: string }>()
  const runId = params?.runId

  const [run, setRun] = useState<SyncRunDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!runId) return
      if (!opts.silent) setIsLoading(true)
      try {
        const token = getSession()?.token
        const res = await fetch(`/api/sync/runs/${encodeURIComponent(runId)}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
        setRun(json as SyncRunDetail)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsLoading(false)
      }
    },
    [runId]
  )

  useEffect(() => {
    void load()
  }, [load])

  // Same rule as the list: a terminal run never changes again, so polling it
  // would be pure noise against Supabase.
  useEffect(() => {
    if (!run || !ACTIVE.has(run.status)) return
    const id = setInterval(() => void load({ silent: true }), POLL_MS)
    return () => clearInterval(id)
  }, [run, load])

  /**
   * Nombres de bloque y proyecto para la tabla. El ledger sólo guarda el
   * documentId, y una lista de ids no deja ver qué está avanzando ni qué falló.
   *
   * Se resuelve contra Strapi acotando por id cuando son pocos —la mayoría— y
   * pidiendo el universo liviano cuando son muchos: mil ids en la URL la harían
   * inservible y trocearla serían decenas de peticiones.
   *
   * CAVEAT: es el nombre de HOY. Un bloque renombrado tras la corrida se ve con
   * el nombre nuevo. Guardarlos en el ledger al correr sería fiel
   * históricamente, pero sólo serviría de ahí en adelante.
   */
  const [names, setNames] = useState<BlockNames>({})
  /** Falso hasta el primer intento de resolución; la tabla espera a eso. */
  const [namesReady, setNamesReady] = useState(false)
  /**
   * Ids ya intentados, resueltos o no. En un ref y no en estado porque no debe
   * disparar render: sin esto, un bloque borrado de Strapi nunca entra al mapa,
   * queda "faltante" para siempre y el efecto lo vuelve a pedir en cada poll.
   */
  const attemptedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    /**
     * Sólo las filas de BLOQUE tienen nombre que resolver.
     *
     * Las de catálogo y las de proyecto no son entidades de Strapi —`countries/
     * Guatemala` y la clave natural de un proyecto no son documentIds—, así que
     * pedirlas gastaba la petición en ids que nunca podían resolver.
     */
    const filas = (run?.blocks ?? []).filter((b) => (b.phase ?? 3) === 3)
    const ids = filas.map((b) => b.documentId).filter(Boolean) as string[]
    if (ids.length === 0) {
      // Sin `run` todavía no hay nada que resolver: marcar "listo" acá haría que
      // la tabla se dibujara con ids en cuanto llegaran los bloques, que es
      // exactamente el salto que se quiere evitar. Una corrida cargada y sin
      // bloques sí está lista: no hay nombres que esperar.
      if (run) setNamesReady(true)
      return
    }

    const missing = ids.filter((id) => !attemptedRef.current.has(id))
    if (missing.length === 0) {
      setNamesReady(true)
      return
    }

    let cancelled = false
    const IN_URL_LIMIT = 50

    /**
     * En un PULL la fila del ledger se identifica por `cod_proyecto`, que en
     * Strapi es el `legacyId` del bloque — no su documentId, que puede no
     * existir todavía cuando la corrida arranca. En un push las dos cosas
     * coinciden, y por eso la tabla de un pull mostraba el código crudo en la
     * columna donde uno busca su bloque.
     */
    const porLegacy = run?.operation === "pull"

    dataClient
      .getBlocksLite(
        missing.length <= IN_URL_LIMIT
          ? porLegacy
            ? { legacyIds: missing, pageSize: 100 }
            : { documentIds: missing, pageSize: 100 }
          : { pageSize: 2000 }
      )
      .then((res) => {
        if (cancelled) return
        const wanted = new Set(missing)
        setNames((prev) => {
          const next = { ...prev }
          for (const b of res?.data ?? []) {
            // La clave del mapa es la que usa la fila del ledger, para que la
            // tabla siga buscando por `b.documentId` sin saber de operaciones.
            const clave = porLegacy ? b.legacyId : b.documentId
            if (!clave || !wanted.has(clave)) continue
            next[clave] = {
              name: b.name ?? clave,
              code: b.code ?? "",
              projectName: b.project?.name ?? "",
            }
          }
          return next
        })
      })
      .catch(() => {
        // Sin nombres la tabla cae a los ids: peor de leer, pero nunca en blanco.
      })
      .finally(() => {
        if (cancelled) return
        /**
         * Se marcan como intentados aunque no hayan resuelto, o el efecto los
         * volvería a pedir en cada refresco — que era el caso de un bloque
         * borrado de Strapi después de la corrida.
         *
         * PERO sólo cuando la corrida terminó. En un pull los bloques se CREAN
         * durante la corrida: el ledger inserta sus catorce filas de entrada y
         * los bloques aparecen minutos después, en la fase 3. El primer intento
         * no encuentra nada, y marcarlos ahí dejaba la tabla con el código
         * crudo para siempre aunque el bloque existiera al terminar.
         */
        const enCurso = run?.status === "resolving" || run?.status === "running"
        if (!enCurso) for (const id of missing) attemptedRef.current.add(id)
        setNamesReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [run?.blocks])

  const failedBlocks = run?.blocks?.filter((b) => b.error) ?? []
  /**
   * El encabezado cuenta BLOQUES, no filas del ledger.
   *
   * Un pull de un solo bloque escribe además seis catálogos y un proyecto, y
   * contar las ocho decía "8 bloques" sobre algo que migró uno. Los catálogos y
   * el proyecto son cómo se logra, no qué se logró; su desglose está en sus
   * propias secciones. Una fila sin fase es de antes de la columna y era un
   * bloque: todas esas corridas fueron pushes.
   */
  const blockCount = run?.blocks?.filter((b) => (b.phase ?? 3) === 3).length ?? 0

  /**
   * Estados para la barra, en el orden en que llegan de la API — que es el
   * bigserial del ledger, el mismo con el que el drainer elige el siguiente
   * bloque. NO se reordena: la tabla se ordena alfabéticamente para buscar,
   * pero la barra es una línea de tiempo y ese orden movería cada marca a una
   * posición que no corresponde a cuándo ocurrió.
   *
   * Una parada manual se traduce a `stopped` igual que en la insignia: se
   * guarda como `failed` porque el CHECK de la tabla no admite otra cosa, y
   * dejarla roja haría leer un stop deliberado como una falla de SQL.
   */
  const barStatuses = useMemo(
    () =>
      (run?.blocks ?? []).map((b) =>
        b.status === "failed" && isStoppedError(b.error) ? "stopped" : b.status
      ),
    [run?.blocks]
  )

  /**
   * Qué se está viendo: el listado de bloques (null) o los archivos de una
   * carpeta.
   *
   * Antes eran dos pestañas, pero las dos listaban los mismos bloques y el
   * operador terminaba buscando dos veces lo mismo. Ahora los archivos son un
   * nivel más adentro: se entra desde una fila y se vuelve por la miga de pan,
   * que apunta al listado y no a la ruta de las carpetas.
   *
   * `label` es lo que la miga muestra como destino actual — el nombre del
   * bloque cuando se entró desde su fila.
   */
  const [viewingFiles, setViewingFiles] = useState<{ path: string; label: string } | null>(null)

  const openBlockFiles = useCallback(
    (documentId: string) => {
      const b = names[documentId]
      setViewingFiles({
        path: `blocks/${documentId}/`,
        label: b ? b.name : documentId,
      })
    },
    [names]
  )

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/sync" className="text-xs sm:text-sm">
                {t("title")}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {viewingFiles ? (
            <>
              {/* Vuelve al listado de bloques, no a la carpeta de arriba: la
                  jerarquía que importa acá es la de la corrida, no la de S3. */}
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <button
                    type="button"
                    onClick={() => setViewingFiles(null)}
                    className="font-mono text-xs"
                  >
                    {runId?.slice(0, 8)}…
                  </button>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-xs">{viewingFiles.label}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage className="font-mono text-xs">{runId?.slice(0, 8)}…</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
            {t("runTitle", { id: runId?.slice(0, 8) ?? "" })}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {run
              ? `${t("requestedBy")}: ${run.requestedBy} · ${formatDate(run.createdAt)}`
              : t("subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/sync">
              <ArrowLeft />
              {t("back")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className={isLoading ? "animate-spin" : undefined} />
            {t("refresh")}
          </Button>
          {run && ACTIVE.has(run.status) && (
            <StopRunButton runId={run.runId} onStopped={() => void load()} />
          )}
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

      {isLoading && !run ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : run ? (
        <>
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base sm:text-lg">{t("summary")}</CardTitle>
                <div className="flex items-center gap-2">
                  {/* El dominio dice sobre QUÉ universo corrió, que es lo que
                      decide las tablas consultadas. Hoy siempre es vivienda,
                      pero se muestra desde ahora: una corrida vieja tiene que
                      poder decir qué tocó cuando existan dos. */}
                  <Badge variant="outline" className="font-normal">
                    {t(
                      run.domain === "office"
                        ? "domainOffice"
                        : run.domain === "industrial"
                          ? "domainIndustrial"
                          : "domainHousing"
                    )}
                  </Badge>
                  <RunOperationBadge operation={run.operation} />
                  <RunStatusBadge status={run.status} error={run.error} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{t("requestedBy")}</dt>
                  <dd>{run.requestedBy}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{t("colStarted")}</dt>
                  <dd className="tabular-nums">{formatDate(run.createdAt)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{t("finished")}</dt>
                  <dd className="tabular-nums">{formatDate(run.finishedAt)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{t("colDuration")}</dt>
                  <dd>
                    <RunDuration
                      startedAt={run.createdAt}
                      finishedAt={run.finishedAt}
                      className="font-mono tabular-nums"
                    />
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{t("artifacts")}</dt>
                  <dd className="font-mono text-xs break-all">{run.s3Prefix ?? "—"}</dd>
                </div>
              </dl>

              {run.progress && (
                <div className="flex flex-col gap-2">
                  <RunStatusBar statuses={barStatuses} />
                  <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
                    <span>
                      {t("progressDone")}: {run.progress.done}/{run.progress.total}
                    </span>
                    {run.progress.failed > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        {t("progressFailed")}: {run.progress.failed}
                      </span>
                    )}
                    {run.progress.skipped > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {t("progressSkipped")}: {run.progress.skipped}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {run.error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                  <p className="font-mono text-xs text-destructive">{run.error}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Los archivos son un nivel más adentro, no una pestaña hermana:
              antes las dos listaban los mismos bloques y había que buscar el
              mismo bloque dos veces. Se entra desde su fila y se vuelve por la
              miga de pan. */}
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  {viewingFiles ? t("files") : t("blocks")}
                  {!viewingFiles && (
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {blockCount}
                    </span>
                  )}
                </CardTitle>
                {viewingFiles ? (
                  <Button variant="outline" size="sm" onClick={() => setViewingFiles(null)}>
                    <ArrowLeft />
                    {t("backToBlocks")}
                  </Button>
                ) : (
                  /* Oculto para quien no es super admin: la ruta responde 403
                     igual, esto sólo evita ofrecer algo que sólo podría fallar. */
                  canSeeFiles && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingFiles({ path: "", label: t("files") })}
                    >
                      <FolderOpen />
                      {t("files")}
                    </Button>
                  )
                )}
              </div>
            </CardHeader>
            <CardContent>
              {viewingFiles ? (
                <RunFilesBrowser
                  runId={run.runId}
                  names={names}
                  initialPath={viewingFiles.path}
                />
              ) : (
                <>
                  {failedBlocks.length > 0 && (
                    <p className="mb-3 font-mono text-xs tabular-nums text-muted-foreground">
                      {t("withIssues", { count: failedBlocks.length })}
                    </p>
                  )}
                  <RunPhaseGroups
                    blocks={run.blocks ?? []}
                    names={names}
                    isLoading={!namesReady}
                    onOpenFiles={canSeeFiles ? openBlockFiles : undefined}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
