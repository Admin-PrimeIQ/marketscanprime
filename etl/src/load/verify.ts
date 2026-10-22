import type pg from "pg"
import {
  CURRENCY_FIELDS,
  DEFAULT_DOMAIN,
  FINANCING_COMPONENT,
  UNDEFINED_PROJECT,
  UNIT_TYPE_COMPONENTS,
  undefinedBlock,
  type Domain,
  type Present,
} from "./model"
import { bool, cents, float, int, numeric, text, timestamp, type Value } from "./normalize"
import type { Collection, RawRow, Snapshot, StrapiTable } from "./snapshot"
import { mirroredRows, SPEC_BY_TABLE, SPECS, rowKey, type AppData, type AppRow, type AppTable, type Column, type TableSpec } from "./specs"
import { q } from "./sql"
import type { Mode } from "./write"

/**
 * Verificación de lo que quedó en `msp_app`, dentro de la misma transacción de la carga (antes
 * del COMMIT) o por separado en una transacción de solo lectura (`load:verify`).
 *
 * 1. Filas: cada tabla contra lo que produjo la transformación (columna por columna).
 * 2. Relaciones: pares sacados directo de las tablas `_lnk` / `_cmps` del snapshot crudo, sin pasar
 *    por la validación ni la transformación, contra los JOIN de msp_app.
 * 3. Agregados: unidades y suma de total_price_usd por bloque.
 */

const EXAMPLES = 10

export interface Check {
  name: string
  expected: number
  actual: number
  missing: number
  extra: number
  changed: number
  examples: string[]
}

export interface VerifyResult {
  ok: boolean
  tables: Check[]
  relations: Check[]
  aggregates: Check
}

// ── utilidades ──────────────────────────────────────────────────────────────

function normalizer(column: Column): (v: Value) => Value {
  switch (column.kind) {
    case "int":
      return int
    case "numeric":
      return numeric
    case "float":
      return float
    case "bool":
      return bool
    case "timestamp":
      return timestamp
    default:
      return text
  }
}

function compareMaps(name: string, expected: Map<string, string>, actual: Map<string, string>): Check {
  const check: Check = { name, expected: expected.size, actual: actual.size, missing: 0, extra: 0, changed: 0, examples: [] }
  const example = (s: string) => check.examples.length < EXAMPLES && check.examples.push(s)
  for (const [key, value] of expected) {
    const got = actual.get(key)
    if (got === undefined) {
      check.missing++
      example(`falta ${key}${value ? ` → ${value}` : ""}`)
    } else if (got !== value) {
      check.changed++
      example(`${key}: esperado ${value}, hay ${got}`)
    }
  }
  for (const [key, value] of actual) {
    if (!expected.has(key)) {
      check.extra++
      example(`sobra ${key}${value ? ` → ${value}` : ""}`)
    }
  }
  return check
}

const failed = (c: Check) => c.missing + c.extra + c.changed > 0

// ── 1. filas ────────────────────────────────────────────────────────────────

function selectSql(spec: TableSpec, mode: Mode): string {
  const joins: string[] = []
  let scopeExpr = "t.public_id"
  const exprs = spec.columns.map((column, i) => {
    const c = q(column.name)
    if (column.kind === "ref") {
      joins.push(`LEFT JOIN ${q(column.ref!)} j${i} ON j${i}.id = t.${c}`)
      if (column.name === spec.scope) scopeExpr = `j${i}.public_id`
      return `j${i}.public_id AS ${c}`
    }
    if (column.kind === "timestamp") return `to_char(t.${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${c}`
    return `t.${c}::text AS ${c}`
  })
  const where = [mode === "sample" ? `${scopeExpr} = ANY($1::text[])` : "TRUE", mirroredRows(spec, "t.public_id")]
  return `SELECT ${exprs.join(", ")} FROM ${q(spec.table)} t ${joins.join(" ")} WHERE ${where.join(" AND ")}`
}

function scopeIds(spec: TableSpec, data: AppData): string[] {
  if (spec.publicId) return data[spec.table].map((r) => r.public_id!)
  const parent = spec.columns.find((c) => c.name === spec.scope)!.ref!
  return data[parent].map((r) => r.public_id!)
}

