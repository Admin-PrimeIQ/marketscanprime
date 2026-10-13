"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Building2,
  Blocks,
  Home,
  FolderKanban,
  Settings,
  Database,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Banknote,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { APP_VERSION } from "@/lib/constants"
import { ExchangeRateSidebar } from "@/components/exchange-rate-sidebar"
import type { ExchangeRateComparison } from "@/lib/exchange-rates"

interface SideNavProps {
  isMobileOpen?: boolean
  onMobileClose?: () => void
  exchangeRate?: ExchangeRateComparison | null
}

export function SideNav({
  isMobileOpen = false,
  onMobileClose,
  exchangeRate = null,
}: SideNavProps) {
  const t = useTranslations('navigation')
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("sidebar_collapsed") === "true"
  })

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("sidebar_collapsed", String(next))
      return next
    })
  }
  
  // Close mobile menu when route changes
  useEffect(() => {
    if (isMobileOpen && onMobileClose) {
      onMobileClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const navigation = [
    // TEMPORARILY HIDDEN: Dashboard section
    // { name: t('dashboard'), href: "/dashboard", icon: LayoutDashboard },
    { name: t('projects'), href: "/projects", icon: Building2 },
    { name: t('blocks'), href: "/blocks", icon: Blocks },
    { name: t('units'), href: "/units", icon: Home },
    { name: t('exchangeRateProfiles'), href: "/exchange-rate-profiles", icon: Banknote },
    { name: t('catalogs'), href: "/catalogs", icon: Database },
    { name: t('sync'), href: "/sync", icon: RefreshCw, beta: true },
    { name: t('copilots'), href: "/copilots", icon: Sparkles },
  ]


  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      
      <aside
        className={cn(
          "border-r border-border bg-card flex flex-col transition-all duration-200 ease-in-out",
          "fixed lg:static inset-y-0 left-0 z-50 lg:z-auto",
          collapsed ? "w-20" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Mobile close button */}
        <div className="lg:hidden flex h-14 sm:h-16 items-center justify-between border-b border-border px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary sm:h-9 sm:w-9">
              <FolderKanban className="h-4 w-4 text-primary-foreground sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight text-foreground sm:text-base">Market Scan</h1>
              <p className="truncate text-[11px] text-muted-foreground">
                Prime IQ Admin <span className="text-muted-foreground/70">v{APP_VERSION}</span>
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onMobileClose}
            className="h-9 w-9 shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      <div
        className={cn(
          "hidden h-16 border-b border-border lg:block",
          collapsed ? "px-2" : "px-6"
        )}
      >
        <div className="flex h-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-lg bg-primary",
                collapsed ? "h-7 w-7" : "h-8 w-8",
              )}
            >
              <FolderKanban
                className={cn(
                  "text-primary-foreground",
                  collapsed ? "h-4 w-4" : "h-5 w-5",
                )}
              />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="truncate font-semibold text-base text-foreground leading-tight">Market Scan</h1>
                <p className="text-xs text-muted-foreground">Prime IQ Admin</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors",
              collapsed ? "h-7 w-7" : "h-8 w-8",
            )}
            aria-label={collapsed ? t('expandMenu') : t('collapseMenu')}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <nav className={cn("flex-1 p-3 space-y-1", collapsed ? "px-2" : "px-4")}>
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const link = (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center"
              )}
            >
              <item.icon className="w-5 h-5" />
              {!collapsed && (
                <>
                  <span className="truncate">{item.name}</span>
                  {"beta" in item && item.beta && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none",
                        isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      )}
                    >
                      beta
                    </span>
                  )}
                </>
              )}
            </Link>
          )

          if (!collapsed) return link

          return (
            <Tooltip key={item.name}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">
                {item.name}
                {"beta" in item && item.beta ? " · beta" : ""}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      {exchangeRate ? (
        <div
          className={cn(
            "border-t border-border",
            collapsed ? "px-2 py-2" : "px-4 py-3"
          )}
        >
          <ExchangeRateSidebar data={exchangeRate} navCollapsed={collapsed} />
        </div>
      ) : null}

      <div className={cn("p-3 border-t border-border", collapsed ? "px-2" : "px-4")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/settings"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                  "justify-center"
                )}
              >
                <Settings className="w-5 h-5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t('settings')}</TooltipContent>
          </Tooltip>
        ) : (
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            )}
          >
            <Settings className="w-5 h-5" />
            <span>{t('settings')}</span>
          </Link>
        )}
      </div>
    </aside>
    </>
  )
}
