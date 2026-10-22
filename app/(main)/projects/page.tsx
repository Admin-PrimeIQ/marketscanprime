"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ProjectsTable } from "@/components/projects/projects-table"
import { AdvancedFilters, ActiveFilters, getFieldDefinitions, getOperatorLabel, type FilterCondition, type AdvancedFiltersRef } from "@/components/projects/advanced-filters"
import { Plus, Search, X } from "lucide-react"
import Link from "next/link"
import { type StrapiProject, type BlockDomain } from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { DOMAIN_BADGE_CLASS, DOMINIOS, domainLabelKey } from "@/lib/block-domain-ui"
import { useTranslations } from "next-intl"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { TourGuide } from "@/components/tour/tour-guide"
import { useTour } from "@/hooks/use-tour"
import { getProjectsTourSteps } from "@/components/tour/tour-steps"

export default function ProjectsPage() {
  const t = useTranslations('common')
  const tTour = useTranslations('tour.projects')
  const tBlockForm = useTranslations('common.blockForm')
  const tour = useTour('projects')
  const tourSteps = getProjectsTourSteps(tTour)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [projects, setProjects] = useState<StrapiProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sort, setSort] = useState<string>('createdAt:desc')
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [selectedPhases, setSelectedPhases] = useState<string[]>([])
  const [selectedDomain, setSelectedDomain] = useState<BlockDomain | undefined>(undefined)
  const [selectedRegion, setSelectedRegion] = useState<'GAM' | 'Interior' | undefined>(undefined)
  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(undefined)
  const [countries, setCountries] = useState<Array<{ documentId: string; name: string }>>([])
  const [advancedFilters, setAdvancedFilters] = useState<FilterCondition[]>([])
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND')
  const advancedFiltersRef = useRef<AdvancedFiltersRef>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleEditFilter = useCallback((filter: FilterCondition) => {
    if (advancedFiltersRef.current) {
      advancedFiltersRef.current.editFilter(filter)
    }
  }, [])

  // Debounce para la búsqueda
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
      setCurrentPage(1) // Resetear a la primera página al buscar
    }, 500) // Esperar 500ms después de que el usuario deje de escribir

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchQuery])

  useEffect(() => {
    loadProjects()
  }, [currentPage, pageSize, sort, debouncedSearchQuery, selectedPhases, selectedDomain, selectedRegion, selectedCountry, advancedFilters, filterLogic])

  // Cargar los países para el filtro rápido (una vez)
  useEffect(() => {
    let cancelled = false
    dataClient
      .getCatalogList('countries', { pageSize: 100, sort: 'name:asc' })
      .then((res) => {
        if (cancelled) return
        const list = (res?.data ?? [])
          .map((c: any) => ({ documentId: c.documentId || String(c.id), name: c.name }))
          .filter((c) => c.documentId && c.name)
        setCountries(list)
      })
      .catch((e) => console.error('Error al cargar países:', e))
    return () => {
      cancelled = true
    }
  }, [])

  const loadProjects = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await dataClient.getProjects({
        page: currentPage,
        pageSize: pageSize,
        sort: sort,
        search: debouncedSearchQuery,
        availability: selectedPhases.length > 0 ? selectedPhases : undefined,
        domain: selectedDomain,
        region: selectedRegion,
        country: selectedCountry,
        advancedFilters: advancedFilters.length > 0 ? advancedFilters : undefined,
        filterLogic: filterLogic,
      })
      
      // Log para debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('Respuesta de proyectos:', response)
        console.log('Datos de proyectos:', response.data)
        console.log('Cantidad de proyectos:', response.data?.length || 0)
        console.log('Meta:', response.meta)
      }
      
      // Asegurarse de que response.data existe y es un array
      if (response && response.data && Array.isArray(response.data)) {
        setProjects(response.data)
        setTotalPages(response.meta?.pagination?.pageCount || 1)
        setTotalItems(response.meta?.pagination?.total || 0)
      } else {
        console.warn('Formato de respuesta inesperado:', response)
        setProjects([])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar los proyectos'
      setError(errorMessage)
      console.error('Error al cargar proyectos:', err)
      setProjects([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSortChange = (newSort: string) => {
    setSort(newSort)
    setCurrentPage(1) // Resetear a la primera página al cambiar el ordenamiento
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    setCurrentPage(1) // Resetear a la primera página al cambiar el tamaño
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
  }

  const handlePhasesChange = (phases: string[]) => {
    setSelectedPhases(phases)
    setCurrentPage(1)
  }

  const handleDomainChange = (domain: BlockDomain | undefined) => {
    setSelectedDomain(domain)
    setCurrentPage(1)
  }

  const handleRegionChange = (region: 'GAM' | 'Interior' | undefined) => {
    setSelectedRegion(region)
    setCurrentPage(1)
  }

  const handleCountryChange = (countryId: string | undefined) => {
    setSelectedCountry(countryId)
    setCurrentPage(1)
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs sm:text-sm">{t('projects')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-tour="projects-header">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">{t('projects')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('projectsDescription')}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base sm:text-lg">{t('projects')}</CardTitle>
            <Link href="/projects/new" className="w-full sm:w-auto" data-tour="projects-create">
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                {t('newProject')}
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {/* Barra de búsqueda y filtros */}
          <div className="mb-6 space-y-2">
            {/* Línea 1 en mobile: buscador solo. En desktop: oculto (usa la fila unificada de abajo) */}
            <div className="relative sm:hidden" data-tour="projects-search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('searchProjects')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-10 ${searchQuery ? 'pr-10' : ''} bg-background border-border`}
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-muted"
                  onClick={() => setSearchQuery("")}
                  title={t('clearSearch')}
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
            </div>
            {/* Línea 2 en mobile: región + filtro. En desktop: se fusiona arriba */}
            <div className="flex sm:hidden items-center gap-2">
              <div className="flex items-center gap-1 flex-1 flex-wrap">
                {/* El tipo de inmueble va primero, igual que en bloques y unidades: acota
                    más que región o país. `api::project` no tiene el campo — se filtra
                    por el de sus bloques. */}
                {DOMINIOS.map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={selectedDomain === d ? 'default' : 'outline'}
                    className={selectedDomain === d ? DOMAIN_BADGE_CLASS[d] : ''}
                    onClick={() => handleDomainChange(selectedDomain === d ? undefined : d)}
                  >
                    {tBlockForm(domainLabelKey(d))}
                  </Button>
                ))}
                <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
                {(['GAM', 'Interior'] as const).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={selectedRegion === r ? 'default' : 'outline'}
                    className={selectedRegion === r
                      ? r === 'GAM' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'
                      : ''}
                    onClick={() => handleRegionChange(selectedRegion === r ? undefined : r)}
                  >
                    {r}
                  </Button>
                ))}
                {countries.length > 0 && <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />}
                {countries.map((c) => (
                  <Button
                    key={c.documentId}
                    size="sm"
                    variant={selectedCountry === c.documentId ? 'default' : 'outline'}
                    className={selectedCountry === c.documentId ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                    onClick={() => handleCountryChange(selectedCountry === c.documentId ? undefined : c.documentId)}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
              <div data-tour="projects-filters">
                <AdvancedFilters
                  ref={advancedFiltersRef}
                  filters={advancedFilters}
                  onFiltersChange={setAdvancedFilters}
                />
              </div>
            </div>
            {/* Desktop: fila única buscador + región + filtro */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="relative flex-1" data-tour="projects-search-desktop">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={t('searchProjects')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`pl-10 ${searchQuery ? 'pr-10' : ''} bg-background border-border`}
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-muted"
                    onClick={() => setSearchQuery("")}
                    title={t('clearSearch')}
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* El tipo de inmueble va primero, igual que en bloques y unidades: acota
                    más que región o país. `api::project` no tiene el campo — se filtra
                    por el de sus bloques. */}
                {DOMINIOS.map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={selectedDomain === d ? 'default' : 'outline'}
                    className={selectedDomain === d ? DOMAIN_BADGE_CLASS[d] : ''}
                    onClick={() => handleDomainChange(selectedDomain === d ? undefined : d)}
                  >
                    {tBlockForm(domainLabelKey(d))}
                  </Button>
                ))}
                <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
                {(['GAM', 'Interior'] as const).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={selectedRegion === r ? 'default' : 'outline'}
                    className={selectedRegion === r
                      ? r === 'GAM' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'
                      : ''}
                    onClick={() => handleRegionChange(selectedRegion === r ? undefined : r)}
                  >
                    {r}
                  </Button>
                ))}
                {countries.length > 0 && <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />}
                {countries.map((c) => (
                  <Button
                    key={c.documentId}
                    size="sm"
                    variant={selectedCountry === c.documentId ? 'default' : 'outline'}
                    className={selectedCountry === c.documentId ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                    onClick={() => handleCountryChange(selectedCountry === c.documentId ? undefined : c.documentId)}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
              <div data-tour="projects-filters">
                <AdvancedFilters
                  ref={advancedFiltersRef}
                  filters={advancedFilters}
                  onFiltersChange={setAdvancedFilters}
                />
              </div>
            </div>
            {/* Filtros activos en una fila separada */}
            {advancedFilters.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">{t('filterLogic')}:</Label>
                    <Select value={filterLogic} onValueChange={(value: 'AND' | 'OR') => setFilterLogic(value)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AND">AND</SelectItem>
                        <SelectItem value="OR">OR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAdvancedFilters([])
                      setFilterLogic('AND')
                    }}
                  >
                    {t('clearFilters')}
                  </Button>
                </div>
                <ActiveFilters
                  filters={advancedFilters}
                  onEditFilter={handleEditFilter}
                  onRemoveFilter={(filterId) => {
                    setAdvancedFilters(advancedFilters.filter(f => f.id !== filterId))
                  }}
                  getFieldLabel={(fieldKey) => {
                    const fieldDefinitions = getFieldDefinitions(t)
                    return fieldDefinitions.find(f => f.key === fieldKey)?.label || fieldKey
                  }}
                  getOperatorLabelLocalized={(operator) => {
                    return getOperatorLabel(operator, t)
                  }}
                />
              </div>
            )}
          </div>

          <div data-tour="projects-table">
            <ProjectsTable 
              searchQuery={searchQuery} 
              projects={projects}
              isLoading={isLoading}
              onSortChange={handleSortChange}
              onPageSizeChange={handlePageSizeChange}
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={handlePageChange}
            />
          </div>
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
