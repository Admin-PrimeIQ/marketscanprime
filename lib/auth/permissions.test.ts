import { test } from "node:test"
import assert from "node:assert/strict"
import { can, USER_ROLES, type Permission } from "./permissions.ts"

const ALL: Permission[] = ["read", "create", "update", "delete", "manageUsers", "superAdmin"]
const allowed = (role: string) => ALL.filter((p) => can(role, p))

test("matriz de Strapi rol por rol", () => {
  assert.deepEqual(allowed("authenticated"), ["read"])
  assert.deepEqual(allowed("operator"), ["read", "create", "update"])
  assert.deepEqual(allowed("supervisor"), ["read", "create", "update", "delete"])
  assert.deepEqual(allowed("administrator"), ["read", "create", "update", "delete", "manageUsers"])
  assert.deepEqual(allowed("super_administrator"), ALL)
})

test("el operator no borra", () => {
  assert.equal(can("operator", "delete"), false)
})

test("un rol desconocido, vacío o con otra forma no puede nada", () => {
  for (const role of ["", "public", "Super Administrator", "SUPER_ADMINISTRATOR", null, undefined, 3]) {
    assert.deepEqual(allowed(role as string), [], String(role))
  }
})

test("cubre todos los valores del enum UserRole", () => {
  for (const role of USER_ROLES) assert.ok(can(role, "read"), role)
})
