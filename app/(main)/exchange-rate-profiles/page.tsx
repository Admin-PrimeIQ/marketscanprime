"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, X } from "lucide-react"
import Link from "next/link"
import { strapiClient, type StrapiExchangeRateProfile } from "@/lib/api/strapi"
import { useTranslations } from "next-intl"
import { ExchangeRateProfilesTable } from "@/components/exchange-rate-profiles/exchange-rate-profiles-table"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"

export default function ExchangeRateProfilesPage() {
  const t = useTranslations("common")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [profiles, setProfiles] = useState<StrapiExchangeRateProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sort, setSort] = useState<string>("createdAt:desc")
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
      setCurrentPage(1)
    }, 500)
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchQuery])

  const loadProfiles = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await strapiClient.getExchangeRateProfiles({
        page: currentPage,
        pageSize,
        sort,
        search: debouncedSearchQuery,
      })
      if (response?.data && Array.isArray(response.data)) {
        setProfiles(response.data)
        setTotalPages(response.meta?.pagination?.pageCount || 1)
        setTotalItems(response.meta?.pagination?.total || 0)
      } else {
        setProfiles([])
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Error al cargar los perfiles"
      setError(errorMessage)
      setProfiles([])
    } finally {
      setIsLoading(false)
    }
  }, [currentPage, pageSize, sort, debouncedSearchQuery])

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  const handleSortChange = (newSort: string) => {
    setSort(newSort)
    setCurrentPage(1)
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs sm:text-sm">
              {t("exchangeRateProfiles")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
            {t("exchangeRateProfiles")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t("exchangeRateProfilesDescription")}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base sm:text-lg">{t("exchangeRateProfiles")}</CardTitle>
            <Link href="/exchange-rate-profiles/new" className="w-full sm:w-auto">
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                {t("newExchangeRateProfile")}
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t("searchExchangeRateProfiles")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-10 ${searchQuery ? "pr-10" : ""} bg-background border-border`}
              />
              {searchQuery ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-muted"
                  onClick={() => setSearchQuery("")}
                  title={t("clearSearch")}
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
          </div>

          <ExchangeRateProfilesTable
            searchQuery={searchQuery}
            profiles={profiles}
            isLoading={isLoading}
            onSortChange={handleSortChange}
            onPageSizeChange={handlePageSizeChange}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onDeleted={loadProfiles}
          />
        </CardContent>
      </Card>
    </div>
  )
}
