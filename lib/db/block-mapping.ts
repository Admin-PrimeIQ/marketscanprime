/**
 * Reglas puras del detalle y la escritura de bloques sobre Prisma (`getBlockById`, `createBlock`,
 * `updateBlock`): la fila vuelve con la forma de `StrapiBlock`, con el financiamiento como el
 * componente `financing.financing` (nueve términos y un espacio por banco con el que se trabaja), y
 * el cuerpo de `components/blocks/block-form.tsx` se traduce a columnas, referencias y filas de
 * `block_financing` / `block_bank_rate`.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import type { BlockDomain, StrapiBlock } from "../api/strapi.ts"
import { BANCOS, type BancoKey, type BlockFinancing } from "../financing.ts"
import { PublicError } from "./action-result.ts"
import { BlockError, toDateOnly, toStrapiBlock, type BlockListRow } from "./block-list-mapping.ts"
import { decimalToNumber, type DecimalLike } from "./exchange-rate-profile-mapping.ts"

export const BLOCK_NOT_FOUND = "El bloque no existe."
export const MISSING_REFERENCES = "Hay referencias que no existen en la base nueva"
export const INVALID_BLOCK = "Datos del bloque inválidos"
export const DUPLICATE_BLOCK_CODE = "Ya existe un bloque con ese código; intenta guardar de nuevo."
export const DOMAIN_LOCKED = "No se puede cambiar el tipo de inmueble de un bloque que ya tiene unidades."
export const DUPLICATE_LEGACY_ID = "Ya existe otro bloque con ese ID legacy."

export type BlockRef = string | number
export type Quarter = "T1" | "T2" | "T3" | "T4" | "S1" | "S2"
export type Market = "Primary" | "Secondary"
export type BlockUsage = "Venta" | "Renta"

/** Relación del cuerpo (nombre de Strapi) → columna de `msp_app.block`. */
export const BLOCK_RELATIONS = {
  project: "projectId",
  blockCategory: "categoryId",
  blockFocus: "focusId",
  blockStatus: "statusId",
} as const
export type BlockRelation = keyof typeof BLOCK_RELATIONS

/** Los nueve términos del componente (nombre de Strapi) → columna de `block_financing`. */
export const FINANCING_TERMS = {
  downPaymentPercent: "downPaymentPercent",
  fractionalDownPayment: "fractionalDownPayment",
  fractionalDownPaymentFHA: "fractionalDownPaymentFha",
  fractionalInstallmentsOtherBanks: "fractionalInstallmentsOtherBanks",
  minDownPaymentFHA: "minDownPaymentFha",
  minDownPaymentOtherBanks: "minDownPaymentOtherBanks",
  maxLoanTermYearsFHA: "maxLoanTermYearsFha",
  maxLoanTermYearsBanks: "maxLoanTermYearsBanks",
  maxLoanTermYearsOwner: "maxLoanTermYearsOwner",
} as const
type FinancingTerm = keyof typeof FINANCING_TERMS
type FinancingColumn = (typeof FINANCING_TERMS)[FinancingTerm]

export interface FinancingRow {
  downPaymentPercent: DecimalLike | null
  fractionalDownPayment: boolean | null
  fractionalDownPaymentFha: DecimalLike | null
  fractionalInstallmentsOtherBanks: DecimalLike | null
  minDownPaymentFha: DecimalLike | null
  minDownPaymentOtherBanks: DecimalLike | null
  maxLoanTermYearsFha: number | null
  maxLoanTermYearsBanks: number | null
  maxLoanTermYearsOwner: number | null
}

export interface BankRateRow {
  bank: string
  annualRatePercent: DecimalLike | null
}

export interface BlockDetailRow extends BlockListRow {
  financing: FinancingRow | null
  bankRates: BankRateRow[]
}

const BANK_ORDER = new Map<string, number>(BANCOS.map((bank, index) => [bank, index]))
const byBankOrder = (a: { bank: string }, b: { bank: string }) => (BANK_ORDER.get(a.bank) ?? 99) - (BANK_ORDER.get(b.bank) ?? 99)

/**
 * Filas → componente `financing.financing`. Sin fila de financiamiento, `null` (el interruptor
 * apagado). Un banco está presente solo si tiene fila; su tasa puede ser `null`.
 */
