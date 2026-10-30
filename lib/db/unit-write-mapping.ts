/**
 * Reglas puras de la escritura de unidades sobre Prisma: lo que manda la hoja a `updateUnit`,
 * `updateUnitBatch` (`{ field, value }`) y `createUnit` (la unidad entera) pasa a columnas de `unit`
 * y de su tabla hija (`unit_housing` / `unit_office` / `unit_industrial`).
 *
 * - Última entrada gana por campo, como `updateUnitBatch` de Strapi.
 * - Se descartan los campos que solo existen en el cliente (precios en otra moneda y
 *   `maintenanceWithoutVATUSD`); cualquier otro campo desconocido es un error.
 * - El componente de la zona dinámica es siempre el del bloque (`domain`): uno de otro tipo se rechaza.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import {
  UNIT_OFFICE_CLASSIFICATION_VALUES,
  UNIT_OFFICE_EMPLOYEE_CAPACITY_RANGE_VALUES,
  UNIT_OFFICE_GENERAL_SIZE_VALUES,
} from "../units/unit-type-dynamic-columns.ts"
import { UnitError } from "./unit-mapping.ts"

export type UnitDomain = "housing" | "office" | "industrial"
export type UnitRef = string | number
export type UnitRelation = "topography" | "parkingType" | "unitUsage"
export type UnitColumnValue = string | number | boolean | null

export interface UnitUpdateEntry {
  field: string
  value: unknown
}

export interface UnitWriteData {
  /** Columnas de `unit` (nombres de Prisma); los enumerados ya con el nombre del miembro. */
  scalars: Record<string, UnitColumnValue>
  /** `null` desvincula. */
  relations: Partial<Record<UnitRelation, UnitRef | null>>
  /** Columnas de la tabla hija del tipo del bloque; `null` si no se tocó la zona dinámica. */
  component: Record<string, UnitColumnValue> | null
  block?: UnitRef
}

export const UNKNOWN_UNIT_FIELDS = "La unidad trae campos que no existen"
export const INVALID_UNIT_VALUES = "Valores de unidad inválidos"
export const COMPONENT_DOMAIN_MISMATCH = "El tipo de la unidad no coincide con el del bloque."
export const SINGLE_COMPONENT = "Una unidad lleva un solo componente en `unitType`."
export const INVALID_UNIT_CODE = "El código de la unidad solo admite letras, números y - _ . ~"
export const UNIT_NOT_FOUND = "La unidad no existe."
export const UNIT_BLOCK_CHANGE = "Una unidad no se puede pasar a otro bloque desde la hoja."
export const MISSING_UNIT_REFERENCES = "No existen las referencias"
export const DUPLICATE_UNIT_CODE = "Otra unidad acaba de tomar ese código. Guarda de nuevo."

export const COMPONENT_BY_DOMAIN: Record<UnitDomain, string> = {
  housing: "unit-types.housing",
  office: "unit-types.offices",
  industrial: "unit-types.industrial",
}

/** Debe coincidir con `CLIENT_ONLY_FOREIGN_PRICE_KEY_RE` de `lib/api/strapi.ts`. */
const CLIENT_ONLY_FOREIGN_PRICE_KEY_RE =
  /^(totalPrice|priceWithoutVAT|pricePerM2|rentalPrice|rentalPriceWithoutVAT|rentalPricePerM2WithoutVAT|maintenanceTotalPriceM2|maintenanceWithoutVAT|maintenancePricePerM2|installment|income)([A-Z]{3})$/
const CLIENT_ONLY_USD_FIELDS = new Set(["maintenanceWithoutVATUSD"])

export function isClientOnlyUnitField(field: string): boolean {
  if (CLIENT_ONLY_USD_FIELDS.has(field)) return true
  const match = field.match(CLIENT_ONLY_FOREIGN_PRICE_KEY_RE)
  return Boolean(match && match[2] !== "USD")
}

/** Claves de la fila en memoria de la hoja que no son datos de la unidad. */
const IGNORED_CREATE_KEYS = new Set(["id", "documentId", "clientTempId", "createdAt", "updatedAt", "publishedAt", "locale", "type"])

