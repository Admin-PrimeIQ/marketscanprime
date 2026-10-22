/**
 * El motor de fórmulas, ejecutado.
 *
 * Estas reglas son las que más caro sale equivocar: un divisor cambiado o un
 * IVA al revés escribe miles de filas mal y nadie lo nota hasta que un
 * investigador compara contra su hoja. Hasta hoy no había forma de correrlas.
 *
 * Los números de cada caso NO son inventados: salen del warehouse, y el
 * comentario dice de dónde. Un caso con números redondos prueba que la función
 * no explota; uno con datos reales prueba que hace lo que el negocio espera.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  roundTo2,
  removeVat,
  applyVat,
  syncUnitParkingSize,
  syncUnitHabitableConstruction,
  syncUnitTotalSize,
  syncUnitPriceFromTotal,
  syncUnitRentalFromTotal,
  syncPriceFromPerM2,
  ensureUnitFormulasSynced,
  sameVatRate,
  vatRatesFor,
  getVatRate,
  syncIndustrialUnitSize,
  industrialKindOf,
  syncUnitMaintenancePerM2,
} from "./formulas.ts"

/** Dos números iguales hasta el centavo. */
const cerca = (a: unknown, b: number, msg: string) =>
  assert.ok(Math.abs(Number(a) - b) < 0.011, `${msg}: ${a} ≠ ${b}`)

// ── IVA: las dos convenciones ────────────────────────────────────────────────
//
// El warehouse guarda el IVA de dos formas y las dos son correctas según de
// dónde venga el dato. Un factor menor que uno MULTIPLICA (0.916); uno mayor
// DIVIDE (1.12). Confundirlas da un 22% de diferencia, que es justo el tamaño
// de error que pasa desapercibido en una fila y es enorme en mil.

test("removeVat multiplica cuando el factor es menor que uno", () => {
  cerca(removeVat(100000, 0.916), 91600, "0.916 multiplica")
})

test("removeVat divide cuando el factor es mayor que uno", () => {
  cerca(removeVat(112000, 1.12), 100000, "1.12 divide")
})

test("applyVat es la inversa exacta de removeVat en las dos convenciones", () => {
  for (const tasa of [0.916, 1.12, 1.0]) {
    cerca(applyVat(removeVat(250000, tasa), tasa), 250000, `ida y vuelta con ${tasa}`)
  }
})

// ── Medidas ──────────────────────────────────────────────────────────────────

test("parqueo: cada espacio son 12.5 m², y se espeja en varas²", () => {
  const u: Record<string, unknown> = { parkingSpaces: 2 }
  syncUnitParkingSize(u)
  cerca(u.parkingSizeM2, 25, "2 espacios")
  cerca(u.parkingSizeVaras2, 35.78, "25 m² en varas²")
})

test("vertical: habitable = unidad + balcón; total = habitable + parqueo", () => {
  // Regla de oficinas, medida contra las 952 unidades de office_units: la suma
  // reproduce `construccion_habitable_m2` en el 100% y `construccion_total_m2`
  // en el 99.4%.
  const u: Record<string, unknown> = {
    unitSizeM2: 80,
    parkingSpaces: 2,
    unitType: [{ balconyTerraceSizeM2: 12 }],
  }
  syncUnitParkingSize(u)
  syncUnitHabitableConstruction(u, true, false)
  syncUnitTotalSize(u, true)
  cerca(u.habitableConstructionM2, 92, "80 + 12 de balcón")
  cerca(u.totalSizeM2, 117, "92 + 25 de parqueo")
})

test("horizontal: el balcón no suma y el parqueo tampoco", () => {
  const u: Record<string, unknown> = {
    unitSizeM2: 80,
    parkingSpaces: 2,
    unitType: [{ balconyTerraceSizeM2: 12 }],
  }
  syncUnitParkingSize(u)
  syncUnitHabitableConstruction(u, false, false)
  syncUnitTotalSize(u, false)
  cerca(u.habitableConstructionM2, 80, "sin balcón")
  cerca(u.totalSizeM2, 80, "sin parqueo")
})

test("lote: habitable es el terreno, no el tamaño de unidad", () => {
  const u: Record<string, unknown> = { unitSizeM2: 80, landM2: 300 }
  syncUnitHabitableConstruction(u, false, true)
  cerca(u.habitableConstructionM2, 300, "manda el terreno")
})

// ── Precios ──────────────────────────────────────────────────────────────────

