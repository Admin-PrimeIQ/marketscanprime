import { ENUMS, UNDEFINED_NAME, UNDEFINED_PROJECT, UNDEFINED_STAMP, undefinedBlock, type Resolved } from "../model"
import { SPEC_BY_TABLE, SPECS, type AppData, type AppRow, type AppTable } from "../specs"
import { blockFinancing, blockRow } from "./blocks"
import { CATALOG_SOURCES, catalogRow, profileCurrencies } from "./catalogs"
import { projectLinks, projectRow } from "./projects"
import { unitRow, unitTypes } from "./units"
import { credentialAccounts, userRow } from "./users"

/**
 * Snapshot validado → filas de `msp_app`. Funciones puras: las relaciones ya vienen resueltas
 * (una sola por dueño) y las columnas `ref` llevan el `public_id` del padre.
 */
export function transform(resolved: Resolved): AppData {
  const { present } = resolved
  const data = Object.fromEntries(SPECS.map((s) => [s.table, []])) as unknown as AppData

  for (const [source, table] of CATALOG_SOURCES) {
    data[table] = [...present[source].values()].map((row) => catalogRow(table, row))
  }
  data.exchange_rate_profile_currency = profileCurrencies(resolved)

  data.project = [...present.projects.values()].map((row) => projectRow(resolved, row))
  const links = projectLinks(resolved)
  data.project_amenity = links.amenities
  data.project_service = links.services

  data.block = [...present.blocks.values()].map((row) => blockRow(resolved, row))
  const financing = blockFinancing(resolved)
  data.block_financing = financing.financing
  data.block_bank_rate = financing.bankRates

  data.unit = [...present.units.values()].map((row) => unitRow(resolved, row))
  const types = unitTypes(resolved)
  data.unit_housing = types.housing
  data.unit_office = types.office
  data.unit_industrial = types.industrial

  data.user = [...present.up_users.values()].map((row) => userRow(resolved, row))
  data.account = credentialAccounts(data.user)
  addUndefinedParents(data)
  return data
}

function undefinedRow(table: AppTable, fields: AppRow): AppRow {
  const row: AppRow = Object.fromEntries(SPEC_BY_TABLE[table].columns.map((c) => [c.name, null]))
  return { ...row, name: UNDEFINED_NAME, created_at: UNDEFINED_STAMP, updated_at: UNDEFINED_STAMP, ...fields }
}

/** Crea el proyecto y los bloques «No definido» que usan los hijos sin relación obligatoria. */
function addUndefinedParents(data: AppData) {
  const usedBlocks = new Set(data.unit.map((u) => u.block_id))
  for (const domain of ENUMS.block_domain) {
    const publicId = undefinedBlock(domain)
    if (usedBlocks.has(publicId)) data.block.push(undefinedRow("block", { public_id: publicId, project_id: UNDEFINED_PROJECT, domain }))
  }
  if (data.block.some((b) => b.project_id === UNDEFINED_PROJECT)) {
    data.project.push(undefinedRow("project", { public_id: UNDEFINED_PROJECT }))
  }
}

export function countRows(data: AppData): Record<AppTable, number> {
  return Object.fromEntries(SPECS.map((s) => [s.table, data[s.table].length])) as Record<AppTable, number>
}
