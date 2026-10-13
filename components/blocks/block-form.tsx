"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BlockFinancingCard } from "@/components/blocks/block-financing-card"
import { financingParaGuardar } from "@/lib/financing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Save, Loader2, Check, ChevronsUpDown, Info, Calendar, Tag, Layers, DollarSign, Car } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  strapiClient,
  type StrapiBlock,
  type BlockDomain,
  type StrapiProject,
  type CatalogItem,
  localCurrencyUnitsPerOneUsd,
} from "@/lib/api/strapi"
import { toast } from "@/hooks/use-toast"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { M2_TO_VARAS_SQUARED } from "@/lib/constants"
import { toHtmlDateInputValue } from "@/lib/calendar-date"
import { buildBlockName } from "@/lib/block-name"
import { NumericFormat } from "react-number-format"

interface BlockFormProps {
  mode?: "create" | "edit"
  initialData?: Partial<StrapiBlock>
}

// Funciones helper para conversión entre mts² y varas²
const m2ToVarasSquared = (m2: number | null | undefined): number | null => {
  if (m2 === null || m2 === undefined || isNaN(m2)) return null
  return m2 * M2_TO_VARAS_SQUARED
}

const varasSquaredToM2 = (varas: number | null | undefined): number | null => {
  if (varas === null || varas === undefined || isNaN(varas)) return null
  return varas / M2_TO_VARAS_SQUARED
}

// Funciones helper para conversión entre USD y otras monedas
const usdToCurrency = (usd: number | null | undefined, buyRate: number | undefined): number | null => {
  if (usd === null || usd === undefined || isNaN(usd) || !buyRate || buyRate <= 0) return null
  return usd * buyRate
}

const currencyToUsd = (currency: number | null | undefined, buyRate: number | undefined): number | null => {
  if (currency === null || currency === undefined || isNaN(currency) || !buyRate || buyRate <= 0) return null
  return currency / buyRate
}

