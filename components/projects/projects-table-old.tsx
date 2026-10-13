"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Pencil, Copy, MoreHorizontal } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type StrapiProject } from "@/lib/api/strapi"
import { Skeleton } from "@/components/ui/skeleton"

interface ProjectsTableProps {
  searchQuery: string
  projects: StrapiProject[]
  isLoading?: boolean
}

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

export function ProjectsTable({ searchQuery, projects, isLoading }: ProjectsTableProps) {
  const filteredProjects = projects.filter(
    (project) =>
      project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.developer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.location?.toLowerCase().includes(searchQuery.toLowerCase()),
  )

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

  return (
    <Card className="border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left">
              <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Código</th>
              <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Proyecto</th>
              <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Categoría</th>
              <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Ubicación</th>
              <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Unidades</th>
              <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Precio/mts²</th>
              <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Estado</th>
              <th className="px-6 py-4 text-sm font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {filteredProjects.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? 'No se encontraron proyectos que coincidan con la búsqueda' : 'No hay proyectos disponibles'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredProjects.map((project) => (
                <tr key={project.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4">
                    {project.code ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                        {project.code}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{project.name || 'Sin nombre'}</p>
                      <p className="text-xs text-muted-foreground">{project.developer || 'Sin desarrollador'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline">
                      {project.categoryId?.name || 'Sin categoría'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
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
                  <td className="px-6 py-4">
                    <span className="text-sm text-foreground">
                      {typeof project.totals === 'object' && project.totals
                        ? project.totals.totalUnits
                        : '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-foreground">
                      {typeof project.totals === 'object' && project.totals
                        ? `$${project.totals.totalArea?.toLocaleString() || '-'}`
                        : typeof project.totals === 'string'
                          ? `$${project.totals}`
                          : '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={getAvailabilityVariant(project.availability)}>
                      {getAvailabilityLabel(project.availability)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
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
                        <DropdownMenuItem>
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicar proyecto
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