const CODE_RE = /^[A-Za-z0-9\-_.~]*$/

type ColumnKind = "text" | "decimal" | "integer" | "boolean" | "availability" | "officeClassification" | "officeSize" | "employeeRange"

interface ColumnSpec {
  column: string
  kind: ColumnKind
}

const col = (column: string, kind: ColumnKind): ColumnSpec => ({ column, kind })

const UNIT_COLUMNS: Record<string, ColumnSpec> = {
  code: col("code", "text"),
  name: col("name", "text"),
  legacyId: col("legacyId", "text"),
  unitNumber: col("unitNumber", "text"),
  model: col("model", "text"),
  availability: col("availability", "availability"),
  frontM2: col("frontM2", "decimal"),
  depthM2: col("depthM2", "decimal"),
  landM2: col("landM2", "decimal"),
  unitSizeM2: col("unitSizeM2", "decimal"),
  habitableConstructionM2: col("habitableConstructionM2", "decimal"),
  parkingSizeM2: col("parkingSizeM2", "decimal"),
  totalSizeM2: col("totalSizeM2", "decimal"),
  bathrooms: col("bathrooms", "decimal"),
  hasParking: col("hasParking", "boolean"),
  hasMotorcycleParking: col("hasMotorcycleParking", "boolean"),
  parkingSpaces: col("parkingSpaces", "integer"),
  totalPriceUSD: col("totalPriceUsd", "decimal"),
  priceWithoutVATUSD: col("priceWithoutVatUsd", "decimal"),
  pricePerM2USD: col("pricePerM2Usd", "decimal"),
  rentalPriceUSD: col("rentalPriceUsd", "decimal"),
  rentalPriceWithoutVATUSD: col("rentalPriceWithoutVatUsd", "decimal"),
  rentalPricePerM2WithoutVATUSD: col("rentalPricePerM2WithoutVatUsd", "decimal"),
  maintenanceTotalPriceM2USD: col("maintenanceTotalPriceM2Usd", "decimal"),
  maintenancePricePerM2USD: col("maintenancePricePerM2Usd", "decimal"),
  installmentUSD: col("installmentUsd", "decimal"),
  incomeUSD: col("incomeUsd", "decimal"),
  unitAbsorption: col("unitAbsorption", "decimal"),
  absorptionPerM2: col("absorptionPerM2", "decimal"),
}

const UNIT_RELATIONS = new Set<string>(["topography", "parkingType", "unitUsage"])

const COMPONENT_COLUMNS: Record<UnitDomain, Record<string, ColumnSpec>> = {
  housing: {
    bedrooms: col("bedrooms", "integer"),
    balconyTerraceSizeM2: col("balconyTerraceSizeM2", "decimal"),
  },
  office: {
    employeeCapacity: col("employeeCapacity", "integer"),
    priceWithoutParkingM2USD: col("priceWithoutParkingM2Usd", "decimal"),
    propertyValueWithoutParkingUSD: col("propertyValueWithoutParkingUsd", "decimal"),
    officeClassification: col("officeClassification", "officeClassification"),
    generalSizeClassification: col("generalSizeClassification", "officeSize"),
    employeeCapacityRange: col("employeeCapacityRange", "employeeRange"),
    m2Range: col("m2Range", "text"),
    sizeEmployeeCapacityCombined: col("sizeEmployeeCapacityCombined", "text"),
    sizeM2Combined: col("sizeM2Combined", "text"),
    parkingForSale: col("parkingForSale", "integer"),
    balconyTerraceSizeM2: col("balconyTerraceSizeM2", "decimal"),
  },
  industrial: {
    warehouseStorageSizeM2: col("warehouseStorageSizeM2", "decimal"),
    officeSizeM2: col("officeSizeM2", "decimal"),
    mezzanineSizeM2: col("mezzanineSizeM2", "decimal"),
    loadingAreaM2: col("loadingAreaM2", "decimal"),
    width1M2: col("width1M2", "decimal"),
    depth1M2: col("depth1M2", "decimal"),
    depth2M2: col("depth2M2", "decimal"),
    heightM2: col("heightM2", "decimal"),
    additionalParkingPriceUSD: col("additionalParkingPriceUsd", "decimal"),
    qualityClassification: col("qualityClassification", "text"),
  },
}

