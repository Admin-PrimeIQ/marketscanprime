/**
 * El contexto de cálculo de un bloque, ejecutado.
 *
 * Las categorías de los casos son las que existen en Strapi. El substring es la
 * regla que la hoja aplicó siempre; estas pruebas fijan también sus bordes, para
 * que la hoja y el reporte de fórmulas del ETL no puedan separarse sin que algo falle.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { blockFormulaContext, isLoteCategory, isVerticalCategory, unitVatRates } from "./context.ts"

test("vertical por nombre o por código", () => {
  assert.equal(isVerticalCategory("Vivienda Vertical", "vivienda-vertical"), true)
  assert.equal(isVerticalCategory("Oficinas Verticales", undefined), true)
  assert.equal(isVerticalCategory(undefined, "vert"), true)
  assert.equal(isVerticalCategory("Vivienda Horizontal", "vivienda-horizontal"), false)
  assert.equal(isVerticalCategory(null, null), false)
})

test("lote por substring: también 'lot' suelto", () => {
  assert.equal(isLoteCategory("Lotes para vivienda", "lotes-para-vivienda"), true)
  assert.equal(isLoteCategory(undefined, "lot"), true)
  assert.equal(isLoteCategory("Casas", "casas"), false)
})

test("industrial exacto: Bodegas y Terrenos, y nada que solo contenga la palabra", () => {
  assert.equal(blockFormulaContext({ categoryName: "Bodegas", categoryCode: "bodegas" }).industrialKind, "bodegas")
  assert.equal(blockFormulaContext({ categoryName: "Terrenos" }).industrialKind, "terrenos")
  assert.equal(blockFormulaContext({ categoryName: "Terrenos campestres" }).industrialKind, null)
})

test("el contexto lleva país y fechas, y vacíos como undefined", () => {
  const ctx = blockFormulaContext({ categoryName: "Casas", countryIso: "GT", collectionDate: "2026-09-15", startDate: "" })
  assert.deepEqual(ctx, {
    isVertical: false,
    isLote: false,
    industrialKind: null,
    iso: "GT",
    dates: { collectionDate: "2026-09-15", startDate: undefined },
  })
})

test("tasas: venta y renta por operación, mantenimiento por uso", () => {
  const block = { categoryName: "Casas", quarter: "T1", countryIso: "GT" }
  assert.deepEqual(unitVatRates(block, "Venta"), { sale: 0.916, rent: 1.12, maintenance: 0.916 })
  assert.deepEqual(unitVatRates(block, "Renta"), { sale: 0.916, rent: 1.12, maintenance: 1.12 })
  assert.deepEqual(unitVatRates(block), { sale: 0.916, rent: 1.12, maintenance: 1.12 })
})

test("El Salvador e interior + lote", () => {
  assert.deepEqual(unitVatRates({ categoryName: "Casas", quarter: "T1", countryIso: "SV" }, "Venta"), { sale: 1, rent: 1, maintenance: 1 })
  assert.equal(unitVatRates({ categoryName: "Lotes para vivienda", quarter: "S1", countryIso: "GT" }, "Venta").sale, 1.12)
})