test("precio por m² divide el precio sin IVA entre el área habitable", () => {
  const u: Record<string, unknown> = { totalPriceUSD: 112000, habitableConstructionM2: 100 }
  syncUnitPriceFromTotal(u, sameVatRate(1.12))
  cerca(u.priceWithoutVATUSD, 100000, "sin IVA")
  cerca(u.pricePerM2USD, 1000, "por m²")
})

test("sin área habitable el precio por m² es cero, no infinito", () => {
  const u: Record<string, unknown> = { totalPriceUSD: 112000, habitableConstructionM2: 0, unitSizeM2: 0 }
  syncUnitPriceFromTotal(u, sameVatRate(1.12))
  assert.equal(u.pricePerM2USD, 0, "dividir entre cero no puede producir Infinity")
})

test("el triángulo de venta cierra: editar el precio por m² reconstruye el total", () => {
  const u: Record<string, unknown> = { pricePerM2USD: 1000, habitableConstructionM2: 100 }
  syncPriceFromPerM2(u, sameVatRate(1.12))
  cerca(u.priceWithoutVATUSD, 100000, "sin IVA")
  cerca(u.totalPriceUSD, 112000, "total con IVA")
})

test("industrial usa unitSizeM2 cuando no hay construcción habitable", () => {
  // 2.079 de las 2.210 unidades industriales no traen construcción habitable;
  // el divisor cae a `unitSizeM2`, que el pull llena con `tamano_sin_parqueo_m2`.
  const u: Record<string, unknown> = { totalPriceUSD: 100000, unitSizeM2: 500, habitableConstructionM2: 0 }
  syncUnitPriceFromTotal(u, sameVatRate(0.916))
  cerca(u.priceWithoutVATUSD, 91600, "sin IVA con 0.916")
  cerca(u.pricePerM2USD, 183.2, "91600 / 500")
})

// ── La secuencia completa ────────────────────────────────────────────────────

test("ensureUnitFormulasSynced reporta lo que cambió respecto de lo guardado", () => {
  const u: Record<string, unknown> = {
    unitSizeM2: 100, parkingSpaces: 0, totalPriceUSD: 112000,
    habitableConstructionM2: 0, pricePerM2USD: 0, priceWithoutVATUSD: 0,
  }
  const cambios = ensureUnitFormulasSynced(u, {}, false, sameVatRate(1.12), false)
  const campos = cambios.map((c) => c.field)
  assert.ok(campos.includes("habitableConstructionM2"), "detecta el habitable que faltaba")
  assert.ok(campos.includes("pricePerM2USD"), "detecta el precio por m²")
  cerca(u.pricePerM2USD, 1000, "100000 / 100")
})

test("ensureUnitFormulasSynced no reporta nada cuando ya estaba bien", () => {
  const u: Record<string, unknown> = {
    unitSizeM2: 100, parkingSpaces: 0, totalPriceUSD: 112000,
    habitableConstructionM2: 100, habitableConstructionVaras2: roundTo2(143.1),
    totalSizeM2: 100, totalSizeVaras2: roundTo2(143.1),
    parkingSizeM2: 0, priceWithoutVATUSD: 100000, pricePerM2USD: 1000,
    rentalPriceWithoutVATUSD: 0, maintenancePricePerM2USD: 0,
    installmentUSD: 725.03, incomeUSD: 2900.12,
    unitAbsorption: 0, absorptionPerM2: 0,
  }
  const cambios = ensureUnitFormulasSynced(u, {}, false, sameVatRate(1.12), false)
  assert.deepEqual(cambios, [], `no debería cambiar nada: ${JSON.stringify(cambios)}`)
})

test("renta: sin IVA y por m² salen del precio de renta", () => {
  const u: Record<string, unknown> = { rentalPriceUSD: 1120, habitableConstructionM2: 100 }
  syncUnitRentalFromTotal(u, sameVatRate(1.12))
  cerca(u.rentalPriceWithoutVATUSD, 1000, "renta sin IVA")
  cerca(u.rentalPricePerM2WithoutVATUSD, 10, "renta por m²")
})

// ── La tasa la manda la operación, no el uso declarado ───────────────────────
//
// Kevin lo pidió para industrial y oficinas. Hoy no mueve un número —ninguna de
// las 213.254 unidades tiene precio de venta y de renta a la vez— pero el
// acoplamiento anterior era una trampa armada: una unidad con las dos columnas
// llenas sacaba su renta con la tasa de venta.

