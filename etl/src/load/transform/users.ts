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
