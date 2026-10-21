"use client"

import { useEffect, useState, lazy, Suspense } from "react"
const ProjectMap = lazy(() => import("@/components/ui/project-map").then(m => ({ default: m.ProjectMap })))
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Pencil, Copy, Calendar, DollarSign, Building2, Home, FileQuestion, RefreshCcw, Blocks, MoreHorizontal, Coins, MapPin } from "lucide-react"
import { getProjectRegions, REGION_BADGE_CLASS } from "@/lib/region"
import { CountryPill } from "@/components/ui/country-pill"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type StrapiProject } from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { useRouter, useParams } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { es } from "date-fns/locale"

const formatDate = (dateString?: string | null): string => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const hasTime = dateString.includes('T') || (dateString.includes(' ') && dateString.includes(':'))
  
  if (hasTime) {
    return format(date, 'dd/MM/yyyy hh:mm a', { locale: es })
  } else {
    return format(date, 'dd/MM/yyyy', { locale: es })
  }
}

export default function ProjectViewPage() {
  const router = useRouter()
  const params = useParams()
  const t = useTranslations('common')
  const documentId = typeof params?.documentId === "string" ? params.documentId : Array.isArray(params?.documentId) ? params.documentId[0] : undefined
  const [project, setProject] = useState<StrapiProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!documentId) {
      setError("No se recibió el identificador del proyecto")
      setIsLoading(false)
      return
    }

    const loadProject = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await dataClient.getProjectById(documentId)
        setProject(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo cargar el proyecto"
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    loadProject()
  }, [documentId])

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center text-center gap-4 py-10">
            <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted">
              <FileQuestion className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-foreground">{t('projectNotFound') || 'No se encontró el proyecto'}</h2>
              <p className="text-sm text-muted-foreground">
                {error === "Not Found" ? "El identificador no coincide con ningún proyecto." : (error || "No se pudo cargar el proyecto.")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" asChild>
                <Link href="/projects">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t('backToList') || 'Volver al listado'}
                </Link>
              </Button>
              <Button onClick={() => router.refresh()}>
                <RefreshCcw className="w-4 h-4 mr-2" />
                {t('retry') || 'Reintentar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const developerName = typeof project.developer === 'object' && project.developer
    ? project.developer.name || project.developer.code || t('noDeveloper')
    : project.developer || t('noDeveloper')

  const countryName = typeof project.country === 'object' && project.country
    ? project.country.name || project.country.code || t('noCountry')
    : t('noCountry')

  const amenities = project.amenities || []
  const services = project.services || []
  const currencies = project.currencies

  // Mapeo de códigos de moneda a nombres completos
  const currencyNames: Record<string, string> = {
    mxn: 'Peso Mexicano (MXN)',
    gtq: 'Quetzal (GTQ)',
    hnl: 'Lempira (HNL)',
    crc: 'Colón Costarricense (CRC)',
    nio: 'Córdoba (NIO)',
    pab: 'Balboa (PAB)',
    bzd: 'Dólar Beliceño (BZD)',
  }

  // Obtener monedas activas (que tienen datos)
  // El componente currencies tiene la estructura: { id?, mxn?, gtq?, hnl?, crc?, nio?, pab?, bzd? }
  // Cada moneda es un objeto con { id?, buyRate?, sellRate? }
  const activeCurrencies = currencies ? Object.entries(currencies)
    .filter(([key, value]) => {
      // Filtrar solo las propiedades de moneda (no 'id')
      if (key === 'id') return false
      // Verificar que el valor sea un objeto con buyRate o sellRate
      return value && 
             typeof value === 'object' && 
             !Array.isArray(value) &&
             ((value as any)?.buyRate !== undefined || (value as any)?.sellRate !== undefined)
    })
    .map(([key, value]) => {
      const currencyData = value as { id?: number; buyRate?: number; sellRate?: number }
      return {
        code: key.toUpperCase(),
        name: currencyNames[key] || key.toUpperCase(),
        buyRate: currencyData?.buyRate,
        sellRate: currencyData?.sellRate,
      }
    })
    : []

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/projects">{t('projects')}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name || t('noName')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/projects">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{project.name || t('noName')}</h1>
              {project.code && <Badge variant="outline">{project.code}</Badge>}
              <CountryPill country={project.country} />
              {getProjectRegions(project.blocks).map(r => (
                <Badge key={r} className={REGION_BADGE_CLASS[r]}>{r}</Badge>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1 text-muted-foreground">
              <p className="text-sm sm:text-base">{developerName}</p>
            </div>
          </div>
        </div>

        {/* Mobile actions menu (top-right) */}
        <div className="absolute top-0 right-0 sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreHorizontal className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <Link href={`/blocks?project=${project.documentId || project.id}`}>
                <DropdownMenuItem>
                  <Blocks className="w-4 h-4 mr-2" />
                  {t('viewBlocks')}
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <Link href={`/projects/edit/${project.documentId || project.id}`}>
                <DropdownMenuItem>
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('edit')}
                </DropdownMenuItem>
              </Link>
              <Link href={`/projects/clone/${project.documentId || project.id}`}>
                <DropdownMenuItem>
                  <Copy className="w-4 h-4 mr-2" />
                  {t('duplicate')}
                </DropdownMenuItem>
              </Link>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Desktop actions */}
        <div className="hidden sm:flex items-center gap-3">
          <Link href={`/blocks?project=${project.documentId || project.id}`}>
            <Button variant="outline">
              <Blocks className="w-4 h-4 mr-2" />
              {t('viewBlocks')}
            </Button>
          </Link>
          <Link href={`/projects/edit/${project.documentId || project.id}`}>
            <Button>
              <Pencil className="w-4 h-4 mr-2" />
              {t('edit')}
            </Button>
          </Link>
          <Link href={`/projects/clone/${project.documentId || project.id}`}>
            <Button variant="outline">
              <Copy className="w-4 h-4 mr-2" />
              {t('duplicate')}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase">{t('amenities')}</CardTitle>
            <Home className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {amenities.length ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('totalAmenities') || 'Total de amenidades'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase">{t('services')}</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{services.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {t('totalServices') || 'Total de servicios'}
            </p>
          </CardContent>
        </Card>

      </div>

      {(() => {
        const hasLocation = project.department || project.municipality || project.zone || project.subzone
        if (!hasLocation) return null
        const regions = getProjectRegions(project.blocks)
        return (
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Ubicación
              </CardTitle>
              <div className="flex gap-1 flex-wrap items-center">
                <CountryPill country={project.country} />
                {regions.map(r => (
                  <Badge key={r} className={REGION_BADGE_CLASS[r]}>{r}</Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.department && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Departamento:</span>
                  <span className="text-sm font-medium text-foreground">{project.department}</span>
                </div>
              )}
              {project.municipality && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Municipio:</span>
                  <span className="text-sm font-medium text-foreground">{project.municipality}</span>
                </div>
              )}
              {project.zone && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Zona:</span>
                  <span className="text-sm font-medium text-foreground">{project.zone}</span>
                </div>
              )}
              {project.subzone && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Subzona:</span>
                  <span className="text-sm font-medium text-foreground">{project.subzone}</span>
                </div>
              )}
              {project.latitude && project.longitude && (
                <Suspense fallback={<div className="h-60 rounded-lg bg-muted animate-pulse" />}>
                  <ProjectMap latitude={project.latitude} longitude={project.longitude} />
                </Suspense>
              )}
            </CardContent>
          </Card>
        )
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">{t('basicInfo') || 'Información General'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t('developer')}:</span>
              <span className="text-sm font-medium text-foreground">{developerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t('country')}:</span>
              <span className="text-sm font-medium text-foreground">{countryName}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {t('importantDates') || 'Fechas Importantes'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t('createdAt')}:</span>
              <span className="text-sm font-medium text-foreground">{formatDate(project.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t('updatedAt')}:</span>
              <span className="text-sm font-medium text-foreground">{formatDate(project.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">{t('amenities')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {amenities.length > 0 ? (
                amenities.map((amenity, index) => (
                  <Badge key={amenity.documentId || amenity.id || index} variant="secondary">
                    {amenity.name || amenity.code || "Amenidad"}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">{t('noAmenities') || 'Sin amenidades registradas'}</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">{t('services')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {services.length > 0 ? (
                services.map((service, index) => (
                  <Badge key={service.documentId || service.id || index} variant="secondary">
                    {service.name || service.code || "Servicio"}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">{t('noServices') || 'Sin servicios registrados'}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Coins className="w-5 h-5" />
            {t('currencies') || 'Monedas Activas'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* USD como moneda base */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">USD - Dólar Estadounidense</p>
                  <p className="text-xs text-muted-foreground">
                    {t('baseCurrency') || 'Moneda base del sistema'}
                  </p>
                </div>
              </div>
              <Badge variant="default" className="bg-primary">
                {t('base') || 'Base'}
              </Badge>
            </div>

            {/* Monedas activas del proyecto */}
            {activeCurrencies.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  {t('activeCurrencies') || 'Monedas configuradas:'}
                </p>
                {activeCurrencies.map((currency) => (
                  <div
                    key={currency.code}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary">
                        <Coins className="w-5 h-5 text-secondary-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{currency.name}</p>
                        <div className="flex items-center gap-4 mt-1">
                          {currency.buyRate && (
                            <span className="text-xs text-muted-foreground">
                              <span className="font-medium">{t('buyRate') || 'Compra'}:</span>{' '}
                              {currency.buyRate.toLocaleString('es-GT', {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                              })}
                            </span>
                          )}
                          {currency.sellRate && (
                            <span className="text-xs text-muted-foreground">
                              <span className="font-medium">{t('sellRate') || 'Venta'}:</span>{' '}
                              {currency.sellRate.toLocaleString('es-GT', {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline">{currency.code}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-dashed bg-muted/30">
                <p className="text-sm text-muted-foreground text-center">
                  {t('noCurrenciesConfigured') || 'No hay monedas configuradas para este proyecto'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

