import { test } from "node:test"
import assert from "node:assert/strict"
import { codeSourceName, nextFreeCode, slugifyBlockCode } from "./block-code.ts"

test("slugifyBlockCode quita acentos, baja a minúsculas y une con guiones", () => {
  assert.equal(slugifyBlockCode("Torre Ñandú - Fase 3 / Sector B"), "torre-nandu-fase-3-sector-b")
  assert.equal(slugifyBlockCode("  --Árbol--  "), "arbol")
  assert.equal(slugifyBlockCode("¿?"), "")
  assert.equal(slugifyBlockCode(""), "")
})

test("nextFreeCode devuelve la base libre o el primer sufijo libre", () => {
  assert.equal(nextFreeCode("torre", []), "torre")
  assert.equal(nextFreeCode("torre", ["torre"]), "torre-1")
  assert.equal(nextFreeCode("torre", ["torre", "torre-1", "torre-3", null]), "torre-2")
  assert.equal(nextFreeCode("torre", ["torre-1", "torre-norte"]), "torre")
})

test("codeSourceName: al crear siempre genera; al editar solo si cambió el nombre o no hay código", () => {
  assert.equal(codeSourceName("Torre A", null), "Torre A")
  assert.equal(codeSourceName("Torre A", { name: "Torre A", code: "torre-a-1" }), null)
  assert.equal(codeSourceName("Torre B", { name: "Torre A", code: "torre-a" }), "Torre B")
  assert.equal(codeSourceName("Torre A", { name: "Torre A", code: null }), "Torre A")
  assert.equal(codeSourceName(undefined, { name: "Torre A", code: null }), null)
})
