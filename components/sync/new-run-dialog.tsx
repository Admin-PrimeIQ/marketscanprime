"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Factory,
  Home,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/context/AuthContext"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"
import { getSession } from "@/lib/auth/auth"
import type { SqlProjectsPage } from "@/lib/sync/runs-api"
import { dataClient } from "@/lib/api/client"
import {
  countryFlag,
  getBlockRegion,
  getProjectRegions,
  REGION_BADGE_CLASS,
  type BlockRegion,
} from "@/lib/region"

/** Lo mínimo para elegir un bloque. Ver `getBlocksLite`. */
/** Un proyecto tal como se lista: con su país y las regiones que abarcan sus bloques. */
interface ProjectRow {
  id: string
  name: string
  countryIso: string
  countryName: string
  regions: BlockRegion[]
}

type BlockIndex = Record<
  string,
  {
    code: string
    name: string
    projectId: string
    projectName: string
    region: BlockRegion
    countryIso: string
    countryName: string
  }
>

interface PickerBlock {
  documentId: string
  code?: string
  name?: string
  /** De acá sale la región: T1–T4 es GAM, S1/S2 es Interior. */
  quarter?: string | null
  project?: {
    documentId: string
    name?: string
    country?: { name?: string; isoCode2?: string } | null
  }
}

type Region = "GAM" | "Interior"

/**
 * A run has a operation. `push` sends what the admin edited in Strapi to the
 * MySQL warehouse; `pull` will bring warehouse rows back into Strapi.
 *
 * Only `push` exists today — the pipeline, the ledger and the block worker all
 * write in that operation. `pull` is shown so the concept is visible where the
 * choice is made, and is disabled rather than hidden: an operator who expects it
 * should see that it is planned, not conclude the tool cannot do it. The API
 * route rejects any operation other than `push`, so the gate does not depend on
 * this control staying disabled.
 */
type Operation = "push" | "pull" | "purge"

type Domain = "housing" | "office" | "industrial"

/**
 * Qué acciones puede correr CADA tipo de inmueble.
 *
 * El tipo se elige primero porque decide de qué tablas del warehouse se habla.
 * Por eso el mapa es por tipo y no una lista plana: vivienda y oficinas van y
 * vienen, e `industrial` sólo se trae. Oficinas pasó por esa misma etapa.
 *
 * La ruta del API valida el mismo par, así que la puerta no depende de que este
 * control esté bien: acá sólo se evita ofrecer lo que después se rechaza.
 *
 * Los tres corren en las dos direcciones. El mapa sigue siendo por tipo y no
 * una lista plana porque ya se separó una vez —oficinas y después industrial
 * pasaron por una etapa de sólo pull— y volverá a separarse con el próximo.
 */
const ACCIONES_POR_TIPO: Record<Domain, readonly Operation[]> = {
  housing: ["push", "pull"],
  office: ["push", "pull"],
  industrial: ["push", "pull"],
}

/**
 * Cabecera de paso. El diálogo es una cascada —tipo, acción, alcance— y cada
 * paso decide las opciones del siguiente, así que se numeran y se apagan hasta
 * que el anterior está resuelto: ofrecer los tres a la vez invita a elegir un
 * alcance sobre un universo que todavía no se sabe cuál es.
 */
function PasoTitulo({ n, titulo, activo }: { n: number; titulo: string; activo: boolean }) {
  return (
    <span
      className={`flex items-center gap-2 text-xs font-medium ${
        activo ? "text-foreground" : "text-muted-foreground/60"
      }`}
    >
      <span
        className={`flex size-5 items-center justify-center rounded-full border text-[11px] ${
          activo ? "border-primary text-primary" : "border-border"
        }`}
      >
        {n}
      </span>
      {titulo}
    </span>
  )
}

/**
 * Alto de las dos listas del selector.
 *
 * `h-44` son 176px: seis filas de 28px —`py-1` sobre un contenido de 20px— más
 * los 8px de padding del contenedor. Se acota a seis porque con once el diálogo
 * se pasaba de `max-h-[90vh]` en una laptop y el cuerpo tenía que desplazarse
 * entero, que es peor que desplazar sólo la lista.
 *
 * Las dos comparten el valor a propósito, y por eso es una constante y no dos
 * clases sueltas: son columnas hermanas, y una más alta que la otra deja un
 * hueco que se lee como un error de carga.
 */
const ALTO_LISTAS = "h-44"

const BLOCK_PAGE_SIZE = 2000
/** Tope: 10.000 bloques sobre un universo de ~1.330. Si se alcanza, se avisa. */
const MAX_BLOCK_PAGES = 5

