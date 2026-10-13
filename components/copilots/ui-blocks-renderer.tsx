"use client"

import type { CSSProperties, ReactNode } from "react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Code2,
  Copy,
  Download,
  File,
  FileArchive,
  FileAudio2,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Image as ImageLucide,
  Info,
  Layers,
  List,
  ListOrdered,
  Mail,
  MousePointerClick,
  Music,
  NotepadText,
  Paperclip,
  Presentation,
  RotateCcw,
  Sparkles,
  Table2,
  XCircle,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import {
  type HiddenFileAnalysisKind,
  type UIBlock,
  type ButtonItem,
  type NoteLevel,
  summarizeHiddenFileBlock,
} from "@/lib/copilot/ui-blocks-engine"
import hljs, {
  COPILOT_HLJS_LANGUAGE_IDS,
  normalizeCopilotHljsLanguage,
} from "@/lib/copilot/n8n-chat-hljs"
import { openN8nChatImageLightbox } from "@/lib/copilot/n8n-chat-image-lightbox"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import codeHighlightStyles from "./ui-blocks-code-highlight.module.css"

// ─── Layout compartido: [icono] + etiqueta + contenido (mismo ritmo que listas) ─

const UI_BLOCK_LEAD_CLASS =
  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground ring-1 ring-border/60 dark:bg-muted/40"

/** Misma franja inferior que el borrador de email (copiar + acción principal desplegable). */
const UI_BLOCK_TOOLBAR_FOOTER_CLASS = cn(
  "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/80 px-3 py-2",
  "bg-[#eceef1] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)] dark:border-border/60 dark:bg-zinc-900/65 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
)

function UIBlockLeadIcon({
  Icon,
  className,
  iconClassName,
  title,
}: {
  Icon: LucideIcon
  className?: string
  iconClassName?: string
  /** Tooltip opcional (p. ej. icono compartido cuyo significado fino viene del contenido vecino). */
  title?: string
}) {
  return (
    <span className={cn(UI_BLOCK_LEAD_CLASS, className)} aria-hidden title={title}>
      <Icon className={cn("h-3.5 w-3.5", iconClassName)} strokeWidth={1.75} />
    </span>
  )
}

function hiddenFileLeadIcon(kind: HiddenFileAnalysisKind): LucideIcon {
  switch (kind) {
    case "image":
      return FileImage
    case "pdf":
    case "document":
      return FileText
    case "spreadsheet":
      return FileSpreadsheet
    case "presentation":
      return Presentation
    case "audio":
      return FileAudio2
    case "video":
      return FileVideo
    case "archive":
      return FileArchive
    case "code":
      return FileCode2
    case "default":
    default:
      return File
  }
}

