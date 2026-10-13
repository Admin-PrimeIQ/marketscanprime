import "server-only"

/**
 * Server-side client for the writeback sync API exposed by n8n.
 *
 * This module is SERVER ONLY. `SYNC_API_KEY` must never reach the browser:
 * whoever holds it can trigger a writeback with `force: true`, which disables
 * the guard that stops a block from being emptied in the warehouse.
 *
 * It also hides an n8n quirk from the rest of the app. n8n serves a webhook
 * whose path contains route parameters (`:runId`) ONLY under its internal
 * webhook id, and a parameterless path ONLY under the plain path. Mixing them
 * returns `404 not registered`, which reads exactly like "the workflow is off".
 * Callers here just say "list" or "detail".
 */

const WEBHOOK_IDS = {
  runDetail: "7f8549e4-04e8-450b-9dc0-781cd3c3109b",
  release: "6bf0d722-5744-4fe2-93d4-571ec4ba5321",
  snapshots: "9f1a2b3c-0002-4a00-9000-snapshotlist",
  snapshotFile: "9f1a2b3c-0003-4a00-9000-snapshotfile",
} as const

export type SyncRunStatus =
  | "resolving"
  | "running"
  | "completed"
  | "completed_with_skips"
  | "failed"
  | "aborted"

/**
 * Which way the data moved. `push` sends Strapi to the MySQL warehouse; `pull`
 * will bring the warehouse back into Strapi.
 *
 * Read from the ledger, never assumed: runs recorded before the column existed
 * come back as `push`, which is what they were. Rendering a fixed label instead
 * would start lying the day pull ships.
 */
export type SyncOperation = "push" | "pull"

/**
 * Qué universo del warehouse toca la corrida.
 *
 * No es una etiqueta: decide QUÉ TABLAS se consultan. `housing_units` y
 * `office_units` comparten 20 de 56 columnas, y las que comparten se llaman
 * distinto —`num_unidad` contra `no_unidad`—, así que cada dominio necesita su
 * propio mapper. Hoy sólo `housing` lo tiene, y el resto se rechaza del lado
 * del servidor; los tres son valores legales de la columna para no migrarla el
 * día que exista el segundo.
 */
export type SyncDomain = "housing" | "industrial" | "office"

export interface SyncRunProgress {
  total: number
  done: number
  failed: number
  skipped: number
}

/** Lo que identifica a una corrida, lo devuelvan el listado o el detalle. */
export interface SyncRunBase {
  runId: string
  status: SyncRunStatus
  requestedBy: string
  operation: SyncOperation
  /** Corridas anteriores a la columna son de vivienda: era lo único que había. */
  domain: SyncDomain
  createdAt: string
  finishedAt: string | null
  s3Prefix: string | null
  error: string | null
}

/**
 * Fila del listado. Los contadores vienen planos porque la tabla los muestra en
 * columnas; el detalle NO los manda —entrega `progress`— y por eso no se
 * heredan: un tipo que declara campos que el endpoint nunca envía deja escribir
 * `run.done` y recibir undefined con la bendición del compilador.
 */
export interface SyncRunSummary extends SyncRunBase {
  targetsCount: number | null
  done: number
  failed: number
  skipped: number
}

export interface SyncRunsPage {
  active: (SyncRunSummary & { progress: SyncRunProgress }) | null
  runs: SyncRunSummary[]
  total: number
  limit: number
  offset: number
}

export interface SyncRunBlock {
  documentId: string
  codProyecto: string | null
  mode: "legacy" | "native" | null
  operation: "insert" | "update" | null
  status: string
  error: string | null
  /**
   * Qué clase de trabajo es esta fila: 1 catálogo · 2 proyecto · 3 bloque.
   *
   * Un pull mezcla las tres en una sola corrida, y sin esto la vista las
   * listaba juntas bajo el rótulo "Bloques" — de ahí que un pull de UN bloque
   * dijera 8. Un push manda 3 en todas sus filas, así que agrupar por fase no
   * necesita saber la operación: cae entero en un solo grupo.
   *
   * `null` en corridas anteriores a la columna, que fueron todas pushes: la
   * vista las trata como bloques, que es lo que eran.
   */
  phase: 1 | 2 | 3 | null
}

