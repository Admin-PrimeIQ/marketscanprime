"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Pencil, Copy, Calendar, DollarSign, Building2, Home, FileQuestion, RefreshCcw } from "lucide-react"
import Link from "next/link"
import { strapiClient, type StrapiProject } from "@/lib/api/strapi"
import { useRouter, useParams } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TriangleAlert } from "lucide-react"

const getAvailabilityLabel = (availability?: string) => {
  const labels: Record<string, string> = {
    planning: "Planificación",
    development: "Desarrollo",
    marketing: "Marketing",
    construction: "En construcción",
    completed: "Completado",
    cancelled: "Cancelado",
  }
  return availability ? labels[availability] || availability : "Sin fase"
}

const getAvailabilityVariant = (availability?: string): "default" | "secondary" | "outline" | "destructive" => {
  if (availability === "completed") return "default"
  if (availability === "construction" || availability === "development") return "secondary"
  if (availability === "cancelled") return "destructive"
  return "outline"
}

const formatDate = (value?: string) => {
  if (!value) return "N/D"
  const date = new Date(value)
  if (isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
}

const CURRENCY_RATE_GTQ_USD = Number(process.env.NEXT_PUBLIC_GTQ_USD_RATE || 7.8) || 7.8

const formatMoney = (value: number, currency: string) => {
  const formatter = new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'GTQ',
    maximumFractionDigits: 2,
  })
  return formatter.format(value)
}

const convertCurrency = (value: number, from: string) => {
  if (from === 'USD') {
    return { value, toUSD: value, toGTQ: value * CURRENCY_RATE_GTQ_USD }
  }
  // Default assume GTQ
  return { value, toGTQ: value, toUSD: value / CURRENCY_RATE_GTQ_USD }
}

const getUnitStats = (units: StrapiProject['units']) => {
  if (!Array.isArray(units) || units.length === 0) {
    return { available: 0, avgPricePerSqm: null, currency: null as string | null }
  }

  const availableUnits = units.filter((u) => u?.availability === 'available')

  // Promedio ponderado: suma de precios / suma de áreas (solo unidades con datos válidos)
  const validUnits = units.filter((u) => u && u.price && u.area && u.area > 0)
  const totalArea = validUnits.reduce((sum, u) => sum + (u!.area || 0), 0)
  const totalPrice = validUnits.reduce((sum, u) => sum + (u!.price || 0), 0)

  const avgPricePerSqm = totalArea > 0 ? totalPrice / totalArea : null
  const currency = validUnits[0]?.currency || null

  return { available: availableUnits.length, avgPricePerSqm, currency }
}

export default function ProjectDetailPage() {
  const router = useRouter()
  const params = useParams()
  const documentId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
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
        const data = await strapiClient.getProjectById(documentId)
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
              <h2 className="text-xl font-semibold text-foreground">No se encontró el proyecto</h2>
              <p className="text-sm text-muted-foreground">
                {error === "Not Found" ? "El identificador no coincide con ningún proyecto." : (error || "No se pudo cargar el proyecto.")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" asChild>
                <Link href="/projects">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Volver al listado
                </Link>
              </Button>
              <Button onClick={() => router.refresh()}>
                <RefreshCcw className="w-4 h-4 mr-2" />
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const categoryName = project.categoryId?.name || "Sin categoría"
  const availabilityLabel = getAvailabilityLabel(project.availability)
  const amenities = project.projectAmenity || []
  const services = project.projectService || []
  const banks = project.projectBankShare || []
  const unitStats = getUnitStats(project.units)
  const currency = unitStats.currency || 'GTQ'
  const converted = typeof unitStats.avgPricePerSqm === 'number' ? convertCurrency(unitStats.avgPricePerSqm, currency) : null

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/projects">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{project.name || "Proyecto sin nombre"}</h1>
              <Badge variant="outline">{categoryName}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-muted-foreground">
              <p>{project.code || "Sin código"}</p>
              <Badge variant={getAvailabilityVariant(project.availability)}>{availabilityLabel}</Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href={`/projects/${project.documentId || project.id}/edit`}>
            <Button>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </Button>
          </Link>
          <Link href={`/projects/clone/${project.documentId || project.id}`}>
            <Button variant="outline">
              <Copy className="w-4 h-4 mr-2" />
              Duplicar
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unidades Disponibles</CardTitle>
            <Home className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {unitStats.available ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Basado en unidades con disponibilidad "available"
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Precio Promedio mts²</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {typeof unitStats.avgPricePerSqm === "number"
                ? formatMoney(unitStats.avgPricePerSqm, currency)
                : "N/D"}
            </div>
            <p className="text-xs text-muted-foreground">Promedio ponderado de unidades con precio y área</p>
            {converted && (
              <p className="text-xs text-muted-foreground">
                Equivale a{" "}
                {currency === 'USD'
                  ? formatMoney(converted.toGTQ, 'GTQ')
                  : formatMoney(converted.toUSD, 'USD')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fase</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availabilityLabel}</div>
            <p className="text-xs text-muted-foreground">Estado actual del proyecto</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Información General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Descripción</p>
              <p className="text-sm text-foreground leading-relaxed">
                {project.description || "Sin descripción"}
              </p>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Desarrollador:</span>
              <span className="text-sm font-medium text-foreground">{project.developer || "Sin desarrollador"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Categoría:</span>
              <Badge variant="outline">{categoryName}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Ubicación:</span>
              <span className="text-sm font-medium text-foreground">
                {typeof project.location === "object" && project.location
                  ? `${project.location.city || "Ciudad desconocida"}${project.location.zone ? `, Zona ${project.location.zone}` : ""}`
                  : project.location || "Sin ubicación"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Departamento:</span>
              <span className="text-sm font-medium text-foreground">
                {typeof project.location === "object" && project.location?.country
                  ? project.location.country
                  : "Sin país"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Cronograma
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Fecha de Inicio:</span>
              <span className="text-sm font-medium text-foreground">{formatDate(project.startDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Fecha de Entrega:</span>
              <span className="text-sm font-medium text-foreground">{formatDate(project.deliveryDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Fecha de Recolección:</span>
              <span className="text-sm font-medium text-foreground">{formatDate(project.launchDate)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Amenidades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {amenities.length > 0 ? (
                amenities.map((amenidad, index) => (
                  <Badge key={amenidad.documentId || amenidad.id || index} variant="secondary">
                    {amenidad.name || amenidad.code || "Amenidad"}
                </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Sin amenidades registradas</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Servicios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {services.length > 0 ? (
                services.map((servicio, index) => (
                  <Badge key={servicio.documentId || servicio.id || index} variant="secondary">
                    {servicio.name || servicio.code || "Servicio"}
                </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Sin servicios registrados</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Bancos Participantes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
              {banks.length > 0 ? (
                banks.map((banco, index) => (
                  <div key={banco.documentId || banco.id || index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="font-medium text-foreground">{banco.name || banco.code || "Banco"}</span>
                    <Badge variant="outline">{banco.swiftCode ? `SWIFT: ${banco.swiftCode}` : banco.country || "—"}</Badge>
              </div>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Sin bancos registrados</span>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
