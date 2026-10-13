"use client"

import React, { useState, useMemo, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Pencil, Copy, MoreHorizontal, ArrowUpDown, ArrowUp, ArrowDown, Home, ChevronsLeft, ChevronsRight } from "lucide-react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type StrapiBlock } from "@/lib/api/strapi"
import { getBlockRegion, REGION_BADGE_CLASS } from "@/lib/region"
import { DOMAIN_BADGE_CLASS, domainLabelKey } from "@/lib/domain"
import { CountryPill } from "@/components/ui/country-pill"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { EmptyState, LoadingState } from "@/components/empty-state"
import { POPSY_ILLUSTRATIONS } from "@/lib/popsy-illustrations"

interface BlocksTableProps {
  searchQuery: string
  blocks: StrapiBlock[]
  isLoading?: boolean
  onSortChange?: (sort: string) => void
  onPageSizeChange?: (pageSize: number) => void
  currentPage?: number
  totalPages?: number
  totalItems?: number
  pageSize?: number
  onPageChange?: (page: number) => void
}

type SortField = 'code' | 'name' | 'project.name' | 'project.department' | 'blockCategory.name' | 'year' | 'quarter' | 'market' | 'totalUnits' | 'availableUnits' | 'createdAt'
type SortDirection = 'asc' | 'desc'

interface Column {
  id: string
  label: string
  field: SortField | null
  width: number
  minWidth: number
}

const getDefaultColumns = (t: (key: string) => string): Column[] => [
  { id: 'code', label: t('code'), field: 'code', width: 120, minWidth: 80 },
  { id: 'name', label: t('name'), field: 'name', width: 200, minWidth: 150 },
  // Sin ordenamiento, igual que 'Región': con sólo dos valores reales, ordenar
  // no ayuda a encontrar nada que los chips de filtro no resuelvan mejor.
  { id: 'domain', label: t('blockForm.domainLabel'), field: null, width: 130, minWidth: 110 },
  { id: 'project', label: t('project'), field: 'project.name', width: 200, minWidth: 150 },
  { id: 'pais', label: 'País', field: null, width: 150, minWidth: 120 },
  { id: 'region', label: 'Región', field: null, width: 110, minWidth: 90 },
  { id: 'department', label: 'Departamento', field: 'project.department', width: 150, minWidth: 120 },
  { id: 'phase', label: t('phase'), field: null, width: 100, minWidth: 80 },
  { id: 'tower', label: t('tower'), field: null, width: 100, minWidth: 80 },
  { id: 'sector', label: t('sector'), field: null, width: 120, minWidth: 100 },
  { id: 'year', label: t('year'), field: 'year', width: 80, minWidth: 60 },
  { id: 'quarter', label: t('quarter'), field: 'quarter', width: 100, minWidth: 80 },
  { id: 'category', label: 'Categoría', field: 'blockCategory.name', width: 150, minWidth: 120 },
  { id: 'market', label: t('market'), field: 'market', width: 120, minWidth: 100 },
  { id: 'totalUnits', label: t('totalUnits'), field: 'totalUnits', width: 120, minWidth: 100 },
  { id: 'availableUnits', label: t('availableUnits'), field: 'availableUnits', width: 140, minWidth: 120 },
  { id: 'createdAt', label: t('createdAt'), field: 'createdAt', width: 150, minWidth: 120 },
  { id: 'actions', label: t('actions'), field: null, width: 100, minWidth: 80 },
]

const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return '-'
  try {
    const date = new Date(dateString)
    const hasTime = dateString.includes('T') || dateString.includes(' ')
    if (hasTime) {
      return format(date, 'dd/MM/yyyy hh:mm a', { locale: es })
    }
    return format(date, 'dd/MM/yyyy', { locale: es })
  } catch {
    return '-'
  }
}

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
      {...(column.id === 'actions' ? { 'data-tour': 'blocks-actions' } : {})}
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