async function verifyTable(client: pg.Client, spec: TableSpec, data: AppData, mode: Mode): Promise<Check> {
  const normalize = (row: AppRow): AppRow =>
    Object.fromEntries(spec.columns.map((c) => [c.name, normalizer(c)(row[c.name] ?? null)]))
  const result = await client.query<AppRow>(selectSql(spec, mode), mode === "sample" ? [scopeIds(spec, data)] : [])
  const expected = new Map(data[spec.table].map((r) => [rowKey(spec, r), normalize(r)]))
  const actual = new Map(result.rows.map((r) => [rowKey(spec, r), normalize(r)]))

  const check: Check = { name: spec.table, expected: expected.size, actual: actual.size, missing: 0, extra: 0, changed: 0, examples: [] }
  const example = (s: string) => check.examples.length < EXAMPLES && check.examples.push(s)
  for (const [key, row] of expected) {
    const got = actual.get(key)
    if (!got) {
      check.missing++
      example(`falta ${key}`)
      continue
    }
    const diffs = spec.columns
      .filter((c) => row[c.name] !== got[c.name])
      .map((c) => (c.sensitive ? `${c.name} (oculto)` : `${c.name}: esperado ${row[c.name]}, hay ${got[c.name]}`))
    if (diffs.length) {
      check.changed++
      example(`${key} → ${diffs.join("; ")}`)
    }
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      check.extra++
      example(`sobra ${key}`)
    }
  }
  return check
}

// ── 2. relaciones desde el snapshot crudo ───────────────────────────────────

interface LinkRelation {
  name: string
  lnk: StrapiTable
  owner: Collection
  ownerCol: string
  target: Collection
  targetCol: string
  /** msp_app: tabla dueña, columna FK y tabla destino. */
  app: { owner: AppTable; column: string; target: AppTable }
}

const LINKS: LinkRelation[] = [
  { name: "proyecto → país", lnk: "projects_country_lnk", owner: "projects", ownerCol: "project_id", target: "countries", targetCol: "country_id", app: { owner: "project", column: "country_id", target: "country" } },
  { name: "proyecto → desarrollador", lnk: "projects_developer_lnk", owner: "projects", ownerCol: "project_id", target: "developers", targetCol: "developer_id", app: { owner: "project", column: "developer_id", target: "developer" } },
  { name: "proyecto → NSE", lnk: "projects_nse_lnk", owner: "projects", ownerCol: "project_id", target: "nses", targetCol: "nse_id", app: { owner: "project", column: "nse_id", target: "nse" } },
  { name: "proyecto → seguridad", lnk: "projects_security_type_lnk", owner: "projects", ownerCol: "project_id", target: "security_types", targetCol: "security_type_id", app: { owner: "project", column: "security_type_id", target: "security_type" } },
  { name: "proyecto → perfil de cambio", lnk: "projects_exchange_rate_profile_lnk", owner: "projects", ownerCol: "project_id", target: "exchange_rate_profiles", targetCol: "exchange_rate_profile_id", app: { owner: "project", column: "exchange_rate_profile_id", target: "exchange_rate_profile" } },
  { name: "bloque → proyecto", lnk: "blocks_project_lnk", owner: "blocks", ownerCol: "block_id", target: "projects", targetCol: "project_id", app: { owner: "block", column: "project_id", target: "project" } },
  { name: "bloque → categoría", lnk: "blocks_block_category_lnk", owner: "blocks", ownerCol: "block_id", target: "block_categories", targetCol: "block_category_id", app: { owner: "block", column: "category_id", target: "block_category" } },
  { name: "bloque → enfoque", lnk: "blocks_block_focus_lnk", owner: "blocks", ownerCol: "block_id", target: "block_focuses", targetCol: "block_focus_id", app: { owner: "block", column: "focus_id", target: "block_focus" } },
  { name: "bloque → estado", lnk: "blocks_block_status_lnk", owner: "blocks", ownerCol: "block_id", target: "block_statuses", targetCol: "block_status_id", app: { owner: "block", column: "status_id", target: "block_status" } },
  { name: "unidad → bloque", lnk: "units_block_lnk", owner: "units", ownerCol: "unit_id", target: "blocks", targetCol: "block_id", app: { owner: "unit", column: "block_id", target: "block" } },
  { name: "unidad → uso", lnk: "units_unit_usage_lnk", owner: "units", ownerCol: "unit_id", target: "unit_usages", targetCol: "unit_usage_id", app: { owner: "unit", column: "usage_id", target: "unit_usage" } },
  { name: "unidad → topografía", lnk: "units_topography_lnk", owner: "units", ownerCol: "unit_id", target: "unit_topographies", targetCol: "unit_topography_id", app: { owner: "unit", column: "topography_id", target: "unit_topography" } },
  { name: "unidad → tipo de parqueo", lnk: "units_parking_type_lnk", owner: "units", ownerCol: "unit_id", target: "unit_parking_types", targetCol: "unit_parking_type_id", app: { owner: "unit", column: "parking_type_id", target: "unit_parking_type" } },
]

