/**
 * Bloqueo optimista de unidades, ejecutado.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { findStaleUnits } from "./concurrency.ts"

const T0 = "2026-10-29T20:00:00.123Z"

test("sin cambios desde que se cargó: nada que rechazar", () => {
  assert.deepEqual(findStaleUnits([{ id: "u1", updatedAt: T0 }], [{ id: "u1", updatedAt: new Date(T0) }]), [])
})

test("otra persona guardó después: modificada, con las dos fechas", () => {
  assert.deepEqual(findStaleUnits([{ id: "u1", updatedAt: T0 }], [{ id: "u1", updatedAt: new Date("2026-10-29T20:00:05.000Z") }]), [
    { id: "u1", reason: "modificada", expected: T0, current: "2026-10-29T20:00:05.000Z" },
  ])
})

test("la unidad ya no existe: borrada", () => {
  assert.deepEqual(findStaleUnits([{ id: "u1", updatedAt: T0 }], []), [{ id: "u1", reason: "borrada", expected: T0, current: null }])
})

test("fecha inválida de la hoja: sin-version, no se guarda a ciegas", () => {
  const [stale] = findStaleUnits([{ id: "u1", updatedAt: "" }], [{ id: "u1", updatedAt: new Date(T0) }])
  assert.equal(stale.reason, "sin-version")
})

test("compara en milisegundos: el mismo instante en otro formato no es conflicto", () => {
  assert.deepEqual(findStaleUnits([{ id: "u1", updatedAt: "2026-10-29T14:00:00.123-06:00" }], [{ id: "u1", updatedAt: T0 }]), [])
})

test("solo devuelve las que tienen conflicto, en el orden en que llegaron", () => {
  const stale = findStaleUnits(
    [
      { id: "u1", updatedAt: T0 },
      { id: "u2", updatedAt: T0 },
      { id: "u3", updatedAt: T0 },
    ],
    [
      { id: "u1", updatedAt: new Date(T0) },
      { id: "u2", updatedAt: new Date("2026-10-29T21:00:00.000Z") },
    ],
  )
  assert.deepEqual(stale.map((s) => [s.id, s.reason]), [
    ["u2", "modificada"],
    ["u3", "borrada"],
  ])
})
