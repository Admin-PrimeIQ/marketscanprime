"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Pencil, Copy, Home, Info, Calendar, Tag, Building2, DollarSign, Car, FileText, Layers, MoreHorizontal, MapPin, Landmark } from "lucide-react"
import { bancosActivos, BANCO_LABEL } from "@/lib/financing"
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
import { strapiClient, type StrapiBlock } from "@/lib/api/strapi"
import { getBlockRegion, REGION_BADGE_CLASS } from "@/lib/region"
import { CountryPill } from "@/components/ui/country-pill"
import { useRouter, useParams } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { M2_TO_VARAS_SQUARED } from "@/lib/constants"
import { formatCalendarDateGt } from "@/lib/calendar-date"

/** Instantes reales (creado/actualizado): zona local del usuario. */
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

// Función helper para convertir mts² a varas cuadradas
const m2ToVarasSquared = (m2: number | null | undefined): number | null => {
  if (m2 === null || m2 === undefined) return null
  return m2 * M2_TO_VARAS_SQUARED
}

// Función helper para formatear valores de área con conversión
const formatAreaWithConversion = (m2: number | null | undefined): string => {
  if (m2 === null || m2 === undefined) return '-'
  const varas = m2ToVarasSquared(m2)
  return `${m2.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mts² (${varas?.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} varas²)`
}

