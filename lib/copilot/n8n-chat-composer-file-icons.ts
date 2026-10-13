"use client"

import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  File,
  FileArchive,
  FileAudio2,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from "lucide-react"

type FileKind =
  | "image"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "code"
  | "archive"
  | "video"
  | "audio"
  | "default"

const ICON_COMMON = {
  size: 17,
  strokeWidth: 1.75,
  className: "primeiq-chat-file-type-icon__svg",
  "aria-hidden": true as const,
}

const chipRoots = new WeakMap<HTMLElement, Root>()

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
  "raw",
  "cr2",
  "nef",
  "arw",
])

const DOC_EXT = new Set(["doc", "docx", "odt", "rtf", "txt", "md", "markdown"])

const SHEET_EXT = new Set(["xls", "xlsx", "ods", "csv", "tsv"])

const PRES_EXT = new Set(["ppt", "pptx", "odp", "key"])

const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "rb",
  "php",
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "sql",
  "yaml",
  "yml",
  "json",
  "xml",
  "vue",
  "svelte",
  "sh",
  "bash",
  "zsh",
  "env",
  "toml",
  "ini",
  "graphql",
  "gql",
])

const ARCHIVE_EXT = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "lz4", "zst"])

const VIDEO_EXT = new Set(["mp4", "mov", "avi", "webm", "mkv", "m4v", "wmv", "flv", "mpeg", "mpg", "3gp"])

const AUDIO_EXT = new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "mid", "midi", "aiff", "alac"])

function fileExtension(filename: string): string {
  const base = filename.trim().split(/[/\\]/).pop() ?? ""
  const i = base.lastIndexOf(".")
  if (i <= 0 || i === base.length - 1) return ""
  return base.slice(i + 1).toLowerCase()
}

function classify(ext: string): { kind: FileKind; Icon: typeof File } {
  if (!ext) return { kind: "default", Icon: File }
  if (ext === "pdf") return { kind: "pdf", Icon: FileText }
  if (IMAGE_EXT.has(ext)) return { kind: "image", Icon: FileImage }
  if (DOC_EXT.has(ext)) return { kind: "document", Icon: FileText }
  if (SHEET_EXT.has(ext)) return { kind: "spreadsheet", Icon: FileSpreadsheet }
  if (PRES_EXT.has(ext)) return { kind: "presentation", Icon: Presentation }
  if (CODE_EXT.has(ext)) return { kind: "code", Icon: FileCode2 }
  if (ARCHIVE_EXT.has(ext)) return { kind: "archive", Icon: FileArchive }
  if (VIDEO_EXT.has(ext)) return { kind: "video", Icon: FileVideo }
  if (AUDIO_EXT.has(ext)) return { kind: "audio", Icon: FileAudio2 }
  return { kind: "default", Icon: File }
}

function cleanupChip(chip: HTMLElement): void {
  const root = chipRoots.get(chip)
  if (root) {
    try {
      root.unmount()
    } catch {
      /* noop */
    }
    chipRoots.delete(chip)
  }
  chip.querySelector(".primeiq-chat-file-type-icon")?.remove()
  delete chip.dataset.primeiqFileIcon
  delete chip.dataset.primeiqFileKind
}

function enhanceChip(chip: HTMLElement): void {
  if (chip.dataset.primeiqFileIcon === "1") return
  const nameEl = chip.querySelector(".chat-file-name")
  const name = nameEl?.textContent?.trim() ?? ""
  const ext = fileExtension(name)
  const { kind, Icon } = classify(ext)

  const mount = document.createElement("span")
  mount.className = "primeiq-chat-file-type-icon"
  chip.insertBefore(mount, chip.firstChild)

  const root = createRoot(mount)
  root.render(createElement(Icon, ICON_COMMON))
  chipRoots.set(chip, root)

  chip.dataset.primeiqFileIcon = "1"
  chip.dataset.primeiqFileKind = kind
}

function scanContainer(container: HTMLElement): void {
  for (const el of container.querySelectorAll<HTMLElement>('[data-test-id="chat-file"]')) {
    if (el.dataset.primeiqFileIcon === "1") continue
    enhanceChip(el)
  }
}

function handleRemoved(node: Node): void {
  if (!(node instanceof HTMLElement)) return
  if (node.matches('[data-test-id="chat-file"]')) cleanupChip(node)
  for (const el of node.querySelectorAll?.<HTMLElement>('[data-test-id="chat-file"]') ?? []) {
    cleanupChip(el)
  }
}

/**
 * Sustituye el icono genérico de @n8n/chat en los chips de adjunto del composer por iconos Lucide
 * según extensión (imagen, PDF, hoja, código, etc.).
 */
export function attachComposerFileTypeIcons(container: HTMLElement): () => void {
  let raf = 0
  const schedule = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      raf = 0
      scanContainer(container)
    })
  }

  scanContainer(container)

  const mo = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.removedNodes) handleRemoved(n)
    }
    schedule()
  })

  mo.observe(container, { childList: true, subtree: true })

  return () => {
    mo.disconnect()
    if (raf) cancelAnimationFrame(raf)
    for (const chip of container.querySelectorAll<HTMLElement>('[data-test-id="chat-file"][data-primeiq-file-icon="1"]')) {
      cleanupChip(chip)
    }
  }
}
