/**
 * Respuesta de las Server Actions de `lib/db/`. El error viaja como dato: en producción Next oculta
 * el mensaje de lo que se lanza, y la UI muestra `message` y `details`.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string; details?: string[] }

export function actionFailure(error: unknown, fallback: string): { ok: false; message: string; details?: string[] } {
  const details = (error as { details?: unknown } | null)?.details
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallback,
    ...(Array.isArray(details) ? { details: details.map(String) } : {}),
  }
}