const SET_LINKS = [
  { name: "proyecto ↔ amenidades", lnk: "projects_amenities_lnk", target: "amenities", targetCol: "amenity_id", app: { table: "project_amenity", column: "amenity_id", target: "amenity" } },
  { name: "proyecto ↔ servicios", lnk: "services_projects_lnk", target: "services", targetCol: "service_id", app: { table: "project_service", column: "service_id", target: "service" } },
] as const satisfies readonly { name: string; lnk: StrapiTable; target: Collection; targetCol: string; app: { table: AppTable; column: string; target: AppTable } }[]

const docOf = (present: Present, table: Collection, id: RawRow[string]): string | undefined => {
  const row = id === null || id === undefined ? undefined : present[table].get(Number(id))
  return row ? String(row.document_id) : undefined
}

async function pairs(client: pg.Client, sql: string, params: unknown[]): Promise<Map<string, string>> {
  const result = await client.query<{ k: string; v: string | null }>(sql, params)
  return new Map(result.rows.map((r) => [r.k, r.v ?? ""]))
}

/**
 * Dónde deben quedar los hijos sin relación obligatoria, sacado del snapshot crudo: unidad sin
 * vínculo a un bloque publicado → bloque «No definido» de su tipo (unitType); bloque sin proyecto
 * → proyecto «No definido», igual que los bloques «No definido» que se usen.
 */
interface UndefinedParents {
  unitBlock: Map<string, string>
  blockProject: Map<string, string>
  blocks: string[]
}

function undefinedParents(snapshot: Snapshot, present: Present): UndefinedParents {
  const t = snapshot.tables
  const kinds = new Map<number, Domain>()
  for (const cmp of t.units_cmps) {
    const def = UNIT_TYPE_COMPONENTS[String(cmp.component_type)]
    if (def && cmp.field === "unitType" && cmp.entity_id !== null) kinds.set(Number(cmp.entity_id), def.kind)
  }
  const linkedUnits = new Set(t.units_block_lnk.filter((l) => docOf(present, "blocks", l.block_id)).map((l) => Number(l.unit_id)))
  const linkedBlocks = new Set(t.blocks_project_lnk.filter((l) => docOf(present, "projects", l.project_id)).map((l) => Number(l.block_id)))
  const unitBlock = new Map<string, string>()
  for (const [id, unit] of present.units) {
    if (!linkedUnits.has(id)) unitBlock.set(String(unit.document_id), undefinedBlock(kinds.get(id) ?? DEFAULT_DOMAIN))
  }
  const blocks = [...new Set(unitBlock.values())]
  const blockProject = new Map(blocks.map((b) => [b, UNDEFINED_PROJECT]))
  for (const [id, block] of present.blocks) {
    if (!linkedBlocks.has(id)) blockProject.set(String(block.document_id), UNDEFINED_PROJECT)
  }
  return { unitBlock, blockProject, blocks }
}

