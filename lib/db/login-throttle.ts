import {
  ACCOUNT_LIMIT,
  combineDecisions,
  decide,
  IP_LIMIT,
  type ThrottleDecision,
  type ThrottleHit,
  type ThrottleKeys,
  type ThrottleLimit,
} from "@/lib/auth/login-throttle"
import type { PrismaClient } from "./generated/client"

// Las filas sin bloqueo vigente y sin uso en un día ya no cuentan para nada.
const STALE_MS = 24 * 60 * 60_000

/** Contadores de `msp_app.login_attempt` para `loginAction`. Reglas en `lib/auth/login-throttle.ts`. */
export function createLoginThrottle(prisma: PrismaClient) {
  /**
   * Suma el intento en un solo `INSERT … ON CONFLICT` (atómico: dos intentos simultáneos no leen el
   * mismo contador). La ventana se reinicia si venció y la clave no está bloqueada.
   */
  async function hit(key: string, limit: ThrottleLimit, now: Date): Promise<ThrottleDecision> {
    const windowFloor = new Date(now.getTime() - limit.windowMs)
    const rows = await prisma.$queryRaw<ThrottleHit[]>`
      INSERT INTO "login_attempt" ("key", "fail_count", "window_start", "updated_at")
      VALUES (${key}, 1, ${now}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "fail_count" = CASE
          WHEN "login_attempt"."window_start" <= ${windowFloor}
           AND ("login_attempt"."locked_until" IS NULL OR "login_attempt"."locked_until" <= ${now})
          THEN 1 ELSE "login_attempt"."fail_count" + 1 END,
        "window_start" = CASE
          WHEN "login_attempt"."window_start" <= ${windowFloor}
           AND ("login_attempt"."locked_until" IS NULL OR "login_attempt"."locked_until" <= ${now})
          THEN ${now} ELSE "login_attempt"."window_start" END,
        "locked_until" = CASE WHEN "login_attempt"."locked_until" <= ${now} THEN NULL ELSE "login_attempt"."locked_until" END,
        "updated_at" = ${now}
      RETURNING "fail_count" AS "failCount", "locked_until" AS "lockedUntil"`
    const decision = decide(rows[0], now, limit)
    if (!decision.allowed && decision.lockUntil) {
      await prisma.$executeRaw`
        UPDATE "login_attempt" SET "locked_until" = ${decision.lockUntil}, "updated_at" = ${now}
        WHERE "key" = ${key} AND ("locked_until" IS NULL OR "locked_until" <= ${now})`
    }
    return decision
  }

  return {
    /** Registra el intento en la cuenta y en la IP y dice si se puede comprobar la clave. */
    async attempt(keys: ThrottleKeys, now = new Date()): Promise<ThrottleDecision> {
      const [account, ip] = await Promise.all([hit(keys.account, ACCOUNT_LIMIT, now), hit(keys.ip, IP_LIMIT, now)])
      return combineDecisions(account, ip)
    },

    /** Login correcto: la cuenta empieza de cero y el intento no cuenta contra la IP. */
    async succeeded(keys: ThrottleKeys, now = new Date()): Promise<void> {
      const staleBefore = new Date(now.getTime() - STALE_MS)
      await prisma.$transaction([
        prisma.$executeRaw`DELETE FROM "login_attempt" WHERE "key" = ${keys.account}`,
        prisma.$executeRaw`
          UPDATE "login_attempt" SET "fail_count" = GREATEST("fail_count" - 1, 0), "updated_at" = ${now}
          WHERE "key" = ${keys.ip}`,
        prisma.$executeRaw`
          DELETE FROM "login_attempt"
          WHERE "updated_at" < ${staleBefore} AND ("locked_until" IS NULL OR "locked_until" <= ${now})`,
      ])
    },
  }
}
