"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { SideNav } from "@/components/side-nav"
import { TopBar } from "@/components/top-bar"
import { useAuth } from "@/context/AuthContext"
import { useTranslations } from "next-intl"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SileoToaster } from "sileo"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { ExchangeRateComparison } from "@/lib/exchange-rates"
import { getSession } from "@/lib/auth/auth"
import { APP_VERSION } from "@/lib/constants"

function isComparisonPayload(
  x: unknown
): x is ExchangeRateComparison {
  if (!x || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  return (
    o.current != null &&
    typeof o.current === "object" &&
    typeof (o.current as { date?: unknown }).date === "string"
  )
}

export function MainLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isLoading } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateComparison | null>(null)
  const [versionDialog, setVersionDialog] = useState<{ open: boolean; isNew: boolean; previous: string | null }>({
    open: false,
    isNew: false,
    previous: null,
  })
  const t = useTranslations("common")

  const handleMenuToggle = () => {
    setIsMobileMenuOpen((prev) => !prev)
  }

  const handleMenuClose = () => {
    setIsMobileMenuOpen(false)
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated) {
      router.push("/login")
    }
  }, [mounted, isAuthenticated, isLoading, router])

  // Muestra un dialog cuando la versión del sistema cambia o es la primera visita
  useEffect(() => {
    if (!mounted || isLoading || !isAuthenticated) return
    const STORAGE_KEY = "primeiq_app_version"
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === APP_VERSION) return
    localStorage.setItem(STORAGE_KEY, APP_VERSION)
    setVersionDialog({ open: true, isNew: stored === null, previous: stored })
  }, [mounted, isLoading, isAuthenticated])

  useEffect(() => {
    if (!mounted || isLoading || !isAuthenticated) return

    let cancelled = false

    const load = async () => {
      try {
        const session = getSession()
        const token = session?.token
        const headers: HeadersInit = {
          Accept: "application/json",
        }
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }

        const res = await fetch(
          `/api/exchange-rates?path=${encodeURIComponent(pathname)}&t=${Date.now()}`,
          { cache: "no-store", credentials: "same-origin", headers }
        )
        const json: unknown = await res.json().catch(() => null)
        if (cancelled) return
        if (res.status === 401) {
          setExchangeRate(null)
          return
        }
        if (isComparisonPayload(json)) {
          setExchangeRate(json)
        }
      } catch {
        if (!cancelled) {
          /* mantener último exchangeRate en estado */
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [mounted, isLoading, isAuthenticated, pathname])

  if (!mounted || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">{t("checkingSession")}</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SideNav
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={handleMenuClose}
        exchangeRate={exchangeRate}
      />
      <div className="flex flex-col flex-1 overflow-hidden lg:ml-0">
        <TopBar onMenuClick={handleMenuToggle} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <Toaster />
      <SileoToaster position="top-center" theme="system" />

      {/* Notificación de nueva versión */}
      <Dialog open={versionDialog.open} onOpenChange={(open) => setVersionDialog((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-sm text-center gap-6">
          <DialogHeader className="items-center gap-3">
            <div className="text-4xl">🚀</div>
            <DialogTitle className="text-xl font-bold">
              {versionDialog.isNew ? "¡Bienvenido!" : "¡Sistema actualizado!"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm leading-relaxed">
              {versionDialog.isNew
                ? "Estás usando la versión más reciente de Prime IQ Back Office."
                : `El sistema fue actualizado desde la versión ${versionDialog.previous}.`}
            </p>
            <div className="inline-flex items-center rounded-full border border-border bg-muted px-4 py-2 text-lg font-mono font-bold text-foreground">
              v{APP_VERSION}
            </div>
            <p className="text-xs text-muted-foreground">
              Revisá el historial de cambios en{" "}
              <span className="font-medium text-foreground">Configuración → Versión</span>.
            </p>
          </div>
          <Button className="w-full" onClick={() => setVersionDialog((s) => ({ ...s, open: false }))}>
            Entendido
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
