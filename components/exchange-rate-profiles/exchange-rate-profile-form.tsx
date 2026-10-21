"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Save, Loader2, Search, RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  strapiClient,
  type StrapiCurrenciesComponent,
  type StrapiExchangeRateProfile,
  type StrapiProject,
  type BlockDomain,
} from "@/lib/api/strapi"
import { DOMAIN_BADGE_CLASS, DOMINIOS, domainLabelKey } from "@/lib/block-domain-ui"
import { CurrenciesTab } from "@/components/projects/form-tabs/currencies-tab"
import { CountryPill } from "@/components/ui/country-pill"
import { toast } from "@/hooks/use-toast"

interface ExchangeRateProfileFormProps {
  mode?: "create" | "edit"
  initialData?: Partial<StrapiExchangeRateProfile>
}

function projectKey(p: StrapiProject): string {
  return p.documentId || String(p.id ?? "")
}

function idsFromProjects(
  projects: NonNullable<StrapiExchangeRateProfile["projects"]>
): (string | number)[] {
  return projects
    .map((p) => p.documentId ?? p.id)
    .filter((x): x is string | number => x !== undefined && x !== null)
}

const slugify = (text: string): string => {
  if (!text || typeof text !== "string") return ""
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

async function fetchAllProjects(): Promise<StrapiProject[]> {
  const pageSize = 100
  const all: StrapiProject[] = []
  let page = 1
  let pageCount = 1
  do {
    const res = await strapiClient.getProjects({ page, pageSize, sort: "name:asc" })
    if (Array.isArray(res.data)) all.push(...res.data)
    pageCount = res.meta?.pagination?.pageCount ?? 1
    page += 1
  } while (page <= pageCount)
  return all
}


export function ExchangeRateProfileForm({
  mode = "create",
  initialData,
}: ExchangeRateProfileFormProps) {
  const router = useRouter()
  const t = useTranslations("common")
  const tForm = useTranslations("exchangeRateProfileForm")
  const tBlockForm = useTranslations("common.blockForm")
  const [isSaving, setIsSaving] = useState(false)

  const [name, setName] = useState(
    () => (mode === "edit" ? initialData?.name ?? "" : "")
  )
  const [code, setCode] = useState(
    () => (mode === "edit" ? initialData?.code ?? "" : "")
  )
  /** Igual que proyectos: si es false, el código sigue al slug del nombre. */
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(
    () => !!(initialData?.code && String(initialData.code).trim())
  )
  const [description, setDescription] = useState(
    () => (mode === "edit" ? initialData?.description ?? "" : "")
  )
  const [currencies, setCurrencies] = useState<StrapiCurrenciesComponent | null>(
    () => initialData?.currencies ?? null
  )
  const [selectedProjectIds, setSelectedProjectIds] = useState<(string | number)[]>(() =>
    initialData?.projects?.length ? idsFromProjects(initialData.projects) : []
  )

  const [allProjects, setAllProjects] = useState<StrapiProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState("")
  const [domainFilter, setDomainFilter] = useState<BlockDomain | undefined>(undefined)
  const [regionFilter, setRegionFilter] = useState<'GAM' | 'Interior' | undefined>(undefined)
  const [countryFilter, setCountryFilter] = useState<string | undefined>(undefined)
  const [projectRegionsMap, setProjectRegionsMap] = useState<Map<string, string[]>>(new Map())
  /**
   * Proyecto → los tipos de inmueble de sus bloques.
   *
   * `api::project` no tiene el campo; el tipo vive en el bloque. Se deriva acá,
   * en memoria, por la misma razón que la región justo arriba: la lista de
   * proyectos ya se trae entera y con `blocks` populado, así que filtrar del
   * lado del servidor obligaría a recargar los 1020 en cada chip.
   */
  const [projectDomainsMap, setProjectDomainsMap] = useState<Map<string, string[]>>(new Map())

  const isClone =
    mode === "create" &&
    !!initialData &&
    !!(initialData.documentId ?? initialData.id)

  useEffect(() => {
    if (!initialData) return
    if (mode === "edit") {
      setName(initialData.name ?? "")
      setCode(initialData.code ?? "")
      setCodeManuallyEdited(!!(initialData.code && String(initialData.code).trim()))
      setDescription(initialData.description ?? "")
      setCurrencies(initialData.currencies ?? null)
      setSelectedProjectIds(
        initialData.projects?.length ? idsFromProjects(initialData.projects) : []
      )
    } else if (isClone) {
      setName("")
      setCode("")
      setCodeManuallyEdited(false)
      setDescription(initialData.description ?? "")
      setCurrencies(initialData.currencies ?? null)
      setSelectedProjectIds(
        initialData.projects?.length ? idsFromProjects(initialData.projects) : []
      )
    }
  }, [initialData, mode, isClone])

  const handleNameChange = (value: string) => {
    setName(value)
    if (!codeManuallyEdited) {
      setCode(slugify(value))
    }
  }

  const handleCodeChange = (value: string) => {
    setCodeManuallyEdited(true)
    setCode(value)
  }

  const handleRegenerateCode = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCode(slugify(trimmed))
    setCodeManuallyEdited(false)
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setProjectsLoading(true)
        setProjectsError(null)
        const list = await fetchAllProjects()
        if (!cancelled) {
          setAllProjects(list)
          // Construir mapa de regiones desde project.blocks (ya populado)
          const map = new Map<string, string[]>()
          const mapaDominios = new Map<string, string[]>()
          for (const p of list) {
            const projId = p.documentId || String(p.id)
            if (!projId || !p.blocks?.length) continue
            const regions = Array.from(new Set(p.blocks.map((b: { quarter?: string | null }) => {
              const q = b.quarter
              if (!q) return 'Desconocido'
              if (['T1','T2','T3','T4'].includes(q)) return 'GAM'
              if (['S1','S2'].includes(q)) return 'Interior'
              return 'Desconocido'
            })))
            map.set(projId, regions)

            const dominios = Array.from(new Set(
              p.blocks
                .map((b: { domain?: string | null }) => b.domain)
                .filter((d): d is string => !!d)
            ))
            if (dominios.length) mapaDominios.set(projId, dominios)
          }
          setProjectRegionsMap(map)
          setProjectDomainsMap(mapaDominios)
        }
      } catch (err) {
        if (!cancelled) {
          setProjectsError(err instanceof Error ? err.message : "Error al cargar proyectos")
        }
      } finally {
        if (!cancelled) setProjectsLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const currenciesTabKey = useMemo(() => {
    const sid = initialData?.documentId ?? initialData?.id
    if (mode === "edit" && sid !== undefined && sid !== null) {
      return `edit-${sid}`
    }
    if (isClone && sid !== undefined && sid !== null) {
      return `clone-${sid}`
    }
    return "create"
  }, [mode, initialData?.documentId, initialData?.id, isClone])

  const isProjectSelected = (p: StrapiProject): boolean => {
    const key = projectKey(p)
    if (!key) return false
    return (
      selectedProjectIds.includes(key) ||
      (p.id !== undefined && selectedProjectIds.includes(p.id))
    )
  }

  const toggleProject = (p: StrapiProject) => {
    const key = projectKey(p)
    if (!key) return
    setSelectedProjectIds((prev) => {
      const on =
        prev.includes(key) || (p.id !== undefined && prev.includes(p.id))
      if (on) {
        return prev.filter((id) => id !== key && id !== p.id)
      }
      return [...prev, key]
    })
  }

  // Países presentes en los proyectos cargados (para el filtro rápido)
  const availableCountries = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of allProjects) {
      const c = p.country
      const id = c?.documentId || (c?.id != null ? String(c.id) : undefined)
      if (id && c?.name && !map.has(id)) map.set(id, c.name)
    }
    return Array.from(map, ([documentId, name]) => ({ documentId, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allProjects])

  const visibleProjects = useMemo(() => {
    let list = allProjects

    if (domainFilter) {
      list = list.filter((p) => {
        const projId = p.documentId || String(p.id)
        return (projectDomainsMap.get(projId) ?? []).includes(domainFilter)
      })
    }

    if (regionFilter) {
      list = list.filter((p) => {
        const projId = p.documentId || String(p.id)
        const regions = projectRegionsMap.get(projId) ?? []
        return regions.includes(regionFilter)
      })
    }

    if (countryFilter) {
      list = list.filter((p) => {
        const id = p.country?.documentId || (p.country?.id != null ? String(p.country.id) : undefined)
        return id === countryFilter
      })
    }

    const q = projectFilter.trim().toLowerCase()
    if (!q) return list
    return list.filter((p) => {
      const name = (p.name || "").toLowerCase()
      const code = (p.code || "").toLowerCase()
      const dev = typeof p.developer === "object" && p.developer?.name
        ? p.developer.name.toLowerCase() : ""
      return name.includes(q) || code.includes(q) || dev.includes(q)
    })
  }, [allProjects, projectFilter, domainFilter, regionFilter, countryFilter, projectRegionsMap, projectDomainsMap])

  const allVisibleSelected = useMemo(
    () => visibleProjects.length > 0 && visibleProjects.every((p) => isProjectSelected(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleProjects, selectedProjectIds]
  )
  const someVisibleSelected = useMemo(
    () => visibleProjects.some((p) => isProjectSelected(p)) && !allVisibleSelected,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleProjects, selectedProjectIds, allVisibleSelected]
  )

  const toggleAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedProjectIds((prev) => {
        const visibleKeys = new Set<string | number>(
          visibleProjects.flatMap((p) =>
            [projectKey(p), p.id].filter((x): x is string | number => x !== undefined && x !== null && x !== "")
          )
        )
        return prev.filter((id) => !visibleKeys.has(id))
      })
    } else {
      setSelectedProjectIds((prev) => {
        const next = [...prev]
        for (const p of visibleProjects) {
          const key = projectKey(p)
          if (key && !prev.includes(key) && (p.id === undefined || !prev.includes(p.id))) {
            next.push(key)
          }
        }
        return next
      })
    }
  }, [allVisibleSelected, visibleProjects])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({
        title: t("error"),
        description: tForm("nameRequired"),
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const projectIds = selectedProjectIds.filter(
        (id) => id !== undefined && id !== null && id !== ""
      ) as (string | number)[]

      if (mode === "edit" && initialData?.documentId) {
        // Calcular diff para evitar procesar 400+ relaciones en Strapi
        const prevIds = new Set(
          idsFromProjects(initialData.projects || []).map(String)
        )
        const nextIds = new Set(projectIds.map(String))
        const connect = [...nextIds].filter(id => !prevIds.has(id))
        const disconnect = [...prevIds].filter(id => !nextIds.has(id))

        await strapiClient.updateExchangeRateProfile(initialData.documentId, {
          name: trimmedName,
          code: code.trim() || undefined,
          description: description.trim() || undefined,
          currencies: currencies ?? undefined,
          projects: (connect.length > 0 || disconnect.length > 0)
            ? { connect, disconnect }
            : undefined,
        })
        toast({ title: t("success"), description: tForm("updated") })
        router.refresh()
      } else {
        const created = await strapiClient.createExchangeRateProfile({
          name: trimmedName,
          code: code.trim() || undefined,
          description: description.trim() || undefined,
          currencies: currencies ?? undefined,
          projects: projectIds,
        })
        toast({ title: t("success"), description: tForm("created") })
        const nextId = created.documentId || created.id
        if (nextId !== undefined && nextId !== null) {
          router.push(`/exchange-rate-profiles/edit/${nextId}`)
        } else {
          router.push("/exchange-rate-profiles")
        }
      }
    } catch (error) {
      let msg =
        mode === "edit" ? tForm("errorUpdating") : tForm("errorCreating")
      if (error instanceof Error) {
        msg = `${msg}: ${error.message}`
      }
      toast({ title: t("error"), description: msg, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl">{tForm("general")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="erp-name">{tForm("name")} *</Label>
            <Input
              id="erp-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={isSaving}
              className="bg-background border-border"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="erp-code">{t("code")}</Label>
            <div className="relative">
              <Input
                id="erp-code"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                disabled={isSaving}
                className="bg-background border-border font-mono text-sm pr-10"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleRegenerateCode}
                    disabled={isSaving || !name.trim()}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="sr-only">{tForm("regenerateCode")}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {!name.trim()
                      ? tForm("regenerateCodeNeedName")
                      : tForm("regenerateCodeTooltip")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            {!codeManuallyEdited ? (
              <p className="text-xs text-muted-foreground">{tForm("codeAutoFromName")}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="erp-desc">{t("description")}</Label>
            <Textarea
              id="erp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
              rows={3}
              className="bg-background border-border resize-y min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl">{tForm("linkedProjects")}</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            {tForm("linkedProjectsDescription")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {projectsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner />
            </div>
          ) : projectsError ? (
            <p className="text-sm text-destructive py-2">{projectsError}</p>
          ) : allProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">{t("noProjects")}</p>
          ) : (
            <>
              <div className="space-y-3">
                {/* Fila 1: contador + región + buscador */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <p className="text-sm text-muted-foreground shrink-0">
                    {tForm("projectsTotal", { count: allProjects.length })}
                    {(projectFilter.trim() || domainFilter || regionFilter || countryFilter)
                      ? ` · ${tForm("projectsFiltered", { count: visibleProjects.length })}`
                      : null}
                    {selectedProjectIds.length > 0
                      ? ` · ${tForm("projectsSelectedCount", { count: selectedProjectIds.length })}`
                      : null}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* El tipo de inmueble primero, igual que en los listados de
                        bloques, unidades y proyectos. El proyecto no tiene el
                        campo: se mira el de sus bloques. */}
                    <div className="flex items-center gap-1">
                      {DOMINIOS.map((d) => (
                        <Button
                          key={d}
                          type="button"
                          size="sm"
                          variant={domainFilter === d ? "default" : "outline"}
                          disabled={isSaving}
                          className={domainFilter === d ? DOMAIN_BADGE_CLASS[d] : ""}
                          onClick={() => setDomainFilter(domainFilter === d ? undefined : d)}
                        >
                          {tBlockForm(domainLabelKey(d))}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      {(["GAM", "Interior"] as const).map((r) => (
                        <Button
                          key={r}
                          type="button"
                          size="sm"
                          variant={regionFilter === r ? "default" : "outline"}
                          disabled={isSaving}
                          className={regionFilter === r
                            ? r === "GAM" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"
                            : ""}
                          onClick={() => setRegionFilter(regionFilter === r ? undefined : r)}
                        >
                          {r}
                        </Button>
                      ))}
                    </div>
                    {availableCountries.length > 0 && (
                      <div className="flex items-center gap-1">
                        {availableCountries.map((c) => (
                          <Button
                            key={c.documentId}
                            type="button"
                            size="sm"
                            variant={countryFilter === c.documentId ? "default" : "outline"}
                            disabled={isSaving}
                            className={countryFilter === c.documentId ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                            onClick={() => setCountryFilter(countryFilter === c.documentId ? undefined : c.documentId)}
                          >
                            {c.name}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="relative w-full sm:w-52">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="search"
                        placeholder={tForm("filterProjectsPlaceholder")}
                        value={projectFilter}
                        onChange={(e) => setProjectFilter(e.target.value)}
                        disabled={isSaving}
                        className="pl-9 bg-background border-border"
                      />
                    </div>
                  </div>
                </div>
                {/* Fila 2: marcar todos los visibles */}
                {visibleProjects.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all-visible"
                      checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
                      disabled={isSaving}
                      onCheckedChange={toggleAllVisible}
                    />
                    <label
                      htmlFor="select-all-visible"
                      className="text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      Marcar todos los visibles ({visibleProjects.length})
                    </label>
                  </div>
                )}
              </div>
              {visibleProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t("noResults")}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visibleProjects.map((p) => {
                    const key = projectKey(p)
                    const developerName =
                      typeof p.developer === "object" && p.developer?.name
                        ? p.developer.name
                        : null
                    return (
                      <div
                        key={key || String(p.id)}
                        className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card h-full"
                      >
                        <Checkbox
                          id={`erp-project-${key || p.id}`}
                          disabled={isSaving || !key}
                          checked={isProjectSelected(p)}
                          onCheckedChange={() => toggleProject(p)}
                          className="mt-1 shrink-0"
                        />
                        <Label
                          htmlFor={`erp-project-${key || p.id}`}
                          className="cursor-pointer flex-1 min-w-0 space-y-1 font-normal text-left"
                        >
                          <span className="text-sm font-semibold text-foreground leading-snug wrap-break-word min-w-0">
                            {p.name || t("noName")}
                          </span>
                          <span className="text-xs text-muted-foreground leading-relaxed wrap-break-word min-w-0">
                            {developerName ?? "—"}
                          </span>
                          {p.country?.name && (
                            <span className="block pt-0.5">
                              <CountryPill country={p.country} className="text-xs" />
                            </span>
                          )}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl">{tForm("currencies")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CurrenciesTab
            key={currenciesTabKey}
            initialData={{ currencies: initialData?.currencies }}
            disabled={isSaving}
            onCurrenciesChange={setCurrencies}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 justify-end sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-4 border-t border-border">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/exchange-rate-profiles")}
          disabled={isSaving}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("saving")}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {t("save")}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
