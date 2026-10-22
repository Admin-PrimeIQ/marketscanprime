import type { Resolved } from "../model"
import type { RawRow } from "../snapshot"
import type { AppRow } from "../specs"
import { bool, doc, stamps, text } from "./common"

/**
 * El hash bcrypt de `up_users.password` se copia tal cual: nadie tiene que cambiar su contraseña.
 * `reset_password_token` no se migra: en Strapi no tiene vencimiento y en la app nueva sí.
 */
export function userRow(resolved: Resolved, row: RawRow): AppRow {
  const roleId = resolved.rel.userRole.get(Number(row.id))
  const role = roleId === undefined ? null : text(resolved.present.up_roles.get(roleId)?.type)
  return {
    public_id: doc(row),
    username: text(row.username),
    email: text(row.email),
    provider: text(row.provider) ?? "local",
    password_hash: text(row.password),
    role,
    confirmed: bool(row.confirmed) ?? "false",
    blocked: bool(row.blocked) ?? "false",
    ...stamps(row),
  }
}

/**
 * Cuenta `credential` de Better Auth por cada usuario local con clave: el login lee el hash de
 * `account.password`, no de `user.password_hash`. Better Auth exige `account_id` = id del usuario:
 * aquí va su `public_id` y la carga lo resuelve como las demás `ref`.
 */
export function credentialAccounts(users: AppRow[]): AppRow[] {
  return users
    .filter((u) => u.provider === "local" && u.password_hash)
    .map((u) => ({
      user_id: u.public_id,
      account_id: u.public_id,
      provider_id: "credential",
      password: u.password_hash,
      created_at: u.created_at,
      updated_at: u.updated_at,
    }))
}
