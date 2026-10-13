"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

export default function RegisterPage() {
  const router = useRouter()
  const t = useTranslations('common')

  // Redirigir automáticamente a login - el registro solo está disponible por invitación
  useEffect(() => {
    router.replace("/login")
  }, [router])

  // Mostrar un mensaje breve mientras se redirige
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{t('register.redirecting') || 'Redirigiendo...'}</p>
      </div>
    </div>
  )
}
