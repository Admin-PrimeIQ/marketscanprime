"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Pencil, Copy } from "lucide-react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { type StrapiCurrenciesComponent, type StrapiExchangeRateProfile } from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { useParams, useRouter } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { es } from "date-fns/locale"

const CURRENCY_ROWS: {
  key: keyof StrapiCurrenciesComponent
  label: string
}[] = [
  { key: "mxn", label: "MXN" },
  { key: "gtq", label: "GTQ" },
  { key: "hnl", label: "HNL" },
  { key: "crc", label: "CRC" },
  { key: "nio", label: "NIO" },
  { key: "pab", label: "PAB" },
  { key: "bzd", label: "BZD" },
]

const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return "-"
  try {
    const date = new Date(dateString)
    const hasTime = dateString.includes("T") || dateString.includes(" ")
    if (hasTime) {
      return format(date, "dd/MM/yyyy hh:mm a", { locale: es })
    }
    return format(date, "dd/MM/yyyy", { locale: es })
  } catch {
    return "-"
  }
}

export default function ExchangeRateProfileViewPage() {
  const router = useRouter()
  const params = useParams()
  const t = useTranslations("common")
  const tCur = useTranslations("projectForm.currencies")
  const tForm = useTranslations("exchangeRateProfileForm")
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined

  const [profile, setProfile] = useState<StrapiExchangeRateProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setError(t("error"))
      setIsLoading(false)
      return
    }
    const load = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await dataClient.getExchangeRateProfileById(id)
        setProfile(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error"))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [id, t])

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Link href="/exchange-rate-profiles">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <Alert variant="destructive">
          <TriangleAlert className="w-4 h-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error || t("noExchangeRateProfiles")}</AlertDescription>
        </Alert>
        <Button type="button" onClick={() => router.refresh()}>
          {t("retry")}
        </Button>
      </div>
    )
  }

  const hrefId = String(profile.documentId ?? profile.id ?? id)

  const enabledCurrencies = CURRENCY_ROWS.filter(({ key }) => {
    const c = profile.currencies?.[key]
    return (
      c &&
      typeof c === "object" &&
      ("buyRate" in c || "sellRate" in c) &&
      (c.buyRate !== undefined || c.sellRate !== undefined)
    )
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/exchange-rate-profiles">{t("exchangeRateProfiles")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{profile.name || t("noName")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/exchange-rate-profiles">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {profile.code ? (
                <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                  {profile.code}
                </span>
              ) : null}
            </div>
            <h1 className="text-3xl font-bold text-foreground">{profile.name || t("noName")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("createdAt")}: {formatDate(profile.createdAt)} · {t("updatedAt")}:{" "}
              {formatDate(profile.updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/exchange-rate-profiles/edit/${hrefId}`}>
            <Button variant="outline" size="sm">
              <Pencil className="w-4 h-4 mr-2" />
              {t("edit")}
            </Button>
          </Link>
          <Link href={`/exchange-rate-profiles/clone/${hrefId}`}>
            <Button variant="outline" size="sm">
              <Copy className="w-4 h-4 mr-2" />
              {t("duplicate")}
            </Button>
          </Link>
        </div>
      </div>

      {profile.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("description")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap">{profile.description}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("projectsLinked")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!profile.projects?.length ? (
            <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.projects.map((p) => {
                const pid = p.documentId ?? p.id
                if (!pid) return null
                return (
                  <Link key={String(pid)} href={`/projects/view/${p.documentId || p.id}`}>
                    <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                      {p.name || p.code || String(pid)}
                    </Badge>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{tForm("currencies")}</CardTitle>
        </CardHeader>
        <CardContent>
          {enabledCurrencies.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("code")}</th>
                    <th className="py-2 pr-4 font-medium">{tCur("buyRate")}</th>
                    <th className="py-2 font-medium">{tCur("sellRate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {enabledCurrencies.map(({ key, label }) => {
                    const c = profile.currencies?.[key]
                    if (!c || typeof c !== "object") return null
                    return (
                      <tr key={key} className="border-b border-border/60">
                        <td className="py-3 pr-4 font-medium">{label}</td>
                        <td className="py-3 pr-4 tabular-nums">
                          {c.buyRate !== undefined ? c.buyRate : "—"}
                        </td>
                        <td className="py-3 tabular-nums">
                          {c.sellRate !== undefined ? c.sellRate : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
