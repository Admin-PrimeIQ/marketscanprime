import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ACCOUNT_LIMIT,
  clientIp,
  combineDecisions,
  decide,
  IP_LIMIT,
  throttleKeys,
  tooManyAttemptsMessage,
} from "./login-throttle.ts"

const now = new Date("2026-10-28T15:00:00Z")

test("las claves normalizan el identificador como el login", () => {
  assert.deepEqual(throttleKeys("  JNoriega@PrimeLatam.com ", "1.2.3.4"), {
    account: "acct:jnoriega@primelatam.com",
    ip: "ip:1.2.3.4",
  })
  assert.equal(throttleKeys("engteam", "").ip, "ip:unknown")
})

test("la IP sale de x-real-ip o del primer valor de x-forwarded-for", () => {
  const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null })
  assert.equal(clientIp(headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" })), "9.9.9.9")
  assert.equal(clientIp(headers({ "x-forwarded-for": " 1.1.1.1 , 10.0.0.1" })), "1.1.1.1")
  assert.equal(clientIp(headers({})), "unknown")
})

test("se permiten exactamente `max` intentos por ventana", () => {
  for (let failCount = 1; failCount <= ACCOUNT_LIMIT.max; failCount++) {
    assert.deepEqual(decide({ failCount, lockedUntil: null }, now, ACCOUNT_LIMIT), { allowed: true })
  }
  assert.deepEqual(decide({ failCount: ACCOUNT_LIMIT.max + 1, lockedUntil: null }, now, ACCOUNT_LIMIT), {
    allowed: false,
    retryAfterMs: ACCOUNT_LIMIT.lockMs,
    lockUntil: new Date(now.getTime() + ACCOUNT_LIMIT.lockMs),
  })
})

test("una clave bloqueada se rechaza hasta que vence el bloqueo", () => {
  const lockedUntil = new Date(now.getTime() + 4 * 60_000)
  assert.deepEqual(decide({ failCount: 1, lockedUntil }, now, IP_LIMIT), { allowed: false, retryAfterMs: 4 * 60_000 })
  assert.deepEqual(decide({ failCount: 1, lockedUntil: new Date(now.getTime() - 1) }, now, IP_LIMIT), { allowed: true })
})

test("basta con que la cuenta o la IP rechacen; manda la espera más larga", () => {
  assert.deepEqual(combineDecisions({ allowed: true }, { allowed: true }), { allowed: true })
  assert.deepEqual(
    combineDecisions({ allowed: false, retryAfterMs: 60_000 }, { allowed: true }, { allowed: false, retryAfterMs: 90_000 }),
    { allowed: false, retryAfterMs: 90_000 },
  )
})

test("el mensaje redondea los minutos hacia arriba", () => {
  assert.match(tooManyAttemptsMessage(15 * 60_000), /en 15 minutos\.$/)
  assert.match(tooManyAttemptsMessage(61_000), /en 2 minutos\.$/)
  assert.match(tooManyAttemptsMessage(1_000), /en 1 minuto\.$/)
})