function UIBlockWithLead({
  icon: Icon,
  label,
  labelClassName,
  children,
  leadClassName,
  leadIconClassName,
  leadTitle,
}: {
  icon: LucideIcon
  /** Fila opcional encima del contenido (p. ej. título, tipo de bloque). */
  label?: ReactNode
  labelClassName?: string
  children: ReactNode
  /** Clases extra en el contenedor del icono (p. ej. notas con color). */
  leadClassName?: string
  leadIconClassName?: string
  /** Tooltip en el icono de carril (p. ej. markdown puro). */
  leadTitle?: string
}) {
  return (
    <div className="flex min-w-0 w-full gap-2.5">
      <UIBlockLeadIcon
        Icon={Icon}
        className={leadClassName}
        iconClassName={leadIconClassName}
        title={leadTitle}
      />
      <div className="flex min-w-0 w-full flex-1 flex-col gap-2">
        {label != null && label !== "" ? (
          <div
            className={cn(
              "text-xs font-semibold tracking-wide text-muted-foreground",
              labelClassName,
            )}
          >
            {label}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}

// ─── Note level config ────────────────────────────────────────────────────────

const NOTE_LAYOUT: Record<
  NoteLevel,
  { border: string; bg: string; iconColor: string; titleColor: string }
> = {
  info: {
    border: "border-blue-400/60",
    bg: "bg-blue-50/60 dark:bg-blue-950/30",
    iconColor: "text-blue-500",
    titleColor: "text-blue-700 dark:text-blue-300",
  },
  success: {
    border: "border-emerald-400/60",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/30",
    iconColor: "text-emerald-500",
    titleColor: "text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    border: "border-amber-400/60",
    bg: "bg-amber-50/60 dark:bg-amber-950/30",
    iconColor: "text-amber-500",
    titleColor: "text-amber-700 dark:text-amber-300",
  },
  error: {
    border: "border-red-400/60",
    bg: "bg-red-50/60 dark:bg-red-950/30",
    iconColor: "text-red-500",
    titleColor: "text-red-700 dark:text-red-300",
  },
  tip: {
    border: "border-purple-400/60",
    bg: "bg-purple-50/60 dark:bg-purple-950/30",
    iconColor: "text-purple-500",
    titleColor: "text-purple-700 dark:text-purple-300",
  },
}

const NOTE_ICONS: Record<NoteLevel, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: AlertTriangle,
  error: XCircle,
  tip: Sparkles,
}

/** Icono de carril compartido para todos los callouts (info/success/warning/…); el tono interno lo marca el bloque. */
const NOTE_SHARED_LEAD_ICON = NotepadText

/** Icono de carril para bloques de texto en Markdown (GFM) puro. */
const MARKDOWN_TEXT_LEAD_ICON = FileText

const BTN_VARIANTS: Record<string, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-1 ring-inset ring-white/15 " +
    "hover:bg-primary/92 hover:shadow-lg hover:shadow-primary/30 active:shadow-md",
  secondary:
    "border border-border/90 bg-background/95 text-foreground shadow-sm ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06] " +
    "hover:border-primary/30 hover:bg-muted/70 hover:shadow-md active:shadow-sm",
  danger:
    "bg-red-600 text-white shadow-md shadow-red-950/25 ring-1 ring-inset ring-white/15 " +
    "hover:bg-red-500 hover:shadow-lg active:shadow-md",
  ghost:
    "border border-transparent bg-transparent text-foreground shadow-none " +
    "hover:border-border/70 hover:bg-muted/55 hover:shadow-sm",
  link:
    "min-h-0! rounded-md px-1 py-0.5 text-primary underline-offset-4 shadow-none ring-0 " +
    "hover:underline hover:text-primary/90 hover:decoration-2 hover:bg-primary/5 active:opacity-75",
}

function escapeHtmlForCodeFallback(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function highlightCodeHtml(code: string, language: string | undefined): string {
  const lang = normalizeCopilotHljsLanguage(language)
  try {
    return hljs.highlight(code, { language: lang }).value
  } catch {
    return escapeHtmlForCodeFallback(code)
  }
}

/** Bloque `:::code` con cabecera tipo editor, resaltado y copiar al portapapeles. */
function UIBlockCode({ block }: { block: Extract<UIBlock, { type: "code" }> }) {
  const [copied, setCopied] = useState(false)
  const defaultFromBlock = useMemo(
    () => normalizeCopilotHljsLanguage(block.language),
    [block.language],
  )
  const [highlightLang, setHighlightLang] = useState(defaultFromBlock)
  const lastSyncedDefault = useRef(defaultFromBlock)

  useEffect(() => {
    if (lastSyncedDefault.current === defaultFromBlock) return
    lastSyncedDefault.current = defaultFromBlock
    setHighlightLang(defaultFromBlock)
  }, [defaultFromBlock])

  const html = useMemo(
    () => highlightCodeHtml(block.code, highlightLang),
    [block.code, highlightLang],
  )

  const onCopy = useCallback(() => {
    void navigator.clipboard.writeText(block.code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }, [block.code])

  const langMenuTitle =
    highlightLang === defaultFromBlock
      ? "Definido en el bloque :::code"
      : `Cambiado respecto al bloque (${defaultFromBlock})`

  return (
    <div
      className={cn(
        codeHighlightStyles.block,
        "copilot-ui-block-code flex min-w-0 w-full flex-col overflow-hidden rounded-lg border border-border shadow-sm",
      )}
    >
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-muted/45 px-3 py-2 dark:bg-muted/25">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Código
        </span>
        {block.filename ? (
          <span
            className="min-w-0 truncate text-right font-mono text-xs font-medium text-foreground"
            title={block.filename}
          >
            {block.filename}
          </span>
        ) : null}
      </div>
      <pre
        className="m-0 min-h-0 flex-1 overflow-x-auto p-4 text-[13px] leading-relaxed"
        style={{
          backgroundColor: "var(--ui-code-bg)",
          color: "var(--ui-code-fg)",
        }}
      >
        <code
          className="hljs font-mono text-[13px] leading-relaxed"
          // eslint-disable-next-line react/no-danger -- salida de highlight.js sobre texto del agente
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
      <footer
        role="toolbar"
        aria-label="Acciones del fragmento"
        className={UI_BLOCK_TOOLBAR_FOOTER_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 border-border/70 bg-background/95 shadow-sm dark:bg-background/40"
          aria-label={copied ? "Copiado" : "Copiar código al portapapeles"}
          title={copied ? "Copiado" : "Copiar código"}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onCopy()
          }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5 opacity-80" aria-hidden />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 min-w-0 max-w-[min(100%,11rem)] gap-1 border-border/70 bg-background/95 px-3 font-mono text-xs font-medium shadow-sm dark:bg-background/40"
              title={langMenuTitle}
              aria-label="Lenguaje de sintaxis (por defecto el del bloque)"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="min-w-0 truncate">{highlightLang}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-[min(12.5rem,50vh)] min-w-[11rem] scroll-py-1 overflow-y-auto font-mono text-xs"
          >
            {COPILOT_HLJS_LANGUAGE_IDS.map((opt) => (
              <DropdownMenuItem
                key={opt}
                className={opt === highlightLang ? "bg-muted/80" : undefined}
                onSelect={() => {
                  setHighlightLang(opt)
                }}
              >
                {opt}
                {opt === defaultFromBlock ? (
                  <span className="ml-1 text-[10px] font-sans font-normal text-muted-foreground">
                    (bloque)
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </footer>
    </div>
  )
}

// ─── Shared inline-markdown renderer (bold, italic, code, links) ──────────────

function InlineMarkdown({ text }: { text: string }) {
  // Very lightweight: bold, italic, inline code, bare URLs
  const parts: React.ReactNode[] = []
  const re =
    /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)|(https?:\/\/[^\s)]+)/g
  let last = 0
  let key = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1])      parts.push(<strong key={key++}>{m[2]}</strong>)
    else if (m[3]) parts.push(<em key={key++}>{m[4]}</em>)
    else if (m[5]) parts.push(<code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.82em]">{m[6]}</code>)
    else if (m[7]) parts.push(<a key={key++} href={m[7]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">{m[7]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

type EmailBlock = Extract<UIBlock, { type: "email" }>

function BrandGmailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 shrink-0", className)} aria-hidden>
      <path
        fill="#EA4335"
        d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
      />
    </svg>
  )
}

function BrandOutlookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 shrink-0", className)} aria-hidden>
      <path fill="#0078D4" d="M2 4h9v16H2V4zm11 0h9v7h-9V4zm0 9h9v7h-9v-7z" />
    </svg>
  )
}

/** Texto plano aproximado del cuerpo (para URLs de redacción y portapapeles). */
function emailBodyPlainText(markdown: string): string {
  return String(markdown)
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .trim()
}

function emailDraftClipboardText(block: EmailBlock): string {
  const lines: string[] = []
  if (block.to?.trim()) lines.push(`Para: ${block.to.trim()}`)
  if (block.from?.trim()) lines.push(`De: ${block.from.trim()}`)
  const subj = block.subject?.trim()
  lines.push(`Asunto: ${subj || "(sin asunto)"}`)
  lines.push("")
  lines.push(emailBodyPlainText(block.body))
  return lines.join("\n")
}

function emailBaseline(block: EmailBlock): { sub: string; body: string } {
  return { sub: block.subject?.trim() ?? "", body: block.body }
}

function buildGmailComposeUrl(block: EmailBlock): string {
  const to = block.to?.trim() ?? ""
  const su = block.subject?.trim() ?? ""
  const body = emailBodyPlainText(block.body)
  const q = new URLSearchParams()
  q.set("view", "cm")
  q.set("fs", "1")
  if (to) q.set("to", to)
  if (su) q.set("su", su)
  if (body) q.set("body", body)
  return `https://mail.google.com/mail/?${q.toString()}`
}

function buildOutlookComposeUrl(block: EmailBlock): string {
  const to = block.to?.trim() ?? ""
  const subject = block.subject?.trim() ?? ""
  const body = emailBodyPlainText(block.body)
  const q = new URLSearchParams()
  if (to) q.set("to", to)
  if (subject) q.set("subject", subject)
  if (body) q.set("body", body)
  return `https://outlook.live.com/mail/0/deeplink/compose?${q.toString()}`
}

function UIBlockEmail({ block }: { block: EmailBlock }) {
  const subjectFieldId = useId()
  const baseline = useRef(emailBaseline(block))
  const [draftSubject, setDraftSubject] = useState(() => baseline.current.sub)
  const [draftBody, setDraftBody] = useState(() => baseline.current.body)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const b = emailBaseline(block)
    baseline.current = b
    setDraftSubject(b.sub)
    setDraftBody(b.body)
  }, [block.meta?.id])

  const composeBlock = useMemo(
    (): EmailBlock => ({
      ...block,
      subject: draftSubject.trim() || undefined,
      body: draftBody,
    }),
    [block, draftSubject, draftBody],
  )

  const isDirty =
    draftSubject !== baseline.current.sub || draftBody !== baseline.current.body

  const restore = useCallback(() => {
    setDraftSubject(baseline.current.sub)
    setDraftBody(baseline.current.body)
  }, [])

  const onCopy = useCallback(() => {
    void navigator.clipboard.writeText(emailDraftClipboardText(composeBlock)).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }, [composeBlock])

  const gmailUrl = useMemo(() => buildGmailComposeUrl(composeBlock), [composeBlock])
  const outlookUrl = useMemo(() => buildOutlookComposeUrl(composeBlock), [composeBlock])

  const openCompose = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer")
  }, [])

  return (
    <UIBlockWithLead icon={Mail} leadTitle="Borrador de correo (editable). Los envíos usan el texto actual.">
      <div
        className={cn(
          /* Misma base que `copilot-ui-block-code` para compartir ancho en el carril UIBlockWithLead */
          "copilot-ui-block-email flex min-w-0 w-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm dark:bg-card",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border/80 bg-muted/45 px-3 py-2 dark:bg-muted/25">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nuevo Email
          </span>
        </div>
        <div className="min-w-0 flex-1 divide-y divide-border/60 text-[13px] leading-snug">
          {block.to ? (
            <div className="flex min-h-9 items-center gap-2 bg-background px-3 py-1.5">
              <span className="w-14 shrink-0 text-right text-[12px] text-muted-foreground">Para</span>
              <span className="min-w-0 truncate font-medium text-foreground">{block.to}</span>
            </div>
          ) : null}
          {block.from ? (
            <div className="flex min-h-9 items-center gap-2 bg-background px-3 py-1.5">
              <span className="w-14 shrink-0 text-right text-[12px] text-muted-foreground">De</span>
              <span className="min-w-0 truncate text-foreground/90">{block.from}</span>
            </div>
          ) : null}
          <div className="flex min-h-9 items-center gap-2 bg-background px-3 py-1.5">
            <label
              htmlFor={subjectFieldId}
              className="w-14 shrink-0 pt-0.5 text-right text-[12px] text-muted-foreground"
            >
              Asunto
            </label>
            <input
              id={subjectFieldId}
              type="text"
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value)}
              placeholder="Sin asunto"
              className={cn(
                "min-w-0 flex-1 border-0 bg-transparent py-0.5 text-sm font-semibold text-foreground outline-none",
                "placeholder:font-normal placeholder:italic placeholder:text-muted-foreground/80",
                "focus-visible:ring-0",
              )}
              aria-label="Asunto del correo"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div
            className={cn(
              "w-full border-t border-border/50 bg-white p-4 dark:border-border/40 dark:bg-zinc-950",
              "shadow-[inset_0_1px_0_0_rgba(0,0,0,0.03)] dark:shadow-none",
            )}
          >
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={6}
              spellCheck
              className={cn(
                /* Misma escala visual que el <pre> del bloque código: p-4 arriba + ~6 líneas útiles; resize-y si hace falta más. */
                "field-sizing-content min-h-[7.5rem] max-h-[min(22rem,50vh)] w-full resize-y border-0 bg-transparent p-0 text-[13px] leading-relaxed",
                "text-zinc-900 outline-none focus-visible:ring-0 dark:text-zinc-100",
                "placeholder:text-muted-foreground",
              )}
              placeholder="Escribe el mensaje (Markdown permitido)…"
              aria-label="Cuerpo del correo"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <footer
          role="toolbar"
          aria-label="Acciones del borrador"
          className={UI_BLOCK_TOOLBAR_FOOTER_CLASS}
          onClick={(e) => e.stopPropagation()}
        >
          {isDirty ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 border-border/70 bg-background/95 shadow-sm dark:bg-background/40"
              aria-label="Restaurar borrador original"
              title="Descartar cambios y volver al texto del asistente"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                restore()
              }}
            >
              <RotateCcw className="h-3.5 w-3.5 opacity-90" aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 border-border/70 bg-background/95 shadow-sm dark:bg-background/40"
            aria-label={copied ? "Copiado" : "Copiar borrador al portapapeles"}
            title={copied ? "Copiado" : "Copiar borrador"}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onCopy()
            }}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5 opacity-80" aria-hidden />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-border/70 bg-background/95 px-3 text-xs font-medium shadow-sm dark:bg-background/40"
                onClick={(e) => e.stopPropagation()}
              >
                Enviar correo
                <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[11rem]">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  openCompose(gmailUrl)
                }}
              >
                <BrandGmailIcon />
                Abrir en Gmail
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  openCompose(outlookUrl)
                }}
              >
                <BrandOutlookIcon />
                Abrir en Outlook
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </footer>
      </div>
    </UIBlockWithLead>
  )
}

