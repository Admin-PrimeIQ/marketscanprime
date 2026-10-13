"use client"

import React, { useState, useMemo, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Pencil, Copy, MoreHorizontal, ArrowUpDown, ArrowUp, ArrowDown, GripVertical } from "lucide-react"
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
import { type StrapiProject } from "@/lib/api/strapi"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

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

type SortField = 'code' | 'name' | 'categoryId.name' | 'location.city' | 'totals.totalUnits' | 'totals.totalArea' | 'availability' | 'createdAt'
type SortDirection = 'asc' | 'desc'

interface Column {
  id: string
  label: string
  field: SortField | null
  width: number
  minWidth: number
}

const defaultColumns: Column[] = [
  { id: 'code', label: 'Código', field: 'code', width: 120, minWidth: 80 },
  { id: 'name', label: 'Proyecto', field: 'name', width: 250, minWidth: 150 },
  { id: 'category', label: 'Categoría', field: 'categoryId.name', width: 150, minWidth: 100 },
  { id: 'location', label: 'Ubicación', field: 'location.city', width: 200, minWidth: 120 },
  { id: 'units', label: 'Unidades', field: 'totals.totalUnits', width: 100, minWidth: 80 },
  { id: 'area', label: 'Área Total', field: 'totals.totalArea', width: 120, minWidth: 100 },
  { id: 'status', label: 'Estado', field: 'availability', width: 140, minWidth: 100 },
  { id: 'actions', label: '', field: null, width: 60, minWidth: 60 },
]

// Mapear availability de Strapi a estados en español
const getAvailabilityLabel = (availability: string): string => {
  const labels: Record<string, string> = {
    planning: 'Planificación',
    construction: 'En Construcción',
    completed: 'Completado',
    available: 'Disponible',
  }
  return labels[availability] || availability
}

// Mapear availability a variantes de Badge
const getAvailabilityVariant = (availability: string): "default" | "secondary" | "outline" => {
  if (availability === 'completed') return 'default'
  if (availability === 'construction') return 'secondary'
  return 'outline'
}