test("vatRatesFor da venta 0.916 y renta 1.12, sin importar el uso declarado", () => {
  for (const uso of ["Venta", "Renta", undefined]) {
    const r = vatRatesFor({ quarter: "T1", category: "Bodegas", usageName: uso, iso: "GT" })
    assert.equal(r.sale, 0.916, `venta con uso ${uso}`)
    assert.equal(r.rent, 1.12, `renta con uso ${uso}`)
  }
})

test("una unidad con venta Y renta saca cada una con su tasa", () => {
  const rates = vatRatesFor({ quarter: "T1", category: "Bodegas", usageName: "Venta", iso: "GT" })
  const u: Record<string, unknown> = {
    totalPriceUSD: 100000,
    rentalPriceUSD: 1120,
    habitableConstructionM2: 100,
  }
  syncUnitPriceFromTotal(u, rates)
  syncUnitRentalFromTotal(u, rates)
  cerca(u.priceWithoutVATUSD, 91600, "venta: 100000 × 0.916")
  cerca(u.rentalPriceWithoutVATUSD, 1000, "renta: 1120 ÷ 1.12, NO × 0.916")
  // Antes del cambio la renta habría salido 1025.92 — el uso decía "Venta".
  assert.notEqual(Number(u.rentalPriceWithoutVATUSD).toFixed(2), "1025.92")
})

test("El Salvador no tiene IVA aprobado: las dos tasas son 1.0", () => {
  const r = vatRatesFor({ quarter: "T1", category: "Casas", usageName: "Venta", iso: "SV" })
  assert.equal(r.sale, 1.0)
  assert.equal(r.rent, 1.0)
})

test("interior + lote pisa la tasa de venta con 1.12", () => {
  const r = vatRatesFor({ quarter: "S1", category: "Lotes para vivienda", usageName: "Venta", iso: "GT" })
  assert.equal(r.sale, 1.12, "la excepción del interior gana")
})

test("el mantenimiento sigue la tasa del uso — sin cambio, pendiente de confirmar", () => {
  assert.equal(vatRatesFor({ usageName: "Venta", iso: "GT" }).maintenance, 0.916)
  assert.equal(vatRatesFor({ usageName: "Renta", iso: "GT" }).maintenance, 1.12)
})

test("getVatRate conserva la regla que vivía en el componente", () => {
  assert.equal(getVatRate("T1", "Casas", "Uso Venta", "GT"), 0.916)
  assert.equal(getVatRate("T1", "Casas", "Uso Renta", "GT"), 1.12)
  assert.equal(getVatRate("S1", "Lotes", "Uso Venta", "GT"), 1.12)
  assert.equal(getVatRate("T1", "Casas", "Uso Venta", "SV"), 1.0)
  assert.equal(getVatRate(undefined, undefined, undefined, undefined), 1.12)
})

// ── Industrial: el tamaño se suma ────────────────────────────────────────────
//
// Hasta ahora nadie sumaba: el valor venía precalculado del warehouse en
// `tamano_sin_parqueo_m2` y editar el tamaño de bodega no recalculaba nada.
// Las cifras de estos casos son unidades reales de `industrial_units`.

test("bodegas: el tamaño de unidad es bodega + oficina + mezzanine", () => {
  const u: Record<string, unknown> = {
    unitType: [{ warehouseStorageSizeM2: 210, officeSizeM2: 30, mezzanineSizeM2: 45 }],
    landM2: 0,
  }
  syncIndustrialUnitSize(u, "bodegas")
  cerca(u.unitSizeM2, 285, "210 + 30 + 45")
  cerca(u.unitSizeVaras2, 407.84, "285 m² en varas²")
})

test("terrenos: el tamaño de unidad es el terreno, y la zona va en cero", () => {
  // Unidad real: las 216 de categoría Terrenos traen bodega/oficina/mezzanine
  // en cero, y `tamano_sin_parqueo_m2` igual al terreno en el 100%.
  const u: Record<string, unknown> = {
    unitType: [{ warehouseStorageSizeM2: 0, officeSizeM2: 0, mezzanineSizeM2: 0 }],
    landM2: 2500,
  }
  syncIndustrialUnitSize(u, "terrenos")
  cerca(u.unitSizeM2, 2500, "manda el terreno")
})

test("terrenos NO suma la zona aunque venga con valores", () => {
  const u: Record<string, unknown> = {
    unitType: [{ warehouseStorageSizeM2: 999, officeSizeM2: 999, mezzanineSizeM2: 999 }],
    landM2: 2500,
  }
  syncIndustrialUnitSize(u, "terrenos")
  cerca(u.unitSizeM2, 2500, "el terreno gana sobre la zona")
})

