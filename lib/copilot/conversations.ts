export type CopilotConversation = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = "primeiq-copilot-conversations-v1"

function safeParse(raw: string | null): CopilotConversation[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(
      (x): x is CopilotConversation =>
        x != null &&
        typeof x === "object" &&
        typeof (x as CopilotConversation).id === "string" &&
        typeof (x as CopilotConversation).title === "string" &&
        typeof (x as CopilotConversation).createdAt === "number" &&
        typeof (x as CopilotConversation).updatedAt === "number"
    )
  } catch {
    return []
  }
}

export function loadCopilotConversations(): CopilotConversation[] {
  if (typeof window === "undefined") return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY)).sort(
    (a, b) => b.updatedAt - a.updatedAt
  )
}

export function saveCopilotConversations(list: CopilotConversation[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function upsertCopilotConversation(entry: CopilotConversation): CopilotConversation[] {
  const list = loadCopilotConversations()
  const i = list.findIndex((c) => c.id === entry.id)
  if (i >= 0) {
    list[i] = { ...list[i], ...entry, updatedAt: entry.updatedAt }
  } else {
    list.unshift(entry)
  }
  saveCopilotConversations(list)
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function removeCopilotConversation(id: string): CopilotConversation[] {
  const list = loadCopilotConversations().filter((c) => c.id !== id)
  saveCopilotConversations(list)
  return list
}

export function updateCopilotConversationTitle(
  id: string,
  title: string
): CopilotConversation[] {
  const now = Date.now()
  const list = loadCopilotConversations().map((c) =>
    c.id === id ? { ...c, title: title.trim() || c.title, updatedAt: now } : c
  )
  saveCopilotConversations(list)
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}
