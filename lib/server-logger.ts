/**
 * server-logger.ts
 * Structured server-side logger for API operations.
 * Output is captured by Vercel Functions logs.
 *
 * Format:
 *   [strapi:GET]  /units?blockDocumentId=abc  user:42  →  200  342ms
 *   [strapi:POST] /units                       user:42  →  400  45ms  ERR: Invalid key
 *   [route:GET]   /api/exchange-rates          user:?   →  200  12ms  cache:hit
 */

export interface LogParams {
  /** Tag shown in brackets, e.g. "strapi:GET" or "route:POST" */
  tag: string
  /** Path being requested (without base URL) */
  path: string
  /** Identified user — from JWT id or "anon" */
  user: string
  /** HTTP status code or "SKIP" when request was intentionally skipped */
  status: number | "SKIP"
  /** Round-trip duration in milliseconds */
  durationMs: number
  /** Optional short detail (cache status, field name, record count…) */
  detail?: string
  /** Error message when status >= 400 or an exception occurred */
  error?: string
}

export function logApi(p: LogParams): void {
  const status =
    p.status === "SKIP"
      ? "SKIP "
      : p.status < 300
      ? `${p.status} OK `
      : `${p.status} ERR`

  const parts = [
    `[${p.tag.padEnd(12)}]`,
    p.path.padEnd(55),
    `user:${p.user.padEnd(6)}`,
    `→ ${status}`,
    `${String(p.durationMs).padStart(5)}ms`,
  ]

  if (p.detail) parts.push(`| ${p.detail}`)
  if (p.error)  parts.push(`| ERROR: ${p.error.slice(0, 200)}`)

  console.log(parts.join("  "))
}

/**
 * Decodes the user id from a Strapi JWT without verifying the signature.
 * Strapi v5 JWT payload: { id: number, iat: number, exp: number }
 */
export function userFromBearer(authHeader: string | null | undefined): string {
  if (!authHeader?.startsWith("Bearer ")) return "anon"
  try {
    const base64Payload = authHeader.slice(7).split(".")[1]
    const payload = JSON.parse(
      Buffer.from(base64Payload, "base64url").toString("utf8")
    ) as { id?: number | string }
    return String(payload.id ?? "?")
  } catch {
    return "?"
  }
}

// ── User email resolution ────────────────────────────────────────────────────
// The JWT only contains { id, iat, exp } — no email.
// We resolve email via /users/me on first sight of each user and cache it
// for the lifetime of the server process (no cost on subsequent requests).

const userEmailCache = new Map<string, string>()

/**
 * Resolves a user's email from their bearer token.
 * Makes one call to Strapi /users/me per unique user, then caches forever.
 * Falls back to the numeric id if the call fails.
 */
export async function resolveUserEmail(
  authHeader: string | null | undefined,
  strapiApiUrl: string
): Promise<string> {
  const userId = userFromBearer(authHeader)
  if (userId === "anon" || userId === "?") return userId

  const cached = userEmailCache.get(userId)
  if (cached) return cached

  try {
    const res = await fetch(`${strapiApiUrl}/users/me`, {
      headers: { Authorization: authHeader as string },
      cache: "no-store",
    })
    if (res.ok) {
      const data = (await res.json()) as { email?: string; username?: string }
      const label = data.email ?? data.username ?? `id:${userId}`
      userEmailCache.set(userId, label)
      return label
    }
  } catch {
    // fallthrough — log with numeric id
  }

  userEmailCache.set(userId, `id:${userId}`)
  return `id:${userId}`
}

/**
 * Returns a concise summary of a JSON request body for logging.
 * Truncates to avoid flooding logs.
 */
export function summariseBody(body: unknown): string {
  if (!body) return ""
  if (typeof body !== "object") return String(body).slice(0, 100)
  const obj = body as Record<string, unknown>
  // Unit batch: show how many fields are being updated
  if (Array.isArray(obj.data) || Array.isArray(body)) {
    const arr = Array.isArray(body) ? body : (obj.data as unknown[])
    return `${arr.length} items`
  }
  if (obj.data && typeof obj.data === "object") {
    const keys = Object.keys(obj.data as object)
    return keys.length <= 4
      ? `{${keys.join(", ")}}`
      : `{${keys.slice(0, 4).join(", ")}… +${keys.length - 4}}`
  }
  const keys = Object.keys(obj)
  return keys.length <= 4
    ? `{${keys.join(", ")}}`
    : `{${keys.slice(0, 4).join(", ")}… +${keys.length - 4}}`
}