test("un bloque que no es industrial no se toca", () => {
  const u: Record<string, unknown> = { unitSizeM2: 80, unitType: [{ warehouseStorageSizeM2: 999 }] }
  syncIndustrialUnitSize(u, null)
  cerca(u.unitSizeM2, 80, "vivienda y oficinas quedan igual")
})

test("una unidad industrial sin zona dinámica da cero, no NaN", () => {
  const u: Record<string, unknown> = { landM2: 0 }
  syncIndustrialUnitSize(u, "bodegas")
  assert.equal(u.unitSizeM2, 0, "sin zona la suma es 0")
})

test("editar el tamaño de bodega arrastra habitable, total y precio por m²", () => {
  // El caso que hoy NO pasa: cambiar una pieza y que el precio por m² siga.
  const u: Record<string, unknown> = {
    unitType: [{ warehouseStorageSizeM2: 210, officeSizeM2: 0, mezzanineSizeM2: 0 }],
    parkingSpaces: 2, totalPriceUSD: 100000, landM2: 0,
  }
  ensureUnitFormulasSynced(u, {}, false, sameVatRate(0.916), false, "GT", "bodegas")
  cerca(u.unitSizeM2, 210, "suma inicial")
  cerca(u.pricePerM2USD, 91600 / 210, "precio por m² sobre 210")

  // El investigador agrega una oficina de 40 m².
  ;(u.unitType as Array<Record<string, unknown>>)[0].officeSizeM2 = 40
  ensureUnitFormulasSynced(u, {}, false, sameVatRate(0.916), false, "GT", "bodegas")
  cerca(u.unitSizeM2, 250, "210 + 40")
  cerca(u.pricePerM2USD, 91600 / 250, "el precio por m² siguió a la suma")
})

test("el tamaño industrial NO se escribe en totalSizeM2", () => {
  // totalSizeM2 viaja a `tamano_total_m2`, que en el warehouse incluye el
  // parqueo y difiere de la suma en 351 de 2.210 filas. Escribirlo ahí las
  // pisaría en el primer push.
  const u: Record<string, unknown> = {
    unitType: [{ warehouseStorageSizeM2: 210, officeSizeM2: 0, mezzanineSizeM2: 0 }],
    parkingSpaces: 2, landM2: 0,
  }
  ensureUnitFormulasSynced(u, {}, false, sameVatRate(0.916), false, "GT", "bodegas")
  cerca(u.unitSizeM2, 210, "la suma va al tamaño de unidad")
  cerca(u.totalSizeM2, 210, "y el total sigue siendo habitable sin parqueo (horizontal)")
  assert.notEqual(Number(u.totalSizeM2), 235, "no se inventa el parqueo dentro del total")
})

test("la categoría industrial se reconoce por nombre o por código, exactos", () => {
  assert.equal(industrialKindOf("Bodegas", "bodegas"), "bodegas")
  assert.equal(industrialKindOf("Terrenos", "terrenos"), "terrenos")
  assert.equal(industrialKindOf(undefined, "bodegas"), "bodegas", "basta el código")
  assert.equal(industrialKindOf("Terrenos", undefined), "terrenos", "basta el nombre")
})

test("una categoría que sólo CONTIENE la palabra no cuenta", () => {
  // El fallo que esto evita: unidades de vivienda calculando su tamaño como
  // industriales, con el precio por m² saliendo de la nada.
  assert.equal(industrialKindOf("Terrenos campestres", "terrenos-campestres"), null)
  assert.equal(industrialKindOf("Lotes para vivienda", "lotes-para-vivienda"), null)
  assert.equal(industrialKindOf("Vivienda Vertical", "vivienda-vertical"), null)
  assert.equal(industrialKindOf("Oficinas Verticales", "oficinas-verticales"), null)
  assert.equal(industrialKindOf(undefined, undefined), null)
})

// ── El parqueo nunca entra en el divisor del precio por m² ───────────────────
//
// Regla confirmada por el negocio el 2026-09-11. Se preguntó con los dos
// números sobre la mesa —210 sin parqueo contra 235 con parqueo— y la respuesta
// fue "sin incluir el parqueo; así está alineado con los demás usos".
//
// Vale para los tres dominios y por eso se prueba en los tres: es el tipo de
// regla que se respeta en dos y se olvida en el tercero.

