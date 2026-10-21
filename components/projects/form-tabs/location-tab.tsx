"use client"

import { useEffect, useState, useMemo } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MapPin } from "lucide-react"
import { lazy, Suspense } from "react"
const ProjectMap = lazy(() => import("@/components/ui/project-map").then(m => ({ default: m.ProjectMap })))
import { type StrapiProject, type CatalogItem } from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { useTranslations } from "next-intl"
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
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { departmentsForIso, municipalitiesForIso } from "@/lib/domain/geo"

interface LocationTabProps {
  initialData?: Partial<StrapiProject>
  disabled?: boolean
  onStateChange?: (state: { country?: string }) => void
  onFormValueChange?: (name: string, value: string) => void
}

export function LocationTab({ initialData, disabled = false, onStateChange, onFormValueChange }: LocationTabProps) {
  const t = useTranslations('projectForm.location')
  const [countries, setCountries] = useState<CatalogItem[]>([])
  const [countrySearchQuery, setCountrySearchQuery] = useState("")
  const [openCountry, setOpenCountry] = useState(false)
  const [isLoadingCountries, setIsLoadingCountries] = useState(false)
  const [selectedCountryId, setSelectedCountryId] = useState<string | undefined>(
    typeof initialData?.country === 'object' && initialData.country !== null
      ? (initialData.country.documentId || String(initialData.country.id))
      : initialData?.country
  )

  const [departmentValue, setDepartmentValue] = useState(initialData?.department || '')
  const [municipalityValue, setMunicipalityValue] = useState(initialData?.municipality || '')
  const [openDepartment, setOpenDepartment] = useState(false)
  const [openMunicipality, setOpenMunicipality] = useState(false)
  const [departmentSearch, setDepartmentSearch] = useState('')
  const [municipalitySearch, setMunicipalitySearch] = useState('')
  const [latValue, setLatValue] = useState(initialData?.latitude ?? '')
  const [lngValue, setLngValue] = useState(initialData?.longitude ?? '')

  const selectedCountry = useMemo(() => {
    if (!selectedCountryId) return null
    return countries.find(country => (country.documentId || String(country.id)) === selectedCountryId) || null
  }, [countries, selectedCountryId])

  // ISO (alpha-2) del país seleccionado. En edit/clone usamos el isoCode2 que ya
  // viene en initialData.country mientras carga el catálogo de países; una vez
  // cargado, manda el del país seleccionado (cubre el cambio de país en vivo).
  const selectedIso = useMemo(() => {
    const fromList = selectedCountry?.isoCode2
    const fromInitial = typeof initialData?.country === 'object' && initialData.country !== null
      ? initialData.country.isoCode2
      : undefined
    return (fromList || fromInitial || '').toUpperCase()
  }, [selectedCountry, initialData])

  // Departamentos y municipios derivados del ISO (fuente única: lib/geo.ts).
  const departmentOptions = useMemo(() => departmentsForIso(selectedIso), [selectedIso])
  const municipalityOptions = useMemo(
    () => municipalitiesForIso(selectedIso, departmentValue),
    [selectedIso, departmentValue]
  )

  const hasDepartmentCatalog = departmentOptions.length > 0
  const hasMunicipalityCatalog = municipalityOptions.length > 0

  const filteredDepartments = useMemo(() => {
    if (!departmentSearch) return departmentOptions
    const q = departmentSearch.toLowerCase()
    return departmentOptions.filter(name => name.toLowerCase().includes(q))
  }, [departmentOptions, departmentSearch])

  const availableMunicipalities = useMemo(() => {
    if (!municipalitySearch) return municipalityOptions
    const q = municipalitySearch.toLowerCase()
    return municipalityOptions.filter(m => m.toLowerCase().includes(q))
  }, [municipalityOptions, municipalitySearch])

  // Limpia departamento y municipio (al cambiar de país, lo previo deja de ser válido).
  const resetDepartmentAndMunicipality = () => {
    setDepartmentValue('')
    setMunicipalityValue('')
    setDepartmentSearch('')
    setMunicipalitySearch('')
    onFormValueChange?.('department', '')
    onFormValueChange?.('municipality', '')
  }

  // Cargar países
  useEffect(() => {
    const loadCountries = async () => {
      if (!openCountry && countries.length > 0) return

      setIsLoadingCountries(true)
      try {
        const response = await dataClient.getCatalogList('countries', {
          page: 1,
          pageSize: 1000,
          search: countrySearchQuery || undefined,
          sort: 'name:asc',
        })
        setCountries(response.data || [])
      } catch (error) {
        console.error('Error loading countries:', error)
      } finally {
        setIsLoadingCountries(false)
      }
    }
    loadCountries()
  }, [openCountry, countrySearchQuery])

  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery) return countries
    const query = countrySearchQuery.toLowerCase()
    return countries.filter(country =>
      country.name.toLowerCase().includes(query) ||
      country.code?.toLowerCase().includes(query) ||
      country.isoCode?.toLowerCase().includes(query)
    )
  }, [countries, countrySearchQuery])

  return (
    <div className="space-y-6">
      {/* Hidden input para que el formulario pueda leer el valor seleccionado */}
      <input type="hidden" name="country" value={selectedCountryId || ""} />


      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>{t('country')}</Label>
          <Popover open={openCountry} onOpenChange={setOpenCountry}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openCountry}
                disabled={disabled}
                className="w-full justify-between"
              >
                {selectedCountry ? selectedCountry.name : t('selectCountry')}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t('searchCountry')}
                  value={countrySearchQuery}
                  onValueChange={setCountrySearchQuery}
                />
                <CommandEmpty>
                  {isLoadingCountries ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    <span>{t('noResults')}</span>
                  )}
                </CommandEmpty>
                <CommandGroup>
                  <CommandList>
                    {filteredCountries.map((country) => {
                      const countryId = country.documentId || String(country.id)
                      return (
                        <CommandItem
                          key={countryId}
                          value={countryId}
                          onSelect={() => {
                            // Si cambia el país, lo previo (depto/municipio) deja de ser válido.
                            if (countryId !== selectedCountryId) {
                              resetDepartmentAndMunicipality()
                            }
                            setSelectedCountryId(countryId)
                            setOpenCountry(false)
                            setCountrySearchQuery("")
                            onStateChange?.({ country: countryId })
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedCountryId === countryId ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col items-start">
                            <span className="font-medium leading-tight">{country.name}</span>
                            {country.code && (
                              <span className="text-xs text-muted-foreground leading-tight">{country.code}</span>
                            )}
                          </div>
                        </CommandItem>
                      )
                    })}
                  </CommandList>
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>{t('department')}</Label>
          <input type="hidden" name="department" value={departmentValue} />
          {hasDepartmentCatalog ? (
            <Popover open={openDepartment} onOpenChange={setOpenDepartment}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openDepartment}
                  disabled={disabled}
                  className="w-full justify-between"
                >
                  {departmentValue || t('selectDepartment')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-75 p-0">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={t('searchDepartment')}
                    value={departmentSearch}
                    onValueChange={setDepartmentSearch}
                  />
                  <CommandEmpty>{t('noResults')}</CommandEmpty>
                  <CommandGroup>
                    <CommandList>
                      {filteredDepartments.map((deptName) => (
                        <CommandItem
                          key={deptName}
                          value={deptName}
                          onSelect={() => {
                            setDepartmentValue(deptName)
                            setMunicipalityValue('')
                            onFormValueChange?.('department', deptName)
                            onFormValueChange?.('municipality', '')
                            setOpenDepartment(false)
                            setDepartmentSearch('')
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", departmentValue === deptName ? "opacity-100" : "opacity-0")} />
                          {deptName}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            // Sin catálogo de departamentos para este país → texto libre.
            <Input
              className="bg-background border-border"
              disabled={disabled || !selectedIso}
              placeholder={selectedIso ? t('selectDepartment') : t('selectCountry')}
              value={departmentValue}
              onChange={(e) => {
                setDepartmentValue(e.target.value)
                setMunicipalityValue('')
                onFormValueChange?.('department', e.target.value)
                onFormValueChange?.('municipality', '')
              }}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>{t('municipality')}</Label>
          <input type="hidden" name="municipality" value={municipalityValue} />
          {hasMunicipalityCatalog ? (
            <Popover open={openMunicipality} onOpenChange={setOpenMunicipality}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openMunicipality}
                  disabled={disabled || !departmentValue}
                  className="w-full justify-between"
                >
                  {municipalityValue || t('selectMunicipality')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-75 p-0">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={t('searchMunicipality')}
                    value={municipalitySearch}
                    onValueChange={setMunicipalitySearch}
                  />
                  <CommandEmpty>{t('noResults')}</CommandEmpty>
                  <CommandGroup>
                    <CommandList>
                      {availableMunicipalities.map((muni) => (
                        <CommandItem
                          key={muni}
                          value={muni}
                          onSelect={() => {
                            setMunicipalityValue(muni)
                            onFormValueChange?.('municipality', muni)
                            setOpenMunicipality(false)
                            setMunicipalitySearch('')
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", municipalityValue === muni ? "opacity-100" : "opacity-0")} />
                          {muni}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            // Sin catálogo de municipios para este país/departamento → texto libre.
            <Input
              className="bg-background border-border"
              disabled={disabled || !departmentValue}
              placeholder={departmentValue ? t('selectMunicipality') : t('selectDepartment')}
              value={municipalityValue}
              onChange={(e) => {
                setMunicipalityValue(e.target.value)
                onFormValueChange?.('municipality', e.target.value)
              }}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="zone">{t('zone')}</Label>
          <Input
            id="zone"
            name="zone"
            placeholder="Zona 14"
            className="bg-background border-border"
            disabled={disabled}
            defaultValue={initialData?.zone}
            onChange={(e) => onFormValueChange?.('zone', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="subzone">{t('subzone')}</Label>
          <Input
            id="subzone"
            name="subzone"
            placeholder="Subzona"
            className="bg-background border-border"
            disabled={disabled}
            defaultValue={initialData?.subzone}
            onChange={(e) => onFormValueChange?.('subzone', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="latitude">{t('latitude')}</Label>
          <Input
            id="latitude"
            name="latitude"
            type="number"
            step="0.00000001"
            placeholder="14.60856742"
            className="bg-background border-border"
            disabled={disabled}
            value={latValue}
            onChange={(e) => {
              setLatValue(e.target.value)
              onFormValueChange?.('latitude', e.target.value)
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="longitude">{t('longitude')}</Label>
          <Input
            id="longitude"
            name="longitude"
            type="number"
            step="0.00000001"
            placeholder="-90.50535502"
            className="bg-background border-border"
            disabled={disabled}
            value={lngValue}
            onChange={(e) => {
              setLngValue(e.target.value)
              onFormValueChange?.('longitude', e.target.value)
            }}
          />
        </div>
      </div>

      {(() => {
        const lat = parseFloat(String(latValue))
        const lng = parseFloat(String(lngValue))
        const hasCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
        return (
          <Card className="border-border bg-background overflow-hidden">
            <CardContent className="p-0">
              {hasCoords ? (
                <Suspense fallback={<div className="h-60 bg-muted animate-pulse" />}>
                  <ProjectMap
                    latitude={lat}
                    longitude={lng}
                    draggable={!disabled}
                    onLocationChange={(newLat, newLng) => {
                      const latStr = newLat.toFixed(8)
                      const lngStr = newLng.toFixed(8)
                      setLatValue(latStr)
                      setLngValue(lngStr)
                      onFormValueChange?.('latitude', latStr)
                      onFormValueChange?.('longitude', lngStr)
                    }}
                  />
                </Suspense>
              ) : (
                <div className="aspect-video flex items-center justify-center bg-muted/30">
                  <div className="text-center text-muted-foreground">
                    <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('interactiveMap')}</p>
                    <p className="text-xs">{t('clickToLocate')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}
    </div>
  )
}