// Slug para code del bloque (minúsculas, sin acentos, guiones)
const slugify = (text: string): string => {
  if (!text || typeof text !== 'string') return ''
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Obtener configuración de formato según moneda
const getCurrencyFormatConfig = (currencyCode: string) => {
  const code = currencyCode.toLowerCase()
  const isLatinAmerican = code === 'gtq' || code === 'hnl' || code === 'crc' || code === 'nio'
  
  // Formato latinoamericano: miles con punto, decimales con coma (ej: 1.234,56)
  // Formato US: miles con coma, decimales con punto (ej: 1,234.56)
  return {
    thousandSeparator: ',',
    decimalSeparator: '.',
    prefix: `${getCurrencySymbol(currencyCode.toUpperCase())} `,
    decimalScale: 2,
    fixedDecimalScale: true,
    allowNegative: false,
  }
}

// Obtener símbolo de moneda
const getCurrencySymbol = (currencyCode: string): string => {
  if (currencyCode === 'USD') return '$'      // Dólar estadounidense
  if (currencyCode === 'GTQ') return 'Q'      // Quetzal guatemalteco
  if (currencyCode === 'MXN') return '$'      // Peso mexicano
  if (currencyCode === 'HNL') return 'L'      // Lempira hondureño
  if (currencyCode === 'CRC') return '₡'      // Colón costarricense
  if (currencyCode === 'NIO') return 'C$'     // Córdoba nicaragüense
  if (currencyCode === 'PAB') return 'B/.'    // Balboa panameño
  if (currencyCode === 'BZD') return 'BZ$'    // Dólar beliceño
  return currencyCode.toUpperCase()
}

export function BlockForm({ mode = "create", initialData }: BlockFormProps) {
  const router = useRouter()
  const t = useTranslations('common')
  const tForm = useTranslations('common.blockForm')
  const tView = useTranslations('common.blockView')
  const tMarket = useTranslations('projectForm.generalInfo')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  // Estados para popovers de autocomplete
  const [openProject, setOpenProject] = useState(false)
  const [openCategory, setOpenCategory] = useState(false)
  const [openFocus, setOpenFocus] = useState(false)
  const [openStatus, setOpenStatus] = useState(false)
  
  // Estados para búsqueda de proyectos
  const [projectSearchQuery, setProjectSearchQuery] = useState("")
  const [projects, setProjects] = useState<StrapiProject[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  
  // Catálogos
  const [blockCategories, setBlockCategories] = useState<CatalogItem[]>([])
  const [blockFocuses, setBlockFocuses] = useState<CatalogItem[]>([])
  const [blockStatuses, setBlockStatuses] = useState<CatalogItem[]>([])
  
  // Unidad de edición seleccionada (m2 o varas2)
  const [editingUnit, setEditingUnit] = useState<'m2' | 'varas2'>('m2')
  
  // Moneda de edición seleccionada (USD o código de moneda)
  const [editingCurrency, setEditingCurrency] = useState<string>('USD')
  
  // Proyecto completo con currencies
  const [projectWithCurrencies, setProjectWithCurrencies] = useState<StrapiProject | null>(null)
  
  // Valores temporales mientras se edita en varas² (para evitar loops)
  const [localVarasValues, setLocalVarasValues] = useState<{
    totalM2?: string
    availableM2?: string
    averageSizeM2?: string
  }>({})
  

  // Form data
  // En modo create (incluye clonado), code y name deben estar vacíos ya que se generan en el backend.
  // legacyId también se vacía: es la referencia a la base legacy y arrastrarla en un clon
  // genera duplicidad de referencia, así que el usuario debe capturarla de nuevo.
  const [formData, setFormData] = useState<Partial<StrapiBlock>>({
    code: mode === "create" ? "" : (initialData?.code || ""),
    name: mode === "create" ? "" : (initialData?.name || ""),
    legacyId: mode === "create" ? "" : (initialData?.legacyId || ""),
    phase: initialData?.phase || "",
    tower: initialData?.tower || "",
    sector: initialData?.sector || "",
    year: initialData?.year || new Date().getFullYear(),
    quarter: initialData?.quarter || "T1",
    collectionDate: toHtmlDateInputValue(initialData?.collectionDate) || "",
    project: initialData?.project ? { documentId: initialData.project.documentId || String(initialData.project.id) } : undefined,
    // Sin default en `create`, a propósito. Strapi tiene `default: "housing"`, así
    // que el riesgo nunca fue que quedara vacío: era que quedara MAL —una
    // oficina naciendo como vivienda y migrándose contra las tablas
    // equivocadas— sin que nadie lo notara. Arrancar vacío obliga a decidirlo.
    // Al clonar sí se arrastra: el clon es del mismo tipo que su origen.
    domain: initialData?.domain,
    parkingForSale: initialData?.parkingForSale ?? undefined,
    // `?? null` y no `?? undefined`: el interruptor de la tarjeta distingue
    // "no tiene financiamiento" (null) de "no se cargó" (undefined), y sin esta
    // línea el bloque llegaba con sus datos desde Strapi y el formulario los
    // mostraba apagados. Al guardar los habría borrado.
    financing: initialData?.financing ?? null,
    blockCategory: initialData?.blockCategory ? { documentId: initialData.blockCategory.documentId || String(initialData.blockCategory.id) } : undefined,
    blockFocus: initialData?.blockFocus ? { documentId: initialData.blockFocus.documentId || String(initialData.blockFocus.id) } : undefined,
    blockStatus: initialData?.blockStatus ? { documentId: initialData.blockStatus.documentId || String(initialData.blockStatus.id) } : undefined,
    market: initialData?.market,
    startDate: toHtmlDateInputValue(initialData?.startDate) || "",
    deliveryDate: toHtmlDateInputValue(initialData?.deliveryDate) || "",
    commercializationMonths: initialData?.commercializationMonths || undefined,
    totalUnits: initialData?.totalUnits || undefined,
    totalM2: initialData?.totalM2 || undefined,
    availableUnits: initialData?.availableUnits || undefined,
    availableM2: initialData?.availableM2 || undefined,
    averagePriceUSD: initialData?.averagePriceUSD || undefined,
    averageSizeM2: initialData?.averageSizeM2 || undefined,
    averagePricePerM2USD: initialData?.averagePricePerM2USD || undefined,
    averageInstallmentUSD: initialData?.averageInstallmentUSD || undefined,
    averageIncomeUSD: initialData?.averageIncomeUSD || undefined,
    additionalParkingPriceUSD: initialData?.additionalParkingPriceUSD || undefined,
    visitorParking: initialData?.visitorParking || undefined,
    assignedParking: initialData?.assignedParking || undefined,
    totalProjectParking: initialData?.totalProjectParking || undefined,
  })

  // Cargar catálogos iniciales
  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        setIsLoading(true)
        const [categoriesRes, focusesRes, statusesRes] = await Promise.all([
          strapiClient.getCatalogList('block-categories', { pageSize: 200 }),
          strapiClient.getCatalogList('block-focuses', { pageSize: 200 }),
          strapiClient.getCatalogList('block-statuses', { pageSize: 200 }),
        ])
        
        setBlockCategories(categoriesRes.data || [])
        setBlockFocuses(focusesRes.data || [])
        setBlockStatuses(statusesRes.data || [])
      } catch (error) {
        console.error('Error loading catalogs:', error)
        toast({
          title: t('error'),
          description: 'Error al cargar los catálogos',
          variant: "destructive",
          duration: 5000,
        })
      } finally {
        setIsLoading(false)
      }
    }
    loadCatalogs()
  }, [t])

  // Cargar proyecto seleccionado inicialmente si existe
  useEffect(() => {
    const loadInitialProject = async () => {
      if (initialData?.project?.documentId && projects.length === 0 && !openProject) {
        try {
          const projectId = initialData.project?.documentId || String(initialData.project?.id)
          const project = await strapiClient.getProjectById(projectId)
          if (project) {
            setProjects([project])
            setProjectWithCurrencies(project)
          }
        } catch (error) {
          console.error('Error loading initial project:', error)
        }
      }
    }
    // Solo cargar una vez al montar el componente
    if (initialData?.project?.documentId && projects.length === 0) {
      loadInitialProject()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo ejecutar al montar
  
  // Cargar proyecto completo con currencies cuando se selecciona un proyecto
  useEffect(() => {
    const loadProjectWithCurrencies = async () => {
      if (formData.project?.documentId) {
        try {
          const projectId = formData.project.documentId
          const project = await strapiClient.getProjectById(projectId)
          if (project) {
            setProjectWithCurrencies(project)
          }
        } catch (error) {
          console.error('Error loading project with currencies:', error)
          setProjectWithCurrencies(null)
        }
      } else {
        setProjectWithCurrencies(null)
      }
    }
    loadProjectWithCurrencies()
  }, [formData.project?.documentId])

  // Cargar proyectos cuando se abre el popover o se busca
  useEffect(() => {
    const loadProjects = async () => {
      if (!openProject && projects.length > 0 && !projectSearchQuery) return
      
      setIsLoadingProjects(true)
      try {
        const response = await strapiClient.getProjects({
          page: 1,
          pageSize: 100,
          search: projectSearchQuery || undefined,
          sort: 'name:asc',
        })
        setProjects(response.data || [])
      } catch (error) {
        console.error('Error loading projects:', error)
        setProjects([])
      } finally {
        setIsLoadingProjects(false)
      }
    }
    if (openProject || projectSearchQuery) {
      loadProjects()
    }
  }, [openProject, projectSearchQuery])

  // Filtrar proyectos localmente (opcional, ya que el API hace la búsqueda)
  const filteredProjects = useMemo(() => {
    if (!projectSearchQuery) return projects
    const query = projectSearchQuery.toLowerCase()
    return projects.filter(proj => 
      proj.name?.toLowerCase().includes(query) ||
      proj.code?.toLowerCase().includes(query)
    )
  }, [projects, projectSearchQuery])

  // Calcular meses de comercialización automáticamente
  useEffect(() => {
    if (formData.startDate && formData.deliveryDate) {
      const start = new Date(formData.startDate)
      const delivery = new Date(formData.deliveryDate)
      
      if (delivery > start) {
        // Calcular diferencia en meses completos
        const startYear = start.getFullYear()
        const startMonth = start.getMonth()
        const deliveryYear = delivery.getFullYear()
        const deliveryMonth = delivery.getMonth()
        
        // Calcular diferencia en meses: (año_final - año_inicial) * 12 + (mes_final - mes_inicial)
        const diffMonths = (deliveryYear - startYear) * 12 + (deliveryMonth - startMonth)
        
        // Si el día de entrega es menor que el día de inicio, restar un mes
        // porque no se ha completado ese mes
        if (delivery.getDate() < start.getDate()) {
          setFormData(prev => ({ ...prev, commercializationMonths: Math.max(0, diffMonths - 1) }))
        } else {
          setFormData(prev => ({ ...prev, commercializationMonths: diffMonths }))
        }
      } else {
        setFormData(prev => ({ ...prev, commercializationMonths: undefined }))
      }
    } else {
      setFormData(prev => ({ ...prev, commercializationMonths: undefined }))
    }
  }, [formData.startDate, formData.deliveryDate])

  // Calcular total de estacionamiento automáticamente
  useEffect(() => {
    const visitor = formData.visitorParking || 0
    const assigned = formData.assignedParking || 0
    const total = visitor + assigned
    setFormData(prev => ({ ...prev, totalProjectParking: total > 0 ? total : undefined }))
  }, [formData.visitorParking, formData.assignedParking])

  // Obtener proyecto seleccionado para mostrar
  const selectedProject = useMemo(() => {
    if (!formData.project?.documentId) return null
    
    // Normalizar el ID seleccionado para comparación
    const normalizedSelectedId = String(formData.project.documentId)
    
    // Primero buscar en la lista de projects cargados
    const found = projects.find(proj => {
      const projId = proj.documentId || String(proj.id)
      return projId === normalizedSelectedId
    })
    
    if (found) return found
    
    // Si no está en la lista pero hay initialData, usar ese
    if (initialData?.project) {
      const initialProjId = initialData.project.documentId || String(initialData.project.id)
      if (initialProjId === normalizedSelectedId) {
        return {
          documentId: initialData.project.documentId || String(initialData.project.id),
          id: initialData.project.id,
          name: initialData.project.name || '',
          code: initialData.project.code || '',
        } as StrapiProject
      }
    }
    return null
  }, [projects, formData.project, initialData])
  
  const activeCurrencies = useMemo(() => {
    if (!projectWithCurrencies?.currencies) return []

    const currencies = projectWithCurrencies.currencies
    const currencyInfo = [
      { code: 'mxn', name: 'Peso Mexicano', symbol: '$' },
      { code: 'gtq', name: 'Quetzal', symbol: 'Q' },
      { code: 'hnl', name: 'Lempira', symbol: 'L' },
      { code: 'crc', name: 'Colón Costarricense', symbol: '₡' },
      { code: 'nio', name: 'Córdoba', symbol: 'C$' },
      { code: 'pab', name: 'Balboa', symbol: 'B/.' },
      { code: 'bzd', name: 'Dólar Beliceño', symbol: 'BZ$' },
    ]

    return currencyInfo
      .map(({ code, name, symbol }) => {
        const raw = currencies[code as keyof typeof currencies]
        const entry = raw && typeof raw === 'object' ? raw : null
        const rate = localCurrencyUnitsPerOneUsd(entry)
        if (rate == null) return null
        return { code, name, symbol, buyRate: rate }
      })
      .filter((c): c is NonNullable<typeof c> => c != null)
  }, [projectWithCurrencies])

  const getBuyRate = (currencyCode: string): number | undefined => {
    if (currencyCode === 'USD') return 1
    if (!projectWithCurrencies?.currencies) return undefined
    const key = currencyCode.toLowerCase() as keyof typeof projectWithCurrencies.currencies
    const currencyData = projectWithCurrencies.currencies[key]
    const entry =
      currencyData && typeof currencyData === 'object' ? currencyData : null
    return localCurrencyUnitsPerOneUsd(entry) ?? undefined
  }

  // Moneda por defecto GTQ (no se carga del proyecto)
  // Los campos de precio muestran ambos valores (GTQ y USD) para que el usuario pueda ingresarlos

  // Obtener items seleccionados de catálogos
  const selectedCategory = useMemo(() => {
    if (!formData.blockCategory?.documentId) return null
    return blockCategories.find(c => (c.documentId || String(c.id)) === formData.blockCategory?.documentId) ||
           (initialData?.blockCategory ? { name: initialData.blockCategory.name || '' } : null)
  }, [formData.blockCategory, blockCategories, initialData])

  const selectedFocus = useMemo(() => {
    if (!formData.blockFocus?.documentId) return null
    return blockFocuses.find(f => (f.documentId || String(f.id)) === formData.blockFocus?.documentId) ||
           (initialData?.blockFocus ? { name: initialData.blockFocus.name || '' } : null)
  }, [formData.blockFocus, blockFocuses, initialData])

  const selectedStatus = useMemo(() => {
    if (!formData.blockStatus?.documentId) return null
    return blockStatuses.find(s => (s.documentId || String(s.id)) === formData.blockStatus?.documentId) ||
           (initialData?.blockStatus ? { name: initialData.blockStatus.name || '' } : null)
  }, [formData.blockStatus, blockStatuses, initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (isSaving) return

    // Validar campos requeridos
    if (!formData.domain) {
      toast({
        title: t('error'),
        description: tForm('domainRequired'),
        variant: "destructive",
        duration: 5000,
      })
      return
    }

    if (!formData.year || !formData.quarter) {
      toast({
        title: t('error'),
        description: tForm('yearQuarterRequired'),
        variant: "destructive",
        duration: 5000,
      })
      return
    }

    setIsSaving(true)
    try {
      // Preparar datos para enviar
      // Omitir name y code ya que se generan automáticamente en el backend
      const { name, code, ...formDataWithoutNameAndCode } = formData

      // Nombre del bloque: projectName - Fase X - Sector Y - Torre Z (solo partes con valor).
      // La etiqueta no se duplica si el campo ya la trae ("Fase 3" → "Fase 3").
      const generatedName = buildBlockName(selectedProject?.name ?? '', formData)

      // Determinar el code a enviar:
      // - Edit sin cambio de nombre → conservar el code existente (puede tener correlativo de migración)
      // - Edit con cambio de nombre, o create → pedir a Strapi el UID disponible con correlativo correcto
      let resolvedCode: string
      if (mode === 'edit' && generatedName === (initialData?.name || '')) {
        resolvedCode = initialData?.code || slugify(generatedName)
      } else {
        const res = await fetch('/api/blocks/generate-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: generatedName }),
        })
        if (!res.ok) throw new Error('No se pudo generar el código del bloque')
        const json = await res.json()
        resolvedCode = json.code
      }

      // Transformar relaciones de objetos {documentId} a valores directos
      const dataToSend: any = {
        ...formDataWithoutNameAndCode,
        name: generatedName,
        code: resolvedCode,
        year: Number(formData.year),
        quarter: formData.quarter as 'T1' | 'T2' | 'T3' | 'T4' | 'S1' | 'S2',
        // Transformar relaciones a documentId directo
        project: formData.project?.documentId || undefined,
        blockCategory: formData.blockCategory?.documentId || undefined,
        blockFocus: formData.blockFocus?.documentId || undefined,
        blockStatus: formData.blockStatus?.documentId || undefined,
        market: formData.market,
        // `parqueos_para_venta` existe SÓLO en `office_universe`; vivienda e
        // industrial no tienen esa columna. Mandarlo en un bloque que no es de
        // oficina guardaría un dato que ninguna corrida puede escribir de
        // vuelta, así que se descarta acá además de deshabilitarse en la vista.
        parkingForSale: formData.domain === 'office' ? formData.parkingForSale : undefined,

        // Mismo criterio: `banking_info` existe SÓLO para vivienda. Mandar
        // financiamiento en un bloque de oficinas o industrial guardaría algo
        // que ninguna corrida puede escribir de vuelta al warehouse.
        //
        // `null` y `undefined` NO son lo mismo acá: null borra el componente en
        // Strapi —que es lo que hace el interruptor al apagarse— y undefined lo
        // deja como estaba. Por eso se conserva el null y sólo se descarta
        // cuando el tipo de inmueble no es vivienda.
        //
        // `financingParaGuardar` quita los `id` que Strapi devolvió al leer y
        // que rechaza al recibir. Sin eso, guardar un bloque de vivienda con
        // financiamiento devolvía 400 "Invalid key id" aunque no se hubiera
        // tocado nada.
        financing: formData.domain === 'housing' ? financingParaGuardar(formData.financing) : undefined,
      }

      if (mode === 'edit' && initialData?.documentId) {
        await strapiClient.updateBlock(initialData.documentId, dataToSend)
        toast({
          title: t('success'),
          description: tForm('blockUpdated'),
          duration: 5000,
        })
        router.refresh()
      } else {
        // Modo create (incluye clone)
        const newBlock = await strapiClient.createBlock(dataToSend)
        toast({
          title: t('success'),
          description: tForm('blockCreated'),
          duration: 5000,
        })
        // Redirigir a la página de edición del bloque creado
        const blockId = newBlock.documentId || newBlock.id
        router.push(`/blocks/edit/${blockId}`)
      }
    } catch (error) {
      console.error(`Error ${mode === "create" ? "creating" : "updating"} block:`, error)
      
      // Extraer mensaje de error específico de la respuesta
      let errorMessage = mode === "create" 
        ? tForm('errorCreating')
        : tForm('errorUpdating')
      
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
        title: t('error'),
        description: errorMessage,
        variant: "destructive",
        duration: 8000, // Más tiempo para leer el mensaje detallado
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">{t('loading')}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Toolbar - Excel style para selector de unidad y moneda (sticky) */}
      <div className="sticky top-0 z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2 px-2 py-1.5 bg-muted/30 backdrop-blur-sm border border-border rounded-md shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {tForm('editingUnit') || 'Unidad'}:
            </span>
            <Select value={editingUnit} onValueChange={(value) => setEditingUnit(value as 'm2' | 'varas2')}>
              <SelectTrigger className="h-8 w-32 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="m2">mts²</SelectItem>
                <SelectItem value="varas2">varas²</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {tForm('editingCurrency') || 'Moneda'}:
            </span>
            <Select 
              value={editingCurrency} 
              onValueChange={(value) => {
                setEditingCurrency(value)
              }}
              disabled={!projectWithCurrencies || activeCurrencies.length === 0}
            >
              <SelectTrigger className="h-8 w-32 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                {activeCurrencies.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.code.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(!projectWithCurrencies || activeCurrencies.length === 0) && (
              <span className="text-xs text-muted-foreground">
                {tForm('selectProjectForCurrencies') || 'Selecciona un proyecto'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Información Básica */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-muted-foreground" />
            {tForm('basicInfo')}
          </CardTitle>
          <CardDescription>{tForm('basicInfoDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">{t('code')}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Input
                      id="code"
                      value={formData.code || ""}
                      disabled
                      placeholder="Ej: BLK-2024-001"
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('codeAutoGenerated')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">{t('name')}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Input
                      id="name"
                      value={formData.name || ""}
                      disabled
                      placeholder="Ej: Torre A - Bloque 1"
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('nameAutoGenerated')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project">{t('project')}</Label>
              <Popover open={openProject} onOpenChange={setOpenProject}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openProject}
                    className="w-full justify-between"
                  >
                    {selectedProject
                      ? `${selectedProject.name}${selectedProject.code ? ` (${selectedProject.code})` : ''}`
                      : tForm('searchProject')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput 
                      placeholder={tForm('searchProjectPlaceholder')} 
                      value={projectSearchQuery}
                      onValueChange={setProjectSearchQuery}
                    />
                    {isLoadingProjects ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">{t('loading')}</span>
                      </div>
                    ) : (
                      <>
                        <CommandEmpty>{tForm('noProjectsFound')}</CommandEmpty>
                        <CommandGroup>
                          <CommandList>
                            {filteredProjects.map((project) => {
                              const projectId = project.documentId || String(project.id)
                              const isSelected = formData.project?.documentId === projectId
                              return (
                                <CommandItem
                                  key={projectId}
                                  value={`${project.name || ""} ${project.code || ""}`}
                                  keywords={[project.code || "", project.name || ""]}
                                  onSelect={() => {
                                    setFormData({ ...formData, project: { documentId: projectId } })
                                    setOpenProject(false)
                                    setProjectSearchQuery("")
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      isSelected ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col items-start">
                                    <span className="font-medium leading-tight">{project.name}</span>
                                    {project.code && (
                                      <span className="text-xs text-muted-foreground leading-tight">{project.code}</span>
                                    )}
                                  </div>
                                </CommandItem>
                              )
                            })}
                          </CommandList>
                        </CommandGroup>
                      </>
                    )}
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="legacyId">{tView('legacyId')}</Label>
              <Input
                id="legacyId"
                value={formData.legacyId || ""}
                onChange={(e) => setFormData({ ...formData, legacyId: e.target.value })}
                placeholder={tForm('legacyIdPlaceholder')}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phase">{t('phase')}</Label>
              <Input
                id="phase"
                value={formData.phase || ""}
                onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
                placeholder={tForm('phasePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tower">{t('tower')}</Label>
              <Input
                id="tower"
                value={formData.tower || ""}
                onChange={(e) => setFormData({ ...formData, tower: e.target.value })}
                placeholder={tForm('towerPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sector">{t('sector')}</Label>
              <Input
                id="sector"
                value={formData.sector || ""}
                onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                placeholder={tForm('sectorPlaceholder')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Periodo de Recolección */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            {tForm('collectionPeriod')}
          </CardTitle>
          <CardDescription>{tForm('collectionPeriodDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">{t('year')} *</Label>
              <Input
                id="year"
                type="number"
                required
                value={formData.year || ""}
                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                placeholder="2024"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quarter">{t('period')} *</Label>
              <Select
                value={formData.quarter || "T1"}
                onValueChange={(value) => setFormData({ ...formData, quarter: value as 'T1' | 'T2' | 'T3' | 'T4' | 'S1' | 'S2' })}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{tForm('quarterlyGroup')}</SelectLabel>
                    <SelectItem value="T1">{tForm('quarterT1')}</SelectItem>
                    <SelectItem value="T2">{tForm('quarterT2')}</SelectItem>
                    <SelectItem value="T3">{tForm('quarterT3')}</SelectItem>
                    <SelectItem value="T4">{tForm('quarterT4')}</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{tForm('semesterGroup')}</SelectLabel>
                    <SelectItem value="S1">{tForm('quarterS1')}</SelectItem>
                    <SelectItem value="S2">{tForm('quarterS2')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="collectionDate">{tView('collectionDate')}</Label>
              <Input
                id="collectionDate"
                type="date"
                value={formData.collectionDate || ""}
                onChange={(e) => setFormData({ ...formData, collectionDate: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clasificación */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-muted-foreground" />
            {tForm('classification')}
          </CardTitle>
          <CardDescription>{tForm('classificationDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* El tipo de inmueble va PRIMERO y ocupa el ancho completo: enmarca
              todo lo que sigue. Decide contra qué tablas del warehouse se
              sincroniza el bloque, así que elegirlo mal no es una etiqueta
              equivocada — es una migración contra columnas que no existen.

              Es un Select y no el combobox con buscador que usan Categoría,
              Enfoque y Estado: aquéllos son catálogos que crecen; esto son tres
              valores fijos y buscar entre tres es fricción sin beneficio. */}
          <div className="space-y-2">
            <Label htmlFor="domain">
              {tForm('domainLabel')} <span className="text-destructive">*</span>
            </Label>
            <Select
              // `undefined` y no `""`: Radix muestra el placeholder cuando el
              // valor es undefined, y con cadena vacía se queda mudo — que es
              // justo el estado que este campo necesita mostrar al crear.
              value={formData.domain ?? undefined}
              onValueChange={(v) => {
                const domain = v as BlockDomain
                setFormData((prev) => ({
                  ...prev,
                  domain,
                  // `parqueos para venta` sólo existe en oficinas. Al cambiar de
                  // tipo se limpia en vez de quedar escondido con valor: un dato
                  // invisible que igual se guarda es peor que uno ausente.
                  parkingForSale: domain === 'office' ? prev.parkingForSale : undefined,
                  // Y el financiamiento sólo existe en vivienda, por lo mismo.
                  // Se pone en null y no en undefined: si el bloque YA tenía
                  // financiamiento guardado, undefined lo dejaría intacto en
                  // Strapi mientras el formulario deja de mostrarlo — un dato
                  // invisible que sigue ahí es peor que uno ausente.
                  financing: domain === 'housing' ? prev.financing : null,
                }))
              }}
            >
              <SelectTrigger id="domain" className="bg-background border-border md:w-1/2">
                <SelectValue placeholder={tForm('domainPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="housing">{tForm('domainHousing')}</SelectItem>
                <SelectItem value="office">{tForm('domainOffice')}</SelectItem>
                <SelectItem value="industrial">{tForm('domainIndustrial')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{tForm('domainHelp')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="blockCategory">{tView('category')}</Label>
              <Popover open={openCategory} onOpenChange={setOpenCategory}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCategory}
                    className="w-full justify-between"
                  >
                    {selectedCategory ? selectedCategory.name : tForm('searchCategory')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder={tForm('searchCategoryPlaceholder')} />
                    <CommandEmpty>{tForm('noCategoriesFound')}</CommandEmpty>
                    <CommandGroup>
                      <CommandList>
                        {blockCategories.map((cat) => (
                          <CommandItem
                            key={cat.documentId || cat.id}
                            value={cat.name || ""}
                            onSelect={() => {
                              setFormData({ ...formData, blockCategory: { documentId: cat.documentId || String(cat.id) } })
                              setOpenCategory(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.blockCategory?.documentId === (cat.documentId || String(cat.id))
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {cat.name}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="blockFocus">{tView('focus')}</Label>
              <Popover open={openFocus} onOpenChange={setOpenFocus}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openFocus}
                    className="w-full justify-between"
                  >
                    {selectedFocus ? selectedFocus.name : tForm('searchFocus')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder={tForm('searchFocusPlaceholder')} />
                    <CommandEmpty>{tForm('noFocusesFound')}</CommandEmpty>
                    <CommandGroup>
                      <CommandList>
                        {blockFocuses.map((focus) => (
                          <CommandItem
                            key={focus.documentId || focus.id}
                            value={focus.name || ""}
                            onSelect={() => {
                              setFormData({ ...formData, blockFocus: { documentId: focus.documentId || String(focus.id) } })
                              setOpenFocus(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.blockFocus?.documentId === (focus.documentId || String(focus.id))
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {focus.name}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="blockStatus">{tView('status')}</Label>
              <Popover open={openStatus} onOpenChange={setOpenStatus}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openStatus}
                    className="w-full justify-between"
                  >
                    {selectedStatus ? selectedStatus.name : tForm('searchStatus')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder={tForm('searchStatusPlaceholder')} />
                    <CommandEmpty>{tForm('noStatusesFound')}</CommandEmpty>
                    <CommandGroup>
                      <CommandList>
                        {blockStatuses.map((status) => (
                          <CommandItem
                            key={status.documentId || status.id}
                            value={status.name || ""}
                            onSelect={() => {
                              setFormData({ ...formData, blockStatus: { documentId: status.documentId || String(status.id) } })
                              setOpenStatus(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.blockStatus?.documentId === (status.documentId || String(status.id))
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {status.name}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="market">{t('market')}</Label>
              <Select
                value={formData.market ?? ""}
                onValueChange={(value) => setFormData({ ...formData, market: (value || undefined) as 'Primary' | 'Secondary' | undefined })}
              >
                <SelectTrigger id="market" className="w-full">
                  <SelectValue placeholder={tMarket('select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Primary">{tMarket('marketTypes.primary')}</SelectItem>
                  <SelectItem value="Secondary">{tMarket('marketTypes.secondary')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fechas Importantes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            {tForm('importantDates')}
          </CardTitle>
          <CardDescription>{tForm('importantDatesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">{tView('startDate')}</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate || ""}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveryDate">{tView('deliveryDate')}</Label>
              <Input
                id="deliveryDate"
                type="date"
                value={formData.deliveryDate || ""}
                onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commercializationMonths">{tView('commercializationMonths')}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Input
                      id="commercializationMonths"
                      type="number"
                      value={formData.commercializationMonths || ""}
                      disabled
                      placeholder={tForm('commercializationMonthsPlaceholder')}
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('commercializationMonthsAutoCalculated')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unidades */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-muted-foreground" />
            {tForm('units')}
          </CardTitle>
          <CardDescription>{tForm('unitsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalUnits">{t('totalUnits')}</Label>
              <Input
                id="totalUnits"
                type="number"
                value={formData.totalUnits || ""}
                disabled
                placeholder="Ej: 50"
                className="bg-muted cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="availableUnits">{t('availableUnits')}</Label>
              <Input
                id="availableUnits"
                type="number"
                value={formData.availableUnits || ""}
                disabled
                placeholder="Ej: 30"
                className="bg-muted cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="totalM2">{tView('totalArea')}</Label>
              <div>
                {editingUnit === 'm2' && (
                  <>
                    <Input
                      id="totalM2"
                      type="number"
                      step="0.01"
                      value={formData.totalM2 ?? ""}
                      disabled
                      placeholder="mts²"
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">mts²</p>
                  </>
                )}
                {editingUnit === 'varas2' && (
                  <>
                    <Input
                      id="totalM2Varas"
                      type="number"
                      step="0.01"
                      value={localVarasValues.totalM2 !== undefined
                        ? localVarasValues.totalM2
                        : (formData.totalM2 !== undefined && formData.totalM2 !== null
                          ? (m2ToVarasSquared(formData.totalM2)?.toFixed(2) || "")
                          : "")}
                      disabled
                      placeholder="varas²"
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">varas²</p>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="availableM2">{tView('availableArea')}</Label>
              <div>
                {editingUnit === 'm2' && (
                  <>
                    <Input
                      id="availableM2"
                      type="number"
                      step="0.01"
                      value={formData.availableM2 ?? ""}
                      disabled
                      placeholder="mts²"
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">mts²</p>
                  </>
                )}
                {editingUnit === 'varas2' && (
                  <>
                    <Input
                      id="availableM2Varas"
                      type="number"
                      step="0.01"
                      value={localVarasValues.availableM2 !== undefined
                        ? localVarasValues.availableM2
                        : (formData.availableM2 !== undefined && formData.availableM2 !== null
                          ? (m2ToVarasSquared(formData.availableM2)?.toFixed(2) || "")
                          : "")}
                      disabled
                      placeholder="varas²"
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">varas²</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Precios y Financiamiento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-muted-foreground" />
            {tForm('pricesAndFinancing')}
          </CardTitle>
          <CardDescription>{tForm('pricesAndFinancingDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="averagePriceUSD">{tView('averagePrice')}</Label>
              <div>
                {editingCurrency === 'USD' && (
                  <>
                    <NumericFormat
                      id="averagePriceUSD"
                      customInput={Input}
                      value={formData.averagePriceUSD || ""}
                      disabled
                      {...getCurrencyFormatConfig('USD')}
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">USD</p>
                  </>
                )}
                {editingCurrency !== 'USD' && activeCurrencies.map((currency) => {
                  if (editingCurrency !== currency.code) return null
                  const buyRate = getBuyRate(currency.code)
                  const currencyValue = formData.averagePriceUSD !== undefined && buyRate
                    ? usdToCurrency(formData.averagePriceUSD, buyRate)
                    : null
                  return (
                    <div key={currency.code}>
                      <NumericFormat
                        customInput={Input}
                        value={currencyValue || ""}
                        disabled
                        {...getCurrencyFormatConfig(currency.code)}
                        className="bg-muted cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{currency.code.toUpperCase()}</p>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="averageSizeM2">{tView('averageSize')}</Label>
              <div>
                {editingUnit === 'm2' && (
                  <>
                    <Input
                      id="averageSizeM2"
                      type="number"
                      step="0.01"
                      value={formData.averageSizeM2 ?? ""}
                      disabled
                      placeholder="mts²"
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">mts²</p>
                  </>
                )}
                {editingUnit === 'varas2' && (
                  <>
                    <Input
                      id="averageSizeM2Varas"
                      type="number"
                      step="0.01"
                      value={localVarasValues.averageSizeM2 !== undefined
                        ? localVarasValues.averageSizeM2
                        : (formData.averageSizeM2 !== undefined && formData.averageSizeM2 !== null
                          ? (m2ToVarasSquared(formData.averageSizeM2)?.toFixed(2) || "")
                          : "")}
                      disabled
                      placeholder="varas²"
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">varas²</p>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="averagePricePerM2USD">{tView('averagePricePerM2')}</Label>
              <div>
                {editingCurrency === 'USD' && (
                  <>
                    <NumericFormat
                      id="averagePricePerM2USD"
                      customInput={Input}
                      value={formData.averagePricePerM2USD || ""}
                      disabled
                      {...getCurrencyFormatConfig('USD')}
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">USD</p>
                  </>
                )}
                {editingCurrency !== 'USD' && activeCurrencies.map((currency) => {
                  if (editingCurrency !== currency.code) return null
                  const buyRate = getBuyRate(currency.code)
                  const currencyValue = formData.averagePricePerM2USD !== undefined && buyRate
                    ? usdToCurrency(formData.averagePricePerM2USD, buyRate)
                    : null
                  return (
                    <div key={currency.code}>
                      <NumericFormat
                        customInput={Input}
                        value={currencyValue || ""}
                        disabled
                        {...getCurrencyFormatConfig(currency.code)}
                        className="bg-muted cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{currency.code.toUpperCase()}</p>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="averageInstallmentUSD">{tView('averageInstallment')}</Label>
              <div>
                {editingCurrency === 'USD' && (
                  <>
                    <NumericFormat
                      id="averageInstallmentUSD"
                      customInput={Input}
                      value={formData.averageInstallmentUSD || ""}
                      disabled
                      {...getCurrencyFormatConfig('USD')}
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">USD</p>
                  </>
                )}
                {editingCurrency !== 'USD' && activeCurrencies.map((currency) => {
                  if (editingCurrency !== currency.code) return null
                  const buyRate = getBuyRate(currency.code)
                  const currencyValue = formData.averageInstallmentUSD !== undefined && buyRate
                    ? usdToCurrency(formData.averageInstallmentUSD, buyRate)
                    : null
                  return (
                    <div key={currency.code}>
                      <NumericFormat
                        customInput={Input}
                        value={currencyValue || ""}
                        disabled
                        {...getCurrencyFormatConfig(currency.code)}
                        className="bg-muted cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{currency.code.toUpperCase()}</p>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="averageIncomeUSD">{tView('averageIncome')}</Label>
              <div>
                {editingCurrency === 'USD' && (
                  <>
                    <NumericFormat
                      id="averageIncomeUSD"
                      customInput={Input}
                      value={formData.averageIncomeUSD || ""}
                      disabled
                      {...getCurrencyFormatConfig('USD')}
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">USD</p>
                  </>
                )}
                {editingCurrency !== 'USD' && activeCurrencies.map((currency) => {
                  if (editingCurrency !== currency.code) return null
                  const buyRate = getBuyRate(currency.code)
                  const currencyValue = formData.averageIncomeUSD !== undefined && buyRate
                    ? usdToCurrency(formData.averageIncomeUSD, buyRate)
                    : null
                  return (
                    <div key={currency.code}>
                      <NumericFormat
                        customInput={Input}
                        value={currencyValue || ""}
                        disabled
                        {...getCurrencyFormatConfig(currency.code)}
                        className="bg-muted cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{currency.code.toUpperCase()}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estacionamiento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-muted-foreground" />
            {tForm('parking')}
          </CardTitle>
          <CardDescription>{tForm('parkingDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="visitorParking">{tView('visitorParking')}</Label>
              <Input
                id="visitorParking"
                type="number"
                min={0}
                step={1}
                value={formData.visitorParking === undefined || formData.visitorParking === null ? "" : formData.visitorParking}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === "") {
                    setFormData((prev) => ({ ...prev, visitorParking: undefined }))
                    return
                  }
                  const n = Number(v)
                  if (!Number.isNaN(n)) {
                    setFormData((prev) => ({ ...prev, visitorParking: n }))
                  }
                }}
                placeholder="Ej: 10"
                className="bg-background border-border"
              />
            </div>
            {/* `parqueos_para_venta` existe SÓLO en `office_universe`; vivienda e
                industrial no tienen esa columna. Se muestra siempre —así se ve
                que existe y por qué está apagado— pero sólo se habilita con
                Oficinas elegido. */}
            <div className="space-y-2">
              <Label htmlFor="parkingForSale">{tView('parkingForSale')}</Label>
              <Input
                id="parkingForSale"
                type="number"
                min={0}
                step={1}
                disabled={formData.domain !== 'office'}
                value={formData.parkingForSale === undefined || formData.parkingForSale === null ? "" : formData.parkingForSale}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === "") {
                    setFormData((prev) => ({ ...prev, parkingForSale: undefined }))
                    return
                  }
                  const n = Number(v)
                  if (!Number.isNaN(n)) {
                    setFormData((prev) => ({ ...prev, parkingForSale: n }))
                  }
                }}
                placeholder="Ej: 4"
                className={formData.domain === 'office' ? "bg-background border-border" : "bg-muted cursor-not-allowed"}
              />
              <p className="text-xs text-muted-foreground">
                {formData.domain === 'office' ? tForm('parkingForSaleHelp') : tForm('parkingForSaleOnlyOffice')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignedParking">{tView('assignedParking')}</Label>
              <Input
                id="assignedParking"
                type="number"
                value={formData.assignedParking || ""}
                disabled
                placeholder="Ej: 50"
                className="bg-muted cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="totalProjectParking">{tView('totalProjectParking')}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Input
                      id="totalProjectParking"
                      type="number"
                      value={formData.totalProjectParking || ""}
                      disabled
                      placeholder="Se calcula automáticamente"
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('totalParkingAutoCalculated')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="space-y-2">
              <Label htmlFor="additionalParkingPriceUSD">{tView('additionalParkingPrice')}</Label>
              <div>
                {editingCurrency === 'USD' && (
                  <>
                    <NumericFormat
                      id="additionalParkingPriceUSD"
                      customInput={Input}
                      value={formData.additionalParkingPriceUSD || ""}
                      onValueChange={(values) => {
                        const { floatValue } = values
                        setFormData({ ...formData, additionalParkingPriceUSD: floatValue || undefined })
                      }}
                      {...getCurrencyFormatConfig('USD')}
                      className="bg-background border-border"
                    />
                    <p className="text-xs text-muted-foreground mt-1">USD</p>
                  </>
                )}
                {editingCurrency !== 'USD' && activeCurrencies.map((currency) => {
                  if (editingCurrency !== currency.code) return null
                  const buyRate = getBuyRate(currency.code)
                  const currencyValue = formData.additionalParkingPriceUSD !== undefined && buyRate
                    ? usdToCurrency(formData.additionalParkingPriceUSD, buyRate)
                    : null
                  return (
                    <div key={currency.code}>
                      <NumericFormat
                        customInput={Input}
                        value={currencyValue || ""}
                        onValueChange={(values) => {
                          const { floatValue } = values
                          if (floatValue !== undefined && buyRate) {
                            const usdValue = currencyToUsd(floatValue, buyRate)
                            if (usdValue !== null) {
                              setFormData({ ...formData, additionalParkingPriceUSD: usdValue })
                            }
                          } else if (floatValue === undefined) {
                            setFormData({ ...formData, additionalParkingPriceUSD: undefined })
                          }
                        }}
                        {...getCurrencyFormatConfig(currency.code)}
                        className="bg-background border-border"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{currency.code.toUpperCase()}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* El financiamiento existe SÓLO para vivienda: `banking_info` no tiene
          equivalente en oficinas ni industrial. No se puede declarar requerido
          en Strapi —el bloque es una sola colección para los tres tipos y
          obligaría también a los otros dos—, así que la regla se aplica acá,
          igual que `parkingForSale` con oficinas. */}
      {formData.domain === 'housing' && (
        <BlockFinancingCard
          value={formData.financing}
          onChange={(financing) => setFormData({ ...formData, financing })}
          disabled={isSaving}
        />
      )}

      {/* Botones de acción */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-3 sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-3 sm:p-4 border-t border-border z-10 -mx-3 sm:-mx-0 px-3 sm:px-0">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/blocks')}
          className="w-full sm:w-auto"
        >
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {t('save')}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

