"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { type StrapiProject, type CatalogItem, strapiClient } from "@/lib/api/strapi"
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
import { Check, ChevronsUpDown, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface GeneralInfoTabProps {
  initialData?: Partial<StrapiProject>
  disabled?: boolean
  onStateChange?: (state: { showroom?: boolean; modelHouse?: boolean; developer?: string; securityType?: string }) => void
  onFormValueChange?: (name: string, value: string) => void
}

// Función para convertir texto a slug (solo minúsculas, números y guiones)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD') // Normalizar caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Eliminar diacríticos
    .replace(/[^a-z0-9]+/g, '-') // Reemplazar caracteres no alfanuméricos con guiones
    .replace(/^-+|-+$/g, '') // Eliminar guiones al inicio y final
}

// Función para validar código (solo minúsculas, números y guiones)
function isValidCode(code: string): boolean {
  return /^[a-z0-9-]+$/.test(code)
}

export function GeneralInfoTab({ initialData, disabled = false, onStateChange, onFormValueChange }: GeneralInfoTabProps) {
  const t = useTranslations('projectForm.generalInfo')
  
  // Estados para el código
  const [projectName, setProjectName] = useState(initialData?.name || '')
  const [projectCode, setProjectCode] = useState(initialData?.code || '')
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(!!initialData?.code)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [showroom, setShowroom] = useState(initialData?.showroom || false)
  const [modelHouse, setModelHouse] = useState(initialData?.modelHouse || false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

  // Estados para developers
  const [developers, setDevelopers] = useState<CatalogItem[]>([])
  const [developerSearchQuery, setDeveloperSearchQuery] = useState("")
  const [openDeveloper, setOpenDeveloper] = useState(false)
  const [isLoadingDevelopers, setIsLoadingDevelopers] = useState(false)
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string | undefined>(
    typeof initialData?.developer === 'object' && initialData.developer !== null
      ? (initialData.developer.documentId || String(initialData.developer.id))
      : initialData?.developer
  )

  // Estados para security types
  const [securityTypes, setSecurityTypes] = useState<CatalogItem[]>([])
  const [securityTypeSearchQuery, setSecurityTypeSearchQuery] = useState("")
  const [openSecurityType, setOpenSecurityType] = useState(false)
  const [isLoadingSecurityTypes, setIsLoadingSecurityTypes] = useState(false)
  const [selectedSecurityTypeId, setSelectedSecurityTypeId] = useState<string | undefined>(
    typeof initialData?.securityType === 'object' && initialData.securityType !== null
      ? (initialData.securityType.documentId || String(initialData.securityType.id))
      : initialData?.securityType
  )

  // Cargar developers al inicio si hay un selectedDeveloperId
  useEffect(() => {
    const loadInitialDeveloper = async () => {
      if (selectedDeveloperId && developers.length === 0 && !openDeveloper) {
        try {
          // Intentar cargar el developer específico primero
          const item = await strapiClient.getCatalogItem('developers', selectedDeveloperId)
          if (item) {
            setDevelopers([item])
          }
        } catch (error) {
          console.error('Error loading initial developer:', error)
        }
      }
    }
    // Solo cargar una vez al montar el componente
    if (selectedDeveloperId && developers.length === 0) {
      loadInitialDeveloper()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo ejecutar al montar

  const selectedDeveloper = useMemo(() => {
    if (!selectedDeveloperId) return null
    
    // Normalizar el ID seleccionado para comparación
    const normalizedSelectedId = String(selectedDeveloperId)
    
    // Primero buscar en la lista de developers cargados
    const found = developers.find(dev => {
      const devId = dev.documentId || String(dev.id)
      return devId === normalizedSelectedId
    })
    
    if (found) return found
    
    // Si no está en la lista pero hay initialData, usar ese
    if (typeof initialData?.developer === 'object' && initialData.developer !== null) {
      const initialDevId = initialData.developer.documentId || String(initialData.developer.id)
      if (initialDevId === normalizedSelectedId) {
        return {
          documentId: initialData.developer.documentId || String(initialData.developer.id),
          id: initialData.developer.id,
          name: initialData.developer.name || '',
          code: initialData.developer.code,
        } as CatalogItem
      }
    }
    return null
  }, [developers, selectedDeveloperId, initialData?.developer])

  const selectedSecurityType = useMemo(() => {
    if (!selectedSecurityTypeId) return null
    
    // Normalizar el ID seleccionado para comparación
    const normalizedSelectedId = String(selectedSecurityTypeId)
    
    const found = securityTypes.find(st => {
      const stId = st.documentId || String(st.id)
      return stId === normalizedSelectedId
    })
    
    if (found) return found
    
    // Si no está en la lista pero hay initialData, usar ese
    if (typeof initialData?.securityType === 'object' && initialData.securityType !== null) {
      const initialStId = initialData.securityType.documentId || String(initialData.securityType.id)
      if (initialStId === normalizedSelectedId) {
        return {
          documentId: initialData.securityType.documentId || String(initialData.securityType.id),
          id: initialData.securityType.id,
          name: initialData.securityType.name || '',
          code: initialData.securityType.code,
        } as CatalogItem
      }
    }
    return null
  }, [securityTypes, selectedSecurityTypeId, initialData?.securityType])

  // Cargar developers cuando se abre el popover o se busca
  useEffect(() => {
    const loadDevelopers = async () => {
      if (!openDeveloper && developers.length > 0 && !developerSearchQuery) return
      
      setIsLoadingDevelopers(true)
      try {
        const response = await strapiClient.getCatalogList('developers', {
          page: 1,
          pageSize: 1000,
          search: developerSearchQuery || undefined,
          sort: 'name:asc',
        })
        setDevelopers(response.data || [])
      } catch (error) {
        console.error('Error loading developers:', error)
      } finally {
        setIsLoadingDevelopers(false)
      }
    }
    if (openDeveloper || developerSearchQuery) {
      loadDevelopers()
    }
  }, [openDeveloper, developerSearchQuery])

  // Cargar security types al inicio si hay un selectedSecurityTypeId
  useEffect(() => {
    const loadInitialSecurityType = async () => {
      if (selectedSecurityTypeId && securityTypes.length === 0 && !openSecurityType) {
        try {
          const item = await strapiClient.getCatalogItem('security-types', selectedSecurityTypeId)
          if (item) {
            setSecurityTypes([item])
          }
        } catch (error) {
          console.error('Error loading initial security type:', error)
        }
      }
    }
    // Solo cargar una vez al montar el componente
    if (selectedSecurityTypeId && securityTypes.length === 0) {
      loadInitialSecurityType()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo ejecutar al montar

  // Cargar security types cuando se abre el popover o se busca
  useEffect(() => {
    const loadSecurityTypes = async () => {
      if (!openSecurityType && securityTypes.length > 0 && !securityTypeSearchQuery) return
      
      setIsLoadingSecurityTypes(true)
      try {
        const response = await strapiClient.getCatalogList('security-types', {
          page: 1,
          pageSize: 1000,
          search: securityTypeSearchQuery || undefined,
          sort: 'name:asc',
        })
        setSecurityTypes(response.data || [])
      } catch (error) {
        console.error('Error loading security types:', error)
      } finally {
        setIsLoadingSecurityTypes(false)
      }
    }
    if (openSecurityType || securityTypeSearchQuery) {
      loadSecurityTypes()
    }
  }, [openSecurityType, securityTypeSearchQuery])

  const filteredDevelopers = useMemo(() => {
    if (!developerSearchQuery) return developers
    const query = developerSearchQuery.toLowerCase()
    return developers.filter(dev => 
      dev.name.toLowerCase().includes(query) ||
      dev.code?.toLowerCase().includes(query)
    )
  }, [developers, developerSearchQuery])

  const filteredSecurityTypes = useMemo(() => {
    if (!securityTypeSearchQuery) return securityTypes
    const query = securityTypeSearchQuery.toLowerCase()
    return securityTypes.filter(st => 
      st.name.toLowerCase().includes(query) ||
      st.code?.toLowerCase().includes(query)
    )
  }, [securityTypes, securityTypeSearchQuery])

  const handleNameChange = (name: string) => {
    setProjectName(name)
    // Auto-generar código solo si no fue editado manualmente
    if (!codeManuallyEdited) {
      const generatedCode = slugify(name)
      setProjectCode(generatedCode)
      setCodeError(null)
    }
  }

  const handleCodeChange = (code: string) => {
    setCodeManuallyEdited(true)
    setProjectCode(code)
    
    // Validar código
    if (code && !isValidCode(code)) {
      setCodeError(t('codeInvalid'))
    } else {
      setCodeError(null)
    }
  }

  const handleRegenerateCode = () => {
    if (projectName) {
      const generatedCode = slugify(projectName)
      setProjectCode(generatedCode)
      setCodeManuallyEdited(false)
      setCodeError(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Hidden inputs para que el formulario pueda leer los valores */}
      <input type="hidden" name="developer" value={selectedDeveloperId || ""} />
      <input type="hidden" name="securityType" value={selectedSecurityTypeId || ""} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="nombre">{t('name')}*</Label>
          <Input
            ref={nameInputRef}
            id="nombre"
            name="nombre"
            placeholder={t('namePlaceholder')}
            className="bg-background border-border"
            required
            disabled={disabled}
            value={projectName}
            onChange={(e) => {
              const value = e.target.value
              handleNameChange(value)
              onFormValueChange?.('nombre', value)
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cod_proyecto">{t('code')}*</Label>
          <div className="space-y-1">
            <div className="relative">
          <Input
                ref={codeInputRef}
                id="cod_proyecto"
                name="cod_proyecto"
                placeholder={t('codePlaceholder')}
                className="bg-background border-border pr-10"
            required
                disabled={disabled}
                value={projectCode}
                onChange={(e) => {
                  const value = e.target.value
                  handleCodeChange(value)
                  onFormValueChange?.('cod_proyecto', value)
                }}
              />
              {projectName && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleRegenerateCode}
                      disabled={disabled}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span className="sr-only">{t('regenerateCode')}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('regenerateCodeTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {codeError && (
              <p className="text-sm text-destructive">{codeError}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>{t('developer')}</Label>
          <Popover open={openDeveloper} onOpenChange={setOpenDeveloper}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openDeveloper}
                disabled={disabled}
                className="w-full justify-between"
              >
                {selectedDeveloper ? selectedDeveloper.name : t('selectDeveloper')}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t('searchDeveloper')}
                  value={developerSearchQuery}
                  onValueChange={setDeveloperSearchQuery}
                />
                <CommandEmpty>
                  {isLoadingDevelopers ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    <span>{t('noResults')}</span>
                  )}
                </CommandEmpty>
                <CommandGroup>
                  <CommandList>
                    {filteredDevelopers.map((developer) => {
                      const developerId = developer.documentId || String(developer.id)
                      return (
                        <CommandItem
                          key={developerId}
                          value={developerId}
                          onSelect={() => {
                            setSelectedDeveloperId(developerId)
                            // Asegurarse de que el developer esté en la lista
                            setDevelopers(prev => {
                              const exists = prev.find(d => (d.documentId || String(d.id)) === developerId)
                              if (exists) return prev
                              return [...prev, developer]
                            })
                            setOpenDeveloper(false)
                            setDeveloperSearchQuery("")
                            onStateChange?.({ developer: developerId })
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDeveloperId === developerId ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col items-start">
                            <span className="font-medium leading-tight">{developer.name}</span>
                            {developer.code && (
                              <span className="text-xs text-muted-foreground leading-tight">{developer.code}</span>
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>{t('securityType')}</Label>
          <Popover open={openSecurityType} onOpenChange={setOpenSecurityType}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openSecurityType}
                disabled={disabled}
                className="w-full justify-between"
              >
                {selectedSecurityType ? selectedSecurityType.name : t('selectSecurityType')}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t('searchSecurityType')}
                  value={securityTypeSearchQuery}
                  onValueChange={setSecurityTypeSearchQuery}
                />
                <CommandEmpty>
                  {isLoadingSecurityTypes ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
        </div>
                  ) : (
                    <span>{t('noResults')}</span>
                  )}
                </CommandEmpty>
                <CommandGroup>
                  <CommandList>
                    {filteredSecurityTypes.map((securityType) => {
                      const securityTypeId = securityType.documentId || String(securityType.id)
                      return (
                        <CommandItem
                          key={securityTypeId}
                          value={securityTypeId}
                          onSelect={() => {
                            setSelectedSecurityTypeId(securityTypeId)
                            // Asegurarse de que el securityType esté en la lista
                            setSecurityTypes(prev => {
                              const exists = prev.find(st => (st.documentId || String(st.id)) === securityTypeId)
                              if (exists) return prev
                              return [...prev, securityType]
                            })
                            setOpenSecurityType(false)
                            setSecurityTypeSearchQuery("")
                            onStateChange?.({ securityType: securityTypeId })
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedSecurityTypeId === securityTypeId ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col items-start">
                            <span className="font-medium leading-tight">{securityType.name}</span>
                            {securityType.code && (
                              <span className="text-xs text-muted-foreground leading-tight">{securityType.code}</span>
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
          <Label htmlFor="accessQuantity">{t('accessQuantity')}</Label>
          <Input
            id="accessQuantity"
            name="accessQuantity"
            type="number"
            placeholder="1"
            className="bg-background border-border"
            disabled={disabled}
            defaultValue={initialData?.accessQuantity}
            onChange={(e) => onFormValueChange?.('accessQuantity', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="showroom" 
            name="showroom"
            disabled={disabled}
            checked={showroom}
            onCheckedChange={(checked) => {
              const newValue = checked === true
              setShowroom(newValue)
              onStateChange?.({ showroom: newValue })
            }}
          />
          <Label htmlFor="showroom" className="cursor-pointer">{t('showroom')}</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="modelHouse" 
            name="modelHouse"
            disabled={disabled}
            checked={modelHouse}
            onCheckedChange={(checked) => {
              const newValue = checked === true
              setModelHouse(newValue)
              onStateChange?.({ modelHouse: newValue })
            }}
          />
          <Label htmlFor="modelHouse" className="cursor-pointer">{t('modelHome')}</Label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="space-y-2">
          <Label htmlFor="imageUrl">{t('imageUrl')}</Label>
          <Input
            id="imageUrl"
            name="imageUrl"
            type="url"
            placeholder="https://example.com/image.jpg"
            className="bg-background border-border"
            disabled={disabled}
            defaultValue={initialData?.imageUrl}
            onChange={(e) => onFormValueChange?.('imageUrl', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
