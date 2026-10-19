import type { Resolved } from "../model"
import type { Collection, RawRow } from "../snapshot"
import type { AppRow, AppTable } from "../specs"
import { doc, numeric, stamps, text } from "./common"

/** Catálogo de Strapi → tabla de msp_app. */
export const CATALOG_SOURCES: [Collection, AppTable][] = [
  ["amenities", "amenity"],
  ["services", "service"],
  ["countries", "country"],
  ["developers", "developer"],
  ["nses", "nse"],
  ["security_types", "security_type"],
  ["block_categories", "block_category"],
  ["block_focuses", "block_focus"],
  ["block_statuses", "block_status"],
  ["unit_parking_types", "unit_parking_type"],
  ["unit_topographies", "unit_topography"],
  ["unit_usages", "unit_usage"],
  ["exchange_rate_profiles", "exchange_rate_profile"],
]

const EXTRA: Partial<Record<AppTable, string[]>> = {
  amenity: ["category"],
  service: ["category"],
  country: ["iso_code", "iso_code_2"],
  developer: ["address", "phone", "email", "website", "tax_id", "contact_person", "contact_phone", "contact_email"],
}

export function catalogRow(table: AppTable, row: RawRow): AppRow {
  const out: AppRow = {
    public_id: doc(row),
    code: text(row.code),
    name: text(row.name),
    description: text(row.description),
    ...stamps(row),
  }
  for (const column of EXTRA[table] ?? []) out[column] = text(row[column])
  return out
}

export function profileCurrencies(resolved: Resolved): AppRow[] {
  const rows: AppRow[] = []
  for (const [profileId, list] of resolved.currencies) {
    const profile = resolved.present.exchange_rate_profiles.get(profileId)!
    for (const { currency, buy, sell } of list) {
      rows.push({ profile_id: doc(profile), currency, buy_rate: numeric(buy), sell_rate: numeric(sell) })
    }
  }
  return rows
}
