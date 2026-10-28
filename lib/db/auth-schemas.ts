/**
 * Entrada de `loginAction`. bcrypt solo usa los primeros 72 bytes de la clave: el tope evita que un
 * cuerpo enorme llegue a Better Auth.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import { z } from "zod"

export const loginInputSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(256),
})

export type LoginInput = z.infer<typeof loginInputSchema>
