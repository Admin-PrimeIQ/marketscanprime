import type { StrapiUnit, StrapiUnitType } from "@/lib/api/strapi"

/** Familia de componente en la dynamic zone (misma idea que el resto de keys en minúsculas cortas). */
export type DzSegment = "housing" | "offices" | "industrial"

const COMPONENT_BY_SEGMENT: Record<DzSegment, readonly string[]> = {
  housing: ["unit-types.housing", "unit-types.residential"],
  offices: ["unit-types.offices", "unit-types.office"],
  industrial: ["unit-types.industrial"],
}

export type DzGridType = "number" | "boolean" | "text" | "enum"

/**
 * Un campo editable en grid: `gridKey` es la convención de la app (columnas, i18n);
 * `strapiKey` es el atributo en el JSON de Strapi (OpenAPI `UnitTypes*Component`).
 */
export type DynamicZoneFieldDef = {
  gridKey: string
  strapiKey: string
  gridType: DzGridType
  /** Valores exactos del enum en OpenAPI / Strapi (p. ej. UnitTypesOfficesComponent). */
  enumValues?: readonly string[]
}

function def(
  gridKey: string,
  strapiKey: string,
  gridType: Exclude<DzGridType, "enum">
): DynamicZoneFieldDef {
  return { gridKey, strapiKey, gridType }
}

function defEnum(
  gridKey: string,
  strapiKey: string,
  enumValues: readonly string[]
): DynamicZoneFieldDef {
  return { gridKey, strapiKey, gridType: "enum", enumValues }
}

/** OpenAPI `UnitTypesOfficesComponent.officeClassification` */
export const UNIT_OFFICE_CLASSIFICATION_VALUES = [
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
] as const

/** OpenAPI `UnitTypesOfficesComponent.generalSizeClassification` */
export const UNIT_OFFICE_GENERAL_SIZE_VALUES = ["Micro", "Small", "Medium", "Large"] as const

/** OpenAPI `UnitTypesOfficesComponent.employeeCapacityRange` */
export const UNIT_OFFICE_EMPLOYEE_CAPACITY_RANGE_VALUES = [
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
] as const

/** Sufijo estable para claves i18n (espacios → _). */
export function dzEnumApiValueToMessageKeySuffix(apiValue: string): string {
  return apiValue.replace(/\s+/g, "_")
}

/**
 * Resuelve lo elegido en UI (valor API o etiqueta traducida) al string exacto del enum Strapi.
 */
export function matchPickedToDzEnum(
  enumValues: readonly string[],
  picked: string,
  resolveLabel: (apiValue: string) => string
): string | undefined {
  const trimmed = picked.replace(/^▼\s*/, "").trim()
  if (!trimmed) return undefined
  if ((enumValues as readonly string[]).includes(trimmed)) return trimmed
  for (const v of enumValues) {
    if (resolveLabel(v) === trimmed) return v
    if (resolveLabel(v).toLowerCase() === trimmed.toLowerCase()) return v
  }
  for (const v of enumValues) {
    if (v.toLowerCase() === trimmed.toLowerCase()) return v
  }
  return undefined
}

/** Claves de columna `segment.gridKey` que son enum (dropdown en grid). */
export function getDynamicZoneEnumColumnKeys(): string[] {
  const keys: string[] = []
  for (const seg of ["housing", "offices", "industrial"] as const) {
    for (const d of DYNAMIC_ZONE_FIELDS_BY_SEGMENT[seg]) {
      if (d.gridType === "enum" && d.enumValues?.length) {
        keys.push(`${seg}.${d.gridKey}`)
      }
    }
  }
  return keys
}

