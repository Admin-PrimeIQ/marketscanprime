const DEFAULT_BASE = "https://n8n.primeiqlatam.com/webhook"

function baseUrl(): string {
  const raw =
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_PRIMEIQ_SESSION_API_BASE
      : undefined) ?? DEFAULT_BASE
  return raw.replace(/\/$/, "")
}

export type PrimeiqChatSession = {
  id: string
  name: string | null
  email: string
  created_at: string
  updated_at: string
}

export type PrimeiqChatSessionListResponse = {
  sessions: PrimeiqChatSession[]
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const t = await res.text()
    return t || res.statusText
  } catch {
    return res.statusText
  }
}

/** POST — crea sesión; el `id` devuelto es el que debe usar @n8n/chat / memoria. */
export async function createPrimeiqChatSession(body: {
  email: string
  name?: string
}): Promise<PrimeiqChatSession> {
  const res = await fetch(`${baseUrl()}/primeiq-chat-session-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim(),
      ...(body.name != null && body.name !== ""
        ? { name: body.name.trim() }
        : {}),
    }),
  })
  if (!res.ok) {
    throw new Error(`create session: ${res.status} ${await readErrorBody(res)}`)
  }
  return res.json() as Promise<PrimeiqChatSession>
}

/** GET — solo sesiones con active=true en el backend. */
export async function listPrimeiqChatSessions(
  email: string,
): Promise<PrimeiqChatSession[]> {
  const url = new URL(`${baseUrl()}/primeiq-chat-session-list`)
  url.searchParams.set("email", email.trim())
  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`list sessions: ${res.status} ${await readErrorBody(res)}`)
  }
  const data = (await res.json()) as PrimeiqChatSessionListResponse
  if (!data || !Array.isArray(data.sessions)) return []
  return data.sessions
}

/**
 * Renombrar sesión: POST. Body JSON `{ id, name, email }`.
 */
export async function renamePrimeiqChatSession(body: {
  id: string
  name: string
  email: string
}): Promise<void> {
  const res = await fetch(`${baseUrl()}/primeiq-chat-session-rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: body.id.trim(),
      name: body.name.trim(),
      email: body.email.trim(),
    }),
  })
  if (!res.ok) {
    throw new Error(`rename session: ${res.status} ${await readErrorBody(res)}`)
  }
}
