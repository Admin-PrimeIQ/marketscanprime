/**
 * Secreto de la ruta del cron (`app/api/cron/exchange-rates`).
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { isCronSecretConfigured, isValidCronBearer } from "./cron-secret.ts"

const SECRET = "a".repeat(16) + "B".repeat(16) + "-c1"

test("sin secreto, o con uno corto, la ruta queda apagada", () => {
  assert.equal(isCronSecretConfigured(undefined), false)
  assert.equal(isCronSecretConfigured(""), false)
  assert.equal(isCronSecretConfigured("x".repeat(31)), false)
  assert.equal(isCronSecretConfigured("x".repeat(32)), true)
  assert.equal(isValidCronBearer("Bearer " + "x".repeat(31), "x".repeat(31)), false)
})

test("solo acepta Bearer con el secreto exacto", () => {
  assert.equal(isValidCronBearer(`Bearer ${SECRET}`, SECRET), true)
  assert.equal(isValidCronBearer(`Bearer ${SECRET}x`, SECRET), false)
  assert.equal(isValidCronBearer(`Bearer ${SECRET.slice(1)}`, SECRET), false)
  assert.equal(isValidCronBearer(SECRET, SECRET), false)
  assert.equal(isValidCronBearer(`Basic ${SECRET}`, SECRET), false)
  assert.equal(isValidCronBearer(null, SECRET), false)
  assert.equal(isValidCronBearer("Bearer ", SECRET), false)
})
