import { test } from "node:test"
import assert from "node:assert/strict"
import { actionFailure, DB_BUSY, PublicError } from "./action-result.ts"
import { CatalogError } from "./catalog-mapping.ts"

const quiet = <T>(work: () => T): T => {
  const original = console.error
  console.error = () => {}
  try {
    return work()
  } finally {
    console.error = original
  }
}

test("los errores públicos llegan al navegador con sus detalles", () => {
  assert.deepEqual(actionFailure(new PublicError("Tu rol no tiene permiso para esta acción."), "x"), {
    ok: false,
    message: "Tu rol no tiene permiso para esta acción.",
  })
  assert.deepEqual(actionFailure(new CatalogError("Datos de catálogo inválidos", ["name: es obligatorio"]), "x"), {
    ok: false,
    message: "Datos de catálogo inválidos",
    details: ["name: es obligatorio"],
  })
})

test("los errores internos no llegan al navegador", () => {
  const prisma = Object.assign(new Error('Invalid `delegate.findMany()` invocation in C:\\app\\chunk.js: role "j_stage_admin"'), {
    code: "P2010",
    details: ["SELECT * FROM msp_app.country"],
  })
  assert.deepEqual(
    quiet(() => actionFailure(prisma, "Error inesperado en la base nueva")),
    { ok: false, message: "Error inesperado en la base nueva" },
  )
  assert.deepEqual(quiet(() => actionFailure("texto suelto", "Error inesperado")), { ok: false, message: "Error inesperado" })
})

test("sin conexiones libres se pide reintentar, sin nombrar el rol", () => {
  for (const code of ["P2037", "53300"]) {
    const error = Object.assign(new Error('too many connections for role "j_stage_admin"'), { code })
    assert.deepEqual(quiet(() => actionFailure(error, "Error inesperado")), { ok: false, message: DB_BUSY })
  }
})