export function BlocksTable({ 
  searchQuery, 
  blocks, 
  isLoading,
  onSortChange,
  onPageSizeChange,
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
}: BlocksTableProps) {
  const router = useRouter()
  const t = useTranslations('common')
  // Las etiquetas del tipo viven con el formulario del bloque: mismo concepto,
  // una sola definición.
  const tBlockForm = useTranslations('common.blockForm')
  const [goToPageValue, setGoToPageValue] = useState("")
  const [columns] = useState<Column[]>(() => getDefaultColumns(t))
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Parsear el sort actual si existe
  useEffect(() => {
    // Este efecto se ejecutará cuando onSortChange cambie, pero por ahora lo dejamos simple
  }, [])

  const handleSort = (field: SortField) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortField(field)
    setSortDirection(newDirection)
    
    if (onSortChange) {
      onSortChange(`${field}:${newDirection}`)
    }
  }

  // Filtrar bloques según la búsqueda (ya viene filtrado del servidor, pero por si acaso)
  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return blocks
    
    const query = searchQuery.toLowerCase()
    return blocks.filter(block => 
      block.code?.toLowerCase().includes(query) ||
      block.name?.toLowerCase().includes(query) ||
      block.project?.name?.toLowerCase().includes(query) ||
      block.phase?.toLowerCase().includes(query) ||
      block.tower?.toLowerCase().includes(query) ||
      block.sector?.toLowerCase().includes(query)
    )
  }, [blocks, searchQuery])

  if (isLoading) {
    return <LoadingState title={t('loading')} description={t('loadingBlocks')} />
  }

  return (
    <div className="space-y-4">
      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filteredBlocks.length === 0 ? (
          <EmptyState
            illustrationSrc={searchQuery ? POPSY_ILLUSTRATIONS.noResults : POPSY_ILLUSTRATIONS.building}
            title={searchQuery ? t('noBlocksFound') : t('noBlocks')}
            description={
              searchQuery
                ? t('tryDifferentSearch')
                : t('noBlocksDescription')
            }
            action={
              !searchQuery
                ? {
                    label: t('newBlock'),
                    onClick: () => router.push('/blocks/new'),
                  }
                : undefined
            }
          />
        ) : (
          filteredBlocks.map((block) => (
            <Card
              key={block.id}
              className="p-4 border border-border bg-card cursor-pointer"
              onClick={() => router.push(`/blocks/view/${block.documentId || block.id}`)}
            >
              {/* Header section with code, badges and actions */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {block.code && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                        {block.code}
                      </span>
                    )}
                    {block.domain && (
                      <Badge className={`text-xs ${DOMAIN_BADGE_CLASS[block.domain] ?? ''}`}>
                        {tBlockForm(domainLabelKey(block.domain))}
                      </Badge>
                    )}
                    {block.project?.name && (
                      <Badge variant="secondary" className="text-xs">
                        {block.project.name}
                      </Badge>
                    )}
                    <CountryPill country={block.project?.country} className="text-xs" />
                    {(() => {
                      const region = getBlockRegion(block.quarter)
                      return (
                        <Badge className={`text-xs ${REGION_BADGE_CLASS[region]}`}>
                          {region}
                        </Badge>
                      )
                    })()}
                    {block.quarter && (
                      <Badge variant="outline" className="text-xs">
                        {block.quarter}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">{block.name || t('noName')}</h3>
                </div>

                {/* Actions menu top-right */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <Link href={`/blocks/view/${block.documentId || block.id}`}>
                      <DropdownMenuItem>
                        <Eye className="w-4 h-4 mr-2" />
                        {t('viewDetails')}
                      </DropdownMenuItem>
                    </Link>
                    <Link href={`/units/list/${block.documentId || block.id}`}>
                      <DropdownMenuItem>
                        <Home className="w-4 h-4 mr-2" />
                        {t('viewUnits')}
                      </DropdownMenuItem>
                    </Link>
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

              {/* Location section */}
              {(block.phase || block.tower || block.sector) && (
                <div className="mb-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">{t('location')}</p>
                  <div className="flex flex-wrap gap-2">
                    {block.phase && (
                      <span className="text-sm text-foreground">{t('phase')}: <span className="font-medium">{block.phase}</span></span>
                    )}
                    {block.tower && (
                      <span className="text-sm text-foreground">{t('tower')}: <span className="font-medium">{block.tower}</span></span>
                    )}
                    {block.sector && (
                      <span className="text-sm text-foreground">{t('sector')}: <span className="font-medium">{block.sector}</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Period section */}
              {(block.year || block.quarter || block.market) && (
                <div className="mb-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">{t('period')}</p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {block.year && (
                      <span className="text-foreground">{t('year')}: <span className="font-medium">{block.year}</span></span>
                    )}
                    {block.quarter && (
                      <span className="text-foreground">{t('quarter')}: <span className="font-medium">{block.quarter}</span></span>
                    )}
                    {block.market && (
                      <span className="text-foreground">{t('market')}: <span className="font-medium">{block.market}</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Units section */}
              <div className="mb-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">{t('units')}</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('totalUnits')}: </span>
                    <span className="font-semibold text-foreground">{block.totalUnits ?? '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('availableUnits')}: </span>
                    <span className="font-semibold text-foreground">{block.availableUnits ?? '-'}</span>
                  </div>
                </div>
              </div>

              {/* Dates section */}
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">{t('dates')}</p>
                <div className="text-xs text-foreground">
                  <div>{t('createdAt')}: {formatDate(block.createdAt)}</div>
                </div>
              </div>

            </Card>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              {columns.map((column) => (
                column.field ? (
                  <SortableColumnHeader
                    key={column.id}
                    column={column}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                ) : (
                  <th
                    key={column.id}
                    className="px-4 py-4 text-sm font-medium text-muted-foreground"
                    style={{ width: column.width, minWidth: column.minWidth }}
                    {...(column.id === 'actions' ? { 'data-tour': 'blocks-actions' } : {})}
                  >
                    <span className="uppercase">{column.label}</span>
                  </th>
                )
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredBlocks.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  <EmptyState
                    illustrationSrc={searchQuery ? POPSY_ILLUSTRATIONS.noResults : POPSY_ILLUSTRATIONS.building}
                    title={searchQuery ? t('noBlocksFound') : t('noBlocks')}
                    description={
                      searchQuery
                        ? t('tryDifferentSearch')
                        : t('noBlocksDescription')
                    }
                    action={
                      !searchQuery
                        ? {
                            label: t('newBlock'),
                            onClick: () => router.push('/blocks/new'),
                          }
                        : undefined
                    }
                    illustrationSize={200}
                    className="py-8"
                  />
                </td>
              </tr>
            ) : (
              filteredBlocks.map((block) => (
                <tr 
                  key={block.id}
                  className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/blocks/view/${block.documentId || block.id}`)}
                >
                  {columns.map((column) => {
                    switch (column.id) {
                      case 'code':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            {block.code ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                                {block.code}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        )
                      case 'name':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{block.name || t('noName')}</p>
                            </div>
                          </td>
                        )
                      case 'domain':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            {block.domain ? (
                              <Badge className={`text-xs ${DOMAIN_BADGE_CLASS[block.domain] ?? ''}`}>
                                {tBlockForm(domainLabelKey(block.domain))}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        )
                      case 'project':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.project?.name || '-'}
                            </span>
                          </td>
                        )
                      case 'pais': {
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            {block.project?.country?.name
                              ? <CountryPill country={block.project.country} />
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        )
                      }
                      case 'region': {
                        const region = getBlockRegion(block.quarter)
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <Badge className={REGION_BADGE_CLASS[region]}>
                              {region}
                            </Badge>
                          </td>
                        )
                      }
                      case 'department':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.project?.department || <span className="text-muted-foreground">—</span>}
                            </span>
                          </td>
                        )
                      case 'phase':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.phase || '-'}
                            </span>
                          </td>
                        )
                      case 'tower':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.tower || '-'}
                            </span>
                          </td>
                        )
                      case 'sector':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.sector || '-'}
                            </span>
                          </td>
                        )
                      case 'year':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.year || '-'}
                            </span>
                          </td>
                        )
                      case 'quarter':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            {block.quarter ? (
                              <Badge variant="outline">{block.quarter}</Badge>
                            ) : (
                              <span className="text-sm text-foreground">-</span>
                            )}
                          </td>
                        )
                      case 'category':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.blockCategory?.name || <span className="text-muted-foreground">—</span>}
                            </span>
                          </td>
                        )
                      case 'market':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.market ?? '-'}
                            </span>
                          </td>
                        )
                      case 'totalUnits':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.totalUnits ?? '-'}
                            </span>
                          </td>
                        )
                      case 'availableUnits':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {block.availableUnits ?? '-'}
                            </span>
                          </td>
                        )
                      case 'createdAt':
                        return (
                          <td key={column.id} className="px-4 py-4" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {formatDate(block.createdAt)}
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
                                <Link href={`/blocks/view/${block.documentId || block.id}`}>
                                  <DropdownMenuItem>
                                    <Eye className="w-4 h-4 mr-2" />
                                    {t('viewDetails')}
                                  </DropdownMenuItem>
                                </Link>
                                <Link href={`/units/list/${block.documentId || block.id}`}>
                                  <DropdownMenuItem>
                                    <Home className="w-4 h-4 mr-2" />
                                    {t('viewUnits')}
                                  </DropdownMenuItem>
                                </Link>
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
                          </td>
                        )
                      default:
                        return null
                    }
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de paginación */}
      {!isLoading && filteredBlocks.length > 0 && (
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
                disabled={currentPage === totalPages}
                className="flex-shrink-0"
              >
                {t('next')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(totalPages)}
                disabled={currentPage === totalPages}
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
    </div>
  )
}

