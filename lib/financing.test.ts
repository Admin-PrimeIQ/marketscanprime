/**
 * Lo que el formulario le manda a Strapi al guardar un bloque.
 *
 * Existe por un fallo de producción: la v1.24.0 devolvía el financiamiento tal
 * como lo había leído, con los `id` que Strapi pone al responder y rechaza al
 * recibir. Guardar un bloque de vivienda con financiamiento daba 400 "Invalid
 * key id" y no guardaba nada, aunque no se hubiera tocado un campo.
 *
 * Los casos de acá son el payload REAL que mandó un navegador el 2026-09-11.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { financingParaGuardar, type BlockFinancing } from "./financing.ts"

/** El financiamiento de "Aroa - Torre Norte", copiado del PUT que falló. */
const DEL_NAVEGADOR = {
  id: 492,
  downPaymentPercent: 20,
  fractionalDownPayment: true,
  fractionalDownPaymentFHA: null,
  fractionalInstallmentsOtherBanks: null,
  minDownPaymentFHA: null,
  minDownPaymentOtherBanks: 20,
  maxLoanTermYearsFHA: null,
  maxLoanTermYearsBanks: 32,
  maxLoanTermYearsOwner: null,
  bac: { id: 943, annualRatePercent: 8.5 },
  banrural: { id: 944, annualRatePercent: 8.5 },
  bi: { id: 945, annualRatePercent: 8.5 },
  gtc: { id: 946, annualRatePercent: 8.5 },
  bam: null, azteca: null, credicorp: null, bantrab: null,
  inmobiliario: null, internacional: null, inv: null, antigua: null,
  chn: null, fha: null, ficohsa: null, promerica: null,
  vivibanco: null, ownerFinancing: null,
} as unknown as BlockFinancing

test("no queda ningún id, ni el de la raíz ni el de los bancos", () => {
  // Los dos rompen por separado: comprobado contra la instancia real, quitar
  // sólo el de la raíz seguía devolviendo 400.
  const limpio = financingParaGuardar(DEL_NAVEGADOR)
  assert.ok(!JSON.stringify(limpio).includes('"id"'), `quedó un id: ${JSON.stringify(limpio)}`)
})

test("los cuatro bancos y sus tasas sobreviven", () => {
  const limpio = financingParaGuardar(DEL_NAVEGADOR) as Record<string, { annualRatePercent: number } | null>
  const activos = Object.entries(limpio)
    .filter(([, v]) => v !== null && typeof v === "object")
    .map(([k]) => k)
    .sort()
  assert.deepEqual(activos, ["bac", "banrural", "bi", "gtc"])
  for (const b of activos) assert.equal(limpio[b]?.annualRatePercent, 8.5, `tasa de ${b}`)
})

test("los términos del desarrollo no se tocan", () => {
  const l = financingParaGuardar(DEL_NAVEGADOR) as Record<string, unknown>
  assert.equal(l.downPaymentPercent, 20)
  assert.equal(l.fractionalDownPayment, true)
  assert.equal(l.maxLoanTermYearsBanks, 32)
  assert.equal(l.minDownPaymentOtherBanks, 20)
  assert.equal(l.maxLoanTermYearsFHA, null, "un término vacío sigue vacío")
})

test("un banco ausente sigue ausente: null, no un objeto vacío", () => {
  const l = financingParaGuardar(DEL_NAVEGADOR) as Record<string, unknown>
  assert.equal(l.fha, null, "no trabajar con un banco es distinto de trabajar con tasa cero")
  assert.equal(l.ownerFinancing, null)
})

test("el interruptor apagado se manda como null y borra el componente", () => {
  assert.equal(financingParaGuardar(null), null)
  assert.equal(financingParaGuardar(undefined), null)
})

test("un banco con la tasa en blanco se conserva, con la tasa en null", () => {
  // Agregar el banco y no llenar la tasa todavía es un estado legítimo del
  // formulario; perderlo al guardar borraría lo que el tabulador acababa de
  // elegir.
  const l = financingParaGuardar({ bac: { id: 1 } } as unknown as BlockFinancing) as Record<
    string,
    { annualRatePercent: number | null } | null
  >
  assert.deepEqual(l.bac, { annualRatePercent: null })
})

test("un financiamiento que nunca pasó por Strapi no se altera", () => {
  // El que arma la tarjeta al encenderla no trae ids; tiene que sobrevivir igual.
  const nuevo = { downPaymentPercent: 15, bi: { annualRatePercent: 9 } } as BlockFinancing
  assert.deepEqual(financingParaGuardar(nuevo), nuevo)
})
