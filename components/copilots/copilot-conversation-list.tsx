"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  Home,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  ListChecks,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { enUS, es } from "date-fns/locale"
import { useLocale } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useTranslations } from "next-intl"
import { useCopilotContext } from "@/components/copilots/copilot-context"
import { CopilotSidebarConversationPicker } from "@/components/copilots/copilot-sidebar-conversation-picker"
import type { CopilotConversation } from "@/lib/copilot/conversations"

type CopilotConversationListProps = {
  onNavigate?: () => void
  className?: string
  onCollapseSidebar?: () => void
}

export function CopilotConversationList({
  onNavigate,
  className,
  onCollapseSidebar,
}: CopilotConversationListProps) {
  const t = useTranslations("copilots")
  const pathname = usePathname()
  const router = useRouter()
  const { locale } = useLocale()
  const {
    conversations,
    archivedConversations,
    register,
    archive,
    unarchive,
    setArchived,
    rename,
    loading,
    error,
  } = useCopilotContext()
  const [query, setQuery] = useState("")
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<CopilotConversation | null>(
    null,
  )
  const [renameDraft, setRenameDraft] = useState("")
  const [creating, setCreating] = useState(false)
  /**
   * Modo selección.
   *
   * Apagado por defecto: la acción normal de una fila es abrir la conversación,
   * y unas casillas siempre visibles le cobrarían ese ruido a quien sólo quiere
   * leer. Se enciende a propósito desde el botón de arriba.
   */
  const [seleccionando, setSeleccionando] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())

  const dateLocale = locale === "es" ? es : enUS

  const activeId = useMemo(() => {
    const m = pathname?.match(/^\/copilots\/c\/([^/]+)/)
    return m?.[1] ?? null
  }, [pathname])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, query])

  const filteredArchived = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return archivedConversations
    return archivedConversations.filter((c) =>
      c.title.toLowerCase().includes(q),
    )
  }, [archivedConversations, query])

  /** Lo marcado, partido en las dos acciones posibles. Una fila no puede estar en las dos. */
  const marcadasActivas = useMemo(
    () => filtered.filter((c) => marcadas.has(c.id)).map((c) => c.id),
    [filtered, marcadas],
  )
  const marcadasArchivadas = useMemo(
    () => filteredArchived.filter((c) => marcadas.has(c.id)).map((c) => c.id),
    [filteredArchived, marcadas],
  )
  /**
   * Lo que se está viendo de verdad.
   *
   * Las archivadas sólo cuentan si su sección está desplegada: "Seleccionar
   * todo" marcando conversaciones que no están en pantalla es la clase de cosa
   * que se descubre después de archivar de más.
   */
  const visibles = useMemo(
    () => [...filtered, ...(archivedOpen ? filteredArchived : [])].map((c) => c.id),
    [filtered, filteredArchived, archivedOpen],
  )
  const todasMarcadas = visibles.length > 0 && visibles.every((id) => marcadas.has(id))

  const alternarMarca = (id: string) => {
    setMarcadas((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  const salirDeSeleccion = () => {
    setSeleccionando(false)
    setMarcadas(new Set())
  }

  /**
   * Aplica la acción en lote.
   *
   * Si la conversación abierta se archiva, se sale de ella: quedarse dentro de
   * algo que acaba de desaparecer de la lista se lee como un error.
   */
  const aplicar = (archivar: boolean) => {
    const ids = archivar ? marcadasActivas : marcadasArchivadas
    if (!ids.length) return
    setArchived(ids, archivar)
    if (archivar && activeId && ids.includes(activeId)) router.push("/copilots")
    salirDeSeleccion()
  }

  const handleNewChat = async () => {
    setCreating(true)
    try {
      const id = await register()
      if (!id) return
      router.push(`/copilots/c/${id}`)
      onNavigate?.()
    } finally {
      setCreating(false)
    }
  }

  const confirmArchive = () => {
    if (!archiveConfirmId) return
    archive(archiveConfirmId)
    if (activeId === archiveConfirmId) {
      router.push("/copilots")
    }
    setArchiveConfirmId(null)
    onNavigate?.()
  }

  const submitRename = () => {
    if (!renameTarget) return
    void rename(renameTarget.id, renameDraft)
    setRenameTarget(null)
    setRenameDraft("")
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-sidebar", className)}>
      <div className="border-b border-sidebar-border">
        <div className="flex h-14 sm:h-16 items-center gap-2.5 px-3 sm:px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-9 sm:w-9">
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-none text-sidebar-foreground sm:text-base">
              {t("productName")}
            </p>
            <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
              {t("productTagline")}
            </p>
          </div>
          {onCollapseSidebar ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label={t("collapseMenu")}
              title={t("collapseMenu")}
              onClick={onCollapseSidebar}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
        </div>
        <div className="space-y-3 border-t border-sidebar-border p-3 pt-2">
          <Button
            type="button"
            className="h-10 w-full justify-center gap-2 rounded-xl font-medium shadow-sm"
            onClick={() => void handleNewChat()}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
            )}
            {creating ? t("creatingChat") : t("newConversation")}
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-9 rounded-lg border-sidebar-border bg-background/80 pl-9 text-sm"
              aria-label={t("searchPlaceholder")}
            />
          </div>
          <CopilotSidebarConversationPicker onNavigate={onNavigate} />

          {conversations.length + archivedConversations.length > 0 ? (
            <div className="flex items-center justify-between gap-2 px-0.5">
              {seleccionando ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={todasMarcadas}
                    onCheckedChange={(v) =>
                      setMarcadas(v === true ? new Set(visibles) : new Set())
                    }
                    aria-label={t("selectAll")}
                  />
                  {t("selectAll")}
                </label>
              ) : (
                <span />
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-sidebar-foreground"
                onClick={() => (seleccionando ? salirDeSeleccion() : setSeleccionando(true))}
              >
                {seleccionando ? (
                  <>
                    <X className="mr-1 h-3.5 w-3.5" />
                    {t("cancel")}
                  </>
                ) : (
                  <>
                    <ListChecks className="mr-1 h-3.5 w-3.5" />
                    {t("select")}
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mx-3 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-snug text-destructive">
          {t("errorLoadingChats")}: {error}
        </p>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-2">
          {loading && conversations.length === 0 ? (
            <p className="flex items-center gap-2 px-2 py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loadingChats")}
            </p>
          ) : (
            <>
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {query.trim()
                    ? filteredArchived.length === 0
                      ? t("noResults")
                      : t("noActiveSearchMatches")
                    : archivedConversations.length === 0
                      ? t("emptySidebar")
                      : t("noActiveChats")}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filtered.map((c) => {
                    const isActive = c.id === activeId
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "group flex items-stretch gap-0.5 rounded-xl transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "hover:bg-sidebar-accent/60",
                        )}
                      >
                        {seleccionando ? (
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left">
                            <Checkbox
                              checked={marcadas.has(c.id)}
                              onCheckedChange={() => alternarMarca(c.id)}
                              aria-label={c.title}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium leading-tight">
                                {c.title}
                              </span>
                            </span>
                          </label>
                        ) : (
                        <>
                        <Link
                          href={`/copilots/c/${c.id}`}
                          onClick={() => onNavigate?.()}
                          className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5 text-left"
                        >
                          <span className="truncate text-sm font-medium leading-tight">
                            {c.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(c.updatedAt, {
                              addSuffix: true,
                              locale: dateLocale,
                            })}
                          </span>
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-10 w-9 shrink-0 rounded-lg opacity-0 transition-opacity group-hover:opacity-100",
                                isActive && "opacity-100",
                              )}
                              aria-label={t("conversationActions")}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => {
                                setRenameTarget(c)
                                setRenameDraft(c.title)
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              {t("rename")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setArchiveConfirmId(c.id)}
                            >
                              <Archive className="mr-2 h-4 w-4" />
                              {t("archive")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {archivedConversations.length > 0 ? (
                <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        archivedOpen ? "rotate-0" : "-rotate-90",
                      )}
                      aria-hidden
                    />
                    <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t("archivedSection", {
                      count: archivedConversations.length,
                    })}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-0.5 pt-1 data-[state=closed]:hidden">
                    {filteredArchived.length === 0 ? (
                      query.trim() ? (
                        <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                          {t("noArchivedSearchMatches")}
                        </p>
                      ) : null
                    ) : (
                      filteredArchived.map((c) => {
                        const isActive = c.id === activeId
                        return (
                          <div
                            key={c.id}
                            className={cn(
                              "group flex items-stretch gap-0.5 rounded-xl transition-colors opacity-90",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "hover:bg-sidebar-accent/60",
                            )}
                          >
                            {seleccionando ? (
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left">
                                <Checkbox
                                  checked={marcadas.has(c.id)}
                                  onCheckedChange={() => alternarMarca(c.id)}
                                  aria-label={c.title}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium leading-tight">
                                    {c.title}
                                  </span>
                                </span>
                              </label>
                            ) : (
                            <>
                            <Link
                              href={`/copilots/c/${c.id}`}
                              onClick={() => onNavigate?.()}
                              className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5 text-left"
                            >
                              <span className="truncate text-sm font-medium leading-tight">
                                {c.title}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(c.updatedAt, {
                                  addSuffix: true,
                                  locale: dateLocale,
                                })}
                              </span>
                            </Link>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className={cn(
                                    "h-10 w-9 shrink-0 rounded-lg opacity-0 transition-opacity group-hover:opacity-100",
                                    isActive && "opacity-100",
                                  )}
                                  aria-label={t("conversationActions")}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setRenameTarget(c)
                                    setRenameDraft(c.title)
                                  }}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  {t("rename")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => unarchive(c.id)}
                                >
                                  <ArchiveRestore className="mr-2 h-4 w-4" />
                                  {t("unarchive")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            </>
                            )}
                          </div>
                        )
                      })
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </>
          )}
        </div>
      </ScrollArea>

      {seleccionando && marcadas.size > 0 ? (
        <div className="shrink-0 border-t border-border bg-sidebar-accent/40 p-3">
          <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
            {t("selectedCount", { count: marcadas.size })}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Un botón por acción aplicable. Si la selección mezcla activas y
                archivadas aparecen los dos, con su cuenta: así nadie tiene que
                adivinar qué hace el botón con lo que marcó. */}
            {marcadasActivas.length > 0 ? (
              <Button size="sm" className="h-8 flex-1 text-xs" onClick={() => aplicar(true)}>
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                {t("archiveSelected", { count: marcadasActivas.length })}
              </Button>
            ) : null}
            {marcadasArchivadas.length > 0 ? (
              <Button
                size="sm"
                variant={marcadasActivas.length > 0 ? "outline" : "default"}
                className="h-8 flex-1 text-xs"
                onClick={() => aplicar(false)}
              >
                <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                {t("unarchiveSelected", { count: marcadasArchivadas.length })}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-border p-3 px-4">
        <Link
          href="/copilots"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Home className="h-5 w-5 shrink-0" aria-hidden />
          {t("backToCopilotHome")}
        </Link>
      </div>

      <AlertDialog
        open={archiveConfirmId != null}
        onOpenChange={(o) => !o && setArchiveConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("archiveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("archiveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive}>
              {t("archiveConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={renameTarget != null}
        onOpenChange={(o) => {
          if (!o) {
            setRenameTarget(null)
            setRenameDraft("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("renameTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename()
            }}
            placeholder={t("renamePlaceholder")}
            autoFocus
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRenameTarget(null)
                setRenameDraft("")
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="button" onClick={submitRename}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
