"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Check, ChevronsUpDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { strapiClient, type StrapiBlock, type BlockDomain } from "@/lib/api/strapi"
import { departmentsForIso } from "@/lib/geo"
import { useTranslations } from "next-intl"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { TourGuide } from "@/components/tour/tour-guide"
import { useTour } from "@/hooks/use-tour"
import { getUnitsTourSteps } from "@/components/tour/tour-steps"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { getBlockRegion, REGION_BADGE_CLASS } from "@/lib/region"
import { DOMAIN_BADGE_CLASS, DOMAIN_PILL_CLASS, DOMINIOS, domainLabelKey } from "@/lib/domain"
import { CountryPill } from "@/components/ui/country-pill"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function UnitsPage() {
  const t = useTranslations('common')
  const tTour = useTranslations('tour.units')
  const tour = useTour('units')
  const tBlockForm = useTranslations('common.blockForm')
  const tourSteps = getUnitsTourSteps(tTour)
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  // Estados para autocomplete de blocks
  const [openBlock, setOpenBlock] = useState(false)
  const [blockSearchQuery, setBlockSearchQuery] = useState("")
  const [blocks, setBlocks] = useState<StrapiBlock[]>([])
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<BlockDomain | undefined>(undefined)
  const [selectedRegion, setSelectedRegion] = useState<'GAM' | 'Interior' | undefined>(undefined)
  const [departmentFilter, setDepartmentFilter] = useState("")
  // País seleccionado por ISO code (isoCode2), igual que las banderas
  const [selectedCountryIso, setSelectedCountryIso] = useState<string | undefined>(undefined)
  // Grupos país → departamentos, derivados de los proyectos (amarrados por ISO code)
  const [countryGroups, setCountryGroups] = useState<Array<{ iso: string; name: string; departments: string[] }>>([])

  // Países (request liviano) → cada uno con su ISO code; los departamentos salen
  // de las listas fijas en código, amarradas por ISO code. Así no iteramos
  // todos los proyectos y la página entra al toque.
  useEffect(() => {
    let cancelled = false
    strapiClient
      .getCatalogList('countries', { pageSize: 100, sort: 'name:asc' })
      .then((res) => {
        if (cancelled) return
        const groups = (res?.data ?? [])
          .map((c: any) => {
            const iso = c.isoCode2 || c.code
            return iso && c.name
              ? { iso, name: c.name, departments: departmentsForIso(iso) }
              : null
          })
          .filter((g): g is { iso: string; name: string; departments: string[] } => g !== null)
        setCountryGroups(groups)
      })
      .catch((e) => console.error('Error cargando países:', e))
    return () => {
      cancelled = true
    }
  }, [])

  // Departamentos visibles: si hay país seleccionado, solo los de ese país
  const departmentGroups = selectedCountryIso
    ? countryGroups.filter((g) => g.iso === selectedCountryIso)
    : countryGroups

  const handleCountryClick = (iso: string) => {
    const next = selectedCountryIso === iso ? undefined : iso
    setSelectedCountryIso(next)
    // Si el departamento elegido no pertenece al país nuevo, limpiarlo
    if (next) {
      const deps = countryGroups.find((g) => g.iso === next)?.departments ?? []
      if (departmentFilter && !deps.includes(departmentFilter)) setDepartmentFilter("")
    }
    setOpenBlock(true)
  }

  // Cargar blocks cuando se abre el popover, se busca, o cambia la región
  useEffect(() => {
    const loadBlocks = async () => {
      setIsLoadingBlocks(true)
      try {
        const response = await strapiClient.getBlocks({
          page: 1,
          pageSize: 200,
          search: blockSearchQuery || undefined,
          sort: 'name:asc',
          region: selectedRegion,
          countryIso: selectedCountryIso,
          domain: selectedDomain,
          advancedFilters: departmentFilter.trim()
            ? [{ field: 'project.department', operator: 'equals', value: departmentFilter.trim() }]
            : undefined,
        })
        setBlocks(response.data || [])
      } catch (error) {
        console.error('Error loading blocks:', error)
        setBlocks([])
      } finally {
        setIsLoadingBlocks(false)
      }
    }
    if (openBlock || blockSearchQuery || selectedRegion || selectedCountryIso || selectedDomain || departmentFilter.trim()) {
      loadBlocks()
    } else {
      setBlocks([])
    }
  }, [openBlock, blockSearchQuery, selectedRegion, selectedCountryIso, selectedDomain, departmentFilter])

  // Filtrar blocks localmente
  const filteredBlocks = blocks.filter(block => {
    if (!blockSearchQuery) return true
    const query = blockSearchQuery.toLowerCase()
    return block.name?.toLowerCase().includes(query) || block.code?.toLowerCase().includes(query)
  })


  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs sm:text-sm">{t('units')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-tour="units-header">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">{t('units')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('selectBlockToViewUnits')}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">{t('selectBlock')}</CardTitle>
          <CardDescription>{t('selectBlockToViewUnits')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* El tipo va antes que región y país: es la división más gruesa
                —vivienda y oficinas no comparten tablas ni columnas— así que
                acota la lista más que cualquier otro filtro. Sólo los dos que
                tienen bloques cargados; un chip que siempre devuelve vacío es
                ruido. */}
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {tBlockForm('domainLabel')}:
              </span>
              {DOMINIOS.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={selectedDomain === d ? 'default' : 'outline'}
                  className={selectedDomain === d ? DOMAIN_BADGE_CLASS[d] : ''}
                  onClick={() => {
                    setSelectedDomain(selectedDomain === d ? undefined : d)
                    setOpenBlock(true)
                  }}
                >
                  {tBlockForm(domainLabelKey(d))}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Región:</span>
              {(['GAM', 'Interior'] as const).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={selectedRegion === r ? 'default' : 'outline'}
                  className={selectedRegion === r
                    ? r === 'GAM' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'
                    : ''}
                  onClick={() => {
                    setSelectedRegion(selectedRegion === r ? undefined : r)
                    setOpenBlock(true)
                  }}
                >
                  {r}
                </Button>
              ))}
            </div>
            {countryGroups.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap">País:</span>
                {countryGroups.map((g) => (
                  <Button
                    key={g.iso}
                    size="sm"
                    variant={selectedCountryIso === g.iso ? 'default' : 'outline'}
                    className={selectedCountryIso === g.iso ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                    onClick={() => handleCountryClick(g.iso)}
                  >
                    {g.name}
                  </Button>
                ))}
              </div>
            )}
            <Select
              value={departmentFilter || "__all__"}
              onValueChange={(v) => {
                setDepartmentFilter(v === "__all__" ? "" : v)
                setOpenBlock(true)
              }}
            >
              <SelectTrigger className="h-9 text-sm bg-background border-border flex-1 min-w-48">
                <SelectValue placeholder="Departamento…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los departamentos</SelectItem>
                {departmentGroups
                  .filter((g) => g.departments.length > 0)
                  .map((g) => (
                    <SelectGroup key={g.iso}>
                      <SelectLabel>{g.name}</SelectLabel>
                      {g.departments.map((dep) => (
                        <SelectItem key={`${g.iso}-${dep}`} value={dep}>{dep}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Popover open={openBlock} onOpenChange={setOpenBlock}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openBlock}
                className="w-full justify-between"
                data-tour="units-select"
              >
                {departmentFilter
                  ? `Buscar bloques en ${departmentFilter}${selectedRegion ? ` · ${selectedRegion}` : ''}`
                  : selectedRegion
                    ? `Buscar bloque — ${selectedRegion}`
                    : t('searchBlock')}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0">
              <Command>
                <CommandInput 
                  placeholder={t('searchBlockPlaceholder')} 
                  value={blockSearchQuery}
                  onValueChange={setBlockSearchQuery}
                />
                {isLoadingBlocks ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">{t('loading')}</span>
                  </div>
                ) : (
                  <>
                    <CommandEmpty>{t('noBlocksFoundInSearch')}</CommandEmpty>
                    <CommandGroup>
                      <CommandList>
                        {filteredBlocks.map((block) => {
                          const blockId = block.documentId || String(block.id)
                          return (
                            <CommandItem
                              key={blockId}
                              value={`${block.name || ""} ${block.code || ""}`}
                              keywords={[block.code || "", block.name || ""]}
                              onSelect={() => {
                                router.push(`/units/list/${blockId}`)
                                setOpenBlock(false)
                                setBlockSearchQuery("")
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 opacity-0"
                                )}
                              />
                              <div className="flex flex-col items-start gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium leading-tight">{block.name}</span>
                                  {/* El tipo va primero entre las insignias: al elegir
                                      un bloque es lo que dice qué campos van a tener
                                      sus unidades —una oficina y una vivienda no
                                      comparten la zona dinámica— y eso importa más
                                      que la región para saber si es el que se busca. */}
                                  {block.domain && (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${DOMAIN_PILL_CLASS[block.domain]}`}>
                                      {tBlockForm(domainLabelKey(block.domain))}
                                    </span>
                                  )}
                                  {(() => {
                                    const region = getBlockRegion(block.quarter)
                                    return (
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${REGION_BADGE_CLASS[region]}`}>
                                        {region}
                                      </span>
                                    )
                                  })()}
                                  <CountryPill country={block.project?.country} className="text-[10px] px-1.5 py-0.5" />
                                </div>
                                {block.code && (
                                  <span className="text-xs text-muted-foreground leading-tight">{block.code}</span>
                                )}
                              </div>
                            </CommandItem>
                          )
                        })}
                      </CommandList>
                    </CommandGroup>
                  </>
                )}
              </Command>
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>

      <TourGuide
        steps={tourSteps}
        isActive={tour.isActive}
        currentStep={tour.currentStep}
        onNext={tour.next}
        onPrevious={tour.previous}
        onSkip={tour.skip}
        onComplete={tour.complete}
      />
    </div>
  )
}