export interface SyncRunDetail extends SyncRunBase {
  progress: SyncRunProgress
  blocks: SyncRunBlock[]
}


/** Un bloque tal como lo ve el warehouse: una fila de `housing_universe`. */
export interface SqlBlock {
  /** `cod_proyecto` — la clave de unión con `block.legacyId` en Strapi. */
  codProyecto: string
  name: string
  quarter: string | null
  /** GAM o Interior, derivado del trimestre igual que en `lib/region.ts`. */
  region: string | null
  country: string
  totalUnits: number | null
}

export interface SqlProject {
  key: string
  name: string
  developer: string
  country: string
  blockCount: number
  blocks: SqlBlock[]
}

export interface SqlProjectsPage {
  projects: SqlProject[]
  totalProjects: number
  totalBlocks: number
  /**
   * Se tocó el tope. Es la diferencia entre "no hay más" y "no te los mostré":
   * sin esto, elegir sobre una lista recortada se ve igual que elegir sobre
   * todo el warehouse.
   */
  truncated: boolean
  limit: number
}

/** Thrown when the upstream answers with a non-2xx status. */
export class SyncApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "SyncApiError"
  }
}

function config() {
  const baseUrl = process.env.SYNC_API_URL?.replace(/\/+$/, "")
  const apiKey = process.env.SYNC_API_KEY

  if (!baseUrl || !apiKey) {
    throw new SyncApiError(
      "SYNC_API_URL / SYNC_API_KEY are not configured on the server",
      500
    )
  }
  return { baseUrl, apiKey }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, apiKey } = config()

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "X-Sync-Key": apiKey,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })

  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // n8n answers HTML on some failures; keep the raw text for the message.
  }

  if (!res.ok) {
    const message =
      (json as { error?: string; message?: string } | null)?.error ??
      (json as { error?: string; message?: string } | null)?.message ??
      text.slice(0, 200) ??
      res.statusText
    throw new SyncApiError(message, res.status)
  }

  return json as T
}

export interface ListRunsParams {
  limit?: number
  offset?: number
  status?: string
}

export function listRuns(params: ListRunsParams = {}): Promise<SyncRunsPage> {
  const qs = new URLSearchParams()
  if (params.limit != null) qs.set("limit", String(params.limit))
  if (params.offset != null) qs.set("offset", String(params.offset))
  if (params.status) qs.set("status", params.status)

  const query = qs.toString()
  // No route parameters → plain path. Adding the webhook id here yields a 404.
  return call<SyncRunsPage>(`/primeiq/sync/runs${query ? `?${query}` : ""}`)
}

export function getRun(runId: string): Promise<SyncRunDetail> {
  // Has a route parameter → must go through the webhook id.
  return call<SyncRunDetail>(
    `/${WEBHOOK_IDS.runDetail}/primeiq/sync/runs/${encodeURIComponent(runId)}`
  )
}

export interface TriggerParams {
  requestedBy: string
  /** Only "push" runs today; upstream refuses anything else. */
  operation: SyncOperation
  /** Sólo "housing" corre hoy; el portero de n8n rechaza el resto. */
  domain?: SyncDomain
  /** Empty or omitted means EVERY block in Strapi. */
  blockIds?: string[]
  force?: boolean
}

export interface TriggerResult {
  runId: string
  status: SyncRunStatus
}

/**
 * Starts a writeback run. Answers as soon as the run is recorded — resolving the
 * targets and writing to MySQL happen afterwards, driven by the drainer.
 *
 * Upstream answers 409 when a run is already active: only one writeback may
 * touch the warehouse at a time, and that is enforced by a partial unique index
 * in Postgres, not by this call.
 */