// Componente de columna sortable y draggable
function SortableColumnHeader({ 
  column, 
  sortField, 
  sortDirection, 
  onSort,
  onResize,
}: { 
  column: Column
  sortField: SortField | null
  sortDirection: SortDirection
  onSort: (field: SortField) => void
  onResize: (columnId: string, width: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const [isResizing, setIsResizing] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startWidth, setStartWidth] = useState(column.width)

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true)
    setStartX(e.clientX)
    setStartWidth(column.width)
    e.preventDefault()
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    const diff = e.clientX - startX
    const newWidth = Math.max(column.minWidth, startWidth + diff)
    onResize(column.id, newWidth)
  }, [isResizing, startX, startWidth, column.minWidth, column.id, onResize])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  const isSorted = column.field === sortField
  const SortIcon = isSorted 
    ? (sortDirection === 'asc' ? ArrowUp : ArrowDown)
    : ArrowUpDown

  return (
    <th
      ref={setNodeRef}
      style={{ ...style, width: column.width, minWidth: column.minWidth }}
      className="px-4 py-4 text-sm font-medium text-muted-foreground relative select-none"
    >
      <div className="flex items-center gap-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4 text-muted-foreground/50" />
        </div>
        {column.field ? (
          <button
            onClick={() => column.field && onSort(column.field)}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <span>{column.label}</span>
            <SortIcon className={`w-3 h-3 ${isSorted ? 'text-foreground' : 'text-muted-foreground/50'}`} />
          </button>
        ) : (
          <span>{column.label}</span>
        )}
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
        style={{ userSelect: 'none' }}
      />
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
  pageSize = 25,
  onPageChange,
}: ProjectsTableProps) {
  const router = useRouter()
  const [columns, setColumns] = useState<Column[]>(defaultColumns)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

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
    // Para campos anidados, Strapi usa la sintaxis: field.nestedField
    // Pero algunos campos necesitan mapeo especial
    let sortFieldString = field
    if (field === 'categoryId.name') {
      sortFieldString = 'categoryId.name' as SortField
    } else if (field === 'location.city') {
      sortFieldString = 'location.city' as SortField
    } else if (field === 'totals.totalUnits') {
      sortFieldString = 'totals.totalUnits' as SortField
    } else if (field === 'totals.totalArea') {
      sortFieldString = 'totals.totalArea' as SortField
    }
    
    const sortString = `${sortFieldString}:${newDirection}`
    onSortChange?.(sortString)
  }

  const handleResize = (columnId: string, width: number) => {
    setColumns((cols) =>
      cols.map((col) => (col.id === columnId ? { ...col, width } : col))
    )
  }

  const filteredProjects = useMemo(() => {
    return projects.filter(
      (project) =>
        project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.developer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (typeof project.location === 'object' && project.location?.city?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (typeof project.location === 'string' && project.location.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [projects, searchQuery])

  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    )
  }

  const getColumnWidth = (columnId: string) => {
    return columns.find((col) => col.id === columnId)?.width || 150
  }

  return (
    <Card className="border-border bg-card">
      {/* Controles de paginación */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Resultados por página:</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange?.(Number(value))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalItems)} de {totalItems}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
            <thead className="border-b border-border">
              <tr>
                <SortableContext items={columns.map((col) => col.id)} strategy={horizontalListSortingStrategy}>
                  {columns.map((column) => (
                    <SortableColumnHeader
                      key={column.id}
                      column={column}
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      onResize={handleResize}
                    />
                  ))}
                </SortableContext>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? 'No se encontraron proyectos que coincidan con la búsqueda' : 'No hay proyectos disponibles'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project) => (
                  <tr 
                    key={project.id} 
                    className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/projects/view/${project.documentId || project.id}`)}
                  >
                    <td className="px-4 py-4" style={{ width: getColumnWidth('code') }}>
                      {project.code ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                          {project.code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-4" style={{ width: getColumnWidth('name') }}>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{project.name || 'Sin nombre'}</p>
                        <p className="text-xs text-muted-foreground">{project.developer || 'Sin desarrollador'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4" style={{ width: getColumnWidth('category') }}>
                      <Badge variant="outline">
                        {project.categoryId?.name || 'Sin categoría'}
                      </Badge>
                    </td>
                    <td className="px-4 py-4" style={{ width: getColumnWidth('location') }}>
                      <div>
                        {typeof project.location === 'object' && project.location ? (
                          <>
                            <p className="text-sm text-foreground">
                              {project.location.city || 'Sin ciudad'}
                              {project.location.zone ? `, Zona ${project.location.zone}` : ''}
                            </p>
                            <p className="text-xs text-muted-foreground">{project.location.address || ''}</p>
                          </>
                        ) : (
                          <p className="text-sm text-foreground">{project.location || 'Sin ubicación'}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4" style={{ width: getColumnWidth('units') }}>
                      <span className="text-sm text-foreground">
                        {typeof project.totals === 'object' && project.totals
                          ? project.totals.totalUnits
                          : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4" style={{ width: getColumnWidth('area') }}>
                      <span className="text-sm font-medium text-foreground">
                        {typeof project.totals === 'object' && project.totals
                          ? `${project.totals.totalArea?.toLocaleString() || '-'} mts²`
                          : typeof project.totals === 'string'
                            ? project.totals
                            : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4" style={{ width: getColumnWidth('status') }}>
                      <Badge variant={getAvailabilityVariant(project.availability)}>
                        {getAvailabilityLabel(project.availability)}
                      </Badge>
                    </td>
                    <td 
                      className="px-4 py-4" 
                      style={{ width: getColumnWidth('actions') }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <Link href={`/projects/${project.documentId || project.id}`}>
                            <DropdownMenuItem>
                              <Eye className="w-4 h-4 mr-2" />
                              Ver detalles
                            </DropdownMenuItem>
                          </Link>
                          <Link href={`/projects/${project.documentId || project.id}/edit`}>
                            <DropdownMenuItem>
                              <Pencil className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          </Link>
                          <DropdownMenuSeparator />
                          <Link href={`/projects/clone/${project.documentId || project.id}`}>
                            <DropdownMenuItem>
                              <Copy className="w-4 h-4 mr-2" />
                              Duplicar proyecto
                            </DropdownMenuItem>
                          </Link>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DndContext>
      </div>
    </Card>
  )
}

