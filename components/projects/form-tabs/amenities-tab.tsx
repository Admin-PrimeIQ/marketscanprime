"use client"

import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useTranslations } from "next-intl"
import { type CatalogItem } from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { Spinner } from "@/components/ui/spinner"

interface AmenitiesTabProps {
  selected?: (string | number | undefined)[]
  disabled?: boolean
  onChange?: (selected: (string | number)[]) => void
  onLoadingChange?: (isLoading: boolean) => void
}

export function AmenitiesTab({ selected = [], disabled = false, onChange, onLoadingChange }: AmenitiesTabProps) {
  const t = useTranslations('projectForm.amenities')
  const [amenities, setAmenities] = useState<CatalogItem[]>([])
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
    const loadAmenities = async () => {
      try {
        setIsLoading(true)
        onLoadingChange?.(true)
        setError(null)
        const response = await dataClient.getCatalogList('amenities', {
          page: 1,
          pageSize: 1000,
          sort: 'name:asc',
        })
        setAmenities(response.data || [])
      } catch (err) {
        console.error('Error loading amenities:', err)
        setError(err instanceof Error ? err.message : 'Error al cargar amenidades')
      } finally {
        setIsLoading(false)
        onLoadingChange?.(false)
      }
    }
    loadAmenities()
  }, [onLoadingChange])

  const isSelected = (amenity: CatalogItem): boolean => {
    const amenityId = amenity.documentId || String(amenity.id)
    return localSelected.includes(amenityId) || 
           localSelected.includes(amenity.id) || 
           (amenity.code && localSelected.includes(amenity.code))
  }

  const handleToggle = (amenity: CatalogItem) => {
    const amenityId = amenity.documentId || String(amenity.id)
    const newSelected = isSelected(amenity)
      ? localSelected.filter(id => id !== amenityId && id !== amenity.id && id !== amenity.code)
      : [...localSelected, amenityId]
    
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

      {amenities.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          {t('noAmenities')}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {amenities.map((amenity) => {
            const amenityId = amenity.documentId || String(amenity.id)
            return (
              <div key={amenityId} className="flex items-center space-x-2 p-3 rounded-lg border border-border">
            <Checkbox
                  id={`amenity-${amenityId}`}
                  disabled={disabled}
                  checked={isSelected(amenity)}
                  onCheckedChange={() => handleToggle(amenity)}
            />
                <Label htmlFor={`amenity-${amenityId}`} className="cursor-pointer flex-1">
              {amenity.name}
            </Label>
          </div>
            )
          })}
      </div>
      )}
    </div>
  )
}