export function triggerWriteback(params: TriggerParams): Promise<TriggerResult> {
  const body: Record<string, unknown> = {
    requestedBy: params.requestedBy,
    operation: params.operation,
    domain: params.domain ?? "housing",
  }
  // An empty array would read as "no targets"; the contract wants the key absent
  // to mean "every block".
  if (params.blockIds?.length) body.blockIds = params.blockIds
  if (params.force) body.force = true

  return call<TriggerResult>("/primeiq/sync/writeback", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/** One object left in S3 by a run, as the browser shows it. */
export interface SyncRunFile {
  key: string
  fileName: string
  blockDocumentId: string | null
  kind: "mysql-snapshot" | "strapi-source" | "written" | "apply-result" | "other"
  executionId: number | null
  size: number
  lastModified: string | null
  /**
   * The snapshot that is safe to restore this block from: the FIRST attempt.
   * A retry snapshots rows the previous attempt may already have written, so a
   * later file captures post-write state and restoring from it silently
   * reinstates the new data. Decided upstream, over the whole run, because it is
   * a per-block minimum and the UI only ever holds a subset.
   */
  restorable: boolean
}

export interface SyncRunFilesPage {
  runId: string
  prefix: string
  files: SyncRunFile[]
  total: number
  /** True when the run held more objects than the upstream cap returns. */
  truncated: boolean
  cap: number
}

/**
 * Lists every artifact a run wrote to S3. The folder tree the operator navigates
 * is built from these keys in the browser — one request, no round trip per level.
 */
export function listRunFiles(runId: string): Promise<SyncRunFilesPage> {
  return call<SyncRunFilesPage>(
    `/${WEBHOOK_IDS.snapshots}/primeiq/sync/runs/${encodeURIComponent(runId)}/snapshots`
  )
}

/**
 * Fetches one artifact's bytes.
 *
 * Returns the raw Response rather than parsed data: these files are what an
 * operator may restore from, so they are streamed through untouched. Parsing and
 * re-encoding here would hand back something that is no longer byte-identical to
 * what S3 holds.
 */
export async function fetchRunFile(runId: string, key: string): Promise<Response> {
  const { baseUrl, apiKey } = config()
  const qs = new URLSearchParams({ key })

  const res = await fetch(
    `${baseUrl}/${WEBHOOK_IDS.snapshotFile}/primeiq/sync/runs/${encodeURIComponent(runId)}/snapshot?${qs}`,
    { cache: "no-store", headers: { "X-Sync-Key": apiKey } }
  )

  if (!res.ok) {
    const text = await res.text()
    let message = text.slice(0, 200)
    try {
      const json = JSON.parse(text) as { error?: string }
      if (json?.error) message = json.error
    } catch {
      // n8n answers HTML on some failures; the raw text is the better message.
    }
    throw new SyncApiError(message || res.statusText, res.status)
  }

  return res
}

export interface ReleaseResult {
  released: boolean
  releasedBlocks?: number
}

/**
 * Force-closes an active run: marks it failed, closes its outstanding blocks and
 * frees `sync_runs_one_active_idx` so a new writeback can start.
 *
 * It does NOT abort work already in flight. A Block Worker that already claimed
 * its block finishes its transaction and can write `done` over the `failed`.
 * This closes the ledger, not the writes — anything shown to the operator has to
 * say so.
 *
 * Upstream answers 409 when the run was not active any more, which is a normal
 * race (someone acting on a stale tab), not a server fault.
 */
export function releaseRun(runId: string): Promise<ReleaseResult> {
  return call<ReleaseResult>(
    `/${WEBHOOK_IDS.release}/primeiq/sync/runs/${encodeURIComponent(runId)}/release`,
    { method: "POST" }
  )
}

/**
 * Universo de bloques del warehouse, agrupado en proyectos — la fuente del
 * selector de un pull.
 *
 * Es el espejo de `getBlocksLite` contra Strapi, que alimenta el selector de
 * push. Un pull trae datos de MySQL, así que elegir sobre la lista de Strapi
 * ofrecería bloques que el warehouse no tiene y escondería los que sí.
 */
export function listSqlProjects(
  params: { country?: string; search?: string; limit?: number; domain?: SyncDomain } = {}
) {
  const qs = new URLSearchParams()
  // El dominio elige la tabla de universo del otro lado. Va siempre para que el
  // selector y la corrida miren el MISMO universo: elegir sobre uno y disparar
  // sobre otro sería ofrecer bloques que la corrida no va a encontrar.
  qs.set("domain", params.domain ?? "housing")
  if (params.country) qs.set("country", params.country)
  if (params.search) qs.set("search", params.search)
  if (params.limit != null) qs.set("limit", String(params.limit))

  const query = qs.toString()
  // Sin parámetros de ruta → path plano. Anteponer el webhook id acá da 404.
  return call<SqlProjectsPage>(`/primeiq/sync/sql/projects${query ? `?${query}` : ""}`)
}