async function verifyRelations(client: pg.Client, snapshot: Snapshot, present: Present, undefinedTo: UndefinedParents, mode: Mode): Promise<Check[]> {
  const t = snapshot.tables
  const docs = (table: Collection) => [
    ...[...present[table].values()].map((r) => String(r.document_id)),
    ...(table === "blocks" ? undefinedTo.blocks : []),
  ]
  const scoped = (owner: Collection, alias: string) =>
    mode === "sample" ? { where: ` WHERE ${alias}.public_id = ANY($1::text[])`, params: [docs(owner)] } : { where: "", params: [] }
  const checks: Check[] = []

  for (const rel of LINKS) {
    const expected = new Map<string, string>()
    for (const link of t[rel.lnk]) {
      const owner = docOf(present, rel.owner, link[rel.ownerCol])
      const target = docOf(present, rel.target, link[rel.targetCol])
      if (owner && target) expected.set(owner, target)
    }
    const fallback = rel.lnk === "units_block_lnk" ? undefinedTo.unitBlock : rel.lnk === "blocks_project_lnk" ? undefinedTo.blockProject : null
    for (const [owner, target] of fallback ?? []) if (!expected.has(owner)) expected.set(owner, target)
    const { where, params } = scoped(rel.owner, "o")
    const actual = await pairs(
      client,
      `SELECT o.public_id AS k, p.public_id AS v FROM ${q(rel.app.owner)} o JOIN ${q(rel.app.target)} p ON p.id = o.${q(rel.app.column)}${where}`,
      params,
    )
    checks.push(compareMaps(rel.name, expected, actual))
  }

  for (const rel of SET_LINKS) {
    const expected = new Map<string, string>()
    for (const link of t[rel.lnk]) {
      const project = docOf(present, "projects", link.project_id)
      const target = docOf(present, rel.target, link[rel.targetCol])
      if (project && target) expected.set(`${project}|${target}`, "")
    }
    const { where, params } = scoped("projects", "o")
    const actual = await pairs(
      client,
      `SELECT o.public_id || '|' || p.public_id AS k, NULL AS v FROM ${q(rel.app.table)} x
         JOIN project o ON o.id = x.project_id JOIN ${q(rel.app.target)} p ON p.id = x.${q(rel.app.column)}${where}`,
      params,
    )
    checks.push(compareMaps(rel.name, expected, actual))
  }

  {
    const expected = new Map<string, string>()
    for (const cmp of t.units_cmps) {
      const unit = docOf(present, "units", cmp.entity_id)
      const def = UNIT_TYPE_COMPONENTS[String(cmp.component_type)]
      if (unit && def && cmp.field === "unitType") expected.set(unit, def.kind)
    }
    const { where, params } = scoped("units", "u")
    const actual = await pairs(client, `SELECT u.public_id AS k, u.kind::text AS v FROM unit u${where ? `${where} AND` : " WHERE"} u.kind IS NOT NULL`, params)
    checks.push(compareMaps("unidad → tipo (zona dinámica)", expected, actual))
  }

  {
    const roles = new Map(t.up_roles.map((r) => [Number(r.id), text(r.type)]))
    const expected = new Map<string, string>()
    for (const link of t.up_users_role_lnk) {
      const user = docOf(present, "up_users", link.user_id)
      const role = roles.get(Number(link.role_id))
      if (user && role) expected.set(user, role)
    }
    const { where, params } = scoped("up_users", "u")
    const mirrored = mirroredRows(SPEC_BY_TABLE.user, "u.public_id")
    const actual = await pairs(client, `SELECT u.public_id AS k, u.role::text AS v FROM "user" u${where ? `${where} AND` : " WHERE"} ${mirrored}`, params)
    checks.push(compareMaps("usuario → rol", expected, actual))
  }

  {
    const byId = (table: StrapiTable) => new Map(t[table].map((r) => [Number(r.id), r]))
    const rates = byId("components_financing_bank_rates")
    const expected = new Map<string, string>()
    const blockOfFinancing = new Map<number, string>()
    for (const cmp of t.blocks_cmps) {
      const block = docOf(present, "blocks", cmp.entity_id)
      if (block && cmp.component_type === FINANCING_COMPONENT) blockOfFinancing.set(Number(cmp.cmp_id), block)
    }
    for (const cmp of t.components_financing_financings_cmps) {
      const block = blockOfFinancing.get(Number(cmp.entity_id))
      const rate = rates.get(Number(cmp.cmp_id))
      if (block && rate) expected.set(`${block}|${cmp.field}`, numeric(rate.annual_rate_percent as Value) ?? "∅")
    }
    const { where, params } = scoped("blocks", "b")
    const actual = await pairs(
      client,
      `SELECT b.public_id || '|' || x.bank::text AS k, coalesce(x.annual_rate_percent::text, '∅') AS v
         FROM block_bank_rate x JOIN block b ON b.id = x.block_id${where}`,
      params,
    )
    for (const [k, v] of actual) actual.set(k, v === "∅" ? v : numeric(v)!)
    checks.push(compareMaps("bloque → tasas por banco", expected, actual))
  }

  {
    const byId = (table: StrapiTable) => new Map(t[table].map((r) => [Number(r.id), r]))
    const expected = new Map<string, string>()
    const profileOfContainer = new Map<number, string>()
    for (const cmp of t.exchange_rate_profiles_cmps) {
      const profile = docOf(present, "exchange_rate_profiles", cmp.entity_id)
      if (profile) profileOfContainer.set(Number(cmp.cmp_id), profile)
    }
    for (const cmp of t.components_currencies_currencies_cmps) {
      const profile = profileOfContainer.get(Number(cmp.entity_id))
      const def = CURRENCY_FIELDS[String(cmp.field)]
      const row = def ? byId(def.table).get(Number(cmp.cmp_id)) : undefined
      if (profile && def && row) {
        expected.set(`${profile}|${def.currency}`, `${numeric(row.buy_rate as Value) ?? "∅"}|${numeric(row.sell_rate as Value) ?? "∅"}`)
      }
    }
    const { where, params } = scoped("exchange_rate_profiles", "p")
    const result = await client.query<{ k: string; buy: string | null; sell: string | null }>(
      `SELECT p.public_id || '|' || x.currency::text AS k, x.buy_rate::text AS buy, x.sell_rate::text AS sell
         FROM exchange_rate_profile_currency x JOIN exchange_rate_profile p ON p.id = x.profile_id${where}`,
      params,
    )
    const actual = new Map(result.rows.map((r) => [r.k, `${numeric(r.buy) ?? "∅"}|${numeric(r.sell) ?? "∅"}`]))
    checks.push(compareMaps("perfil → monedas", expected, actual))
  }

  return checks
}