function MarkdownTextBlock({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("max-w-none prose prose-sm dark:prose-invert", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img({ src, alt, title, ...rest }) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                {...rest}
                src={src}
                alt={alt ?? ""}
                title={title ?? "Click para ampliar"}
                className="cursor-zoom-in rounded-md"
                style={(rest as { style?: CSSProperties }).style}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (typeof src === "string" && src) openN8nChatImageLightbox(src, alt ?? "")
                }}
              />
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ─── Block renderer ───────────────────────────────────────────────────────────

function BlockRenderer({
  block,
  renderTextAsMarkdown,
  actionsEnabled = true,
}: {
  block: UIBlock
  renderTextAsMarkdown?: boolean
  /** false = botones/enlaces del bloque :::buttons inactivos (burbujas antiguas del chat). */
  actionsEnabled?: boolean
}) {
  switch (block.type) {
    // ── Text ──────────────────────────────────────────────────────────────────
    case "text": {
      const base = "leading-relaxed text-foreground"
      if (renderTextAsMarkdown) {
        if (block.variant === "caption") {
          return (
            <p className="text-xs leading-relaxed text-muted-foreground/90">
              <InlineMarkdown text={block.content} />
            </p>
          )
        }
        return (
          <UIBlockWithLead
            icon={MARKDOWN_TEXT_LEAD_ICON}
            leadTitle="Texto en Markdown (títulos, listas, enlaces, etc.)."
          >
            <div className={cn(base, "min-w-0")}>
              <MarkdownTextBlock content={block.content} />
            </div>
          </UIBlockWithLead>
        )
      }
      if (block.variant === "heading")
        return <h3 className={cn(base, "text-base font-semibold")}><InlineMarkdown text={block.content} /></h3>
      if (block.variant === "subheading")
        return <h4 className={cn(base, "text-sm font-semibold text-muted-foreground")}><InlineMarkdown text={block.content} /></h4>
      if (block.variant === "label")
        return <p className={cn(base, "text-xs font-medium uppercase tracking-wide text-muted-foreground")}><InlineMarkdown text={block.content} /></p>
      if (block.variant === "caption")
        return <p className={cn(base, "text-xs text-muted-foreground")}><InlineMarkdown text={block.content} /></p>
      return <p className={cn(base, "text-sm")}><InlineMarkdown text={block.content} /></p>
    }

    // ── Note / Callout ────────────────────────────────────────────────────────
    case "note": {
      const level = block.level ?? "info"
      const cfg = NOTE_LAYOUT[level]
      const NoteIcon = NOTE_ICONS[level]
      // Demo: `info` notes omit a separate title row (only body copy).
      const showTitleRow = Boolean(block.title) && level !== "info"
      return (
        <div className="flex gap-2.5">
          <UIBlockLeadIcon
            Icon={NOTE_SHARED_LEAD_ICON}
            title="Bloque de nota o aviso; el estilo interno indica el tipo (info, éxito, advertencia…)."
          />
          <div
            className={cn(
              "flex min-w-0 flex-1 gap-3 rounded-lg border-l-4 p-3.5",
              cfg.border,
              cfg.bg,
            )}
          >
            <span className={cn("mt-0.5 shrink-0", cfg.iconColor)} aria-hidden>
              <NoteIcon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1 text-sm leading-relaxed">
              {showTitleRow ? (
                <p className={cn("mb-0.5 font-semibold", cfg.titleColor)}>{block.title}</p>
              ) : null}
              <MarkdownTextBlock
                content={block.content}
                className="text-foreground/90 prose-p:my-0 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5"
              />
            </div>
          </div>
        </div>
      )
    }

    // ── List ─────────────────────────────────────────────────────────────────
    case "list": {
      const Tag = block.ordered ? "ol" : "ul"
      const ListIcon = block.ordered ? ListOrdered : List
      return (
        <UIBlockWithLead icon={ListIcon}>
          <Tag className={cn("space-y-1 pl-5 text-sm text-foreground", block.ordered ? "list-decimal" : "list-disc")}>
            {block.items.map((item, i) => (
              <li key={i}><InlineMarkdown text={item} /></li>
            ))}
          </Tag>
        </UIBlockWithLead>
      )
    }

    // ── Table ─────────────────────────────────────────────────────────────────
    case "table": {
      const cap = block.caption?.trim()
      return (
        <UIBlockWithLead
          icon={Table2}
          label={cap || undefined}
          labelClassName="normal-case tracking-tight text-foreground"
        >
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {block.headers.map((h, i) => (
                      <th key={i} className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-semibold text-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri} className="transition-colors hover:bg-muted/30">
                      {row.map((cell, ci) => (
                        <td key={ci} className="whitespace-nowrap border-b border-border/60 px-3 py-2 text-foreground/90 last-of-type:border-0">
                          <InlineMarkdown text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </UIBlockWithLead>
      )
    }

    // ── Code ─────────────────────────────────────────────────────────────────
    case "code":
      return (
        <UIBlockWithLead icon={Code2}>
          <UIBlockCode block={block} />
        </UIBlockWithLead>
      )

    // ── Image ─────────────────────────────────────────────────────────────────
    case "image": {
      const cap = block.caption?.trim()
      const alt = block.alt?.trim()
      const captionBelow = cap || alt
      return (
        <UIBlockWithLead icon={ImageLucide}>
          <figure className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.src}
                alt={block.alt ?? ""}
                style={block.width ? { maxWidth: block.width } : undefined}
                className="w-full cursor-zoom-in object-cover"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (block.src) openN8nChatImageLightbox(block.src, block.alt ?? "")
                }}
              />
            </div>
            {captionBelow ? (
              <figcaption className="text-center text-xs leading-snug text-muted-foreground">
                {cap || alt}
              </figcaption>
            ) : null}
          </figure>
        </UIBlockWithLead>
      )
    }

    // ── Audio ─────────────────────────────────────────────────────────────────
    case "audio": {
      const lab = block.label?.trim()
      return (
        <UIBlockWithLead icon={Music}>
          <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={block.src} className="w-full rounded-md" />
            {lab ? <p className="text-xs font-medium leading-snug text-foreground">{lab}</p> : null}
          </div>
        </UIBlockWithLead>
      )
    }

    case "hidden-file": {
      const { message, kind } = summarizeHiddenFileBlock(block)
      const Icon = hiddenFileLeadIcon(kind)
      return (
        <div className="flex min-w-0 w-full gap-2.5">
          <UIBlockLeadIcon
            Icon={Icon}
            title="Adjunto procesado por el modelo; el contenido completo no se muestra aquí."
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 dark:bg-muted/15">
            <p className="text-sm font-medium leading-snug text-foreground">{message}</p>
            {block.label?.trim() ? (
              <p className="truncate text-xs text-muted-foreground" title={block.label}>
                {block.label}
              </p>
            ) : null}
          </div>
        </div>
      )
    }

    // ── File ─────────────────────────────────────────────────────────────────
    case "file":
      return (
        <a
          href={block.url}
          download={block.filename}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-2.5 no-underline"
        >
          <UIBlockLeadIcon Icon={Paperclip} />
          <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 transition-colors group-hover:bg-muted/70">
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2.5 dark:bg-background/40">
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              <span className="text-xs font-medium text-muted-foreground">Descargar archivo</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{block.filename}</p>
              {block.size ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {block.size >= 1024 * 1024
                    ? `${(block.size / 1024 / 1024).toFixed(1)} MB`
                    : `${(block.size / 1024).toFixed(1)} KB`}
                  {block.mimeType ? ` · ${block.mimeType}` : ""}
                </p>
              ) : null}
            </div>
          </div>
        </a>
      )

    // ── Email (borrador estilo redacción Gmail) ───────────────────────────────
    case "email":
      return <UIBlockEmail block={block} />

    // ── Buttons ───────────────────────────────────────────────────────────────
    case "buttons":
      return (
        <UIBlockWithLead icon={MousePointerClick}>
          <div className="copilot-ui-blocks-buttons-row flex flex-wrap gap-2.5">
          {block.items.map((btn: ButtonItem, i: number) => {
            const inactive = !actionsEnabled
            const effectivelyDisabled = btn.disabled || inactive
            const isLink = (btn.variant ?? "secondary") === "link"
            const cls = cn(
              "relative inline-flex items-center justify-center font-semibold tracking-tight",
              isLink
                ? "text-sm leading-snug"
                : "min-h-9 rounded-lg px-4 text-sm motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out",
              !isLink &&
                !effectivelyDisabled &&
                "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              effectivelyDisabled ? "cursor-not-allowed" : "cursor-pointer",
              "disabled:cursor-not-allowed",
              BTN_VARIANTS[btn.variant ?? "secondary"],
              effectivelyDisabled && "pointer-events-none opacity-45 saturate-50",
            )
            // DSL esperada:
            // - `action:url:https://...` (viene del ejemplo del agente)
            // - `url:https://...` (soporte legacy)
            if (
              btn.action.startsWith("action:url:") ||
              btn.action.startsWith("url:")
            ) {
              const href = btn.action.startsWith("action:url:")
                ? btn.action.slice("action:url:".length)
                : btn.action.slice("url:".length)
              if (effectivelyDisabled) {
                return (
                  <span key={i} className={cls} aria-disabled="true">
                    {btn.label}
                  </span>
                )
              }
              return (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                  {btn.label}
                </a>
              )
            }
            return (
              <button
                key={i}
                type="button"
                className={cls}
                disabled={effectivelyDisabled}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (effectivelyDisabled) return

                  // Solo intentamos enviar si el botón vive dentro del embed de n8n chat.
                  const chatRoot = (e.currentTarget as HTMLElement).closest(".n8n-chat")
                  if (!chatRoot) {
                    console.log("[UIBlock] button clicked (no .n8n-chat root found):", {
                      label: btn.label,
                      action: btn.action,
                    })
                    return
                  }

                  const input =
                    chatRoot.querySelector<HTMLTextAreaElement>(
                      '[data-test-id="chat-input"]',
                    ) ?? chatRoot.querySelector<HTMLTextAreaElement>("textarea.chat-input")
                  if (!input) return

                  // Requisito: al click usar el valor de `label` y enviar al chat.
                  const nextMessage = btn.label

                  const valueSetter = Object.getOwnPropertyDescriptor(
                    HTMLTextAreaElement.prototype,
                    "value",
                  )?.set
                  if (valueSetter) {
                    valueSetter.call(input, nextMessage)
                  } else {
                    input.value = nextMessage
                  }
                  input.dispatchEvent(new Event("input", { bubbles: true }))
                  input.dispatchEvent(new Event("change", { bubbles: true }))

                  // Enviar: preferimos click en el botón del widget; fallback con Enter.
                  const sendBtn =
                    chatRoot.querySelector<HTMLButtonElement>(
                      ".chat-input-send-button",
                    ) ?? chatRoot.querySelector<HTMLButtonElement>("button[type='submit']")

                  input.focus()
                  window.setTimeout(() => {
                    if (sendBtn && !sendBtn.disabled) {
                      sendBtn.click()
                      return
                    }
                    // Fallback: simula Enter en el textarea.
                    input.dispatchEvent(
                      new KeyboardEvent("keydown", {
                        key: "Enter",
                        code: "Enter",
                        bubbles: true,
                      }),
                    )
                  }, 0)
                }}
              >
                {btn.label}
              </button>
            )
          })}
          </div>
        </UIBlockWithLead>
      )

    // ── Divider ───────────────────────────────────────────────────────────────
    case "divider":
      return (
        <hr
          className="copilot-ui-block-divider-hr my-1 w-full border-0 border-t border-border/80"
          role="separator"
          aria-hidden
        />
      )

    // ── Admonition (collapsible) ───────────────────────────────────────────────
    case "admonition":
      return (
        <div className="flex gap-2.5">
          <UIBlockLeadIcon Icon={Layers} />
          <details
            className="group min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/20"
            open={block.open !== false}
          >
            {block.title ? (
              <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                  strokeWidth={1.75}
                  aria-hidden
                />
                {block.title}
              </summary>
            ) : (
              <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="text-muted-foreground">Expandir</span>
              </summary>
            )}
            <div className="flex min-w-0 flex-col divide-y divide-border/50 px-3.5 pb-3 pt-1">
              {block.children.map((child, ci) => (
                <div
                  key={`${ci}-${child.type}`}
                  className={cn(
                    "copilot-ui-blocks-section min-w-0 w-full py-2.5 first:pt-1 last:pb-0",
                    child.type === "divider" && "copilot-ui-blocks-section--divider",
                  )}
                >
                  <BlockRenderer
                    block={child}
                    renderTextAsMarkdown={renderTextAsMarkdown}
                    actionsEnabled={actionsEnabled}
                  />
                </div>
              ))}
            </div>
          </details>
        </div>
      )

    default:
      return null
  }
}

