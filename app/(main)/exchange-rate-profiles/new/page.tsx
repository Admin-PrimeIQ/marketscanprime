"use client"

import { ExchangeRateProfileForm } from "@/components/exchange-rate-profiles/exchange-rate-profile-form"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export default function NewExchangeRateProfilePage() {
  const t = useTranslations("common")

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <Breadcrumb>
        <BreadcrumbList className="flex-wrap">
          <BreadcrumbItem>
            <BreadcrumbLink href="/exchange-rate-profiles" className="text-xs sm:text-sm">
              {t("exchangeRateProfiles")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs sm:text-sm">
              {t("newExchangeRateProfile")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-2 sm:gap-4">
        <Link href="/exchange-rate-profiles">
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
            {t("newExchangeRateProfile")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t("newExchangeRateProfileDescription")}
          </p>
        </div>
      </div>

      <ExchangeRateProfileForm mode="create" />
    </div>
  )
}
