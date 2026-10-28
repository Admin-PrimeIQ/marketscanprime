/**
 * Límite de intentos de login del backend `prisma`. Reglas puras: claves, límites y la decisión a
 * partir del contador que devuelve la base (`lib/db/login-throttle.ts`).
 *
 * Cada intento suma antes de comprobar la clave, así que una ráfaga en paralelo no pasa del límite;
 * el login correcto borra el contador de la cuenta y le resta uno al de la IP.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

export interface ThrottleLimit {
  /** Intentos permitidos dentro de la ventana; el siguiente bloquea. */
  max: number
  windowMs: number
  lockMs: number
}

const MINUTE = 60_000

/** Por cuenta: protege la clave de una persona aunque el atacante cambie de IP. */
export const ACCOUNT_LIMIT: ThrottleLimit = { max: 5, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE }

/** Por IP: más alto, porque una oficina comparte la misma IP de salida. */
export const IP_LIMIT: ThrottleLimit = { max: 20, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE }

export interface ThrottleKeys {
  account: string
  ip: string
}

/** El identificador se normaliza como lo compara el login (sin espacios y en minúsculas). */
export function throttleKeys(identifier: string, ip: string): ThrottleKeys {
  return { account: `acct:${identifier.trim().toLowerCase()}`, ip: `ip:${ip.trim() || "unknown"}` }
}

type HeaderReader = { get(name: string): string | null }

/** En Vercel, `x-real-ip` y el primer valor de `x-forwarded-for` son la IP del cliente. En local no vienen. */
export function clientIp(headers: HeaderReader): string {
  const real = headers.get("x-real-ip")?.trim()
  if (real) return real
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || "unknown"
}

/** Estado de una clave después de sumar el intento (lo que devuelve el `RETURNING` del repositorio). */
export interface ThrottleHit {
  failCount: number
  lockedUntil: Date | null
}

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number; lockUntil?: Date }

/**
 * Bloqueada mientras `lockedUntil` siga en el futuro. Si el intento recién sumado pasa del máximo,
 * se rechaza y `lockUntil` dice hasta cuándo bloquear la clave.
 */
export function decide(hit: ThrottleHit, now: Date, limit: ThrottleLimit): ThrottleDecision {
  if (hit.lockedUntil && hit.lockedUntil.getTime() > now.getTime()) {
    return { allowed: false, retryAfterMs: hit.lockedUntil.getTime() - now.getTime() }
  }
  if (hit.failCount > limit.max) {
    return { allowed: false, retryAfterMs: limit.lockMs, lockUntil: new Date(now.getTime() + limit.lockMs) }
  }
  return { allowed: true }
}

/** Cuenta e IP: basta con que una rechace; se informa la espera más larga. */
export function combineDecisions(...decisions: ThrottleDecision[]): ThrottleDecision {
  let retryAfterMs = 0
  for (const decision of decisions) {
    if (!decision.allowed) retryAfterMs = Math.max(retryAfterMs, decision.retryAfterMs)
  }
  return retryAfterMs > 0 ? { allowed: false, retryAfterMs } : { allowed: true }
}

export function tooManyAttemptsMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / MINUTE))
  return `Demasiados intentos de inicio de sesión. Intenta de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`
}
