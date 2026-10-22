"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Pencil, Trash2, Loader2, Search, X, RefreshCw, ChevronsLeft, ChevronsRight } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CatalogItem, CatalogRequest } from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { toast } from "@/hooks/use-toast"
import { useTranslations } from "next-intl"
import { EmptyState, LoadingState } from "@/components/empty-state"
import { POPSY_ILLUSTRATIONS } from "@/lib/popsy-illustrations"

interface CatalogTableProps {
  catalogName: string
  catalogDisplayName: string
  endpoint: string
  type?: string | null
  catalog?: string | null
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

export function CatalogTable({ catalogName, catalogDisplayName, endpoint, type, catalog }: CatalogTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('catalogs')
  const tCommon = useTranslations('common')
  
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [goToPageValue, setGoToPageValue] = useState("")
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<CatalogItem | null>(null)
  const [formData, setFormData] = useState<CatalogRequest>({
    name: "",
    code: "",
    description: "",
    isoCode: "",
    isoCode2: "",
  })
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [isoCodeError, setIsoCodeError] = useState<string | null>(null)
  const [isoCode2Error, setIsoCode2Error] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isCountryCatalog = catalogName === 'countries'
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Leer query params al cargar (solo una vez)
  useEffect(() => {
    const urlSearch = searchParams.get("search") || ""
    const urlPage = searchParams.get("page")
    const urlPageSize = searchParams.get("pageSize")

    if (urlSearch && urlSearch !== searchQuery) {
      setSearchQuery(urlSearch)
      setDebouncedSearchQuery(urlSearch)
    }
    if (urlPage) {
      const page = parseInt(urlPage, 10)
      if (!isNaN(page) && page > 0 && page !== currentPage) {
        setCurrentPage(page)
      }
    }
    if (urlPageSize) {
      const size = parseInt(urlPageSize, 10)
      if (!isNaN(size) && size > 0 && size !== pageSize) {
        setPageSize(size)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo al montar

  // Función para actualizar la URL con los query params (solo search, page, pageSize)
  const updateURL = (updates: { search?: string; page?: number; pageSize?: number }) => {
    const params = new URLSearchParams(searchParams.toString())
    
    // Construir el path desde type y catalog
    let path = "/catalogs"
    if (type) {
      path += `/${type}`
      if (catalog) {
        path += `/${catalog}`
      }
    }
    
    // Actualizar solo los query params de búsqueda y paginación
    if (updates.search !== undefined) {
      if (updates.search) {
        params.set("search", updates.search)
      } else {
        params.delete("search")
      }
    }
    
    if (updates.page !== undefined) {
      if (updates.page > 1) {
        params.set("page", updates.page.toString())
      } else {
        params.delete("page")
      }
    }
    
    if (updates.pageSize !== undefined) {
      if (updates.pageSize !== 10) {
        params.set("pageSize", updates.pageSize.toString())
      } else {
        params.delete("pageSize")
      }
    }

    const queryString = params.toString()
    const newURL = queryString ? `${path}?${queryString}` : path
    router.push(newURL, { scroll: false })
  }

  // Debounce para la búsqueda
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
      setCurrentPage(1) // Resetear a la primera página al buscar
      updateURL({ search: searchQuery, page: 1 }) // Actualizar URL
    }, 500) // Esperar 500ms después de que el usuario deje de escribir

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchQuery])

  const loadItems = async () => {
    try {
      setLoading(true)
      const response = await dataClient.getCatalogList(endpoint, {
        page: currentPage,
        pageSize: pageSize,
        search: debouncedSearchQuery || undefined,
        sort: 'name:asc',
      })
      setItems(response.data || [])
      setTotalPages(response.meta?.pagination?.pageCount || 1)
      setTotalItems(response.meta?.pagination?.total || 0)
    } catch (error) {
      console.error("Error al cargar items:", error)
      toast({
        title: tCommon('error'),
        description: t('errorLoading'),
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, currentPage, pageSize, debouncedSearchQuery])

  const handleOpenDialog = (item?: CatalogItem) => {
    if (item) {
      setEditingItem(item)
      setFormData({
        name: item.name || "",
        code: item.code || "",
        description: item.description || "",
        isoCode: (item as any).isoCode || "",
        isoCode2: (item as any).isoCode2 || "",
      })
      setCodeManuallyEdited(true) // Si está editando, el código ya existe, así que se considera editado manualmente
    } else {
      setEditingItem(null)
      setFormData({
        name: "",
        code: "",
        description: "",
        isoCode: "",
        isoCode2: "",
      })
      setCodeManuallyEdited(false) // Al crear nuevo, permitir auto-generación
    }
    setCodeError(null)
    setIsoCodeError(null)
    setIsoCode2Error(null)
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingItem(null)
    setCodeManuallyEdited(false)
    setCodeError(null)
    setIsoCodeError(null)
    setIsoCode2Error(null)
    setFormData({
      name: "",
      code: "",
      description: "",
      isoCode: "",
      isoCode2: "",
    })
  }

  const generateCodeFromName = (name: string) => {
    return slugify(name)
  }

  const handleNameChange = (name: string) => {
    // Auto-generar código solo si no fue editado manualmente
    if (!codeManuallyEdited) {
      const generatedCode = generateCodeFromName(name)
      setFormData(prev => ({ ...prev, name, code: generatedCode }))
      setCodeError(null)
    } else {
      setFormData(prev => ({ ...prev, name }))
    }
  }

  const handleCodeChange = (code: string) => {
    setCodeManuallyEdited(true)
    setFormData(prev => ({ ...prev, code }))
    
    // Validar código
    if (code && !isValidCode(code)) {
      setCodeError(t('codeInvalid'))
    } else {
      setCodeError(null)
    }
  }

  const handleRegenerateCode = () => {
    if (formData.name) {
      const generatedCode = generateCodeFromName(formData.name)
      setFormData(prev => ({ ...prev, code: generatedCode }))
      setCodeManuallyEdited(false)
      setCodeError(null)
    }
  }

  const handleSubmit = async () => {
    // Prevenir múltiples submits
    if (isSaving) {
      return
    }

    // Validar código antes de enviar
    if (formData.code && !isValidCode(formData.code)) {
      setCodeError(t('codeInvalid'))
      toast({
        title: tCommon('error'),
        description: t('codeInvalid'),
        variant: "destructive",
      })
      return
    }

    // Validar campos específicos de countries
    if (isCountryCatalog) {
      let hasErrors = false
      
      // Validar isoCode (alpha-2, requerido, 2 caracteres)
      if (!formData.isoCode || formData.isoCode.trim() === '') {
        setIsoCodeError(t('isoCodeRequired'))
        hasErrors = true
      } else if (formData.isoCode.length !== 2) {
        setIsoCodeError(t('isoCodeInvalidLength', { length: 2 }))
        hasErrors = true
      } else if (!/^[A-Z]{2}$/.test(formData.isoCode.toUpperCase())) {
        setIsoCodeError(t('isoCodeInvalidFormat'))
        hasErrors = true
      } else {
        setIsoCodeError(null)
      }

      // Validar isoCode2 (alpha-3, opcional, 3 caracteres si se proporciona)
      if (formData.isoCode2 && formData.isoCode2.trim() !== '') {
        if (formData.isoCode2.length !== 3) {
          setIsoCode2Error(t('isoCode2InvalidLength', { length: 3 }))
          hasErrors = true
        } else if (!/^[A-Z]{3}$/.test(formData.isoCode2.toUpperCase())) {
          setIsoCode2Error(t('isoCode2InvalidFormat'))
          hasErrors = true
        } else {
          setIsoCode2Error(null)
        }
      } else {
        setIsoCode2Error(null)
      }

      if (hasErrors) {
        toast({
          title: tCommon('error'),
          description: t('validationErrors'),
          variant: "destructive",
          duration: 5000,
        })
        return
      }
    }

    setIsSaving(true)
    try {
      // Preparar datos para enviar (solo incluir campos ISO si es countries)
      const dataToSend: CatalogRequest = {
        name: formData.name,
        code: formData.code || undefined,
        description: formData.description || undefined,
      }
      
      if (isCountryCatalog) {
        // Normalizar a mayúsculas antes de enviar
        dataToSend.isoCode = formData.isoCode?.toUpperCase()
        if (formData.isoCode2) {
          dataToSend.isoCode2 = formData.isoCode2.toUpperCase()
        }
      }
      
      if (editingItem) {
        // Actualizar
        const id = editingItem.documentId || editingItem.id
        if (!id) {
          throw new Error("ID no válido")
        }
        await dataClient.updateCatalogItem(endpoint, id, dataToSend)
        toast({
          title: tCommon('success'),
          description: t('itemUpdated'),
          variant: "success",
          duration: 5000,
        })
      } else {
        // Crear
        await dataClient.createCatalogItem(endpoint, dataToSend)
        toast({
          title: tCommon('success'),
          description: t('itemCreated'),
          variant: "success",
          duration: 5000,
        })
      }
      handleCloseDialog()
      await loadItems()
    } catch (error) {
      console.error("Error al guardar:", error)
      setIsSaving(false)
      
      // Extraer mensajes de error detallados
      let errorMessage = t('errorSaving')
      let errorDetails: string[] = []
      
      if (error instanceof Error) {
        errorMessage = error.message || errorMessage
        
        // Verificar si tiene detalles de validación
        if ('details' in error && Array.isArray((error as any).details)) {
          errorDetails = (error as any).details
        }
      }
      
      // Formatear mensaje de error con detalles de validación
      let errorDescription: React.ReactNode = errorMessage
      
      if (errorDetails.length > 0) {
        // Crear mensaje más legible con cada error en una línea
        const formattedErrors = errorDetails.map((detail, index) => {
          // Si el detalle ya tiene formato "path: message", mantenerlo
          if (typeof detail === 'string' && detail.includes(':')) {
            return `${index + 1}. ${detail}`
          }
          return `${index + 1}. ${detail}`
        })
        errorDescription = (
          <div className="whitespace-pre-line space-y-1">
            <div className="font-medium">{errorMessage}</div>
            <div className="text-sm mt-2">
              {formattedErrors.map((error, idx) => (
                <div key={idx} className="mt-1">
                  {error}
                </div>
              ))}
            </div>
          </div>
        )
      }
      
      console.error("Error message to show:", errorMessage) // Debug
      console.error("Error details:", errorDetails) // Debug
      console.log("Calling toast with:", { title: tCommon('error'), description: errorDescription, variant: "destructive" }) // Debug
      
      toast({
        title: tCommon('error'),
        description: errorDescription,
        variant: "destructive",
        duration: 5000, // 5 segundos antes de cerrarse automáticamente
      })
    } finally {
      // Asegurar que isSaving se resetee siempre, incluso si hay un error
      setIsSaving(false)
    }
  }

  const handleDeleteClick = (item: CatalogItem) => {
    setDeletingItem(item)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return

    try {
      const id = deletingItem.documentId || deletingItem.id
      if (!id) {
        throw new Error("ID no válido")
      }
      await dataClient.deleteCatalogItem(endpoint, id)
      toast({
        title: tCommon('success'),
        description: t('itemDeleted'),
        variant: "success",
        duration: 5000,
      })
      setIsDeleteDialogOpen(false)
      setDeletingItem(null)
      await loadItems()
    } catch (error) {
      console.error("Error al eliminar:", error)
      
      let errorMessage = t('errorDeleting')
      let errorDetails: string[] = []
      
      if (error instanceof Error) {
        errorMessage = error.message || errorMessage
        
        // Verificar si tiene detalles de validación
        if ('details' in error && Array.isArray((error as any).details)) {
          errorDetails = (error as any).details
        }
      }
      
      // Formatear mensaje de error con detalles de validación
      let errorDescription: React.ReactNode = errorMessage
      
      if (errorDetails.length > 0) {
        const formattedErrors = errorDetails.map((detail, index) => {
          if (typeof detail === 'string' && detail.includes(':')) {
            return `${index + 1}. ${detail}`
          }
          return `${index + 1}. ${detail}`
        })
        errorDescription = (
          <div className="whitespace-pre-line space-y-1">
            <div className="font-medium">{errorMessage}</div>
            <div className="text-sm mt-2">
              {formattedErrors.map((error, idx) => (
                <div key={idx} className="mt-1">
                  {error}
                </div>
              ))}
            </div>
          </div>
        )
      }
      
      toast({
        title: tCommon('error'),
        description: errorDescription,
        variant: "destructive",
        duration: 5000, // 5 segundos antes de cerrarse automáticamente
      })
    }
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    setCurrentPage(1) // Resetear a la primera página al cambiar el tamaño
    updateURL({ pageSize: newPageSize, page: 1 })
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    updateURL({ page: newPage })
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    // La actualización de URL se hace en el debounce
  }

  const handleClearSearch = () => {
    setSearchQuery("")
    setDebouncedSearchQuery("")
    setCurrentPage(1)
    updateURL({ search: "", page: 1 })
  }

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{catalogDisplayName}</CardTitle>
            <Button size="sm" onClick={() => handleOpenDialog()} data-tour="catalogs-create">
              <Plus className="w-4 h-4 mr-2" />
              {t('newItem')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Barra de búsqueda */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className={`pl-10 ${searchQuery ? 'pr-10' : ''} bg-background border-border`}
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-muted"
                  onClick={handleClearSearch}
                  title={t('clearSearch')}
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
          {loading ? (
            <LoadingState title={tCommon('loading')} description={t('loadingItems')} />
          ) : items.length === 0 ? (
            <EmptyState
              illustrationSrc={searchQuery ? POPSY_ILLUSTRATIONS.noResults : POPSY_ILLUSTRATIONS.catalog}
              title={searchQuery ? t('noItemsFound') : t('noItems')}
              description={
                searchQuery
                  ? t('tryDifferentSearch')
                  : t('noItemsDescription')
              }
              action={
                !searchQuery
                  ? {
                      label: t('newItem'),
                      onClick: () => handleOpenDialog(),
                    }
                  : undefined
              }
            />
          ) : (
            <>
              {/* Mobile cards view */}
              <div className="md:hidden space-y-3">
                {items.map((item) => {
                  const formatDate = (dateString?: string) => {
                    if (!dateString) return "-"
                    try {
                      const date = new Date(dateString)
                      return new Intl.DateTimeFormat('es-ES', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(date)
                    } catch {
                      return dateString
                    }
                  }
                  
                  return (
                    <Card key={item.documentId || item.id} className="p-4 border border-border bg-card">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          {item.code && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs mb-2">
                              {item.code}
                            </span>
                          )}
                          <h3 className="text-base font-semibold text-foreground mb-1">{item.name}</h3>
                          {item.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm mb-4 pt-3 border-t border-border">
                        <div>
                          <span className="text-muted-foreground">{t('createdAt')}: </span>
                          <span className="text-foreground text-xs">{formatDate(item.createdAt)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('updatedAt')}: </span>
                          <span className="text-foreground text-xs">{formatDate(item.updatedAt)}</span>
                        </div>
                      </div>

                      {/* Actions menu at bottom */}
                      <div className="pt-3 border-t border-border flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleOpenDialog(item)}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          {tCommon('edit')}
                        </Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="flex-1 opacity-50 cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {tCommon('delete')}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('onlySuperAdmin')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </Card>
                  )
                })}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr className="text-left">
                      <th className="px-4 py-3 text-sm font-medium text-muted-foreground">{tCommon('code')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-muted-foreground">{tCommon('name')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-muted-foreground">{tCommon('description')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-muted-foreground">{t('createdAt')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-muted-foreground">{t('updatedAt')}</th>
                      <th className="px-4 py-3 text-sm font-medium text-muted-foreground text-right">{tCommon('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const formatDate = (dateString?: string) => {
                        if (!dateString) return "-"
                        try {
                          const date = new Date(dateString)
                          return new Intl.DateTimeFormat('es-ES', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(date)
                        } catch {
                          return dateString
                        }
                      }
                      
                      return (
                        <tr
                          key={item.documentId || item.id}
                          className="border-b border-border hover:bg-muted/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-foreground">
                            {item.code ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                                {item.code}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground font-medium">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            {item.description || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {formatDate(item.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {formatDate(item.updatedAt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDialog(item)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="inline-flex">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled
                                      className="opacity-50 cursor-not-allowed"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{t('onlySuperAdmin')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Controles de paginación */}
          {!loading && items.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">{t('resultsPerPage')}:</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => handlePageSizeChange(Number(value))}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {tCommon('showing')} {((currentPage - 1) * pageSize) + 1} {tCommon('to')} {Math.min(currentPage * pageSize, totalItems)} {tCommon('of')} {totalItems}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-2 flex-wrap">
                {/* Botones de navegación */}
                <div className="flex items-center gap-1 sm:gap-2 justify-center sm:justify-end flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="flex-shrink-0"
                    title={tCommon('first')}
                  >
                    <ChevronsLeft className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">{tCommon('first')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex-shrink-0"
                  >
                    {tCommon('previous')}
                  </Button>
                  
                  {/* Campo para saltar a página específica */}
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">
                      {tCommon('page')}
                    </span>
                    <Input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={goToPageValue}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === "" || (Number(value) >= 1 && Number(value) <= totalPages)) {
                          setGoToPageValue(value)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && goToPageValue) {
                          const page = Number(goToPageValue)
                          if (page >= 1 && page <= totalPages) {
                            handlePageChange(page)
                            setGoToPageValue("")
                          }
                        }
                      }}
                      onBlur={() => {
                        if (goToPageValue) {
                          const page = Number(goToPageValue)
                          if (page >= 1 && page <= totalPages) {
                            handlePageChange(page)
                          }
                          setGoToPageValue("")
                        }
                      }}
                      placeholder={currentPage.toString()}
                      className="w-16 sm:w-20 h-8 text-center text-sm"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {tCommon('of')} {totalPages}
                    </span>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="flex-shrink-0"
                  >
                    {tCommon('next')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage >= totalPages}
                    className="flex-shrink-0"
                    title={tCommon('last')}
                  >
                    <span className="hidden sm:inline mr-1">{tCommon('last')}</span>
                    <ChevronsRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para crear/editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t('editItem', { name: catalogDisplayName }) : t('newItemTitle', { name: catalogDisplayName })}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? t('editItem', { name: catalogDisplayName })
                : t('newItemTitle', { name: catalogDisplayName })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                {tCommon('name')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder={t('namePlaceholder')}
                className="bg-background border-border"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="code">{tCommon('code')}</Label>
                {formData.name && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRegenerateCode}
                    className="h-7 text-xs"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    {t('regenerateCode')}
                  </Button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="code"
                  placeholder={t('codePlaceholder')}
                  className={`bg-background border-border ${codeError ? 'border-destructive' : ''}`}
                  value={formData.code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                />
                {codeError && (
                  <p className="text-xs text-destructive mt-1">{codeError}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{tCommon('description')}</Label>
              <Textarea
                id="description"
                placeholder={t('descriptionPlaceholder')}
                className="bg-background border-border"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            
            {/* Campos específicos para countries */}
            {isCountryCatalog && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="isoCode">
                    {t('isoCode')} <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="isoCode"
                      placeholder={t('isoCodePlaceholder')}
                      className={`bg-background border-border uppercase ${isoCodeError ? 'border-destructive' : ''}`}
                      value={formData.isoCode || ""}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase().slice(0, 2)
                        setFormData({ ...formData, isoCode: value })
                        setIsoCodeError(null)
                      }}
                      maxLength={2}
                    />
                    {isoCodeError && (
                      <p className="text-xs text-destructive mt-1">{isoCodeError}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="isoCode2">
                    {t('isoCode2')}
                  </Label>
                  <div className="relative">
                    <Input
                      id="isoCode2"
                      placeholder={t('isoCode2Placeholder')}
                      className={`bg-background border-border uppercase ${isoCode2Error ? 'border-destructive' : ''}`}
                      value={formData.isoCode2 || ""}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase().slice(0, 3)
                        setFormData({ ...formData, isoCode2: value })
                        setIsoCode2Error(null)
                      }}
                      maxLength={3}
                    />
                    {isoCode2Error && (
                      <p className="text-xs text-destructive mt-1">{isoCode2Error}</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} disabled={isSaving}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name.trim() || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {tCommon('saving')}
                </>
              ) : (
                tCommon('save')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para confirmar eliminación - Deshabilitado */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDisabled')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDisabledMessage')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('close')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

