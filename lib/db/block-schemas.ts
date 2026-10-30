/**
 * Entrada de las Server Actions de bloques. Tipos, enumerados, largos y los topes de las columnas de
 * `msp_app.block`, `block_financing` y `block_bank_rate`; lo demás (`name`/`project`/`domain`
 * obligatorios al crear, referencias existentes, código) sigue en el mapeo y el repositorio.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import { z } from "zod"
import { BANCOS } from "../financing.ts"
import { BLOCK_DOMAINS, BLOCK_USAGES, BlockError, MARKETS, QUARTERS, type BlockListParams } from "./block-list-mapping.ts"
import { INVALID_BLOCK, type BlockRequest } from "./block-mapping.ts"
import { MAX_PAGE_SIZE } from "./catalog-mapping.ts"
import { parseInput } from "./input.ts"

/** Proyectos por filtro: la UI manda uno; acota un `POST` armado a mano. */
export const MAX_PROJECT_FILTER = 500

const idSchema = z.union([z.number().int().positive(), z.string().trim().min(1).max(64)])

const filterValue = z
  .union([z.string().max(200), z.number().finite(), z.array(z.union([z.string().max(64), z.number().finite()])).max(MAX_PROJECT_FILTER)])
  .nullable()
  .optional()

// La UI también manda `id` y `displayValue`; Zod los descarta (claves desconocidas).
const advancedFilterSchema = z.object({
  field: z.string().max(50),
  operator: z.string().max(30),
  value: filterValue,
  value2: filterValue,
})

export const blockListParamsSchema = z
  .object({
    page: z.number().int().min(1).max(100_000).optional(),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    sort: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
    projectIds: z.array(z.string().max(64)).max(MAX_PROJECT_FILTER).optional(),
    region: z.enum(["GAM", "Interior"]).optional(),
    country: z.string().max(64).optional(),
    countryIso: z.string().max(8).optional(),
    domain: z.enum(BLOCK_DOMAINS).optional(),
    filters: z.record(z.unknown()).optional(),
    advancedFilters: z.array(advancedFilterSchema).max(50).optional(),
    filterLogic: z.enum(["AND", "OR"]).optional(),
  })
  .optional()

const text = (max: number) => z.string().max(max).nullable().optional()
const ref = idSchema.or(z.literal("")).nullable().optional()
const emptyOr = <T extends [string, ...string[]]>(values: T) => z.enum(values).or(z.literal("")).nullable().optional()
const count = z.number().int().min(0).max(2_147_483_647).nullable().optional()
// `numeric(10, 2)`: hasta 8 dígitos enteros.
const decimal = z.number().finite().min(-99_999_999.99).max(99_999_999.99)
const amount = decimal.nullable().optional()

/** `"YYYY-MM-DD"` de un día que existe (el `<input type="date">` del formulario); `""` vacía. */
const dateText = z
  .string()
  .refine((value) => {
    if (value === "") return true
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, "fecha inválida")
  .nullable()
  .optional()

/** Strapi devolvía cada componente con su `id` y lo rechazaba al recibirlo; acá se acepta y se descarta. */
const componentId = z.number().int().optional()

const bankRateSchema = z
  .object({ id: componentId, annualRatePercent: amount })
  .strict()
  .transform(({ id: _id, ...rate }) => rate)

const bankSchemas = Object.fromEntries(BANCOS.map((bank) => [bank, bankRateSchema.nullable().optional()])) as Record<
  (typeof BANCOS)[number],
  z.ZodOptional<z.ZodNullable<typeof bankRateSchema>>
>

const financingSchema = z
  .object({
    id: componentId,
    downPaymentPercent: amount,
    fractionalDownPayment: z.boolean().nullable().optional(),
    fractionalDownPaymentFHA: amount,
    fractionalInstallmentsOtherBanks: amount,
    minDownPaymentFHA: amount,
    minDownPaymentOtherBanks: amount,
    maxLoanTermYearsFHA: count,
    maxLoanTermYearsBanks: count,
    maxLoanTermYearsOwner: count,
    ...bankSchemas,
  })
  .strict()
  .transform(({ id: _id, ...financing }) => financing)

/** Sin claves desconocidas: un campo mal escrito no se ignora en silencio. Sin `code`: lo genera el servidor. */
export const blockRequestSchema = z
  .object({
    name: z.string().max(255).optional(),
    legacyId: text(100),
    phase: text(255),
    tower: text(255),
    sector: text(255),
    year: count,
    quarter: emptyOr([...QUARTERS]),
    collectionDate: dateText,
    startDate: dateText,
    deliveryDate: dateText,
    domain: z.enum(BLOCK_DOMAINS).optional(),
    market: emptyOr([...MARKETS]),
    blockUsage: emptyOr([...BLOCK_USAGES]),
    commercializationMonths: count,
    // Contadores: el formulario los manda y se aceptan para no romper `.strict()`, pero
    // `toBlockWriteData` no los escribe (los calcula `recalculateBlockCounters`).
    totalUnits: count,
    totalM2: amount,
    availableUnits: count,
    availableM2: amount,
    averagePriceUSD: amount,
    averageSizeM2: amount,
    averagePricePerM2USD: amount,
    averageInstallmentUSD: amount,
    averageIncomeUSD: amount,
    additionalParkingPriceUSD: amount,
    visitorParking: count,
    assignedParking: count,
    totalProjectParking: count,
    parkingForSale: count,
    project: ref,
    blockCategory: ref,
    blockFocus: ref,
    blockStatus: ref,
    financing: financingSchema.nullable().optional(),
  })
  .strict()

const invalidParams = (details: string[]) => new BlockError("Parámetros de bloques inválidos", details)
const invalidBlock = (details: string[]) => new BlockError(INVALID_BLOCK, details)

export function parseBlockListParams(value: unknown): BlockListParams | undefined {
  return parseInput(blockListParamsSchema, value, invalidParams)
}

export function parseBlockId(value: unknown): string | number {
  return parseInput(idSchema, value, invalidBlock)
}

export function parseBlockRequest(value: unknown): BlockRequest {
  return parseInput(blockRequestSchema, value, invalidBlock) as BlockRequest
}
