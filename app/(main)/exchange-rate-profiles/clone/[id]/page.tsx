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
import { ExchangeRateProfileForm } from "@/components/exchange-rate-profiles/exchange-rate-profile-form"
import { type StrapiExchangeRateProfile } from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { useParams, useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"

export default function CloneExchangeRateProfilePage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations("common")
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined

  const [profile, setProfile] = useState<StrapiExchangeRateProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!id) {
          setError(t("error"))
          setIsLoading(false)
          return
        }
        setIsLoading(true)
        setError(null)
        const data = await dataClient.getExchangeRateProfileById(id)
        setProfile(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : t("error")
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }
    void loadData()
  }, [id, t])

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
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/exchange-rate-profiles">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Button type="button" onClick={() => router.refresh()}>
            {t("retry")}
          </Button>
        </div>
        <Alert variant="destructive">
          <TriangleAlert className="w-4 h-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error || t("noExchangeRateProfiles")}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const hrefId = String(profile.documentId ?? profile.id ?? id)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/exchange-rate-profiles">{t("exchangeRateProfiles")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/exchange-rate-profiles/view/${hrefId}`}>
              {profile.name || t("noName")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("duplicate")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-4">
        <Link href="/exchange-rate-profiles">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {t("duplicate")} — {t("exchangeRateProfiles")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("cloneExchangeRateProfileDescription")}</p>
        </div>
      </div>

      <ExchangeRateProfileForm mode="create" initialData={profile} />
    </div>
  )
}
