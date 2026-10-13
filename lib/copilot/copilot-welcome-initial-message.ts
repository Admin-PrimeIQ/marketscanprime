import type { ButtonVariant } from "@/lib/copilot/ui-blocks-engine"

function escButtonLine(label: string): string {
  return label.replace(/\|/g, "·").replace(/\r?\n/g, " ").trim()
}

export type CopilotWelcomeButton = {
  label: string
  variant?: ButtonVariant
}

export type CopilotWelcomeMessageStrings = {
  lead: string
  quote: string
  scopeListMarkdown: string
  tip: string
  freeFormNote: string
  footer: string
  buttons: readonly CopilotWelcomeButton[]
}

/**
 * Un solo mensaje inicial: lead, blockquote, lista, tip, nota, botones y pie (bloques UI).
 */
export function buildCopilotWelcomeMessage(strings: CopilotWelcomeMessageStrings): string {
  const btnLines = strings.buttons.map((b) => {
    const v = (b.variant ?? "secondary").trim() || "secondary"
    return `- label: ${escButtonLine(b.label)} | action: action:welcome_starter | variant: ${v}`
  })
  const quote = strings.quote.trim().replace(/^>\s*/, "")
  return [
    strings.lead.trim(),
    "",
    `> ${quote}`,
    "",
    strings.scopeListMarkdown.trim(),
    "",
    ":::tip",
    strings.tip.trim(),
    ":::",
    "",
    ":::note{level=info}",
    strings.freeFormNote.trim(),
    ":::",
    "",
    ":::buttons",
    ...btnLines,
    ":::",
    "",
    ":::footer",
    strings.footer.trim(),
    ":::",
  ].join("\n")
}
