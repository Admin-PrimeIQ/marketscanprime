/**
 * Tablas destino en `msp_app` (prisma/schema.prisma), en el orden en que se escriben.
 *
 * Una sola definición sirve para escribir y para verificar: las columnas `ref` llevan en la fila
 * el `public_id` del padre (no el id numérico), así la verificación compara relaciones por
 * identidad de Strapi y no por ids internos.
 */

export type Kind = "text" | "int" | "numeric" | "float" | "bool" | "timestamp" | "date" | "enum" | "ref"

export interface Column {
  name: string
  kind: Kind
  /** Tipo enum de Postgres (`kind: "enum"`). */
  enumType?: string
  /** Tabla padre (`kind: "ref"`); el valor en la fila es su `public_id`. */
  ref?: AppTable
  /** No se imprime en reportes. */
  sensitive?: boolean
}

export interface TableSpec {
  table: AppTable
  /** Tiene `public_id` (documento de Strapi) como llave natural. */
  publicId: boolean
  /** Columnas de la llave natural (y del ON CONFLICT). */
  key: string[]
  columns: Column[]
  /** Tablas hijas: columna `ref` al padre que define el alcance (qué filas le pertenecen). */
  scope?: string
  /** Columnas con índice único además de la llave: se liberan antes de escribir. */
  uniques?: string[]
  /**
   * Prefijo de `public_id` de las filas que crea la app nueva y que no vienen de Strapi: el espejo
   * no las renombra, no las borra ni las verifica.
   */
  localPrefix?: string
}

/** `public_id` de las cuentas propias de la app nueva. Un `documentId` de Strapi no lleva guiones. */
export const APP_LOCAL_PREFIX = "app-"

/** Condición SQL que deja fuera las filas propias de la app nueva (`localPrefix`). */
export function mirroredRows(spec: TableSpec, column = "public_id"): string {
  if (!spec.localPrefix) return "TRUE"
  if (!/^[a-z0-9-]+$/.test(spec.localPrefix)) throw new Error(`localPrefix inválido en ${spec.table}: ${spec.localPrefix}`)
  return `${column} NOT LIKE '${spec.localPrefix}%'`
}

export type AppTable =
  | "amenity"
  | "service"
  | "country"
  | "developer"
  | "nse"
  | "security_type"
  | "block_category"
  | "block_focus"
  | "block_status"
  | "unit_parking_type"
  | "unit_topography"
  | "unit_usage"
  | "exchange_rate_profile"
  | "exchange_rate_profile_currency"
  | "project"
  | "project_amenity"
  | "project_service"
  | "block"
  | "block_financing"
  | "block_bank_rate"
  | "unit"
  | "unit_housing"
  | "unit_office"
  | "unit_industrial"
  | "user"

const c = (name: string, kind: Exclude<Kind, "enum" | "ref">): Column => ({ name, kind })
const e = (name: string, enumType: string): Column => ({ name, kind: "enum", enumType })
const r = (name: string, ref: AppTable): Column => ({ name, kind: "ref", ref })

const document = [c("public_id", "text")]
const stamps = [c("created_at", "timestamp"), c("updated_at", "timestamp")]
const catalog = [...document, c("code", "text"), c("name", "text"), c("description", "text")]

function catalogSpec(table: AppTable, extra: Column[] = []): TableSpec {
  return { table, publicId: true, key: ["public_id"], columns: [...catalog, ...extra, ...stamps] }
}

export const CATALOG_TABLES = [
  "amenity",
  "service",
  "country",
  "developer",
  "nse",
  "security_type",
  "block_category",
  "block_focus",
  "block_status",
  "unit_parking_type",
  "unit_topography",
  "unit_usage",
] as const satisfies readonly AppTable[]