export function fromFinancingRows(financing: FinancingRow | null, bankRates: ReadonlyArray<BankRateRow>): BlockFinancing | null {
  if (!financing) return null
  const out: Record<string, unknown> = {
    downPaymentPercent: decimalToNumber(financing.downPaymentPercent) ?? null,
    fractionalDownPayment: financing.fractionalDownPayment,
    fractionalDownPaymentFHA: decimalToNumber(financing.fractionalDownPaymentFha) ?? null,
    fractionalInstallmentsOtherBanks: decimalToNumber(financing.fractionalInstallmentsOtherBanks) ?? null,
    minDownPaymentFHA: decimalToNumber(financing.minDownPaymentFha) ?? null,
    minDownPaymentOtherBanks: decimalToNumber(financing.minDownPaymentOtherBanks) ?? null,
    maxLoanTermYearsFHA: financing.maxLoanTermYearsFha,
    maxLoanTermYearsBanks: financing.maxLoanTermYearsBanks,
    maxLoanTermYearsOwner: financing.maxLoanTermYearsOwner,
  }
  for (const rate of [...bankRates].sort(byBankOrder)) {
    out[rate.bank] = { annualRatePercent: decimalToNumber(rate.annualRatePercent) ?? null }
  }
  return out as BlockFinancing
}

/** Lo que poblaba `getBlockById` de Strapi: lo del listado más el financiamiento con sus bancos. */
export function toStrapiBlockDetail(row: BlockDetailRow): StrapiBlock {
  return { ...toStrapiBlock(row), financing: fromFinancingRows(row.financing, row.bankRates) }
}

/** Cuerpo de `createBlock`/`updateBlock` (sin `code`: lo genera el servidor), con `null` para vaciar. */
export interface BlockRequest {
  name?: string
  legacyId?: string | null
  phase?: string | null
  tower?: string | null
  sector?: string | null
  year?: number | null
  quarter?: Quarter | "" | null
  collectionDate?: string | null
  startDate?: string | null
  deliveryDate?: string | null
  domain?: BlockDomain
  market?: Market | "" | null
  blockUsage?: BlockUsage | "" | null
  commercializationMonths?: number | null
  /**
   * Contadores del bloque: el formulario los manda, pero no se escriben. Solo los escribe
   * `recalculateBlockCounters` (block-counters.ts) al guardar unidades; aceptarlos aquí dejaría que
   * un formulario abierto antes los regrese a valores viejos.
   */
  totalUnits?: number | null
  totalM2?: number | null
  availableUnits?: number | null
  availableM2?: number | null
  averagePriceUSD?: number | null
  averageSizeM2?: number | null
  averagePricePerM2USD?: number | null
  averageInstallmentUSD?: number | null
  averageIncomeUSD?: number | null
  assignedParking?: number | null
  additionalParkingPriceUSD?: number | null
  visitorParking?: number | null
  totalProjectParking?: number | null
  parkingForSale?: number | null
  project?: BlockRef | null
  blockCategory?: BlockRef | null
  blockFocus?: BlockRef | null
  blockStatus?: BlockRef | null
  financing?: BlockFinancing | null
}

export interface BlockScalarData {
  name?: string
  legacyId?: string | null
  phase?: string | null
  tower?: string | null
  sector?: string | null
  year?: number | null
  quarter?: Quarter | null
  collectionDate?: Date | null
  startDate?: Date | null
  deliveryDate?: Date | null
  domain?: BlockDomain
  market?: Market | null
  blockUsage?: BlockUsage | null
  commercializationMonths?: number | null
  additionalParkingPriceUsd?: number | null
  visitorParking?: number | null
  totalProjectParking?: number | null
  parkingForSale?: number | null
}

export interface FinancingWrite {
  /** Los nueve, siempre: el componente se reemplaza entero, un término ausente queda vacío. */
  terms: Record<FinancingColumn, number | boolean | null>
  bankRates: Array<{ bank: BancoKey; annualRatePercent: number | null }>
}

export interface BlockWriteData {
  scalars: BlockScalarData
  /** `null` desvincula; las ausentes no cambian. */
  relations: Partial<Record<BlockRelation, BlockRef | null>>
  /** Objeto: reemplaza términos y bancos; `null`: borra el financiamiento; `undefined`: no lo toca. */
  financing?: FinancingWrite | null
}

const TEXT_FIELDS = ["legacyId", "phase", "tower", "sector"] as const
const ENUM_FIELDS = ["quarter", "market", "blockUsage"] as const
const DATE_FIELDS = ["collectionDate", "startDate", "deliveryDate"] as const
/** Mismo nombre en el cuerpo y en la columna. Sin contadores: ver `BlockRequest`. */
const VALUE_FIELDS = ["year", "commercializationMonths", "visitorParking", "totalProjectParking", "parkingForSale"] as const
const RENAMED_FIELDS = {
  additionalParkingPriceUSD: "additionalParkingPriceUsd",
} as const

/** `undefined` deja el campo como está (igual que omitirlo en el `PUT` de Strapi); `""` o `null` lo vacían. */
function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = String(value).trim()
  return text === "" ? null : text
}

