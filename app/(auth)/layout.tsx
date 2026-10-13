"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Sun, Moon, Globe } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslations } from "next-intl"
import { useLocale } from "@/lib/i18n/client"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const t = useTranslations('navigation')
  const { locale, setLocale, isPending: isLocalePending } = useLocale()

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-3 sm:p-4 relative">
      {/* Toggle de tema y selector de idioma en la esquina superior derecha */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex items-center gap-2">
        {/* Language selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10"
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
          className="relative h-8 w-8 sm:h-10 sm:w-10"
          title={mounted && theme === "dark" ? t('switchToLight') : t('switchToDark')}
        >
          {mounted && theme === "dark" ? (
            <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </Button>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
