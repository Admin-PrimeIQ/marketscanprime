import {
  CATEGORIES,
  CURRENCY_FIELDS,
  ENUMS,
  FINANCING_COMPONENT,
  UNIT_TYPE_COMPONENTS,
  WARNING_CATEGORIES,
  type Category,
  type Exclusion,
  type Issue,
  type ManyToOneKey,
  type Present,
  type Resolved,
  type SetKey,
} from "./model"
import { COLLECTIONS, type Collection, type RawRow, type Snapshot, type StrapiTable } from "./snapshot"

/**
 * Validación del snapshot antes de escribir nada.
 *
 * Toda incidencia de severidad `fatal` aborta la corrida, salvo que su categoría se acepte con
 * `--allow`: entonces se excluye la fila dueña y, en cascada, todo lo que depende de ella.
 * Las relaciones se resuelven aquí una sola vez (`Resolved`) y la transformación las usa tal cual.
 */

export interface ValidationResult {
  issues: Issue[]
  /** Incidencias fatales cuya categoría no se aceptó: si hay alguna, no se escribe nada. */
  blocking: Issue[]
  exclusions: Exclusion[]
  /** Vínculos ignorados porque su dueño no está publicado o no existe (no son errores). */
  ignoredLinks: Partial<Record<StrapiTable, number>>
  resolved: Resolved
}

interface ManyToOneDef {
  key: ManyToOneKey
  lnk: StrapiTable
  owner: Collection
  ownerCol: string
  target: Collection
  targetCol: string
  /** Categoría si el dueño no tiene destino (relación obligatoria en el esquema nuevo). */
  missing?: Category
}

const MANY_TO_ONE: ManyToOneDef[] = [
  { key: "projectCountry", lnk: "projects_country_lnk", owner: "projects", ownerCol: "project_id", target: "countries", targetCol: "country_id" },
  { key: "projectDeveloper", lnk: "projects_developer_lnk", owner: "projects", ownerCol: "project_id", target: "developers", targetCol: "developer_id" },
  { key: "projectNse", lnk: "projects_nse_lnk", owner: "projects", ownerCol: "project_id", target: "nses", targetCol: "nse_id" },
  { key: "projectSecurityType", lnk: "projects_security_type_lnk", owner: "projects", ownerCol: "project_id", target: "security_types", targetCol: "security_type_id" },
  { key: "projectProfile", lnk: "projects_exchange_rate_profile_lnk", owner: "projects", ownerCol: "project_id", target: "exchange_rate_profiles", targetCol: "exchange_rate_profile_id" },
  { key: "blockProject", lnk: "blocks_project_lnk", owner: "blocks", ownerCol: "block_id", target: "projects", targetCol: "project_id", missing: "bloque-sin-proyecto" },
  { key: "blockCategory", lnk: "blocks_block_category_lnk", owner: "blocks", ownerCol: "block_id", target: "block_categories", targetCol: "block_category_id" },
  { key: "blockFocus", lnk: "blocks_block_focus_lnk", owner: "blocks", ownerCol: "block_id", target: "block_focuses", targetCol: "block_focus_id" },
  { key: "blockStatus", lnk: "blocks_block_status_lnk", owner: "blocks", ownerCol: "block_id", target: "block_statuses", targetCol: "block_status_id" },
  { key: "unitBlock", lnk: "units_block_lnk", owner: "units", ownerCol: "unit_id", target: "blocks", targetCol: "block_id", missing: "unidad-sin-bloque" },
  { key: "unitUsage", lnk: "units_unit_usage_lnk", owner: "units", ownerCol: "unit_id", target: "unit_usages", targetCol: "unit_usage_id" },
  { key: "unitTopography", lnk: "units_topography_lnk", owner: "units", ownerCol: "unit_id", target: "unit_topographies", targetCol: "unit_topography_id" },
  { key: "unitParkingType", lnk: "units_parking_type_lnk", owner: "units", ownerCol: "unit_id", target: "unit_parking_types", targetCol: "unit_parking_type_id" },
  { key: "userRole", lnk: "up_users_role_lnk", owner: "up_users", ownerCol: "user_id", target: "up_roles", targetCol: "role_id", missing: "rol-invalido" },
]

interface SetDef {
  key: SetKey
  lnk: StrapiTable
  target: Collection
  targetCol: string
  /** Orden del destino dentro del proyecto. */
  ordCol: string
}

