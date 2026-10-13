"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ProjectForm } from "@/components/projects/project-form"
import { strapiClient, type StrapiProject } from "@/lib/api/strapi"
import { useParams, useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"

export default function CloneProjectPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations('common')
  const tForm = useTranslations('projectForm')
  const projectId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined

  const [project, setProject] = useState<StrapiProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!projectId) {
          setError("No se recibió el identificador del proyecto")
          setIsLoading(false)
          return
        }
        setIsLoading(true)
        setError(null)
        const proj = await strapiClient.getProjectById(projectId)
        setProject(proj)
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo cargar el proyecto"
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [projectId])

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/projects" data-allow-navigation="true">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Button onClick={() => router.refresh()}>{t('retry')}</Button>
        </div>
        <Alert variant="destructive">
          <TriangleAlert className="w-4 h-4" />
          <AlertTitle>{t('error') || 'Error'}</AlertTitle>
          <AlertDescription>{error || "No se pudo cargar el proyecto"}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/projects">{t('projects')}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/projects/view/${project.documentId || project.id}`}>
              {project.name || t('noName')}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{tForm('cloneProject') || 'Clonar Proyecto'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-4">
        <Link href="/projects" data-allow-navigation="true">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{tForm('cloneProject') || 'Clonar Proyecto'}</h1>
          <p className="text-muted-foreground mt-1">{tForm('cloneProjectDescription') || 'Crea una copia del proyecto basado en el proyecto seleccionado'}</p>
        </div>
      </div>

      <ProjectForm mode="create" initialData={project} />
    </div>
  )
}

