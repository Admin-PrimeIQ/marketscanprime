import type { Collection, RawRow, StrapiTable } from "./snapshot"

/** Valores de los enums de Postgres en `msp_app` (prisma/migrations/…_init). */
export const ENUMS = {
  quarter: ["T1", "T2", "T3", "T4", "S1", "S2"],
  block_domain: ["housing", "office", "industrial"],
  market: ["Primary", "Secondary"],
  block_usage: ["Venta", "Renta"],
  availability: ["Available", "Not Available"],
  bank: [
    "fha",
    "bi",
    "gtc",
    "chn",
    "banrural",
    "bac",
    "bam",
    "bantrab",
    "credicorp",
    "internacional",
    "promerica",
    "azteca",
    "inmobiliario",
    "inv",
    "ficohsa",
    "vivibanco",
    "antigua",
    "ownerFinancing",
  ],
  office_classification: [
    "Micro 1",
    "Micro 2",
    "Small 1",
    "Small 2",
    "Medium 1",
    "Medium 2",
    "Medium 3",
    "Large 1",
    "Large 2",
    "Large 3",
    "Large 4",
    "Large 5",
  ],
  office_size_classification: ["Micro", "Small", "Medium", "Large"],
  employee_capacity_range: [
    "Range_1_To_5",
    "Range_6_To_10",
    "Range_11_To_15",
    "Range_16_To_20",
    "Range_21_To_30",
    "Range_31_To_40",
    "Range_41_To_50",
    "Range_51_To_80",
    "Range_81_To_100",
    "Range_101_To_140",
    "Range_141_To_170",
    "Range_More_Than_171",
  ],
  user_role: ["authenticated", "operator", "supervisor", "administrator", "super_administrator"],
} as const satisfies Record<string, readonly string[]>

export type Domain = (typeof ENUMS.block_domain)[number]

/** `units_cmps.component_type` → tipo de unidad y tabla del componente. */
export const UNIT_TYPE_COMPONENTS: Record<string, { kind: Domain; table: StrapiTable }> = {
  "unit-types.housing": { kind: "housing", table: "components_unit_types_housings" },
  "unit-types.offices": { kind: "office", table: "components_unit_types_offices" },
  "unit-types.industrial": { kind: "industrial", table: "components_unit_types_industrials" },
}

export const FINANCING_COMPONENT = "financing.financing"

/** `components_currencies_currencies_cmps.field` → moneda y tabla del componente. */
export const CURRENCY_FIELDS: Record<string, { currency: string; table: StrapiTable }> = {
  gtq: { currency: "GTQ", table: "components_currencies_currency_quetzals" },
  mxn: { currency: "MXN", table: "components_currencies_currency_peso_mexicanos" },
  pab: { currency: "PAB", table: "components_currencies_currency_balboas" },
  bzd: { currency: "BZD", table: "components_currencies_currency_belizes" },
  crc: { currency: "CRC", table: "components_currencies_currency_colon_costarricenses" },
  nio: { currency: "NIO", table: "components_currencies_currency_cordobas" },
  hnl: { currency: "HNL", table: "components_currencies_currency_lempiras" },
}

