/**
 * Respuesta de las Server Actions de `lib/db/`. El error viaja como dato: en producción Next oculta
 * el mensaje de lo que se lanza, y la UI muestra `message` y `details`.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string; details?: string[] }

/**
 * Error pensado para el usuario: su `message` y sus `details` llegan al navegador tal cual. Cualquier
 * otro error (Prisma, `pg`, configuración) puede traer rol, host, SQL o rutas del servidor.
 */
export class PublicError extends Error {
  readonly details?: string[]

  constructor(message: string, details?: string[]) {
    super(message)
    this.name = "PublicError"
    if (details && details.length > 0) this.details = details
  }
}

export const DB_BUSY = "La base de datos está ocupada en este momento. Intenta de nuevo en unos segundos."

// P2037: el rol o el servidor de Postgres no aceptan más conexiones (53300 en `pg`).
const TOO_MANY_CONNECTIONS = new Set(["P2037", "53300"])

export function actionFailure(error: unknown, fallback: string): { ok: false; message: string; details?: string[] } {
  if (error instanceof PublicError) {
    return { ok: false, message: error.message, ...(error.details ? { details: [...error.details] } : {}) }
  }
  console.error(`[server-action] ${fallback}:`, error)
  const code = (error as { code?: unknown } | null)?.code
  return { ok: false, message: TOO_MANY_CONNECTIONS.has(String(code)) ? DB_BUSY : fallback }
}
