"use client"

import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useTranslations } from "next-intl"
import { strapiClient, type CatalogItem } from "@/lib/api/strapi"
import { Spinner } from "@/components/ui/spinner"

interface ServicesTabProps {
  selected?: (string | number | undefined)[]
  disabled?: boolean
  onChange?: (selected: (string | number)[]) => void
  onLoadingChange?: (isLoading: boolean) => void
}

export function ServicesTab({ selected = [], disabled = false, onChange, onLoadingChange }: ServicesTabProps) {
  const t = useTranslations('projectForm.services')
  const [services, setServices] = useState<CatalogItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localSelected, setLocalSelected] = useState<(string | number)[]>(
    selected.filter((s): s is string | number => s !== undefined)
  )

  // Sincronizar con prop selected cuando cambia externamente
  useEffect(() => {
    const filtered = selected.filter((s): s is string | number => s !== undefined)
    setLocalSelected(filtered)
  }, [selected])

  useEffect(() => {
    const loadServices = async () => {
      try {
        setIsLoading(true)
        onLoadingChange?.(true)
        setError(null)
        const response = await strapiClient.getCatalogList('services', {
          page: 1,
          pageSize: 1000,
          sort: 'name:asc',
        })
        setServices(response.data || [])
      } catch (err) {
        console.error('Error loading services:', err)
        setError(err instanceof Error ? err.message : 'Error al cargar servicios')
      } finally {
        setIsLoading(false)
        onLoadingChange?.(false)
      }
    }
    loadServices()
  }, [onLoadingChange])

  const isSelected = (service: CatalogItem): boolean => {
    const serviceId = service.documentId || String(service.id)
    return localSelected.includes(serviceId) || 
           localSelected.includes(service.id) || 
           (service.code && localSelected.includes(service.code))
  }

  const handleToggle = (service: CatalogItem) => {
    const serviceId = service.documentId || String(service.id)
    const newSelected = isSelected(service)
      ? localSelected.filter(id => id !== serviceId && id !== service.id && id !== service.code)
      : [...localSelected, serviceId]
    
    setLocalSelected(newSelected)
    
    // Llamar al callback si existe
    if (onChange) {
      onChange(newSelected)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('title')}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t('description')}</p>
        </div>
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('title')}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t('description')}</p>
        </div>
        <div className="text-sm text-destructive py-4">{t('errorLoading')}: {error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{t('title')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('description')}</p>
      </div>

      {services.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          {t('noServices')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => {
            const serviceId = service.documentId || String(service.id)
            return (
              <div key={serviceId} className="flex items-center space-x-2 p-3 rounded-lg border border-border">
                <Checkbox
                  id={`service-${serviceId}`}
                  disabled={disabled}
                  checked={isSelected(service)}
                  onCheckedChange={() => handleToggle(service)}
                />
                <Label htmlFor={`service-${serviceId}`} className="cursor-pointer flex-1">
                  {service.name}
                </Label>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