/** Valor guardado (el de la UI y de Strapi) → nombre del miembro del enumerado de Prisma. */
const AVAILABILITY_MEMBERS: Record<string, string> = { Available: "Available", "Not Available": "Not_Available", Not_Available: "Not_Available" }

const OFFICE_CLASSIFICATION_MEMBERS: Record<string, string> = Object.fromEntries(
  UNIT_OFFICE_CLASSIFICATION_VALUES.flatMap((value) => {
    const member = value.replace(" ", "_")
    return [
      [value, member],
      [member, member],
    ]
  }),
)

// En estos dos el valor de la UI ya es el nombre del miembro del enumerado.
const OFFICE_SIZE_MEMBERS = new Set<string>(UNIT_OFFICE_GENERAL_SIZE_VALUES)
const EMPLOYEE_RANGE_MEMBERS = new Set<string>(UNIT_OFFICE_EMPLOYEE_CAPACITY_RANGE_VALUES)

const isBlank = (value: unknown) => value === null || value === undefined || (typeof value === "string" && value.trim() === "")

/** Convierte `value` según `kind`; `undefined` = inválido. */
function convertValue(kind: ColumnKind, value: unknown): UnitColumnValue | undefined {
  if (kind === "text") {
    if (value === null || value === undefined) return null
    if (typeof value === "string") return value
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
    return undefined
  }
  if (isBlank(value)) return null
  switch (kind) {
    case "decimal":
    case "integer": {
      const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN
      if (!Number.isFinite(number)) return undefined
      if (kind === "integer" && !Number.isInteger(number)) return undefined
      return number
    }
    case "boolean":
      if (typeof value === "boolean") return value
      if (value === "true") return true
      if (value === "false") return false
      return undefined
    case "availability":
      return typeof value === "string" ? AVAILABILITY_MEMBERS[value.trim()] : undefined
    case "officeClassification":
      return typeof value === "string" ? OFFICE_CLASSIFICATION_MEMBERS[value.trim()] : undefined
    case "officeSize":
      return typeof value === "string" && OFFICE_SIZE_MEMBERS.has(value.trim()) ? value.trim() : undefined
    case "employeeRange":
      return typeof value === "string" && EMPLOYEE_RANGE_MEMBERS.has(value.trim()) ? value.trim() : undefined
  }
}

function toRef(value: unknown): UnitRef | null | undefined {
  if (isBlank(value)) return null
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : undefined
  if (typeof value === "string") return value.trim()
  if (typeof value === "object") {
    const { documentId, id } = value as { documentId?: unknown; id?: unknown }
    if (typeof documentId === "string" && documentId.trim()) return documentId.trim()
    if (typeof id === "number" || typeof id === "string") return toRef(id)
  }
  return undefined
}

function describe(value: unknown): string {
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text.length > 60 ? `${text.slice(0, 57)}...` : text
  } catch {
    return String(value)
  }
}

const COMPONENT_PATH_RE = /^(?:unitType|type)\[(\d+)\]\.(.+)$/

class WriteCollector {
  readonly data: UnitWriteData = { scalars: {}, relations: {}, component: null }
  readonly unknown: string[] = []
  readonly invalid: string[] = []
  private readonly domain: UnitDomain

  constructor(domain: UnitDomain) {
    this.domain = domain
  }

