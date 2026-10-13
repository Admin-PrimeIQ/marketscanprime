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

export default function EditBlockPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations('common')
  const documentId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined

  const [block, setBlock] = useState<StrapiBlock | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!documentId) {
          setError(t('noBlockId') || "No se recibió el identificador del bloque")
          setIsLoading(false)
          return
        }
        setIsLoading(true)
        setError(null)
        const blockData = await strapiClient.getBlockById(documentId)
        setBlock(blockData)
      } catch (err) {
        const message = err instanceof Error ? err.message : t('errorLoadingBlock') || "No se pudo cargar el bloque"
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [documentId, t])

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
          <Link href="/blocks">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Button onClick={() => router.refresh()}>{t('retry')}</Button>
        </div>
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('error')}</AlertTitle>
          <AlertDescription>{error || t('blockNotFound') || "No se pudo cargar el bloque"}</AlertDescription>
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
            <BreadcrumbPage>{t('edit')} {t('block')}</BreadcrumbPage>
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
          <h1 className="text-3xl font-bold text-foreground">{t('edit')} {t('block')}</h1>
          <p className="text-muted-foreground mt-1">{t('editBlockDescription')}</p>
        </div>
      </div>

      <BlockForm mode="edit" initialData={block} />
    </div>
  )
}

