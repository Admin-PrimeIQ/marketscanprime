"use client"

import { useState, useRef, FormEvent, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, X, Loader2, CheckCircle } from "lucide-react"
import { GeneralInfoTab } from "./form-tabs/general-info-tab"
import { LocationTab } from "./form-tabs/location-tab"
import { AmenitiesTab } from "./form-tabs/amenities-tab"
import { ServicesTab } from "./form-tabs/services-tab"
import { FinancingTab } from "./form-tabs/financing-tab"
import { CurrenciesTab } from "./form-tabs/currencies-tab"
import Link from "next/link"
import {
  type StrapiProject,
  type StrapiExchangeRateProfile,
  type StrapiCurrenciesComponent,
  getRelationDocumentId,
} from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useTranslations } from "next-intl"
import { toast } from "@/hooks/use-toast"

interface ProjectFormProps {
  mode?: "create" | "edit"
  initialData?: Partial<StrapiProject>
}


export function ProjectForm({ mode = "create", initialData }: ProjectFormProps) {
  const t = useTranslations('projectForm')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingAmenities, setIsLoadingAmenities] = useState(true)
  const [isLoadingServices, setIsLoadingServices] = useState(true)
  const formRef = useRef<HTMLFormElement>(null)

  // Estados para amenities y servicios (almacenados en memoria)
  const [selectedAmenities, setSelectedAmenities] = useState<(string | number)[]>(
    (initialData?.amenities || []).map((a) => {
      if (typeof a === 'object' && a !== null) {
        return a.documentId || String(a.id)
      }
      return String(a)
    })
  )
  const [selectedServices, setSelectedServices] = useState<(string | number)[]>(
    (initialData?.services || []).map((s) => {
      if (typeof s === 'object' && s !== null) {
        return s.documentId || String(s.id)
      }
      return String(s)
    })
  )
  
  const exchangeProfileNoneValue = "__none__"
  const [exchangeRateProfiles, setExchangeRateProfiles] = useState<StrapiExchangeRateProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)
  const initialExchangeProfileDocId =
    getRelationDocumentId(initialData?.exchangeRateProfile) ?? ""
  const [selectedExchangeRateProfileId, setSelectedExchangeRateProfileId] = useState<string>(
    initialExchangeProfileDocId
  )

  useEffect(() => {
    setSelectedExchangeRateProfileId(initialExchangeProfileDocId)
  }, [initialExchangeProfileDocId])

  useEffect(() => {
    let cancelled = false
    setProfilesLoading(true)
    dataClient
      .getExchangeRateProfiles({ pageSize: 500 })
      .then((res) => {
        if (!cancelled) setExchangeRateProfiles(res.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setExchangeRateProfiles([])
      })
      .finally(() => {
        if (!cancelled) setProfilesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const [profileRatesPreview, setProfileRatesPreview] =
    useState<StrapiCurrenciesComponent | null>(() =>
      initialExchangeProfileDocId ? initialData?.currencies ?? null : null
    )
  const [profileRatesLoading, setProfileRatesLoading] = useState(false)

  useEffect(() => {
    if (!selectedExchangeRateProfileId) {
      setProfileRatesPreview(null)
      setProfileRatesLoading(false)
      return
    }

    let cancelled = false
    setProfileRatesLoading(true)

    dataClient
      .getExchangeRateProfileById(selectedExchangeRateProfileId)
      .then((profile) => {
        if (!cancelled) {
          setProfileRatesPreview(profile.currencies ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfileRatesPreview(null)
          toast({
            title: tCommon("error"),
            description: t("currencies.previewLoadError"),
            variant: "destructive",
            duration: 5000,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setProfileRatesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedExchangeRateProfileId, t, tCommon])

  const currenciesTabInitialData = useMemo(
    () => ({ ...initialData, currencies: profileRatesPreview ?? undefined }),
    [initialData, profileRatesPreview]
  )

  // Estados para campos controlados que no se pueden leer del FormData
  const [formState, setFormState] = useState({
    showroom: initialData?.showroom || false,
    modelHouse: initialData?.modelHouse || false,
    fha: initialData?.fha || false,
    muvi: initialData?.muvi || false,
    fractionalDownPayment: initialData?.fractionalDownPayment || false,
    developer: typeof initialData?.developer === 'object' && initialData.developer !== null
      ? (initialData.developer.documentId || String(initialData.developer.id))
      : (initialData?.developer || ''),
    securityType: typeof initialData?.securityType === 'object' && initialData.securityType !== null
      ? (initialData.securityType.documentId || String(initialData.securityType.id))
      : (initialData?.securityType || ''),
    country: typeof initialData?.country === 'object' && initialData.country !== null
      ? (initialData.country.documentId || String(initialData.country.id))
      : (initialData?.country || ''),
    nse: typeof initialData?.nse === 'object' && initialData.nse !== null
      ? (initialData.nse.documentId || String(initialData.nse.id))
      : (initialData?.nse || ''),
  })


  // Función para manejar cambios en amenities (solo actualiza estado local)
  const handleAmenitiesChange = (newAmenities: (string | number)[]) => {
    setSelectedAmenities(newAmenities)
  }

  // Función para manejar cambios en servicios (solo actualiza estado local)
  const handleServicesChange = (newServices: (string | number)[]) => {
    setSelectedServices(newServices)
  }


  // Obtener la ruta de cancelar (view si es edit, listado si es create)
  const getCancelRoute = () => {
    if (mode === "edit" && initialData?.documentId) {
      return `/projects/view/${initialData.documentId}`
    }
    return "/projects"
  }

  // Verificar si está cargando datos
  const isLoadingData = isLoadingAmenities || isLoadingServices

  // Manejar submit del formulario
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    setIsSaving(true)
    
    try {
      const form = e.currentTarget
      const formData = new FormData(form)
      
      // Recopilar datos del formulario
      const data: any = {}
      
      // Campos básicos (requeridos para create)
      const code = formData.get('cod_proyecto') as string
      const name = formData.get('nombre') as string
      
      if (code) data.code = code
      if (name) data.name = name
      
      // Developer y Security Type
      const developer = formData.get('developer') as string
      const securityType = formData.get('securityType') as string
      if (developer) data.developer = developer
      if (securityType) data.securityType = securityType
      
      // Location
      const department = formData.get('department') as string
      const municipality = formData.get('municipality') as string
      const zone = formData.get('zone') as string
      const subzone = formData.get('subzone') as string
      const latitude = formData.get('latitude') as string
      const longitude = formData.get('longitude') as string
      const country = formData.get('country') as string
      
      if (department) data.department = department
      if (municipality) data.municipality = municipality
      if (zone) data.zone = zone
      if (subzone) data.subzone = subzone
      if (latitude) data.latitude = parseFloat(latitude)
      if (longitude) data.longitude = parseFloat(longitude)
      if (country) data.country = country
      
      // Financing
      const nse = formData.get('nse') as string
      const downPaymentPercentage = formData.get('downPaymentPercentage') as string
      
      if (nse) data.nse = nse
      data.fha = formState.fha
      data.muvi = formState.muvi
      data.fractionalDownPayment = formState.fractionalDownPayment
      if (downPaymentPercentage) data.downPaymentPercentage = parseFloat(downPaymentPercentage)
      
      // General
      const accessQuantity = formData.get('accessQuantity') as string
      const imageUrl = formData.get('imageUrl') as string
      
      data.showroom = formState.showroom
      data.modelHouse = formState.modelHouse
      if (accessQuantity) data.accessQuantity = parseInt(accessQuantity)
      if (imageUrl) data.imageUrl = imageUrl
      
      // Amenities y Services
      data.amenities = selectedAmenities
      data.services = selectedServices
      
      if (mode === "create") {
        if (selectedExchangeRateProfileId) {
          data.exchangeRateProfile = selectedExchangeRateProfileId
        }
      } else {
        data.exchangeRateProfile = selectedExchangeRateProfileId || null
      }
      
      if (mode === "create") {
        // Validar campos requeridos para crear
        if (!data.code || !data.name) {
          toast({
            title: tCommon('error'),
            description: t('requiredFieldsMissing'),
            variant: "destructive",
            duration: 5000,
          })
          setIsSaving(false)
          return
        }

        // Crear nuevo proyecto
        const newProject = await dataClient.createProject(data)
        
        toast({
          title: tCommon('success'),
          description: t('projectCreated'),
          duration: 3000,
        })
        
        // Redirigir a la página de edición del proyecto creado
        const projectId = newProject.documentId || newProject.id
        router.push(`/projects/edit/${projectId}`)
      } else {
        // Modo edit - actualizar proyecto existente
        if (!initialData?.documentId) {
          toast({
            title: tCommon('error'),
            description: t('errorUpdating'),
            variant: "destructive",
            duration: 5000,
          })
          setIsSaving(false)
          return
        }

        await dataClient.updateProject(initialData.documentId, data)
        
        toast({
          title: tCommon('success'),
          description: t('projectUpdated'),
          duration: 3000,
        })
        
        router.refresh()
      }
    } catch (error) {
      console.error(`Error ${mode === "create" ? "creating" : "updating"} project:`, error)
      
      // Extraer mensaje de error específico de la respuesta
      let errorMessage = mode === "create" 
        ? t('errorCreating')
        : t('errorUpdating')
      
      try {
        // Intentar extraer información del error de Strapi
        if (error instanceof Error) {
          // Verificar si el error tiene información de Strapi adjunta
          const strapiError = (error as any).strapiError
          
          if (strapiError?.error) {
            const strapiErrorData = strapiError.error
            
            // Si hay detalles con errores específicos, construir mensaje detallado
            if (strapiErrorData.details?.errors && Array.isArray(strapiErrorData.details.errors)) {
              const errorDetails = strapiErrorData.details.errors
                .map((err: any) => {
                  const field = err.path?.join('.') || 'campo'
                  const message = err.message || strapiErrorData.message
                  return `${field}: ${message}`
                })
                .join(', ')
              errorMessage = `${errorMessage}: ${errorDetails}`
            } else if (strapiErrorData.message) {
              // Si solo hay un mensaje general, agregarlo
              errorMessage = `${errorMessage}: ${strapiErrorData.message}`
            }
          } else if (error.message && error.message !== errorMessage) {
            // Si el mensaje del error es diferente al genérico, usarlo
            errorMessage = `${errorMessage}: ${error.message}`
          }
        }
      } catch (parseError) {
        // Si falla el parsing, usar el mensaje genérico
        console.error('Error parsing error message:', parseError)
      }
      
      toast({
        title: tCommon('error'),
        description: errorMessage,
        variant: "destructive",
        duration: 8000, // Más tiempo para leer el mensaje detallado
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        {/* General Info Section */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl">{t('tabs.general')}</CardTitle>
          </CardHeader>
          <CardContent>
            <GeneralInfoTab
              initialData={initialData}
              disabled={isSaving}
              onStateChange={(state) => {
                setFormState(prev => ({ ...prev, ...state }))
              }}
            />
          </CardContent>
        </Card>

        {/* Location Section */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl">{t('tabs.location')}</CardTitle>
          </CardHeader>
          <CardContent>
            <LocationTab 
              initialData={initialData}
              disabled={isSaving}
              onStateChange={(state) => {
                setFormState(prev => ({ ...prev, ...state }))
              }}
            />
          </CardContent>
        </Card>

        {/* Amenities Section */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl">{t('tabs.amenities')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AmenitiesTab 
              selected={selectedAmenities} 
              disabled={isSaving}
              onChange={handleAmenitiesChange}
              onLoadingChange={setIsLoadingAmenities}
            />
          </CardContent>
        </Card>

        {/* Services Section */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl">{t('tabs.services')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ServicesTab 
              selected={selectedServices} 
              disabled={isSaving}
              onChange={handleServicesChange}
              onLoadingChange={setIsLoadingServices}
            />
          </CardContent>
        </Card>

        {/* Financing Section */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl">{t('tabs.financing')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FinancingTab 
              initialData={initialData}
              disabled={isSaving}
              onStateChange={(state) => {
                setFormState(prev => ({ ...prev, ...state }))
              }}
            />
          </CardContent>
        </Card>

        {/* Currencies Section */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl">{t('tabs.currencies') || 'Monedas'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exchange-rate-profile">
                {t("currencies.exchangeRateProfile")}
              </Label>
              <Select
                value={
                  selectedExchangeRateProfileId || exchangeProfileNoneValue
                }
                onValueChange={(v) => {
                  const next =
                    v === exchangeProfileNoneValue ? "" : v
                  setSelectedExchangeRateProfileId(next)
                  setProfileRatesPreview(null)
                  if (!next) setProfileRatesLoading(false)
                }}
                disabled={isSaving || profilesLoading || isLoadingData}
              >
                <SelectTrigger id="exchange-rate-profile">
                  <SelectValue
                    placeholder={t("currencies.selectExchangeRateProfile")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={exchangeProfileNoneValue}>
                    {t("currencies.noExchangeRateProfile")}
                  </SelectItem>
                  {exchangeRateProfiles.map((p) => {
                    const optValue = String(p.documentId ?? p.id ?? "")
                    if (!optValue) return null
                    return (
                      <SelectItem key={optValue} value={optValue}>
                        {p.name || p.code || p.documentId}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {t("currencies.ratesFromProfileHint")}
              </p>
            </div>
            {profileRatesLoading && selectedExchangeRateProfileId ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                {t("currencies.loadingPreview")}
              </div>
            ) : null}
            <CurrenciesTab
              key={selectedExchangeRateProfileId || "none"}
              initialData={currenciesTabInitialData}
              disabled
            />
          </CardContent>
        </Card>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-3 sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-3 sm:p-4 border-t border-border z-10">
            <Button 
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault()
                router.push(getCancelRoute())
              }}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              <X className="w-4 h-4 mr-2" />
              {t('cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={isSaving || isLoadingData}
              className="w-full sm:w-auto"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                <>
            <Save className="w-4 h-4 mr-2" />
                  {mode === "edit" ? t('updateProject') : t('saveProject')}
                </>
              )}
          </Button>
        </div>
    </form>
    </>
  )
}