export const SPECS: TableSpec[] = [
  catalogSpec("amenity", [c("category", "text")]),
  catalogSpec("service", [c("category", "text")]),
  { ...catalogSpec("country", [c("iso_code", "text"), c("iso_code_2", "text")]), uniques: ["iso_code", "iso_code_2"] },
  catalogSpec("developer", [
    c("address", "text"),
    c("phone", "text"),
    c("email", "text"),
    c("website", "text"),
    c("tax_id", "text"),
    c("contact_person", "text"),
    c("contact_phone", "text"),
    c("contact_email", "text"),
  ]),
  catalogSpec("nse"),
  catalogSpec("security_type"),
  catalogSpec("block_category"),
  catalogSpec("block_focus"),
  catalogSpec("block_status"),
  catalogSpec("unit_parking_type"),
  catalogSpec("unit_topography"),
  catalogSpec("unit_usage"),
  catalogSpec("exchange_rate_profile"),
  {
    table: "exchange_rate_profile_currency",
    publicId: false,
    key: ["profile_id", "currency"],
    scope: "profile_id",
    columns: [r("profile_id", "exchange_rate_profile"), e("currency", "currency"), c("buy_rate", "numeric"), c("sell_rate", "numeric")],
  },
  {
    table: "project",
    publicId: true,
    key: ["public_id"],
    columns: [
      ...document,
      c("code", "text"),
      c("name", "text"),
      c("department", "text"),
      c("municipality", "text"),
      c("zone", "text"),
      c("subzone", "text"),
      c("latitude", "numeric"),
      c("longitude", "numeric"),
      c("muvi", "bool"),
      c("showroom", "bool"),
      c("model_house", "bool"),
      c("access_quantity", "int"),
      c("image_url", "text"),
      c("fha", "bool"),
      c("fractional_down_payment", "bool"),
      c("down_payment_percentage", "numeric"),
      r("country_id", "country"),
      r("developer_id", "developer"),
      r("nse_id", "nse"),
      r("security_type_id", "security_type"),
      r("exchange_rate_profile_id", "exchange_rate_profile"),
      ...stamps,
    ],
  },
  {
    table: "project_amenity",
    publicId: false,
    key: ["project_id", "amenity_id"],
    scope: "project_id",
    columns: [r("project_id", "project"), r("amenity_id", "amenity"), c("sort_order", "float")],
  },
  {
    table: "project_service",
    publicId: false,
    key: ["project_id", "service_id"],
    scope: "project_id",
    columns: [r("project_id", "project"), r("service_id", "service"), c("sort_order", "float")],
  },
  {
    table: "block",
    publicId: true,
    key: ["public_id"],
    uniques: ["code"],
    columns: [
      ...document,
      c("code", "text"),
      c("name", "text"),
      c("legacy_id", "text"),
      r("project_id", "project"),
      e("domain", "block_domain"),
      e("quarter", "quarter"),
      e("market", "market"),
      e("block_usage", "block_usage"),
      c("phase", "text"),
      c("tower", "text"),
      c("sector", "text"),
      c("year", "int"),
      c("collection_date", "date"),
      c("start_date", "date"),
      c("delivery_date", "date"),
      c("commercialization_months", "int"),
      c("total_units", "int"),
      c("total_m2", "numeric"),
      c("available_units", "int"),
      c("available_m2", "numeric"),
      c("visitor_parking", "int"),
      c("assigned_parking", "int"),
      c("total_project_parking", "int"),
      c("parking_for_sale", "int"),
      c("mig_number", "int"),
      c("average_price_usd", "numeric"),
      c("average_size_m2", "numeric"),
      c("average_price_per_m2_usd", "numeric"),
      c("average_installment_usd", "numeric"),
      c("average_income_usd", "numeric"),
      c("additional_parking_price_usd", "numeric"),
      r("category_id", "block_category"),
      r("focus_id", "block_focus"),
      r("status_id", "block_status"),
      ...stamps,
    ],
  },
  {
    table: "block_financing",
    publicId: false,
    key: ["block_id"],
    scope: "block_id",
    columns: [
      r("block_id", "block"),
      c("down_payment_percent", "numeric"),
      c("fractional_down_payment", "bool"),
      c("fractional_down_payment_fha", "numeric"),
      c("fractional_installments_other_banks", "numeric"),
      c("min_down_payment_fha", "numeric"),
      c("min_down_payment_other_banks", "numeric"),
      c("max_loan_term_years_fha", "int"),
      c("max_loan_term_years_banks", "int"),
      c("max_loan_term_years_owner", "int"),
    ],
  },
  {
    table: "block_bank_rate",
    publicId: false,
    key: ["block_id", "bank"],
    scope: "block_id",
    columns: [r("block_id", "block"), e("bank", "bank"), c("annual_rate_percent", "numeric")],
  },
  {
    table: "unit",
    publicId: true,
    key: ["public_id"],
    uniques: ["code"],
    columns: [
      ...document,
      c("code", "text"),
      c("name", "text"),
      c("legacy_id", "text"),
      r("block_id", "block"),
      e("kind", "block_domain"),
      c("unit_number", "text"),
      c("model", "text"),
      e("availability", "availability"),
      c("front_m2", "numeric"),
      c("depth_m2", "numeric"),
      c("land_m2", "numeric"),
      c("unit_size_m2", "numeric"),
      c("habitable_construction_m2", "numeric"),
      c("parking_size_m2", "numeric"),
      c("total_size_m2", "numeric"),
      c("bathrooms", "numeric"),
      c("has_parking", "bool"),
      c("has_motorcycle_parking", "bool"),
      c("parking_spaces", "int"),
      c("total_price_usd", "numeric"),
      c("price_without_vat_usd", "numeric"),
      c("price_per_m2_usd", "numeric"),
      c("rental_price_usd", "numeric"),
      c("rental_price_without_vat_usd", "numeric"),
      c("rental_price_per_m2_without_vat_usd", "numeric"),
      c("maintenance_total_price_m2_usd", "numeric"),
      c("maintenance_price_per_m2_usd", "numeric"),
      c("installment_usd", "numeric"),
      c("income_usd", "numeric"),
      c("unit_absorption", "numeric"),
      c("absorption_per_m2", "numeric"),
      r("usage_id", "unit_usage"),
      r("topography_id", "unit_topography"),
      r("parking_type_id", "unit_parking_type"),
      ...stamps,
    ],
  },
  {
    table: "unit_housing",
    publicId: false,
    key: ["unit_id"],
    scope: "unit_id",
    columns: [r("unit_id", "unit"), c("bedrooms", "int"), c("balcony_terrace_size_m2", "numeric")],
  },
  {
    table: "unit_office",
    publicId: false,
    key: ["unit_id"],
    scope: "unit_id",
    columns: [
      r("unit_id", "unit"),
      c("employee_capacity", "int"),
      c("price_without_parking_m2_usd", "numeric"),
      c("property_value_without_parking_usd", "numeric"),
      e("office_classification", "office_classification"),
      e("general_size_classification", "office_size_classification"),
      e("employee_capacity_range", "employee_capacity_range"),
      c("m2_range", "text"),
      c("size_employee_capacity_combined", "text"),
      c("size_m2_combined", "text"),
      c("parking_for_sale", "int"),
      c("balcony_terrace_size_m2", "numeric"),
    ],
  },
  {
    table: "unit_industrial",
    publicId: false,
    key: ["unit_id"],
    scope: "unit_id",
    columns: [
      r("unit_id", "unit"),
      c("warehouse_storage_size_m2", "numeric"),
      c("office_size_m2", "numeric"),
      c("mezzanine_size_m2", "numeric"),
      c("loading_area_m2", "numeric"),
      c("width_1_m2", "numeric"),
      c("depth_1_m2", "numeric"),
      c("depth_2_m2", "numeric"),
      c("height_m2", "numeric"),
      c("additional_parking_price_usd", "numeric"),
      c("quality_classification", "text"),
    ],
  },
  {
    table: "user",
    publicId: true,
    key: ["public_id"],
    uniques: ["username", "email"],
    localPrefix: APP_LOCAL_PREFIX,
    columns: [
      ...document,
      c("username", "text"),
      c("email", "text"),
      c("provider", "text"),
      { name: "password_hash", kind: "text", sensitive: true },
      e("role", "user_role"),
      c("confirmed", "bool"),
      c("blocked", "bool"),
      ...stamps,
    ],
  },
]

export const SPEC_BY_TABLE = Object.fromEntries(SPECS.map((s) => [s.table, s])) as Record<AppTable, TableSpec>

export type AppRow = Record<string, string | null>
export type AppData = Record<AppTable, AppRow[]>

/** Llave natural de una fila como texto, para comparar conjuntos. */
export function rowKey(spec: TableSpec, row: AppRow): string {
  return spec.key.map((k) => row[k] ?? "∅").join("|")
}
