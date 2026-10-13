"use client"

import React, { useState, useMemo, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Pencil, Copy, MoreHorizontal, ArrowUpDown, ArrowUp, ArrowDown, ChevronsLeft, ChevronsRight } from "lucide-react"
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
import { type StrapiUnit } from "@/lib/api/strapi"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Input } from "@/components/ui/input"

interface UnitsTableProps {
  searchQuery: string
  units: StrapiUnit[]
  isLoading?: boolean
  onSortChange?: (sort: string) => void
  onPageSizeChange?: (pageSize: number) => void
  currentPage?: number
  totalPages?: number
  totalItems?: number
  pageSize?: number
  onPageChange?: (page: number) => void
}

type SortField = 'code' | 'name' | 'unitNumber' | 'model' | 'availability' | 'totalPriceGTQ' | 'totalPriceUSD' | 'unitSizeM2' | 'bathrooms' | 'createdAt'
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
  { id: 'unitNumber', label: 'Número', field: 'unitNumber', width: 120, minWidth: 100 },
  { id: 'model', label: 'Modelo', field: 'model', width: 120, minWidth: 100 },
  { id: 'block', label: t('block'), field: null, width: 180, minWidth: 150 },
  { id: 'project', label: t('project'), field: null, width: 180, minWidth: 150 },
  { id: 'availability', label: 'Disponibilidad', field: 'availability', width: 140, minWidth: 120 },
  { id: 'unitSizeM2', label: 'Tamaño (mts²)', field: 'unitSizeM2', width: 120, minWidth: 100 },
  { id: 'bathrooms', label: 'Baños', field: 'bathrooms', width: 100, minWidth: 80 },
  { id: 'totalPriceGTQ', label: 'Precio (GTQ)', field: 'totalPriceGTQ', width: 140, minWidth: 120 },
  { id: 'totalPriceUSD', label: 'Precio (USD)', field: 'totalPriceUSD', width: 140, minWidth: 120 },
  { id: 'hasParking', label: 'Estacionamiento', field: null, width: 140, minWidth: 120 },
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

export function UnitsTable({ 
  searchQuery, 
  units, 
  isLoading,
  onSortChange,
  onPageSizeChange,
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
}: UnitsTableProps) {
  const router = useRouter()
  const t = useTranslations('common')
  const [goToPageValue, setGoToPageValue] = useState("")
  const [columns] = useState<Column[]>(() => getDefaultColumns(t))
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = (field: SortField) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortField(field)
    setSortDirection(newDirection)
    
    if (onSortChange) {
      onSortChange(`${field}:${newDirection}`)
    }
  }

  // Filtrar unidades según la búsqueda (ya viene filtrado del servidor, pero por si acaso)
  const filteredUnits = useMemo(() => {
    if (!searchQuery.trim()) return units
    
    const query = searchQuery.toLowerCase()
    return units.filter(unit => 
      unit.code?.toLowerCase().includes(query) ||
      unit.name?.toLowerCase().includes(query) ||
      unit.unitNumber?.toLowerCase().includes(query) ||
      unit.model?.toLowerCase().includes(query)
    )
  }, [units, searchQuery])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                {columns.map((column) => (
                  <th key={column.id} className="px-4 py-4" style={{ width: column.width, minWidth: column.minWidth }}>
                    <Skeleton className="h-4 w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="border-b border-border">
                  {columns.map((column) => (
                    <td key={column.id} className="px-4 py-4">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
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
                  >
                    <span className="uppercase">{column.label}</span>
                  </th>
                )
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUnits.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                  {searchQuery ? 'No se encontraron unidades' : 'No hay unidades disponibles'}
                </td>
              </tr>
            ) : (
              filteredUnits.map((unit) => (
                <tr 
                  key={unit.id}
                  className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/units/view/${unit.documentId || unit.id}`)}
                >
                  {columns.map((column) => {
                    switch (column.id) {
                      case 'code':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            {unit.code ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                                {unit.code}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        )
                      case 'name':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{unit.name || '-'}</p>
                            </div>
                          </td>
                        )
                      case 'unitNumber':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {unit.unitNumber || '-'}
                            </span>
                          </td>
                        )
                      case 'model':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {unit.model || '-'}
                            </span>
                          </td>
                        )
                      case 'block':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {unit.block?.name || '-'}
                            </span>
                          </td>
                        )
                      case 'project':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {unit.block?.project?.name || '-'}
                            </span>
                          </td>
                        )
                      case 'availability':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            {unit.availability ? (
                              <Badge variant={unit.availability === 'Available' ? 'default' : 'secondary'}>
                                {unit.availability === 'Available' ? 'Disponible' : 'No Disponible'}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        )
                      case 'unitSizeM2':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {unit.unitSizeM2 ? `${unit.unitSizeM2.toLocaleString()} mts²` : '-'}
                            </span>
                          </td>
                        )
                      case 'bathrooms':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {unit.bathrooms ?? '-'}
                            </span>
                          </td>
                        )
                      case 'totalPriceGTQ':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {unit.totalPriceGTQ ? `Q ${unit.totalPriceGTQ.toLocaleString()}` : '-'}
                            </span>
                          </td>
                        )
                      case 'totalPriceUSD':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {unit.totalPriceUSD ? `$ ${unit.totalPriceUSD.toLocaleString()}` : '-'}
                            </span>
                          </td>
                        )
                      case 'hasParking':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            {unit.hasParking !== undefined ? (
                              <Badge variant={unit.hasParking ? 'default' : 'outline'}>
                                {unit.hasParking ? 'Sí' : 'No'}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        )
                      case 'createdAt':
                        return (
                          <td key={column.id} className="px-4 py-4 text-sm" style={{ width: column.width }}>
                            <span className="text-sm text-foreground">
                              {formatDate(unit.createdAt)}
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
                                <Link href={`/units/view/${unit.documentId || unit.id}`}>
                                  <DropdownMenuItem>
                                    <Eye className="w-4 h-4 mr-2" />
                                    {t('viewDetails')}
                                  </DropdownMenuItem>
                                </Link>
                                <DropdownMenuSeparator />
                                <Link href={`/units/edit/${unit.documentId || unit.id}`}>
                                  <DropdownMenuItem>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    {t('edit')}
                                  </DropdownMenuItem>
                                </Link>
                                <Link href={`/units/clone/${unit.documentId || unit.id}`}>
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
      {!isLoading && filteredUnits.length > 0 && (
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