/** Definición por segmento (orden = orden de columnas en tabla). */
export const DYNAMIC_ZONE_FIELDS_BY_SEGMENT: Record<DzSegment, readonly DynamicZoneFieldDef[]> = {
  housing: [
    def("bedrooms", "bedrooms", "number"),
    def("balconyTerraceM2", "balconyTerraceSizeM2", "number"),
  ],
  offices: [
    def("balconyTerraceM2", "balconyTerraceSizeM2", "number"),
    def("employeeCapacity", "employeeCapacity", "number"),
    def("parkingSpacesSale", "parkingForSale", "number"),
    def("pricePerM2ExParkingUsd", "priceWithoutParkingM2USD", "number"),
    def("propertyValueExParkingUsd", "propertyValueWithoutParkingUSD", "number"),
    defEnum("officeClass", "officeClassification", UNIT_OFFICE_CLASSIFICATION_VALUES),
    defEnum("sizeCategory", "generalSizeClassification", UNIT_OFFICE_GENERAL_SIZE_VALUES),
    defEnum(
      "staffCapacityRange",
      "employeeCapacityRange",
      UNIT_OFFICE_EMPLOYEE_CAPACITY_RANGE_VALUES
    ),
    def("areaRange", "m2Range", "text"),
    def("sizeStaffSummary", "sizeEmployeeCapacityCombined", "text"),
    def("sizeAreaSummary", "sizeM2Combined", "text"),
  ],
  industrial: [
    def("warehouseM2", "warehouseStorageSizeM2", "number"),
    def("officeM2", "officeSizeM2", "number"),
    def("mezzanineM2", "mezzanineSizeM2", "number"),
    def("loadingAreaM2", "loadingAreaM2", "number"),
    def("widthM2", "width1M2", "number"),
    def("depthPrimaryM2", "depth1M2", "number"),
    def("depthSecondaryM2", "depth2M2", "number"),
    def("heightM2", "heightM2", "number"),
    def("extraParkingPriceUsd", "additionalParkingPriceUSD", "number"),
  ],
}

const dzFieldBySegmentGridKey: Record<DzSegment, Map<string, DynamicZoneFieldDef>> = {
  housing: new Map(DYNAMIC_ZONE_FIELDS_BY_SEGMENT.housing.map((d) => [d.gridKey, d])),
  offices: new Map(DYNAMIC_ZONE_FIELDS_BY_SEGMENT.offices.map((d) => [d.gridKey, d])),
  industrial: new Map(DYNAMIC_ZONE_FIELDS_BY_SEGMENT.industrial.map((d) => [d.gridKey, d])),
}

const DZ_COLUMN_KEY_RE = /^(housing|offices|industrial)\.(.+)$/

export type ParsedDynamicZoneColumnKey = {
  segment: DzSegment
  /** Sufijo de columna (`housing.balconyTerraceM2` → `balconyTerraceM2`). */
  gridKey: string
}

export function parseDynamicZoneColumnKey(key: string): ParsedDynamicZoneColumnKey | null {
  const m = key.match(DZ_COLUMN_KEY_RE)
  if (!m) return null
  const segment = m[1] as DzSegment
  if (segment !== "housing" && segment !== "offices" && segment !== "industrial") return null
  return { segment, gridKey: m[2] }
}

export function getDzFieldDef(
  segment: DzSegment,
  gridKey: string
): DynamicZoneFieldDef | undefined {
  return dzFieldBySegmentGridKey[segment].get(gridKey)
}

/** Atributo Strapi para una columna dinámica, o `undefined` si la key no existe. */
export function dzStrapiKey(segment: DzSegment, gridKey: string): string | undefined {
  return getDzFieldDef(segment, gridKey)?.strapiKey
}

function dynamicZoneEntryRichness(entry: unknown): number {
  if (!entry || typeof entry !== "object") return 0
  return Object.keys(entry as Record<string, unknown>).filter(
    (k) => (entry as Record<string, unknown>)[k] !== undefined
  ).length
}

export function getUnitTypeZone(unit: StrapiUnit): StrapiUnitType[] {
  const u = unit as StrapiUnit & { type?: StrapiUnitType[] | null }
  const ut = u.unitType
  const tp = u.type
  const utArr = Array.isArray(ut) && ut.length > 0 ? ut : null
  const tpArr = Array.isArray(tp) && tp.length > 0 ? tp : null
  /** Ambos presentes: si es el mismo `__component` y `type` trae más datos (p. ej. API solo populate en `type`), usar `type`. */
  if (utArr && tpArr) {
    const u0 = utArr[0] as { __component?: string } | undefined
    const t0 = tpArr[0] as { __component?: string } | undefined
    if (
      u0?.__component &&
      t0?.__component &&
      u0.__component === t0.__component &&
      dynamicZoneEntryRichness(t0) > dynamicZoneEntryRichness(u0)
    ) {
      return tpArr
    }
    return utArr
  }
  if (utArr) return utArr
  if (tpArr) return tpArr
  if (Array.isArray(ut)) return ut
  if (Array.isArray(tp)) return tp
  return []
}