test("oficinas: el parqueo no entra en el precio por m²", () => {
  const u: Record<string, unknown> = {
    unitSizeM2: 80, parkingSpaces: 2, unitType: [{ balconyTerraceSizeM2: 12 }],
    totalPriceUSD: 100000,
  }
  ensureUnitFormulasSynced(u, {}, true, sameVatRate(0.916), false)
  cerca(u.habitableConstructionM2, 92, "80 + 12 de balcón")
  cerca(u.totalSizeM2, 117, "el TOTAL sí suma los 25 m² de parqueo")
  cerca(u.pricePerM2USD, 91600 / 92, "pero el PRECIO se divide entre 92, no entre 117")
})

test("industrial: el parqueo no entra en el precio por m²", () => {
  const u: Record<string, unknown> = {
    unitType: [{ warehouseStorageSizeM2: 210, officeSizeM2: 0, mezzanineSizeM2: 0 }],
    parkingSpaces: 2, totalPriceUSD: 100000, landM2: 0,
  }
  ensureUnitFormulasSynced(u, {}, false, sameVatRate(0.916), false, "GT", "bodegas")
  cerca(u.parkingSizeM2, 25, "hay 25 m² de parqueo")
  cerca(u.pricePerM2USD, 91600 / 210, "y el precio se divide entre 210, no entre 235")
})

test("vivienda: el parqueo no entra en el precio por m²", () => {
  const u: Record<string, unknown> = { unitSizeM2: 100, parkingSpaces: 2, totalPriceUSD: 100000 }
  ensureUnitFormulasSynced(u, {}, false, sameVatRate(0.916), false)
  cerca(u.parkingSizeM2, 25, "hay 25 m² de parqueo")
  cerca(u.pricePerM2USD, 91600 / 100, "y el precio se divide entre 100")
})

// ── Mantenimiento ────────────────────────────────────────────────────────────
//
// La tasa la manda el uso de la unidad, y el divisor es la construcción
// habitable. No es una elección de este código: es la convención vigente del
// warehouse, medida sobre el período 2026-3T —26.803 filas, 207 de 249
// proyectos— donde el 91% sigue `total × 0.916 ÷ habitable`.

test("vivienda en venta: mantenimiento por m² = total × 0.916 ÷ habitable", () => {
  // Unidad real de Condado Chimaltenango: 62 m² habitables, 25 de parqueo.
  const u: Record<string, unknown> = {
    maintenanceTotalPriceM2USD: 57.98, unitSizeM2: 62, parkingSpaces: 2,
  }
  syncUnitHabitableConstruction(u, false, false)
  syncUnitMaintenancePerM2(u, vatRatesFor({ usageName: "Venta", iso: "GT" }))
  cerca(u.maintenanceWithoutVATUSD, 53.11, "57.98 × 0.916")
  cerca(u.maintenancePricePerM2USD, 0.86, "53.11 ÷ 62 — el valor que el warehouse guarda")
})

test("el mantenimiento se divide entre habitable, no entre el tamaño total", () => {
  // Vertical: 62 habitables + 25 de parqueo = 87 de total. Dividir entre 87
  // daría 0.61 y el warehouse dice 0.86.
  const u: Record<string, unknown> = {
    maintenanceTotalPriceM2USD: 57.98, unitSizeM2: 62, parkingSpaces: 2,
    unitType: [{ balconyTerraceSizeM2: 0 }],
  }
  syncUnitParkingSize(u)
  syncUnitHabitableConstruction(u, true, false)
  syncUnitTotalSize(u, true)
  syncUnitMaintenancePerM2(u, vatRatesFor({ usageName: "Venta", iso: "GT" }))
  cerca(u.totalSizeM2, 87, "el total sí suma el parqueo")
  cerca(u.maintenancePricePerM2USD, 0.86, "pero el mantenimiento se divide entre 62")
})

test("una unidad en renta usa ÷1.12 también para el mantenimiento", () => {
  const u: Record<string, unknown> = { maintenanceTotalPriceM2USD: 112, unitSizeM2: 100 }
  syncUnitHabitableConstruction(u, false, false)
  syncUnitMaintenancePerM2(u, vatRatesFor({ usageName: "Renta", iso: "GT" }))
  cerca(u.maintenanceWithoutVATUSD, 100, "112 ÷ 1.12")
  cerca(u.maintenancePricePerM2USD, 1, "100 ÷ 100")
})
