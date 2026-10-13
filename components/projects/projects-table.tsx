"use client"

import React, { useState, useMemo, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Pencil, Copy, MoreHorizontal, ArrowUpDown, ArrowUp, ArrowDown, GripVertical, Blocks, Trash2, ChevronsLeft, ChevronsRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type StrapiProject } from "@/lib/api/strapi"
import { getProjectRegions, REGION_BADGE_CLASS } from "@/lib/region"
import { CountryPill } from "@/components/ui/country-pill"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { EmptyState, LoadingState } from "@/components/empty-state"
import { POPSY_ILLUSTRATIONS } from "@/lib/popsy-illustrations"

interface ProjectsTableProps {
  searchQuery: string
  projects: StrapiProject[]
  isLoading?: boolean
  onSortChange?: (sort: string) => void
  onPageSizeChange?: (pageSize: number) => void
  currentPage?: number
  totalPages?: number
  totalItems?: number
  pageSize?: number
  onPageChange?: (page: number) => void
}

type SortField = 'code' | 'name' | 'createdAt' | 'updatedAt' | 'department'
type SortDirection = 'asc' | 'desc'

interface Column {
  id: string
  label: string
  field: SortField | null
  width: number
  minWidth: number
}

// Las columnas se generan dinámicamente con traducciones
const getDefaultColumns = (t: (key: string) => string): Column[] => [
  { id: 'code', label: t('code'), field: 'code', width: 120, minWidth: 80 },
  { id: 'name', label: t('project'), field: 'name', width: 250, minWidth: 150 },
  { id: 'developer', label: t('developer'), field: null, width: 200, minWidth: 150 },
  { id: 'pais', label: 'País', field: null, width: 160, minWidth: 130 },
  { id: 'region', label: 'Región', field: null, width: 160, minWidth: 130 },
  { id: 'blocks', label: 'Bloques', field: null, width: 90, minWidth: 70 },
  { id: 'department', label: 'Departamento', field: 'department', width: 150, minWidth: 120 },
  { id: 'amenities', label: t('amenities'), field: null, width: 120, minWidth: 100 },
  { id: 'services', label: t('services'), field: null, width: 120, minWidth: 100 },
  { id: 'updatedAt', label: t('updatedAt'), field: 'updatedAt', width: 150, minWidth: 120 },
  { id: 'createdAt', label: t('createdAt'), field: 'createdAt', width: 150, minWidth: 120 },
  { id: 'actions', label: t('actions'), field: null, width: 100, minWidth: 80 },
]

// Función helper para formatear fechas en formato latino (dd/mm/yyyy)
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return '-'
  try {
    const date = new Date(dateString)
    // Verificar si tiene hora
    const hasTime = dateString.includes('T') || dateString.includes(' ')
    if (hasTime) {
      return format(date, 'dd/MM/yyyy hh:mm a', { locale: es })
    }
    return format(date, 'dd/MM/yyyy', { locale: es })
  } catch {
    return '-'
  }
}



// Componente de columna sortable
function SortableColumnHeader({ 
  column, 
  sortField, 
  sortDirection, 
  onSort,
}: { 
  column: Column
  sortField: SortField | null
  sortDirection: SortDirection
  onSort: (field: SortField) => void
}) {
  const isSorted = column.field === sortField
  const SortIcon = isSorted 
    ? (sortDirection === 'asc' ? ArrowUp : ArrowDown)
    : ArrowUpDown

  return (
    <th
      className="px-4 py-4 text-sm font-medium text-muted-foreground relative select-none"
      style={{ width: column.width, minWidth: column.minWidth }}
      {...(column.id === 'actions' ? { 'data-tour': 'projects-actions' } : {})}
    >
      <div className="flex items-center gap-2">
        {column.field ? (
          <button
            onClick={() => column.field && onSort(column.field)}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <span className="uppercase">{column.label}</span>
            <SortIcon className={`w-3 h-3 ${isSorted ? 'text-foreground' : 'text-muted-foreground/50'}`} />
          </button>
        ) : (
          <span className="uppercase">{column.label}</span>
        )}
      </div>
    </th>
  )
}

