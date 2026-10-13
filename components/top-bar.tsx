"use client"

import { LogOut, Sun, Moon, Menu, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NotionAvatarComponent } from "@/components/notion-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "@/lib/i18n/client"

interface TopBarProps {
  onMenuClick?: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const t = useTranslations('navigation')
  const { locale, setLocale, isPending: isLocalePending } = useLocale()
  
  const userEmail = user?.email || user?.username || t('user')
  const userRole = user?.role?.name ?? t('operator')
  /** Misma semilla que en copilot / burbuja usuario (DiceBear notionists). */
  const notionAvatarSeed = (user?.email || user?.username || "user").trim()

  // Evitar hidratación incorrecta
  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <header className="h-14 sm:h-16 shrink-0 border-b border-border bg-card px-3 sm:px-6 flex items-center justify-between gap-3 relative z-10">
      {/* Mobile menu button */}
      {onMenuClick && (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onMenuClick()
          }}
          className="lg:hidden h-9 w-9 relative z-50 flex-shrink-0"
          aria-label="Toggle menu"
          type="button"
        >
          <Menu className="w-5 h-5" />
        </Button>
      )}
      {/* Spacer for mobile when menu button is shown */}
      {!onMenuClick && <div className="lg:hidden w-9" />}
      <div className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
        {/* Language selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 sm:h-10 sm:w-10"
              disabled={isLocalePending}
              title={locale === 'es' ? t('spanish') : t('english')}
            >
              <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setLocale('es')}
              className={locale === 'es' ? 'bg-accent' : ''}
            >
              <div className="flex items-center gap-2">
                <span>🇪🇸</span>
                <span>{t('spanish')}</span>
                {locale === 'es' && <span className="ml-auto">✓</span>}
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setLocale('en')}
              className={locale === 'en' ? 'bg-accent' : ''}
            >
              <div className="flex items-center gap-2">
                <span>🇺🇸</span>
                <span>{t('english')}</span>
                {locale === 'en' && <span className="ml-auto">✓</span>}
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Toggle de tema */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="relative h-9 w-9 sm:h-10 sm:w-10"
          title={mounted && theme === "dark" ? t('switchToLight') : t('switchToDark')}
        >
          {mounted && theme === "dark" ? (
            <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </Button>

        {/* TEMPORARILY HIDDEN: Notifications button */}
        {/* <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center bg-destructive text-[10px]">
            3
          </Badge>
        </Button> */}

        <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 sm:gap-3 h-auto p-1.5 sm:p-2">
                <div className="text-right hidden sm:block">
                  <p className="text-xs sm:text-sm font-medium text-foreground truncate max-w-[120px] sm:max-w-none">{userEmail}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{userRole}</p>
                </div>
                <NotionAvatarComponent
                  seed={notionAvatarSeed}
                  random={false}
                  size={36}
                  shape="circle"
                  bgColor="f7f6f3"
                  className="flex-shrink-0"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t('myAccount')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                {t('logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
