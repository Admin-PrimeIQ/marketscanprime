"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { User, Bell, Database, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Globe, Palette, PlayCircle, Server, ExternalLink, Tag, ScrollText } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { getStrapiPublicBaseUrl } from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { useLocale } from "@/lib/i18n/client"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { APP_VERSION } from "@/lib/constants"
import { CHANGELOG } from "@/lib/changelog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import { resetAllTours, TOUR_ENABLED } from "@/lib/tour-utils"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const { locale, setLocale, isPending: isLocalePending } = useLocale()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const t = useTranslations()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [mounted, setMounted] = useState(false)

  // Estado para cambio de contraseña
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Cargar datos del usuario
  useEffect(() => {
    if (user) {
      setUsername(user.username || "")
      setEmail(user.email || "")
    }
  }, [user])

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleUpdateProfile = async () => {
    if (!user) return

    setIsLoading(true)
    setMessage(null)

    try {
      await dataClient.updateMe({
        username,
        email,
      })
      
      await refreshUser()
      setMessage({ type: 'success', text: tSettings('profile.profileUpdated') })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tSettings('profile.errorUpdating')
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    // Validaciones
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: tSettings('password.passwordsNotMatch') })
      return
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: tSettings('password.passwordTooShort') })
      return
    }

    setIsChangingPassword(true)

    try {
      await dataClient.changePassword(currentPassword, newPassword)
      setMessage({ type: 'success', text: tSettings('password.passwordChanged') })
      
      // Limpiar formulario
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setShowPasswordForm(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : tSettings('password.errorChanging')
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsChangingPassword(false)
    }
  }
  const tSettings = useTranslations('settings')
  const showApiEndpointCard = isStrapiSuperAdmin(user?.role)
  const strapiBaseUrl = getStrapiPublicBaseUrl()
  const strapiAdminUrl = `${strapiBaseUrl}/admin`

  const handleStartTour = () => {
    // El botón está deshabilitado, pero la guarda va igual: un botón
    // deshabilitado es una decisión de la vista, y esto es la de negocio.
    if (!TOUR_ENABLED) return
    // Reset all tours
    resetAllTours()
    // Redirect to projects page where the tour will start
    router.push('/projects')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{tSettings('title')}</h1>
        <p className="text-muted-foreground mt-1">{tSettings('subtitle')}</p>
      </div>

      <div className="space-y-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {tSettings('profile.title')}
            </CardTitle>
            <CardDescription>{tSettings('profile.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {message && (
              <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
                {message.type === 'error' ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">{tSettings('profile.username')}</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-background border-border"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{tSettings('profile.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background border-border"
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rol">{tSettings('profile.role')}</Label>
              <Input
                id="rol"
                value={user?.role?.name ?? t('navigation.operator')}
                disabled
                className="bg-muted border-border"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleUpdateProfile} disabled={isLoading}>
                {isLoading ? tSettings('profile.saving') : tSettings('profile.saveChanges')}
              </Button>
            </div>

            {/* Sección de cambio de contraseña */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    {tSettings('password.title')}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tSettings('password.subtitle')}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                >
                  {showPasswordForm ? t('common.cancel') : tSettings('password.changePassword')}
                </Button>
              </div>

              {showPasswordForm && (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">{tSettings('password.currentPassword')}</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="bg-background border-border pr-10"
                        required
                        disabled={isChangingPassword}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">{tSettings('password.newPassword')}</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="bg-background border-border pr-10"
                        required
                        minLength={6}
                        disabled={isChangingPassword}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{tSettings('password.confirmPassword')}</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="bg-background border-border pr-10"
                        required
                        minLength={6}
                        disabled={isChangingPassword}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" disabled={isChangingPassword}>
                    {isChangingPassword ? tSettings('password.changing') : tSettings('password.changePassword')}
                  </Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>

        {showApiEndpointCard && (
          <Card className="border-border bg-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5" />
                {tSettings("apiEndpoint.title")}
              </CardTitle>
              <CardDescription>{tSettings("apiEndpoint.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                {tSettings("apiEndpoint.superUserOnlyLegend")}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {tSettings("apiEndpoint.connectedTo")}
                </p>
                <p className="font-mono text-sm text-muted-foreground break-all">
                  {strapiBaseUrl}
                </p>
                <a
                  href={strapiAdminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  aria-label={tSettings("apiEndpoint.openAdminAria")}
                >
                  <span className="font-mono break-all">{strapiAdminUrl}</span>
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Idioma */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              {t('settings.language.title')}
            </CardTitle>
            <CardDescription>{t('settings.language.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('settings.language.title')}</Label>
              <Select
                value={locale}
                onValueChange={(value) => {
                  setLocale(value)
                  setMessage({ type: 'success', text: t('settings.language.languageChanged') })
                }}
                disabled={isLocalePending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">{t('settings.language.spanish')}</SelectItem>
                  <SelectItem value="en">{t('settings.language.english')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tema */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              {t('settings.theme.title')}
            </CardTitle>
            <CardDescription>{t('settings.theme.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('settings.theme.title')}</Label>
              <Select
                value={mounted ? theme || 'dark' : 'dark'}
                onValueChange={(value) => setTheme(value)}
                disabled={!mounted}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t('settings.theme.light')}</SelectItem>
                  <SelectItem value="dark">{t('settings.theme.dark')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tour guiado (desactivado hasta nuevo aviso — ver TOUR_ENABLED en
            lib/tour-utils). La tarjeta se deja visible a propósito: si
            desapareciera, quien la conoce la buscaría creyendo que se rompió.
            Mismo tratamiento que la de Notificaciones, más abajo. */}
        <Card className={`border-border bg-card${TOUR_ENABLED ? "" : " opacity-60"}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlayCircle className="w-5 h-5" />
              {tSettings('tour.title')}
            </CardTitle>
            <CardDescription>{tSettings('tour.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {TOUR_ENABLED ? null : (
              <div className="rounded-md bg-muted/50 border border-border p-3">
                <p className="text-sm text-muted-foreground italic">
                  {tSettings('tour.disabled')}
                </p>
              </div>
            )}
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {tSettings('tour.description')}
              </p>
              <Button
                onClick={handleStartTour}
                disabled={!TOUR_ENABLED}
                className="w-full sm:w-auto"
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                {tSettings('tour.startTour')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notificaciones (desactivada de momento) */}
        <Card className="border-border bg-card opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              {tSettings('notifications.title')}
            </CardTitle>
            <CardDescription>{tSettings('notifications.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted/50 border border-border p-3 mb-4">
              <p className="text-sm text-muted-foreground italic">
                {tSettings('notifications.comingSoon')}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-muted-foreground">{tSettings('notifications.emailNotifications')}</Label>
                <p className="text-sm text-muted-foreground">{tSettings('notifications.emailDescription')}</p>
              </div>
              <Switch defaultChecked disabled />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-muted-foreground">{tSettings('notifications.changeNotifications')}</Label>
                <p className="text-sm text-muted-foreground">{tSettings('notifications.changeDescription')}</p>
              </div>
              <Switch defaultChecked disabled />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-muted-foreground">{tSettings('notifications.reminders')}</Label>
                <p className="text-sm text-muted-foreground">{tSettings('notifications.remindersDescription')}</p>
              </div>
              <Switch disabled />
            </div>
          </CardContent>
        </Card>

        {/* Versión del sistema */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              {t('settings.system.version') || 'Versión'}
            </CardTitle>
            <CardDescription>{t('settings.system.versionDescription') || 'Versión actual del sistema'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Prime IQ Back Office</p>
              <div className="flex items-center gap-3">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                      <ScrollText className="w-4 h-4" />
                      Changelog
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <ScrollText className="w-5 h-5" />
                        Changelog
                      </DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto flex-1 pr-1 space-y-8">
                      {CHANGELOG.map((entry) => (
                        <div key={entry.version}>
                          <div className="flex items-center gap-3 mb-1">
                            <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-sm font-mono font-semibold text-foreground">
                              v{entry.version}
                            </span>
                            <span className="text-xs text-muted-foreground">{entry.date}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-4">{entry.summary}</p>
                          <div className="space-y-4">
                            {entry.sections.map((section) => (
                              <div key={section.title}>
                                <h4 className="text-sm font-semibold text-foreground mb-2">{section.title}</h4>
                                <ul className="space-y-1">
                                  {section.items.map((item, i) => (
                                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-sm font-mono font-semibold text-foreground">
                  v{APP_VERSION}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              {t('settings.system.title')}
            </CardTitle>
            <CardDescription>{t('settings.system.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted/50 border border-border p-3 mb-4">
              <p className="text-sm text-muted-foreground italic">
                {t('settings.system.comingSoon')}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-muted-foreground">{t('settings.system.autoSave')}</Label>
                <p className="text-sm text-muted-foreground">{t('settings.system.autoSaveDescription')}</p>
              </div>
              <Switch defaultChecked disabled />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-muted-foreground">{t('settings.system.compactMode')}</Label>
                <p className="text-sm text-muted-foreground">{t('settings.system.compactModeDescription')}</p>
              </div>
              <Switch disabled />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
