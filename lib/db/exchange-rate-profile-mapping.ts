/**
 * Reglas puras de los perfiles de tipo de cambio sobre Prisma: la fila de `exchange_rate_profile`
 * con sus monedas (`exchange_rate_profile_currency`, una fila por moneda) y sus proyectos vuelve con
 * la forma de `StrapiExchangeRateProfile` (`documentId` = `publicId`, monedas en el objeto
 * `currencies` del componente de Strapi), y el cuerpo de escritura de la UI se traduce a columnas.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import type {
  StrapiCurrenciesComponent,
  StrapiExchangeRateProfile,
  StrapiExchangeRateProfilesResponse,
} from "../api/strapi.ts"
import { PublicError } from "./action-result.ts"

/** Claves del componente `currencies` de Strapi; en `msp_app` son el enum `Currency` en mayúsculas. */
export const CURRENCY_KEYS = ["gtq", "mxn", "pab", "bzd", "crc", "nio", "hnl"] as const
export type CurrencyKey = (typeof CURRENCY_KEYS)[number]
export type CurrencyCode = Uppercase<CurrencyKey>

export const PROFILE_SORTABLE_FIELDS: ReadonlySet<string> = new Set(["id", "name", "code", "createdAt", "updatedAt"])
export const PROFILE_NULLABLE_SORT_FIELDS: ReadonlySet<string> = new Set(["code"])

export const PROFILE_NOT_FOUND = "El perfil de tipo de cambio no existe."

/** Error con el mismo contrato que los de `strapiClient`: `message` y, si hay, `details`. Llega al navegador. */
export class ExchangeRateProfileError extends PublicError {
  constructor(message: string, details?: string[]) {
    super(message, details)
    this.name = "ExchangeRateProfileError"
  }
}

export const profileError = (message: string) => new ExchangeRateProfileError(message)

/** `Decimal` de Prisma (o cualquier cosa con `toString`), número o `null`. */
export type DecimalLike = number | string | { toString(): string }

export interface ProfileCurrencyRow {
  currency: string
  buyRate: DecimalLike | null
  sellRate: DecimalLike | null
}

export interface ProfileProjectRow {
  id: number
  publicId: string
  code: string | null
  name: string
}

export interface ProfileRow {
  id: number
  publicId: string
  code: string | null
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  currencies?: ProfileCurrencyRow[]
  projects?: ProfileProjectRow[]
}

export function decimalToNumber(value: DecimalLike | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  const number = typeof value === "number" ? value : Number(value.toString())
  return Number.isFinite(number) ? number : undefined
}

/** Filas hijas → objeto `currencies` de Strapi. Sin filas, `undefined` (Strapi omitía el componente vacío). */
export function toCurrenciesComponent(rows: ProfileCurrencyRow[] | undefined): StrapiCurrenciesComponent | undefined {
  if (!rows || rows.length === 0) return undefined
  const byKey = new Map(rows.map((row) => [row.currency.toLowerCase(), row]))
  const out: StrapiCurrenciesComponent = {}
  for (const key of CURRENCY_KEYS) {
    const row = byKey.get(key)
    if (!row) continue
    const entry: { buyRate?: number; sellRate?: number } = {}
    const buyRate = decimalToNumber(row.buyRate)
    const sellRate = decimalToNumber(row.sellRate)
    if (buyRate !== undefined) entry.buyRate = buyRate
    if (sellRate !== undefined) entry.sellRate = sellRate
    out[key] = entry
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function toExchangeRateProfile(row: ProfileRow): StrapiExchangeRateProfile {
  const profile: StrapiExchangeRateProfile = {
    id: row.id,
    documentId: row.publicId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
  if (row.code !== null) profile.code = row.code
  if (row.description !== null) profile.description = row.description
  const currencies = toCurrenciesComponent(row.currencies)
  if (currencies) profile.currencies = currencies
  profile.projects = (row.projects ?? []).map((project) => ({
    id: project.id,
    documentId: project.publicId,
    name: project.name,
    ...(project.code !== null ? { code: project.code } : {}),
  }))
  return profile
}

export function toExchangeRateProfileListResponse(
  rows: ProfileRow[],
  total: number,
  pagination: { page: number; pageSize: number },
): StrapiExchangeRateProfilesResponse {
  return {
    data: rows.map(toExchangeRateProfile),
    meta: {
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
        total,
      },
    },
  }
}

/** Equivale a `filters[$or]` de `name`/`code`/`description` con `$containsi` en Strapi. */
export function buildProfileSearch(search?: string) {
  const term = search?.trim()
  if (!term) return {}
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" as const } },
      { code: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
    ],
  }
}

export interface CurrencyWriteRow {
  currency: CurrencyCode
  buyRate: number | null
  sellRate: number | null
}

/**
 * Objeto `currencies` → filas hijas. `undefined` deja las monedas como están; `null` las borra todas.
 * Una moneda sin ninguna de las dos tasas no se guarda, igual que `sanitizeCurrenciesComponentForWrite`.
 */
export function toCurrencyRows(currencies: StrapiCurrenciesComponent | null | undefined): CurrencyWriteRow[] | undefined {
  if (currencies === undefined) return undefined
  if (currencies === null) return []
  const rows: CurrencyWriteRow[] = []
  for (const key of CURRENCY_KEYS) {
    const entry = currencies[key]
    if (!entry || typeof entry !== "object") continue
    const buyRate = typeof entry.buyRate === "number" ? entry.buyRate : null
    const sellRate = typeof entry.sellRate === "number" ? entry.sellRate : null
    if (buyRate === null && sellRate === null) continue
    rows.push({ currency: key.toUpperCase() as CurrencyCode, buyRate, sellRate })
  }
  return rows
}

export type ProjectRef = string | number
export type ProjectLinks = ProjectRef[] | { connect?: ProjectRef[]; disconnect?: ProjectRef[] }

export interface ExchangeRateProfileRequest {
  name?: string
  code?: string | null
  description?: string | null
  currencies?: StrapiCurrenciesComponent | null
  projects?: ProjectLinks
}

export interface ProfileWriteData {
  name?: string
  code?: string | null
  description?: string | null
}

/** `undefined` deja el campo como está (igual que omitirlo en el `PUT` de Strapi); `""` o `null` lo vacían. */
function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = String(value).trim()
  return text === "" ? null : text
}

