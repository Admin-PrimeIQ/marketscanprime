/**
 * El contexto con que se calculan las fórmulas de una unidad.
 *
 * El motor (`formulas.ts`) recibe banderas sueltas —vertical, lote, tipo
 * industrial, tasas de IVA, país— y esas banderas salen del bloque: su
 * categoría, su trimestre y el país de su proyecto. Esa traducción estaba
 * escrita dos veces (la página de unidades y la hoja) y el ETL necesita una
 * tercera para comparar lo guardado contra lo calculado. Con tres copias, la
 * primera corrección deja a una atrás y la hoja y el reporte dejan de coincidir.
 *
 * Sin React ni alias: lo importan la app, `node --test` y `etl/`.
 */

import { industrialKindOf, vatRatesFor, type IndustrialKind, type VatRates } from "./formulas.ts"

export interface BlockFormulaInput {
  categoryName?: string | null
  categoryCode?: string | null
  quarter?: string | null
  /** `isoCode2` del país del proyecto, o `code` si no lo tiene. */
  countryIso?: string | null
  collectionDate?: string | null
  startDate?: string | null
}

export interface BlockFormulaContext {
  isVertical: boolean
  isLote: boolean
  industrialKind: IndustrialKind
  iso: string | undefined
  dates: { collectionDate?: string; startDate?: string }
}

const categoryText = (name?: string | null, code?: string | null) => `${name || ""} ${code || ""}`.toLowerCase()

/**
 * Por substring y no exacto, a diferencia de `industrialKindOf`: las categorías
 * verticales vienen escritas de varias formas ("Vivienda Vertical",
 * "Oficinas Verticales", códigos abreviados) y así se decidió siempre en la hoja.
 */
export function isVerticalCategory(name?: string | null, code?: string | null): boolean {
  const s = categoryText(name, code)
  return s.includes("vertical") || s.includes("vert")
}

export function isLoteCategory(name?: string | null, code?: string | null): boolean {
  const s = categoryText(name, code)
  return s.includes("lote") || s.includes("lot")
}

export function blockFormulaContext(block: BlockFormulaInput): BlockFormulaContext {
  return {
    isVertical: isVerticalCategory(block.categoryName, block.categoryCode),
    isLote: isLoteCategory(block.categoryName, block.categoryCode),
    industrialKind: industrialKindOf(block.categoryName ?? undefined, block.categoryCode ?? undefined),
    iso: block.countryIso || undefined,
    dates: {
      collectionDate: block.collectionDate || undefined,
      startDate: block.startDate || undefined,
    },
  }
}

/** Las tres tasas de IVA de una unidad del bloque; el uso solo decide la del mantenimiento. */
export function unitVatRates(block: BlockFormulaInput, usageName?: string | null): VatRates {
  return vatRatesFor({
    quarter: block.quarter ?? undefined,
    category: block.categoryName ?? undefined,
    usageName: usageName ?? undefined,
    iso: block.countryIso || undefined,
  })
}
