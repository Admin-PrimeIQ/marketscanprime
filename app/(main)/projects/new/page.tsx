import { ProjectForm } from "@/components/projects/project-form"
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
import { useTranslations } from "next-intl"

export default function NewProjectPage() {
  const t = useTranslations('common')
  const tForm = useTranslations('projectForm')
  
  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbLink href="/projects" className="text-xs sm:text-sm">{t('projects')}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs sm:text-sm">{t('newProject')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-2 sm:gap-4">
        <Link href="/projects" data-allow-navigation="true">
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Nuevo Proyecto</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Registra un nuevo proyecto inmobiliario</p>
        </div>
      </div>

      <ProjectForm />
    </div>
  )
}