function componentMatchesSegment(component: string | undefined, segment: DzSegment): boolean {
  if (!component) return false
  return (COMPONENT_BY_SEGMENT[segment] as readonly string[]).includes(component)
}

/** Índice del primer bloque del segmento en la dynamic zone, o -1. */
export function findDynamicZoneSegmentIndex(unit: StrapiUnit, segment: DzSegment): number {
  const dz = getUnitTypeZone(unit)
  for (let i = 0; i < dz.length; i++) {
    const c = dz[i]?.__component as string | undefined
    if (componentMatchesSegment(c, segment)) return i
  }
  return -1
}

export function rowHasDynamicZoneSegment(unit: StrapiUnit, segment: DzSegment): boolean {
  return findDynamicZoneSegmentIndex(unit, segment) >= 0
}

export function getDynamicZoneFieldValue(
  unit: StrapiUnit,
  segment: DzSegment,
  gridKey: string
): unknown {
  const attr = dzStrapiKey(segment, gridKey)
  if (!attr) return undefined
  const dz = getUnitTypeZone(unit)
  const i = findDynamicZoneSegmentIndex(unit, segment)
  if (i < 0) return undefined
  const entry = dz[i] as unknown as Record<string, unknown>
  return entry[attr]
}

/** Ruta API `type[i].<strapiKey>` (Strapi updateUnit). */
export function getDynamicZoneApiFieldPath(
  unit: StrapiUnit,
  segment: DzSegment,
  gridKey: string
): string | null {
  const attr = dzStrapiKey(segment, gridKey)
  if (!attr) return null
  const i = findDynamicZoneSegmentIndex(unit, segment)
  if (i < 0) return null
  return `type[${i}].${attr}`
}

export function setDynamicZoneFieldOnUnit(
  unit: StrapiUnit,
  segment: DzSegment,
  gridKey: string,
  value: unknown
): boolean {
  const attr = dzStrapiKey(segment, gridKey)
  if (!attr) return false
  const i = findDynamicZoneSegmentIndex(unit, segment)
  if (i < 0) return false
  const dz = [...getUnitTypeZone(unit)]
  const prev = dz[i] as unknown as Record<string, unknown>
  dz[i] = { ...prev, [attr]: value } as unknown as StrapiUnitType
  const u = unit as StrapiUnit & { unitType?: StrapiUnitType[]; type?: StrapiUnitType[] }
  u.unitType = dz
  u.type = dz
  return true
}

/** Si al menos una unidad tiene ese tipo en `unitType[]`, se muestran las columnas del grupo. */
export function detectSegmentsPresentInUnits(units: StrapiUnit[]): DzSegment[] {
  const found = new Set<DzSegment>()
  for (const unit of units) {
    const dz = getUnitTypeZone(unit)
    for (const entry of dz) {
      const c = entry?.__component as string | undefined
      if (!c) continue
      ;(Object.keys(COMPONENT_BY_SEGMENT) as DzSegment[]).forEach((seg) => {
        if (componentMatchesSegment(c, seg)) found.add(seg)
      })
    }
  }
  const order: DzSegment[] = ["housing", "offices", "industrial"]
  return order.filter((s) => found.has(s))
}

// --- API unificada: columnas derivadas de `unitType` (misma superficie en toda la app) ---

export type ResolvedUnitTypeDynamicColumn = {
  columnKey: string
  segment: DzSegment
  gridKey: string
  def: DynamicZoneFieldDef
}

/** Columna `housing.*` / `offices.*` / `industrial.*` registrada y con `def` válido. */
export function resolveUnitTypeDynamicColumn(columnKey: string): ResolvedUnitTypeDynamicColumn | null {
  const parsed = parseDynamicZoneColumnKey(columnKey)
  if (!parsed) return null
  const fieldDef = getDzFieldDef(parsed.segment, parsed.gridKey)
  if (!fieldDef) return null
  return {
    columnKey,
    segment: parsed.segment,
    gridKey: parsed.gridKey,
    def: fieldDef,
  }
}

