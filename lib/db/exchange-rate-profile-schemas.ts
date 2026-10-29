/**
 * Entrada de las Server Actions de perfiles de tipo de cambio. Tipos, largos y topes; lo demás
 * (name obligatorio al crear, proyectos existentes) sigue en el mapeo y el repositorio.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import { z } from "zod"
import { MAX_PAGE_SIZE } from "./catalog-mapping.ts"
import { ExchangeRateProfileError, type ExchangeRateProfileRequest } from "./exchange-rate-profile-mapping.ts"
import { parseInput } from "./input.ts"

/** Proyectos por escritura: holgado sobre los ~1020 de hoy, pero acota un `POST` armado a mano. */
export const MAX_PROJECT_REFS = 5000

const idSchema = z.union([z.number().int().positive(), z.string().trim().min(1).max(64)])

// `numeric(18, 8)`: hasta 10 dígitos enteros.
const rate = z.number().finite().positive().max(9_999_999_999).nullable().optional()

// Sin `id`: la UI lo mandaba cuando venía de Strapi y Zod lo descarta (claves desconocidas).
const currencyEntry = z.object({ buyRate: rate, sellRate: rate }).nullable().optional()

const currenciesSchema = z
  .object({
    gtq: currencyEntry,
    mxn: currencyEntry,
    pab: currencyEntry,
    bzd: currencyEntry,
    crc: currencyEntry,
    nio: currencyEntry,
    hnl: currencyEntry,
  })
  .nullable()
  .optional()

const refsSchema = z.array(idSchema).max(MAX_PROJECT_REFS)

const projectsSchema = z
  .union([refsSchema, z.object({ connect: refsSchema.optional(), disconnect: refsSchema.optional() })])
  .optional()

export const profileRequestSchema = z.object({
  name: z.string().max(255).optional(),
  code: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  currencies: currenciesSchema,
  projects: projectsSchema,
})

export const profileListParamsSchema = z
  .object({
    page: z.number().int().min(1).max(100_000).optional(),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    sort: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
  })
  .optional()

export type ProfileListParams = z.infer<typeof profileListParamsSchema>

const invalid = (details: string[]) => new ExchangeRateProfileError("Datos del perfil inválidos", details)

export function parseProfileId(value: unknown): string | number {
  return parseInput(idSchema, value, invalid)
}

export function parseProfileListParams(value: unknown): ProfileListParams {
  return parseInput(profileListParamsSchema, value, invalid)
}

export function parseProfileRequest(value: unknown): ExchangeRateProfileRequest {
  const parsed = parseInput(profileRequestSchema, value, invalid)
  const currencies = parsed.currencies
  if (currencies) {
    // `null` por moneda equivale a no mandarla.
    for (const key of Object.keys(currencies) as Array<keyof typeof currencies>) {
      if (currencies[key] === null) delete currencies[key]
    }
  }
  return parsed as ExchangeRateProfileRequest
}