export function toProfileWriteData(request: ExchangeRateProfileRequest, mode: "create" | "update"): ProfileWriteData {
  const data: ProfileWriteData = {}
  const name = typeof request?.name === "string" ? request.name.trim() : ""
  if (name) data.name = name
  else if (mode === "create" || request?.name !== undefined) {
    throw new ExchangeRateProfileError("Datos del perfil inválidos", ["name: es obligatorio"])
  }
  const code = optionalText(request?.code)
  const description = optionalText(request?.description)
  if (code !== undefined) data.code = code
  if (description !== undefined) data.description = description
  return data
}

/**
 * Proyectos a vincular y desvincular. Un arreglo reemplaza la lista (`replace`: al editar, los que
 * estaban y no vienen se desvinculan). `{ connect, disconnect }` cambia solo los nombrados. Un mismo
 * proyecto en las dos listas es un error.
 */
export function resolveProjectLinks(links: ProjectLinks | undefined): {
  connect: ProjectRef[]
  disconnect: ProjectRef[]
  replace: boolean
} {
  if (links === undefined) return { connect: [], disconnect: [], replace: false }
  if (Array.isArray(links)) return { connect: links, disconnect: [], replace: true }
  const connect = links.connect ?? []
  const disconnect = links.disconnect ?? []
  const connectKeys = new Set(connect.map((ref) => String(ref).trim()))
  const repeated = disconnect.filter((ref) => connectKeys.has(String(ref).trim())).map(String)
  if (repeated.length > 0) {
    throw new ExchangeRateProfileError("Un proyecto no se puede vincular y desvincular a la vez", repeated)
  }
  return { connect, disconnect, replace: false }
}

/**
 * Fila del perfil para `audit_log`: columnas, monedas (tasas en texto, sin perder precisión) y los
 * `publicId` de los proyectos vinculados, ordenados para que el antes y el después se comparen fácil.
 */
export function toProfileAuditRow(row: ProfileRow) {
  return {
    id: row.id,
    publicId: row.publicId,
    code: row.code,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    currencies: (row.currencies ?? [])
      .map((currency) => ({
        currency: currency.currency,
        buyRate: currency.buyRate === null ? null : currency.buyRate.toString(),
        sellRate: currency.sellRate === null ? null : currency.sellRate.toString(),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    projects: (row.projects ?? []).map((project) => project.publicId).sort(),
  }
}

/** Traduce los errores conocidos de Prisma; el resto se propaga tal cual. */
export function toProfileError(error: unknown): unknown {
  if (error instanceof PublicError) return error
  const code = (error as { code?: unknown } | null)?.code
  if (code === "P2003") return new ExchangeRateProfileError("No se puede eliminar: el perfil está en uso.")
  if (code === "P2025") return new ExchangeRateProfileError(PROFILE_NOT_FOUND)
  return error
}
