/**
 * highlight.js core + lenguajes usados en el copilot (selector + resaltado).
 * Evita `highlight.js/lib/common` (CJS con muchos require), que Turbopack
 * puede resolver mal en runtime (p. ej. bash.js no encontrado).
 */
import type { HLJSApi } from "highlight.js"
import hljs from "highlight.js/lib/core"
import bash from "highlight.js/lib/languages/bash"
import c from "highlight.js/lib/languages/c"
import cpp from "highlight.js/lib/languages/cpp"
import csharp from "highlight.js/lib/languages/csharp"
import css from "highlight.js/lib/languages/css"
import dockerfile from "highlight.js/lib/languages/dockerfile"
import go from "highlight.js/lib/languages/go"
import graphql from "highlight.js/lib/languages/graphql"
import java from "highlight.js/lib/languages/java"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import kotlin from "highlight.js/lib/languages/kotlin"
import markdown from "highlight.js/lib/languages/markdown"
import php from "highlight.js/lib/languages/php"
import plaintext from "highlight.js/lib/languages/plaintext"
import powershell from "highlight.js/lib/languages/powershell"
import python from "highlight.js/lib/languages/python"
import ruby from "highlight.js/lib/languages/ruby"
import rust from "highlight.js/lib/languages/rust"
import sql from "highlight.js/lib/languages/sql"
import swift from "highlight.js/lib/languages/swift"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import yaml from "highlight.js/lib/languages/yaml"

hljs.registerLanguage("bash", bash)
hljs.registerLanguage("c", c)
hljs.registerLanguage("cpp", cpp)
hljs.registerLanguage("csharp", csharp)
hljs.registerLanguage("css", css)
hljs.registerLanguage("dockerfile", dockerfile)
hljs.registerLanguage("go", go)
hljs.registerLanguage("graphql", graphql)
hljs.registerLanguage("html", xml)
hljs.registerLanguage("java", java)
hljs.registerLanguage("javascript", javascript)
/** Mismo gramática que JS; etiqueta separada para quien busca “Node”. */
hljs.registerLanguage("nodejs", javascript)
hljs.registerLanguage("json", json)
hljs.registerLanguage("kotlin", kotlin)
hljs.registerLanguage("markdown", markdown)
hljs.registerLanguage("php", php)
hljs.registerLanguage("plaintext", plaintext)
hljs.registerLanguage("powershell", powershell)
hljs.registerLanguage("python", python)
hljs.registerLanguage("ruby", ruby)
hljs.registerLanguage("rust", rust)
hljs.registerLanguage("sql", sql)
hljs.registerLanguage("swift", swift)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("yaml", yaml)

/**
 * Orden del combo de lenguajes (UI). Debe coincidir con lenguajes registrados arriba.
 */
export const COPILOT_HLJS_LANGUAGE_IDS = [
  "javascript",
  "nodejs",
  "typescript",
  "python",
  "java",
  "csharp",
  "c",
  "cpp",
  "go",
  "rust",
  "php",
  "ruby",
  "kotlin",
  "swift",
  "sql",
  "bash",
  "powershell",
  "json",
  "yaml",
  "html",
  "css",
  "graphql",
  "dockerfile",
  "markdown",
  "plaintext",
] as const

export type CopilotHljsLanguageId = (typeof COPILOT_HLJS_LANGUAGE_IDS)[number]

/** Alias comunes del agente / fences → id registrado en highlight.js. */
const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  node: "nodejs",
  nodejs: "nodejs",
  ts: "typescript",
  tsx: "typescript",
  cs: "csharp",
  "c#": "csharp",
  "c++": "cpp",
  cxx: "cpp",
  cc: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  yml: "yaml",
  sh: "bash",
  zsh: "bash",
  kt: "kotlin",
  kts: "kotlin",
  ps1: "powershell",
  pwsh: "powershell",
  vue: "html",
  rs: "rust",
  rb: "ruby",
}

/** Normaliza el atributo `language` del bloque :::code al lenguaje hljs más cercano. */
export function normalizeCopilotHljsLanguage(raw: string | undefined): string {
  const t = (raw ?? "").trim().toLowerCase()
  if (!t) return "plaintext"
  const candidate = LANG_ALIASES[t] ?? t
  if (hljs.getLanguage(candidate)) return candidate
  return "plaintext"
}

const hljsCopilot: HLJSApi = hljs

export default hljsCopilot
