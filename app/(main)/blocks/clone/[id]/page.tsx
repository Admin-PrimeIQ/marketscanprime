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
import { BlockForm } from "@/components/blocks/block-form"
import { strapiClient, type StrapiBlock } from "@/lib/api/strapi"
import { useParams, useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"

export default function CloneBlockPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations('common')
  const blockId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined

  const [block, setBlock] = useState<StrapiBlock | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!blockId) {
          setError("No se recibió el identificador del bloque a clonar")
          setIsLoading(false)
          return
        }
        setIsLoading(true)
        setError(null)
        const blockData = await strapiClient.getBlockById(blockId)
        setBlock(blockData)
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo cargar el bloque para clonar"
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [blockId])

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

  if (error || !block) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/blocks" data-allow-navigation="true">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Button onClick={() => router.refresh()}>{t('retry')}</Button>
        </div>
        <Alert variant="destructive">
          <TriangleAlert className="w-4 h-4" />
          <AlertTitle>{t('error') || 'Error'}</AlertTitle>
          <AlertDescription>{error || "No se pudo cargar el bloque para clonar"}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/blocks">{t('blocks')}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/blocks/view/${block.documentId || block.id}`}>
              {block.name || t('noName')}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t('duplicate')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-4">
        <Link href="/blocks" data-allow-navigation="true">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('duplicate')} {t('block')}</h1>
          <p className="text-muted-foreground mt-1">{t('cloneBlockDescription')}</p>
        </div>
      </div>

      <BlockForm mode="create" initialData={block} />
    </div>
  )
}