export function NewRunDialog({
  disabled,
  disabledReason,
  onStarted,
}: {
  disabled?: boolean
  disabledReason?: string
  onStarted?: () => void
}) {
  const t = useTranslations("sync")
  const { user } = useAuth()

  const [open, setOpen] = useState(false)
  // Nada preseleccionado: el primer paso es una decisión, no un default que
  // alguien acepta sin mirar.
  const [operation, setOperation] = useState<Operation>()
  const [domain, setDomain] = useState<Domain>()
  // Everything is the default: unticking it reveals the picker.
  const [allBlocks, setAllBlocks] = useState(true)
  const [isStarting, setIsStarting] = useState(false)

  // Filters
  const [search, setSearch] = useState("")
  const [region, setRegion] = useState<Region | undefined>()
  const [country, setCountry] = useState<string | undefined>()
  const [countries, setCountries] = useState<Array<{ documentId: string; name: string }>>([])

  // Data
  /** Proyectos derivados de los bloques cargados, ordenados por nombre. */
  const [projectList, setProjectList] = useState<ProjectRow[]>([])

  /**
   * Expanding a project and selecting it are DIFFERENT actions. Before, ticking
   * the checkbox was the only way to see what was inside, so nobody could look
   * without also committing every block to the run.
   */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  /** Blocks per project, kept once loaded so re-expanding costs nothing. */
  const [blocksByProject, setBlocksByProject] = useState<Record<string, PickerBlock[]>>({})
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false)
  const [truncated, setTruncated] = useState(false)

  /**
   * The selection is a set of BLOCKS, not of projects. A project checkbox is a
   * shortcut over its blocks, so "half a project" is representable and the
   * summary can group without inventing state.
   */
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set())
  /** Everything ever loaded, so the summary can render a block whose project is collapsed. */
  const [blockIndex, setBlockIndex] = useState<BlockIndex>({})

  const canTrigger = isStrapiSuperAdmin(user?.role)

  useEffect(() => {
    if (!open) return
    dataClient
      .getCatalogList("countries", { pageSize: 100, sort: "name:asc" })
      .then((res) =>
        setCountries(
          (res?.data ?? []).flatMap((c) =>
            c.documentId ? [{ documentId: c.documentId, name: c.name }] : []
          )
        )
      )
      .catch(() => setCountries([]))
  }, [open])

  /**
   * Every block that passes the filters, in one load, grouped by project.
   *
   * Loaded in bulk rather than per project because the COUNT has to be on screen
   * before anyone expands: knowing whether a project holds one block or forty is
   * the point of the number, and it cannot be known without having fetched them.
   *
   * Uses `getBlocksLite`, not `getBlocks`: the latter populates project→country,
   * blockCategory, blockFocus and blockStatus and returns every block field —
   * 1,277 KB and ~1.8 s per page of 500, so three pages meant ~5.4 s of blank
   * list before anything could be shown. None of those relations are used here.
   * The lean query fits the whole universe in ONE request of ~276 KB.
   *
   * Cached per filter combination: reopening the dialog, or toggling "all
   * blocks" off and on, costs nothing. Search is not part of the key — it
   * narrows the list in memory.
   */
    const cacheRef = useRef<
    Map<
      string,
      {
        projects: ProjectRow[]
        byProject: Record<string, PickerBlock[]>
        index: BlockIndex
        truncated: boolean
      }
    >
  >(new Map())

  useEffect(() => {
    if (!open || allBlocks || !operation || !domain) return
    // La operación entra en la llave: push y pull leen universos distintos
    // —Strapi y MySQL— y compartir caché mostraría los bloques del otro. El
    // dominio, por lo mismo: elige otra tabla de universo del lado de SQL.
    const key = `${operation}|${domain}|${region ?? ""}|${country ?? ""}`

    const cached = cacheRef.current.get(key)
    if (cached) {
      setProjectList(cached.projects)
      setBlocksByProject(cached.byProject)
      setBlockIndex(cached.index)
      setTruncated(cached.truncated)
      setIsLoadingBlocks(false)
      return
    }

    let cancelled = false
    setIsLoadingBlocks(true)
    setTruncated(false)

    /**
     * Un pull trae datos de MySQL, así que se elige sobre el warehouse y no
     * sobre Strapi: la lista de Strapi ofrecería bloques que el warehouse no
     * tiene y escondería los que sí.
     *
     * Se normaliza a las MISMAS estructuras del camino de push (`ProjectRow`,
     * `PickerBlock`, `BlockIndex`) para que el árbol, los filtros y el panel de
     * selección sirvan igual. Lo único que cambia es la identidad: acá la llave
     * es `cod_proyecto`, que es con lo que el pull une contra `block.legacyId`.
     */
    const loadFromSql = async () => {
      const token = getSession()?.token
      const qs = new URLSearchParams()
      // El dominio decide la tabla de universo del otro lado. Va siempre para
      // que el selector y la corrida miren el MISMO universo.
      qs.set("domain", domain)
      // La ruta de SQL filtra por NOMBRE de país; el selector guarda el
      // documentId de Strapi, así que se traduce con la lista ya cargada.
      const nombrePais = country ? countries.find((c) => c.documentId === country)?.name : undefined
      if (nombrePais) qs.set("country", nombrePais)

      const res = await fetch(`/api/sync/sql-projects${qs.toString() ? `?${qs}` : ""}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const json = (await res.json().catch(() => null)) as SqlProjectsPage | { error?: string } | null
      if (!res.ok) throw new Error((json as { error?: string })?.error ?? `HTTP ${res.status}`)

      const page = json as SqlProjectsPage
      const byProject: Record<string, PickerBlock[]> = {}
      const index: BlockIndex = {}
      const projects: ProjectRow[] = []

      for (const proj of page.projects ?? []) {
        // La región no viaja como filtro a SQL —la consulta agruparía igual— y
        // se aplica acá, sobre el trimestre que cada bloque ya trae.
        const bloques = (proj.blocks ?? []).filter(
          (b) => !region || getBlockRegion(b.quarter) === region
        )
        if (bloques.length === 0) continue

        byProject[proj.key] = bloques.map((b) => ({
          documentId: b.codProyecto,
          code: b.codProyecto,
          name: b.name,
          quarter: b.quarter,
          project: { documentId: proj.key, name: proj.name, country: { name: proj.country } },
        }))

        for (const b of bloques) {
          index[b.codProyecto] = {
            code: b.codProyecto,
            name: b.name,
            projectId: proj.key,
            projectName: proj.name,
            region: getBlockRegion(b.quarter),
            // El warehouse guarda el país como texto, no un ISO. Sin código no
            // hay bandera, y es preferible a inventar una equivocada.
            countryIso: "",
            countryName: proj.country,
          }
        }

        projects.push({
          id: proj.key,
          name: proj.name,
          countryIso: "",
          countryName: proj.country,
          regions: getProjectRegions(byProject[proj.key]),
        })
      }

      projects.sort((a, b) => a.name.localeCompare(b.name))
      return { projects, byProject, index, truncated: Boolean(page.truncated) }
    }

    const loadAll = async () => {
      const acc: PickerBlock[] = []
      // El pageSize grande casi siempre resuelve en una sola vuelta; el bucle
      // queda como red por si el universo crece, no como camino habitual.
      for (let page = 1; page <= MAX_BLOCK_PAGES; page++) {
        // El dominio va SIEMPRE: el backend acota los objetivos por dominio, así
        // que ofrecer bloques de otro tipo mostraría opciones que la corrida
        // después ignora sin decir nada.
        const res = await dataClient.getBlocksLite({ page, pageSize: BLOCK_PAGE_SIZE, region, country, domain })
        acc.push(...(res?.data ?? []))
        const total = res?.meta?.pagination?.total ?? acc.length
        if (acc.length >= total) return { blocks: acc, truncated: false }
        if (page === MAX_BLOCK_PAGES) return { blocks: acc, truncated: true }
      }
      return { blocks: acc, truncated: false }
    }

    if (operation === "pull") {
      loadFromSql()
        .then((r) => {
          if (cancelled) return
          cacheRef.current.set(key, r)
          setProjectList(r.projects)
          setBlocksByProject(r.byProject)
          setBlockIndex(r.index)
          setTruncated(r.truncated)
        })
        .catch(() => {
          if (!cancelled) {
            setProjectList([])
            setBlocksByProject({})
            setBlockIndex({})
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoadingBlocks(false)
        })
      return () => {
        cancelled = true
      }
    }

    loadAll()
      .then(({ blocks, truncated: cut }) => {
        if (cancelled) return
        const byProject: Record<string, PickerBlock[]> = {}
        const index: BlockIndex = {}

        for (const b of blocks) {
          const pid = b.project?.documentId
          if (!pid || !b.documentId) continue
          ;(byProject[pid] ??= []).push(b)
          index[b.documentId] = {
            code: b.code || b.documentId.slice(0, 8),
            name: b.name ?? "",
            projectId: pid,
            projectName: b.project?.name ?? pid,
            region: getBlockRegion(b.quarter),
            countryIso: b.project?.country?.isoCode2 ?? "",
            countryName: b.project?.country?.name ?? "",
          }
        }

        // La lista de proyectos sale de los bloques, no de /projects: así no hay
        // tope de página que oculte proyectos (son ~892 contra un pageSize de
        // 100), y un proyecto aparece si y sólo si tiene bloques que pasan los
        // filtros — que es exactamente lo que se puede elegir.
        const projects = Object.entries(byProject)
          .map(([id, list]) => ({
            id,
            name: list[0]?.project?.name ?? id,
            countryIso: list[0]?.project?.country?.isoCode2 ?? "",
            countryName: list[0]?.project?.country?.name ?? "",
            // Un proyecto puede abarcar más de una región: sus bloques se
            // reparten por quarter, así que se muestran todas las que tenga.
            regions: getProjectRegions(list),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))

        cacheRef.current.set(key, { projects, byProject, index, truncated: cut })
        setProjectList(projects)
        setBlocksByProject(byProject)
        setBlockIndex(index)
        setTruncated(cut)
      })
      .catch(() => {
        if (!cancelled) {
          setProjectList([])
          setBlocksByProject({})
          setBlockIndex({})
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBlocks(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, allBlocks, region, country, operation, domain, countries])

  const toggleExpand = (projectId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })

  const toggleBlock = (blockId: string) =>
    setSelectedBlocks((prev) => {
      const next = new Set(prev)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })

  /** The project checkbox is a shortcut over its blocks: selects or clears all. */
  const toggleProject = (projectId: string, select: boolean) => {
    const ids = (blocksByProject[projectId] ?? [])
      .map((b) => b.documentId)
      .filter(Boolean) as string[]
    setSelectedBlocks((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  /** How much of a project is in the run — drives its counter and checkbox. */
  const projectSelection = (projectId: string) => {
    const ids = (blocksByProject[projectId] ?? [])
      .map((b) => b.documentId)
      .filter(Boolean) as string[]
    return { total: ids.length, picked: ids.filter((id) => selectedBlocks.has(id)).length }
  }

  /** Filtrado local: los ~892 proyectos ya están en memoria. */
  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? projectList.filter((pr) => pr.name.toLowerCase().includes(term)) : projectList
  }, [projectList, search])

  /** Bloques de los proyectos visibles ahora — lo que abarca el check de arriba. */
  const visibleStats = useMemo(() => {
    let total = 0
    let picked = 0
    for (const pr of visibleProjects) {
      for (const b of blocksByProject[pr.id] ?? []) {
        if (!b.documentId) continue
        total += 1
        if (selectedBlocks.has(b.documentId)) picked += 1
      }
    }
    return { total, picked }
  }, [visibleProjects, blocksByProject, selectedBlocks])

  /**
   * Marca o desmarca todo lo filtrado. Desmarcar sólo quita lo visible: si hay
   * un filtro puesto, borrar también lo que quedó fuera de pantalla sería el
   * selector deshaciendo una selección que nadie está viendo.
   */
  const toggleAllVisible = (select: boolean) => {
    const ids = visibleProjects.flatMap((pr) =>
      (blocksByProject[pr.id] ?? []).map((b) => b.documentId).filter(Boolean)
    ) as string[]
    setSelectedBlocks((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const chosenBlockIds = useMemo(() => [...selectedBlocks], [selectedBlocks])

  /** The selection grouped by project — what the right-hand panel renders. */
  const grouped = useMemo(() => {
    const byProject = new Map<
      string,
      {
        name: string
        countryIso: string
        countryName: string
        blocks: Array<{ id: string; code: string; name: string; region: BlockRegion }>
      }
    >()
    for (const id of selectedBlocks) {
      const meta = blockIndex[id]
      if (!meta) continue
      if (!byProject.has(meta.projectId)) {
        byProject.set(meta.projectId, {
          name: meta.projectName,
          countryIso: meta.countryIso,
          countryName: meta.countryName,
          blocks: [],
        })
      }
      byProject.get(meta.projectId)!.blocks.push({
        id,
        code: meta.code,
        name: meta.name,
        region: meta.region,
      })
    }
    for (const g of byProject.values()) g.blocks.sort((a, b) => a.name.localeCompare(b.name))
    return [...byProject.entries()]
      .map(([projectId, g]) => ({ projectId, ...g }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [selectedBlocks, blockIndex])

  const reset = useCallback(() => {
    setOperation(undefined)
    setDomain(undefined)
    setAllBlocks(true)
    setSearch("")
    setRegion(undefined)
    setCountry(undefined)
    setExpanded(new Set())
    setProjectList([])
    setBlocksByProject({})
    setIsLoadingBlocks(false)
    setTruncated(false)
    setSelectedBlocks(new Set())
    setBlockIndex({})
  }, [])

  const start = async () => {
    setIsStarting(true)
    try {
      const token = getSession()?.token
      const res = await fetch("/api/sync/runs", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Omitting blockIds is what means "every block" upstream; an empty array
        // would read as "no targets".
        body: JSON.stringify({
          operation,
          domain,
          ...(allBlocks ? {} : { blockIds: chosenBlockIds }),
        }),
      })
      const json = await res.json().catch(() => null)

      if (res.status === 409) {
        toast.error(t("startConflict"))
        return
      }
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)

      toast.success(t("startDone"))
      setOpen(false)
      reset()
      onStarted?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStarting(false)
    }
  }

  if (!canTrigger) return null

  const nothingChosen = !allBlocks && chosenBlockIds.length === 0

  /**
   * Cambiar de operación limpia la selección.
   *
   * Push identifica bloques por `documentId` de Strapi y pull por
   * `cod_proyecto` de MySQL. Arrastrar la selección de una a otra dejaría llaves
   * que no existen en el universo nuevo: el panel mostraría bloques fantasma y
   * la corrida se dispararía contra objetivos que no resuelven.
   */
  const chooseOperation = (next: Operation) => {
    if (next === operation) return
    setOperation(next)
    setSelectedBlocks(new Set())
    setExpanded(new Set())
    setSearch("")
  }

  const chooseDomain = (next: Domain) => {
    if (next === domain) return
    setDomain(next)
    // La acción ya elegida puede no correr en el tipo nuevo —oficinas no sube—.
    // Se vuelve a pedir en vez de dejarla marcada: el API la rechazaría, pero
    // recién al disparar, con los bloques ya elegidos.
    if (operation && !ACCIONES_POR_TIPO[next].includes(operation)) setOperation(undefined)
    setSelectedBlocks(new Set())
    setExpanded(new Set())
    setSearch("")
  }

  /**
   * Push y pull ya se pueden disparar; `purge` no, porque borraría en cascada
   * dentro de Strapi y todavía no existe. Falta también el tipo de inmueble:
   * sin él la corrida no sabe qué tablas mirar. La ruta del API valida las dos
   * cosas, así que la puerta no depende de estos controles.
   */
  const canStart = Boolean(domain) && (operation === "push" || operation === "pull")

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        <Play />
        {t("newRun")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) reset()
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("newRunTitle")}</DialogTitle>
            <DialogDescription>{t("newRunDescription")}</DialogDescription>
          </DialogHeader>

          {/* El cuerpo se desplaza, como red de seguridad. Las listas tienen alto
              fijo (`ALTO_LISTAS`) y con seis filas el diálogo entra en una
              laptop, así que normalmente no aparece barra acá; en una pantalla
              más baja sí. Sin esto no hay corte ni barra: el contenido se sale
              del diálogo y se encima con el pie. `pr-1` deja aire para la barra. */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {/* PASO 1 — el tipo de inmueble va primero porque enmarca todo lo
                demás: decide de qué universo del warehouse se habla, y con eso,
                qué acciones tienen sentido. Sin elegirlo, nada en la pantalla
                dice si lo que se ve son viviendas u oficinas.

                Los tres corren hoy —industrial sólo de bajada—, así que los
                tres se eligen. La rama apagada de abajo queda igual: es para un
                tipo sin ninguna acción, y el warehouse tiene tablas que todavía
                no tienen mapper en ningún sentido. */}
            <div className="flex flex-col gap-2">
              <PasoTitulo n={1} titulo={t("domainLabel")} activo />
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { valor: "housing", clave: "domainHousing", Icono: Home },
                    { valor: "office", clave: "domainOffice", Icono: Building2 },
                    { valor: "industrial", clave: "domainIndustrial", Icono: Factory },
                  ] as const
                ).map(({ valor, clave, Icono }) => {
                  if (ACCIONES_POR_TIPO[valor].length === 0) {
                    return (
                      <div
                        key={valor}
                        aria-disabled
                        title={t("domainSoonHint")}
                        className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-border px-3 py-1.5 text-sm opacity-60"
                      >
                        <Icono className="size-4" />
                        {t(clave)}
                        <Badge variant="secondary" className="font-normal">
                          {t("operationSoon")}
                        </Badge>
                      </div>
                    )
                  }
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => chooseDomain(valor)}
                      aria-pressed={domain === valor}
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                        domain === valor
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Icono className="size-4" />
                      {t(clave)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* PASO 2 — la acción. Apagada hasta que hay tipo, porque las
                opciones dependen de él: vivienda va y viene, oficinas por ahora
                sólo se trae. Las tres tarjetas se muestran siempre; la que no
                corre lleva su razón encima, que es distinta de "todavía no
                existe". */}
            {/* La rama del chip apagado sigue existiendo aunque hoy ninguna
                combinación la use: `industrial` va a entrar primero por el pull,
                como entró oficinas, y ahí vuelve a hacer falta. Por eso su copia
                es genérica y no habla de vivienda. */}
            <div
              className={`flex flex-col gap-2 ${domain ? "" : "pointer-events-none select-none opacity-50"}`}
              aria-disabled={!domain}
            >
              <PasoTitulo n={2} titulo={t("operationLabel")} activo={Boolean(domain)} />
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    { valor: "push", Icono: ArrowUpFromLine },
                    { valor: "pull", Icono: ArrowDownToLine },
                  ] as const
                ).map(({ valor, Icono }) => {
                  const corre = !domain || ACCIONES_POR_TIPO[domain].includes(valor)
                  const clave = valor === "push" ? "operationPush" : "operationPull"
                  if (!corre) {
                    return (
                      <div
                        key={valor}
                        aria-disabled
                        title={t("operationOnlyHousing")}
                        className="flex cursor-not-allowed flex-col gap-1 rounded-md border border-dashed border-border p-3 opacity-60"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Icono className="size-4" />
                          {t(clave)}
                          <Badge variant="secondary" className="font-normal">
                            {t("operationOnlyHousingBadge")}
                          </Badge>
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {t(`${clave}Flow`)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("operationOnlyHousing")}
                        </span>
                      </div>
                    )
                  }
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => chooseOperation(valor)}
                      aria-pressed={operation === valor}
                      className={`flex flex-col gap-1 rounded-md border p-3 text-left transition-colors ${
                        operation === valor
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Icono className="size-4" />
                        {t(clave)}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {t(`${clave}Flow`)}
                      </span>
                      <span className="text-xs text-muted-foreground">{t(`${clave}Hint`)}</span>
                    </button>
                  )
                })}

                {/* La purga borra en Strapi. Va en rojo y con su propia
                    advertencia porque no se parece a las otras dos: no mueve
                    datos, los destruye, y hoy no hay respaldo del que volver. */}
                <div
                  aria-disabled
                  title={t("operationSoon")}
                  className="flex cursor-not-allowed flex-col gap-1 rounded-md border border-dashed border-red-500/40 p-3 opacity-60"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Trash2 className="size-4 text-red-600 dark:text-red-400" />
                    {t("operationPurge")}
                    <Badge variant="secondary" className="font-normal">
                      {t("operationSoon")}
                    </Badge>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {t("operationPurgeFlow")}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("operationPurgeHint")}</span>
                </div>
              </div>
            </div>

            {/* PASO 3 — el alcance. Apagado hasta que hay acción, porque la
                lista de bloques sale de un lado u otro según cuál sea: push
                elige sobre Strapi y pull sobre el warehouse. */}
            <div
              className={`flex flex-col gap-3 ${
                operation ? "" : "pointer-events-none select-none opacity-50"
              }`}
              aria-disabled={!operation}
            >
              <PasoTitulo n={3} titulo={t("scopeLabel")} activo={Boolean(operation)} />

              {/* Debajo de las tarjetas y no encima: el aviso explica de dónde sale
                  la lista que viene abajo, no la elección de operación.

                  Un pull BORRA en Strapi las unidades que el warehouse no tiene,
                  incluidas las creadas a mano en el admin. Es lo que se pidió
                  —SQL como fuente de verdad— y por eso se dice antes de elegir,
                  no después. */}
              {operation === "pull" && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  {t("pullWarning")}
                </p>
              )}

              {/* All-blocks switch: on by default, unticking reveals the picker */}
              <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="all-blocks" className="cursor-pointer">
                    {t("allBlocks")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t("allBlocksHint")}</p>
                </div>
                <Switch id="all-blocks" checked={allBlocks} onCheckedChange={setAllBlocks} />
              </div>

              {allBlocks ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                  {t(operation === "pull" ? "allBlocksWarningPull" : "allBlocksWarningPush")}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Filters — same vocabulary as the blocks list */}
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={t("searchProjects")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={`pl-10 ${search ? "pr-10" : ""}`}
                      />
                      {search && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                          onClick={() => setSearch("")}
                        >
                          <X className="size-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {(["GAM", "Interior"] as const).map((r) => (
                        <Button
                          key={r}
                          size="sm"
                          variant={region === r ? "default" : "outline"}
                          className={
                            region === r
                              ? r === "GAM"
                                ? "bg-blue-600 hover:bg-blue-700 text-white"
                                : "bg-orange-500 hover:bg-orange-600 text-white"
                              : ""
                          }
                          onClick={() => setRegion(region === r ? undefined : r)}
                        >
                          {r}
                        </Button>
                      ))}
                      {countries.length > 0 && <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />}
                      {countries.map((c) => (
                        <Button
                          key={c.documentId}
                          size="sm"
                          variant={country === c.documentId ? "default" : "outline"}
                          className={
                            country === c.documentId ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                          }
                          onClick={() => setCountry(country === c.documentId ? undefined : c.documentId)}
                        >
                          {c.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Izquierda: proyectos, cada uno plegable e independiente del check.
                      Derecha: sólo lo seleccionado, agrupado por proyecto. */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex min-h-0 flex-col gap-2">
                      <div className="flex items-center gap-2">
                        {/* Actúa sobre lo que está filtrado AHORA, no sobre el
                            universo: si hay un filtro puesto, marcar "todo" tiene
                            que significar todo lo que se ve. */}
                        <Checkbox
                          checked={visibleStats.total > 0 && visibleStats.picked === visibleStats.total}
                          disabled={visibleStats.total === 0}
                          onCheckedChange={(v) => toggleAllVisible(v === true)}
                          aria-label={t("selectAllVisible")}
                        />
                        <Label className="text-xs uppercase text-muted-foreground">
                          {t("projects")}
                        </Label>
                        {visibleStats.total > 0 && (
                          <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                            {visibleStats.picked}/{visibleStats.total}
                          </span>
                        )}
                      </div>
                      <ScrollArea className={`${ALTO_LISTAS} rounded-md border border-border`}>
                        {/* w-full + min-w-0 en toda la cadena: sin esto un nombre
                            largo ensancha la fila, empuja el contador fuera de
                            vista y no hay scroll horizontal que lo rescate. */}
                        <div className="flex w-full min-w-0 flex-col p-1 pr-2">
                          {isLoadingBlocks ? (
                            Array.from({ length: 6 }).map((_, i) => (
                              <Skeleton key={i} className="m-1 h-8" />
                            ))
                          ) : visibleProjects.length === 0 ? (
                            <p className="p-4 text-center text-sm text-muted-foreground">
                              {t("noProjectsFound")}
                            </p>
                          ) : (
                            visibleProjects.map((project) => {
                              const pid = project.id
                              const { total, picked } = projectSelection(pid)
                              const list = blocksByProject[pid] ?? []
                              // Un proyecto de un solo bloque no tiene nada que
                              // revelar: el bloque ES el proyecto. Sin chevron, no
                              // se ofrece un gesto que no cambia nada.
                              const expandable = total > 1
                              const isOpen = expandable && expanded.has(pid)

                              return (
                                <div key={pid} className="min-w-0 rounded">
                                  <div className="flex min-w-0 items-center gap-1 px-1 py-1 hover:bg-muted/60">
                                    {expandable ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleExpand(pid)}
                                        aria-expanded={isOpen}
                                        aria-label={isOpen ? t("collapse") : t("expand")}
                                        className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                                      >
                                        {isOpen ? (
                                          <ChevronDown className="size-3.5 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="size-3.5 text-muted-foreground" />
                                        )}
                                      </button>
                                    ) : (
                                      <span className="size-5 shrink-0" aria-hidden />
                                    )}

                                    <Checkbox
                                      checked={total > 0 && picked === total}
                                      disabled={total === 0}
                                      onCheckedChange={(v) => toggleProject(pid, v === true)}
                                      aria-label={project.name}
                                    />
                                    {/* Bandera y región van ANTES del nombre: son de
                                        ancho fijo, así el nombre es lo único que cede
                                        y nada queda apretado contra el borde. Con las
                                        pastillas a la derecha competían con el
                                        contador por el mismo hueco y se cortaban. */}
                                    {project.countryIso && (
                                      <span title={project.countryName} className="shrink-0">
                                        {countryFlag(project.countryIso)}
                                      </span>
                                    )}
                                    {/* Un proyecto puede abarcar las dos regiones */}
                                    {project.regions.map((r) => (
                                      <span
                                        key={r}
                                        className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${REGION_BADGE_CLASS[r]}`}
                                      >
                                        {r}
                                      </span>
                                    ))}
                                    <span
                                      className="min-w-0 flex-1 truncate text-sm"
                                      title={project.name}
                                    >
                                      {project.name}
                                    </span>

                                    {isLoadingBlocks ? (
                                      <Skeleton className="h-4 w-12 shrink-0" />
                                    ) : (
                                      /* Sólo el número: "13 bloques" ocupa ~50 px por
                                         fila y era lo que empujaba el contador fuera
                                         del panel. La palabra vive en el title, donde
                                         no cuesta ancho. */
                                      <span
                                        title={t("blockCount", {
                                          count: total,
                                          plural: total === 1 ? "" : "s",
                                        })}
                                        className={`shrink-0 text-right font-mono text-xs tabular-nums ${
                                          picked > 0 ? "text-foreground" : "text-muted-foreground"
                                        }`}
                                      >
                                        {picked > 0 && picked < total ? `${picked}/${total}` : total}
                                      </span>
                                    )}
                                  </div>

                                  {isOpen && (
                                    <div className="ml-5 flex min-w-0 flex-col border-l border-border pl-1.5">
                                      {list.map((b) => {
                                        const bid = b.documentId
                                        if (!bid) return null
                                        return (
                                          <label
                                            key={bid}
                                            className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/60"
                                          >
                                            <Checkbox
                                              checked={selectedBlocks.has(bid)}
                                              onCheckedChange={() => toggleBlock(bid)}
                                            />
                                            <span
                                              className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${
                                                REGION_BADGE_CLASS[getBlockRegion(b.quarter)]
                                              }`}
                                            >
                                              {getBlockRegion(b.quarter)}
                                            </span>
                                            <span
                                              className="min-w-0 flex-1 truncate text-xs"
                                              title={b.name ?? ""}
                                            >
                                              {b.name}
                                            </span>
                                            <span
                                              className="max-w-[40%] shrink truncate font-mono text-[11px] text-muted-foreground"
                                              title={b.code ?? ""}
                                            >
                                              {b.code || bid.slice(0, 8)}
                                            </span>
                                          </label>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      </ScrollArea>
                      {truncated && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {t("blocksTruncated", { max: BLOCK_PAGE_SIZE * MAX_BLOCK_PAGES })}
                        </p>
                      )}
                    </div>

                    <div className="flex min-h-0 flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs uppercase text-muted-foreground">
                          {t("selection")}
                        </Label>
                        {chosenBlockIds.length > 0 && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline underline-offset-2"
                            onClick={() => setSelectedBlocks(new Set())}
                          >
                            {t("clear")}
                          </button>
                        )}
                      </div>
                      <ScrollArea className={`${ALTO_LISTAS} rounded-md border border-border`}>
                        <div className="flex w-full min-w-0 flex-col p-2">
                          {grouped.length === 0 ? (
                            <p className="p-4 text-center text-sm text-muted-foreground">
                              {t("selectionEmpty")}
                            </p>
                          ) : (
                            grouped.map((g, i) => (
                              /* Separador entre proyectos: con una X por bloque más
                                 otra por proyecto, sin línea no se ve dónde termina
                                 un grupo y empieza el siguiente. */
                              <div
                                key={g.projectId}
                                className={`flex min-w-0 flex-col gap-1 py-2 ${
                                  i > 0 ? "border-t border-border" : ""
                                }`}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  {g.countryIso && (
                                    <span title={g.countryName} className="shrink-0">
                                      {countryFlag(g.countryIso)}
                                    </span>
                                  )}
                                  <span
                                    className="min-w-0 flex-1 truncate text-xs font-medium"
                                    title={g.name}
                                  >
                                    {g.name}
                                  </span>
                                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                                    {g.blocks.length}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void toggleProject(g.projectId, false)}
                                    aria-label={t("removeProject")}
                                    /* sin ml-auto: el nombre ya toma el sobrante con
                                       flex-1 y los dos peleaban por el mismo hueco */
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </div>
                                {/* Lista, no chips: el código no siempre describe al
                                    bloque, así que manda el nombre — y un nombre
                                    completo no entra en una pastilla. */}
                                <div className="flex min-w-0 flex-col">
                                  {g.blocks.map((b) => (
                                    <div
                                      key={b.id}
                                      className="group flex min-w-0 items-center gap-2 rounded px-1 py-1 hover:bg-muted/60"
                                    >
                                      <span
                                        className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${
                                          REGION_BADGE_CLASS[b.region]
                                        }`}
                                      >
                                        {b.region}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate text-xs" title={b.name}>
                                        {b.name}
                                      </span>
                                      <span
                                        className="max-w-[40%] truncate font-mono text-[11px] text-muted-foreground"
                                        title={b.code}
                                      >
                                        {b.code}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => toggleBlock(b.id)}
                                        title={t("remove")}
                                        aria-label={`${t("remove")}: ${b.name}`}
                                        className="shrink-0 text-muted-foreground hover:text-destructive"
                                      >
                                        <X className="size-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="secondary" className="tabular-nums">
                      {t("selectionSummary", {
                        blocks: chosenBlockIds.length,
                        projects: grouped.length,
                      })}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {t("willBeRecordedAs", { user: user?.email ?? "—" })}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isStarting}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => void start()}
              disabled={nothingChosen || isStarting || !canStart}
              title={!canStart ? t("operationSoon") : undefined}
            >
              {isStarting && <Loader2 className="animate-spin" />}
              {t("startRun")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
