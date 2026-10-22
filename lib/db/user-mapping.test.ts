import { test } from "node:test"
import assert from "node:assert/strict"
import { fromAuthUser, toSessionUser, type AuthUser } from "./user-mapping.ts"

const authUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: "3",
  username: "engteam",
  email: "engteam@example.com",
  emailVerified: true,
  provider: "local",
  role: "super_administrator",
  blocked: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
})

test("el usuario de Better Auth pasa a la forma de StrapiUser", () => {
  assert.deepEqual(toSessionUser(fromAuthUser(authUser())), {
    id: 3,
    username: "engteam",
    email: "engteam@example.com",
    provider: "local",
    confirmed: true,
    blocked: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    role: { id: 0, name: "Super Administrator", type: "super_administrator" },
  })
})

test("campos opcionales ausentes: sin rol, no bloqueado, no confirmado", () => {
  const row = fromAuthUser(authUser({ role: null, blocked: undefined, emailVerified: undefined, provider: null }))
  assert.equal(row.role, "")
  assert.equal(row.blocked, false)
  assert.equal(row.confirmed, false)
  assert.equal(row.provider, "local")
})

test("bloqueado solo si viene true", () => {
  assert.equal(fromAuthUser(authUser({ blocked: true })).blocked, true)
})
