/**
 * El grafo de dependencias, ejecutado.
 *
 * `findDimensionCascadeRule` es lo que decide si editar un campo recalcula algo
 * o no hace nada. Una condición mal escrita no rompe nada visible: simplemente
 * el investigador edita y no pasa nada, que es el fallo más difícil de notar
 * porque se parece a "todavía no guardé".
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { findDimensionCascadeRule, findCascadeRule } from "./datasheet-units-table-config.ts"

// ── Industrial: lo que antes no disparaba nada ───────────────────────────────

for (const campo of ["industrial.warehouseM2", "industrial.officeM2", "industrial.mezzanineM2"]) {
  test(`${campo} recalcula en un bloque de Bodegas`, () => {
    const m = findDimensionCascadeRule(campo, false, false, "bodegas")
    assert.ok(m, "debería encontrar regla")
    assert.equal(m.rule.syncFn, "syncMedidasIndustrial")
    assert.ok(m.rule.affects.includes("unitSizeM2"), "arrastra el tamaño de unidad")
    assert.ok(m.rule.affects.includes("pricePerM2USD"), "y el precio por m²")
  })

  test(`${campo} no hace nada fuera de industrial`, () => {
    assert.equal(findDimensionCascadeRule(campo, false, false, null), null, "vivienda/oficinas")
    assert.equal(findDimensionCascadeRule(campo, true, false, null), null, "vertical")
    assert.equal(findDimensionCascadeRule(campo, false, true, null), null, "lote")
  })
}

test("en Terrenos las piezas de la zona no disparan: ahí manda el terreno", () => {
  assert.equal(findDimensionCascadeRule("industrial.warehouseM2", false, false, "terrenos"), null)
})

test("el terreno recalcula en Terrenos", () => {
  const m = findDimensionCascadeRule("landM2", false, false, "terrenos")
  assert.ok(m, "debería encontrar regla")
  assert.equal(m.group.label, "Medidas - Terreno")
  assert.equal(m.rule.syncFn, "syncMedidasIndustrial")
})

test("el terreno NO recalcula en Bodegas: ahí el tamaño es la suma", () => {
  assert.equal(findDimensionCascadeRule("landM2", false, false, "bodegas"), null)
})

// ── Lo que ya funcionaba tiene que seguir igual ──────────────────────────────

test("lote: el terreno sigue disparando su propia regla, no la de Terrenos", () => {
  const m = findDimensionCascadeRule("landM2", false, true, null)
  assert.ok(m)
  assert.equal(m.group.label, "Medidas - Lote (Terreno)")
})

test("el tamaño de unidad sigue disparando en lo que no es lote", () => {
  const m = findDimensionCascadeRule("unitSizeM2", false, false, null)
  assert.ok(m)
  assert.equal(m.rule.syncFn, "syncMedidasWithTotal")
})

test("el balcón sigue disparando sólo en vertical", () => {
  assert.ok(findDimensionCascadeRule("offices.balconyTerraceM2", true, false, null), "vertical sí")
  assert.equal(findDimensionCascadeRule("offices.balconyTerraceM2", false, false, null), null, "horizontal no")
})

test("los triángulos de precio no cambiaron", () => {
  for (const [campo, fn] of [
    ["totalPriceUSD", "syncPriceGroupFromTotal"],
    ["rentalPriceUSD", "syncUnitRentalFromTotal"],
    ["maintenanceTotalPriceM2USD", "syncUnitMaintenancePerM2"],
  ] as const) {
    const m = findCascadeRule(campo)
    assert.ok(m, `${campo} debería tener regla`)
    assert.equal(m.rule.syncFn, fn)
  }
})

// ── El aviso en cascada nombra lo que tocó ───────────────────────────────────
//
// El toast filtra los campos sin etiqueta. Un disparador sin etiqueta
// desaparece del aviso y el investigador no ve qué editó.

test("los tres campos industriales tienen etiqueta para el aviso", async () => {
  const { DATASHEET_CONFIG } = await import("./datasheet-units-table-config.ts")
  const labels = DATASHEET_CONFIG.display.fieldLabels as Record<string, string>
  for (const campo of ["industrial.warehouseM2", "industrial.officeM2", "industrial.mezzanineM2"]) {
    assert.ok(labels[campo], `${campo} sin etiqueta: desaparecería del aviso`)
  }
})