function optionalRef(value: BlockRef | null | undefined): BlockRef | null | undefined {
  if (value === undefined || value === null || typeof value === "number") return value
  const text = value.trim()
  return text === "" ? null : text
}

/** `"YYYY-MM-DD"` → medianoche UTC, que es como Prisma lee y escribe una columna `date`. */
function optionalDate(value: string | null | undefined): Date | null | undefined {
  const text = optionalText(value)
  if (text === undefined || text === null) return text
  return new Date(`${text.slice(0, 10)}T00:00:00.000Z`)
}

/** Componente → filas. Las claves `id` (las devolvía Strapi) y los bancos en `null` se ignoran. */
export function toFinancingWrite(financing: BlockFinancing): FinancingWrite {
  const terms = {} as FinancingWrite["terms"]
  for (const [term, column] of Object.entries(FINANCING_TERMS) as Array<[FinancingTerm, FinancingColumn]>) {
    terms[column] = (financing[term] as number | boolean | null | undefined) ?? null
  }
  const bankRates: FinancingWrite["bankRates"] = []
  for (const bank of BANCOS) {
    const rate = financing[bank]
    if (rate === null || rate === undefined) continue
    bankRates.push({ bank, annualRatePercent: rate.annualRatePercent ?? null })
  }
  return { terms, bankRates }
}

/**
 * Al crear, `name`, `project` y `domain` son obligatorios (sin proyecto ni tipo de inmueble el bloque
 * no cabe en `msp_app.block`); al editar, `name` no se puede vaciar ni el proyecto quitar.
 */
export function toBlockWriteData(request: BlockRequest, mode: "create" | "update"): BlockWriteData {
  const scalars: BlockScalarData = {}
  const problems: string[] = []

  const name = typeof request.name === "string" ? request.name.trim() : ""
  if (name) scalars.name = name
  else if (mode === "create" || request.name !== undefined) problems.push("name: es obligatorio")

  const project = optionalRef(request.project)
  if (mode === "create" ? !project : project === null) problems.push("project: es obligatorio")

  if (request.domain !== undefined) scalars.domain = request.domain
  else if (mode === "create") problems.push("domain: es obligatorio")

  if (problems.length > 0) throw new BlockError(INVALID_BLOCK, problems)

  for (const field of TEXT_FIELDS) {
    const value = optionalText(request[field])
    if (value !== undefined) scalars[field] = value
  }
  for (const field of ENUM_FIELDS) {
    const value = request[field]
    if (value !== undefined) (scalars as Record<string, unknown>)[field] = value === "" ? null : value
  }
  for (const field of DATE_FIELDS) {
    const value = optionalDate(request[field])
    if (value !== undefined) scalars[field] = value
  }
  for (const field of VALUE_FIELDS) {
    const value = request[field]
    if (value !== undefined) scalars[field] = value
  }
  for (const [field, column] of Object.entries(RENAMED_FIELDS) as Array<[keyof typeof RENAMED_FIELDS, keyof BlockScalarData]>) {
    const value = request[field]
    if (value !== undefined) (scalars as Record<string, unknown>)[column] = value
  }

  const relations: BlockWriteData["relations"] = {}
  for (const relation of Object.keys(BLOCK_RELATIONS) as BlockRelation[]) {
    const ref = optionalRef(request[relation])
    if (ref !== undefined) relations[relation] = ref
  }

  const write: BlockWriteData = { scalars, relations }
  if (request.financing === null) write.financing = null
  else if (request.financing !== undefined) write.financing = toFinancingWrite(request.financing)
  return write
}

/**
 * El tipo de inmueble decide las tablas del warehouse a las que va el bloque en el push y la tabla
 * hija de sus unidades (`unit_housing` / `unit_office` / `unit_industrial`): con unidades no cambia.
 */
export function domainChangeProblem(current: string, requested: BlockDomain | undefined, unitCount: number): string | null {
  if (requested === undefined || requested === current || unitCount === 0) return null
  return DOMAIN_LOCKED
}

/**
 * `legacyId` que hay que buscar repetido antes de guardar, o `null` si no hace falta. El push une el
 * bloque con su fila de `housing_universe` por ese valor y salta los repetidos, así que uno nuevo o
 * cambiado no puede chocar con otro bloque. Los repetidos que ya existen no se revisan mientras el
 * valor no cambie, para no bloquear otras ediciones. `stored` es `undefined` al crear.
 */
export function legacyIdToCheck(requested: string | null | undefined, stored?: string | null): string | null {
  if (requested === undefined || requested === null) return null
  return requested === stored ? null : requested
}

const decimalText = (value: DecimalLike | null) => (value === null ? null : value.toString())

