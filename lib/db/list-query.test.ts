import { test } from "node:test"
import assert from "node:assert/strict"
import { missingRefs, parseSort, refsWhere, splitRefs, whereUnique } from "./list-query.ts"

const allowed = new Set(["id", "name", "code"])
const toError = (message: string) => new Error(message)

test("parseSort traduce el sort de Strapi y desempata por id", () => {
  assert.deepEqual(parseSort(undefined, allowed, toError), [{ id: "asc" }])
  assert.deepEqual(parseSort("name:DESC, code", allowed, toError), [{ name: "desc" }, { code: "asc" }, { id: "asc" }])
  assert.deepEqual(parseSort("id:desc", allowed, toError), [{ id: "desc" }])
})

test("parseSort deja los vacíos donde los ponía el MySQL de Strapi en los campos nullable", () => {
  const nullable = new Set(["code"])
  assert.deepEqual(parseSort("code:desc", allowed, toError, nullable), [{ code: { sort: "desc", nulls: "last" } }, { id: "asc" }])
  assert.deepEqual(parseSort("code,name", allowed, toError, nullable), [
    { code: { sort: "asc", nulls: "first" } },
    { name: "asc" },
    { id: "asc" },
  ])
})

test("parseSort rechaza campos no permitidos y direcciones inválidas", () => {
  assert.throws(() => parseSort("password:asc", allowed, toError), /No se puede ordenar por "password"/)
  assert.throws(() => parseSort("name:up", allowed, toError), /Dirección de orden inválida/)
})

test("splitRefs separa ids numéricos de documentId, sin repetidos ni vacíos", () => {
  assert.deepEqual(splitRefs([3, "3", "abc", " abc ", "", "12"]), { ids: [3, 12], publicIds: ["abc"] })
})

test("refsWhere arma el OR solo con lo que hay", () => {
  assert.equal(refsWhere({ ids: [], publicIds: [] }), null)
  assert.deepEqual(refsWhere({ ids: [1], publicIds: [] }), { OR: [{ id: { in: [1] } }] })
  assert.deepEqual(refsWhere({ ids: [1], publicIds: ["a"] }), { OR: [{ id: { in: [1] } }, { publicId: { in: ["a"] } }] })
})

test("missingRefs nombra las referencias que no se encontraron", () => {
  const refs = { ids: [1, 2], publicIds: ["a", "b"] }
  assert.deepEqual(missingRefs(refs, [{ id: 1, publicId: "x" }, { id: 9, publicId: "b" }]), ["2", "a"])
})

test("whereUnique distingue id numérico de publicId", () => {
  assert.deepEqual(whereUnique(5, toError), { id: 5 })
  assert.deepEqual(whereUnique(" 42 ", toError), { id: 42 })
  assert.deepEqual(whereUnique("doc-1", toError), { publicId: "doc-1" })
  assert.throws(() => whereUnique("  ", toError), /ID vacío/)
})
