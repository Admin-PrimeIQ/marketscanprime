import { emptyTables, type RawRow, type Snapshot } from "./snapshot"

/**
 * Snapshot sintético y coherente para las pruebas: un país, un proyecto con amenidad y perfil
 * de cambio, un bloque con financiamiento y dos unidades, y un usuario. Sin datos reales.
 */

const STAMP = "2026-10-01T12:00:00.000Z"

export const published = (id: number, documentId: string, fields: RawRow = {}): RawRow => ({
  id,
  document_id: documentId,
  created_at: STAMP,
  updated_at: STAMP,
  published_at: STAMP,
  ...fields,
})

export const draft = (id: number, documentId: string, fields: RawRow = {}): RawRow => ({
  ...published(id, documentId, fields),
  published_at: null,
})

export function fixture(): Snapshot {
  const t = emptyTables()
  t.countries = [published(1, "country-gt", { name: "Guatemala", code: "GT", iso_code: "GTM", iso_code_2: "GT" })]
  t.amenities = [published(20, "amenity-pool", { name: "Piscina", category: "Recreación" })]
  t.exchange_rate_profiles = [published(50, "profile-gt", { name: "Quetzal" })]
  t.projects = [published(10, "project-1", { name: "Proyecto Uno", latitude: "14.6000000000", muvi: true })]
  t.projects_country_lnk = [{ id: 1, project_id: 10, country_id: 1 }]
  t.projects_amenities_lnk = [{ id: 1, project_id: 10, amenity_id: 20, amenity_ord: 1 }]
  t.projects_exchange_rate_profile_lnk = [{ id: 1, project_id: 10, exchange_rate_profile_id: 50 }]

  t.blocks = [published(30, "block-1", { code: "B-001", name: "Torre A", domain: "housing", quarter: "T1", market: "Primary", block_usage: "Venta", collection_date: "2026-09-15T00:00:00.000Z", total_m_2: "1500.00" })]
  t.blocks_project_lnk = [{ id: 1, block_id: 30, project_id: 10, block_ord: 1 }]
  t.blocks_cmps = [{ id: 1, entity_id: 30, cmp_id: 1, component_type: "financing.financing", field: "financing", order: 1 }]
  t.components_financing_financings = [{ id: 1, down_payment_percent: "10.00", fractional_down_payment: true, max_loan_term_years_banks: 25 }]
  t.components_financing_financings_cmps = [{ id: 1, entity_id: 1, cmp_id: 1, component_type: "financing.bank-rate", field: "bi", order: 1 }]
  t.components_financing_bank_rates = [{ id: 1, annual_rate_percent: "7.50" }]

  t.units = [
    published(40, "unit-1", { code: "U-001", availability: "Available", total_price_usd: "100000.50", unit_size_m_2: "85.5000" }),
    published(41, "unit-2", { code: "U-002", availability: "Not Available", total_price_usd: "200000.25" }),
  ]
  t.units_block_lnk = [
    { id: 1, unit_id: 40, block_id: 30 },
    { id: 2, unit_id: 41, block_id: 30 },
  ]
  t.units_cmps = [{ id: 1, entity_id: 40, cmp_id: 1, component_type: "unit-types.housing", field: "unitType", order: 1 }]
  t.components_unit_types_housings = [{ id: 1, bedrooms: 3, balcony_terrace_size_m_2: "5.50" }]

  t.exchange_rate_profiles_cmps = [{ id: 1, entity_id: 50, cmp_id: 1, component_type: "currencies.currencies", field: "currencies", order: 1 }]
  t.components_currencies_currencies = [{ id: 1 }]
  t.components_currencies_currencies_cmps = [{ id: 1, entity_id: 1, cmp_id: 1, component_type: "currencies.currency-quetzal", field: "gtq", order: 1 }]
  t.components_currencies_currency_quetzals = [{ id: 1, buy_rate: "7.75000000", sell_rate: "7.80000000" }]

  t.up_roles = [published(60, "role-admin", { name: "Administrator", type: "administrator" })]
  t.up_users = [published(70, "user-ana", { username: "ana", email: "ana@example.com", password: "$2a$10$hash", provider: "local", confirmed: true, blocked: null })]
  t.up_users_role_lnk = [{ id: 1, user_id: 70, role_id: 60, user_ord: 1 }]

  return {
    meta: { name: "fixture", mode: "full", sampleBlocks: [], startedAt: STAMP, finishedAt: STAMP, counts: {} },
    tables: t,
  }
}
