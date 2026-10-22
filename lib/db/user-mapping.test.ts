import { test } from "node:test"
import assert from "node:assert/strict"
import { canPasswordLogin, devAccountUser, devLoginAccount, toSessionUser, type UserRow } from "./user-mapping.ts"

const user = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: 3,
  username: "engteam",
  email: "engteam@example.com",
  provider: "local",
  passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
  role: "super_administrator",
  confirmed: true,
  blocked: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
})

test("solo entran cuentas locales, no bloqueadas y con hash", () => {
  assert.equal(canPasswordLogin(user()), true)
  assert.equal(canPasswordLogin(null), false)
  assert.equal(canPasswordLogin(user({ blocked: true })), false)
  assert.equal(canPasswordLogin(user({ passwordHash: null })), false)
  assert.equal(canPasswordLogin(user({ provider: "google" })), false)
})

test("la sesión lleva la forma de StrapiUser y nunca el hash", () => {
  const session = toSessionUser(user())
  assert.deepEqual(session, {
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
  assert.equal(JSON.stringify(session).includes("$2a$"), false)
})

test("la cuenta de desarrollo solo existe con correo y hash", () => {
  assert.equal(devLoginAccount({}), null)
  assert.equal(devLoginAccount({ DEV_LOGIN_EMAIL: "a@b.com" }), null)
  assert.deepEqual(devLoginAccount({ DEV_LOGIN_EMAIL: " a@b.com ", DEV_LOGIN_PASSWORD_HASH: "$2a$10$x" }), {
    email: "a@b.com",
    passwordHash: "$2a$10$x",
  })
  const session = toSessionUser(devAccountUser("engteam@example.com"))
  assert.equal(session.username, "engteam")
  assert.deepEqual(session.role, { id: 0, name: "Administrator", type: "administrator" })
})
