/**
 * remark-directive only opens a container on `:::name` + line break.
 * Docusaurus-style `:::note Título` on one line becomes `:::note[Título]`.
 */
export function preprocessCopilotDirectiveTitles(source: string): string {
  // Only horizontal whitespace after the directive name — `\s` would include `\n`
  // and wrongly merge `:::table` + `headers:` or `:::tip` + body into one "title" line.
  return String(source ?? "").replace(
    /^:::([\w-]+)[ \t]+([^\n]+)$/gm,
    (line, type: string, rest: string) => {
      const r = rest.trim()
      if (!r || r === ":::") return line
      if (/^\[[\s\S]*\]$/.test(r)) return line
      const escaped = r.replace(/\\/g, "\\\\").replace(/\]/g, "\\]")
      return `:::${type}[${escaped}]`
    },
  )
}