export default function BlockViewPage() {
  const router = useRouter()
  const params = useParams()
  const t = useTranslations('common')
  const tView = useTranslations('common.blockView')
  const tForm = useTranslations('common.blockForm')
  const blockId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
  const [block, setBlock] = useState<StrapiBlock | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!blockId) {
      setError(tView('noBlockIdReceived'))
      setIsLoading(false)
      return
    }

    const loadBlock = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await strapiClient.getBlockById(blockId)
        setBlock(data)
        
        // Moneda por defecto GTQ (no se carga del proyecto)
        // Los valores se muestran en ambas monedas (GTQ y USD) según los datos del bloque
      } catch (err) {
        const message = err instanceof Error ? err.message : tView('couldNotLoadBlock')
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    loadBlock()
  }, [blockId, tView])

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
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !block) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/blocks">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Button onClick={() => router.refresh()}>{t('retry')}</Button>
        </div>
        <Alert variant="destructive">
          <TriangleAlert className="w-4 h-4" />
          <AlertTitle>{t('error')}</AlertTitle>
          <AlertDescription>{error || tView('couldNotLoadBlock')}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbLink href="/blocks" className="text-xs sm:text-sm">{t('blocks')}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs sm:text-sm">{block.name || t('noName')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-2 sm:gap-4 min-w-0 flex-1">
          <Link href="/blocks">
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground truncate">{block.name || t('noName')}</h1>
              {block.code && (
                <Badge variant="outline" className="text-xs sm:text-sm flex-shrink-0">{block.code}</Badge>
              )}
              <CountryPill country={block.project?.country} className="text-xs sm:text-sm shrink-0" />
              {(() => {
                const region = getBlockRegion(block.quarter)
                return (
                  <Badge className={`text-xs sm:text-sm flex-shrink-0 ${REGION_BADGE_CLASS[region]}`}>
                    {region}
                  </Badge>
                )
              })()}
            </div>
            {block.project?.name && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">{block.project.name}</p>
            )}
          </div>
        </div>

        {/* Actions menu - Mobile: dropdown, Desktop: buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Mobile: Dropdown menu */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {block.project && (
                  <Link href={`/units/list/${block.documentId || block.id}`}>
                    <DropdownMenuItem>
                      <Home className="w-4 h-4 mr-2" />
                      {t('viewUnits')}
                    </DropdownMenuItem>
                  </Link>
                )}
                <DropdownMenuSeparator />
                <Link href={`/blocks/edit/${block.documentId || block.id}`}>
                  <DropdownMenuItem>
                    <Pencil className="w-4 h-4 mr-2" />
                    {t('edit')}
                  </DropdownMenuItem>
                </Link>
                <Link href={`/blocks/clone/${block.documentId || block.id}`}>
                  <DropdownMenuItem>
                    <Copy className="w-4 h-4 mr-2" />
                    {t('duplicate')}
                  </DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Desktop: Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {block.project && (
              <Link href={`/units/list/${block.documentId || block.id}`}>
                <Button variant="outline">
                  <Home className="w-4 h-4 mr-2" />
                  {t('viewUnits')}
                </Button>
              </Link>
            )}
            <Link href={`/blocks/edit/${block.documentId || block.id}`}>
              <Button>
                <Pencil className="w-4 h-4 mr-2" />
                {t('edit')}
              </Button>
            </Link>
            <Link href={`/blocks/clone/${block.documentId || block.id}`}>
              <Button variant="outline">
                <Copy className="w-4 h-4 mr-2" />
                {t('duplicate')}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {(() => {
        const p = block.project
        if (!p?.department && !p?.municipality && !p?.zone && !p?.subzone) return null
        const region = getBlockRegion(block.quarter)
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-muted-foreground" />
                Ubicación del proyecto
              </CardTitle>
              <div className="flex items-center gap-1 flex-wrap">
                <CountryPill country={block.project?.country} />
                <Badge className={REGION_BADGE_CLASS[region]}>
                  {region}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {p.department && (
                  <div>
                    <p className="text-xs text-muted-foreground">Departamento</p>
                    <p className="text-sm font-medium mt-0.5">{p.department}</p>
                  </div>
                )}
                {p.municipality && (
                  <div>
                    <p className="text-xs text-muted-foreground">Municipio</p>
                    <p className="text-sm font-medium mt-0.5">{p.municipality}</p>
                  </div>
                )}
                {p.zone && (
                  <div>
                    <p className="text-xs text-muted-foreground">Zona</p>
                    <p className="text-sm font-medium mt-0.5">{p.zone}</p>
                  </div>
                )}
                {p.subzone && (
                  <div>
                    <p className="text-xs text-muted-foreground">Subzona</p>
                    <p className="text-sm font-medium mt-0.5">{p.subzone}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="w-5 h-5 text-muted-foreground" />
              {tView('basicInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{t('code')}</p>
              <p className="font-medium">{block.code || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('name')}</p>
              <p className="font-medium">{block.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('project')}</p>
              <p className="font-medium">{block.project?.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('phase')}</p>
              <p className="font-medium">{block.phase || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('tower')}</p>
              <p className="font-medium">{block.tower || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('sector')}</p>
              <p className="font-medium">{block.sector || '-'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              {tView('collectionPeriod')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{t('year')}</p>
              <p className="font-medium">{block.year || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('quarter')}</p>
              <p className="font-medium">{block.quarter || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('collectionDate')}</p>
              <p className="font-medium">{formatCalendarDateGt(block.collectionDate)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Tag className="w-5 h-5 text-muted-foreground" />
              {tView('classification')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Primero, como en el formulario: es lo que enmarca al resto y lo
                que decide contra qué tablas del warehouse se sincroniza. */}
            <div>
              <p className="text-sm text-muted-foreground">{tForm('domainLabel')}</p>
              <p className="font-medium">
                {block.domain ? tForm(`domain${block.domain === 'housing' ? 'Housing' : block.domain === 'office' ? 'Office' : 'Industrial'}`) : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('category')}</p>
              <p className="font-medium">{block.blockCategory?.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('focus')}</p>
              <p className="font-medium">{block.blockFocus?.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('status')}</p>
              <p className="font-medium">{block.blockStatus?.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('market')}</p>
              <p className="font-medium">{block.market ?? '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tForm('usageLabel')}</p>
              <p className="font-medium">
                {block.blockUsage ? tForm(block.blockUsage === 'Venta' ? 'usageSale' : 'usageRent') : '-'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="w-5 h-5 text-muted-foreground" />
              {t('units')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{t('totalUnits')}</p>
              <p className="font-medium">{block.totalUnits ?? '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('availableUnits')}</p>
              <p className="font-medium">{block.availableUnits ?? '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('totalArea')}</p>
              <p className="font-medium">{formatAreaWithConversion(block.totalM2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('availableArea')}</p>
              <p className="font-medium">{formatAreaWithConversion(block.availableM2)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              {tView('importantDates')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{tView('startDate')}</p>
              <p className="font-medium">{formatCalendarDateGt(block.startDate)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('deliveryDate')}</p>
              <p className="font-medium">{formatCalendarDateGt(block.deliveryDate)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('commercializationMonths')}</p>
              <p className="font-medium">{block.commercializationMonths ?? '-'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-muted-foreground" />
              {tView('pricesAndFinancing')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{tView('averagePrice')}</p>
              <p className="font-medium">
                {block.averagePriceUSD 
                  ? `$ ${block.averagePriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` 
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('averageSize')}</p>
              <p className="font-medium">{formatAreaWithConversion(block.averageSizeM2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('averagePricePerM2')}</p>
              <p className="font-medium">
                {block.averagePricePerM2USD 
                  ? `$ ${block.averagePricePerM2USD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` 
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('averageInstallment')}</p>
              <p className="font-medium">
                {block.averageInstallmentUSD 
                  ? `$ ${block.averageInstallmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` 
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('averageIncome')}</p>
              <p className="font-medium">
                {block.averageIncomeUSD 
                  ? `$ ${block.averageIncomeUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` 
                  : '-'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Financiamiento. Sólo en vivienda: `banking_info` no tiene equivalente
            en oficinas ni industrial, así que una tarjeta vacía ahí sugeriría un
            dato faltante en vez de uno que no aplica — el mismo criterio que
            `parkingForSale` usa justo abajo. */}
        {block.domain === 'housing' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Landmark className="w-5 h-5 text-muted-foreground" />
              {tForm('financingTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!block.financing ? (
              <p className="text-sm text-muted-foreground">{tForm('financingNone')}</p>
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">{tForm('downPayment')}</p>
                  <p className="font-medium">
                    {block.financing.downPaymentPercent != null
                      ? `${block.financing.downPaymentPercent} %`
                      : '-'}
                    {block.financing.fractionalDownPayment === true
                      ? ` · ${tForm('fractionalShort')}`
                      : block.financing.fractionalDownPayment === false
                        ? ` · ${tForm('notFractionalShort')}`
                        : ''}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{tForm('minDownPayment')}</p>
                  <p className="font-medium">
                    {tForm('maxLoanTermFHA')} {block.financing.minDownPaymentFHA ?? '-'} % ·{' '}
                    {tForm('maxLoanTermBanks')} {block.financing.minDownPaymentOtherBanks ?? '-'} %
                  </p>
                </div>
                <div>
                  {/* Tres plazos, no dieciocho: el warehouse los agrupa y los
                      dieciséis bancos comerciales comparten uno. */}
                  <p className="text-sm text-muted-foreground">{tForm('maxLoanTerm')}</p>
                  <p className="font-medium">
                    {tForm('maxLoanTermFHA')} {block.financing.maxLoanTermYearsFHA ?? '-'} ·{' '}
                    {tForm('maxLoanTermBanks')} {block.financing.maxLoanTermYearsBanks ?? '-'} ·{' '}
                    {tForm('maxLoanTermOwner')} {block.financing.maxLoanTermYearsOwner ?? '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {tForm('banks')} ({bancosActivos(block.financing).length})
                  </p>
                  {bancosActivos(block.financing).length === 0 ? (
                    <p className="font-medium text-muted-foreground">{tForm('noBanksShort')}</p>
                  ) : (
                    <div className="space-y-1 mt-1">
                      {bancosActivos(block.financing).map((banco) => (
                        <div
                          key={banco}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span>{BANCO_LABEL[banco]}</span>
                          <span className="font-medium tabular-nums">
                            {block.financing?.[banco]?.annualRatePercent != null
                              ? `${block.financing[banco]!.annualRatePercent} %`
                              : '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Car className="w-5 h-5 text-muted-foreground" />
              {tView('parking')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{tView('visitorParking')}</p>
              <p className="font-medium">{block.visitorParking ?? '-'}</p>
            </div>
            {/* Sólo en oficinas: `parqueos_para_venta` no existe como columna en
                las otras dos tablas de universo, así que mostrarlo vacío en un
                bloque de vivienda sugeriría un dato faltante en vez de uno que
                no aplica. */}
            {block.domain === 'office' && (
            <div>
              <p className="text-sm text-muted-foreground">{tView('parkingForSale')}</p>
              <p className="font-medium">{block.parkingForSale ?? '-'}</p>
            </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">{tView('assignedParking')}</p>
              <p className="font-medium">{block.assignedParking ?? '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('totalProjectParking')}</p>
              <p className="font-medium">{block.totalProjectParking ?? '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{tView('additionalParkingPrice')}</p>
              <p className="font-medium">
                {block.additionalParkingPriceUSD 
                  ? `$ ${block.additionalParkingPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` 
                  : '-'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-muted-foreground" />
              {tView('additionalInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{tView('legacyId')}</p>
              <p className="font-medium">{block.legacyId || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('createdAt')}</p>
              <p className="font-medium">{formatDate(block.createdAt) || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('updatedAt')}</p>
              <p className="font-medium">{formatDate(block.updatedAt) || '-'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