const SETS: SetDef[] = [
  { key: "projectAmenities", lnk: "projects_amenities_lnk", target: "amenities", targetCol: "amenity_id", ordCol: "amenity_ord" },
  // El servicio es el lado dueño en Strapi; service_ord es el orden del servicio dentro del proyecto.
  { key: "projectServices", lnk: "services_projects_lnk", target: "services", targetCol: "service_id", ordCol: "service_ord" },
]

/** Colecciones con `name` obligatorio en el esquema nuevo. */
const NAMED: Collection[] = [
  "amenities",
  "services",
  "countries",
  "developers",
  "nses",
  "security_types",
  "block_categories",
  "block_focuses",
  "block_statuses",
  "unit_parking_types",
  "unit_topographies",
  "unit_usages",
  "exchange_rate_profiles",
  "projects",
]

const num = (v: RawRow[string] | undefined): number | null => (typeof v === "number" ? v : v === null || v === undefined || v === "" ? null : Number(v))
const str = (v: RawRow[string] | undefined): string | null => (v === null || v === undefined ? null : String(v))

export function validate(snapshot: Snapshot, allowed: ReadonlySet<string> = new Set()): ValidationResult {
  const t = snapshot.tables
  const issues: Issue[] = []
  const ignoredLinks: Partial<Record<StrapiTable, number>> = {}
  const present = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map<number, RawRow>()])) as Present

  const add = (category: Category, table: Collection, row: RawRow, detail: string) => {
    issues.push({
      category,
      severity: WARNING_CATEGORIES.has(category) ? "warning" : "fatal",
      table,
      id: Number(row.id),
      documentId: str(row.document_id),
      detail,
    })
  }
  const ignore = (table: StrapiTable) => {
    ignoredLinks[table] = (ignoredLinks[table] ?? 0) + 1
  }

  // ── 1. Una fila publicada por documento ────────────────────────────────────
  for (const collection of COLLECTIONS) {
    const byDocument = new Map<string, RawRow[]>()
    for (const row of t[collection]) {
      const doc = str(row.document_id)?.trim()
      if (!doc) {
        add("documento-sin-id", collection, row, "document_id vacío")
        continue
      }
      byDocument.set(doc, [...(byDocument.get(doc) ?? []), row])
    }
    for (const [doc, rows] of byDocument) {
      const published = rows.filter((r) => r.published_at !== null && r.published_at !== undefined)
      if (published.length === 1) present[collection].set(Number(published[0].id), published[0])
      else if (published.length > 1) {
        for (const row of published) add("documento-duplicado", collection, row, `${published.length} filas publicadas con document_id ${doc}`)
      } else for (const row of rows) add("sin-publicar", collection, row, `document_id ${doc} sin fila publicada`)
    }
  }

  // ── 2. Campos de cada fila ─────────────────────────────────────────────────
  for (const collection of COLLECTIONS) {
    for (const row of present[collection].values()) {
      if (!row.created_at && !row.updated_at && !row.published_at) add("campo-obligatorio-vacio", collection, row, "sin created_at, updated_at ni published_at")
    }
  }
  for (const collection of NAMED) {
    for (const row of present[collection].values()) if (row.name === null || row.name === undefined) add("campo-obligatorio-vacio", collection, row, "name vacío")
  }

  const checkEnum = (table: Collection, row: RawRow, value: RawRow[string], allowedValues: readonly string[], field: string) => {
    if (value === null || value === undefined) return
    if (!allowedValues.includes(String(value))) add("enum-desconocido", table, row, `${field} = ${JSON.stringify(value)}; permitidos: ${allowedValues.join(", ")}`)
  }
  for (const row of present.blocks.values()) {
    if (row.domain === null || row.domain === undefined) add("campo-obligatorio-vacio", "blocks", row, "domain vacío")
    checkEnum("blocks", row, row.domain, ENUMS.block_domain, "domain")
    checkEnum("blocks", row, row.quarter, ENUMS.quarter, "quarter")
    checkEnum("blocks", row, row.market, ENUMS.market, "market")
    checkEnum("blocks", row, row.block_usage, ENUMS.block_usage, "block_usage")
  }
  for (const row of present.units.values()) checkEnum("units", row, row.availability, ENUMS.availability, "availability")

  const checkUnique = (table: Collection, column: string, category: Category, repeated?: Set<number>) => {
    const byValue = new Map<string, RawRow[]>()
    for (const row of present[table].values()) {
      const value = str(row[column])
      if (value === null) continue
      byValue.set(value, [...(byValue.get(value) ?? []), row])
    }
    for (const [value, rows] of byValue) {
      if (rows.length <= 1) continue
      for (const row of rows) {
        add(category, table, row, `${column} = ${JSON.stringify(value)} en ${rows.length} filas`)
        repeated?.add(Number(row.id))
      }
    }
  }
  const duplicateCodes: Resolved["duplicateCodes"] = { blocks: new Set(), units: new Set() }
  checkUnique("blocks", "code", "codigo-duplicado", duplicateCodes.blocks)
  checkUnique("units", "code", "codigo-duplicado", duplicateCodes.units)
  checkUnique("countries", "iso_code", "iso-duplicado")
  checkUnique("countries", "iso_code_2", "iso-duplicado")
  checkUnique("up_users", "username", "usuario-duplicado")
  checkUnique("up_users", "email", "usuario-duplicado")
  for (const row of present.up_users.values()) {
    if (row.username === null || row.username === undefined) add("campo-obligatorio-vacio", "up_users", row, "username vacío")
    if (row.email === null || row.email === undefined) add("campo-obligatorio-vacio", "up_users", row, "email vacío")
  }

  // ── 3. Relaciones de un solo destino ───────────────────────────────────────
  const rel = Object.fromEntries(MANY_TO_ONE.map((d) => [d.key, new Map<number, number>()])) as Resolved["rel"]
  for (const def of MANY_TO_ONE) {
    const targets = new Map<number, Set<number>>()
    const brokenOwners = new Set<number>()
    for (const link of t[def.lnk]) {
      const owner = num(link[def.ownerCol])
      const target = num(link[def.targetCol])
      if (owner === null || target === null || !present[def.owner].has(owner)) {
        ignore(def.lnk)
        continue
      }
      if (!present[def.target].has(target)) {
        add("relacion-rota", def.owner, present[def.owner].get(owner)!, `${def.lnk}: ${def.targetCol} = ${target} no existe o no está publicado en ${def.target}`)
        brokenOwners.add(owner)
        continue
      }
      targets.set(owner, (targets.get(owner) ?? new Set()).add(target))
    }
    for (const [owner, set] of targets) {
      if (set.size > 1) {
        const docs = [...set].map((id) => present[def.target].get(id)?.document_id).join(", ")
        add("relacion-ambigua", def.owner, present[def.owner].get(owner)!, `${def.lnk}: apunta a ${set.size} filas de ${def.target} (${docs})`)
      } else rel[def.key].set(owner, [...set][0])
    }
    if (def.missing) {
      for (const [id, row] of present[def.owner]) {
        if (!targets.has(id) && !brokenOwners.has(id)) add(def.missing, def.owner, row, `${def.lnk}: sin vínculo a ${def.target}`)
      }
    }
  }

  // ── 4. Relaciones muchos a muchos del proyecto ─────────────────────────────
  const sets = Object.fromEntries(SETS.map((d) => [d.key, new Map()])) as Resolved["sets"]
  for (const def of SETS) {
    for (const link of t[def.lnk]) {
      const project = num(link.project_id)
      const target = num(link[def.targetCol])
      if (project === null || target === null || !present.projects.has(project)) {
        ignore(def.lnk)
        continue
      }
      if (!present[def.target].has(target)) {
        add("relacion-rota", "projects", present.projects.get(project)!, `${def.lnk}: ${def.targetCol} = ${target} no existe o no está publicado en ${def.target}`)
        continue
      }
      const list = sets[def.key].get(project) ?? []
      if (!list.some((x) => x.target === target)) list.push({ target, ord: link[def.ordCol] ?? null })
      sets[def.key].set(project, list)
    }
  }

  // ── 5. Usuarios: rol del esquema nuevo ─────────────────────────────────────
  for (const [userId, roleId] of rel.userRole) {
    const type = str(present.up_roles.get(roleId)?.type)
    if (!type || !(ENUMS.user_role as readonly string[]).includes(type)) {
      add("rol-invalido", "up_users", present.up_users.get(userId)!, `rol ${JSON.stringify(type)}; permitidos: ${ENUMS.user_role.join(", ")}`)
    }
  }

  // ── 6. Zona dinámica unitType ──────────────────────────────────────────────
  const componentRows = (table: StrapiTable) => new Map(t[table].map((r) => [Number(r.id), r]))
  const unitComponents = Object.fromEntries(
    Object.values(UNIT_TYPE_COMPONENTS).map(({ table }) => [table, componentRows(table)]),
  ) as Record<string, Map<number, RawRow>>
  const unitCmps = new Map<number, RawRow[]>()
  for (const cmp of t.units_cmps) {
    const owner = num(cmp.entity_id)
    if (owner === null || !present.units.has(owner)) {
      ignore("units_cmps")
      continue
    }
    unitCmps.set(owner, [...(unitCmps.get(owner) ?? []), cmp])
  }
  const unitType: Resolved["unitType"] = new Map()
  const componentUsers = new Map<string, number[]>()
  for (const [unitId, cmps] of unitCmps) {
    const unit = present.units.get(unitId)!
    for (const cmp of cmps.filter((c) => c.field !== "unitType")) add("componente-desconocido", "units", unit, `units_cmps.field = ${JSON.stringify(cmp.field)}`)
    const entries = cmps.filter((c) => c.field === "unitType")
    if (entries.length === 0) continue
    if (entries.length > 1) {
      add("tipo-unidad-multiple", "units", unit, `${entries.length} entradas: ${entries.map((e) => e.component_type).join(", ")}`)
      continue
    }
    const [cmp] = entries
    const def = UNIT_TYPE_COMPONENTS[String(cmp.component_type)]
    if (!def) {
      add("tipo-unidad-roto", "units", unit, `component_type desconocido: ${JSON.stringify(cmp.component_type)}`)
      continue
    }
    const row = unitComponents[def.table].get(Number(cmp.cmp_id))
    if (!row) {
      add("tipo-unidad-roto", "units", unit, `${def.table}.id = ${cmp.cmp_id} no existe`)
      continue
    }
    const shareKey = `${def.table}:${row.id}`
    componentUsers.set(shareKey, [...(componentUsers.get(shareKey) ?? []), unitId])
    if (def.kind === "office") {
      checkEnum("units", unit, row.office_classification, ENUMS.office_classification, "office_classification")
      checkEnum("units", unit, row.general_size_classification, ENUMS.office_size_classification, "general_size_classification")
      checkEnum("units", unit, row.employee_capacity_range, ENUMS.employee_capacity_range, "employee_capacity_range")
    }
    unitType.set(unitId, { kind: def.kind, row })
  }
  for (const [shareKey, units] of componentUsers) {
    if (units.length > 1) for (const id of units) add("componente-compartido", "units", present.units.get(id)!, `${shareKey} lo usan ${units.length} unidades`)
  }
  for (const [unitId, { kind }] of unitType) {
    const blockId = rel.unitBlock.get(unitId)
    const domain = blockId === undefined ? undefined : str(present.blocks.get(blockId)?.domain)
    if (domain && domain !== kind) add("tipo-unidad-distinto-al-bloque", "units", present.units.get(unitId)!, `unidad ${kind}, bloque ${domain}`)
  }

  // ── 7. Financiamiento del bloque ───────────────────────────────────────────
  const financings = componentRows("components_financing_financings")
  const bankRates = componentRows("components_financing_bank_rates")
  const bankCmps = new Map<number, RawRow[]>()
  for (const cmp of t.components_financing_financings_cmps) {
    const owner = num(cmp.entity_id)
    if (owner !== null) bankCmps.set(owner, [...(bankCmps.get(owner) ?? []), cmp])
  }
  const blockCmps = new Map<number, RawRow[]>()
  for (const cmp of t.blocks_cmps) {
    const owner = num(cmp.entity_id)
    if (owner === null || !present.blocks.has(owner)) {
      ignore("blocks_cmps")
      continue
    }
    blockCmps.set(owner, [...(blockCmps.get(owner) ?? []), cmp])
  }
  const financing: Resolved["financing"] = new Map()
  for (const [blockId, cmps] of blockCmps) {
    const block = present.blocks.get(blockId)!
    for (const cmp of cmps.filter((c) => c.component_type !== FINANCING_COMPONENT)) {
      add("componente-desconocido", "blocks", block, `blocks_cmps.component_type = ${JSON.stringify(cmp.component_type)}`)
    }
    const entries = cmps.filter((c) => c.component_type === FINANCING_COMPONENT)
    if (entries.length === 0) continue
    if (entries.length > 1) {
      add("financiamiento-multiple", "blocks", block, `${entries.length} componentes ${FINANCING_COMPONENT}`)
      continue
    }
    const row = financings.get(Number(entries[0].cmp_id))
    if (!row) {
      add("financiamiento-roto", "blocks", block, `components_financing_financings.id = ${entries[0].cmp_id} no existe`)
      continue
    }
    const banks: { bank: string; rate: RawRow[string] }[] = []
    let broken = false
    for (const cmp of bankCmps.get(Number(row.id)) ?? []) {
      const bank = str(cmp.field)
      const rate = bankRates.get(Number(cmp.cmp_id))
      if (!bank || !(ENUMS.bank as readonly string[]).includes(bank)) {
        add("financiamiento-roto", "blocks", block, `banco desconocido: ${JSON.stringify(cmp.field)}`)
        broken = true
      } else if (banks.some((b) => b.bank === bank)) {
        add("financiamiento-roto", "blocks", block, `banco repetido: ${bank}`)
        broken = true
      } else if (!rate) {
        add("financiamiento-roto", "blocks", block, `${bank}: components_financing_bank_rates.id = ${cmp.cmp_id} no existe`)
        broken = true
      } else banks.push({ bank, rate: rate.annual_rate_percent ?? null })
    }
    if (!broken) financing.set(blockId, { row, banks })
  }

  // ── 8. Monedas del perfil de tipo de cambio ────────────────────────────────
  const currencyContainers = componentRows("components_currencies_currencies")
  const currencyRows = Object.fromEntries(
    Object.values(CURRENCY_FIELDS).map(({ table }) => [table, componentRows(table)]),
  ) as Record<string, Map<number, RawRow>>
  const currencyCmps = new Map<number, RawRow[]>()
  for (const cmp of t.components_currencies_currencies_cmps) {
    const owner = num(cmp.entity_id)
    if (owner !== null) currencyCmps.set(owner, [...(currencyCmps.get(owner) ?? []), cmp])
  }
  const profileCmps = new Map<number, RawRow[]>()
  for (const cmp of t.exchange_rate_profiles_cmps) {
    const owner = num(cmp.entity_id)
    if (owner === null || !present.exchange_rate_profiles.has(owner)) {
      ignore("exchange_rate_profiles_cmps")
      continue
    }
    profileCmps.set(owner, [...(profileCmps.get(owner) ?? []), cmp])
  }
  const currencies: Resolved["currencies"] = new Map()
  for (const [profileId, cmps] of profileCmps) {
    const profile = present.exchange_rate_profiles.get(profileId)!
    if (cmps.length > 1) {
      add("moneda-rota", "exchange_rate_profiles", profile, `${cmps.length} componentes de monedas`)
      continue
    }
    const container = currencyContainers.get(Number(cmps[0].cmp_id))
    if (!container) {
      add("moneda-rota", "exchange_rate_profiles", profile, `components_currencies_currencies.id = ${cmps[0].cmp_id} no existe`)
      continue
    }
    const list: { currency: string; buy: RawRow[string]; sell: RawRow[string] }[] = []
    let broken = false
    for (const cmp of currencyCmps.get(Number(container.id)) ?? []) {
      const def = CURRENCY_FIELDS[String(cmp.field)]
      const row = def ? currencyRows[def.table].get(Number(cmp.cmp_id)) : undefined
      if (!def) {
        add("moneda-rota", "exchange_rate_profiles", profile, `moneda desconocida: ${JSON.stringify(cmp.field)}`)
        broken = true
      } else if (list.some((x) => x.currency === def.currency)) {
        add("moneda-rota", "exchange_rate_profiles", profile, `moneda repetida: ${def.currency}`)
        broken = true
      } else if (!row) {
        add("moneda-rota", "exchange_rate_profiles", profile, `${def.table}.id = ${cmp.cmp_id} no existe`)
        broken = true
      } else list.push({ currency: def.currency, buy: row.buy_rate ?? null, sell: row.sell_rate ?? null })
    }
    if (!broken) currencies.set(profileId, list)
  }

  // ── 9. Decisión: bloquear o excluir ────────────────────────────────────────
  const blocking = issues.filter((i) => i.severity === "fatal" && !allowed.has(i.category))
  const excluded = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map<number, string>()])) as Record<Collection, Map<number, string>>
  if (blocking.length === 0) {
    for (const issue of issues) {
      if (issue.severity === "fatal" && !excluded[issue.table].has(issue.id)) excluded[issue.table].set(issue.id, `${issue.category}: ${issue.detail}`)
    }
    cascade(excluded, present, rel, sets)
  }

  const issueDocs = new Map(issues.map((i) => [`${i.table}:${i.id}`, i.documentId]))
  const exclusions: Exclusion[] = []
  for (const collection of COLLECTIONS) {
    for (const [id, reason] of excluded[collection]) {
      const documentId = str(present[collection].get(id)?.document_id ?? null) ?? issueDocs.get(`${collection}:${id}`) ?? null
      exclusions.push({ table: collection, id, documentId, reason })
      present[collection].delete(id)
    }
  }
  for (const def of MANY_TO_ONE) {
    for (const [owner, target] of rel[def.key]) {
      if (!present[def.owner].has(owner) || !present[def.target].has(target)) rel[def.key].delete(owner)
    }
  }
  pruneResolved(present, sets, unitType, financing, currencies)

  for (const id of duplicateCodes.blocks) if (!present.blocks.has(id)) duplicateCodes.blocks.delete(id)
  for (const id of duplicateCodes.units) if (!present.units.has(id)) duplicateCodes.units.delete(id)

  return { issues, blocking, exclusions, ignoredLinks, resolved: { present, rel, sets, unitType, financing, currencies, duplicateCodes } }
}