/** Categorías de incidencia y su explicación (el «por qué» del reporte). */
export const CATEGORIES = {
  "documento-sin-id": "La fila no tiene document_id: no hay con qué identificarla en msp_app.",
  "documento-duplicado": "Más de una fila publicada con el mismo document_id: no se sabe cuál es la buena.",
  "sin-publicar": "El documento solo existe como borrador (published_at nulo): Strapi no lo muestra.",
  "campo-obligatorio-vacio": "Un campo obligatorio en el esquema nuevo viene vacío en Strapi.",
  "enum-desconocido": "El valor no está entre los permitidos por el enum del esquema nuevo.",
  "codigo-duplicado": "El code se repite y en el esquema nuevo es único: todas las copias se cargan con code vacío para corregirlas después.",
  "iso-duplicado": "El código ISO del país se repite y en el esquema nuevo es único.",
  "usuario-duplicado": "El username o el email se repite y en el esquema nuevo es único.",
  "relacion-ambigua": "La relación es de un solo destino pero en Strapi apunta a varios distintos.",
  "relacion-rota": "El vínculo apunta a una fila que no existe o no está publicada.",
  "bloque-sin-proyecto": "El bloque no tiene proyecto y en el esquema nuevo es obligatorio: se carga en el proyecto «No definido».",
  "unidad-sin-bloque": "La unidad no tiene bloque y en el esquema nuevo es obligatorio: se carga en el bloque «No definido» de su tipo.",
  "rol-invalido": "El usuario no tiene rol o tiene uno que no existe en el esquema nuevo (p. ej. public).",
  "componente-desconocido": "Componente con un tipo o campo que el ETL no sabe migrar.",
  "tipo-unidad-multiple": "La unidad tiene más de una entrada en la zona dinámica unitType.",
  "tipo-unidad-roto": "La entrada unitType apunta a un componente inexistente o de tipo desconocido.",
  "tipo-unidad-distinto-al-bloque": "El tipo de la unidad no coincide con el domain de su bloque.",
  "componente-compartido": "El mismo componente lo usan varias filas; en Strapi cada componente es de una sola.",
  "financiamiento-multiple": "El bloque tiene más de un componente de financiamiento.",
  "financiamiento-roto": "El financiamiento apunta a filas inexistentes, a un banco desconocido o repite banco.",
  "moneda-rota": "Las monedas del perfil apuntan a filas inexistentes, a una moneda desconocida o la repiten.",
} as const

export type Category = keyof typeof CATEGORIES
export type Severity = "fatal" | "warning"

/** Categorías que solo advierten: los datos se cargan igual y las relaciones siguen siendo válidas. */
export const WARNING_CATEGORIES: ReadonlySet<Category> = new Set([
  "tipo-unidad-distinto-al-bloque",
  "componente-compartido",
  "codigo-duplicado",
  "bloque-sin-proyecto",
  "unidad-sin-bloque",
])

/**
 * Padres «No definido» para los hijos sin relación obligatoria. No existen en Strapi: el ETL los
 * crea con un `public_id` propio (los de Strapi no llevan guiones, así que no chocan). Hay un
 * bloque por tipo porque `block.domain` es obligatorio y debe coincidir con el tipo de la unidad.
 */
export const UNDEFINED_NAME = "No definido"
export const UNDEFINED_PROJECT = "etl-no-definido"
export const undefinedBlock = (domain: Domain) => `etl-no-definido-${domain}`
/** Fecha fija: las filas «No definido» no cambian entre corridas. */
export const UNDEFINED_STAMP = "2026-10-19T00:00:00.000Z"
/** Tipo del bloque «No definido» de una unidad sin unitType. */
export const DEFAULT_DOMAIN: Domain = "housing"

export interface Issue {
  category: Category
  severity: Severity
  /** Colección dueña: es lo que se excluye si la categoría se acepta con --allow. */
  table: Collection
  id: number
  documentId: string | null
  detail: string
}

export interface Exclusion {
  table: Collection
  id: number
  documentId: string | null
  reason: string
}

export type Present = Record<Collection, Map<number, RawRow>>

/** Relaciones de un solo destino: id Strapi del dueño → id Strapi del destino. */
export type ManyToOneKey =
  | "projectCountry"
  | "projectDeveloper"
  | "projectNse"
  | "projectSecurityType"
  | "projectProfile"
  | "blockProject"
  | "blockCategory"
  | "blockFocus"
  | "blockStatus"
  | "unitBlock"
  | "unitUsage"
  | "unitTopography"
  | "unitParkingType"
  | "userRole"

export type SetKey = "projectAmenities" | "projectServices"

export interface Resolved {
  present: Present
  rel: Record<ManyToOneKey, Map<number, number>>
  sets: Record<SetKey, Map<number, { target: number; ord: RawRow[string] }[]>>
  unitType: Map<number, { kind: Domain; row: RawRow }>
  financing: Map<number, { row: RawRow; banks: { bank: string; rate: RawRow[string] }[] }>
  currencies: Map<number, { currency: string; buy: RawRow[string]; sell: RawRow[string] }[]>
  /** Ids Strapi con code repetido: se cargan con code vacío. */
  duplicateCodes: { blocks: Set<number>; units: Set<number> }
}
