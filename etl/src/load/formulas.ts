import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { blockFormulaContext, unitVatRates, type BlockFormulaContext, type BlockFormulaInput } from "../../../lib/domain/units/context.ts"
import { ensureUnitFormulasSynced, RECONCILED_FORMULA_FIELDS } from "../../../lib/domain/units/formulas.ts"
import { UNDEFINED_PROJECT } from "./model"
import { REPORTS_DIR } from "./report"
import type { AppData, AppRow } from "./specs"

/**
 * Fórmulas de unidad: recalcula cada unidad con el mismo motor de la hoja de unidades
 * (`lib/domain/units/`) y cuenta dónde lo guardado no coincide. Solo reporta: la carga copia a
 * `msp_app` los valores tal cual vienen de Strapi. No abre conexiones ni escribe en ninguna base.
 *
 * La diferencia es la misma que la hoja pinta de amarillo al abrir un bloque: más de 0.01 entre lo
 * guardado y lo recalculado. Un campo vacío cuenta como 0, igual que en la hoja.
 */

export type FormulaField = (typeof RECONCILED_FORMULA_FIELDS)[number]

export interface FormulaDiff {
  field: string
  stored: number
  expected: number
  /** Lo guardado estaba vacío (nunca se calculó), no con otro valor. */
  storedNull: boolean
}

export interface UnitCheck {
  unit: AppRow
  block: AppRow | undefined
  /** Null: el padre es «No definido» y no hay bloque real del que sacar el contexto. */
  context: BlockFormulaContext | null
  categoryName: string | null
  diffs: FormulaDiff[]
}

export interface FieldExample {
  unit: string | null
  unitCode: string | null
  block: string | null
  stored: number
  expected: number
}

export interface FieldStats {
  units: number
  storedNull: number
  maxAbs: number
  examples: FieldExample[]
}

export interface GroupStats {
  units: number
  withDiffs: number
  fields: Partial<Record<FormulaField, number>>
}

export interface BlockStats extends GroupStats {
  block: string | null
  code: string | null
  name: string | null
  period: string
  domain: string | null
  category: string | null
  isVertical: boolean
  isLote: boolean
  industrialKind: string | null
}

export interface FormulaReport {
  snapshot: string
  generatedAt: string
  tolerance: number
  units: { total: number; checked: number; withoutContext: number; withoutCategory: number; withDiffs: number; clean: number }
  byField: Record<FormulaField, FieldStats>
  byPeriod: Array<GroupStats & { period: string; domain: string | null }>
  topBlocks: BlockStats[]
}

/** Columna de `unit` y su escala en `msp_app` (prisma/schema.prisma), por campo del motor. */
export const FORMULA_COLUMNS: Record<FormulaField, { column: string; scale: number }> = {
  parkingSizeM2: { column: "parking_size_m2", scale: 4 },
  totalSizeM2: { column: "total_size_m2", scale: 4 },
  habitableConstructionM2: { column: "habitable_construction_m2", scale: 4 },
  unitSizeM2: { column: "unit_size_m2", scale: 4 },
  priceWithoutVATUSD: { column: "price_without_vat_usd", scale: 2 },
  pricePerM2USD: { column: "price_per_m2_usd", scale: 2 },
  rentalPriceWithoutVATUSD: { column: "rental_price_without_vat_usd", scale: 2 },
  maintenancePricePerM2USD: { column: "maintenance_price_per_m2_usd", scale: 2 },
  installmentUSD: { column: "installment_usd", scale: 2 },
  incomeUSD: { column: "income_usd", scale: 2 },
  unitAbsorption: { column: "unit_absorption", scale: 12 },
  absorptionPerM2: { column: "absorption_per_m2", scale: 12 },
}

export const FORMULA_TOLERANCE = 0.01
const EXAMPLES_PER_FIELD = 5
const TOP_BLOCKS = 20

