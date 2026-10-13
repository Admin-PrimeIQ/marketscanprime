"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Monitor, X } from "lucide-react"
import { DatasheetUnitsTable } from "@/components/units/datasheet-units-table"
import { strapiClient, type StrapiUnit, type StrapiBlock } from "@/lib/api/strapi"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Skeleton } from "@/components/ui/skeleton"
import { TourGuide } from "@/components/tour/tour-guide"
import { useTour } from "@/hooks/use-tour"
import { getUnitsTableTourSteps } from "@/components/tour/tour-steps"
import { getBlockRegion, REGION_BADGE_CLASS } from "@/lib/region"
import { DOMAIN_PILL_CLASS, domainLabelKey } from "@/lib/domain"
import { BEHAVIOR_BADGE_CLASS, blockBehavior } from "@/lib/block-category"
import { CountryPill } from "@/components/ui/country-pill"

export default function UnitsByBlockPage() {
  const params = useParams()
  const router = useRouter()
  const blockId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : ""
  const t = useTranslations('common')
  const tTour = useTranslations('tour.unitsTable')
  const tBlockForm = useTranslations('common.blockForm')
  const tour = useTour('units-table')
  const tourSteps = getUnitsTableTourSteps(tTour)

  const [units, setUnits] = useState<StrapiUnit[]>([])
  const currentBlock = blockId || ""
  const [currentBlockInfo, setCurrentBlockInfo] = useState<StrapiBlock | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDesktopAlert, setShowDesktopAlert] = useState(true)

  // Carga de unidades del bloque actual
  useEffect(() => {
    const loadUnits = async () => {
      try {
        setIsLoading(true)
        setError(null)
        if (currentBlock) {
          const [blockData, unitsRes] = await Promise.all([
            strapiClient.getBlockById(currentBlock).catch(() => null),
            strapiClient.getUnitsAllPages({ blockDocumentId: currentBlock, pageSize: 200 })
          ])
          if (blockData) setCurrentBlockInfo(blockData)
          setUnits(unitsRes.data || [])
        } else {
          setUnits([])
          setCurrentBlockInfo(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errorLoadingUnits'))
      } finally {
        setIsLoading(false)
      }
    }
    loadUnits()
  }, [currentBlock])

  const blockCatStr = `${currentBlockInfo?.blockCategory?.name || ""} ${currentBlockInfo?.blockCategory?.code || ""}`.toLowerCase()
  const blockIsVertical = currentBlockInfo ? (blockCatStr.includes("vertical") || blockCatStr.includes("vert")) : undefined
  const blockIsLote = currentBlockInfo ? (blockCatStr.includes("lote") || blockCatStr.includes("lot")) : undefined

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbLink href="/units" className="text-xs sm:text-sm">{t('units')}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs sm:text-sm">
              {currentBlockInfo?.name || t('units')}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/units')}
            className="h-8 w-8 sm:h-10 sm:w-10"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">{t('units')}</h1>
              {currentBlockInfo && (() => {
                const region = getBlockRegion(currentBlockInfo.quarter)
                // Sale de los mismos booleanos que alimentan las fórmulas, no
                // de una segunda lectura del texto de la categoría.
                const categoryType = blockBehavior(blockIsVertical, blockIsLote)
                return (
                  <>
                    {/* Todas las unidades de esta pantalla son de UN bloque, así
                        que el tipo es el mismo para todas: va una vez en la
                        cabecera y no como columna repetida en cada fila. Importa
                        porque decide qué campos tienen —`unit-types.offices`
                        tiene 12 y `unit-types.housing` 2, y son distintos. */}
                    {currentBlockInfo.domain && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${DOMAIN_PILL_CLASS[currentBlockInfo.domain]}`}>
                        {tBlockForm(domainLabelKey(currentBlockInfo.domain))}
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${REGION_BADGE_CLASS[region]}`}>
                      {region}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${BEHAVIOR_BADGE_CLASS[categoryType]}`}>
                      {categoryType}
                    </span>
                    <CountryPill country={currentBlockInfo.project?.country} />
                  </>
                )
              })()}
            </div>
            {currentBlockInfo ? (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {currentBlockInfo.project?.name && (
                  <>
                    <span className="text-sm text-muted-foreground font-medium truncate">
                      {currentBlockInfo.project.name}
                    </span>
                    <span className="text-muted-foreground/40 text-sm">›</span>
                  </>
                )}
                <span className="text-sm sm:text-base font-semibold text-foreground truncate">
                  {currentBlockInfo.name}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">{t('selectBlockPlaceholder')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile alert - Desktop recommendation */}
      {showDesktopAlert && (
        <div className="md:hidden">
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 relative">
            <Monitor className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-900 dark:text-amber-100 pr-8">{t('desktopRecommendedTitle')}</AlertTitle>
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              {t('desktopRecommendedMessage')}
            </AlertDescription>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-6 w-6 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900"
              onClick={() => setShowDesktopAlert(false)}
              aria-label={t('close') || 'Cerrar'}
            >
              <X className="h-4 w-4" />
            </Button>
          </Alert>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <DatasheetUnitsTable
          units={units}
          blockId={currentBlock || undefined}
          blockName={currentBlockInfo?.name ?? undefined}
          blockCollectionDate={currentBlockInfo?.collectionDate ?? undefined}
          blockStartDate={currentBlockInfo?.startDate ?? undefined}
          blockQuarter={currentBlockInfo?.quarter ?? undefined}
          blockCategory={currentBlockInfo?.blockCategory?.name ?? undefined}
          blockCategoryCode={currentBlockInfo?.blockCategory?.code ?? undefined}
          blockCountry={currentBlockInfo?.project?.country ?? undefined}
          blockIsVertical={blockIsVertical}
          blockIsLote={blockIsLote}
          isLoading={isLoading}
          onRefresh={async () => {
            // Reload units from API (same logic as useEffect)
            try {
              setIsLoading(true)
              if (currentBlock) {
                const unitsRes = await strapiClient.getUnitsAllPages({
                  blockDocumentId: currentBlock,
                  pageSize: 200,
                })
                setUnits(unitsRes.data || [])
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : t('errorLoadingUnits'))
            } finally {
              setIsLoading(false)
            }
          }}
        />
      )}

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

