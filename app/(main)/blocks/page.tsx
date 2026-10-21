"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, X } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { strapiClient, type StrapiBlock, type BlockDomain } from "@/lib/api/strapi"
import { useTranslations } from "next-intl"
import { BlocksTable } from "@/components/blocks/blocks-table"
import { AdvancedFilters, ActiveFilters, getOperatorLabel, type FilterCondition, type AdvancedFiltersRef, type FieldDefinition } from "@/components/projects/advanced-filters"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { DOMAIN_BADGE_CLASS, DOMINIOS, domainLabelKey } from "@/lib/block-domain-ui"
import { TourGuide } from "@/components/tour/tour-guide"
import { useTour } from "@/hooks/use-tour"
import { getBlocksTourSteps } from "@/components/tour/tour-steps"

export default function BlocksPage() {
  const t = useTranslations('common')
  const tTour = useTranslations('tour.blocks')
  // Las etiquetas del tipo de inmueble viven con el formulario del bloque: es el
  // mismo concepto y tenerlas duplicadas las dejaría divergir.
  const tBlockForm = useTranslations('common.blockForm')
  const tour = useTour('blocks')
  const tourSteps = getBlocksTourSteps(tTour)
  const searchParams = useSearchParams()
  const projectParam = searchParams.get('project')

  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [blocks, setBlocks] = useState<StrapiBlock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sort, setSort] = useState<string>('createdAt:desc')
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [selectedRegion, setSelectedRegion] = useState<'GAM' | 'Interior' | undefined>(undefined)
  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(undefined)
  const [selectedDomain, setSelectedDomain] = useState<BlockDomain | undefined>(undefined)
  const [countries, setCountries] = useState<Array<{ documentId: string; name: string }>>([])
  const [advancedFilters, setAdvancedFilters] = useState<FilterCondition[]>([])
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND')
  const advancedFiltersRef = useRef<AdvancedFiltersRef>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const blockFieldDefinitions = useMemo<FieldDefinition[]>(() => [
    {
      key: 'project.department',
      label: 'Departamento',
      type: 'string',
      operators: ['equals', 'notEquals', 'contains', 'notContains', 'isNull', 'isNotNull'],
    },
  ], [])

  const handleEditFilter = useCallback((filter: FilterCondition) => {
    advancedFiltersRef.current?.editFilter(filter)
  }, [])

  // Si viene ?project= en la URL, inyectar el nombre del proyecto en el buscador
  useEffect(() => {
    if (!projectParam) return
    strapiClient.getProjectById(projectParam)
      .then(p => { if (p?.name) setSearchQuery(p.name) })
      .catch(() => {})
  }, [projectParam])

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
    loadBlocks()
  }, [currentPage, pageSize, sort, debouncedSearchQuery, selectedRegion, selectedCountry, selectedDomain, advancedFilters, filterLogic])

  // Cargar los países para el filtro rápido (una vez)
  useEffect(() => {
    let cancelled = false
    strapiClient
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

  const loadBlocks = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await strapiClient.getBlocks({
        page: currentPage,
        pageSize: pageSize,
        sort: sort,
        search: debouncedSearchQuery,
        region: selectedRegion,
        country: selectedCountry,
        domain: selectedDomain,
        advancedFilters: advancedFilters.length > 0 ? advancedFilters : undefined,
        filterLogic,
      })
      
      // Asegurarse de que response.data existe y es un array
      if (response && response.data && Array.isArray(response.data)) {
        setBlocks(response.data)
        setTotalPages(response.meta?.pagination?.pageCount || 1)
        setTotalItems(response.meta?.pagination?.total || 0)
      } else {
        console.warn('Formato de respuesta inesperado:', response)
        setBlocks([])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar los bloques'
      setError(errorMessage)
      console.error('Error al cargar bloques:', err)
      setBlocks([])
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

  const handleRegionChange = (region: 'GAM' | 'Interior' | undefined) => {
    setSelectedRegion(region)
    setCurrentPage(1)
  }

  const handleCountryChange = (countryId: string | undefined) => {
    setSelectedCountry(countryId)
    setCurrentPage(1)
  }

  const handleDomainChange = (domain: BlockDomain | undefined) => {
    setSelectedDomain(domain)
    setCurrentPage(1)
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs sm:text-sm">{t('blocks')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">{t('blocks')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('blocksDescription')}</p>
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
            <CardTitle className="text-base sm:text-lg">{t('blocks')}</CardTitle>
            <Link href="/blocks/new" className="w-full sm:w-auto">
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                {t('newBlock')}
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {/* Barra de búsqueda y filtros */}
          <div className="mb-6 space-y-2">
            {/* Mobile: buscador en línea 1 */}
            <div className="relative sm:hidden" data-tour="blocks-search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('searchBlocks')}
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
            {/* Mobile: región + filtro avanzado en línea 2 */}
            <div className="flex sm:hidden items-center gap-1 flex-wrap">
              {/* Tipo de inmueble. Va PRIMERO entre los filtros rápidos: es la
                  división más gruesa del listado —los tres no comparten ni
                  tablas ni columnas en el warehouse— así que acota más que
                  región o país.

                  Los tres se dibujan. Industrial estuvo excluido mientras no
                  hubo bloques cargados, porque un chip que siempre devuelve
                  vacío es ruido; ya hay 119. */}
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
              <AdvancedFilters
                ref={advancedFiltersRef}
                filters={advancedFilters}
                onFiltersChange={setAdvancedFilters}
                fieldDefinitions={blockFieldDefinitions}
              />
            </div>
            {/* Desktop: buscador + región en una sola fila */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={t('searchBlocks')}
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
                {/* Mismo orden que en móvil: el tipo de inmueble primero. */}
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
              <AdvancedFilters
                ref={advancedFiltersRef}
                filters={advancedFilters}
                onFiltersChange={setAdvancedFilters}
                fieldDefinitions={blockFieldDefinitions}
              />
            </div>
            {/* Filtros activos */}
            {advancedFilters.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setAdvancedFilters([]); setFilterLogic('AND') }}
                  >
                    {t('clearFilters')}
                  </Button>
                </div>
                <ActiveFilters
                  filters={advancedFilters}
                  onEditFilter={handleEditFilter}
                  onRemoveFilter={(id) => setAdvancedFilters(advancedFilters.filter(f => f.id !== id))}
                  getFieldLabel={(key) => blockFieldDefinitions.find(f => f.key === key)?.label ?? key}
                  getOperatorLabelLocalized={(op) => getOperatorLabel(op, t)}
                />
              </div>
            )}
          </div>

          <div data-tour="blocks-table">
            <BlocksTable 
              searchQuery={searchQuery} 
              blocks={blocks}
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