// ── 3. agregados por bloque ─────────────────────────────────────────────────

async function verifyAggregates(client: pg.Client, snapshot: Snapshot, present: Present, undefinedTo: UndefinedParents, mode: Mode): Promise<Check> {
  const totals = new Map<string, { units: number; cents: bigint }>()
  for (const block of present.blocks.values()) totals.set(String(block.document_id), { units: 0, cents: 0n })
  for (const block of undefinedTo.blocks) totals.set(block, { units: 0, cents: 0n })
  for (const unit of present.units.values()) {
    const block = undefinedTo.unitBlock.get(String(unit.document_id))
    if (!block) continue
    totals.get(block)!.units++
    totals.get(block)!.cents += cents(unit.total_price_usd as Value)
  }
  const counted = new Set<number>()
  for (const link of snapshot.tables.units_block_lnk) {
    const unit = link.unit_id === null ? undefined : present.units.get(Number(link.unit_id))
    const block = docOf(present, "blocks", link.block_id)
    // Un vínculo repetido al mismo bloque no es una unidad más.
    if (!unit || !block || counted.has(Number(unit.id))) continue
    counted.add(Number(unit.id))
    const total = totals.get(block)!
    total.units++
    total.cents += cents(unit.total_price_usd as Value)
  }
  const expected = new Map([...totals].map(([k, v]) => [k, `${v.units} unidades, ${v.cents} centavos`]))

  const where = mode === "sample" ? " WHERE b.public_id = ANY($1::text[])" : ""
  const result = await client.query<{ k: string; units: string; cents: string }>(
    `SELECT b.public_id AS k, count(u.id)::text AS units, coalesce(sum(u.total_price_usd * 100), 0)::bigint::text AS cents
       FROM block b LEFT JOIN unit u ON u.block_id = b.id${where} GROUP BY b.public_id`,
    mode === "sample" ? [[...totals.keys()]] : [],
  )
  const actual = new Map(result.rows.map((r) => [r.k, `${r.units} unidades, ${r.cents} centavos`]))
  return compareMaps("unidades y total_price_usd por bloque", expected, actual)
}

export async function verify(client: pg.Client, snapshot: Snapshot, present: Present, data: AppData, mode: Mode): Promise<VerifyResult> {
  const tables: Check[] = []
  for (const spec of SPECS) tables.push(await verifyTable(client, spec, data, mode))
  const undefinedTo = undefinedParents(snapshot, present)
  const relations = await verifyRelations(client, snapshot, present, undefinedTo, mode)
  const aggregates = await verifyAggregates(client, snapshot, present, undefinedTo, mode)
  const ok = ![...tables, ...relations, aggregates].some(failed)
  return { ok, tables, relations, aggregates }
}