/** Lo que `audit_log` necesita de la fila: columnas, ids de relaciones, financiamiento y bancos. */
export interface BlockAuditSource {
  id: number
  publicId: string
  code: string | null
  name: string | null
  legacyId: string | null
  projectId: number
  domain: string
  quarter: string | null
  market: string | null
  blockUsage: string | null
  phase: string | null
  tower: string | null
  sector: string | null
  year: number | null
  collectionDate: Date | null
  startDate: Date | null
  deliveryDate: Date | null
  commercializationMonths: number | null
  totalUnits: number | null
  totalM2: DecimalLike | null
  availableUnits: number | null
  availableM2: DecimalLike | null
  visitorParking: number | null
  assignedParking: number | null
  totalProjectParking: number | null
  parkingForSale: number | null
  migNumber: number | null
  averagePriceUsd: DecimalLike | null
  averageSizeM2: DecimalLike | null
  averagePricePerM2Usd: DecimalLike | null
  averageInstallmentUsd: DecimalLike | null
  averageIncomeUsd: DecimalLike | null
  additionalParkingPriceUsd: DecimalLike | null
  categoryId: number | null
  focusId: number | null
  statusId: number | null
  createdAt: Date
  updatedAt: Date
  financing: FinancingRow | null
  bankRates: BankRateRow[]
}

/**
 * Fila del bloque para `audit_log`: columnas (decimales en texto, sin perder precisión; fechas
 * `YYYY-MM-DD`), ids de las relaciones, los nueve términos y los bancos en el orden de `BANCOS`.
 */
export function toBlockAuditRow(row: BlockAuditSource) {
  const financing = row.financing
  return {
    id: row.id,
    publicId: row.publicId,
    code: row.code,
    name: row.name,
    legacyId: row.legacyId,
    projectId: row.projectId,
    domain: row.domain,
    quarter: row.quarter,
    market: row.market,
    blockUsage: row.blockUsage,
    phase: row.phase,
    tower: row.tower,
    sector: row.sector,
    year: row.year,
    collectionDate: toDateOnly(row.collectionDate),
    startDate: toDateOnly(row.startDate),
    deliveryDate: toDateOnly(row.deliveryDate),
    commercializationMonths: row.commercializationMonths,
    totalUnits: row.totalUnits,
    totalM2: decimalText(row.totalM2),
    availableUnits: row.availableUnits,
    availableM2: decimalText(row.availableM2),
    visitorParking: row.visitorParking,
    assignedParking: row.assignedParking,
    totalProjectParking: row.totalProjectParking,
    parkingForSale: row.parkingForSale,
    migNumber: row.migNumber,
    averagePriceUsd: decimalText(row.averagePriceUsd),
    averageSizeM2: decimalText(row.averageSizeM2),
    averagePricePerM2Usd: decimalText(row.averagePricePerM2Usd),
    averageInstallmentUsd: decimalText(row.averageInstallmentUsd),
    averageIncomeUsd: decimalText(row.averageIncomeUsd),
    additionalParkingPriceUsd: decimalText(row.additionalParkingPriceUsd),
    categoryId: row.categoryId,
    focusId: row.focusId,
    statusId: row.statusId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    financing: financing
      ? {
          downPaymentPercent: decimalText(financing.downPaymentPercent),
          fractionalDownPayment: financing.fractionalDownPayment,
          fractionalDownPaymentFha: decimalText(financing.fractionalDownPaymentFha),
          fractionalInstallmentsOtherBanks: decimalText(financing.fractionalInstallmentsOtherBanks),
          minDownPaymentFha: decimalText(financing.minDownPaymentFha),
          minDownPaymentOtherBanks: decimalText(financing.minDownPaymentOtherBanks),
          maxLoanTermYearsFha: financing.maxLoanTermYearsFha,
          maxLoanTermYearsBanks: financing.maxLoanTermYearsBanks,
          maxLoanTermYearsOwner: financing.maxLoanTermYearsOwner,
        }
      : null,
    bankRates: [...row.bankRates]
      .sort(byBankOrder)
      .map((rate) => ({ bank: rate.bank, annualRatePercent: decimalText(rate.annualRatePercent) })),
  }
}

/** Traduce los errores conocidos de Prisma; el resto se propaga tal cual. */
export function toBlockError(error: unknown): unknown {
  if (error instanceof PublicError) return error
  const code = (error as { code?: unknown } | null)?.code
  if (code === "P2025") return new BlockError(BLOCK_NOT_FOUND)
  // FK: una referencia validada se borró antes de guardar.
  if (code === "P2003") return new BlockError(`${MISSING_REFERENCES}.`)
  if (code === "P2002") return new BlockError(DUPLICATE_BLOCK_CODE)
  return error
}

/** El único `UNIQUE` que puede chocar al escribir un bloque es `code` (`publicId` es un cuid nuevo). */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002"
}