function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Unidad de `msp_app` con los nombres camelCase que espera el motor (los de Strapi). */
export function engineUnit(unit: AppRow, child?: AppRow): Record<string, unknown> {
  return {
    availability: unit.availability,
    parkingSpaces: num(unit.parking_spaces),
    landM2: num(unit.land_m2),
    unitSizeM2: num(unit.unit_size_m2),
    habitableConstructionM2: num(unit.habitable_construction_m2),
    parkingSizeM2: num(unit.parking_size_m2),
    totalSizeM2: num(unit.total_size_m2),
    totalPriceUSD: num(unit.total_price_usd),
    priceWithoutVATUSD: num(unit.price_without_vat_usd),
    pricePerM2USD: num(unit.price_per_m2_usd),
    rentalPriceUSD: num(unit.rental_price_usd),
    rentalPriceWithoutVATUSD: num(unit.rental_price_without_vat_usd),
    rentalPricePerM2WithoutVATUSD: num(unit.rental_price_per_m2_without_vat_usd),
    maintenanceTotalPriceM2USD: num(unit.maintenance_total_price_m2_usd),
    maintenancePricePerM2USD: num(unit.maintenance_price_per_m2_usd),
    installmentUSD: num(unit.installment_usd),
    incomeUSD: num(unit.income_usd),
    unitAbsorption: num(unit.unit_absorption),
    absorptionPerM2: num(unit.absorption_per_m2),
    unitType: child
      ? [
          {
            balconyTerraceSizeM2: num(child.balcony_terrace_size_m2),
            warehouseStorageSizeM2: num(child.warehouse_storage_size_m2),
            officeSizeM2: num(child.office_size_m2),
            mezzanineSizeM2: num(child.mezzanine_size_m2),
          },
        ]
      : [],
  }
}

const byPublicId = (rows: AppRow[]) => new Map(rows.map((r) => [r.public_id, r]))
const byUnit = (rows: AppRow[]) => new Map(rows.map((r) => [r.unit_id, r]))

export function periodOf(block: AppRow | undefined): string {
  const year = block?.year ?? ""
  const quarter = block?.quarter ?? ""
  return `${year} ${quarter}`.trim() || "sin período"
}

/** Recalcula todas las unidades y devuelve, por unidad, los campos que no coinciden. */
export function checkUnits(data: AppData): UnitCheck[] {
  const blocks = byPublicId(data.block)
  const projects = byPublicId(data.project)
  const countries = byPublicId(data.country)
  const categories = byPublicId(data.block_category)
  const usages = byPublicId(data.unit_usage)
  const children = [byUnit(data.unit_housing), byUnit(data.unit_office), byUnit(data.unit_industrial)]
  const inputs = new Map<string, { input: BlockFormulaInput; context: BlockFormulaContext } | null>()

  const blockContext = (block: AppRow | undefined) => {
    if (!block || block.project_id === UNDEFINED_PROJECT) return null
    const key = block.public_id ?? ""
    if (inputs.has(key)) return inputs.get(key)!
    const category = block.category_id ? categories.get(block.category_id) : undefined
    const country = countries.get(projects.get(block.project_id ?? "")?.country_id ?? "")
    const input: BlockFormulaInput = {
      categoryName: category?.name,
      categoryCode: category?.code,
      quarter: block.quarter,
      countryIso: country?.iso_code_2 ?? country?.code,
      collectionDate: block.collection_date,
      startDate: block.start_date,
    }
    const value = { input, context: blockFormulaContext(input) }
    inputs.set(key, value)
    return value
  }

  return data.unit.map((unit) => {
    const block = blocks.get(unit.block_id ?? "")
    const categoryName = (block?.category_id && categories.get(block.category_id)?.name) || null
    const resolved = blockContext(block)
    if (!resolved) return { unit, block, context: null, categoryName, diffs: [] }

    const { input, context } = resolved
    const child = children.map((m) => m.get(unit.public_id)).find(Boolean)
    const stored = engineUnit(unit, child)
    const usageName = unit.usage_id ? usages.get(unit.usage_id)?.name : undefined
    const changed = ensureUnitFormulasSynced(
      { ...stored },
      context.dates,
      context.isVertical,
      unitVatRates(input, usageName),
      context.isLote,
      context.iso,
      context.industrialKind,
    )
    const diffs = changed.map((c) => ({ field: c.field, stored: c.before, expected: c.after, storedNull: stored[c.field] === null }))
    return { unit, block, context, categoryName, diffs }
  })
}

export interface FormulaDiffs {
  /** Unidades con al menos un campo distinto del motor (lo que la hoja pinta de amarillo). */
  units: number
  /** Unidades con diferencia, por campo (incluye las que Strapi trae vacías). */
  byField: Partial<Record<FormulaField, number>>
}

export function formulaDiffs(report: FormulaReport): FormulaDiffs {
  const byField: FormulaDiffs["byField"] = {}
  for (const [field, stats] of Object.entries(report.byField) as [FormulaField, FieldStats][]) {
    if (stats.units > 0) byField[field] = stats.units
  }
  return { units: report.units.withDiffs, byField }
}

function emptyGroup(): GroupStats {
  return { units: 0, withDiffs: 0, fields: {} }
}

function addToGroup(group: GroupStats, check: UnitCheck) {
  group.units++
  if (check.diffs.length === 0) return
  group.withDiffs++
  for (const d of check.diffs) {
    const f = d.field as FormulaField
    group.fields[f] = (group.fields[f] ?? 0) + 1
  }
}

