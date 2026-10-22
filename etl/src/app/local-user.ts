import pg from "pg"
import { APP_LOCAL_PREFIX } from "../load/specs"
import { appPoolConfig } from "./connection"

/**
 * Crea o actualiza en `msp_app.user` una cuenta propia de la app nueva (no viene de Strapi), con
 * `public_id` `app-<usuario>`, y su fila `account` (`credential`) para el login de Better Auth: la
 * carga espejo del ETL no las borra ni las verifica (`localPrefix`).
 *
 * Toma el correo y el hash bcrypt de `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD_HASH` del `.env`, así
 * la clave en texto plano no pasa por aquí. Sin `--apply` solo muestra lo que haría.
 *
 *   npm run app:local-user                      # simulación
 *   npm run app:local-user -- --apply           # escribe
 *   npm run app:local-user -- --role administrator --apply
 */

const ROLES = ["authenticated", "operator", "supervisor", "administrator", "super_administrator"]
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main() {
  const apply = process.argv.includes("--apply")
  const role = arg("role") ?? "super_administrator"
  const email = process.env.DEV_LOGIN_EMAIL?.trim().toLowerCase()
  const hash = process.env.DEV_LOGIN_PASSWORD_HASH?.trim()
  if (!email || !email.includes("@")) throw new Error("Falta DEV_LOGIN_EMAIL en el .env.")
  if (!hash || !BCRYPT.test(hash)) throw new Error("DEV_LOGIN_PASSWORD_HASH no es un hash bcrypt de 60 caracteres.")
  if (!ROLES.includes(role)) throw new Error(`Rol desconocido: ${role}. Permitidos: ${ROLES.join(", ")}`)

  const username = email.split("@")[0]
  const publicId = `${APP_LOCAL_PREFIX}${username}`
  console.log(`cuenta: public_id ${publicId} | usuario ${username} | correo ${email} | rol ${role} | local, confirmada, no bloqueada`)

  const client = new pg.Client(appPoolConfig())
  await client.connect()
  try {
    await client.query("BEGIN")
    const taken = await client.query<{ public_id: string; field: string }>(
      `SELECT public_id, CASE WHEN lower(email) = $2 THEN 'correo' ELSE 'usuario' END AS field
         FROM "user" WHERE public_id <> $1 AND (lower(email) = $2 OR username = $3)`,
      [publicId, email, username],
    )
    if (taken.rows.length > 0) {
      const list = taken.rows.map((r) => `${r.field} usado por ${r.public_id}`).join("; ")
      throw new Error(`No se crea: ${list}.`)
    }
    const existing = await client.query(`SELECT 1 FROM "user" WHERE public_id = $1`, [publicId])
    console.log(existing.rowCount ? "ya existe: se actualizará" : "no existe: se creará")
    if (!apply) {
      await client.query("ROLLBACK")
      console.log("Simulación: no se escribió nada. Repite con --apply.")
      return
    }
    await client.query(
      `INSERT INTO "user" (public_id, username, email, provider, password_hash, role, confirmed, blocked, created_at, updated_at)
       VALUES ($1, $2, $3, 'local', $4, $5::user_role, true, false, now(), now())
       ON CONFLICT (public_id) DO UPDATE SET
         username = EXCLUDED.username, email = EXCLUDED.email, provider = 'local',
         password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, blocked = false, updated_at = now()`,
      [publicId, username, email, hash, role],
    )
    // Better Auth lee la clave de la cuenta `credential` (no de `user.password_hash`) y exige
    // `account_id` = id del usuario.
    await client.query(
      `INSERT INTO account (user_id, account_id, provider_id, password, created_at, updated_at)
       SELECT id, id::text, 'credential', $2, now(), now() FROM "user" WHERE public_id = $1
       ON CONFLICT (user_id, provider_id) DO UPDATE SET
         account_id = EXCLUDED.account_id, password = EXCLUDED.password, updated_at = now()`,
      [publicId, hash],
    )
    await client.query("COMMIT")
    console.log("Listo.")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
