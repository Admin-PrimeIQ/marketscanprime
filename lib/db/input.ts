/**
 * Validación de la entrada de las Server Actions con Zod. Una Server Action se puede llamar con un
 * `POST` a mano, así que los tipos de TypeScript no garantizan nada en el servidor.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import type { z } from "zod"

/** `"name: máximo 255 caracteres"`, en español y sin repetir el valor recibido. */
export function issueText(issue: z.ZodIssue): string {
  const field = issue.path.length > 0 ? issue.path.join(".") : "valor"
  switch (issue.code) {
    case "too_big":
      return issue.type === "string"
        ? `${field}: máximo ${issue.maximum} caracteres`
        : `${field}: máximo ${issue.maximum}`
    case "too_small":
      if (issue.type === "string") {
        return Number(issue.minimum) <= 1 ? `${field}: es obligatorio` : `${field}: mínimo ${issue.minimum} caracteres`
      }
      return `${field}: mínimo ${issue.minimum}`
    case "invalid_type":
      return issue.received === "undefined" ? `${field}: es obligatorio` : `${field}: tipo inválido`
    default:
      return `${field}: valor inválido`
  }
}

/** Devuelve el valor validado (sin claves desconocidas) o lanza el error que arme `toError`. */
export function parseInput<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, toError: (details: string[]) => Error): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw toError(result.error.issues.map(issueText))
}
