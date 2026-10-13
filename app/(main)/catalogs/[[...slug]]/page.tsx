"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ArrowLeft, Building2, Blocks, Home } from "lucide-react"
import { CatalogTable } from "@/components/catalogs/catalog-table"
import { CATALOG_TYPES } from "@/lib/api/strapi"
import { useTranslations } from "next-intl"
import { TourGuide } from "@/components/tour/tour-guide"
import { useTour } from "@/hooks/use-tour"
import { getCatalogsTourSteps } from "@/components/tour/tour-steps"

type CatalogTypeKey = keyof typeof CATALOG_TYPES
type CatalogKey = string

export default function CatalogsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('catalogs')
  const tTour = useTranslations('tour.catalogs')
  const tour = useTour('catalogs')
  const tourSteps = getCatalogsTourSteps(tTour)
  const [selectedType, setSelectedType] = useState<CatalogTypeKey | null>(null)
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogKey | null>(null)

  // Leer pathname para obtener type y catalog
  useEffect(() => {
    const pathSegments = pathname.split("/").filter(Boolean)
    // pathname será algo como: /catalogs o /catalogs/projects o /catalogs/projects/amenities
    
    if (pathSegments.length >= 2 && pathSegments[0] === "catalogs") {
      const type = pathSegments[1] as CatalogTypeKey
      if (type && Object.keys(CATALOG_TYPES).includes(type)) {
        setSelectedType(type)
        
        if (pathSegments.length >= 3) {
          const catalog = pathSegments[2]
          const typeData = CATALOG_TYPES[type]
          const catalogExists = typeData.catalogs.some((c) => c.key === catalog)
          if (catalogExists) {
            setSelectedCatalog(catalog)
          } else {
            setSelectedCatalog(null)
          }
        } else {
          setSelectedCatalog(null)
        }
      } else {
        setSelectedType(null)
        setSelectedCatalog(null)
      }
    } else {
      setSelectedType(null)
      setSelectedCatalog(null)
    }
  }, [pathname])

  const updateURL = (type: CatalogTypeKey | null, catalog: CatalogKey | null) => {
    // Mantener los query params existentes (search, page, pageSize)
    const currentParams = new URLSearchParams(searchParams.toString())
    
    // Construir el path
    let newPath = "/catalogs"
    if (type) {
      newPath += `/${type}`
      if (catalog) {
        newPath += `/${catalog}`
      }
    }
    
    // Agregar query params si existen
    const queryString = currentParams.toString()
    const newURL = queryString ? `${newPath}?${queryString}` : newPath
    router.push(newURL)
  }

  const handleTypeSelect = (type: CatalogTypeKey) => {
    setSelectedType(type)
    setSelectedCatalog(null)
    updateURL(type, null)
  }

  const handleCatalogSelect = (catalogKey: CatalogKey) => {
    setSelectedCatalog(catalogKey)
    if (selectedType) {
      updateURL(selectedType, catalogKey)
    }
  }

  const handleBackToTypes = () => {
    setSelectedType(null)
    setSelectedCatalog(null)
    updateURL(null, null)
  }

  const handleBackToCatalogs = () => {
    setSelectedCatalog(null)
    if (selectedType) {
      updateURL(selectedType, null)
    }
  }

  // Si no hay tipo seleccionado, mostrar la vista de tipos
  if (!selectedType) {
  return (
    <div className="p-6 space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{t('title')}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-tour="catalogs-types">
          {Object.entries(CATALOG_TYPES).map(([key, type]) => (
            <Card
              key={key}
              className="border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => handleTypeSelect(key as CatalogTypeKey)}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  {key === "projects" && <Building2 className="w-6 h-6 text-primary" />}
                  {key === "blocks" && <Blocks className="w-6 h-6 text-primary" />}
                  {key === "units" && <Home className="w-6 h-6 text-primary" />}
                  <CardTitle>{t(`types.${key}`)}</CardTitle>
                </div>
                <CardDescription>
                  {type.catalogs.length} {type.catalogs.length !== 1 ? t('catalogs') : t('catalog')} {t('available')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {type.catalogs.slice(0, 3).map((catalog) => (
                    <li key={catalog.key}>• {t(`catalogNames.${catalog.key}`)}</li>
                  ))}
                  {type.catalogs.length > 3 && (
                    <li className="text-xs">+{type.catalogs.length - 3} {t('more')}</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ))}
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

  const currentType = CATALOG_TYPES[selectedType]
  const typeName = t(`types.${selectedType}`)

  // Si hay tipo pero no catálogo seleccionado, mostrar lista de catálogos
  if (!selectedCatalog) {
    return (
      <div className="p-6 space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                href="/catalogs"
                className="hover:text-foreground"
              >
                {t('title')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{typeName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBackToTypes}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{typeName}</h1>
            <p className="text-muted-foreground mt-1">{t('selectCatalog')}</p>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-tour="catalogs-list">
              {currentType.catalogs.map((catalog) => {
                const catalogName = t(`catalogNames.${catalog.key}`)
                return (
                  <Card
                    key={catalog.key}
                    className="border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleCatalogSelect(catalog.key)}
                  >
                    <CardHeader>
                      <CardTitle className="text-lg">{catalogName}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {t('manageCatalog')} {catalogName.toLowerCase()}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
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

  // Si hay catálogo seleccionado, mostrar la tabla
  const currentCatalog = currentType.catalogs.find((c) => c.key === selectedCatalog)

  if (!currentCatalog) {
    return null
  }

  const catalogName = t(`catalogNames.${currentCatalog.key}`)

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href="/catalogs"
              className="hover:text-foreground"
            >
              {t('title')}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/catalogs/${selectedType}`}
              className="hover:text-foreground"
            >
              {typeName}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{catalogName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBackToCatalogs}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{catalogName}</h1>
          <p className="text-muted-foreground mt-1">
            {typeName} • {catalogName}
          </p>
        </div>
      </div>

      <CatalogTable
        catalogName={currentCatalog.key}
        catalogDisplayName={catalogName}
        endpoint={currentCatalog.endpoint}
        type={selectedType}
        catalog={selectedCatalog}
      />

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