export function readUnitTypeDynamicValue(unit: StrapiUnit, columnKey: string): unknown {
  const r = resolveUnitTypeDynamicColumn(columnKey)
  if (!r) return undefined
  return getDynamicZoneFieldValue(unit, r.segment, r.gridKey)
}

export function getUnitTypeDynamicApiPath(unit: StrapiUnit, columnKey: string): string | null {
  const r = resolveUnitTypeDynamicColumn(columnKey)
  if (!r) return null
  return getDynamicZoneApiFieldPath(unit, r.segment, r.gridKey)
}

/** La fila tiene el componente de zona dinámica que exige esta columna. */
export function unitTypeDynamicAppliesToRow(unit: StrapiUnit, columnKey: string): boolean {
  const r = resolveUnitTypeDynamicColumn(columnKey)
  if (!r) return false
  return rowHasDynamicZoneSegment(unit, r.segment)
}

/** Valor para el body de Strapi (update). */
export function normalizeUnitTypeDynamicForStrapiBody(
  def: DynamicZoneFieldDef,
  value: unknown
): unknown {
  if (def.gridType === "number") {
    const num = typeof value === "number" ? value : parseFloat(String(value))
    return Number.isFinite(num) ? num : 0
  }
  if (def.gridType === "boolean") return Boolean(value)
  if (def.gridType === "enum" && def.enumValues?.length) {
    const s = value === null || value === undefined ? "" : String(value).trim()
    if (!s) return ""
    if ((def.enumValues as readonly string[]).includes(s)) return s
    return s
  }
  return value === null || value === undefined ? "" : String(value)
}

export function normalizeUnitTypeDynamicFromGridEditor(
  def: DynamicZoneFieldDef,
  value: unknown,
  roundTo2: (n: number) => number
): unknown {
  if (def.gridType === "number") {
    const n = typeof value === "number" ? value : parseFloat(String(value)) || 0
    return roundTo2(n)
  }
  if (def.gridType === "boolean") return Boolean(value)
  if (def.gridType === "enum" && def.enumValues?.length) {
    return String(value ?? "")
      .replace(/^▼\s*/, "")
      .trim()
  }
  return String(value ?? "")
}

export function normalizeUnitTypeDynamicFromPaste(
  def: DynamicZoneFieldDef,
  cleanValue: string,
  roundTo2: (n: number) => number
): unknown {
  if (def.gridType === "number") return roundTo2(parseFloat(cleanValue) || 0)
  if (def.gridType === "boolean") {
    const s = cleanValue.toLowerCase()
    return s === "true" || s === "1" || s === "sí" || s === "si" || s === "yes"
  }
  if (def.gridType === "enum" && def.enumValues?.length) {
    const t = cleanValue.trim()
    if ((def.enumValues as readonly string[]).includes(t)) return t
    const tl = t.toLowerCase()
    for (const v of def.enumValues) {
      if (v.toLowerCase() === tl) return v
    }
    return t
  }
  return cleanValue
}

/**
 * Actualiza la unidad en memoria desde edición o pegado.
 * @returns si se aplicó (columna válida + fila con el segmento).
 */
export function applyUnitTypeDynamicLocalChange(
  unit: StrapiUnit,
  columnKey: string,
  raw: unknown,
  opts: { roundTo2: (n: number) => number; source: "grid" | "paste" }
): boolean {
  const r = resolveUnitTypeDynamicColumn(columnKey)
  if (!r || !rowHasDynamicZoneSegment(unit, r.segment)) return false
  const v =
    opts.source === "paste"
      ? normalizeUnitTypeDynamicFromPaste(r.def, String(raw ?? ""), opts.roundTo2)
      : normalizeUnitTypeDynamicFromGridEditor(r.def, raw, opts.roundTo2)
  return setDynamicZoneFieldOnUnit(unit, r.segment, r.gridKey, v)
}

export function clearUnitTypeDynamicCell(
  unit: StrapiUnit,
  columnKey: string,
  neutralValue: unknown
): boolean {
  const r = resolveUnitTypeDynamicColumn(columnKey)
  if (!r || !rowHasDynamicZoneSegment(unit, r.segment)) return false
  return setDynamicZoneFieldOnUnit(unit, r.segment, r.gridKey, neutralValue)
}