/** Excluye en cascada lo que depende de una fila excluida (en orden de dependencia). */
function cascade(
  excluded: Record<Collection, Map<number, string>>,
  present: Present,
  rel: Resolved["rel"],
  sets: Resolved["sets"],
) {
  const docOf = (table: Collection, id: number) => String(present[table].get(id)?.document_id ?? id)
  const follow = (owner: Collection, keys: ManyToOneKey[], setKeys: SetKey[] = []) => {
    for (const id of present[owner].keys()) {
      if (excluded[owner].has(id)) continue
      for (const key of keys) {
        const def = MANY_TO_ONE.find((d) => d.key === key)!
        const target = rel[key].get(id)
        if (target !== undefined && excluded[def.target].has(target)) {
          excluded[owner].set(id, `dependiente-excluido: ${def.target} ${docOf(def.target, target)} está excluido`)
          break
        }
      }
      if (excluded[owner].has(id)) continue
      for (const key of setKeys) {
        const def = SETS.find((d) => d.key === key)!
        const hit = sets[key].get(id)?.find((x) => excluded[def.target].has(x.target))
        if (hit) {
          excluded[owner].set(id, `dependiente-excluido: ${def.target} ${docOf(def.target, hit.target)} está excluido`)
          break
        }
      }
    }
  }
  follow("projects", ["projectCountry", "projectDeveloper", "projectNse", "projectSecurityType", "projectProfile"], ["projectAmenities", "projectServices"])
  follow("blocks", ["blockProject", "blockCategory", "blockFocus", "blockStatus"])
  follow("units", ["unitBlock", "unitUsage", "unitTopography", "unitParkingType"])
  follow("up_users", ["userRole"])
}

function pruneResolved(
  present: Present,
  sets: Resolved["sets"],
  unitType: Resolved["unitType"],
  financing: Resolved["financing"],
  currencies: Resolved["currencies"],
) {
  for (const def of SETS) {
    for (const [project, list] of sets[def.key]) {
      if (!present.projects.has(project)) sets[def.key].delete(project)
      else sets[def.key].set(project, list.filter((x) => present[def.target].has(x.target)))
    }
  }
  for (const id of unitType.keys()) if (!present.units.has(id)) unitType.delete(id)
  for (const id of financing.keys()) if (!present.blocks.has(id)) financing.delete(id)
  for (const id of currencies.keys()) if (!present.exchange_rate_profiles.has(id)) currencies.delete(id)
}

export function describeCategory(category: string): string {
  return (CATEGORIES as Record<string, string>)[category] ?? category
}