  set(field: string, value: unknown): void {
    if (isClientOnlyUnitField(field)) return
    const path = field.match(COMPONENT_PATH_RE)
    if (path) {
      if (path[1] !== "0") {
        this.invalid.push(`${field}: ${SINGLE_COMPONENT}`)
        return
      }
      this.setComponentField(path[2], value, field)
      return
    }
    if (field === "unitType") {
      this.setUnitType(value)
      return
    }
    if (field === "block") {
      const ref = toRef(value)
      if (ref === undefined || ref === null) this.invalid.push(`block: ${describe(value)}`)
      else this.data.block = ref
      return
    }
    if (UNIT_RELATIONS.has(field)) {
      const ref = toRef(value)
      if (ref === undefined) this.invalid.push(`${field}: ${describe(value)}`)
      else this.data.relations[field as UnitRelation] = ref
      return
    }
    const spec = UNIT_COLUMNS[field]
    if (!spec) {
      this.unknown.push(field)
      return
    }
    const converted = convertValue(spec.kind, value)
    if (converted === undefined) {
      this.invalid.push(`${field}: ${describe(value)}`)
      return
    }
    if (field === "code") {
      const code = typeof converted === "string" ? converted.trim() : converted
      if (typeof code === "string" && !CODE_RE.test(code)) {
        this.invalid.push(`code: ${INVALID_UNIT_CODE}`)
        return
      }
      this.data.scalars.code = code === "" ? null : code
      return
    }
    this.data.scalars[spec.column] = converted
  }

  private setComponentField(name: string, value: unknown, label: string): void {
    if (name === "id" || name === "__component") return
    const spec = COMPONENT_COLUMNS[this.domain][name]
    if (!spec) {
      this.unknown.push(label)
      return
    }
    const converted = convertValue(spec.kind, value)
    if (converted === undefined) {
      this.invalid.push(`${label}: ${describe(value)}`)
      return
    }
    this.data.component = { ...(this.data.component ?? {}), [spec.column]: converted }
  }

  /** Un `unitType` vacío no borra el componente: el tipo de la unidad lo fija el bloque. */
  private setUnitType(value: unknown): void {
    if (value === null || value === undefined) return
    if (!Array.isArray(value)) {
      this.invalid.push(`unitType: ${describe(value)}`)
      return
    }
    if (value.length === 0) return
    if (value.length > 1) {
      this.invalid.push(`unitType: ${SINGLE_COMPONENT}`)
      return
    }
    const entry = value[0]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      this.invalid.push(`unitType[0]: ${describe(entry)}`)
      return
    }
    const component = (entry as { __component?: unknown }).__component
    if (component !== COMPONENT_BY_DOMAIN[this.domain]) {
      throw new UnitError(COMPONENT_DOMAIN_MISMATCH, [`unitType[0].__component: ${describe(component)}, bloque: ${COMPONENT_BY_DOMAIN[this.domain]}`])
    }
    // Aunque no traiga campos, el componente existe: la fila hija se crea si falta.
    this.data.component = { ...(this.data.component ?? {}) }
    for (const [name, fieldValue] of Object.entries(entry)) {
      if (fieldValue === undefined) continue
      this.setComponentField(name, fieldValue, `unitType[0].${name}`)
    }
  }

  finish(): UnitWriteData {
    if (this.unknown.length > 0) throw new UnitError(UNKNOWN_UNIT_FIELDS, [...new Set(this.unknown)])
    if (this.invalid.length > 0) throw new UnitError(INVALID_UNIT_VALUES, this.invalid)
    return this.data
  }
}

/** `updateUnit` / `updateUnitBatch`: la lista de cambios de una unidad de un bloque de tipo `domain`. */
export function toUnitUpdateData(entries: ReadonlyArray<UnitUpdateEntry>, domain: UnitDomain): UnitWriteData {
  const collector = new WriteCollector(domain)
  for (const { field, value } of entries) collector.set(field, value)
  return collector.finish()
}

/** `createUnit`: la fila en memoria de la hoja, sin sus claves de cliente y con el bloque. */
export function toUnitCreateData(input: Record<string, unknown>, domain: UnitDomain): UnitWriteData {
  const collector = new WriteCollector(domain)
  for (const [field, value] of Object.entries(input)) {
    if (value === undefined || IGNORED_CREATE_KEYS.has(field)) continue
    collector.set(field, value)
  }
  return collector.finish()
}