// ─── Public component ─────────────────────────────────────────────────────────

interface UIBlocksRendererProps {
  blocks: UIBlock[]
  className?: string
  /**
   * Cuando es true, los bloques `text` usan markdown completo (GFM), igual que el contenido
   * libre del agente en el chat.
   */
  renderTextAsMarkdown?: boolean
  /**
   * false desactiva los controles de `:::buttons` (p. ej. burbujas del asistente que ya no son la última).
   * @default true
   */
  actionsEnabled?: boolean
}

export function UIBlocksRenderer({
  blocks,
  className,
  renderTextAsMarkdown,
  actionsEnabled = true,
}: UIBlocksRendererProps) {
  if (blocks.length === 0) return null

  return (
    <div
      className={cn(
        "flex min-w-0 w-full flex-col divide-y divide-border/55 text-sm",
        className,
      )}
    >
      {blocks.map((block, i) => (
        <div
          key={`${i}-${block.type}`}
          className={cn(
            "copilot-ui-blocks-section min-w-0 w-full py-3.5 first:pt-0 last:pb-0",
            block.type === "divider" && "copilot-ui-blocks-section--divider",
          )}
        >
          <BlockRenderer
            block={block}
            renderTextAsMarkdown={renderTextAsMarkdown}
            actionsEnabled={actionsEnabled}
          />
        </div>
      ))}
    </div>
  )
}