export function ProjectsTable({ 
  searchQuery, 
  projects, 
  isLoading,
  onSortChange,
  onPageSizeChange,
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 5,
  onPageChange,
}: ProjectsTableProps) {
  const router = useRouter()
  const t = useTranslations('common')
  const [goToPageValue, setGoToPageValue] = useState("")
  const [columns, setColumns] = useState<Column[]>(() => getDefaultColumns(t))
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Actualizar columnas cuando cambie el idioma
  useEffect(() => {
    setColumns(getDefaultColumns(t))
  }, [t])


  const handleSort = (field: SortField) => {
    let newDirection: SortDirection = 'asc'
    
    if (sortField === field) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc'
      setSortDirection(newDirection)
    } else {
      setSortField(field)
      setSortDirection('asc')
      newDirection = 'asc'
    }
    
    // Construir el string de sort para Strapi
    const sortString = `${field}:${newDirection}`
    onSortChange?.(sortString)
  }

  // Ya no necesitamos filtrar localmente porque la búsqueda se hace en el servidor
  const filteredProjects = projects

  if (isLoading) {
    return <LoadingState title={t('loading')} description={t('loadingProjects')} />
  }

  return (
    <>
      {filteredProjects.length === 0 ? (
        <EmptyState
          illustrationSrc={searchQuery ? POPSY_ILLUSTRATIONS.noResults : POPSY_ILLUSTRATIONS.project}
          title={searchQuery ? t('noProjectsFound') : t('noProjects')}
          description={
            searchQuery
              ? t('tryDifferentSearch')
              : t('noProjectsDescription')
          }
          action={
            !searchQuery
              ? {
                  label: t('newProject'),
                  onClick: () => router.push('/projects/new'),
                }
              : undefined
          }
          illustrationSize={280}
        />
      ) : (
        <>
          {/* Mobile cards view */}
          <div className="md:hidden space-y-3">
            {filteredProjects.map((project) => {
              const developerName = typeof project.developer === 'object' && project.developer
                ? project.developer.name || project.developer.code || t('noDeveloper')
                : project.developer || t('noDeveloper')
              
              return (
                <Card
                  key={project.id}
                  className="p-4 border border-border bg-card cursor-pointer"
                  onClick={() => router.push(`/projects/view/${project.documentId || project.id}`)}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {project.code && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                            {project.code}
                          </span>
                        )}
                        {getProjectRegions(project.blocks).map(r => (
                          <Badge key={r} className={`text-xs ${REGION_BADGE_CLASS[r]}`}>{r}</Badge>
                        ))}
                        <CountryPill country={project.country} className="text-xs" />
                      </div>
                      <h3 className="text-base font-semibold text-foreground mb-1">{project.name || t('noName')}</h3>
                      <p className="text-sm text-muted-foreground">{developerName}</p>
                    </div>

                    {/* Actions menu top-right */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <Link href={`/projects/view/${project.documentId || project.id}`}>
                          <DropdownMenuItem>
                            <Eye className="w-4 h-4 mr-2" />
                            {t('viewDetails')}
                          </DropdownMenuItem>
                        </Link>
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
                        <DropdownMenuSeparator />
                        <div className="inline-flex">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="w-full">
                                <DropdownMenuItem disabled className="opacity-50 cursor-not-allowed">
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t('delete')}
                                </DropdownMenuItem>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('deleteDisabledMessage')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm mb-4 pt-3 border-t border-border">
                    <div>
                      <span className="text-muted-foreground">{t('amenities')}: </span>
                      <span className="font-medium text-foreground">{project.amenities?.length ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('services')}: </span>
                      <span className="font-medium text-foreground">{project.services?.length ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Bloques: </span>
                      <span className="font-medium text-foreground">{project.blocks?.length ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('updatedAt')}: </span>
                      <span className="text-foreground text-xs">{formatDate(project.updatedAt)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('createdAt')}: </span>
                      <span className="text-foreground text-xs">{formatDate(project.createdAt)}</span>
                    </div>
                  </div>

                </Card>
              )
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
          <thead className="border-b border-border">
              <tr>
                  {columns.map((column) => (
                    <SortableColumnHeader
                      key={column.id}
                      column={column}
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  ))}
            </tr>
          </thead>
          <tbody>
                  {filteredProjects.map((project) => (
              <tr 
                key={project.id} 
                className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/projects/view/${project.documentId || project.id}`)}
              >
                    {columns.map((column) => {
                      // Renderizar cada celda según el orden de las columnas
                      switch (column.id) {
                        case 'code':
                          return (
                            <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                {project.code ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                                    {project.code}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">N/A</span>
                                )}
                </td>
                          )
                        case 'name':
                          return (
                            <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                  <div>
                                  <p className="text-sm font-semibold text-foreground">{project.name || t('noName')}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {typeof project.developer === 'object' && project.developer
                                      ? project.developer.name || project.developer.code || t('noDeveloper')
                                      : project.developer || t('noDeveloper')}
                                  </p>
                  </div>
                </td>
                          )
                          case 'developer':
                          return (
                            <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                <span className="text-sm text-foreground">
                                  {typeof project.developer === 'object' && project.developer
                                    ? project.developer.name || project.developer.code || t('noDeveloper')
                                    : project.developer || t('noDeveloper')}
                                </span>
                </td>
                          )
                          case 'region': {
                            const regions = getProjectRegions(project.blocks)
                            return (
                              <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                <div className="flex flex-wrap gap-1">
                                  {regions.map(r => (
                                    <Badge key={r} className={REGION_BADGE_CLASS[r]}>{r}</Badge>
                                  ))}
                                </div>
                              </td>
                            )
                          }
                          case 'pais': {
                            return (
                              <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                {project.country?.name
                                  ? <CountryPill country={project.country} />
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                            )
                          }
                          case 'blocks':
                            return (
                              <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                <span className="text-sm font-medium text-foreground">
                                  {project.blocks?.length ?? 0}
                                </span>
                              </td>
                            )
                          case 'department':
                            return (
                              <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                <span className="text-sm text-foreground">
                                  {project.department || <span className="text-muted-foreground">—</span>}
                                </span>
                              </td>
                            )
                          case 'amenities':
                          return (
                            <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                <span className="text-sm text-foreground font-medium">
                                  {project.amenities?.length ?? 0}
                              </span>
                </td>
                          )
                          case 'services':
                            return (
                              <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                <span className="text-sm text-foreground font-medium">
                                  {project.services?.length ?? 0}
                                </span>
                              </td>
                            )
                          case 'updatedAt':
                          return (
                            <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                <span className="text-sm text-foreground">
                                  {formatDate(project.updatedAt)}
                              </span>
                </td>
                          )
                          case 'createdAt':
                          return (
                            <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                                <span className="text-sm text-foreground">
                                  {formatDate(project.createdAt)}
                                </span>
                </td>
                          )
                        case 'actions':
                          return (
                            <td 
                              key={column.id} 
                              className="px-4 py-4" 
                              style={{ width: column.width }}
                              onClick={(e) => e.stopPropagation()}
                            >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <Link href={`/projects/view/${project.documentId || project.id}`}>
                        <DropdownMenuItem>
                          <Eye className="w-4 h-4 mr-2" />
                          {t('viewDetails')}
                        </DropdownMenuItem>
                      </Link>
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
                      <DropdownMenuSeparator />
                      <div className="inline-flex">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="w-full">
                              <DropdownMenuItem disabled className="opacity-50 cursor-not-allowed">
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t('delete')}
                              </DropdownMenuItem>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('deleteDisabledMessage')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
                          )
                        default:
                          return null
                      }
                    })}
              </tr>
                  ))}
          </tbody>
        </table>
      </div>
        </>
      )}

      {/* Controles de paginación */}
      {!isLoading && filteredProjects.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">{t('rowsPerPage')}:</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => onPageSizeChange?.(Number(value))}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t('showing')} {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)} {t('of')} {totalItems}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-2 flex-wrap">
            {/* Botones de navegación */}
            <div className="flex items-center gap-1 sm:gap-2 justify-center sm:justify-end flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(1)}
                disabled={currentPage === 1}
                className="flex-shrink-0"
                title={t('first')}
              >
                <ChevronsLeft className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">{t('first')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex-shrink-0"
              >
                {t('previous')}
              </Button>
              
              {/* Campo para saltar a página específica */}
              <div className="flex items-center gap-1 px-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">
                  {t('page')}
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
                        onPageChange?.(page)
                        setGoToPageValue("")
                      }
                    }
                  }}
                  onBlur={() => {
                    if (goToPageValue) {
                      const page = Number(goToPageValue)
                      if (page >= 1 && page <= totalPages) {
                        onPageChange?.(page)
                      }
                      setGoToPageValue("")
                    }
                  }}
                  placeholder={currentPage.toString()}
                  className="w-16 sm:w-20 h-8 text-center text-sm"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {t('of')} {totalPages}
                </span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="flex-shrink-0"
              >
                {t('next')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(totalPages)}
                disabled={currentPage >= totalPages}
                className="flex-shrink-0"
                title={t('last')}
              >
                <span className="hidden sm:inline mr-1">{t('last')}</span>
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