export function summarizeFormulas(checks: UnitCheck[], snapshot: string): FormulaReport {
  const byField = Object.fromEntries(
    RECONCILED_FORMULA_FIELDS.map((f): [FormulaField, FieldStats] => [f, { units: 0, storedNull: 0, maxAbs: 0, examples: [] }]),
  ) as Record<FormulaField, FieldStats>
  const periods = new Map<string, GroupStats & { period: string; domain: string | null }>()
  const blocks = new Map<string, BlockStats>()
  const units = { total: checks.length, checked: 0, withoutContext: 0, withoutCategory: 0, withDiffs: 0, clean: 0 }

  for (const check of checks) {
    if (!check.context) {
      units.withoutContext++
      continue
    }
    units.checked++
    if (!check.block?.category_id) units.withoutCategory++
    if (check.diffs.length > 0) units.withDiffs++
    else units.clean++

    for (const d of check.diffs) {
      const stats = byField[d.field as FormulaField]
      const abs = Math.abs(d.expected - d.stored)
      stats.units++
      if (d.storedNull) stats.storedNull++
      stats.maxAbs = Math.max(stats.maxAbs, abs)
      const example = { unit: check.unit.public_id, unitCode: check.unit.code, block: check.block?.public_id ?? null, stored: d.stored, expected: d.expected }
      stats.examples.push(example)
      stats.examples.sort((a, b) => Math.abs(b.expected - b.stored) - Math.abs(a.expected - a.stored))
      if (stats.examples.length > EXAMPLES_PER_FIELD) stats.examples.pop()
    }

    const period = periodOf(check.block)
    const domain = check.block?.domain ?? null
    const periodKey = `${period}|${domain}`
    if (!periods.has(periodKey)) periods.set(periodKey, { period, domain, ...emptyGroup() })
    addToGroup(periods.get(periodKey)!, check)

    const blockKey = check.block?.public_id ?? ""
    if (!blocks.has(blockKey)) {
      blocks.set(blockKey, {
        block: check.block?.public_id ?? null,
        code: check.block?.code ?? null,
        name: check.block?.name ?? null,
        period,
        domain,
        category: check.categoryName,
        isVertical: check.context.isVertical,
        isLote: check.context.isLote,
        industrialKind: check.context.industrialKind,
        ...emptyGroup(),
      })
    }
    addToGroup(blocks.get(blockKey)!, check)
  }

  return {
    snapshot,
    generatedAt: new Date().toISOString(),
    tolerance: FORMULA_TOLERANCE,
    units,
    byField,
    byPeriod: [...periods.values()].sort((a, b) => b.period.localeCompare(a.period) || String(a.domain).localeCompare(String(b.domain))),
    topBlocks: [...blocks.values()]
      .filter((b) => b.withDiffs > 0)
      .sort((a, b) => b.withDiffs - a.withDiffs || b.units - a.units)
      .slice(0, TOP_BLOCKS),
  }
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ""
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Una fila por unidad con diferencias; por campo, lo guardado y lo recalculado (vacío si coincide). */
export function formulaCsv(checks: UnitCheck[]): string {
  const header = [
    "unit",
    "unit_code",
    "block",
    "block_code",
    "period",
    "domain",
    "category",
    "fields",
    ...RECONCILED_FORMULA_FIELDS.flatMap((f) => [`${f}_stored`, `${f}_expected`]),
  ]
  const lines = [header.join(",")]
  for (const check of checks) {
    if (check.diffs.length === 0) continue
    const byField = new Map(check.diffs.map((d) => [d.field, d]))
    lines.push(
      [
        check.unit.public_id,
        check.unit.code,
        check.block?.public_id,
        check.block?.code,
        periodOf(check.block),
        check.block?.domain,
        check.categoryName,
        check.diffs.map((d) => d.field).join(" "),
        ...RECONCILED_FORMULA_FIELDS.flatMap((f) => {
          const d = byField.get(f)
          return d ? [d.storedNull ? "" : d.stored, d.expected] : ["", ""]
        }),
      ]
        .map(csvCell)
        .join(","),
    )
  }
  return lines.join("\n") + "\n"
}

export function writeFormulaReport(report: FormulaReport, checks: UnitCheck[]): { json: string; csv: string } {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const base = resolve(REPORTS_DIR, `formulas-${report.generatedAt.replace(/[:.]/g, "-")}`)
  const json = `${base}.json`
  const csv = `${base}.csv`
  writeFileSync(json, JSON.stringify(report, null, 2))
  writeFileSync(csv, formulaCsv(checks))
  return { json, csv }
}
