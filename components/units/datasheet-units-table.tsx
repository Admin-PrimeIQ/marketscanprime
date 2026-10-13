"use client"

import {
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  Fragment,
  type ReactNode,
} from "react"
import {
  DataEditor,
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  GridSelection,
  EditableGridCell,
  EditListItem,
  NumberCell,
  BooleanCell,
  BubbleCell,
  DrilldownCell,
  RowIDCell,
  UriCell,
  GridColumnIcon,
  Rectangle,
  CompactSelection,
  type DataEditorRef,
  type GridMouseEventArgs,
  type Theme,
} from "@glideapps/glide-data-grid"
import { createPortal } from "react-dom"
import { DropdownCell } from "./custom-cells/dropdown-cell"
import "@glideapps/glide-data-grid/dist/index.css"
import {
  StrapiUnit,
  type StrapiError,
  type CatalogItem,
  strapiClient,
  localCurrencyUnitsPerOneUsd,
  getStrapiPublicBaseUrl,
} from "@/lib/api/strapi"
import { useAuth } from "@/context/AuthContext"
import { blockBehavior } from "@/lib/block-category"
import { isStrapiSuperAdmin } from "@/lib/auth/is-strapi-super-admin"
import {
  emptyUnitTypeEntry,
  formatUnitTypeForStrapi,
  getUnitTypeDisplayLabel,
  labelToComponent,
} from "@/lib/units/unit-type-zone"
import {
  DYNAMIC_ZONE_FIELDS_BY_SEGMENT,
  detectSegmentsPresentInUnits,
  getUnitTypeZone,
  resolveUnitTypeDynamicColumn,
  readUnitTypeDynamicValue,
  getUnitTypeDynamicApiPath,
  unitTypeDynamicAppliesToRow,
  normalizeUnitTypeDynamicForStrapiBody,
  applyUnitTypeDynamicLocalChange,
  clearUnitTypeDynamicCell,
  dzEnumApiValueToMessageKeySuffix,
  getDynamicZoneEnumColumnKeys,
  matchPickedToDzEnum,
  type DzSegment,
} from "@/lib/units/unit-type-dynamic-columns"
import { M2_TO_VARAS_SQUARED, getVarasFactor } from "@/lib/constants"
import {
  PARKING_M2_PER_SPACE,
  VAT_RATE,
  RECONCILED_FORMULA_FIELDS,
  roundTo2,
  removeVat,
  applyVat,
  syncUnitParkingSize,
  syncUnitTotalSize,
  syncUnitHabitableConstruction,
  syncUnitPriceFromTotal,
  syncUnitRentalFromTotal,
  syncUnitMaintenancePerM2,
  syncMaintenanceFromPerM2,
  syncMaintenanceFromWithoutVAT,
  syncPriceFromPerM2,
  syncPriceFromWithoutVAT,
  syncRentalFromPerM2,
  syncRentalFromWithoutVAT,
  calcInstallmentFromPriceWithoutVAT,
  installmentParamsForIso,
  maintenanceWithoutVatUsd,
  syncUnitInstallment,
  syncUnitIncome,
  syncUnitAbsorption,
  syncUnitAbsorptionPerM2,
  syncIndustrialUnitSize,
  industrialKindOf,
  type IndustrialKind,
  ensureUnitFormulasSynced,
  getVatRate,
  vatRatesFor,
  type VatRates,
} from "@/lib/units/formulas.ts"
import { useOverflowGroups } from "@/hooks/use-overflow-groups"
import { countryFlag } from "@/lib/region"


/** Mapas estáticos mts² ↔ varas² — sin dependencias reactivas, se declaran a nivel de módulo */
const M2_TO_VARAS_MAP: Record<string, string> = {
  frontM2: "frontVaras2",
  depthM2: "depthVaras2",
  landM2: "landVaras2",
  unitSizeM2: "unitSizeVaras2",
  parkingSizeM2: "parkingSizeVaras2",
  totalSizeM2: "totalSizeVaras2",
  habitableConstructionM2: "habitableConstructionVaras2",
}

const VARAS_TO_M2_MAP: Record<string, string> = {
  frontVaras2: "frontM2",
  depthVaras2: "depthM2",
  landVaras2: "landM2",
  unitSizeVaras2: "unitSizeM2",
  parkingSizeVaras2: "parkingSizeM2",
  totalSizeVaras2: "totalSizeM2",
  habitableConstructionVaras2: "habitableConstructionM2",
}

/** Columnas de precio en moneda distinta de USD (ej. totalPriceGTQ); las editables convierten a USD y viceversa */
const FOREIGN_PRICE_COLUMN_KEY_RE =
  /^(totalPrice|priceWithoutVAT|pricePerM2|rentalPrice|rentalPriceWithoutVAT|rentalPricePerM2WithoutVAT|maintenanceTotalPriceM2|maintenanceWithoutVAT|maintenancePricePerM2|installment|income)([A-Z]{3})$/

function isForeignCurrencyPriceColumnKey(key: string): boolean {
  const m = key.match(FOREIGN_PRICE_COLUMN_KEY_RE)
  return Boolean(m && m[2] !== "USD")
}

/** Convierte etiqueta traducida (o valor API) al enum Strapi para columnas `offices.*` tipo enum. */
function coerceOfficesDzEnumColumnValue(
  columnKey: string,
  raw: unknown,
  translate: (key: string) => string
): unknown {
  const r = resolveUnitTypeDynamicColumn(columnKey)
  if (r?.def.gridType !== "enum" || !r.def.enumValues?.length || r.segment !== "offices") {
    return raw
  }
  const m = matchPickedToDzEnum(r.def.enumValues, String(raw ?? ""), (v) =>
    translate(`column.offices.enum.${r.gridKey}.${dzEnumApiValueToMessageKeySuffix(v)}`)
  )
  return m !== undefined ? m : raw
}

/** Filtro de vista por tipo de unidad (mismas categorías que el dropdown de tipo de unidad). */
type UnitKindViewFilter = "all" | "residential" | "office" | "industrial"

function strapiComponentToUnitKind(comp: string | undefined): "residential" | "office" | "industrial" | null {
  if (!comp) return null
  if (comp === "unit-types.housing" || comp === "unit-types.residential") return "residential"
  if (comp === "unit-types.offices" || comp === "unit-types.office") return "office"
  if (comp === "unit-types.industrial") return "industrial"
  return null
}

/** Sin tipo de unidad reconocido se muestran en <b>todos</b> los filtros (para poder completarlas). */
function unitMatchesViewTypeFilter(unit: StrapiUnit, filter: UnitKindViewFilter): boolean {
  if (filter === "all") return true
  const dz = getUnitTypeZone(unit)
  const kind = strapiComponentToUnitKind(dz[0]?.__component as string | undefined)
  if (kind === null) return true
  return kind === filter
}

/** `groupKey` de columnas de dynamic zone → mismo filtro que la barra de tareas. */
const DZ_COLUMN_GROUP_TO_VIEW_FILTER: Record<string, UnitKindViewFilter | undefined> = {
  unitTypeHousing: "residential",
  unitTypeOffices: "office",
  unitTypeIndustrial: "industrial",
}

/** Oculta cabeceras/columnas de segmentos DZ que no aplican al filtro activo. */
function columnGroupKeyMatchesUnitTypeViewFilter(
  groupKey: string | undefined,
  filter: UnitKindViewFilter
): boolean {
  if (filter === "all") return true
  const forFilter = groupKey ? DZ_COLUMN_GROUP_TO_VIEW_FILTER[groupKey] : undefined
  if (forFilter === undefined) return true
  return forFilter === filter
}

/** Tras editar el campo USD base, borra montos “visuales” en otras monedas para esa magnitud (evita GTQ obsoleto). */
function clearEditableForeignPriceVisuals(
  unit: Record<string, unknown>,
  usdField: string,
  currencies: ReadonlyArray<{ code: string }>
): void {
  if (!DATASHEET_CONFIG.foreignCurrency.clearableParentFields.includes(usdField)) {
    return
  }
  for (const c of currencies) {
    if (c.code.toUpperCase() === "USD") continue
    const fk = usdField.replace("USD", c.code.toUpperCase())
    delete (unit as any)[fk]
  }
}

/** Parqueo condicional: candado en overlay (mismo estilo que columnas bloqueadas), no indicator a la derecha del título */
const PARKING_CONDITIONAL_COLUMN_KEYS = new Set([
  "hasMotorcycleParking",
  "parkingType",
  "parkingSpaces",
])

/** Texto más suave cuando la celda no es editable (fórmula, sistema, otra moneda, sin parqueo, etc.) */
const READONLY_CELL_THEME: Partial<Theme> = {
  textDark: "#6b7280",
  textMedium: "#9ca3af",
}

/** Si hay tema de fila (error, guardando, pendiente…), gana sobre el estilo de solo lectura. */
function mergeReadonlyCellTheme(
  rowTheme: Partial<Theme> | undefined,
  isReadonlyCell: boolean
): Partial<Theme> | undefined {
  if (rowTheme) return rowTheme
  if (isReadonlyCell) return READONLY_CELL_THEME
  return undefined
}

/** Webhook para sincronizar contadores del block tras guardar una fila. Valores por defecto; luego usar env. */
const BLOCK_COUNTER_WEBHOOK_URL = process.env.NEXT_PUBLIC_BLOCK_COUNTER_WEBHOOK_URL ?? "https://n8n.primeiqlatam.com/webhook/block-counter-update"

async function notifyBlockCounterUpdate(blockId: string): Promise<void> {
  const url = BLOCK_COUNTER_WEBHOOK_URL
  const body = { blockId: blockId }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn("[block-counter-update] webhook failed:", res.status, await res.text())
    }
  } catch (e) {
    console.warn("[block-counter-update] webhook error:", e)
  }
}
import { useTranslations, useLocale } from "next-intl"
import { Loader2, CheckCircle2, Undo2, Redo2, Search, Plus, Save, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, MoreVertical, ChevronDown, ChevronRight, Info, Eye, EyeOff, LockOpen, CloudOff, TriangleAlert } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"
import { toast } from "sonner"
import { sileo } from "sileo"
import { DATASHEET_CONFIG, findCascadeRule, findDimensionCascadeRule } from "./datasheet-units-table-config"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * Muestra un toast Sileo de error cuando una unidad falla al guardar.
 * Incluye el detalle de la fila (número, unidad, modelo) y el mensaje del sistema (Strapi).
 * Persistente (sin auto-cierre) con botón de cerrar, para que el error siempre sea legible.
 */
function showUnitSaveErrorToast(opts: {
  rowNumber: number
  unitNumber?: unknown
  model?: unknown
  error: unknown
}): void {
  const { rowNumber, unitNumber, model, error } = opts
  const errorMessage = error instanceof Error ? error.message : String(error)
  const unitLabel = String(unitNumber ?? "").trim()
  const modelLabel = String(model ?? "").trim()
  const detailParts = [
    `Fila ${rowNumber}`,
    unitLabel ? `Unidad ${unitLabel}` : null,
    modelLabel ? `Modelo ${modelLabel}` : null,
  ].filter(Boolean) as string[]

  let toastId = ""
  toastId = sileo.error({
    title: "No se pudo guardar la unidad",
    description: (
      <span style={{ color: "#ffffff" }}>
        <strong>{detailParts.join(" · ")}</strong>
        <br />
        {errorMessage}
      </span>
    ),
    duration: null,
    button: { title: "✕", onClick: () => sileo.dismiss(toastId) },
  })
}

/**
 * Detecta si un error de guardado proviene de un `code` duplicado
 * (constraint unique de Strapi). Usa el detalle adjunto (strapiError) cuando
 * está disponible, con fallback al texto del mensaje.
 */
function isUnitCodeConflict(error: unknown): boolean {
  const strapiError = (error as { strapiError?: StrapiError } | undefined)?.strapiError
  const details = strapiError?.error?.details as
    | { errors?: Array<{ path?: unknown; message?: string }> }
    | undefined
  if (details?.errors && Array.isArray(details.errors)) {
    const codeErr = details.errors.some((e) => {
      const inCode = Array.isArray(e.path) ? e.path.includes("code") : e.path === "code"
      const isUnique = /unique|únic|unic/i.test(String(e.message ?? ""))
      return inCode && isUnique
    })
    if (codeErr) return true
  }
  // Fallback por texto: Strapi a veces responde "This attribute must be unique"
  // sin adjuntar details.errors ni nombrar el campo. En unidades el único campo
  // con constraint unique es `code`, así que cualquier error de unicidad lo
  // tratamos como conflicto de code (la detección precisa por path va primero).
  const msg = error instanceof Error ? error.message : String(error)
  return /unique|únic|unic/i.test(msg)
}

/**
 * Pide a Strapi el siguiente `code` disponible (con correlativo -1, -2, …)
 * para el `name` dado, vía el endpoint /api/units/generate-code.
 */
async function fetchNextAvailableUnitCode(name: string): Promise<string> {
  const res = await fetch("/api/units/generate-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error("No se pudo generar el código de la unidad")
  const json = await res.json()
  return json.code as string
}

/**
 * Caja que agrupa controles o métricas, con la etiqueta montada sobre el borde superior.
 * La etiqueta lleva fondo sólido (`bg-background`) para cortar el borde, así que el grupo
 * debe apoyarse directamente sobre el fondo de la página — no dentro de otro contenedor
 * con fondo propio, o el recorte deja un parche visible.
 */
/** Columnas vigiladas por la alerta de valor fuera de rango. */
/**
 * Tope de ancho al arrastrar el borde de una columna.
 *
 * Sin esta prop rige el default de glide-data-grid, que son 500px. Un nombre
 * como "Zona AX - Fase Ampliación - Torre Corporate Collection - Corporate
 * Collection Nivel 7 - Oficina 701 C071" se cortaba a la mitad y la columna no
 * se dejaba estirar más, sin ninguna señal de por qué.
 *
 * 2000 y no ilimitado: el nombre más largo del warehouse tiene 129 caracteres
 * —unos 950px—, así que esto deja más del doble de aire. Un tope alto pero real
 * evita que un arrastre accidental deje una columna de veinte mil píxeles, y
 * con ella un scroll horizontal del que cuesta volver.
 *
 * También sube el techo del auto-ajuste al hacer doble clic en el borde:
 * `maxColumnAutoWidth` toma este valor cuando no se declara.
 */
const MAX_COLUMN_WIDTH = 2000

const OUT_OF_RANGE_FIELDS = ["pricePerM2USD", "maintenancePricePerM2USD"] as const

/**
 * Un valor se marca si supera N veces —o queda por debajo de 1/N— el promedio de LAS DEMÁS
 * filas. El umbral es simétrico porque omitir un dígito es tan probable como agregarlo.
 *
 * 8 deja pasar bastante variación legítima y sigue atrapando el error de tipeo de un dígito,
 * que es exactamente 10x. El margen es angosto a propósito: subirlo más lo volvería ciego a
 * ese caso, y ya con 8 un bloque con DOS valores errados puede escapar, porque el primero
 * infla el promedio contra el que se mide el segundo.
 */
const OUT_OF_RANGE_FACTOR = 8

/** Mínimo de filas con valor para activar la alerta: con menos, el promedio es demasiado frágil. */
const OUT_OF_RANGE_MIN_SAMPLE = 5

/** Clave estable de una celda vigilada, independiente del orden y los filtros de la grilla. */
function outOfRangeKey(rowKey: string, field: string): string {
  return `${rowKey}::${field}`
}

const GROUP_BOX_CLASS =
  "relative shrink-0 flex flex-col justify-center rounded-md border border-border px-3 pb-2 pt-3"
const GROUP_LABEL_CLASS =
  "absolute -top-2 left-2 bg-background px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"

interface DatasheetUnitsTableProps {
  units: StrapiUnit[]
  /** When viewing a block with zero units, pass the block id so the grid shows one empty row and save works for the first unit */
  blockId?: string
  /** Block name for computing unit name/code: "blockName - unitNumber" and slugify(name) */
  blockName?: string
  /** Block collection date (fecha recolección) for unit absorption formula. ISO date string. */
  blockCollectionDate?: string
  /** Block start date (fecha inicio) for unit absorption formula. ISO date string. */
  blockStartDate?: string
  isLoading?: boolean
  onUpdate?: (unitId: string, field: string, value: unknown) => void
  onRefresh?: () => void | Promise<void>
  onUnitsChange?: (units: StrapiUnit[]) => void
  /** Quarter del bloque — junto a blockCategory determina la tasa de IVA activa */
  blockQuarter?: string
  /** Categoría del bloque — solo visualización, no viaja a Strapi */
  blockCategory?: string
  /** Código de categoría del bloque (ej: "VERT", "LOT", "HOR") — se combina con blockCategory para detectar tipo */
  blockCategoryCode?: string
  /** País del proyecto del bloque (vía block.project.country) — columna y pill de referencia. */
  blockCountry?: { name?: string; isoCode2?: string; code?: string }
  /** Tipo de bloque explícito — sobreescribe la detección por string cuando la página ya conoce el tipo */
  blockIsVertical?: boolean
  blockIsLote?: boolean
}



const RECONCILE_FIELD_LABELS: Record<string, string> = {
  parkingSizeM2: "Tamaño Parqueo", totalSizeM2: "Tamaño Total",
  habitableConstructionM2: "Construcción Habitable",
  priceWithoutVATUSD: "Precio sin IVA", pricePerM2USD: "Precio por m²",
  rentalPriceWithoutVATUSD: "Renta sin IVA",
  maintenanceWithoutVATUSD: "Mantenimiento sin IVA", maintenancePricePerM2USD: "Mantenimiento por m²",
  installmentUSD: "Cuota", incomeUSD: "Ingreso",
  unitAbsorption: "Absorción", absorptionPerM2: "Absorción por m²",
  unitSizeM2: "Tamaño Unidad",
}

/**
 * Log detallado en la consola del cliente de la reconciliación al cargar:
 * por fila, qué campo no coincidía con la DB, su valor guardado, el nuevo valor y la diferencia.
 * Cada fila muestra TODOS los campos que se recalcularon (el efecto en cascada de las fórmulas).
 */
function logReconciliation(
  rows: Array<{ rowIndex: number; label: string; changed: Array<{ field: string; before: number; after: number }> }>
): void {
  if (rows.length === 0) return
  const round = (n: number) => Math.round(n * 100) / 100
  // eslint-disable-next-line no-console
  console.groupCollapsed(`[Reconciliación al cargar] ${rows.length} fila(s) con valores recalculados (DB → nuevo)`)
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.groupCollapsed(`Fila ${r.rowIndex} — ${r.label} · ${r.changed.length} campo(s) afectado(s)`)
    // eslint-disable-next-line no-console
    console.table(
      r.changed.map((c) => ({
        Campo: RECONCILE_FIELD_LABELS[c.field] ?? c.field,
        Clave: c.field,
        "Valor guardado (DB)": round(c.before),
        "Valor nuevo": round(c.after),
        "Δ": round(c.after - c.before),
      }))
    )
    // eslint-disable-next-line no-console
    console.groupEnd()
  }
  // eslint-disable-next-line no-console
  console.groupEnd()
}


// Cuando el usuario edita la unidad derivada (GTQ, varas²), guardamos la conversión a base (USD, mts²) sin redondear
// para que al mostrar de nuevo la columna editada se preserve su valor (estilo banco: lo editado prevalece, lo otro se fragmenta)

// Helper function to get nested value from unit
function getNestedValue(unit: StrapiUnit, key: string): unknown {
  if (key === "unitType") {
    const z = getUnitTypeZone(unit)
    return z.length > 0 ? z : unit.unitType ?? (unit as StrapiUnit & { type?: unknown }).type
  }
  if (resolveUnitTypeDynamicColumn(key)) {
    return readUnitTypeDynamicValue(unit, key)
  }
  const dzBracket = key.match(/^(?:type|unitType)\[(\d+)]\.(.+)$/)
  if (dzBracket) {
    const index = parseInt(dzBracket[1], 10)
    const attr = dzBracket[2]
    const dz = getUnitTypeZone(unit)
    const entry = dz[index] as unknown as Record<string, unknown> | undefined
    return entry?.[attr]
  }
  if (!key.includes(".")) {
    return (unit as unknown as Record<string, unknown>)[key]
  }

  const [parent, child] = key.split(".")
  
  if (parent === "block") {
    if (child === "name") {
      return unit.block?.name || ""
    }
    return unit.block?.[child as keyof typeof unit.block]
  }
  
  if (parent === "topography") {
    if (child === "name") {
      return unit.topography?.name || ""
    }
    return unit.topography?.[child as keyof typeof unit.topography]
  }
  
  if (parent === "parkingType") {
    if (child === "name") {
      return unit.parkingType?.name || ""
    }
    return unit.parkingType?.[child as keyof typeof unit.parkingType]
  }
  
  if (parent === "unitUsage") {
    if (child === "name") {
      return unit.unitUsage?.name || ""
    }
    return unit.unitUsage?.[child as keyof typeof unit.unitUsage]
  }
  
  return undefined
}

// Helper function to get field path for nested fields
function getFieldPath(key: string, unit?: StrapiUnit): string {
  if (unit && resolveUnitTypeDynamicColumn(key)) {
    return getUnitTypeDynamicApiPath(unit, key) ?? key
  }
  // Direct fields don't need transformation
  if (!key.includes(".")) {
    return key
  }

  const [parent, child] = key.split(".")
  
  // For relation fields, we need to send the documentId
  // But for display purposes, we show the name
  // The API expects direct documentId values for relations
  if (parent === "topography" || parent === "parkingType" || parent === "unitUsage" || parent === "block") {
    // These are relation fields - we'll need to handle them differently
    // For now, return the key as-is, but the API update will need to handle documentId
    return key
  }
  
  return key
}

/**
 * Unifica el payload: si en memoria hay atributos en la zona dinámica además de `__component`,
 * el PUT debe enviar `unitType` completo (updateUnitBatch hace merge con servidor).
 */
function mergeUnitTypePayloadFromZoneIntoUpdates(
  unit: StrapiUnit,
  updates: Array<{ field: string; value: unknown }>
): void {
  const formatted = formatUnitTypeForStrapi(getUnitTypeZone(unit)) as unknown[]
  if (!Array.isArray(formatted) || formatted.length === 0) return
  const hasAttrs = formatted.some(
    (e) =>
      e &&
      typeof e === "object" &&
      Object.keys(e as Record<string, unknown>).some((k) => k !== "__component")
  )
  if (!hasAttrs) return
  const idx = updates.findIndex((u) => u.field === "unitType")
  if (idx >= 0) updates[idx] = { field: "unitType", value: formatted }
  else updates.push({ field: "unitType", value: formatted })
  for (let i = updates.length - 1; i >= 0; i--) {
    const f = updates[i].field
    if (f.startsWith("type[") || f.startsWith("unitType[")) updates.splice(i, 1)
  }
}

/** Clipboard / CSV paste into boolean columns (never use parseFloat("true") which becomes 0). */
function parsePastedBooleanString(raw: string): boolean {
  const s = String(raw).trim().toLowerCase()
  if (
    s === "true" ||
    s === "yes" ||
    s === "1" ||
    s === "sí" ||
    s === "si" ||
    s === "verdadero"
  ) {
    return true
  }
  if (s === "false" || s === "no" || s === "0" || s === "falso" || s === "n") {
    return false
  }
  const n = Number(s)
  if (s !== "" && !Number.isNaN(n)) {
    if (n === 1) return true
    if (n === 0) return false
  }
  return false
}

const CLIENT_TEMP_ROW_PREFIX = "temp-"

function isClientTempRowKey(s: string | undefined): boolean {
  return Boolean(s && s.startsWith(CLIENT_TEMP_ROW_PREFIX) && s.length > CLIENT_TEMP_ROW_PREFIX.length + 4)
}

/** Id estable en cliente para filas nuevas (visible en columna ID y en maps de estado). */
function generateClientTempId(): string {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 22)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  return `${CLIENT_TEMP_ROW_PREFIX}${suffix}`
}

/** Clave estable por fila: documentId Strapi, id numérico, o clientTempId. No usar para GET/PUT salvo documentId/id reales. */
function getUnitRowKey(unit: StrapiUnit): string {
  const temp = unit.clientTempId
  if (temp) return temp
  const doc = unit.documentId?.trim()
  if (doc && !isClientTempRowKey(doc)) return doc
  if (unit.id != null && unit.id !== undefined) return String(unit.id)
  return ""
}

/** Excel-style cell ref (A1) from 0-based column and row (Glide `Item` / DataEditor). */
function gridCellToSpreadsheetRef(colZeroBased: number, rowZeroBased: number): string {
  let c = colZeroBased + 1
  let letters = ""
  while (c > 0) {
    const mod = (c - 1) % 26
    letters = String.fromCharCode(65 + mod) + letters
    c = Math.floor((c - 1) / 26)
  }
  return `${letters}${rowZeroBased + 1}`
}

// Slug for unit code (lowercase, no accents, hyphens)
function slugify(text: string): string {
  if (!text || typeof text !== "string") return ""
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// Type definitions for type validation
type CellDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DROPDOWN'

// Helper function to determine cell data type from column key and GridCell
function getCellDataType(key: string, gridCell: GridCell, dropdownFields: string[]): CellDataType {
  // Check if it's a dropdown field
  if (dropdownFields.includes(key)) {
    return 'DROPDOWN'
  }
  
  // Check GridCell kind
  if (gridCell.kind === GridCellKind.Boolean) {
    return 'BOOLEAN'
  }
  
  if (gridCell.kind === GridCellKind.Number) {
    return 'NUMBER'
  }
  
  // Default to TEXT (includes GridCellKind.Text and others)
  return 'TEXT'
}

// Helper function to infer cell data type from a string value
function inferTypeFromString(
  value: string, 
  sourceKey: string | undefined, 
  destKey: string | undefined,
  dropdownFields: string[] | undefined,
  dropdownOptions?: (key: string) => string[]
): CellDataType {
  const cleanValue = String(value).trim().replace(/^▼\s*/, "")
  
  // Check if it's a boolean
  if (cleanValue.toLowerCase() === 'true' || cleanValue.toLowerCase() === 'false') {
    return 'BOOLEAN'
  }
  
  // Check if it's a number (but not empty string)
  if (cleanValue !== '' && !isNaN(Number(cleanValue)) && cleanValue !== '') {
    return 'NUMBER'
  }
  
  // Check if source key indicates dropdown
  if (sourceKey && dropdownFields && dropdownFields.includes(sourceKey)) {
    return 'DROPDOWN'
  }
  
  // If destination is dropdown and value matches an option, treat as DROPDOWN
  // This handles the case: copy dropdown value → paste in same dropdown column
  if (destKey && dropdownFields && dropdownFields.includes(destKey) && dropdownOptions) {
    const options = dropdownOptions(destKey)
    const matchesOption = options.some(opt => 
      opt.toLowerCase() === cleanValue.toLowerCase() ||
      // Also check for availability labels
      (destKey === 'availability' && (
        (cleanValue === 'Disponible' && opt === 'Available') ||
        (cleanValue === 'No Disponible' && opt === 'Not Available')
      ))
    )
    if (matchesOption) {
      return 'DROPDOWN'
    }
  }
  
  // Default to TEXT
  return 'TEXT'
}

// Helper function to validate type compatibility
function isTypeCompatible(
  sourceType: CellDataType,
  sourceKey: string,
  destType: CellDataType,
  destKey: string
): boolean {
  // Same type is always compatible
  if (sourceType === destType) {
    // For DROPDOWN, must be same column
    if (sourceType === 'DROPDOWN') {
      return sourceKey === destKey
    }
    return true
  }
  
  // NUMBER can go to TEXT (conversion allowed)
  if (sourceType === 'NUMBER' && destType === 'TEXT') {
    return true
  }

  // 0/1 from spreadsheets → boolean cells
  if (sourceType === 'NUMBER' && destType === 'BOOLEAN') {
    return true
  }
  
  // All other combinations are incompatible
  return false
}

/**
 * SVG strings for Glide Data Grid headerIcons, generated from Lucide React
 * components via renderToStaticMarkup so no paths are hardcoded here.
 * Computed once at module load — Glide Data Grid requires strings, not React elements.
 */
const HEADER_ICON_LOCK_OPEN  = renderToStaticMarkup(<LockOpen width={24} height={24} stroke="#8b5cf6" strokeWidth={2} fill="none" />)
const HEADER_ICON_CLOUD_OFF  = renderToStaticMarkup(<CloudOff  width={24} height={24} stroke="#9ca3af" strokeWidth={2} fill="none" />)

// History entry for undo/redo
interface HistoryEntry {
  units: StrapiUnit[]
  timestamp: number
}

const CASCADE_FIELD_LABELS = DATASHEET_CONFIG.display.fieldLabels
const CASCADE_FIELD_ORDER = DATASHEET_CONFIG.display.toastFieldOrder

function showCascadeToast(
  unit: Record<string, unknown>,
  affectedFields: string[],
  editedField: string,
  displayCurrency = "USD",
  buyRate = 1,
  rowNumber?: number
) {
  // Defer one microtask so we read the unit's FINAL state after all sync passes
  Promise.resolve().then(() => _showCascadeToast(unit, affectedFields, editedField, displayCurrency, buyRate, rowNumber))
}

function _showCascadeToast(
  unit: Record<string, unknown>,
  affectedFields: string[],
  editedField: string,
  displayCurrency = "USD",
  buyRate = 1,
  rowNumber?: number
) {
  const unitLabel = String((unit as any).name || (unit as any).unitNumber || (unit as any).documentId || "")
  const rowTag = rowNumber != null ? `Fila ${rowNumber}` : null
  const allFields = Array.from(new Set([editedField, ...affectedFields]))
    .filter((f) => CASCADE_FIELD_LABELS[f] !== undefined)
    .sort((a, b) => {
      const ia = CASCADE_FIELD_ORDER.indexOf(a)
      const ib = CASCADE_FIELD_ORDER.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  if (allFields.length === 0) return
  const isForeign = displayCurrency !== "USD" && buyRate > 0
  const fmtVal = (raw: unknown) => {
    const num = typeof raw === "number" ? raw : 0
    const display = isForeign ? num * buyRate : num
    return display.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }
  const fmtLabel = (label: string) =>
    isForeign ? label.replace("(USD)", `(${displayCurrency})`) : label
  let toastId = ""
  toastId = sileo.warning({
    title: [rowTag, unitLabel].filter(Boolean).join(" · ") || "Campos afectados",
    description: (
      <div className="flex flex-col gap-1 mt-1">
        {allFields.map((f) => {
          const isEdited = f === editedField
          return (
            <div key={f} className="flex items-center justify-between gap-4 text-xs">
              <span style={{ color: isEdited ? "#ffffff" : "#d1d5db" }} className={`truncate${isEdited ? " font-semibold" : ""}`}>
                {fmtLabel(CASCADE_FIELD_LABELS[f])}
              </span>
              <span style={{ color: "#ffffff" }} className={`tabular-nums shrink-0${isEdited ? " font-bold" : " font-medium"}`}>
                {fmtVal((unit as any)[f])}
              </span>
            </div>
          )
        })}
      </div>
    ),
    duration: 8000,
    button: { title: "✕", onClick: () => sileo.dismiss(toastId) },
  })
}

export function DatasheetUnitsTable({ units, blockId, blockName, blockCollectionDate, blockStartDate, isLoading, onUpdate, onRefresh, onUnitsChange, blockQuarter, blockCategory, blockCategoryCode, blockCountry, blockIsVertical, blockIsLote }: DatasheetUnitsTableProps) {
  const t = useTranslations('common')
  const locale = useLocale()
  const { user } = useAuth()
  const isSuperAdmin = useMemo(() => isStrapiSuperAdmin(user?.role), [user?.role])
  const unitTypeLabels = useMemo(
    () => ({
      residential: t("unitTypeResidential"),
      office: t("unitTypeOffice"),
      industrial: t("unitTypeIndustrial"),
    }),
    [t]
  )
  const dataRef = useRef(units)
  const [rowCount, setRowCount] = useState(units.length)
  const [refreshKey, setRefreshKey] = useState(0) // Only used for undo/redo
  const [gridSelection, setGridSelection] = useState<GridSelection | undefined>(undefined)
  const [showSearch, setShowSearch] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [editingUnit, setEditingUnit] = useState<'m2' | 'varas2'>('m2')
  const [editingCurrency, setEditingCurrency] = useState<string>('USD')
  const [headerColumnTooltip, setHeaderColumnTooltip] = useState<{
    content: ReactNode
    left: number
    top: number
  } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [projectWithCurrencies, setProjectWithCurrencies] = useState<any>(null)
  
  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // md breakpoint
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // IVA por país (ISO) + región/categoría/uso:
  //   El Salvador (SV) → 1.0 (0%, sin tasa aprobada aún: precio sin IVA = total)
  //   Guatemala/otros → 1.12 (12%) salvo "Uso Venta" → 0.916 (Interior+Lote y Renta también 1.12)
  //
  // La regla vive en lib/units/formulas.ts, donde se puede ejecutar. Acá sólo se
  // le pasa el contexto del bloque.
  const blockIso = () => blockCountry?.isoCode2 || blockCountry?.code
  /** Las tres tasas de la unidad: venta, renta y mantenimiento, cada una la suya. */
  const unitVatRates = (unit: Record<string, unknown>): VatRates =>
    vatRatesFor({
      quarter: blockQuarter,
      category: blockCategory,
      usageName: (unit as any).unitUsage?.name,
      iso: blockIso(),
    })
  /**
   * La tasa que se MUESTRA en la columna de IVA.
   *
   * Es la del uso declarado de la unidad, no una de las tres: la columna dice
   * "con qué tasa se está trabajando esta unidad", y hoy ninguna tiene venta y
   * renta a la vez. Si algún día las tuviera, esta columna se queda corta y hay
   * que partirla en dos, igual que se partió el cálculo.
   */
  const unitDisplayVatRate = (unit: Record<string, unknown>): number =>
    getVatRate(blockQuarter, blockCategory, (unit as any).unitUsage?.name, blockIso())

  const vatRatesRef = useRef<VatRates>(vatRatesFor({ quarter: blockQuarter, category: blockCategory, iso: blockIso() }))
  useEffect(() => {
    vatRatesRef.current = vatRatesFor({
      quarter: blockQuarter,
      category: blockCategory,
      iso: blockCountry?.isoCode2 || blockCountry?.code,
    })
  }, [blockQuarter, blockCategory, blockCountry])

  const blockCatStr = `${blockCategory || ""} ${blockCategoryCode || ""}`.toLowerCase()
  const resolveIsVertical = () =>
    blockIsVertical !== undefined
      ? blockIsVertical
      : !!(blockCatStr.includes('vertical') || blockCatStr.includes('vert'))
  const resolveIsLote = () =>
    blockIsLote !== undefined
      ? blockIsLote
      : !!(blockCatStr.includes('lote') || blockCatStr.includes('lot'))

  // El tipo industrial del bloque: la regla vive en lib/units/formulas.ts.
  const industrialKindRef = useRef<IndustrialKind>(industrialKindOf(blockCategory, blockCategoryCode))
  useEffect(() => {
    industrialKindRef.current = industrialKindOf(blockCategory, blockCategoryCode)
  }, [blockCategory, blockCategoryCode])

  const isVerticalRef = useRef(resolveIsVertical())
  useEffect(() => {
    const s = `${blockCategory || ""} ${blockCategoryCode || ""}`.toLowerCase()
    isVerticalRef.current = blockIsVertical !== undefined
      ? blockIsVertical
      : !!(s.includes('vertical') || s.includes('vert'))
  }, [blockCategory, blockCategoryCode, blockIsVertical])

  const isLoteRef = useRef(resolveIsLote())
  useEffect(() => {
    const s = `${blockCategory || ""} ${blockCategoryCode || ""}`.toLowerCase()
    isLoteRef.current = blockIsLote !== undefined
      ? blockIsLote
      : !!(s.includes('lote') || s.includes('lot'))
  }, [blockCategory, blockCategoryCode, blockIsLote])

  const countryIsoRef = useRef<string | undefined>(blockCountry?.isoCode2 || blockCountry?.code || undefined)
  useEffect(() => {
    countryIsoRef.current = blockCountry?.isoCode2 || blockCountry?.code || undefined
  }, [blockCountry])

  // Column widths state for resizing
  const [columnWidths, setColumnWidths] = useState<Map<string, number>>(new Map())
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  /** Filtro de filas visibles por tipo de unidad (por defecto todas). */
  const [unitTypeViewFilter, setUnitTypeViewFilter] = useState<UnitKindViewFilter>("all")
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(new Set())
  const toggleHiddenColumn = useCallback((key: string) => {
    setHiddenColumnKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  // Context menu state for column headers
  // TEMPORARILY COMMENTED: Header menu functionality
  // const [headerMenu, setHeaderMenu] = useState<{ col: number; bounds: Rectangle } | undefined>(undefined)
  
  // Filas visibles: filtro por tipo de unidad, luego orden
  const sortedUnits = useMemo(() => {
    const filtered = dataRef.current.filter((u) => unitMatchesViewTypeFilter(u, unitTypeViewFilter))
    if (!sortColumn) return filtered

    const sorted = [...filtered].sort((a, b) => {
      let aValue: unknown = getNestedValue(a, sortColumn)
      let bValue: unknown = getNestedValue(b, sortColumn)
      if (sortColumn === "unitType") {
        const ac = Array.isArray(aValue) && aValue[0] && typeof (aValue[0] as { __component?: string }).__component === "string"
          ? (aValue[0] as { __component: string }).__component
          : ""
        const bc = Array.isArray(bValue) && bValue[0] && typeof (bValue[0] as { __component?: string }).__component === "string"
          ? (bValue[0] as { __component: string }).__component
          : ""
        aValue = ac
        bValue = bc
      }

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0
      if (aValue == null) return 1
      if (bValue == null) return -1
      
      // Handle different types
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' })
        return sortDirection === 'asc' ? comparison : -comparison
      }
      
      if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
        const comparison = aValue === bValue ? 0 : aValue ? 1 : -1
        return sortDirection === 'asc' ? comparison : -comparison
      }
      
      // Convert to string for comparison
      const aStr = String(aValue)
      const bStr = String(bValue)
      const comparison = aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' })
      return sortDirection === 'asc' ? comparison : -comparison
    })
    
    return sorted
  }, [dataRef.current, sortColumn, sortDirection, unitTypeViewFilter, refreshKey])
  
  // History for undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const historyRef = useRef({ history, historyIndex })
  
  const [pasteDialog, setPasteDialog] = useState<{
    open: boolean
    cellCount: number
    pasteData: Array<{ cell: Item; value: string }>
  }>({ open: false, cellCount: 0, pasteData: [] })

  // Dialog for adding rows
  const [addRowsDialog, setAddRowsDialog] = useState<{
    open: boolean
    count: string
  }>({ open: false, count: "1" })

  // Dialog for validation errors
  const [validationAlert, setValidationAlert] = useState<{
    open: boolean
    message: string
    invalidUnits?: Array<{
      rowIndex: number
      missingFields: string[]
    }>
  }>({ open: false, message: "" })

  // Dialog de reconciliación: valores recalculados que difieren de lo guardado (marcados en amarillo)
  const [formulaSyncAlert, setFormulaSyncAlert] = useState<{
    open: boolean
    rows: Array<{ rowIndex: number; fields: string[] }>
  }>({ open: false, rows: [] })

  // Dialog for sync confirmation
  const [syncConfirmDialog, setSyncConfirmDialog] = useState<{
    open: boolean
  }>({ open: false })

  // Dialog de valores fuera de rango, previo al guardado. Informa, nunca bloquea.
  const [outOfRangeDialog, setOutOfRangeDialog] = useState<{
    open: boolean
    rows: Array<{ rowIndex: number; label: string; fields: string[] }>
  }>({ open: false, rows: [] })

  // Dialog for bulk save confirmation (>5 rows) with math challenge
  const [saveConfirmDialog, setSaveConfirmDialog] = useState<{
    open: boolean
    totalRows: number
    step: 'confirm' | 'math'
    mathA?: number
    mathB?: number
    mathAnswer: string
    mathError: boolean
  }>({ open: false, totalRows: 0, step: 'confirm', mathAnswer: '', mathError: false })

  // Auto-save status tracking
  const [pendingUpdates, setPendingUpdates] = useState(0) // Number of requests in progress
  const [totalUpdates, setTotalUpdates] = useState(0) // Total number of updates started (for percentage calculation)
  const [completedUpdates, setCompletedUpdates] = useState(0) // Number of updates completed
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle')
  
  // Track saving status per row (by unit documentId or temporary id)
  const [rowSaveStatus, setRowSaveStatus] = useState<Map<string, {
    status: 'saving' | 'error' | 'success'
    error?: string
  }>>(new Map())

  // Track cells with errors (key: `${row}:${col}`, value: error message)
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map())

  // Track cells that are being saved (key: `${row}:${col}`)
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set())

  // Pending edits on existing units (no auto-save): unitId -> Set of field names. Save button flushes these.
  const [pendingChanges, setPendingChanges] = useState<Map<string, Set<string>>>(new Map())
  // Ref always pointing to the latest pendingChanges so handleSave (useCallback) never captures a stale closure
  const pendingChangesRef = useRef(pendingChanges)
  pendingChangesRef.current = pendingChanges
  // Evita re-abrir el dialog de reconciliación cuando el efecto corre por cambio de categoría (no de units)
  const reconciledUnitsRef = useRef<StrapiUnit[] | null>(null)
  const addPendingChange = useCallback((unitId: string, field: string) => {
    if (!unitId || unitId === "undefined") return
    setPendingChanges((prev) => {
      const next = new Map(prev)
      const fields = new Set(next.get(unitId) ?? [])
      fields.add(field)
      next.set(unitId, fields)
      return next
    })
  }, [])
  const addPendingChanges = useCallback((unitId: string, fields: string[]) => {
    if (!unitId || unitId === "undefined" || fields.length === 0) return
    setPendingChanges((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(unitId) ?? [])
      fields.forEach((f) => set.add(f))
      next.set(unitId, set)
      return next
    })
  }, [])

  const clearPendingChangesForUnit = useCallback((unitId: string) => {
    setPendingChanges((prev) => {
      const next = new Map(prev)
      next.delete(unitId)
      return next
    })
  }, [])
  const clearAllPendingChanges = useCallback(() => setPendingChanges(new Map()), [])

  /**
   * Estadísticas de la barra bajo la toolbar: contadores de disponibilidad y precio
   * promedio por m² (USD). Se derivan de `dataRef.current` en cada render en vez de
   * sincronizarse a mano: toda ruta que muta los datos ya provoca un re-render por otra
   * vía (pendingChanges, rowCount, refreshKey, historyIndex o la prop units), así que el
   * valor nunca queda viejo — a diferencia del estado anterior, que no se recalculaba en
   * undo/redo ni en performSync.
   * El promedio va sobre TODAS las filas: una unidad sin precio cuenta como 0.
   * Debe declararse después de `pendingChanges` — el array de deps se evalúa aquí mismo.
   */
  const gridStats = useMemo(() => {
    const data = dataRef.current
    /** `Number(x) || 0` cubre en una expresión los tres casos de valor ausente: undefined, null y NaN. */
    const sumOf = (field: keyof StrapiUnit) =>
      data.reduce((acc, u) => acc + (Number(u[field]) || 0), 0)
    const average = (field: keyof StrapiUnit) =>
      data.length > 0 ? sumOf(field) / data.length : 0

    /**
     * Celdas cuyo valor se aparta demasiado del bloque — típicamente un dígito de más o de
     * menos al tabular. Dos diferencias deliberadas con los promedios de arriba:
     *
     * 1. Solo entran filas con valor > 0. Los promedios mostrados cuentan los vacíos como 0
     *    para describir el bloque; usar ese número aquí marcaría como fuera de rango el
     *    primer precio que se carga en un bloque vacío (2000 contra un promedio de 2000/44).
     * 2. Cada fila se compara contra el promedio de LAS DEMÁS. Si se incluyera a sí misma,
     *    un error grande subiría su propio umbral: con 5 filas o menos la condición no
     *    llegaba a cumplirse nunca, y con 6 hacía falta un error de 25x para dispararla.
     */
    const outOfRange = new Set<string>()
    for (const field of OUT_OF_RANGE_FIELDS) {
      const entries: Array<{ rowKey: string; value: number }> = []
      let sum = 0
      for (const unit of data) {
        const value = Number(unit[field]) || 0
        if (value <= 0) continue
        const rowKey = getUnitRowKey(unit)
        if (!rowKey) continue
        entries.push({ rowKey, value })
        sum += value
      }
      if (entries.length < OUT_OF_RANGE_MIN_SAMPLE) continue
      for (const { rowKey, value } of entries) {
        const othersAverage = (sum - value) / (entries.length - 1)
        if (othersAverage <= 0) continue
        if (
          value > othersAverage * OUT_OF_RANGE_FACTOR ||
          value < othersAverage / OUT_OF_RANGE_FACTOR
        ) {
          outOfRange.add(outOfRangeKey(rowKey, field))
        }
      }
    }

    return {
      total: data.length,
      available: data.filter((u) => u.availability === 'Available').length,
      notAvailable: data.filter((u) => u.availability === 'Not Available').length,
      unknown: data.filter((u) => !u.availability).length,
      avgPricePerM2Usd: average('pricePerM2USD'),
      avgMaintenancePerM2Usd: average('maintenancePricePerM2USD'),
      outOfRange,
    }
  }, [pendingChanges, rowCount, refreshKey, historyIndex, units])

  // Fill pattern tracking
  const fillPatternRef = useRef<{
    patternSource: { x: number; y: number; width: number; height: number }
    fillDestination: { x: number; y: number; width: number; height: number }
    values: number[]
    isSequence: boolean
    step?: number
    extendedValues?: EditListItem[]
  } | null>(null)

  // Ref for onCellsEdited to avoid circular dependency
  const onCellsEditedRef = useRef<((newValues: readonly EditListItem[]) => boolean) | null>(null)

  // Track cells deleted by onDelete to prevent duplicate API requests
  // Format: `${row}:${col}` -> timestamp
  const deletedCellsRef = useRef<Set<string>>(new Set())

  // Catalog options for dropdowns
  const [parkingTypes, setParkingTypes] = useState<CatalogItem[]>([])
  const [unitUsages, setUnitUsages] = useState<CatalogItem[]>([])
  const [topographies, setTopographies] = useState<CatalogItem[]>([])
  
  // Tasas del proyecto (perfil de cambio normalizado en getProjectById)
  useEffect(() => {
    const loadProjectWithCurrencies = async () => {
      let projectId: string | number | undefined

      if (units.length > 0) {
        const firstUnit = units[0]
        if (!firstUnit?.block?.project) {
          setProjectWithCurrencies(null)
          return
        }
        projectId =
          firstUnit.block.project.documentId || firstUnit.block.project.id
      } else if (blockId) {
        try {
          const block = await strapiClient.getBlockById(blockId)
          const p = block.project
          if (!p || typeof p !== 'object') {
            setProjectWithCurrencies(null)
            return
          }
          projectId = p.documentId ?? p.id
        } catch (error) {
          console.error('Error loading block for project currencies:', error)
          setProjectWithCurrencies(null)
          return
        }
      } else {
        setProjectWithCurrencies(null)
        return
      }

      if (projectId == null || projectId === '') {
        setProjectWithCurrencies(null)
        return
      }

      try {
        const project = await strapiClient.getProjectById(projectId)
        setProjectWithCurrencies(project)
      } catch (error) {
        console.error('Error loading project with currencies:', error)
        setProjectWithCurrencies(null)
      }
    }

    loadProjectWithCurrencies()
  }, [units, blockId])
  
  // Monedas con tasa usable: buyRate (local por USD) o solo sellRate → 1/sellRate
  const activeCurrencies = useMemo(() => {
    if (!projectWithCurrencies?.currencies) return []

    const currencies = projectWithCurrencies.currencies
    const currencyInfo = [
      { code: 'mxn', name: 'Peso Mexicano', symbol: '$' },
      { code: 'gtq', name: 'Quetzal', symbol: 'Q' },
      { code: 'hnl', name: 'Lempira', symbol: 'L' },
      { code: 'crc', name: 'Colón Costarricense', symbol: '₡' },
      { code: 'nio', name: 'Córdoba', symbol: 'C$' },
      { code: 'pab', name: 'Balboa', symbol: 'B/.' },
      { code: 'bzd', name: 'Dólar Beliceño', symbol: 'BZ$' },
    ]

    return currencyInfo
      .map(({ code, name, symbol }) => {
        const raw = currencies[code as keyof typeof currencies]
        const entry =
          raw && typeof raw === 'object' ? raw : null
        const rate = localCurrencyUnitsPerOneUsd(entry)
        if (rate == null) return null
        return {
          code: code.toUpperCase(),
          name,
          symbol,
          buyRate: rate,
        }
      })
      .filter((c): c is NonNullable<typeof c> => c != null)
  }, [projectWithCurrencies])

  // Like addPendingChange but also marks equivalent fields in all active currencies
  // e.g. "totalPriceUSD" → also marks "totalPriceGTQ", "totalPriceEUR", etc.
  const addPendingChangeMirrored = useCallback((unitId: string, usdField: string) => {
    if (!unitId || unitId === "undefined") return
    setPendingChanges((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(unitId) ?? [])
      set.add(usdField)
      for (const currency of activeCurrencies) {
        const foreignField = usdField.replace(/USD$/, currency.code.toUpperCase())
        if (foreignField !== usdField) set.add(foreignField)
      }
      next.set(unitId, set)
      return next
    })
  }, [activeCurrencies])

  const addPendingChangesMirrored = useCallback((unitId: string, usdFields: string[]) => {
    if (!unitId || unitId === "undefined" || usdFields.length === 0) return
    setPendingChanges((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(unitId) ?? [])
      for (const usdField of usdFields) {
        set.add(usdField)
        for (const currency of activeCurrencies) {
          const foreignField = usdField.replace(/USD$/, currency.code.toUpperCase())
          if (foreignField !== usdField) set.add(foreignField)
        }
      }
      next.set(unitId, set)
      return next
    })
  }, [activeCurrencies])

  /**
   * `rate` = unidades de moneda local por 1 USD (desde buyRate del perfil, o 1/sellRate si solo hay venta).
   * USD → local: multiply. Local → USD: divide (inversas entre sí).
   */
  const getBuyRate = useCallback((currencyCode: string): number => {
    if (currencyCode === 'USD') return 1
    const currency = activeCurrencies.find(c => c.code === currencyCode)
    return currency?.buyRate || 1
  }, [activeCurrencies])

  // Registry mapping syncFn names (from cascade-config) to actual functions.
  // Add entries here when new groups are introduced in cascade-config.ts.
  const syncFnRegistry = useMemo<Record<string, (unit: Record<string, unknown>) => void>>(() => ({
    // Maintenance group
    syncUnitMaintenancePerM2:    (u) => syncUnitMaintenancePerM2(u, unitVatRates(u)),
    syncMaintenanceFromWithoutVAT: (u) => syncMaintenanceFromWithoutVAT(u, unitVatRates(u)),
    syncMaintenanceFromPerM2:    (u) => syncMaintenanceFromPerM2(u, unitVatRates(u)),
    // Rental group
    syncUnitRentalFromTotal:     (u) => syncUnitRentalFromTotal(u, unitVatRates(u)),
    syncRentalFromWithoutVAT:    (u) => syncRentalFromWithoutVAT(u, unitVatRates(u)),
    syncRentalFromPerM2:         (u) => syncRentalFromPerM2(u, unitVatRates(u)),
    // Venta (sale price) group — wrappers also sync installment + income as side-effects
    syncPriceGroupFromTotal:      (u) => { syncUnitPriceFromTotal(u, unitVatRates(u)); syncUnitInstallment(u, unitVatRates(u), countryIsoRef.current); syncUnitIncome(u) },
    syncPriceGroupFromWithoutVAT: (u) => { syncPriceFromWithoutVAT(u, unitVatRates(u)); syncUnitInstallment(u, unitVatRates(u), countryIsoRef.current); syncUnitIncome(u) },
    syncPriceGroupFromPerM2:      (u) => { syncPriceFromPerM2(u, unitVatRates(u)); syncUnitInstallment(u, unitVatRates(u), countryIsoRef.current); syncUnitIncome(u) },
    // Dimension (medidas) groups — recalculate habitable area + all perM2 price groups + absorption
    syncMedidasWithTotal:    (u) => { syncUnitHabitableConstruction(u, isVerticalRef.current, isLoteRef.current); syncUnitTotalSize(u, isVerticalRef.current); syncUnitPriceFromTotal(u, unitVatRates(u)); syncUnitRentalFromTotal(u, unitVatRates(u)); syncUnitMaintenancePerM2(u, unitVatRates(u)); syncUnitAbsorptionPerM2(u) },
    syncMedidasWithoutTotal: (u) => { syncUnitHabitableConstruction(u, isVerticalRef.current, isLoteRef.current); syncUnitPriceFromTotal(u, unitVatRates(u)); syncUnitRentalFromTotal(u, unitVatRates(u)); syncUnitMaintenancePerM2(u, unitVatRates(u)); syncUnitAbsorptionPerM2(u) },
    syncMedidasTotalOnly:    (u) => { syncUnitTotalSize(u, isVerticalRef.current) },
    // Industrial: la suma de las partes manda sobre el tamaño de unidad, y de
    // ahí baja todo lo demás. Va primero, antes del habitable que la usa.
    syncMedidasIndustrial:   (u) => {
      syncIndustrialUnitSize(u, industrialKindRef.current)
      syncUnitHabitableConstruction(u, isVerticalRef.current, isLoteRef.current)
      syncUnitTotalSize(u, isVerticalRef.current)
      syncUnitPriceFromTotal(u, unitVatRates(u)); syncUnitRentalFromTotal(u, unitVatRates(u))
      syncUnitMaintenancePerM2(u, unitVatRates(u)); syncUnitAbsorptionPerM2(u)
    },
    syncMedidasParqueo:      (u) => { syncUnitParkingSize(u); syncUnitTotalSize(u, isVerticalRef.current) },
    syncParkingOnly:         (u) => { syncUnitParkingSize(u) },
    // Lote: unitSize = terreno = total. Editar terreno iguala unitSize (y viceversa).
    syncMedidasLoteFromLand: (u) => {
      const land = Number(u.landM2) || 0
      u.unitSizeM2 = land
      u.unitSizeVaras2 = roundTo2(land * M2_TO_VARAS_SQUARED)
      syncUnitHabitableConstruction(u, false, true)
      syncUnitTotalSize(u, false)
      syncUnitPriceFromTotal(u, unitVatRates(u)); syncUnitRentalFromTotal(u, unitVatRates(u))
      syncUnitMaintenancePerM2(u, unitVatRates(u)); syncUnitAbsorptionPerM2(u)
    },
    syncMedidasLoteFromUnitSize: (u) => {
      const size = Number(u.unitSizeM2) || 0
      u.landM2 = size
      u.landVaras2 = roundTo2(size * M2_TO_VARAS_SQUARED)
      syncUnitHabitableConstruction(u, false, true)
      syncUnitTotalSize(u, false)
      syncUnitPriceFromTotal(u, unitVatRates(u)); syncUnitRentalFromTotal(u, unitVatRates(u))
      syncUnitMaintenancePerM2(u, unitVatRates(u)); syncUnitAbsorptionPerM2(u)
    },
  }), [])

  /**
   * Shows a Sileo error toast when the user edits a perM2 field but habitableM2 = 0.
   * Call this right after isCellEffectivelyReadonly blocks an edit, to explain WHY.
   */
  const showHabitableErrorIfNeeded = useCallback((key: string, unit: Record<string, unknown>) => {
    const isPerM2 = key.startsWith("pricePerM2") || key.startsWith("maintenancePricePerM2") || key.startsWith("rentalPricePerM2WithoutVAT")
    if (!isPerM2) return
    const habitable = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
    if (habitable <= 0) {
      sileo.error({
        title: "No se puede calcular",
        description: <span style={{ color: "#ffffff" }}>Este campo requiere Construcción Habitable (mts²) mayor a 0 para calcular el precio por m².</span>,
        duration: 6000,
      })
    }
  }, [])

  /**
   * Generic cascade runner driven by cascade-config.ts.
   * Returns true when the rule sets inverseSync (caller must trigger grid redraw).
   */
  const applyCascadeRule = useCallback((
    unit: Record<string, unknown>,
    targetKey: string,
    unitId: string,
    isNew: boolean,
    isCurrencyField: boolean,
    currencyCode: string,
    rowNumber?: number,
  ): boolean => {
    const match = findCascadeRule(targetKey)
    if (!match) return false
    const { group, rule } = match

    if (rule.requiresHabitableM2) {
      const habitable = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
      if (habitable <= 0) {
        sileo.error({
          title: "No se puede calcular",
          description: <span style={{ color: "#ffffff" }}>Este campo requiere Construcción Habitable (mts²) mayor a 0 para calcular el precio por m².</span>,
          duration: 6000,
        })
        return false
      }
    }

    const syncFn = syncFnRegistry[rule.syncFn]
    if (syncFn) syncFn(unit)

    if (rule.clearForeignVisuals) {
      clearEditableForeignPriceVisuals(unit, rule.clearForeignVisuals, activeCurrencies)
    }

    if (!isNew && group.hasCurrencyMirror) {
      addPendingChangeMirrored(unitId, targetKey)
      for (const f of rule.affects) addPendingChangeMirrored(unitId, f)
    }

    const displayCurrency = isCurrencyField && currencyCode ? currencyCode : "USD"
    const buyRate = isCurrencyField && currencyCode ? getBuyRate(currencyCode) : 1
    showCascadeToast(unit, rule.affects, targetKey, displayCurrency, buyRate, rowNumber)

    return rule.inverseSync ?? false
  }, [syncFnRegistry, activeCurrencies, addPendingChangeMirrored, getBuyRate])

  /**
   * Generic runner for dimension-triggered cascades (medidas groups).
   * Driven by DATASHEET_CONFIG.cascade.dimensionGroups.
   * Handles: sync → pending highlights → cascade toast.
   */
  const applyDimensionCascade = useCallback((
    unit: Record<string, unknown>,
    triggerKey: string,
    unitId: string,
    isNew: boolean,
    rowNumber?: number,
  ): void => {
    const match = findDimensionCascadeRule(triggerKey, isVerticalRef.current, isLoteRef.current, industrialKindRef.current)
    if (!match) return
    const { group, rule } = match

    const syncFn = syncFnRegistry[rule.syncFn]
    if (syncFn) syncFn(unit)

    // Pending: siempre marca mts² Y varas² (amarillo en ambas columnas)
    if (!isNew) {
      for (const f of rule.pendingFields) addPendingChange(unitId, f)
      for (const f of rule.pendingMirroredFields) addPendingChangeMirrored(unitId, f)
      if (group.mirrorVaras) {
        for (const f of rule.pendingFields) {
          const varasKey = M2_TO_VARAS_MAP[f]
          if (varasKey) addPendingChange(unitId, varasKey)
        }
      }
    }

    const toastField = rule.toastTriggerField ?? triggerKey
    // Campos DZ (e.g. "housing.balconyTerraceM2") almacenan su valor en la estructura
    // anidada unitType[].  Espejamos el valor a la clave plana para que el toast pueda
    // leerlo con unit[toastField]; showCascadeToast difiere con Promise.resolve así que
    // el valor debe estar en el objeto antes de que se ejecute.
    if (toastField.includes('.')) {
      const dzVal = readUnitTypeDynamicValue(unit as any, toastField)
      if (dzVal !== undefined) { ;(unit as any)[toastField] = dzVal }
      // Borrar la clave temporal tras el microtask del toast para que no viaje al API
      Promise.resolve().then(() => { delete (unit as any)[toastField] })
    }
    // Toast: muestra solo la unidad activa (mts² o varas²), no ambas
    let toastAffects = rule.affects
    if (group.mirrorVaras) {
      if (editingUnit === 'varas2') {
        toastAffects = rule.affects.map((f) => M2_TO_VARAS_MAP[f] ?? f)
      }
    }
    showCascadeToast(unit, toastAffects, toastField, "USD", 1, rowNumber)
  }, [syncFnRegistry, addPendingChange, addPendingChangeMirrored, readUnitTypeDynamicValue, editingUnit])

  // Dropdown state for all dropdown fields
  const [activeDropdown, setActiveDropdown] = useState<{
    field: string
    cell: Item
  } | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const dataEditorRef = useRef<DataEditorRef>(null)

  // Double click detection for dropdown fields
  const lastClickRef = useRef<{ cell: Item | null; field: string | null; timestamp: number }>({ 
    cell: null, 
    field: null,
    timestamp: 0 
  })
  const DOUBLE_CLICK_DELAY = 300 // milliseconds
  
  // Fields that use dropdown (incl. enums OpenAPI en zona dinámica, p. ej. oficinas)
  const dropdownFields = useMemo(
    () => ["topography", "parkingType", "unitUsage", "unitType", "availability", ...getDynamicZoneEnumColumnKeys()],
    []
  )

  // Helper function to get neutral/default value for a field based on its type
  const getNeutralValue = useCallback((key: string): unknown => {
    const dz = resolveUnitTypeDynamicColumn(key)
    if (dz) {
      if (dz.def.gridType === "number") return 0
      if (dz.def.gridType === "boolean") return false
      return ""
    }
    // Number fields - return 0
    const numberFields = [
      "frontM2", "depthM2", "landM2",
      "unitSizeM2", "parkingSizeM2",
      "totalSizeM2", "habitableConstructionM2",
      "frontVaras2", "depthVaras2", "landVaras2",
      "unitSizeVaras2", "parkingSizeVaras2",
      "totalSizeVaras2", "habitableConstructionVaras2",
      "bathrooms", "parkingSpaces",
      "totalPriceUSD", "priceWithoutVATUSD",
      "pricePerM2USD",
      "rentalPriceUSD", "rentalPriceWithoutVATUSD",
      "rentalPricePerM2WithoutVATUSD",
      "maintenanceTotalPriceM2USD",
      "maintenanceWithoutVATUSD",
      "maintenancePricePerM2USD",
      "installmentUSD", "incomeUSD",
      "unitAbsorption", "absorptionPerM2"
    ]
    
    if (numberFields.includes(key)) {
      return 0
    }
    
    // Dropdown/relation fields (objects that convert to IDs) - return null
    if (key === "parkingType" || key === "unitUsage" || key === "topography") {
      return null
    }
    if (key === "unitType") {
      return null
    }
    
    // Boolean fields - return false
    if (key === "hasParking" || key === "hasMotorcycleParking") {
      return false
    }
    
    // Availability - return null (it's a dropdown but stored as string)
    if (key === "availability") {
      return null
    }
    
    // Default: text fields - return empty string
    return ""
  }, [])
  
  // Type validation state (detailsExpanded: detail block collapsed by default)
  const [typeValidationAlert, setTypeValidationAlert] = useState<{
    open: boolean
    message: string
    details?: {
      sourceValue: string
      sourceType: string
      destColumnLabel: string
      destType: string
      count?: number
      /** e.g. D4 — visible grid column/row (1-based row in ref) */
      cellRef?: string
      cellRow1Based?: number
    }
    detailsExpanded?: boolean
  }>({ open: false, message: "" })

  // Load catalog options
  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        const [parkingTypesRes, unitUsagesRes, topographiesRes] = await Promise.all([
          strapiClient.getCatalogList('unit-parking-types', { pageSize: 200 }),
          strapiClient.getCatalogList('unit-usages', { pageSize: 200 }),
          strapiClient.getCatalogList('unit-topographies', { pageSize: 200 }),
        ])
        setParkingTypes(parkingTypesRes.data || [])
        setUnitUsages(unitUsagesRes.data || [])
        setTopographies(topographiesRes.data || [])
      } catch (error) {
        console.error('Error loading catalogs:', error)
      }
    }
    loadCatalogs()
  }, [])

  const isNewUnit = useCallback((unit: StrapiUnit): boolean => {
    if (unit.clientTempId) return true
    if (isClientTempRowKey(unit.documentId)) return true
    return !unit.documentId && !unit.id
  }, [])

  // Update ref when units change. When block has zero units but blockId is provided, show one empty row so user can add the first unit.
  useEffect(() => {
    // Sync refs from current blockCategory before computing formulas — avoids stale ref if
    // this effect runs before the blockCategory-only effects (React does not guarantee order
    // between effects that share the same deps-change trigger).
    const s = `${blockCategory || ""} ${blockCategoryCode || ""}`.toLowerCase()
    isVerticalRef.current = blockIsVertical !== undefined ? blockIsVertical : !!(s.includes('vertical') || s.includes('vert'))
    isLoteRef.current = blockIsLote !== undefined ? blockIsLote : !!(s.includes('lote') || s.includes('lot'))

    const previousLength = dataRef.current.length
    if (units.length === 0 && blockId) {
      const emptyUnit: StrapiUnit = {
        name: "",
        code: "",
        clientTempId: generateClientTempId(),
        block: { documentId: blockId, id: blockId } as unknown as StrapiUnit["block"],
      }
      dataRef.current = [emptyUnit]
      setRowCount(1)
      addToHistory([emptyUnit])
    } else {
      dataRef.current = units
      const shouldReconcile = reconciledUnitsRef.current !== units
      const reconciledRows: Array<{ rowIndex: number; fields: string[] }> = []
      const reconciledLog: Array<{ rowIndex: number; label: string; changed: Array<{ field: string; before: number; after: number }> }> = []
      dataRef.current.forEach((u, idx) => {
        const changed = ensureUnitFormulasSynced(u as Record<string, unknown>, { collectionDate: blockCollectionDate, startDate: blockStartDate }, isVerticalRef.current, unitVatRates(u as any), isLoteRef.current, countryIsoRef.current, industrialKindRef.current)
        if (!shouldReconcile || changed.length === 0) return
        const rowKey = getUnitRowKey(u)
        if (!rowKey || isNewUnit(u)) return
        for (const c of changed) {
          addPendingChange(rowKey, c.field)
          const varasKey = M2_TO_VARAS_MAP[c.field]
          if (varasKey) addPendingChange(rowKey, varasKey)
        }
        reconciledRows.push({ rowIndex: idx + 1, fields: changed.map((c) => c.field) })
        reconciledLog.push({ rowIndex: idx + 1, label: String((u as Record<string, unknown>).name || (u as Record<string, unknown>).unitNumber || rowKey), changed })
      })
      if (shouldReconcile) {
        reconciledUnitsRef.current = units
        if (reconciledRows.length > 0) {
          logReconciliation(reconciledLog)
          setFormulaSyncAlert({ open: true, rows: reconciledRows })
        }
      }
      if (units.length !== previousLength) {
        setRowCount(units.length)
      }
      if (historyRef.current.historyIndex === -1 ||
          JSON.stringify(historyRef.current.history[historyRef.current.historyIndex]?.units) !== JSON.stringify(units)) {
        addToHistory(units)
      }
    }
  }, [units, blockId, blockCategory, blockCategoryCode, blockIsVertical, blockIsLote, addPendingChange, isNewUnit])

  // Update history ref
  useEffect(() => {
    historyRef.current = { history, historyIndex }
  }, [history, historyIndex])

  // Add entry to history
  const addToHistory = useCallback((newUnits: StrapiUnit[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push({
        units: JSON.parse(JSON.stringify(newUnits)), // Deep clone
        timestamp: Date.now()
      })
      // Limit history to 50 entries
      if (newHistory.length > 50) {
        newHistory.shift()
      }
      setHistoryIndex(newHistory.length - 1)
      return newHistory
    })
  }, [historyIndex])

  // Helper function to convert value to API format
  const convertValueForAPI = useCallback((key: string, value: unknown): unknown => {
    // Handle parkingType - convert to documentId
    if (key === "parkingType") {
      if (typeof value === 'object' && value !== null && 'documentId' in value) {
        return (value as any).documentId || (value as any).id || null
      }
      const selectedParkingType = parkingTypes.find(pt => 
        pt.name?.toLowerCase() === String(value).toLowerCase() ||
        pt.code?.toLowerCase() === String(value).toLowerCase() ||
        pt.documentId === String(value) ||
        String(pt.id) === String(value)
      )
      return selectedParkingType?.documentId || selectedParkingType?.id || null
    }
    // Handle topography - convert to documentId
    else if (key === "topography") {
      if (typeof value === 'object' && value !== null && 'documentId' in value) {
        return (value as any).documentId || (value as any).id || null
      }
      const selectedTopography = topographies.find(t => 
        t.name?.toLowerCase() === String(value).toLowerCase() ||
        t.code?.toLowerCase() === String(value).toLowerCase() ||
        t.documentId === String(value) ||
        String(t.id) === String(value)
      )
      return selectedTopography?.documentId || selectedTopography?.id || null
    }
    // Handle unitUsage - convert to documentId
    else if (key === "unitUsage") {
      if (typeof value === 'object' && value !== null && 'documentId' in value) {
        return (value as any).documentId || (value as any).id || null
      }
      const selectedUnitUsage = unitUsages.find(uu => 
        uu.name?.toLowerCase() === String(value).toLowerCase() ||
        uu.code?.toLowerCase() === String(value).toLowerCase() ||
        uu.documentId === String(value) ||
        String(uu.id) === String(value)
      )
      return selectedUnitUsage?.documentId || selectedUnitUsage?.id || null
    }
    else if (key === "unitType") {
      return formatUnitTypeForStrapi(value)
    }
    const dzKey = resolveUnitTypeDynamicColumn(key)
    if (dzKey) {
      return normalizeUnitTypeDynamicForStrapiBody(dzKey.def, value)
    }
    // Handle availability - map display labels to values
    else if (key === "availability") {
      if (value === "Disponible") return "Available"
      if (value === "No Disponible") return "Not Available"
      return value
    }
    // Boolean fields
    else if (key === "hasParking" || key === "hasMotorcycleParking") {
      return Boolean(value)
    }
    // Number fields
    else {
      const numberFields = [
        "frontM2", "depthM2", "landM2",
        "unitSizeM2", "parkingSizeM2",
        "totalSizeM2", "habitableConstructionM2",
        "frontVaras2", "depthVaras2", "landVaras2",
        "unitSizeVaras2", "parkingSizeVaras2",
        "totalSizeVaras2", "habitableConstructionVaras2",
        "bathrooms", "parkingSpaces",
        "totalPriceUSD", "priceWithoutVATUSD",
        "pricePerM2USD",
        "rentalPriceUSD", "rentalPriceWithoutVATUSD",
        "rentalPricePerM2WithoutVATUSD",
        "maintenanceTotalPriceM2USD",
        "maintenancePricePerM2USD",
        "installmentUSD", "incomeUSD",
        "unitAbsorption", "absorptionPerM2"
      ]
      if (numberFields.includes(key)) {
        const num = typeof value === "number" ? value : parseFloat(String(value)) || 0
        if (key === "unitAbsorption" || key === "absorptionPerM2") {
          return Math.round(num * 1e12) / 1e12
        }
        return num
      }
    }
    return value
  }, [parkingTypes, topographies, unitUsages])

  // Track readonly columns (relations, system fields, computed: parking, terreno, total size, habitable construction, price per m²)
  const readonlyFields = useMemo(() => new Set([
    "documentId",
    "code",
    "name",
    "legacyId",
    "block",
    "parkingSizeM2",
    "parkingSizeVaras2",
    "totalSizeM2",
    "totalSizeVaras2",
    "habitableConstructionM2",
    "habitableConstructionVaras2",
    "blockCategory",
    "pais",
    "vatRateDisplay",
    "installmentUSD",
    "incomeUSD",
    "unitAbsorption",
    "absorptionPerM2",
  ]), [])
  
  // When Has Parking is false, these fields are not editable (per row)
  const isParkingDependentReadonly = useCallback((key: string, unit: Record<string, unknown> | undefined): boolean => {
    if (!unit) return false
    if (key !== "hasMotorcycleParking" && key !== "parkingType" && key !== "parkingSpaces") return false
    return (unit as any).hasParking === false
  }, [])

  // Helper function to check if a field is readonly based on editingUnit and field type
  const isFieldReadonly = useCallback((key: string): boolean => {
    // System readonly fields
    if (readonlyFields.has(key)) return true
    // rentalPricePerM2WithoutVAT is editable (shows open lock) — same as pricePerM2 and maintenancePricePerM2
    // maintenancePricePerM2 is conditionally editable (requires habitable > 0) — checked per-row in isCellEffectivelyReadonly
    if (key.startsWith("installment")) return true
    if (key.startsWith("income")) return true
    if (key === "unitAbsorption" || key.startsWith("unitAbsorption")) return true
    
    const m2Fields = ["frontM2", "depthM2", "landM2", "unitSizeM2", "parkingSizeM2", "totalSizeM2", "habitableConstructionM2"]
    const varas2Fields = ["frontVaras2", "depthVaras2", "landVaras2", "unitSizeVaras2", "parkingSizeVaras2", "totalSizeVaras2", "habitableConstructionVaras2"]
    
    // Collapse logic: only the active unit group is editable
    if (m2Fields.includes(key)) {
      return editingUnit === 'varas2'
    }
    if (varas2Fields.includes(key)) {
      return editingUnit === 'm2'
    }
    
    // Currency fields: only the active currency group is editable
    const usdFields = [
      "totalPriceUSD", "priceWithoutVATUSD", "pricePerM2USD",
      "rentalPriceUSD", "rentalPriceWithoutVATUSD", "rentalPricePerM2WithoutVATUSD",
      "maintenanceTotalPriceM2USD", "maintenanceWithoutVATUSD", "maintenancePricePerM2USD",
      "installmentUSD", "incomeUSD"
    ]
    
    // Check if it's a USD field
    if (usdFields.includes(key)) {
      // If editing a currency (not USD), USD fields are readonly
      return editingCurrency !== 'USD'
    }
    
    // Check if it's a currency field (not USD)
    for (const currency of activeCurrencies) {
      const currencyCode = currency.code.toLowerCase()
      for (const usdField of usdFields) {
        const currencyField = usdField.replace('USD', currencyCode.toUpperCase())
        if (key === currencyField) {
          // This field is readonly if it's not the active currency
          return currency.code !== editingCurrency
        }
      }
    }
    
    return false
  }, [readonlyFields, editingUnit, editingCurrency, activeCurrencies])

  /** Alineado con getCellContent: parqueo condicional + columnas dz no aplicables a la fila. */
  const isCellEffectivelyReadonly = useCallback(
    (key: string, unit: StrapiUnit | undefined): boolean => {
      if (!unit) return true
      if (isFieldReadonly(key)) return true
      if (isParkingDependentReadonly(key, unit as Record<string, unknown>)) return true
      if (resolveUnitTypeDynamicColumn(key) && !unitTypeDynamicAppliesToRow(unit, key)) return true
      // Industrial: el tamaño de unidad es la suma de bodega + oficina +
      // mezzanine (o el terreno). Dejarlo editable invitaría a escribir un
      // número que la siguiente edición de cualquiera de sus partes pisaría.
      if ((key === "unitSizeM2" || key === "unitSizeVaras2") && industrialKindRef.current !== null) return true
      // perM2 fields only editable when the unit has habitable area to divide by
      if (key.startsWith("pricePerM2") || key.startsWith("maintenancePricePerM2") || key.startsWith("rentalPricePerM2WithoutVAT")) {
        const habitable = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
        if (habitable <= 0) return true
      }
      return false
    },
    [isFieldReadonly, isParkingDependentReadonly]
  )

  // Map visual varas² columns to their mts² counterparts (used for conversions and updates)
  const varasToM2Map = VARAS_TO_M2_MAP as Record<string, keyof StrapiUnit>
  
  // Map currency columns to their USD counterparts
  const currencyToUsdMap: Record<string, string> = {}
  const usdFields = [
    "totalPriceUSD", "priceWithoutVATUSD", "pricePerM2USD",
    "rentalPriceUSD", "rentalPriceWithoutVATUSD", "rentalPricePerM2WithoutVATUSD",
    "maintenanceTotalPriceM2USD", "maintenanceWithoutVATUSD", "maintenancePricePerM2USD",
    "installmentUSD", "incomeUSD"
  ]
  activeCurrencies.forEach((currency) => {
    const currencyCode = currency.code.toLowerCase()
    usdFields.forEach((usdField) => {
      const currencyField = usdField.replace('USD', currencyCode.toUpperCase())
      currencyToUsdMap[currencyField] = usdField
    })
  })

  // Inverse map to update visual varas² when mts² is edited
  const m2ToVarasMap = M2_TO_VARAS_MAP

  // Define columns based on Unit schema from OpenAPI (dataType comes from def.type for validation/paste)
  type ColumnWithGroup = GridColumn & { groupKey?: string; dataType?: CellDataType }

  const columns = useMemo<ColumnWithGroup[]>(() => {
    const columnDefs: { key: string; width: number; type: string; groupKey: string; readonly?: boolean }[] = [
      // Identifier — columnas fijas (freezeColumns=3)
      { key: "name",         width: 300, type: "rowid", groupKey: "identifier" },
      { key: "unitNumber",   width: 168, type: "text",  groupKey: "identifier" },
      { key: "availability", width: 200, type: "text",  groupKey: "identifier" },
    ]

    // ── Highlights — bloque 1: solo dimensión ────────────────────────────────
    columnDefs.push(
      { key: "unitSizeM2",     width: 200, type: "number", groupKey: "highlights" },
      { key: "unitSizeVaras2", width: 200, type: "number", groupKey: "highlights", readonly: true },
    )

    // ── Tipo de unidad (DZ) + selector unitType ───────────────────────────────
    // Orden dentro de cada segmento: balconyTerraceM2 primero, luego el resto.
    const presentDzSegments = detectSegmentsPresentInUnits(dataRef.current)
    const dzGroupKey = (s: DzSegment) =>
      s === "housing" ? "unitTypeHousing" : s === "offices" ? "unitTypeOffices" : "unitTypeIndustrial"
    for (const seg of presentDzSegments) {
      const sortedFields = [...DYNAMIC_ZONE_FIELDS_BY_SEGMENT[seg]].sort((a, b) => {
        if (a.gridKey === "balconyTerraceM2") return -1
        if (b.gridKey === "balconyTerraceM2") return  1
        if (a.gridKey === "bedrooms")         return -1
        if (b.gridKey === "bedrooms")         return  1
        return 0
      })
      for (const f of sortedFields) {
        const colType = f.gridType === "boolean" ? "boolean" : f.gridType === "number" ? "number" : "text"
        columnDefs.push({
          key: `${seg}.${f.gridKey}`,
          width: f.gridType === "boolean" ? 128 : f.gridType === "number" ? 140 : 168,
          type: colType,
          groupKey: dzGroupKey(seg),
        })
      }
    }
    // ── Highlights — bloque 2: baños, parqueo y precios ──────────────────────
    columnDefs.push(
      { key: "bathrooms",     width: 112, type: "number", groupKey: "highlights" },
      { key: "parkingSpaces", width: 176, type: "number", groupKey: "highlights" },
    )

    // Precio de venta y mantenimiento: USD + todas las monedas activas, campo por campo
    const highlightPriceDefs = [
      { key: "totalPriceUSD",              width: 184 },
      { key: "priceWithoutVATUSD",         width: 208 },
      { key: "pricePerM2USD",              width: 204 },
      { key: "maintenanceTotalPriceM2USD", width: 248 },
      { key: "maintenanceWithoutVATUSD",   width: 220 },
      { key: "maintenancePricePerM2USD",   width: 248 },
    ]
    for (const { key: usdKey, width } of highlightPriceDefs) {
      columnDefs.push({ key: usdKey, width, type: "number", groupKey: "highlights" })
      for (const currency of activeCurrencies) {
        const currencyKey = usdKey.replace("USD", currency.code.toUpperCase())
        columnDefs.push({ key: currencyKey, width, type: "number", groupKey: "highlights" })
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    columnDefs.push(
      // Basic Info
      { key: "code", width: 150, type: "rowid", groupKey: "basicInfo" },
      { key: "model", width: 160, type: "text", groupKey: "basicInfo" },
      { key: "topography", width: 200, type: "text", groupKey: "basicInfo" },

      // Dimensions M2 (unitSizeM2 movido a highlights)
      { key: "frontM2", width: 144, type: "number", groupKey: "dimensionsM2" },
      { key: "depthM2", width: 168, type: "number", groupKey: "dimensionsM2" },
      { key: "landM2", width: 148, type: "number", groupKey: "dimensionsM2" },
      { key: "parkingSizeM2", width: 210, type: "number", groupKey: "dimensionsM2" },
      { key: "totalSizeM2", width: 192, type: "number", groupKey: "dimensionsM2" },
      { key: "habitableConstructionM2", width: 292, type: "number", groupKey: "dimensionsM2" },

      // Dimensions Varas2 (visual only)
      { key: "frontVaras2", width: 144, type: "number", groupKey: "dimensionsVaras2", readonly: true },
      { key: "depthVaras2", width: 168, type: "number", groupKey: "dimensionsVaras2", readonly: true },
      { key: "landVaras2", width: 148, type: "number", groupKey: "dimensionsVaras2" },
      { key: "unitSizeVaras2", width: 200, type: "number", groupKey: "dimensionsVaras2", readonly: true },
      { key: "parkingSizeVaras2", width: 210, type: "number", groupKey: "dimensionsVaras2", readonly: true },
      { key: "totalSizeVaras2", width: 192, type: "number", groupKey: "dimensionsVaras2", readonly: true },
      { key: "habitableConstructionVaras2", width: 292, type: "number", groupKey: "dimensionsVaras2", readonly: true },

      // Parking (parkingSpaces movido a highlights)
      { key: "hasParking", width: 168, type: "boolean", groupKey: "parking" },
      { key: "hasMotorcycleParking", width: 232, type: "boolean", groupKey: "parking" },
      { key: "parkingType", width: 208, type: "text", groupKey: "parking" },

      // Availability & Usage
      { key: "blockCategory", width: 200, type: "text", groupKey: "availabilityAndUsage" },
      { key: "pais", width: 170, type: "text", groupKey: "availabilityAndUsage" },
      { key: "unitUsage", width: 188, type: "text", groupKey: "availabilityAndUsage" },
      { key: "unitType", width: 200, type: "text", groupKey: "availabilityAndUsage" },

      // Prices USD (totalPrice, priceWithoutVAT, pricePerM2, maintenance movidos a highlights)
      { key: "vatRateDisplay", width: 140, type: "text", groupKey: "pricesUSD" },
      { key: "rentalPriceUSD", width: 184, type: "number", groupKey: "pricesUSD" },
      { key: "rentalPriceWithoutVATUSD", width: 208, type: "number", groupKey: "pricesUSD" },
      { key: "rentalPricePerM2WithoutVATUSD", width: 268, type: "number", groupKey: "pricesUSD" },

      // Financing
      { key: "installmentUSD", width: 152, type: "number", groupKey: "pricesUSD" },
      { key: "incomeUSD", width: 152, type: "number", groupKey: "pricesUSD" },
    )
    
    // Variantes de moneda para campos que NO están en highlights (renta, cuota, ingreso)
    const nonHighlightUsdFields = [
      "rentalPriceUSD", "rentalPriceWithoutVATUSD", "rentalPricePerM2WithoutVATUSD",
      "installmentUSD", "incomeUSD",
    ]

    activeCurrencies.forEach((currency) => {
      nonHighlightUsdFields.forEach((usdField) => {
        const currencyField = usdField.replace("USD", currency.code.toUpperCase())
        const width = columnDefs.find(c => c.key === usdField)?.width || 180
        columnDefs.push({
          key: currencyField,
          width,
          type: "number",
          groupKey: `prices${currency.code}`,
          readonly: false,
        })
      })
    })
    
    // Continue with remaining columns
    columnDefs.push(
      // Absorption
      { key: "unitAbsorption", width: 200, type: "number", groupKey: "absorption" },
      { key: "absorptionPerM2", width: 220, type: "number", groupKey: "absorption" },
      
      // System / read-only (ID, legacy ID, block) — cannot be altered
      { key: "documentId", width: 260, type: "rowid", groupKey: "systemReadOnly" },
      { key: "legacyId", width: 156, type: "rowid", groupKey: "systemReadOnly" },
      { key: "block", width: 216, type: "rowid", groupKey: "systemReadOnly" }
    )

    // Helper function to get icon based on column type and key
    const getColumnIcon = (type: string, key: string): GridColumnIcon => {
      const dzK = resolveUnitTypeDynamicColumn(key)
      if (dzK) {
        if (dzK.def.gridType === "boolean") return GridColumnIcon.HeaderBoolean
        if (dzK.def.gridType === "number") return GridColumnIcon.HeaderNumber
        if (dzK.def.gridType === "enum") return GridColumnIcon.HeaderArray
        return GridColumnIcon.HeaderString
      }
      if (key === "name") return GridColumnIcon.HeaderString
      if (key === "code" || key === "legacyId") return GridColumnIcon.HeaderCode
      if (key === "documentId") return GridColumnIcon.HeaderRowID
      if (key === "block") return GridColumnIcon.HeaderReference
      if (type === "rowid") return GridColumnIcon.ProtectedColumnOverlay
      if (type === "number") return GridColumnIcon.HeaderNumber
      if (type === "boolean") return GridColumnIcon.HeaderBoolean
      if (key === "parkingType") return GridColumnIcon.HeaderArray // BubbleCell
      if (key === "unitUsage") return GridColumnIcon.HeaderArray // DrilldownCell
      if (key === "unitType") return GridColumnIcon.HeaderArray
      if (key === "topography") return GridColumnIcon.HeaderArray
      return GridColumnIcon.HeaderString // Default for text fields
    }

    return columnDefs
      .map((def) => {
        const dataType: CellDataType =
          dropdownFields.includes(def.key) ? "DROPDOWN"
          : def.type === "number" ? "NUMBER"
          : def.type === "boolean" ? "BOOLEAN"
          : "TEXT"
        const dzCol = resolveUnitTypeDynamicColumn(def.key)
        const title = dzCol
          ? t(`column.${dzCol.segment}.${dzCol.gridKey}`)
          : t(`column.${def.key}`) || def.key
        return {
          id: def.key,
          title,
          width: columnWidths.get(def.key) || def.width,
          icon: getColumnIcon(def.type, def.key),
          group: def.groupKey ? t(`group.${def.groupKey}`) : undefined,
          groupKey: def.groupKey,
          readonly: def.readonly ?? false,
          dataType,
        }
      })
  }, [t, columnWidths, activeCurrencies, dropdownFields, sortedUnits.length, refreshKey])

  // Dimension column keys: show only one set at a time (mts² or varas²) to simplify the table
  const m2DimensionKeys = useMemo(() => ["frontM2", "depthM2", "landM2", "unitSizeM2", "parkingSizeM2", "totalSizeM2", "habitableConstructionM2"], [])
  const varas2DimensionKeys = useMemo(() => ["frontVaras2", "depthVaras2", "landVaras2", "unitSizeVaras2", "parkingSizeVaras2", "totalSizeVaras2", "habitableConstructionVaras2"], [])

  // Currency column key -> currency code: show only columns for the selected currency
  const currencyColumnToCode = useMemo(() => {
    const usdPriceKeys = [
      "totalPriceUSD", "priceWithoutVATUSD", "pricePerM2USD",
      "rentalPriceUSD", "rentalPriceWithoutVATUSD", "rentalPricePerM2WithoutVATUSD",
      "maintenanceTotalPriceM2USD", "maintenanceWithoutVATUSD", "maintenancePricePerM2USD",
      "installmentUSD", "incomeUSD"
    ]
    const map = new Map<string, string>()
    usdPriceKeys.forEach((k) => map.set(k, 'USD'))
    activeCurrencies.forEach((c) => {
      if (c.code.toUpperCase() === 'USD') return
      usdPriceKeys.forEach((usdKey) => {
        const cKey = usdKey.replace('USD', c.code.toUpperCase())
        map.set(cKey, c.code)
      })
    })
    return map
  }, [activeCurrencies])

  // Columns visible in the grid: only dimension columns for active unit (mts² or varas²), only price columns for active currency
  const visibleColumns = useMemo<ColumnWithGroup[]>(() => {
    const filtered = columns.filter((col) => {
      const key = col.id as string
      if (!columnGroupKeyMatchesUnitTypeViewFilter(col.groupKey, unitTypeViewFilter)) return false
      if (editingUnit === 'm2' && varas2DimensionKeys.includes(key)) return false
      if (editingUnit === 'varas2' && m2DimensionKeys.includes(key)) return false
      const colCurrency = currencyColumnToCode.get(key)
      if (colCurrency !== undefined && colCurrency !== editingCurrency) return false
      if (hiddenColumnKeys.has(key)) return false
      return true
    })
    // Build the set of "client-only" column keys (no API) including foreign-currency variants
    const clientOnlyKeys = new Set<string>(DATASHEET_CONFIG.fields.clientOnlyFields)
    for (const usdField of DATASHEET_CONFIG.fields.clientOnlyFields) {
      for (const currency of activeCurrencies) {
        clientOnlyKeys.add(usdField.replace(/USD$/, currency.code.toUpperCase()))
      }
    }

    return filtered.map((col) => {
      const key = col.id as string
      const isReadonly = isFieldReadonly(key)
      const showLockOverlay = isReadonly
      const isParkingConditional = PARKING_CONDITIONAL_COLUMN_KEYS.has(key)
      const isClientOnly = clientOnlyKeys.has(key) || isForeignCurrencyPriceColumnKey(key) || key === "vatRateDisplay" || key === "blockCategory" || key === "pais" || key in VARAS_TO_M2_MAP
      const overlayIcon =
        showLockOverlay ? GridColumnIcon.ProtectedColumnOverlay
        : isParkingConditional ? GridColumnIcon.HeaderIfThenElse
        : undefined
      const themeOverride = undefined
      const baseWidth = (col as { width?: number }).width
      const extraWidth = isClientOnly && typeof baseWidth === "number" ? baseWidth + 28 : undefined
      return {
        ...col,
        ...(extraWidth !== undefined ? { width: extraWidth } : {}),
        readonly: isReadonly,
        overlayIcon,
        themeOverride,
        indicatorIcon: isClientOnly ? "noApiSync" : undefined,
      }
    })
  }, [columns, editingUnit, editingCurrency, unitTypeViewFilter, isFieldReadonly, m2DimensionKeys, varas2DimensionKeys, currencyColumnToCode, hiddenColumnKeys, activeCurrencies])

  // Auto-size all visible columns to fit their header text + icons on initial render
  // and whenever the set of visible columns changes (currency toggle, unit type filter, etc.)
  useEffect(() => {
    const ref = dataEditorRef.current
    if (!ref || visibleColumns.length === 0) return
    const id = setTimeout(() => {
      ref.remeasureColumns(CompactSelection.fromSingleSelection([0, visibleColumns.length]))
    }, 100)
    return () => clearTimeout(id)
  }, [visibleColumns.length])

  const usdPriceColumnIds = useMemo(
    () =>
      new Set<string>([
        "totalPriceUSD",
        "priceWithoutVATUSD",
        "pricePerM2USD",
        "rentalPriceUSD",
        "rentalPriceWithoutVATUSD",
        "rentalPricePerM2WithoutVATUSD",
        "maintenanceTotalPriceM2USD",
        "maintenanceWithoutVATUSD",
        "maintenancePricePerM2USD",
        "installmentUSD",
        "incomeUSD",
      ]),
    []
  )

  /**
   * Ayudas de cabecera: en JSON usar <b>negrita</b>, <br></br> para salto, o \\n con texto plano.
   * Ver claves bajo common.columnHelp en messages/*.json
   */
  const columnHelpRich = useCallback(
    (messageKey: string, values?: Record<string, string>) => {
      return t.rich(messageKey, {
        ...(values ?? {}),
        b: (chunks) => (
          <strong className="font-semibold text-foreground">{chunks}</strong>
        ),
        br: () => <br />,
      })
    },
    [t]
  )

  const resolveColumnHelp = useCallback(
    (columnId: string): ReactNode | null => {
      if (editingUnit === "m2" && varas2DimensionKeys.includes(columnId)) {
        return columnHelpRich("columnHelp.dimensionVaras2Calculated")
      }
      if (editingUnit === "varas2" && m2DimensionKeys.includes(columnId)) {
        return columnHelpRich("columnHelp.dimensionM2Calculated")
      }

      if (isForeignCurrencyPriceColumnKey(columnId)) {
        const m = columnId.match(FOREIGN_PRICE_COLUMN_KEY_RE)
        const currency = m?.[2] ?? ""
        const prefix = m?.[1] ?? ""
        const foreignHelpKeyByPrefix: Record<string, string> = {
          totalPrice: "columnHelp.foreignTotalPrice",
          priceWithoutVAT: "columnHelp.foreignPriceWithoutVAT",
          pricePerM2: "columnHelp.foreignPricePerM2",
          rentalPrice: "columnHelp.foreignRentalPrice",
          rentalPriceWithoutVAT: "columnHelp.foreignRentalPriceWithoutVAT",
          rentalPricePerM2WithoutVAT:
            "columnHelp.foreignRentalPricePerM2WithoutVAT",
          maintenanceTotalPriceM2: "columnHelp.foreignMaintenanceTotalPriceM2",
          maintenanceWithoutVAT: "columnHelp.foreignMaintenanceWithoutVAT",
          maintenancePricePerM2: "columnHelp.foreignMaintenancePricePerM2",
          installment: "columnHelp.foreignInstallment",
          income: "columnHelp.foreignIncome",
        }
        const helpKey = foreignHelpKeyByPrefix[prefix]
        if (helpKey) {
          return columnHelpRich(helpKey, { currency })
        }
        return columnHelpRich("columnHelp.generic")
      }

      if (editingCurrency !== "USD" && usdPriceColumnIds.has(columnId)) {
        return columnHelpRich("columnHelp.usdReadonlyWhileForeignCurrency")
      }

      if (columnId === "documentId" && isSuperAdmin) {
        return columnHelpRich("columnHelp.documentIdSuperAdmin")
      }

      // Cuota (USD): la fórmula PMT depende del país del bloque (parámetros por ISO).
      // Mostramos los valores reales que se están aplicando para verificar que sea la correcta.
      if (columnId === "installmentUSD") {
        const iso = blockCountry?.isoCode2 || blockCountry?.code
        const p = installmentParamsForIso(iso)
        const country = blockCountry?.name || (iso ? iso.toUpperCase() : "—")
        const loanPct = `${Math.round(p.loanRatio * 100)}%`
        const years = String(p.years)
        const ratePct = `${(p.annualRate * 100).toLocaleString(locale)}%`
        return columnHelpRich("columnHelp.installmentUSD", { country, loanPct, years, ratePct })
      }

      const helpKeyByColumnId: Record<string, string> = {
        name: "columnHelp.name",
        code: "columnHelp.code",
        unitNumber: "columnHelp.unitNumber",
        model: "columnHelp.model",
        topography: "columnHelp.topography",
        bathrooms: "columnHelp.bathrooms",
        frontM2: "columnHelp.frontM2",
        depthM2: "columnHelp.depthM2",
        landM2: "columnHelp.landM2",
        unitSizeM2: "columnHelp.unitSizeM2",
        parkingSizeM2: "columnHelp.parkingSizeM2",
        totalSizeM2: "columnHelp.totalSizeM2",
        habitableConstructionM2: "columnHelp.habitableConstructionM2",
        frontVaras2: "columnHelp.frontVaras2",
        depthVaras2: "columnHelp.depthVaras2",
        landVaras2: "columnHelp.landVaras2",
        unitSizeVaras2: "columnHelp.unitSizeVaras2",
        parkingSizeVaras2: "columnHelp.parkingSizeVaras2",
        totalSizeVaras2: "columnHelp.totalSizeVaras2",
        habitableConstructionVaras2: "columnHelp.habitableConstructionVaras2",
        hasMotorcycleParking: "columnHelp.hasMotorcycleParking",
        parkingType: "columnHelp.parkingType",
        parkingSpaces: "columnHelp.parkingSpaces",
        hasParking: "columnHelp.hasParking",
        blockCategory: "columnHelp.blockCategory",
        availability: "columnHelp.availability",
        unitUsage: "columnHelp.unitUsage",
        unitType: "columnHelp.unitType",
        vatRateDisplay: "columnHelp.vatRateDisplay",
        totalPriceUSD: "columnHelp.totalPriceUSD",
        priceWithoutVATUSD: "columnHelp.priceWithoutVATUSD",
        pricePerM2USD: "columnHelp.pricePerM2USD",
        rentalPriceUSD: "columnHelp.rentalPriceUSD",
        rentalPriceWithoutVATUSD: "columnHelp.rentalPriceWithoutVATUSD",
        rentalPricePerM2WithoutVATUSD: "columnHelp.rentalPricePerM2WithoutVATUSD",
        maintenanceTotalPriceM2USD: "columnHelp.maintenanceTotalPriceM2USD",
        maintenanceWithoutVATUSD: "columnHelp.maintenanceWithoutVATUSD",
        maintenancePricePerM2USD: "columnHelp.maintenancePricePerM2USD",
        installmentUSD: "columnHelp.installmentUSD",
        incomeUSD: "columnHelp.incomeUSD",
        unitAbsorption: "columnHelp.unitAbsorption",
        absorptionPerM2: "columnHelp.absorptionPerM2",
        documentId: "columnHelp.documentId",
        legacyId: "columnHelp.legacyId",
        block: "columnHelp.block",
        "housing.bedrooms": "columnHelp.housingBedrooms",
        "housing.balconyTerraceM2": "columnHelp.housingBalconyTerraceM2",
        "offices.balconyTerraceM2": "columnHelp.officesBalconyTerraceM2",
        "offices.employeeCapacity": "columnHelp.officesEmployeeCapacity",
        "offices.parkingSpacesSale": "columnHelp.officesParkingSpacesSale",
        "offices.pricePerM2ExParkingUsd": "columnHelp.officesPricePerM2ExParkingUsd",
        "offices.propertyValueExParkingUsd": "columnHelp.officesPropertyValueExParkingUsd",
        "offices.officeClass": "columnHelp.officesOfficeClass",
        "offices.sizeCategory": "columnHelp.officesSizeCategory",
        "offices.staffCapacityRange": "columnHelp.officesStaffCapacityRange",
        "offices.areaRange": "columnHelp.officesAreaRange",
        "offices.sizeStaffSummary": "columnHelp.officesSizeStaffSummary",
        "offices.sizeAreaSummary": "columnHelp.officesSizeAreaSummary",
      }

      const helpKey = helpKeyByColumnId[columnId]
      if (helpKey) {
        const vatRateStr = 'Interior+Lote: 1,12 · Uso Renta: 1,12 · Uso Venta: 0,916 · Pred.: 1,12'
        const vatPct = vatRateStr
        const isVert = isVerticalRef.current
        const isLote = isLoteRef.current
        const isM2 = columnId === 'habitableConstructionM2'
        const isVaras = columnId === 'habitableConstructionVaras2'
        let formula = ''
        let activeFormula = ''
        if (isM2 || isVaras) {
          if (isLote) {
            formula = 'Lote'
            activeFormula = isM2 ? 'Igual que Terreno (mts²)' : 'Igual que Terreno (varas²)'
          } else if (isVert) {
            formula = 'Vertical'
            activeFormula = isM2
              ? 'Tamaño Unidad (mts²) + Balcón / Terraza (mts²)'
              : 'Tamaño Unidad (varas²) + Balcón / Terraza (varas²)'
          } else {
            formula = 'Horizontal'
            activeFormula = isM2 ? 'Igual que Tamaño Unidad (mts²)' : 'Igual que Tamaño Unidad (varas²)'
          }
        }
        return columnHelpRich(helpKey, { vatPct, vatRate: vatRateStr, formula, activeFormula })
      }
      return columnHelpRich("columnHelp.generic")
    },
    [
      editingUnit,
      editingCurrency,
      t,
      locale,
      blockCountry,
      m2DimensionKeys,
      varas2DimensionKeys,
      usdPriceColumnIds,
      columnHelpRich,
      isSuperAdmin,
    ]
  )

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (args.kind !== "header") {
        setHeaderColumnTooltip(null)
        return
      }
      const col = args.location[0]
      const column = visibleColumns[col]
      const id = column?.id as string | undefined
      if (!id) {
        setHeaderColumnTooltip(null)
        return
      }
      const content = resolveColumnHelp(id)
      if (content == null) {
        setHeaderColumnTooltip(null)
        return
      }
      const b = dataEditorRef.current?.getBounds(col, -1)
      if (!b) {
        setHeaderColumnTooltip(null)
        return
      }
      setHeaderColumnTooltip({
        content,
        left: b.x + b.width / 2,
        top: b.y + b.height + 8,
      })
    },
    [visibleColumns, resolveColumnHelp]
  )

  // TEMPORARILY COMMENTED: Header menu functionality
  // Header menu click handler
  // const onHeaderMenuClick = useCallback((col: number, bounds: Rectangle) => {
  //   setHeaderMenu({ col, bounds })
  // }, [])
  
  // Close menu on outside click
  // useEffect(() => {
  //   if (headerMenu) {
  //     const handleClickOutside = (e: MouseEvent) => {
  //       const target = e.target as HTMLElement
  //       if (!target.closest('[data-header-menu]')) {
  //         setHeaderMenu(undefined)
  //       }
  //     }
  //     document.addEventListener('mousedown', handleClickOutside)
  //     return () => document.removeEventListener('mousedown', handleClickOutside)
  //   }
  // }, [headerMenu])

  // Get group details with icons
  const getGroupDetails = useCallback((groupName: string) => {
    // Map translated group names back to keys for icon lookup
    const groupKeyMap: Record<string, string> = {
      [t('group.identifier')]: "identifier",
      [t('group.highlights')]: "highlights",
      [t('group.basicInfo')]: "basicInfo",
      [t('group.dimensionsM2')]: "dimensionsM2",
      [t('group.dimensionsVaras2')]: "dimensionsVaras2",
      [t('group.parking')]: "parking",
      [t('group.availabilityAndUsage')]: "availabilityAndUsage",
      [t('group.unitTypeHousing')]: "unitTypeHousing",
      [t('group.unitTypeOffices')]: "unitTypeOffices",
      [t('group.unitTypeIndustrial')]: "unitTypeIndustrial",
      [t('group.pricesUSD')]: "pricesUSD",
      [t('group.maintenance')]: "maintenance",
      [t('group.financing')]: "financing",
      [t('group.absorption')]: "absorption",
      [t('group.systemReadOnly')]: "systemReadOnly",
    }
    
    const groupIcons: Record<string, GridColumnIcon> = {
      "identifier": GridColumnIcon.HeaderCode,
      "highlights": GridColumnIcon.HeaderNumber,
      "basicInfo": GridColumnIcon.HeaderString,
      "dimensionsM2": GridColumnIcon.HeaderNumber,
      "dimensionsVaras2": GridColumnIcon.HeaderNumber,
      "parking": GridColumnIcon.HeaderArray,
      "availabilityAndUsage": GridColumnIcon.HeaderArray,
      "pricesUSD": GridColumnIcon.HeaderNumber,
      "maintenance": GridColumnIcon.HeaderNumber,
      "financing": GridColumnIcon.HeaderNumber,
      "absorption": GridColumnIcon.HeaderNumber,
      "systemReadOnly": GridColumnIcon.ProtectedColumnOverlay,
      "unitTypeHousing": GridColumnIcon.HeaderString,
      "unitTypeOffices": GridColumnIcon.HeaderString,
      "unitTypeIndustrial": GridColumnIcon.HeaderString,
    }
    
    const groupKey = groupKeyMap[groupName] || groupName.toLowerCase()
    
    return {
      name: groupName,
      icon: groupIcons[groupKey] || GridColumnIcon.HeaderString,
    }
  }, [t])

  // Helper to check if a unit is new (client temp id, or sin id Strapi)
  // Get field display name
  const getFieldDisplayName = useCallback((field: string): string => {
    const dz = resolveUnitTypeDynamicColumn(field)
    if (dz) {
      return t(`column.${dz.segment}.${dz.gridKey}`)
    }
    const names: Record<string, string> = {
      topography: "Topografía",
      parkingType: "Tipo de Parqueo",
      unitUsage: "Uso de Unidad",
      unitType: t("column.unitType"),
      blockCategory: t("column.blockCategory"),
      pais: t("column.pais"),
      vatRateDisplay: t("column.vatRateDisplay"),
      availability: "Disponibilidad",
    }
    return names[field] || field
  }, [t])

  // Helper function to handle cell update errors
  const handleCellError = useCallback((row: number, col: number, field: string, error: unknown) => {
    const cellKey = `${row}:${col}`
    const errorMessage = error instanceof Error ? error.message : String(error)
    const fieldName = getFieldDisplayName(field)
    
    // Add error to cellErrors map
    setCellErrors(prev => {
      const next = new Map(prev)
      next.set(cellKey, errorMessage)
      return next
    })
    
    // Show toast notification
    toast.error(`Error al actualizar celda`, {
      description: `Fila ${row + 1}, Columna ${col + 1} (${fieldName}): ${errorMessage}`,
      duration: 5000,
    })
  }, [getFieldDisplayName])

  // Helper function to clear cell error on successful update
  const clearCellError = useCallback((row: number, col: number) => {
    const cellKey = `${row}:${col}`
    setCellErrors(prev => {
      const next = new Map(prev)
      next.delete(cellKey)
      return next
    })
  }, [])

  // Helper function to mark cell as saving
  const markCellSaving = useCallback((row: number, col: number) => {
    const cellKey = `${row}:${col}`
    setSavingCells(prev => {
      const next = new Set(prev)
      next.add(cellKey)
      return next
    })
  }, [])

  // Helper function to clear cell saving status
  const clearCellSaving = useCallback((row: number, col: number) => {
    const cellKey = `${row}:${col}`
    setSavingCells(prev => {
      const next = new Set(prev)
      next.delete(cellKey)
      return next
    })
  }, [])

  // Helper function to detect changes between two unit states and prepare API updates
  const detectChangesAndUpdateAPI = useCallback(async (
    oldUnits: StrapiUnit[],
    newUnits: StrapiUnit[]
  ) => {
    const updates: Array<{
      unitId: string
      field: string
      value: unknown
      blockDocumentId?: string | number
      row: number
      col: number
    }> = []

    // Fields to ignore (readonly or internal)
    const readonlyFields = new Set([
      "documentId", "id", "clientTempId", "createdAt", "updatedAt", "publishedAt",
      "block", "project", "name", "legacyId"
    ])

    // Get all editable column keys
    const editableKeys = columns
      .map(col => col.id as string)
      .filter(key => key && !isFieldReadonly(key))

    // Compare each unit
    for (let i = 0; i < Math.max(oldUnits.length, newUnits.length); i++) {
      const oldUnit = oldUnits[i]
      const newUnit = newUnits[i]

      if (!oldUnit || !newUnit) continue

      // Skip API update if this is a new unit (no documentId or id)
      if (isNewUnit(newUnit)) continue

      const unitId = getUnitRowKey(newUnit)
      if (!unitId || unitId === "undefined") continue

      const blockDocumentId = newUnit.block?.documentId || newUnit.block?.id

      // Compare each editable field
      for (const key of editableKeys) {
        const oldValue = getNestedValue(oldUnit, key)
        const newValue = getNestedValue(newUnit, key)

        // Deep comparison for objects (like relations)
        let hasChanged = false
        if (key === "parkingType" || key === "topography" || key === "unitUsage") {
          const oldDocId = (oldValue as any)?.documentId || (oldValue as any)?.id
          const newDocId = (newValue as any)?.documentId || (newValue as any)?.id
          hasChanged = String(oldDocId || "") !== String(newDocId || "")
        } else if (key === "unitType") {
          hasChanged =
            JSON.stringify(formatUnitTypeForStrapi(oldValue)) !==
            JSON.stringify(formatUnitTypeForStrapi(newValue))
        } else {
          hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue)
        }

        if (hasChanged) {
          const convertedValue = convertValueForAPI(key, newValue)
          const field =
            key === "parkingType" || key === "unitUsage" || key === "topography" || key === "availability" || key === "unitType"
            ? key
            : getFieldPath(key, newUnit)
          
          // Find row and col indices for this update
          const unitIndex = dataRef.current.findIndex(u => (getUnitRowKey(u)) === unitId)
          const colIndex = visibleColumns.findIndex(col => col.id === key)
          
          updates.push({
            unitId,
            field,
            value: convertedValue,
            blockDocumentId,
            row: unitIndex >= 0 ? unitIndex : i, // Use found index or fallback to loop index
            col: colIndex >= 0 ? colIndex : -1 // Use found index or -1 if not found
          })
        }
      }
    }

    // Execute all updates
    if (updates.length > 0) {
      // Increment pending updates counter and total updates
      setPendingUpdates(prev => {
        const newCount = prev + updates.length
        if (prev === 0) {
          setSaveStatus('saving')
        }
        return newCount
      })
      setTotalUpdates(prev => prev + updates.length)

      // Execute updates in parallel
      const updatePromises = updates.map(({ unitId, field, value, blockDocumentId, row, col }) => {
        // Mark cell as saving if we have valid row and col
        if (row >= 0 && col >= 0) {
          markCellSaving(row, col)
        }
        
        return strapiClient.updateUnit(unitId, field, value, blockDocumentId)
          .then(() => {
            if (process.env.NODE_ENV === "development") {
              console.log(`[Undo/Redo] Updated unit ${unitId}, field: ${field}`)
            }
            // Clear cell saving status and error on successful update
            if (row >= 0 && col >= 0) {
              clearCellSaving(row, col)
              clearCellError(row, col)
            }
          })
          .catch((error) => {
            console.error(`[Undo/Redo] Error updating unit ${unitId}, field: ${field}:`, error)
            // Clear cell saving status on error and mark as error
            if (row >= 0 && col >= 0) {
              clearCellSaving(row, col)
              handleCellError(row, col, field, error)
            }
          })
          .finally(() => {
            // Decrement pending updates counter and increment completed
            setPendingUpdates(prev => {
              const newCount = prev - 1
              if (newCount === 0) {
                setSaveStatus('success')
                setTimeout(() => {
                  setSaveStatus('idle')
                  // Reset counters when all done
                  setTotalUpdates(0)
                  setCompletedUpdates(0)
                }, 1500)
              }
              return newCount
            })
            setCompletedUpdates(prev => prev + 1)
          })
      })

    // Force re-render so varas² visual columns reflect updated mts²
    setRefreshKey(prev => prev + 1)

      await Promise.all(updatePromises)
    }
  }, [convertValueForAPI, visibleColumns, isNewUnit, markCellSaving, clearCellSaving, handleCellError, clearCellError])

  // Undo
  const handleUndo = useCallback(async () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      const previousState = history[newIndex]
      if (previousState) {
        const currentUnits = [...dataRef.current]
        dataRef.current = previousState.units
        setHistoryIndex(newIndex)
        setRefreshKey(prev => prev + 1)
        clearAllPendingChanges()
        // No API sync on undo; save is explicit via Save button
      }
    }
  }, [history, historyIndex, clearAllPendingChanges])

  // Redo
  const handleRedo = useCallback(async () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      const nextState = history[newIndex]
      if (nextState) {
        const currentUnits = [...dataRef.current]
        dataRef.current = nextState.units
        setHistoryIndex(newIndex)
        setRefreshKey(prev => prev + 1)
        clearAllPendingChanges()
        // No API sync on redo; save is explicit via Save button
      }
    }
  }, [history, historyIndex, clearAllPendingChanges])

  // Track new units count (will be updated when rows change)
  const [newUnitsCount, setNewUnitsCount] = useState(0)
  
  // Update new units count when data changes
  useEffect(() => {
    const count = dataRef.current.filter(unit => isNewUnit(unit)).length
    setNewUnitsCount(count)
  }, [refreshKey, isNewUnit])

  // Handle add new row dialog
  const handleAddRowClick = useCallback(() => {
    setAddRowsDialog({ open: true, count: "1" })
  }, [])

  // Handle confirm add rows
  const handleConfirmAddRows = useCallback(() => {
    const count = parseInt(addRowsDialog.count) || 1
    if (count <= 0) return

    // Create new empty units
    const newUnits: StrapiUnit[] = Array.from({ length: count }, () => ({
      name: "",
      code: "",
      clientTempId: generateClientTempId(),
    }))
    
    // Add to dataRef
    dataRef.current = [...dataRef.current, ...newUnits]

    // Update row count
    setRowCount(prev => prev + count)
    
    // Add to history
    addToHistory([...dataRef.current])
    
    // Force re-render to ensure all new rows are immediately visible
    setRefreshKey(prev => prev + 1)
    
    // Close dialog
    setAddRowsDialog({ open: false, count: "1" })
  }, [addRowsDialog.count, addToHistory])

  // Handle row appended from trailing row
  const onRowAppended = useCallback(() => {
    // Create a new empty unit
    const newUnit: StrapiUnit = {
      name: "",
      code: "",
      clientTempId: generateClientTempId(),
    }
    
    // Add to dataRef
    dataRef.current = [...dataRef.current, newUnit]
    
    // Update row count
    setRowCount(prev => prev + 1)
    
    // Add to history
    addToHistory([...dataRef.current])
    
    // Force re-render to ensure the new row is immediately visible
    setRefreshKey(prev => prev + 1)
  }, [addToHistory])

  // Handle save: first flush pending edits (existing units), then create new units
  const handleSave = useCallback(async () => {
    const newUnits = dataRef.current.filter(unit => isNewUnit(unit))
    const snapshot = pendingChangesRef.current
    const hasPendingEdits = snapshot.size > 0
    const hasNewUnits = newUnits.length > 0
    let didFlushEdits = false

    if (!hasPendingEdits && !hasNewUnits) return

    // 1) Flush pending edits for existing units (one request per row)
    if (hasPendingEdits) {
      didFlushEdits = true
      setSaveStatus('saving')
      const unitsToUpdate: Array<{ unitId: string; blockDocumentId?: string | number; unit: StrapiUnit; updates: Array<{ field: string; value: unknown }> }> = []
      snapshot.forEach((fields, unitId) => {
        if (!unitId || unitId === "undefined" || isClientTempRowKey(unitId)) return
        const unit = dataRef.current.find((u) => getUnitRowKey(u) === unitId)
        if (!unit || isNewUnit(unit)) return
        const blockDocumentId = unit.block?.documentId || unit.block?.id
        const updates: Array<{ field: string; value: unknown }> = []
        // Exclude: (1) foreign-currency visual fields (e.g. maintenanceTotalPriceM2GTQ)
        //          (2) client-only USD fields that are always derivable (e.g. rentalPricePerM2WithoutVATUSD)
        //          (3) varas² fields — display-only mirrors, not stored in Strapi
        const fieldSet = new Set([...fields].filter(
          (k) => !isForeignCurrencyPriceColumnKey(k)
            && !DATASHEET_CONFIG.fields.clientOnlyFields.includes(k)
            && !(k in VARAS_TO_M2_MAP)
        ))
        fieldSet.forEach((key) => {
          if (key === "unitNumber") {
            const uNum = unit.unitNumber ?? ""
            const name = (unit as any).name ?? ""
            const code = (unit as any).code ?? ""
            updates.push(
              { field: getFieldPath("unitNumber", unit), value: convertValueForAPI("unitNumber", uNum) },
              { field: getFieldPath("name", unit), value: convertValueForAPI("name", name) },
              { field: getFieldPath("code", unit), value: convertValueForAPI("code", code) }
            )
          } else {
            const value = getNestedValue(unit, key)
            const fieldPath =
              key === "parkingType" || key === "unitUsage" || key === "topography" || key === "availability" || key === "unitType"
                ? key
                : getFieldPath(key, unit)
            updates.push({ field: fieldPath, value: convertValueForAPI(key, value) })
          }
        })
        // Incluir siempre los campos con fórmula (solo los que existen en API; *Varas2 solo existen en vista)
        const formulaFields = [
          "parkingSizeM2",
          "totalSizeM2",
          "habitableConstructionM2",
          "landM2",
          "totalPriceUSD", "priceWithoutVATUSD", "pricePerM2USD",
          "rentalPriceUSD", "rentalPriceWithoutVATUSD",  // rentalPricePerM2WithoutVATUSD is client-only — see DATASHEET_CONFIG.fields.clientOnlyFields
          "maintenanceTotalPriceM2USD", "maintenanceWithoutVATUSD", "maintenancePricePerM2USD",
          "installmentUSD",
          "incomeUSD",
          "unitAbsorption",
          "absorptionPerM2"
        ]
        formulaFields.forEach((key) => {
          if (!fieldSet.has(key)) {
            const value = getNestedValue(unit, key)
            if (value !== undefined && value !== null && value !== "") {
              const fieldPath = getFieldPath(key, unit)
              updates.push({ field: fieldPath, value: convertValueForAPI(key, value) })
            }
          }
        })
        mergeUnitTypePayloadFromZoneIntoUpdates(unit, updates)
        if (updates.length > 0) {
          unitsToUpdate.push({ unitId, blockDocumentId, unit, updates })
        }
      })
      const totalEditUnits = unitsToUpdate.length
      setTotalUpdates(totalEditUnits + (hasNewUnits ? newUnits.length : 0))
      setCompletedUpdates(0)
      setPendingUpdates(totalEditUnits + (hasNewUnits ? newUnits.length : 0))

      for (const { unitId, blockDocumentId, unit, updates } of unitsToUpdate) {
        setRowSaveStatus((prev) => {
          const m = new Map(prev)
          m.set(unitId, { status: 'saving' })
          return m
        })
        try {
          let codeAttempts = 0
          while (true) {
            try {
              await strapiClient.updateUnitBatch(unitId, updates, blockDocumentId)
              break
            } catch (writeErr) {
              if (isUnitCodeConflict(writeErr) && codeAttempts < 5) {
                codeAttempts++
                // Pedir el siguiente code disponible y reintentar (silencioso)
                const nameForCode = String((unit as { name?: unknown }).name ?? "")
                const nextCode = await fetchNextAvailableUnitCode(nameForCode)
                // `updates` puede tener MÁS de una entrada `code`: al editar unitNumber se
                // marcan unitNumber+name+code como pending, así que `code` se empuja en la
                // rama de unitNumber y otra vez como campo propio. updateUnitBatch hace
                // last-wins, por lo que si solo mutamos la primera, la segunda (valor viejo)
                // la sobrescribe y el PUT reenvía el code anterior → loop infinito. Hay que
                // actualizar TODAS las entradas `code`.
                const codeEntries = updates.filter((u) => u.field === "code")
                if (codeEntries.length > 0) for (const e of codeEntries) e.value = nextCode
                else updates.push({ field: "code", value: nextCode })
                ;(unit as { code?: unknown }).code = nextCode
                continue
              }
              throw writeErr
            }
          }
          if (codeAttempts > 0) setRefreshKey((k) => k + 1) // redibujar la celda code con el correlativo
          const blockIdForWebhook = blockId
          if (blockIdForWebhook) void notifyBlockCounterUpdate(String(blockIdForWebhook))
        } catch (err) {
          console.error(`Error saving unit ${unitId}:`, err)
          setRowSaveStatus((prev) => {
            const m = new Map(prev)
            m.set(unitId, { status: "error", error: err instanceof Error ? err.message : String(err) })
            return m
          })
          setSaveStatus('idle')
          setPendingUpdates(0)
          setCompletedUpdates(0)
          setTotalUpdates(0)
          // Mostrar el error al usuario: detalle de la fila + mensaje del sistema (Strapi)
          const rowNumber = dataRef.current.findIndex((u) => getUnitRowKey(u) === unitId) + 1
          showUnitSaveErrorToast({
            rowNumber,
            unitNumber: unit.unitNumber,
            model: unit.model,
            error: err,
          })
          return
        }
        clearPendingChangesForUnit(unitId)
        setRowSaveStatus((prev) => {
          const m = new Map(prev)
          m.set(unitId, { status: 'success' })
          return m
        })
        setCompletedUpdates((c) => c + 1)
        // Quitar estado de la fila tras un momento para que pase a neutro (igual que nuevas)
        const clearedUnitId = unitId
        setTimeout(() => {
          setRowSaveStatus((prev) => {
            const next = new Map(prev)
            next.delete(clearedUnitId)
            return next
          })
        }, 1500)
      }
      if (!hasNewUnits) {
        setPendingUpdates(0)
        setSaveStatus('success')
        setTimeout(() => { setSaveStatus('idle'); setTotalUpdates(0); setCompletedUpdates(0) }, 1500)
        return
      }
      // Keep total/completed as is so progress includes edit updates + new units
    }

    // 2) Create new units (existing flow)
    // Require unitNumber and model for each new unit
    const invalidUnits: Array<{ rowIndex: number; missingFields: string[] }> = []
    newUnits.forEach((unit) => {
      const rowIndex = dataRef.current.findIndex(u => u === unit) + 1
      const missing: string[] = []
      const unitNumber = String(unit.unitNumber ?? "").trim()
      const model = String(unit.model ?? "").trim()
      if (!unitNumber) missing.push("Número de unidad")
      if (!model) missing.push("Modelo")
      if (missing.length > 0) invalidUnits.push({ rowIndex, missingFields: missing })
    })
    if (invalidUnits.length > 0) {
      setValidationAlert({
        open: true,
        message: t("unitValidationRequired") || "Complete número de unidad y modelo en las filas indicadas.",
        invalidUnits
      })
      return
    }

    // Get blockId and block name from existing units or from props (when creating the first unit in a block)
    const existingUnit = dataRef.current.find(u => !isNewUnit(u))
    const resolvedBlockId = existingUnit?.block?.documentId || existingUnit?.block?.id || blockId
    const resolvedBlockName = existingUnit?.block?.name ?? blockName ?? ""

    if (!resolvedBlockId) {
      setValidationAlert({
        open: true,
        message: t('noBlockFound') || 'No se puede crear la unidad: no se encontró el bloque asociado.',
        invalidUnits: undefined
      })
      return
    }

    // Set saving status (skip if we already set it when flushing pending edits)
    if (!didFlushEdits) {
      setSaveStatus('saving')
      setTotalUpdates(newUnits.length)
      setCompletedUpdates(0)
      setPendingUpdates(newUnits.length)
    }

    // Save each unit one by one
    for (let i = 0; i < newUnits.length; i++) {
      const unit = newUnits[i]
      const unitIndex = dataRef.current.findIndex(u => u === unit)
      const rowId = getUnitRowKey(unit)
      
      // Set saving status for this row
      setRowSaveStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(rowId, { status: 'saving' })
        return newMap
      })
      
      try {
        // Prepare data for API (remove documentId, id, clientTempId — no enviar a Strapi)
        const { documentId, id, clientTempId: _clientRowOmit, ...unitData } = unit
        
        // Remove varas² fields — they exist only in memory for display, not in the database
        const varas2OnlyFields = [
          "frontVaras2", "depthVaras2", "landVaras2",
          "unitSizeVaras2", "parkingSizeVaras2", "totalSizeVaras2", "habitableConstructionVaras2",
        ]
        varas2OnlyFields.forEach((key) => {
          delete (unitData as any)[key]
        })

        // Remove flat DZ keys (e.g. "housing.balconyTerraceM2") — these are temporary mirrors
        // written by applyDimensionCascade for the toast display and must not reach the API.
        // The real DZ data lives in unitType[].
        Object.keys(unitData as any).forEach((key) => {
          if (key.includes(".")) delete (unitData as any)[key]
        })
        
        // Convert relation fields to direct ID values (required for Strapi create API)
        // parkingType, topography, unitUsage should be sent as direct string IDs
        if (unitData.parkingType) {
          const parkingTypeId = convertValueForAPI('parkingType', unitData.parkingType)
          if (parkingTypeId) {
            (unitData as any).parkingType = String(parkingTypeId)
          } else {
            delete (unitData as any).parkingType
          }
        }
        
        if (unitData.topography) {
          const topographyId = convertValueForAPI('topography', unitData.topography)
          if (topographyId) {
            (unitData as any).topography = String(topographyId)
          } else {
            delete (unitData as any).topography
          }
        }
        
        if (unitData.unitUsage) {
          const unitUsageId = convertValueForAPI('unitUsage', unitData.unitUsage)
          if (unitUsageId) {
            (unitData as any).unitUsage = String(unitUsageId)
          } else {
            delete (unitData as any).unitUsage
          }
        }

        if (unitData.unitType !== undefined && unitData.unitType !== null) {
          const ut = formatUnitTypeForStrapi(unitData.unitType)
          if (Array.isArray(ut) && ut.length > 0) {
            ;(unitData as any).unitType = ut
            delete (unitData as StrapiUnit & { type?: unknown }).type
          } else {
            delete (unitData as any).unitType
            delete (unitData as StrapiUnit & { type?: unknown }).type
          }
        }
        
        // Compute name and code in-app: name = "blockName - unitNumber", code = slugify(name)
        const unitNumberStr = String(unitData.unitNumber ?? "").trim()
        const computedName = resolvedBlockName ? `${resolvedBlockName} - ${unitNumberStr}` : unitNumberStr
        ;(unitData as any).name = computedName
        ;(unitData as any).code = slugify(computedName)
        
        // Add block to the data (required for Strapi)
        // Strapi expects block as a direct string value (documentId)
        if (resolvedBlockId) {
          (unitData as any).block = String(resolvedBlockId)
        }
        
        // Create unit via API (con retry silencioso si el code ya está tomado)
        let createdUnit: StrapiUnit
        let createCodeAttempts = 0
        while (true) {
          try {
            createdUnit = await strapiClient.createUnit(unitData)
            break
          } catch (createErr) {
            if (isUnitCodeConflict(createErr) && createCodeAttempts < 5) {
              createCodeAttempts++
              const nextCode = await fetchNextAvailableUnitCode(String((unitData as { name?: unknown }).name ?? ""))
              ;(unitData as { code?: unknown }).code = nextCode
              continue
            }
            throw createErr
          }
        }
        if (resolvedBlockId) {
          void notifyBlockCounterUpdate(String(resolvedBlockId))
        }
        // Map relation IDs to full objects for display
        // The API returns IDs or partial objects, but we need objects with 'name' property for getCellContent
        const mappedUnit: StrapiUnit = { ...createdUnit }
        delete (mappedUnit as { clientTempId?: string }).clientTempId
        
        // Map parkingType - check if it has 'name', if not, find the full object
        if (createdUnit.parkingType) {
          if (typeof createdUnit.parkingType === 'string') {
            // It's an ID string, find the full object
            const parkingTypeObj = parkingTypes.find(pt => 
              pt.documentId === createdUnit.parkingType || 
              String(pt.id) === String(createdUnit.parkingType)
            )
            if (parkingTypeObj && parkingTypeObj.name) {
              mappedUnit.parkingType = parkingTypeObj
            }
          } else if (typeof createdUnit.parkingType === 'object' && createdUnit.parkingType !== null) {
            // It's an object, check if it has 'name'
            if (!('name' in createdUnit.parkingType) || !createdUnit.parkingType.name) {
              // Object doesn't have name, find the full object
              const id = (createdUnit.parkingType as any).documentId || (createdUnit.parkingType as any).id
              if (id) {
                const parkingTypeObj = parkingTypes.find(pt => 
                  pt.documentId === String(id) || 
                  String(pt.id) === String(id)
                )
                if (parkingTypeObj && parkingTypeObj.name) {
                  mappedUnit.parkingType = parkingTypeObj
                }
              }
            }
          }
        }
        
        // Map topography - check if it has 'name', if not, find the full object
        if (createdUnit.topography) {
          if (typeof createdUnit.topography === 'string') {
            // It's an ID string, find the full object
            const topographyObj = topographies.find(t => 
              t.documentId === createdUnit.topography || 
              String(t.id) === String(createdUnit.topography)
            )
            if (topographyObj && topographyObj.name) {
              mappedUnit.topography = topographyObj
            }
          } else if (typeof createdUnit.topography === 'object' && createdUnit.topography !== null) {
            // It's an object, check if it has 'name'
            if (!('name' in createdUnit.topography) || !createdUnit.topography.name) {
              // Object doesn't have name, find the full object
              const id = (createdUnit.topography as any).documentId || (createdUnit.topography as any).id
              if (id) {
                const topographyObj = topographies.find(t => 
                  t.documentId === String(id) || 
                  String(t.id) === String(id)
                )
                if (topographyObj && topographyObj.name) {
                  mappedUnit.topography = topographyObj
                }
              }
            }
          }
        }
        // Map unitUsage - check if it has 'name', if not, find the full object
        if (createdUnit.unitUsage) {
          if (typeof createdUnit.unitUsage === 'string') {
            // It's an ID string, find the full object
            const unitUsageObj = unitUsages.find(uu => 
              uu.documentId === createdUnit.unitUsage || 
              String(uu.id) === String(createdUnit.unitUsage)
            )
            if (unitUsageObj && unitUsageObj.name) {
              mappedUnit.unitUsage = unitUsageObj
            }
          } else if (typeof createdUnit.unitUsage === 'object' && createdUnit.unitUsage !== null) {
            // It's an object, check if it has 'name'
            if (!('name' in createdUnit.unitUsage) || !createdUnit.unitUsage.name) {
              // Object doesn't have name, find the full object
              const id = (createdUnit.unitUsage as any).documentId || (createdUnit.unitUsage as any).id
              if (id) {
                const unitUsageObj = unitUsages.find(uu => 
                  uu.documentId === String(id) || 
                  String(uu.id) === String(id)
                )
                if (unitUsageObj && unitUsageObj.name) {
                  mappedUnit.unitUsage = unitUsageObj
                }
              }
            }
          }
        }
        
        // Map block - check if it has 'name', if not, use the block from existingUnit
        if (createdUnit.block) {
          if (typeof createdUnit.block === 'string') {
            // It's an ID string, use the block object from existingUnit
            if (existingUnit?.block && existingUnit.block.name) {
              mappedUnit.block = existingUnit.block
            }
          } else if (typeof createdUnit.block === 'object' && createdUnit.block !== null) {
            // It's an object, check if it has 'name'
            if (!('name' in createdUnit.block) || !createdUnit.block.name) {
              // Object doesn't have name, use the block from existingUnit
              if (existingUnit?.block && existingUnit.block.name) {
                mappedUnit.block = existingUnit.block
              }
            }
          }
        } else if (existingUnit?.block && existingUnit.block.name) {
          // If block is not returned but we know it from existingUnit, add it
          mappedUnit.block = existingUnit.block
        }
        
        // Update the unit in dataRef with the mapped unit
        if (unitIndex >= 0) {
          dataRef.current[unitIndex] = mappedUnit
          // sortedUnits is memoized on `refreshKey`; mutating dataRef[i] does not change the array
          // reference, so without a bump the grid keeps stale row objects (temp id + amber theme).
          setRefreshKey((prev) => prev + 1)
          // newUnitsCount: el efecto [refreshKey, isNewUnit] recalcula desde dataRef
        }
        
        // Clear temp-* saving key before setting success on documentId (otherwise Map keeps both keys and UI stays "saving")
        const finalRowId =
          mappedUnit.documentId ||
          (mappedUnit.id != null ? String(mappedUnit.id) : rowId)
        setRowSaveStatus((prev) => {
          const newMap = new Map(prev)
          newMap.delete(rowId)
          newMap.set(finalRowId, { status: 'success' })
          return newMap
        })
        setTimeout(() => {
          setRowSaveStatus((prev) => {
            const next = new Map(prev)
            next.delete(finalRowId)
            return next
          })
        }, 1500)
        
        // Update completed count
        setCompletedUpdates(prev => prev + 1)
        setPendingUpdates(prev => prev - 1)
      } catch (error) {
        console.error(`Error creating unit at row ${unitIndex}:`, error)

        // Set error status for this row
        const errorMessage = error instanceof Error ? error.message : String(error)
        setRowSaveStatus(prev => {
          const newMap = new Map(prev)
          newMap.set(rowId, {
            status: 'error',
            error: errorMessage
          })
          return newMap
        })

        // Mostrar el error al usuario: detalle de la fila + mensaje del sistema (Strapi)
        showUnitSaveErrorToast({
          rowNumber: unitIndex + 1,
          unitNumber: unit.unitNumber,
          model: unit.model,
          error,
        })

        // Update completed count (even on error, it's completed)
        setCompletedUpdates(prev => prev + 1)
        setPendingUpdates(prev => prev - 1)

        // Continue with next unit even if one fails
      }
    }

    // Update row count (in case it changed)
    setRowCount(dataRef.current.length)
    
    // Add to history
    addToHistory([...dataRef.current])
    
    // Set success status
    setSaveStatus('success')
    setTimeout(() => {
      setSaveStatus('idle')
      setTotalUpdates(0)
      setCompletedUpdates(0)
    }, 1500)
  }, [blockId, blockName, isNewUnit, addToHistory, convertValueForAPI, parkingTypes, topographies, unitUsages, t])

  // Guard: if saving >5 rows, show confirmation dialog with math challenge; otherwise run save
  /**
   * Filas fuera de rango **entre las que se van a guardar** (con edición pendiente o nuevas).
   * Se confirma lo que se va a persistir, no se auditan datos viejos del bloque.
   */
  const outOfRangeRowsBeingSaved = useMemo(() => {
    const rows: Array<{ rowIndex: number; label: string; fields: string[] }> = []
    dataRef.current.forEach((unit, index) => {
      const rowKey = getUnitRowKey(unit)
      if (!rowKey) return
      const isPending = (pendingChanges.get(rowKey)?.size ?? 0) > 0
      if (!isPending && !isNewUnit(unit)) return
      const fields = OUT_OF_RANGE_FIELDS.filter((field) =>
        gridStats.outOfRange.has(outOfRangeKey(rowKey, field))
      )
      if (fields.length === 0) return
      rows.push({
        rowIndex: index + 1,
        label: String(unit.unitNumber ?? unit.name ?? rowKey),
        fields: [...fields],
      })
    })
    return rows
  }, [gridStats, pendingChanges, isNewUnit])

  /** Segundo tramo del guardado: confirmación por volumen (más de 5 filas) y guardado. */
  const continueSaveAfterOutOfRange = useCallback(() => {
    const total = newUnitsCount + pendingChanges.size
    if (total > 5) {
      setSaveConfirmDialog({
        open: true,
        totalRows: total,
        step: 'confirm',
        mathAnswer: '',
        mathError: false,
      })
      return
    }
    handleSave()
  }, [newUnitsCount, pendingChanges.size, handleSave])

  /**
   * Compuertas encadenadas, no fusionadas: fuera de rango pregunta por la plausibilidad de
   * los valores y la de volumen por la cantidad de filas. Son dos preguntas distintas.
   */
  const handleSaveClick = useCallback(() => {
    if (outOfRangeRowsBeingSaved.length > 0) {
      setOutOfRangeDialog({ open: true, rows: outOfRangeRowsBeingSaved })
      return
    }
    continueSaveAfterOutOfRange()
  }, [outOfRangeRowsBeingSaved, continueSaveAfterOutOfRange])

  // Generate random sum 5..20 and two addends (for math challenge)
  const generateMathChallenge = useCallback(() => {
    const sum = 5 + Math.floor(Math.random() * 16) // 5..20
    const a = 1 + Math.floor(Math.random() * (sum - 1)) // 1..sum-1
    const b = sum - a
    return { a, b, sum }
  }, [])

  // Get cells for selection (for copy functionality)
  // Using the simple approach: pass true to use getCellContent automatically
  // This is less efficient but simpler and works correctly

  // Handle sync/refresh
  const handleSync = useCallback(() => {
    // Check if there are unsaved new units
    const newUnits = dataRef.current.filter(unit => isNewUnit(unit))
    
    if (newUnits.length > 0) {
      // Show confirmation dialog
      setSyncConfirmDialog({ open: true })
    } else {
      // No unsaved changes, refresh directly
      performSync()
    }
  }, [isNewUnit])

  // Perform the actual sync/refresh
  const performSync = useCallback(async () => {
    // Close dialog if open
    setSyncConfirmDialog({ open: false })
    
    // If onRefresh callback is provided, use it (parent component will handle the API call)
    if (onRefresh) {
      await onRefresh()
      return
    }
    
    // Otherwise, try to reload units directly from API
    // Get blockId from existing units
    const existingUnit = dataRef.current.find(u => !isNewUnit(u))
    const blockId = existingUnit?.block?.documentId || existingUnit?.block?.id
    
    if (blockId) {
      try {
        // Load units from API (same as when block changes)
        const unitsRes = await strapiClient.getUnitsAllPages({
          blockDocumentId: String(blockId),
          pageSize: 200,
        })
        
        // Reset dataRef with fresh units from API; sync formula fields so they exist in memory and persist on save
        dataRef.current = unitsRes.data || []
        dataRef.current.forEach((u) => ensureUnitFormulasSynced(u as Record<string, unknown>, { collectionDate: blockCollectionDate, startDate: blockStartDate }, isVerticalRef.current, unitVatRates(u as any), isLoteRef.current, countryIsoRef.current, industrialKindRef.current))

        // Reset row count
        setRowCount(dataRef.current.length)
        
        // Clear row save status
        setRowSaveStatus(new Map())
        
        // Reset save status
        setSaveStatus('idle')
        setPendingUpdates(0)
        setTotalUpdates(0)
        setCompletedUpdates(0)
        
        // Clear history
        setHistory([])
        setHistoryIndex(-1)
        
        // Force refresh
        setRefreshKey(prev => prev + 1)
      } catch (error) {
        console.error('Error syncing units:', error)
        // On error, still reset with current props
        dataRef.current = units
        dataRef.current.forEach((u) => ensureUnitFormulasSynced(u as Record<string, unknown>, { collectionDate: blockCollectionDate, startDate: blockStartDate }, isVerticalRef.current, unitVatRates(u as any), isLoteRef.current, countryIsoRef.current, industrialKindRef.current))
        setRowCount(units.length)
        setRefreshKey(prev => prev + 1)
      }
    } else {
      // No blockId found, just reset with current props
      dataRef.current = units
      dataRef.current.forEach((u) => ensureUnitFormulasSynced(u as Record<string, unknown>, { collectionDate: blockCollectionDate, startDate: blockStartDate }, isVerticalRef.current, unitVatRates(u as any), isLoteRef.current, countryIsoRef.current, industrialKindRef.current))
      setRowCount(units.length)
      setRefreshKey(prev => prev + 1)
    }
  }, [units, onRefresh, isNewUnit])

  /** Índice en `dataRef.current` para la fila visual del grid (tras filtro y orden).
   *  Usa documentId/id como clave primaria para tolerar reemplazos de dataRef.current
   *  con nuevos objetos JavaScript (p.ej. recargas del servidor). */
  const gridRowToDataRefIndex = useCallback((gridRow: number): number => {
    const u = sortedUnits[gridRow]
    if (u === undefined) return -1
    const uid = getUnitRowKey(u as StrapiUnit)
    if (uid) {
      const idx = dataRef.current.findIndex((x) => getUnitRowKey(x as StrapiUnit) === uid)
      if (idx !== -1) return idx
    }
    // fallback para unidades nuevas sin documentId (comparación por referencia)
    return dataRef.current.findIndex((x) => x === u)
  }, [sortedUnits])

  // Generic handler for dropdown field selection
  const handleDropdownSelect = useCallback((value: string, cell: Item, field: string) => {
    const [col, row] = cell
    const originalRow = gridRowToDataRefIndex(row)
    const unit = originalRow >= 0 ? dataRef.current[originalRow] : undefined
    if (!unit) return

    const dzEnumCol = resolveUnitTypeDynamicColumn(field)
    if (dzEnumCol?.def.gridType === "enum" && dzEnumCol.def.enumValues?.length) {
      const apiValue =
        dzEnumCol.segment === "offices"
          ? matchPickedToDzEnum(dzEnumCol.def.enumValues, value, (v) =>
              t(`column.offices.enum.${dzEnumCol.gridKey}.${dzEnumApiValueToMessageKeySuffix(v)}`)
            )
          : matchPickedToDzEnum(dzEnumCol.def.enumValues, value, (v) => v)
      if (apiValue === undefined) {
        setActiveDropdown(null)
        return
      }
      if (!unitTypeDynamicAppliesToRow(unit, field)) {
        setActiveDropdown(null)
        return
      }
      const unitIndex = dataRef.current.findIndex(
        (u) => (getUnitRowKey(u)) === (getUnitRowKey(unit))
      )
      if (unitIndex < 0) {
        setActiveDropdown(null)
        return
      }
      const appliedDzEnum = applyUnitTypeDynamicLocalChange(dataRef.current[unitIndex], field, apiValue, {
        source: "grid",
        roundTo2,
      })
      if (!appliedDzEnum) {
        setActiveDropdown(null)
        return
      }
      if (!isNewUnit(unit)) {
        const unitId = getUnitRowKey(unit)
        addPendingChangeMirrored(unitId, field)
      }
      addToHistory([...dataRef.current])
      setRefreshKey((prev) => prev + 1)
      setActiveDropdown(null)
      return
    }

    let selectedItem: CatalogItem | null = null

    // Find the selected item based on field type
    if (field === "topography") {
      selectedItem = topographies.find(t => t.name === value) || null
    } else if (field === "parkingType") {
      selectedItem = parkingTypes.find(pt => pt.name === value) || null
    } else if (field === "unitUsage") {
      selectedItem = unitUsages.find(uu => uu.name === value) || null
    }

    if (!selectedItem && field !== "availability" && field !== "unitType") return

    // Update the unit optimistically
    const unitIndex = dataRef.current.findIndex(u => (getUnitRowKey(u)) === (getUnitRowKey(unit)))
    if (unitIndex >= 0) {
      const updatedUnit = { ...dataRef.current[unitIndex] }
      
      if (field === "topography" && selectedItem) {
        updatedUnit.topography = {
          documentId: selectedItem.documentId || String(selectedItem.id || ""),
          id: selectedItem.id,
          name: selectedItem.name,
          code: selectedItem.code,
        }
      } else if (field === "parkingType" && selectedItem) {
        updatedUnit.parkingType = {
          documentId: selectedItem.documentId || String(selectedItem.id || ""),
          id: selectedItem.id,
          name: selectedItem.name,
          code: selectedItem.code,
        }
      } else if (field === "unitUsage" && selectedItem) {
        updatedUnit.unitUsage = {
          documentId: selectedItem.documentId || String(selectedItem.id || ""),
          id: selectedItem.id,
          name: selectedItem.name,
          code: selectedItem.code,
        }
      } else if (field === "availability") {
        updatedUnit.availability = value as "Available" | "Not Available" | undefined
        syncUnitAbsorption(updatedUnit as any, blockCollectionDate, blockStartDate)
        syncUnitAbsorptionPerM2(updatedUnit as any)
      } else if (field === "unitType") {
        const comp = labelToComponent(value, unitTypeLabels)
        if (comp) {
          updatedUnit.unitType = [emptyUnitTypeEntry(comp)]
          delete (updatedUnit as StrapiUnit & { type?: unknown }).type
        } else {
          delete updatedUnit.unitType
          delete (updatedUnit as StrapiUnit & { type?: unknown }).type
        }
      }

      dataRef.current[unitIndex] = updatedUnit
      if (field === "availability") {
        const unitId = getUnitRowKey(unit)
        addPendingChange(unitId, "unitAbsorption")
        addPendingChange(unitId, "absorptionPerM2")
      }
      // No need to force refresh - grid will update automatically via getCellContent
    }

    // No auto-save: for existing units add to pending changes; Save button will flush to API
    if (!isNewUnit(unit)) {
      const unitId = getUnitRowKey(unit)
      addPendingChangeMirrored(unitId, field)
    }
    addToHistory([...dataRef.current])
    setRefreshKey(prev => prev + 1)

    // Close dropdown
    setActiveDropdown(null)
  }, [topographies, parkingTypes, unitUsages, unitTypeLabels, isNewUnit, addPendingChange, addToHistory, blockCollectionDate, blockStartDate, t, unitTypeDynamicAppliesToRow, gridRowToDataRefIndex])

  // Get current value for dropdown based on field
  const getDropdownValue = useCallback((cell: Item, field: string): string | undefined => {
    const [col, row] = cell
    const unit = row >= 0 && row < sortedUnits.length ? sortedUnits[row] : undefined
    if (!unit) return undefined

    const dzEnumField = resolveUnitTypeDynamicColumn(field)
    if (dzEnumField?.def.gridType === "enum" && dzEnumField.def.enumValues && dzEnumField.segment === "offices") {
      const raw = readUnitTypeDynamicValue(unit, field)
      if (raw == null || raw === "") return undefined
      const api = String(raw)
      return t(`column.offices.enum.${dzEnumField.gridKey}.${dzEnumApiValueToMessageKeySuffix(api)}`)
    }

    if (field === "topography") {
      return unit.topography?.name
    } else if (field === "parkingType") {
      return unit.parkingType?.name
    } else if (field === "unitUsage") {
      return unit.unitUsage?.name
    } else if (field === "availability") {
      // Map availability values to display labels
      const value = unit.availability
      return value === "Available" ? "Disponible" : 
             value === "Not Available" ? "No Disponible" : 
             value
    } else if (field === "unitType") {
      return getUnitTypeDisplayLabel(unit, unitTypeLabels)
    }
    return undefined
  }, [unitTypeLabels, sortedUnits, t])

  // Get options for dropdown based on field
  const getDropdownOptions = useCallback((field: string): string[] => {
    if (field === "topography") {
      return topographies.map(t => t.name || "").filter(Boolean)
    } else if (field === "parkingType") {
      return parkingTypes.map(pt => pt.name || "").filter(Boolean)
    } else if (field === "unitUsage") {
      return unitUsages.map(uu => uu.name || "").filter(Boolean)
    } else if (field === "availability") {
      return ["Disponible", "No Disponible"]
    } else if (field === "unitType") {
      return [unitTypeLabels.residential, unitTypeLabels.office, unitTypeLabels.industrial]
    }
    const dzEnumOpts = resolveUnitTypeDynamicColumn(field)
    if (
      dzEnumOpts?.def.gridType === "enum" &&
      dzEnumOpts.def.enumValues &&
      dzEnumOpts.segment === "offices"
    ) {
      return dzEnumOpts.def.enumValues.map((v) =>
        t(`column.offices.enum.${dzEnumOpts.gridKey}.${dzEnumApiValueToMessageKeySuffix(v)}`)
      )
    }
    return []
  }, [topographies, parkingTypes, unitUsages, unitTypeLabels, t])

  // Get cell info for dropdown display
  const getDropdownCellInfo = useCallback((cell: Item | null, field: string) => {
    if (!cell) return undefined
    const [col, row] = cell
    const unit = row >= 0 && row < sortedUnits.length ? sortedUnits[row] : undefined
    if (!unit) return undefined

    return {
      fieldName: getFieldDisplayName(field),
      unitName: unit.name,
      unitCode: unit.code,
      rowNumber: row,
    }
  }, [getFieldDisplayName, sortedUnits])

  // Colors the row-number marker amber when the row has unsaved pending changes
  // Colors the row-number marker when the row has unsaved pending changes.
  // bgCell applies to all cells; cells with their own themeOverride (pending cells)
  // override this with the stronger yellow. textLight colors the row number text.
  // Tints all text in modified rows amber so any pending change is visually obvious
  // even before looking at specific cells.
  const getRowThemeOverride = useCallback((row: number): Partial<{ textDark: string; textMedium: string; textLight: string }> | undefined => {
    const unit = sortedUnits[row]
    if (!unit) return undefined
    const unitId = getUnitRowKey(unit as StrapiUnit)
    if ((pendingChanges.get(unitId)?.size ?? 0) > 0) {
      return { textDark: "#d97706", textMedium: "#d97706", textLight: "#d97706" }
    }
    return undefined
  }, [sortedUnits, pendingChanges])

  // Get cell content (col is index into visibleColumns — the grid only has visible columns)
  const getCellContent = useCallback((cell: Item): GridCell => {
    // Use sorted units if sorting is active, otherwise use dataRef.current
    const unitsToUse = sortedUnits
    const [col, row] = cell
    const column = visibleColumns[col]
    const unit = unitsToUse[row]
    const isNew = unit ? isNewUnit(unit) : false

    if (!unit || !column) {
      return {
        kind: GridCellKind.Text,
        data: "",
        displayData: "",
        allowOverlay: false,
      }
    }

    const key = column.id as string
    if (!key) {
      return {
        kind: GridCellKind.Text,
        data: "",
        displayData: "",
        allowOverlay: false,
      }
    }
    
    const rowId = getUnitRowKey(unit)
    const saveStatusInfo = rowId ? rowSaveStatus.get(rowId) : undefined
    
    // Check if this specific cell has an error or is being saved
    const cellKey = `${row}:${col}`
    const cellError = cellErrors.get(cellKey)
    const isCellSaving = savingCells.has(cellKey)
    
    // Theme override for cells being saved - Blue/cyan to indicate in-progress (highest priority)
    const cellSavingTheme = isCellSaving ? {
      bgCell: "#dbeafe", // Light blue background
      textDark: "#1e40af", // Dark blue text for excellent contrast
    } : undefined
    
    // Theme override for cells with errors - Red with good contrast
    const cellErrorTheme = cellError ? {
      bgCell: "#fee2e2", // Light red background
      textDark: "#991b1b", // Dark red text for excellent contrast
    } : undefined
    
    // Theme override for new rows (pending create) - Soft amber
    const newRowTheme = isNew ? {
      bgCell: "#fef3c7",
      textDark: "#92400e",
    } : undefined
    
    // Theme override for cells with unsaved edits (no auto-save) — per-cell, not full row.
    // El amarillo refleja también las contrapartes: una columna varas² o de moneda foránea
    // se marca si su campo base (m² / USD) está pendiente, para que el espejo se vea marcado
    // al cambiar de unidad o moneda (completando la sincronización visual).
    const unitId = getUnitRowKey(unit)
    const pendingSet = pendingChanges.get(unitId)
    const pendingVarasBase = varasToM2Map[key as keyof typeof varasToM2Map] as string | undefined
    const pendingCurrencyBase = currencyToUsdMap[key]
    const isCellPendingEdit = !!pendingSet && (
      pendingSet.has(key) ||
      (pendingVarasBase ? pendingSet.has(pendingVarasBase) : false) ||
      (pendingCurrencyBase ? pendingSet.has(pendingCurrencyBase) : false)
    )
    const modifiedRowTheme = isCellPendingEdit ? {
      bgCell: "#fef3c7",
      textDark: "#92400e",
    } : undefined
    
    // Theme override for saving rows - Blue/cyan to indicate in-progress
    const savingRowTheme = saveStatusInfo?.status === 'saving' ? {
      bgCell: "#dbeafe", // Light blue background
      textDark: "#1e40af", // Dark blue text for excellent contrast
    } : undefined
    
    // Theme override for error rows - Red with good contrast
    const errorRowTheme = saveStatusInfo?.status === 'error' ? {
      bgCell: "#fee2e2", // Light red background
      textDark: "#991b1b", // Dark red text for excellent contrast
    } : undefined

    // Valor fuera de rango (ver gridStats.outOfRange). Alcanza también a la columna
    // equivalente en moneda extranjera resolviendo su campo base en USD.
    const outOfRangeBase = currencyToUsdMap[key] ?? key
    const isCellOutOfRange = gridStats.outOfRange.has(outOfRangeKey(unitId, outOfRangeBase))
    // Naranja pleno mientras el valor está sin guardar —el momento de atrapar el tipeo— y
    // atenuado una vez persistido: la marca sigue siendo veraz y auditable, pero deja de
    // gritar cuando el usuario ya confirmó que el valor va así.
    const outOfRangeTheme = isCellOutOfRange
      ? (isCellPendingEdit || isNew
          ? { bgCell: "#fed7aa", textDark: "#9a3412" }
          : { bgCell: "#ffedd5", textDark: "#9a3412" })
      : undefined

    // Success = sin tema (neutro). No se muestra verde.
    // Prioridad: los estados transitorios de guardado no pueden quedar ocultos, pero el
    // fuera de rango va por encima de pendiente/nueva — el punto es verlo al escribirlo.
    const rowTheme = cellSavingTheme || cellErrorTheme || errorRowTheme || savingRowTheme || outOfRangeTheme || newRowTheme || modifiedRowTheme

    const isReadonly =
      isFieldReadonly(key) ||
      isParkingDependentReadonly(key, unit as Record<string, unknown>)
    const cellTheme = mergeReadonlyCellTheme(rowTheme, isReadonly)

    // Handle documentId with RowIDCell; super admin: link al Content Manager de Strapi
    if (key === "documentId") {
      let data: string
      if (isNew) {
        if (saveStatusInfo?.status === 'saving') {
          data = t('saving') || "Guardando..."
        } else if (saveStatusInfo?.status === 'error') {
          data = `${t('error') || "Error"}: ${saveStatusInfo.error || "Error al guardar"}`
        } else {
          const rk = getUnitRowKey(unit)
          data = rk || (t('pending') || "Pendiente")
        }
      } else {
        data = getUnitRowKey(unit) || ""
      }
      const rawDoc = (unit.documentId ?? "").trim()
      const docIdForAdmin = rawDoc && !isClientTempRowKey(rawDoc) ? rawDoc : ""
      if (!isNew && isSuperAdmin && docIdForAdmin.length > 0) {
        const adminEntryUrl = `${getStrapiPublicBaseUrl()}/admin/content-manager/collection-types/api::unit.unit/${encodeURIComponent(docIdForAdmin)}`
        return {
          kind: GridCellKind.Uri,
          data: adminEntryUrl,
          displayData: data,
          allowOverlay: false,
          readonly: true,
          hoverEffect: true,
          copyData: data,
          themeOverride: cellTheme,
          /** Glide solo marca zona clicable y llama esto; no abre `data` solo */
          onClickUri: ({ preventDefault }) => {
            preventDefault()
            globalThis.window?.open(adminEntryUrl, "_blank", "noopener,noreferrer")
          },
        } satisfies UriCell
      }
      return {
        kind: GridCellKind.RowID,
        data: data,
        themeOverride: cellTheme,
      } as RowIDCell
    }

    // Handle code with RowIDCell
    if (key === "code") {
      const data = String(unit.code || "")
      return {
        kind: GridCellKind.RowID,
        data: data,
        themeOverride: cellTheme,
      } as RowIDCell
    }

    // Handle name with RowIDCell; super admin: mismo enlace que documentId (texto visible = nombre)
    if (key === "name") {
      const data = String(unit.name || "")
      const docIdForAdmin = (unit.documentId ?? "").trim()
      if (!isNew && isSuperAdmin && docIdForAdmin.length > 0) {
        const adminEntryUrl = `${getStrapiPublicBaseUrl()}/admin/content-manager/collection-types/api::unit.unit/${encodeURIComponent(docIdForAdmin)}`
        return {
          kind: GridCellKind.Uri,
          data: adminEntryUrl,
          displayData: data,
          allowOverlay: false,
          readonly: true,
          hoverEffect: true,
          copyData: data,
          themeOverride: cellTheme,
          onClickUri: ({ preventDefault }) => {
            preventDefault()
            globalThis.window?.open(adminEntryUrl, "_blank", "noopener,noreferrer")
          },
        } satisfies UriCell
      }
      return {
        kind: GridCellKind.RowID,
        data: data,
        themeOverride: cellTheme,
      } as RowIDCell
    }

    // Handle legacyId with RowIDCell
    if (key === "legacyId") {
      const data = String(unit.legacyId || "")
      return {
        kind: GridCellKind.RowID,
        data: data,
        themeOverride: cellTheme,
      } as RowIDCell
    }

    // Handle block with RowIDCell
    if (key === "block") {
      const data = String(unit.block?.name || "")
      return {
        kind: GridCellKind.RowID,
        data: data,
        themeOverride: cellTheme,
      } as RowIDCell
    }

    let value = getNestedValue(unit, key)

    // Handle boolean fields with BooleanCell
    if (key === "hasParking" || key === "hasMotorcycleParking") {
      const boolValue = value === true || value === "true" || value === "1" || value === "Sí" || value === "Si"
      return {
        kind: GridCellKind.Boolean,
        data: boolValue,
        readonly: isReadonly,
        themeOverride: cellTheme,
      } as BooleanCell
    }

    const dzParsed = resolveUnitTypeDynamicColumn(key)
    if (dzParsed) {
      const isBalconyKey = key === "housing.balconyTerraceM2" || key === "offices.balconyTerraceM2"
      const dzInactive = !unitTypeDynamicAppliesToRow(unit, key) && !(isVerticalRef.current && isBalconyKey)
      const ro = isReadonly || dzInactive
      const cellThemeDz = mergeReadonlyCellTheme(rowTheme, ro)
      const raw = readUnitTypeDynamicValue(unit, key)
      if (dzParsed.def.gridType === "boolean") {
        const boolValue = raw === true || raw === "true" || raw === "1"
        return {
          kind: GridCellKind.Boolean,
          data: boolValue,
          readonly: ro,
          themeOverride: cellThemeDz,
        } as BooleanCell
      }
      if (dzParsed.def.gridType === "number") {
        const numValue = raw === null || raw === undefined ? 0 : Number(raw) || 0
        return {
          kind: GridCellKind.Number,
          data: numValue,
          displayData: numValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
          allowOverlay: !ro,
          readonly: ro,
          themeOverride: cellThemeDz,
        } as NumberCell
      }
      if (dzParsed.def.gridType === "enum" && dzParsed.def.enumValues && dzParsed.segment === "offices") {
        const api = String(raw ?? "")
        const label =
          api
            ? t(`column.offices.enum.${dzParsed.gridKey}.${dzEnumApiValueToMessageKeySuffix(api)}`)
            : ""
        return {
          kind: GridCellKind.Text,
          data: api,
          displayData: api ? `▼ ${label}` : "▼ ",
          allowOverlay: false,
          readonly: ro,
          themeOverride: cellThemeDz,
        }
      }
      const displayValue = String(raw ?? "")
      return {
        kind: GridCellKind.Text,
        data: displayValue,
        displayData: displayValue,
        allowOverlay: !ro,
        readonly: ro,
        themeOverride: cellThemeDz,
      }
    }

    // Varas² columns (visual; prefer stored visual value if present)
    if (varasToM2Map[key as keyof typeof varasToM2Map]) {
      const m2Key = varasToM2Map[key as keyof typeof varasToM2Map]
      const storedVaras = (unit as any)[key]
      let m2Value = Number(unit[m2Key] || 0)
      if (m2Key === "parkingSizeM2" && (unit as any).parkingSpaces != null && !Number.isNaN(Number((unit as any).parkingSpaces))) {
        m2Value = Number((unit as any).parkingSpaces) * PARKING_M2_PER_SPACE
      }
      if (m2Key === "totalSizeM2") {
        // Total ya viene sincronizado (= habitable + parqueo si vertical). Usar el valor almacenado.
        m2Value = Number((unit as any).totalSizeM2) || 0
      }
      if (m2Key === "habitableConstructionM2") {
        m2Value = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
      }
      const varasValue = roundTo2(typeof storedVaras === "number" ? storedVaras : m2Value * getVarasFactor(key))
      return {
        kind: GridCellKind.Number,
        data: varasValue,
        displayData: varasValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
        allowOverlay: !isReadonly,
        readonly: isReadonly,
        themeOverride: cellTheme,
      } as NumberCell
    }

    // Handle currency columns (non-USD) - convert from USD
    const usdFields = DATASHEET_CONFIG.fields.usdPriceFields
    
    // Check if this is a currency field (not USD)
    for (const currency of activeCurrencies) {
      const currencyCode = currency.code.toLowerCase()
      for (const usdField of usdFields) {
        const currencyField = usdField.replace('USD', currencyCode.toUpperCase())
        if (key === currencyField) {
          const canPreferStoredForeign =
            DATASHEET_CONFIG.foreignCurrency.preferStoredForeignValue.includes(usdField) &&
            currency.code.toUpperCase() === editingCurrency.toUpperCase()
          if (canPreferStoredForeign) {
            const stored = (unit as any)[currencyField]
            if (typeof stored === "number" && Number.isFinite(stored)) {
              const currencyValue = roundTo2(stored)
              return {
                kind: GridCellKind.Number,
                data: currencyValue,
                displayData: currencyValue.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                }),
                allowOverlay: !isReadonly,
                readonly: isReadonly,
                themeOverride: cellTheme,
              } as NumberCell
            }
          }
          // Get the USD value (with fallback for computed price fields)
          const unitVr = unitVatRates(unit as any)
          let usdValue = getNestedValue(unit, usdField)
          let usdNum = usdValue === null || usdValue === undefined ? 0 : Number(usdValue) || 0
          if (!usdNum && usdField === "priceWithoutVATUSD" && (unit as any).totalPriceUSD != null) {
            usdNum = roundTo2(removeVat(Number((unit as any).totalPriceUSD), unitVr.sale))
          }
          if (usdField === "pricePerM2USD") {
            const withoutVat = usdNum || (Number((unit as any).priceWithoutVATUSD) || removeVat(Number((unit as any).totalPriceUSD) || 0, unitVr.sale))
            const hab = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
            if (hab > 0 && !usdNum) usdNum = roundTo2(withoutVat / hab)
          }
          if (!usdNum && usdField === "rentalPriceWithoutVATUSD" && (unit as any).rentalPriceUSD != null) {
            usdNum = roundTo2(removeVat(Number((unit as any).rentalPriceUSD), unitVr.rent))
          }
          if (usdField === "rentalPricePerM2WithoutVATUSD") {
            const withoutVat = usdNum || (Number((unit as any).rentalPriceWithoutVATUSD) || removeVat(Number((unit as any).rentalPriceUSD) || 0, unitVr.rent))
            const hab = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
            if (hab > 0 && !usdNum) usdNum = roundTo2(withoutVat / hab)
          }
          if (usdField === "maintenanceWithoutVATUSD") {
            // Usar valor guardado si existe (usuario lo editó), sino computar desde total
            if (!usdNum) usdNum = maintenanceWithoutVatUsd(unit as any, unitVr)
          }
          if (usdField === "maintenancePricePerM2USD") {
            const w = Number((unit as any).maintenanceWithoutVATUSD) || maintenanceWithoutVatUsd(unit as any, unitVr)
            const hab = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
            if (hab > 0 && !usdNum) usdNum = roundTo2(w / hab)
          }
          if (usdField === "installmentUSD") {
            const pwo = Number((unit as any).priceWithoutVATUSD) || removeVat(Number((unit as any).totalPriceUSD) || 0, unitVr.sale)
            if (!usdNum) usdNum = calcInstallmentFromPriceWithoutVAT(pwo, countryIsoRef.current)
          }
          if (usdField === "incomeUSD" && !usdNum) {
            const inst = Number((unit as any).installmentUSD) || calcInstallmentFromPriceWithoutVAT(Number((unit as any).priceWithoutVATUSD) || removeVat(Number((unit as any).totalPriceUSD) || 0, unitVr.sale), countryIsoRef.current)
            usdNum = roundTo2(inst * 4)
          }
          // Convert to currency using buyRate (max 2 decimales)
          const currencyValue = roundTo2(usdNum * getBuyRate(currency.code))
          return {
            kind: GridCellKind.Number,
            data: currencyValue,
            displayData: currencyValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
            allowOverlay: !isReadonly,
            readonly: isReadonly,
            themeOverride: cellTheme,
          } as NumberCell
        }
      }
    }

    // Handle number fields with NumberCell
    const numberFields = [
      "frontM2", "depthM2", "landM2",
      "unitSizeM2", "parkingSizeM2",
      "totalSizeM2", "habitableConstructionM2",
      "bathrooms", "parkingSpaces",
      "totalPriceUSD", "priceWithoutVATUSD",
      "pricePerM2USD",
      "rentalPriceUSD", "rentalPriceWithoutVATUSD",
      "rentalPricePerM2WithoutVATUSD",
      "maintenanceTotalPriceM2USD",
      "maintenanceWithoutVATUSD",
      "maintenancePricePerM2USD",
      "installmentUSD", "incomeUSD",
      "unitAbsorption", "absorptionPerM2"
    ]

    if (numberFields.includes(key)) {
      let numValue = value === null || value === undefined ? 0 : Number(value) || 0
      if (key === "parkingSizeM2" && (unit as any).parkingSpaces != null && !Number.isNaN(Number((unit as any).parkingSpaces))) {
        numValue = Number((unit as any).parkingSpaces) * PARKING_M2_PER_SPACE
      }
      if (key === "totalSizeM2") {
        // Total ya viene sincronizado (= habitable + parqueo si vertical). Mostrar el valor almacenado.
        numValue = Number((unit as any).totalSizeM2) || 0
      }
      if (key === "habitableConstructionM2") {
        numValue = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
      }
      const unitVr2 = unitVatRates(unit as any)
      if (key === "priceWithoutVATUSD" && !numValue && (unit as any).totalPriceUSD != null) {
        numValue = roundTo2(removeVat(Number((unit as any).totalPriceUSD), unitVr2.sale))
      }
      if (key === "pricePerM2USD") {
        const withoutVat = Number((unit as any).priceWithoutVATUSD) || removeVat(Number((unit as any).totalPriceUSD) || 0, unitVr2.sale)
        const hab = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
        if (hab > 0) numValue = numValue || roundTo2(withoutVat / hab)
      }
      if (key === "rentalPriceWithoutVATUSD" && !numValue && (unit as any).rentalPriceUSD != null) {
        numValue = roundTo2(removeVat(Number((unit as any).rentalPriceUSD), unitVr2.rent))
      }
      if (key === "rentalPricePerM2WithoutVATUSD") {
        const withoutVat = Number((unit as any).rentalPriceWithoutVATUSD) || removeVat(Number((unit as any).rentalPriceUSD) || 0, unitVr2.rent)
        const hab = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
        if (hab > 0) numValue = numValue || roundTo2(withoutVat / hab)
      }
      if (key === "maintenanceWithoutVATUSD") {
        // Usar valor guardado si existe (usuario lo editó), sino computar desde total
        if (!numValue) numValue = maintenanceWithoutVatUsd(unit as any, unitVr2)
      }
      if (key === "maintenancePricePerM2USD") {
        const w = Number((unit as any).maintenanceWithoutVATUSD) || maintenanceWithoutVatUsd(unit as any, unitVr2)
        const hab = Number((unit as any).habitableConstructionM2) || Number((unit as any).unitSizeM2) || 0
        if (hab > 0) numValue = numValue || roundTo2(w / hab)
      }
      if (key === "installmentUSD") {
        const pwo = Number((unit as any).priceWithoutVATUSD) || removeVat(Number((unit as any).totalPriceUSD) || 0, unitVr2.sale)
        numValue = numValue || calcInstallmentFromPriceWithoutVAT(pwo, countryIsoRef.current)
      }
      if (key === "incomeUSD") {
        const inst = Number((unit as any).installmentUSD) || calcInstallmentFromPriceWithoutVAT(Number((unit as any).priceWithoutVATUSD) || removeVat(Number((unit as any).totalPriceUSD) || 0, unitVr2.sale), countryIsoRef.current)
        numValue = numValue || roundTo2(inst * 4)
      }
      if (key === "unitAbsorption" && numValue === 0 && blockCollectionDate && blockStartDate) {
        const availability = (unit as any).availability
        if (availability === "Not Available" || availability === "No Disponible") {
          const collection = new Date(blockCollectionDate).getTime()
          const start = new Date(blockStartDate).getTime()
          const diffDays = (collection - start) / (24 * 60 * 60 * 1000)
          if (diffDays > 0) numValue = 1 / (diffDays / 30)
        }
      }
      if (key === "absorptionPerM2" && numValue === 0) {
        const absorption = Number((unit as any).unitAbsorption) || 0
        const habitable = Number((unit as any).habitableConstructionM2) ?? Number((unit as any).unitSizeM2) ?? 0
        if (absorption > 0 && habitable > 0) numValue = absorption * habitable
      }
      const fracDigits = (key === "unitAbsorption" || key === "absorptionPerM2") ? 12 : 2
      return {
        kind: GridCellKind.Number,
        data: numValue,
        displayData: numValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: fracDigits }),
        allowOverlay: !isReadonly,
        readonly: isReadonly,
        themeOverride: cellTheme,
      } as NumberCell
    }

    // Handle dropdown fields (parkingType, unitUsage, topography, availability) with TextCell and dropdown indicator
    if (key === "parkingType") {
      const parkingTypeName = unit.parkingType?.name || ""
      return {
        kind: GridCellKind.Text,
        data: parkingTypeName,
        displayData: `▼ ${parkingTypeName}`,
        allowOverlay: false,
        readonly: isReadonly,
        themeOverride: cellTheme,
      }
    }

    if (key === "unitUsage") {
      const unitUsageName = unit.unitUsage?.name || ""
      return {
        kind: GridCellKind.Text,
        data: unitUsageName,
        displayData: `▼ ${unitUsageName}`,
        allowOverlay: false,
        readonly: isReadonly,
        themeOverride: cellTheme,
      }
    }

    if (key === "unitType") {
      const label = getUnitTypeDisplayLabel(unit, unitTypeLabels)
      return {
        kind: GridCellKind.Text,
        data: label,
        displayData: `▼ ${label}`,
        allowOverlay: false,
        readonly: isReadonly,
        themeOverride: cellTheme,
      }
    }

    if (key === "topography") {
      const topographyName = unit.topography?.name || ""
      return {
        kind: GridCellKind.Text,
        data: topographyName,
        displayData: `▼ ${topographyName}`,
        allowOverlay: false,
        readonly: isReadonly,
        themeOverride: cellTheme,
      }
    }

    if (key === "blockCategory") {
      // La burbuja lleva dos cosas: la categoría real del warehouse y lo que el
      // motor hace con ella. La segunda salía de re-probar el texto buscando la
      // palabra "horizontal", así que un bloque "Bodegas" —que YA se calcula
      // horizontal— se rotulaba "Desconocido". Ahora sale de los refs que usan
      // las fórmulas, que es la única forma de que no puedan discrepar.
      const typeLabel = blockBehavior(isVerticalRef.current, isLoteRef.current)
      return {
        kind: GridCellKind.Bubble,
        data: blockCategory ? [blockCategory, typeLabel] : [typeLabel],
        allowOverlay: false,
        themeOverride: cellTheme,
      }
    }

    if (key === "pais") {
      const name = blockCountry?.name || ""
      const flag = countryFlag(blockCountry?.isoCode2 || blockCountry?.code)
      const display = name ? (flag ? `${flag} ${name}` : name) : "—"
      return {
        kind: GridCellKind.Text,
        data: display,
        displayData: display,
        allowOverlay: false,
        readonly: true,
        themeOverride: cellTheme,
      }
    }

    if (key === "vatRateDisplay") {
      const vr = unitDisplayVatRate(unit as any)
      const display = vr.toString().replace('.', ',')
      return {
        kind: GridCellKind.Text,
        data: display,
        displayData: display,
        allowOverlay: false,
        readonly: true,
        themeOverride: cellTheme,
      }
    }

    if (key === "availability") {
      // Map availability values to display labels
      const availabilityValue = unit.availability || ""
      const availabilityLabel = availabilityValue === "Available" ? "Disponible" : 
                                availabilityValue === "Not Available" ? "No Disponible" : 
                                availabilityValue
      return {
        kind: GridCellKind.Text,
        data: availabilityValue,
        displayData: `▼ ${availabilityLabel}`,
        allowOverlay: false,
        readonly: isReadonly,
        themeOverride: cellTheme,
      }
    }

    // Handle text fields
    if (value === null || value === undefined) {
      value = ""
    } else if (key === "block") {
      value = unit.block?.name || ""
    }

    const displayValue = String(value)

    return {
      kind: GridCellKind.Text,
      data: displayValue,
      displayData: displayValue,
      allowOverlay: !isReadonly,
      readonly: isReadonly,
      themeOverride: cellTheme,
    }
  }, [visibleColumns, readonlyFields, parkingTypes, unitUsages, topographies, unitTypeLabels, isNewUnit, rowSaveStatus, t, refreshKey, cellErrors, sortedUnits, savingCells, isFieldReadonly, isParkingDependentReadonly, pendingChanges, blockCollectionDate, blockStartDate, editingCurrency, isSuperAdmin, blockCountry, gridStats])

  // Apply paste to cells
  const applyPaste = useCallback((pasteData: Array<{ cell: Item; value: string; sourceKey?: string }>) => {
    // Validate types before applying paste
    const incompatibleCells: Array<{ cell: Item; sourceType: CellDataType; destType: CellDataType; sourceValue: string; destKey: string }> = []
    const validatedPasteData: Array<{ cell: Item; value: string }> = []
    
    const truncateForDisplay = (s: string, maxLen = 50) =>
      s.length <= maxLen ? s : s.slice(0, maxLen) + "…"
    
    pasteData.forEach(({ cell, value, sourceKey: pasteSourceKey }) => {
      const [col, row] = cell
      const column = visibleColumns[col]
      const unit = row >= 0 && row < sortedUnits.length ? sortedUnits[row] : undefined
      
      if (!unit || !column) return
      
      const destKey = column.id as string
      if (!destKey || isFieldReadonly(destKey) || isParkingDependentReadonly(destKey, unit as Record<string, unknown>)) return
      if (isCellEffectivelyReadonly(destKey, unit as Record<string, unknown>)) {
        showHabitableErrorIfNeeded(destKey, unit as Record<string, unknown>)
        return
      }
      
      // If editing varas², map to the underlying mts² key for updates
      const targetKey = varasToM2Map[destKey] || destKey
      
      // Get destination cell type from column definition (Glide column def.type → dataType)
      const destType = (column as ColumnWithGroup).dataType ?? "TEXT"
      
      // Infer source type from string value
      // If destination is dropdown and value matches an option, treat as DROPDOWN from same column
      const getDropdownOptionsForType = (key: string) => {
        if (key === "parkingType") return parkingTypes.map(pt => pt.name || "").filter(Boolean)
        if (key === "unitUsage") return unitUsages.map(uu => uu.name || "").filter(Boolean)
        if (key === "topography") return topographies.map(t => t.name || "").filter(Boolean)
        if (key === "availability") return ["Disponible", "No Disponible", "Available", "Not Available"]
        if (key === "unitType") {
          return [unitTypeLabels.residential, unitTypeLabels.office, unitTypeLabels.industrial]
        }
        return []
      }
      
      const sourceType = inferTypeFromString(
        value, 
        pasteSourceKey, 
        destKey, // Pass destKey to check if value matches dropdown options
        dropdownFields,
        getDropdownOptionsForType
      )
      
      // If source type is DROPDOWN and destination is also DROPDOWN, use destKey as sourceKey
      const effectiveSourceKey = (sourceType === 'DROPDOWN' && destType === 'DROPDOWN') 
        ? destKey 
        : (pasteSourceKey || destKey)
      
      // Validate type compatibility
      if (isTypeCompatible(sourceType, effectiveSourceKey, destType, destKey)) {
        validatedPasteData.push({ cell, value })
      } else {
        incompatibleCells.push({ cell, sourceType, destType, sourceValue: truncateForDisplay(value), destKey })
      }
    })
    
      // If there are incompatible cells, show alert and abort
      if (incompatibleCells.length > 0) {
        const first = incompatibleCells[0]
        const sourceTypeName = first.sourceType
        const destTypeName = first.destType
        const plural = incompatibleCells.length > 1 ? 's' : ''
        const [ic, ir] = first.cell
        const cellRef = gridCellToSpreadsheetRef(ic, ir)
        setTypeValidationAlert({
          open: true,
          message: t('typeIncompatibility', { 
            operation: t('typeIncompatibilityOperationPaste'),
            sourceType: sourceTypeName, 
            destType: destTypeName,
            count: incompatibleCells.length,
            plural
          }) || `No se puede pegar valores de tipo ${sourceTypeName} a celdas de tipo ${destTypeName}. Revise la selección o el destino. (${incompatibleCells.length} celda${plural} afectada${plural})`,
          details: {
            sourceValue: first.sourceValue,
            sourceType: sourceTypeName,
            destColumnLabel: getFieldDisplayName(first.destKey),
            destType: destTypeName,
            count: incompatibleCells.length > 1 ? incompatibleCells.length : undefined,
            cellRef,
            cellRow1Based: ir + 1,
          },
          detailsExpanded: false,
        })
        return
      }
    
    // Save state before paste for undo
    const beforeState = JSON.parse(JSON.stringify(dataRef.current))
    
    validatedPasteData.forEach(({ cell, value }) => {
      const [col, row] = cell
      const column = visibleColumns[col]
      const unit = row >= 0 && row < sortedUnits.length ? sortedUnits[row] : undefined
      
      if (!unit || !column) return
      
      const key = column.id as string
      if (!key || isFieldReadonly(key)) return

      if (resolveUnitTypeDynamicColumn(key) && !unitTypeDynamicAppliesToRow(unit, key)) return
      
      // Handle currency conversion: map currency field to USD field
      const usdKey = currencyToUsdMap[key] || key
      const isCurrencyField = key in currencyToUsdMap
      // Extract currency code from field name
      let currencyCode = ''
      if (isCurrencyField) {
        for (const currency of activeCurrencies) {
          if (key.includes(currency.code.toUpperCase())) {
            currencyCode = currency.code
            break
          }
        }
      }
      
      // Handle varas² conversion: map varas² field to mts² field
      const targetKey = varasToM2Map[usdKey] || usdKey
      const isVarasField = usdKey in varasToM2Map
      
      // Skip API update if this is a new unit (no documentId or id)
      // New units will be saved only when user clicks Save button
      const isNew = isNewUnit(unit)
      
      // Clean value - remove "▼ " prefix if present (for dropdown fields)
      let cleanValue = String(value).replace(/^▼\s*/, "").trim()
      const numericCleanValue = typeof cleanValue === "number" ? cleanValue : parseFloat(cleanValue) || 0
      
      // Update the unit in the ref immediately
      if (targetKey === "topography") {
        // Find the topography by name and update the relation
        const selectedTopography = topographies.find(t => 
          t.name?.toLowerCase() === cleanValue.toLowerCase() ||
          t.code?.toLowerCase() === cleanValue.toLowerCase()
        )
        if (selectedTopography) {
          unit.topography = {
            documentId: selectedTopography.documentId || String(selectedTopography.id || ""),
            id: selectedTopography.id,
            name: selectedTopography.name,
            code: selectedTopography.code,
          }
        }
      } else if (targetKey === "parkingType") {
        // Find the parking type by name and update the relation
        const selectedParkingType = parkingTypes.find(pt => 
          pt.name?.toLowerCase() === cleanValue.toLowerCase() ||
          pt.code?.toLowerCase() === cleanValue.toLowerCase()
        )
        if (selectedParkingType) {
          unit.parkingType = {
            documentId: selectedParkingType.documentId || String(selectedParkingType.id || ""),
            id: selectedParkingType.id,
            name: selectedParkingType.name,
            code: selectedParkingType.code,
          }
        }
      } else if (targetKey === "unitUsage") {
        // Find the unit usage by name and update the relation
        const selectedUnitUsage = unitUsages.find(uu => 
          uu.name?.toLowerCase() === cleanValue.toLowerCase() ||
          uu.code?.toLowerCase() === cleanValue.toLowerCase()
        )
        if (selectedUnitUsage) {
          unit.unitUsage = {
            documentId: selectedUnitUsage.documentId || String(selectedUnitUsage.id || ""),
            id: selectedUnitUsage.id,
            name: selectedUnitUsage.name,
            code: selectedUnitUsage.code,
          }
        }
      } else if (targetKey === "unitType") {
        const comp = labelToComponent(cleanValue, unitTypeLabels)
        if (comp) {
          unit.unitType = [emptyUnitTypeEntry(comp)]
          delete (unit as StrapiUnit & { type?: unknown }).type
        } else {
          delete unit.unitType
          delete (unit as StrapiUnit & { type?: unknown }).type
        }
      } else if (targetKey === "availability") {
        // Map availability display labels to values
        const availabilityValue = cleanValue === "Disponible" ? "Available" :
                                 cleanValue === "No Disponible" ? "Not Available" :
                                 cleanValue
        unit.availability = availabilityValue as "Available" | "Not Available" | undefined
        syncUnitAbsorption(unit as any, blockCollectionDate, blockStartDate)
        syncUnitAbsorptionPerM2(unit as any)
        // New rows have no documentId/id; never queue pending edits under the bogus key "undefined"
        if (!isNew) {
          const unitId = getUnitRowKey(unit)
          addPendingChange(unitId, "unitAbsorption")
          addPendingChange(unitId, "absorptionPerM2")
        }
      } else if (resolveUnitTypeDynamicColumn(key)) {
        const pasteDzVal = coerceOfficesDzEnumColumnValue(key, cleanValue, t)
        applyUnitTypeDynamicLocalChange(unit, key, pasteDzVal, { source: "paste", roundTo2 })
        applyDimensionCascade(unit as any, key, isNew ? "" : getUnitRowKey(unit), isNew, row + 1)
      } else if (!targetKey.includes(".")) {
        const destType = (column as ColumnWithGroup).dataType ?? "TEXT"
        if (destType === "BOOLEAN") {
          ;(unit as any)[targetKey] = parsePastedBooleanString(cleanValue)
        } else if (destType === "TEXT") {
          // Text columns: unitNumber, model, etc. — store string as-is
          ;(unit as any)[targetKey] = cleanValue
          if (targetKey === "unitNumber") {
            const blockNameForUnit = unit.block?.name ?? blockName ?? ""
            const computedName = blockNameForUnit ? `${blockNameForUnit} - ${cleanValue}` : cleanValue
            ;(unit as any).name = computedName
            ;(unit as any).code = slugify(computedName)
            if (!isNew) {
              const unitId = getUnitRowKey(unit)
              addPendingChange(unitId, "name")
              addPendingChange(unitId, "code")
            }
          }
        } else {
          // Numeric columns
          let valueToSet: number
          if (isCurrencyField) {
            const buyRate = getBuyRate(currencyCode)
            valueToSet = numericCleanValue / buyRate
          } else {
            valueToSet = isVarasField ? numericCleanValue / getVarasFactor(usdKey) : roundTo2(numericCleanValue)
          }
          ;(unit as any)[targetKey] = valueToSet
          if (
            !isCurrencyField &&
            (targetKey === "totalPriceUSD" ||
              targetKey === "rentalPriceUSD" ||
              targetKey === "maintenanceTotalPriceM2USD")
          ) {
            clearEditableForeignPriceVisuals(unit as any, targetKey, activeCurrencies)
          }
          applyDimensionCascade(unit as any, targetKey, isNew ? "" : getUnitRowKey(unit), isNew, row + 1)
          applyCascadeRule(unit as any, targetKey, isNew ? "" : getUnitRowKey(unit), isNew, isCurrencyField, currencyCode, row + 1)
          if (isVarasField) {
            ;(unit as any)[key] = numericCleanValue
          } else {
            const varasKey = m2ToVarasMap[targetKey]
            if (varasKey) {
              ;(unit as any)[varasKey] = roundTo2(valueToSet * getVarasFactor(targetKey))
            }
          }
          if (isCurrencyField) {
            ;(unit as any)[key] = numericCleanValue
          }
        }
      }
      
      // Skip API update if this is a new unit
      if (isNew) {
        // Just update in memory, add to history, and continue
        addToHistory([...dataRef.current])
        
        // Force re-render by updating refreshKey
        // This ensures the grid updates to show the pasted value
        setRefreshKey(prev => prev + 1)
        
        return // Exit early, no API call
      }
      
      // For relation fields, use the direct field name
      const utDynPath = getUnitTypeDynamicApiPath(unit, targetKey)
      const field = utDynPath != null
        ? utDynPath
        : targetKey === "parkingType" || targetKey === "unitUsage" || targetKey === "topography" || targetKey === "availability" || targetKey === "unitType"
          ? targetKey
          : getFieldPath(targetKey, unit)
      const unitId = getUnitRowKey(unit)
      
      // No auto-save: record pending change; Save button will flush to API
      const pendingKey = resolveUnitTypeDynamicColumn(key) ? key : field
      addPendingChangeMirrored(unitId, pendingKey)
    })
    
    // Add to history after paste
    addToHistory([...dataRef.current])

    // Force re-render to ensure grid updates with pasted values
    // This is especially important for new rows
    setRefreshKey(prev => prev + 1)
  }, [columns, isFieldReadonly, isParkingDependentReadonly, addToHistory, topographies, parkingTypes, unitUsages, unitTypeLabels, isNewUnit, getFieldDisplayName, addPendingChange, activeCurrencies, t, sortedUnits, visibleColumns, dropdownFields, varasToM2Map, currencyToUsdMap, convertValueForAPI])

  // Handle paste with confirmation for multiple cells
  const onPaste = useCallback((target: Item, values: readonly (readonly string[])[]): boolean => {
    const [startCol, startRow] = target
    
    // Calculate dimensions of pasted data
    const sourceRows = values.length
    const sourceCols = values[0]?.length || 0
    const pastedCells = sourceRows * sourceCols
    
    // Check if we have a single value
    const isSingleValue = pastedCells === 1
    const singleValue = isSingleValue ? (values[0]?.[0] || "") : ""
    
    // Get destination area from gridSelection if available
    let destRange: { x: number; y: number; width: number; height: number } | null = null
    let hasMultiCellSelection = false
    if (gridSelection && gridSelection.current) {
      const range = gridSelection.current.range
      const rangeStack = gridSelection.current.rangeStack || []
      
      // Use the largest range (usually the main range)
      const allRanges = [range, ...rangeStack]
      destRange = allRanges.reduce((largest, current) => {
        const currentArea = current.width * current.height
        const largestArea = largest.width * largest.height
        return currentArea > largestArea ? current : largest
      }, range)
      
      // Check if it's a multi-cell selection (more than 1 cell)
      hasMultiCellSelection = (destRange.width * destRange.height) > 1
    }
    
    // Prepare paste data
    const pasteData: Array<{ cell: Item; value: string }> = []
    
    // If we have a multi-cell destination range, use it for tiling
    if (destRange && hasMultiCellSelection && destRange.width > 0 && destRange.height > 0) {
      // Calculate how many times to repeat the pattern
      const destRows = destRange.height
      const destCols = destRange.width
      
      // If single value, fill all selected cells
      if (isSingleValue) {
        for (let r = 0; r < destRows; r++) {
          for (let c = 0; c < destCols; c++) {
            const targetRow = destRange.y + r
            const targetCol = destRange.x + c
            
            if (targetRow < sortedUnits.length && targetCol < visibleColumns.length) {
              const column = visibleColumns[targetCol]
              const key = column.id as string
              const unit = sortedUnits[targetRow]
              if (key && unit && !isFieldReadonly(key) && !isParkingDependentReadonly(key, unit as Record<string, unknown>)) {
                pasteData.push({
                  cell: [targetCol, targetRow],
                  value: singleValue,
                })
              }
            }
          }
        }
      } else {
        // Tile the pattern: repeat source pattern across destination area
        for (let r = 0; r < destRows; r++) {
          for (let c = 0; c < destCols; c++) {
            const targetRow = destRange.y + r
            const targetCol = destRange.x + c
            
            if (targetRow < sortedUnits.length && targetCol < visibleColumns.length) {
              const column = visibleColumns[targetCol]
              const key = column.id as string
              const unit = sortedUnits[targetRow]
              if (key && unit && !isFieldReadonly(key) && !isParkingDependentReadonly(key, unit as Record<string, unknown>)) {
                // Use modulo to repeat the pattern (Excel-like behavior)
                const sourceRow = r % sourceRows
                const sourceCol = c % sourceCols
                pasteData.push({
                  cell: [targetCol, targetRow],
                  value: values[sourceRow]?.[sourceCol] || "",
                })
              }
            }
          }
        }
      }
    } else {
      // No multi-cell destination range: expand source area from target position
      // This handles the case: copy area (2x2) -> paste on single cell -> expand to 2x2 from that point
      for (let r = 0; r < sourceRows; r++) {
        for (let c = 0; c < sourceCols; c++) {
        const targetRow = startRow + r
        const targetCol = startCol + c
        
        if (targetRow < sortedUnits.length && targetCol < visibleColumns.length) {
          const column = visibleColumns[targetCol]
          const key = column.id as string
          const unit = sortedUnits[targetRow]
          if (key && unit && !readonlyFields.has(key) && !isParkingDependentReadonly(key, unit as Record<string, unknown>)) {
            pasteData.push({
              cell: [targetCol, targetRow],
              value: values[r]?.[c] || "",
            })
            }
          }
        }
      }
    }
    
    // Check if more than 1 cell will be affected
    const affectsMultiple = pasteData.length > 1
    
    if (affectsMultiple) {
      // Show confirmation dialog
      setPasteDialog({
        open: true,
        cellCount: pasteData.length,
        pasteData,
      })
      
      // Prevent default paste
      return false
    }
    
    // Single cell paste - apply directly without dialog
    if (pasteData.length === 1) {
      applyPaste(pasteData)
      return false // Prevent default paste, we handle it manually
    }
    
    return true
  }, [columns, isFieldReadonly, isParkingDependentReadonly, applyPaste, parkingTypes, unitUsages, gridSelection, sortedUnits, visibleColumns])

  // Handle confirmed paste
  const handleConfirmedPaste = useCallback(() => {
    applyPaste(pasteDialog.pasteData)
    // Close dialog
    setPasteDialog({ open: false, cellCount: 0, pasteData: [] })
  }, [pasteDialog, applyPaste])

  // Handle cell edit
  const onCellEdited = useCallback((cell: Item, newValue: GridCell) => {
    const [col, row] = cell
    const column = visibleColumns[col]
    const originalRow = gridRowToDataRefIndex(row)
    const unit = originalRow >= 0 ? dataRef.current[originalRow] : undefined

    if (!unit || !column) return

    const key = column.id as string
    if (!key || isFieldReadonly(key) || isParkingDependentReadonly(key, unit as Record<string, unknown>)) {
      return
    }
    if (isCellEffectivelyReadonly(key, unit as Record<string, unknown>)) {
      showHabitableErrorIfNeeded(key, unit as Record<string, unknown>)
      return
    }

    if (resolveUnitTypeDynamicColumn(key) && !unitTypeDynamicAppliesToRow(unit, key)) {
      return
    }
    
    // Handle currency conversion: map currency field to USD field
    const usdKey = currencyToUsdMap[key] || key
    const isCurrencyField = key in currencyToUsdMap
    // Extract currency code from field name (e.g., "totalPriceGTQ" -> "GTQ")
    let currencyCode = ''
    if (isCurrencyField) {
      for (const currency of activeCurrencies) {
        if (key.includes(currency.code.toUpperCase())) {
          currencyCode = currency.code
          break
        }
      }
    }
    
    // Handle varas² conversion: map varas² field to mts² field
    const targetKey = varasToM2Map[usdKey] || usdKey
    const isVarasField = usdKey in varasToM2Map

    // Check if this cell was deleted by onDelete - if so, skip API request
    // (onDelete already made the request)
    // Uses sorted grid row `row` to match the key written by onDelete
    const cellKey = `${row}:${col}`
    if (deletedCellsRef.current.has(cellKey)) {
      deletedCellsRef.current.delete(cellKey)
      return
    }

    // Skip API update if this is a new unit (no documentId or id)
    // New units will be saved only when user clicks Save button
    if (isNewUnit(unit)) {
      // Just update the unit in memory, don't call API
      // Extract value and update unit locally
      let cellValue: unknown
      if (newValue.kind === GridCellKind.Number) {
        const num = newValue.data ?? 0
        if (isCurrencyField) {
          const buyRate = getBuyRate(currencyCode)
          cellValue = num / buyRate
        } else {
          cellValue = isVarasField ? num / getVarasFactor(usdKey) : roundTo2(num)
        }
      } else if (newValue.kind === GridCellKind.Boolean) {
        cellValue = newValue.data
      } else if (newValue.kind === GridCellKind.Text && dropdownFields.includes(key)) {
        cellValue = String(newValue.data || "").replace(/^▼\s*/, "")
      } else if (newValue.kind === GridCellKind.Text) {
        cellValue = newValue.data
      } else {
        return
      }

      // Update the unit in memory (same logic as below but without API call)
      if (targetKey === "parkingType") {
        const selectedParkingType = parkingTypes.find(pt => pt.name === cellValue)
        if (selectedParkingType) {
          unit.parkingType = {
            documentId: selectedParkingType.documentId || String(selectedParkingType.id || ""),
            id: selectedParkingType.id,
            name: selectedParkingType.name,
            code: selectedParkingType.code,
          }
        }
      } else if (targetKey === "topography") {
        const selectedTopography = topographies.find(t => t.name === cellValue)
        if (selectedTopography) {
          unit.topography = {
            documentId: selectedTopography.documentId || String(selectedTopography.id || ""),
            id: selectedTopography.id,
            name: selectedTopography.name,
            code: selectedTopography.code,
          }
        }
      } else if (targetKey === "unitUsage") {
        const selectedUnitUsage = unitUsages.find(uu => 
          uu.name?.toLowerCase() === String(cellValue).toLowerCase() ||
          uu.code?.toLowerCase() === String(cellValue).toLowerCase()
        )
        if (selectedUnitUsage) {
          unit.unitUsage = {
            documentId: selectedUnitUsage.documentId || String(selectedUnitUsage.id || ""),
            id: selectedUnitUsage.id,
            name: selectedUnitUsage.name,
            code: selectedUnitUsage.code,
          }
        }
      } else if (targetKey === "unitType") {
        const comp = labelToComponent(String(cellValue), unitTypeLabels)
        if (comp) {
          unit.unitType = [emptyUnitTypeEntry(comp)]
          delete (unit as StrapiUnit & { type?: unknown }).type
        } else {
          delete unit.unitType
          delete (unit as StrapiUnit & { type?: unknown }).type
        }
      } else if (targetKey === "availability") {
        const availabilityValue = String(cellValue) === "Disponible" ? "Available" :
                                 String(cellValue) === "No Disponible" ? "Not Available" :
                                 String(cellValue)
        unit.availability = availabilityValue as "Available" | "Not Available" | undefined
        syncUnitAbsorption(unit as any, blockCollectionDate, blockStartDate)
        syncUnitAbsorptionPerM2(unit as any)
      } else if (resolveUnitTypeDynamicColumn(key)) {
        applyUnitTypeDynamicLocalChange(
          unit,
          key,
          coerceOfficesDzEnumColumnValue(key, cellValue, t),
          { source: "grid", roundTo2 }
        )
        applyDimensionCascade(unit as any, key, "", true, row + 1)
      } else if (!targetKey.includes(".")) {
        (unit as any)[targetKey] = cellValue
        if (
          !isCurrencyField &&
          (targetKey === "totalPriceUSD" ||
            targetKey === "rentalPriceUSD" ||
            targetKey === "maintenanceTotalPriceM2USD")
        ) {
          clearEditableForeignPriceVisuals(unit as any, targetKey, activeCurrencies)
        }
        applyDimensionCascade(unit as any, targetKey, "", true, row + 1)
        applyCascadeRule(unit as any, targetKey, "", true, isCurrencyField, currencyCode, row + 1)
        // Store visual currency value if editing currency field
        if (isCurrencyField) {
          (unit as any)[key] = newValue.kind === GridCellKind.Number ? (newValue.data ?? 0) : cellValue
          // Fórmula inversa para campos sin IVA en moneda extranjera
          // cellValue ya está en USD (num/buyRate), unit[targetKey] ya fue asignado — solo sincronizar
          if (usdKey === "priceWithoutVATUSD") {
            syncPriceFromWithoutVAT(unit as any, unitVatRates(unit as any))
            syncUnitInstallment(unit as any, unitVatRates(unit as any), countryIsoRef.current)
            syncUnitIncome(unit as any)
            clearEditableForeignPriceVisuals(unit as any, "totalPriceUSD", activeCurrencies)
          }
          // unit.pricePerM2USD already set to correct USD value via unit[targetKey] = cellValue
          if (usdKey === "pricePerM2USD") {
            syncPriceFromPerM2(unit as any, unitVatRates(unit as any))
            syncUnitInstallment(unit as any, unitVatRates(unit as any), countryIsoRef.current)
            syncUnitIncome(unit as any)
            clearEditableForeignPriceVisuals(unit as any, "totalPriceUSD", activeCurrencies)
          }
          if (usdKey === "rentalPriceWithoutVATUSD") {
            syncRentalFromWithoutVAT(unit as any, unitVatRates(unit as any))
            clearEditableForeignPriceVisuals(unit as any, "rentalPriceUSD", activeCurrencies)
          }
          if (usdKey === "rentalPricePerM2WithoutVATUSD") {
            // unit.rentalPricePerM2WithoutVATUSD already set to correct USD value via unit[targetKey] = cellValue
            syncRentalFromPerM2(unit as any, unitVatRates(unit as any))
            clearEditableForeignPriceVisuals(unit as any, "rentalPriceUSD", activeCurrencies)
          }
          if (usdKey === "maintenanceWithoutVATUSD") {
            syncMaintenanceFromWithoutVAT(unit as any, unitVatRates(unit as any))
            clearEditableForeignPriceVisuals(unit as any, "maintenanceTotalPriceM2USD", activeCurrencies)
          }
          if (usdKey === "maintenancePricePerM2USD") {
            // unit.maintenancePricePerM2USD already set to correct USD value via unit[targetKey] = cellValue
            syncMaintenanceFromPerM2(unit as any, unitVatRates(unit as any))
            clearEditableForeignPriceVisuals(unit as any, "maintenanceTotalPriceM2USD", activeCurrencies)
          }
        }
      }

      // Add to history
      addToHistory([...dataRef.current])
      
      // Force re-render by updating refreshKey
      // This ensures the grid updates to show the edited value
      setRefreshKey(prev => prev + 1)
      
      return // Exit early, no API call
    }

    const unitId = getUnitRowKey(unit)

    // Extract value from GridCell based on its kind
    let cellValue: unknown
    if (newValue.kind === GridCellKind.Number) {
      const num = newValue.data ?? 0
      if (isCurrencyField) {
        const buyRate = getBuyRate(currencyCode)
        cellValue = num / buyRate
      } else {
        cellValue = isVarasField ? num / getVarasFactor(usdKey) : roundTo2(num)
      }
    } else if (newValue.kind === GridCellKind.Boolean) {
      cellValue = newValue.data
    } else if (newValue.kind === GridCellKind.Text && dropdownFields.includes(key)) {
      // For dropdown fields (TextCell), extract the value (remove the "▼ " prefix)
      cellValue = String(newValue.data || "").replace(/^▼\s*/, "")
    } else if (newValue.kind === GridCellKind.Bubble) {
      // For BubbleCell, the data is an array of selected option names
      // We take the last element (most recently added) or first if only one
      cellValue = Array.isArray(newValue.data) && newValue.data.length > 0 
        ? newValue.data[newValue.data.length - 1] 
        : ""
    } else if (newValue.kind === GridCellKind.Drilldown) {
      // For DrilldownCell, the data is an array of DrilldownCellData
      // We take the last element's text (most recently added) or first if only one
      cellValue = Array.isArray(newValue.data) && newValue.data.length > 0 
        ? newValue.data[newValue.data.length - 1]?.text || ""
        : ""
    } else if (newValue.kind === GridCellKind.Text) {
      cellValue = newValue.data
    } else {
      return // Don't handle other cell types
    }

    // Store old value for potential revert
    const oldValue = getNestedValue(unit, key)

    const dzEdit = resolveUnitTypeDynamicColumn(key)
    if (dzEdit) {
      const isBalconyKey = key === "housing.balconyTerraceM2" || key === "offices.balconyTerraceM2"
      if (isVerticalRef.current && isBalconyKey && !unitTypeDynamicAppliesToRow(unit as StrapiUnit, key)) {
        const autoComponent = (key.startsWith("offices.") ? "unit-types.offices" : "unit-types.housing") as Parameters<typeof emptyUnitTypeEntry>[0]
        ;(unit as StrapiUnit).unitType = [emptyUnitTypeEntry(autoComponent)]
      }
      const dzVal = coerceOfficesDzEnumColumnValue(key, cellValue, t)
      if (!applyUnitTypeDynamicLocalChange(unit, key, dzVal, { source: "grid", roundTo2 })) return
      applyDimensionCascade(unit as any, key, unitId, false, row + 1)
      const fieldDz = getUnitTypeDynamicApiPath(unit, key)
      if (!fieldDz) return
      const convertedValueDz = normalizeUnitTypeDynamicForStrapiBody(
        dzEdit.def,
        readUnitTypeDynamicValue(unit, key)
      )

      addToHistory([...dataRef.current])
      const blockDocumentIdDz = unit.block?.documentId || unit.block?.id
      markCellSaving(row, col)
      setPendingUpdates((prev) => {
        const newCount = prev + 1
        if (prev === 0) setSaveStatus("saving")
        return newCount
      })
      setTotalUpdates((prev) => prev + 1)

      strapiClient.updateUnit(unitId, fieldDz, convertedValueDz, blockDocumentIdDz)
        .then(() => {
          if (process.env.NODE_ENV === "development") {
            console.log(`Updated unit ${unitId}, field: ${fieldDz}`)
          }
          clearCellSaving(row, col)
          clearCellError(row, col)
          setPendingUpdates((prev) => {
            const newCount = prev - 1
            if (newCount === 0) {
              setSaveStatus("success")
              setTimeout(() => {
                setSaveStatus("idle")
                setTotalUpdates(0)
                setCompletedUpdates(0)
              }, 1500)
            }
            return newCount
          })
          setCompletedUpdates((prev) => prev + 1)
        })
        .catch((error) => {
          console.error(`Error updating unit ${unitId}, field: ${fieldDz}:`, error)
          clearCellSaving(row, col)
          handleCellError(row, col, fieldDz, error)
          setPendingUpdates((prev) => {
            const newCount = prev - 1
            if (newCount === 0) {
              setSaveStatus("idle")
              setTotalUpdates(0)
              setCompletedUpdates(0)
            }
            return newCount
          })
          setCompletedUpdates((prev) => prev + 1)
          const unitIndexErr = dataRef.current.findIndex((u) => (getUnitRowKey(u)) === unitId)
          if (unitIndexErr >= 0) {
            const originalUnit = units.find((u) => (getUnitRowKey(u)) === unitId)
            if (originalUnit) dataRef.current[unitIndexErr] = { ...originalUnit }
          }
        })

      if (onUpdate) {
        onUpdate(unitId, fieldDz, convertedValueDz)
      }
      setRefreshKey((prev) => prev + 1)
      return
    }

    // Update the unit in the ref immediately (optimistic update)
    if (key === "parkingType") {
      // Find the parking type by name and update the relation
      const selectedParkingType = parkingTypes.find(pt => pt.name === cellValue)
      if (selectedParkingType) {
        unit.parkingType = {
          documentId: selectedParkingType.documentId || String(selectedParkingType.id || ""),
          id: selectedParkingType.id,
          name: selectedParkingType.name,
          code: selectedParkingType.code,
        }
      }
    } else if (key === "topography") {
      // Find the topography by name and update the relation (same as parkingType)
      const selectedTopography = topographies.find(t => t.name === cellValue)
      if (selectedTopography) {
        unit.topography = {
          documentId: selectedTopography.documentId || String(selectedTopography.id || ""),
          id: selectedTopography.id,
          name: selectedTopography.name,
          code: selectedTopography.code,
        }
      }
    } else if (key === "unitUsage") {
      // Find the unit usage by name and update the relation
      const selectedUnitUsage = unitUsages.find(uu => 
        uu.name?.toLowerCase() === String(cellValue).toLowerCase() ||
        uu.code?.toLowerCase() === String(cellValue).toLowerCase()
      )
      if (selectedUnitUsage) {
        unit.unitUsage = {
          documentId: selectedUnitUsage.documentId || String(selectedUnitUsage.id || ""),
          id: selectedUnitUsage.id,
          name: selectedUnitUsage.name,
          code: selectedUnitUsage.code,
        }
      }
    } else if (key === "unitType") {
      const comp = labelToComponent(String(cellValue), unitTypeLabels)
      if (comp) {
        unit.unitType = [emptyUnitTypeEntry(comp)]
        delete (unit as StrapiUnit & { type?: unknown }).type
      } else {
        delete unit.unitType
        delete (unit as StrapiUnit & { type?: unknown }).type
      }
    } else if (targetKey === "availability") {
      // Map availability display labels to values
      const availabilityValue = String(cellValue) === "Disponible" ? "Available" :
                               String(cellValue) === "No Disponible" ? "Not Available" :
                               String(cellValue)
      unit.availability = availabilityValue as "Available" | "Not Available" | undefined
      syncUnitAbsorption(unit as any, blockCollectionDate, blockStartDate)
      syncUnitAbsorptionPerM2(unit as any)
      addPendingChange(unitId, "unitAbsorption")
      addPendingChange(unitId, "absorptionPerM2")
    } else if (!targetKey.includes(".")) {
      (unit as any)[targetKey] = cellValue
      if (
        !isCurrencyField &&
        (targetKey === "totalPriceUSD" ||
          targetKey === "rentalPriceUSD" ||
          targetKey === "maintenanceTotalPriceM2USD")
      ) {
        clearEditableForeignPriceVisuals(unit as any, targetKey, activeCurrencies)
      }
      applyDimensionCascade(unit as any, targetKey, unitId, false, row + 1)
      let inverseSync = applyCascadeRule(unit as any, targetKey, unitId, false, isCurrencyField, currencyCode, row + 1)
      // venta, rental and maintenance handled by applyCascadeRule above via inverseSync init
      // Store visual currency value if editing currency field
      if (isCurrencyField) {
        (unit as any)[key] = newValue.kind === GridCellKind.Number ? (newValue.data ?? 0) : cellValue
        if (usdKey === "priceWithoutVATUSD") {
          // cellValue already converted to USD above; unit[targetKey] already set — just sync
          syncPriceFromWithoutVAT(unit as any, unitVatRates(unit as any))
          syncUnitInstallment(unit as any, unitVatRates(unit as any), countryIsoRef.current)
          syncUnitIncome(unit as any)
          clearEditableForeignPriceVisuals(unit as any, "totalPriceUSD", activeCurrencies)
          addPendingChangeMirrored(unitId, "totalPriceUSD")
          addPendingChangeMirrored(unitId, "pricePerM2USD")
          addPendingChangeMirrored(unitId, "installmentUSD")
          addPendingChangeMirrored(unitId, "incomeUSD")
          inverseSync = true
        }
        // unit.pricePerM2USD already set to correct USD value via unit[targetKey] = cellValue
        if (usdKey === "pricePerM2USD") {
          syncPriceFromPerM2(unit as any, unitVatRates(unit as any))
          syncUnitInstallment(unit as any, unitVatRates(unit as any), countryIsoRef.current)
          syncUnitIncome(unit as any)
          clearEditableForeignPriceVisuals(unit as any, "totalPriceUSD", activeCurrencies)
          addPendingChangeMirrored(unitId, "totalPriceUSD")
          addPendingChangeMirrored(unitId, "priceWithoutVATUSD")
          addPendingChangeMirrored(unitId, "installmentUSD")
          addPendingChangeMirrored(unitId, "incomeUSD")
          inverseSync = true
        }
        if (usdKey === "rentalPriceWithoutVATUSD") {
          syncRentalFromWithoutVAT(unit as any, unitVatRates(unit as any))
          clearEditableForeignPriceVisuals(unit as any, "rentalPriceUSD", activeCurrencies)
          addPendingChangeMirrored(unitId, "rentalPriceUSD")
          addPendingChangeMirrored(unitId, "rentalPricePerM2WithoutVATUSD")
          inverseSync = true
        }
        if (usdKey === "rentalPricePerM2WithoutVATUSD") {
          // unit.rentalPricePerM2WithoutVATUSD already set to correct USD value via unit[targetKey] = cellValue
          syncRentalFromPerM2(unit as any, unitVatRates(unit as any))
          clearEditableForeignPriceVisuals(unit as any, "rentalPriceUSD", activeCurrencies)
          addPendingChangeMirrored(unitId, "rentalPriceUSD")
          addPendingChangeMirrored(unitId, "rentalPriceWithoutVATUSD")
          inverseSync = true
        }
        if (usdKey === "maintenanceWithoutVATUSD") {
          syncMaintenanceFromWithoutVAT(unit as any, unitVatRates(unit as any))
          clearEditableForeignPriceVisuals(unit as any, "maintenanceTotalPriceM2USD", activeCurrencies)
          addPendingChangeMirrored(unitId, "maintenanceWithoutVATUSD")
          addPendingChangeMirrored(unitId, "maintenanceTotalPriceM2USD")
          addPendingChangeMirrored(unitId, "maintenancePricePerM2USD")
          inverseSync = true
        }
      }
      if (inverseSync) {
        // Force the grid to redraw all cells in this row so partner fields update visually
        dataEditorRef.current?.updateCells(
          Array.from({ length: visibleColumns.length }, (_, c) => ({ cell: [c, row] as [number, number] }))
        )
        setRefreshKey(prev => prev + 1)
      }
    }

    // Convert value back to original format for API
    // Always use USD field for API (targetKey)
    let convertedValue: unknown = cellValue

    // Handle parkingType - convert name to documentId
    if (key === "parkingType") {
      const selectedParkingType = parkingTypes.find(pt => 
        pt.name?.toLowerCase() === String(cellValue).toLowerCase() ||
        pt.code?.toLowerCase() === String(cellValue).toLowerCase()
      )
      convertedValue = selectedParkingType?.documentId || selectedParkingType?.id || null
    }
    // Handle topography - convert name to documentId
    else if (key === "topography") {
      const selectedTopography = topographies.find(t => 
        t.name?.toLowerCase() === String(cellValue).toLowerCase() ||
        t.code?.toLowerCase() === String(cellValue).toLowerCase()
      )
      convertedValue = selectedTopography?.documentId || selectedTopography?.id || null
    }
    // Handle unitUsage - convert name to documentId
    else if (key === "unitUsage") {
      const selectedUnitUsage = unitUsages.find(uu => 
        uu.name?.toLowerCase() === String(cellValue).toLowerCase() ||
        uu.code?.toLowerCase() === String(cellValue).toLowerCase()
      )
      convertedValue = selectedUnitUsage?.documentId || selectedUnitUsage?.id || null
    }
    else if (key === "unitType") {
      convertedValue = formatUnitTypeForStrapi(unit.unitType)
    }
    // Handle availability - map display labels to values
    else if (key === "availability") {
      convertedValue = String(cellValue) === "Disponible" ? "Available" : 
                      String(cellValue) === "No Disponible" ? "Not Available" : 
                      String(cellValue)
    }
    // Boolean fields from schema
    else if (key === "hasParking" || key === "hasMotorcycleParking") {
      // Already boolean from BooleanCell
      convertedValue = Boolean(cellValue)
    } 
    // Number fields from schema
    else {
      const numberFields = [
        "frontM2", "depthM2", "landM2",
        "unitSizeM2", "parkingSizeM2",
        "totalSizeM2", "habitableConstructionM2",
        "bathrooms", "parkingSpaces",
        "totalPriceUSD", "priceWithoutVATUSD",
        "pricePerM2USD",
        "rentalPriceUSD", "rentalPriceWithoutVATUSD",
        "rentalPricePerM2WithoutVATUSD",
        "maintenanceTotalPriceM2USD",
        "maintenancePricePerM2USD",
        "installmentUSD", "incomeUSD",
        "unitAbsorption", "absorptionPerM2"
      ]
      
      if (numberFields.includes(targetKey)) {
      convertedValue = typeof cellValue === "number" ? cellValue : parseFloat(String(cellValue)) || 0
      }
      // Text fields remain as strings
    }

    // For relation fields, use the direct field name
    // Always use USD field (targetKey) for API
    const field =
      targetKey === "parkingType" || targetKey === "unitUsage" || targetKey === "topography" || targetKey === "availability" || targetKey === "unitType"
        ? targetKey
        : getFieldPath(targetKey, unit)

    // Update the unit in the ref optimistically (without full refresh)
    const unitIndex = dataRef.current.findIndex(u => (getUnitRowKey(u)) === unitId)
    if (unitIndex >= 0) {
      const updatedUnit = { ...dataRef.current[unitIndex] }
      
      // Update the field value
      if (key.includes(".")) {
        const [parent, child] = key.split(".")
        if (parent === "topography" && child === "name") {
          // For topography relation, we need to find the catalog item
          const selectedTopography = topographies.find(t => t.name === String(convertedValue))
          if (selectedTopography) {
            updatedUnit.topography = {
              documentId: selectedTopography.documentId || String(selectedTopography.id || ""),
              id: selectedTopography.id,
              name: selectedTopography.name,
              code: selectedTopography.code,
            }
          }
        } else if (parent === "parkingType" && child === "name") {
          const selectedParkingType = parkingTypes.find(pt => pt.name === String(convertedValue))
          if (selectedParkingType) {
            updatedUnit.parkingType = {
              documentId: selectedParkingType.documentId || String(selectedParkingType.id || ""),
              id: selectedParkingType.id,
              name: selectedParkingType.name,
              code: selectedParkingType.code,
            }
          }
        } else if (parent === "unitUsage" && child === "name") {
          const selectedUnitUsage = unitUsages.find(uu => uu.name === String(convertedValue))
          if (selectedUnitUsage) {
            updatedUnit.unitUsage = {
              documentId: selectedUnitUsage.documentId || String(selectedUnitUsage.id || ""),
              id: selectedUnitUsage.id,
              name: selectedUnitUsage.name,
              code: selectedUnitUsage.code,
            }
          }
        } else if (parent === "block" && child === "name") {
          // Block is readonly, shouldn't be updated here
        }
      } else {
        // Direct field update
        if (key === "topography") {
          const selectedTopography = topographies.find(t => 
            t.name === String(convertedValue) || t.documentId === String(convertedValue)
          )
          if (selectedTopography) {
            updatedUnit.topography = {
              documentId: selectedTopography.documentId || String(selectedTopography.id || ""),
              id: selectedTopography.id,
              name: selectedTopography.name,
              code: selectedTopography.code,
            }
          }
        } else if (key === "parkingType") {
          const selectedParkingType = parkingTypes.find(pt => 
            pt.name === String(convertedValue) || pt.documentId === String(convertedValue)
          )
          if (selectedParkingType) {
            updatedUnit.parkingType = {
              documentId: selectedParkingType.documentId || String(selectedParkingType.id || ""),
              id: selectedParkingType.id,
              name: selectedParkingType.name,
              code: selectedParkingType.code,
            }
          }
        } else if (key === "unitUsage") {
          const selectedUnitUsage = unitUsages.find(uu => 
            uu.name === String(convertedValue) || uu.documentId === String(convertedValue)
          )
          if (selectedUnitUsage) {
            updatedUnit.unitUsage = {
              documentId: selectedUnitUsage.documentId || String(selectedUnitUsage.id || ""),
              id: selectedUnitUsage.id,
              name: selectedUnitUsage.name,
              code: selectedUnitUsage.code,
            }
          }
        } else if (key === "availability") {
          updatedUnit.availability = String(convertedValue) as "Available" | "Not Available" | undefined
          syncUnitAbsorption(updatedUnit as any, blockCollectionDate, blockStartDate)
          addPendingChange(unitId, "unitAbsorption")
        } else if (key === "unitType") {
          updatedUnit.unitType = unit.unitType
          delete (updatedUnit as StrapiUnit & { type?: unknown }).type
        } else {
          (updatedUnit as any)[key] = convertedValue
        }
      }
      
      // Update the ref without triggering a full refresh
      dataRef.current[unitIndex] = updatedUnit
    }

    // Add to history before update
    addToHistory([...dataRef.current])

    // Get block documentId from unit in memory (to avoid GET request)
    const blockDocumentId = unit.block?.documentId || unit.block?.id

    // Mark cell as saving — usa `row` (posición en el grid ordenado) para que coincida
    // con la clave que usa getCellContent: `${row}:${col}`
    markCellSaving(row, col)

    // Increment pending updates counter and total updates
    setPendingUpdates(prev => {
      const newCount = prev + 1
      if (prev === 0) {
        setSaveStatus('saving')
      }
      return newCount
    })
    setTotalUpdates(prev => prev + 1)

    // Update in Strapi (without forcing grid refresh)
    // Pass block to avoid GET request
    strapiClient.updateUnit(unitId, field, convertedValue, blockDocumentId)
      .then(() => {
        if (process.env.NODE_ENV === "development") {
          console.log(`Updated unit ${unitId}, field: ${field}`)
        }
        clearCellSaving(row, col)
        clearCellError(row, col)
        setPendingUpdates(prev => {
          const newCount = prev - 1
          if (newCount === 0) {
            setSaveStatus('success')
            setTimeout(() => {
              setSaveStatus('idle')
              setTotalUpdates(0)
              setCompletedUpdates(0)
            }, 1500)
          }
          return newCount
        })
        setCompletedUpdates(prev => prev + 1)
      })
      .catch((error) => {
        console.error(`Error updating unit ${unitId}, field: ${field}:`, error)
        clearCellSaving(row, col)
        handleCellError(row, col, field, error)
        // Decrement pending updates counter even on error, but still count as completed
        setPendingUpdates(prev => {
          const newCount = prev - 1
          if (newCount === 0) {
            setSaveStatus('idle')
            // Reset counters when all done
            setTotalUpdates(0)
            setCompletedUpdates(0)
          }
          return newCount
        })
        setCompletedUpdates(prev => prev + 1)
        // Revert the change in the ref
        const unitIndex = dataRef.current.findIndex(u => (getUnitRowKey(u)) === unitId)
        if (unitIndex >= 0) {
          // Restore original unit from props
          const originalUnit = units.find(u => (getUnitRowKey(u)) === unitId)
          if (originalUnit) {
            dataRef.current[unitIndex] = { ...originalUnit }
            // Grid will update automatically via getCellContent
          }
        }
      })

    if (onUpdate) {
      onUpdate(unitId, field, convertedValue)
    }
  }, [columns, isFieldReadonly, onUpdate, addToHistory, parkingTypes, unitUsages, unitTypeLabels, topographies, blockCollectionDate, blockStartDate, isNewUnit, handleCellError, clearCellError, gridRowToDataRefIndex, activeCurrencies, units, dropdownFields, t])

  // Detect if values form a sequence
  const detectSequence = useCallback((values: number[]): { isSequence: boolean; step?: number } => {
    if (values.length < 2) {
      return { isSequence: false }
    }

    // Check if all values are numbers
    if (!values.every(v => typeof v === 'number' && !isNaN(v))) {
      return { isSequence: false }
    }

    // Calculate differences
    const differences: number[] = []
    for (let i = 1; i < values.length; i++) {
      differences.push(values[i] - values[i - 1])
    }

    // Check if all differences are the same (within a small tolerance for floating point)
    const firstDiff = differences[0]
    const tolerance = 0.0001
    const isSequence = differences.every(diff => Math.abs(diff - firstDiff) < tolerance)

    if (isSequence && Math.abs(firstDiff) > tolerance) {
      return { isSequence: true, step: firstDiff }
    }

    return { isSequence: false }
  }, [])

  // Detect sequence in a 2D matrix (Excel-like autofill)
  const detectSequence2D = useCallback((matrix: number[][]): { isSequence: boolean; stepRow?: number; stepCol?: number } => {
    if (matrix.length === 0 || matrix[0].length === 0) {
      return { isSequence: false }
    }

    const rows = matrix.length
    const cols = matrix[0].length

    // Check if all values are numbers
    if (!matrix.every(row => row.every(v => typeof v === 'number' && !isNaN(v)))) {
      return { isSequence: false }
    }

    // For 1x1, no sequence
    if (rows === 1 && cols === 1) {
      return { isSequence: false }
    }

    // For 1D (single row or single column), use existing detectSequence
    if (rows === 1) {
      const sequenceInfo = detectSequence(matrix[0])
      return sequenceInfo.isSequence ? { isSequence: true, stepCol: sequenceInfo.step } : { isSequence: false }
    }
    if (cols === 1) {
      const columnValues = matrix.map(row => row[0])
      const sequenceInfo = detectSequence(columnValues)
      return sequenceInfo.isSequence ? { isSequence: true, stepRow: sequenceInfo.step } : { isSequence: false }
    }

    // For 2D matrix, check if it's a sequence
    // Check horizontal step (difference between columns in same row)
    let stepCol: number | undefined = undefined
    if (cols > 1) {
      const firstRowDiffs: number[] = []
      for (let c = 1; c < cols; c++) {
        firstRowDiffs.push(matrix[0][c] - matrix[0][c - 1])
      }
      const firstDiff = firstRowDiffs[0]
      const tolerance = 0.0001
      if (firstRowDiffs.every(diff => Math.abs(diff - firstDiff) < tolerance) && Math.abs(firstDiff) > tolerance) {
        stepCol = firstDiff
      }
    }

    // Check vertical step (difference between rows in same column)
    let stepRow: number | undefined = undefined
    if (rows > 1) {
      const firstColDiffs: number[] = []
      for (let r = 1; r < rows; r++) {
        firstColDiffs.push(matrix[r][0] - matrix[r - 1][0])
      }
      const firstDiff = firstColDiffs[0]
      const tolerance = 0.0001
      if (firstColDiffs.every(diff => Math.abs(diff - firstDiff) < tolerance) && Math.abs(firstDiff) > tolerance) {
        stepRow = firstDiff
      }
    }

    // If both steps exist, verify consistency across the entire matrix
    if (stepRow !== undefined && stepCol !== undefined) {
      // Verify: each cell should be firstCell + (row * stepRow) + (col * stepCol)
      const firstValue = matrix[0][0]
      let isConsistent = true
      const tolerance = 0.0001
      
      for (let r = 0; r < rows && isConsistent; r++) {
        for (let c = 0; c < cols && isConsistent; c++) {
          const expectedValue = firstValue + (r * stepRow) + (c * stepCol)
          if (Math.abs(matrix[r][c] - expectedValue) > tolerance) {
            isConsistent = false
          }
        }
      }
      
      if (isConsistent) {
        return { isSequence: true, stepRow, stepCol }
      }
    }

    return { isSequence: false }
  }, [detectSequence])

  // Handle fill pattern (Excel-like autofill behavior)
  const onFillPattern = useCallback((event: {
    patternSource: { x: number; y: number; width: number; height: number }
    fillDestination: { x: number; y: number; width: number; height: number }
    preventDefault: () => void
  }) => {
    const cellsEditedHandler = onCellsEditedRef.current
    if (!cellsEditedHandler) {
      fillPatternRef.current = null
      return
    }

    const { patternSource, fillDestination } = event
    
    // Check if we're extending the selection
    const isExtending = fillDestination.width > patternSource.width || fillDestination.height > patternSource.height
    if (!isExtending) {
      fillPatternRef.current = null
      return
    }

    // Get all cells from pattern source using getCellContent for consistency
    const patternMatrix: Array<Array<{ cell: Item; gridCell: GridCell }>> = []
    for (let y = patternSource.y; y < patternSource.y + patternSource.height; y++) {
      const row: Array<{ cell: Item; gridCell: GridCell }> = []
      for (let x = patternSource.x; x < patternSource.x + patternSource.width; x++) {
        if (y >= sortedUnits.length || x >= visibleColumns.length) continue
        
        const column = visibleColumns[x]
        const key = column?.id as string
        const sourceRowUnit = sortedUnits[y]
        if (!key || isCellEffectivelyReadonly(key, sourceRowUnit)) continue

        const cell: Item = [x, y]
        const gridCell = getCellContent(cell)
        row.push({ cell, gridCell })
      }
      if (row.length > 0) {
        patternMatrix.push(row)
      }
    }

    if (patternMatrix.length === 0 || patternMatrix[0].length === 0) {
      fillPatternRef.current = null
      return
    }

    // Determine selection type
    const sourceWidth = patternSource.width
    const sourceHeight = patternSource.height
    const isSingleCell = sourceWidth === 1 && sourceHeight === 1
    const isLine1D = (sourceWidth === 1 && sourceHeight > 1) || (sourceWidth > 1 && sourceHeight === 1)
    const isMatrix2D = sourceWidth > 1 && sourceHeight > 1

    // Extract numeric values for sequence detection (only for NumberCell)
    const numericMatrix: number[][] = []
    let allNumeric = true
    
    for (let r = 0; r < patternMatrix.length; r++) {
      const row: number[] = []
      for (let c = 0; c < patternMatrix[r].length; c++) {
        const { gridCell } = patternMatrix[r][c]
        if (gridCell.kind === GridCellKind.Number) {
          const numData = (gridCell as NumberCell).data
          if (typeof numData === 'number' && !isNaN(numData)) {
            row.push(numData)
        } else {
            row.push(NaN)
            allNumeric = false
          }
        } else {
          row.push(NaN)
          allNumeric = false
        }
      }
      numericMatrix.push(row)
    }

    // Detect sequence (only if all cells are numbers)
    let sequenceInfo: { isSequence: boolean; stepRow?: number; stepCol?: number; step?: number } = { isSequence: false }
    
    if (allNumeric) {
      if (isMatrix2D) {
        sequenceInfo = detectSequence2D(numericMatrix)
      } else if (isLine1D) {
        const values = sourceHeight > 1 
          ? numericMatrix.map(row => row[0]) 
          : numericMatrix[0]
        const seqInfo = detectSequence(values)
        if (seqInfo.isSequence && seqInfo.step !== undefined) {
          sequenceInfo = sourceHeight > 1 
            ? { isSequence: true, stepRow: seqInfo.step }
            : { isSequence: true, stepCol: seqInfo.step }
        }
      }
    }

    // Prevent default behavior - we'll handle it manually
    event.preventDefault()

    // Calculate cells to fill
    const cellsToFill: EditListItem[] = []
    const destWidth = fillDestination.width
    const destHeight = fillDestination.height

    // Calculate extension dimensions
    const extendWidth = destWidth - sourceWidth
    const extendHeight = destHeight - sourceHeight

    if (isSingleCell) {
      // SINGLE_CELL_CLONE: Single cell - clone value exactly in all directions
      const sourceCell = patternMatrix[0][0]
      const sourceValue = sourceCell.gridCell
      const sourceX = patternSource.x
      const sourceY = patternSource.y

      // Calculate the actual destination rectangle
      const destX = fillDestination.x
      const destY = fillDestination.y
      const destEndX = destX + destWidth
      const destEndY = destY + destHeight

      // Fill all cells in the destination rectangle except the source cell
      for (let y = destY; y < destEndY; y++) {
        for (let x = destX; x < destEndX; x++) {
          // Skip the source cell itself
          if (x === sourceX && y === sourceY) continue
          
          // Skip if out of bounds
          if (y < 0 || y >= sortedUnits.length || x < 0 || x >= visibleColumns.length) continue
          
          const column = visibleColumns[x]
          const key = column?.id as string
          const destRowUnit = sortedUnits[y]
          if (!key || isCellEffectivelyReadonly(key, destRowUnit)) continue

          const targetCell: Item = [x, y]
          // Only include editable cell types
          if (sourceValue.kind === GridCellKind.Text || sourceValue.kind === GridCellKind.Number || sourceValue.kind === GridCellKind.Boolean) {
            cellsToFill.push({
              location: targetCell,
              value: { ...sourceValue } as EditableGridCell,
            })
          }
        }
      }
    } else if (isLine1D && !sequenceInfo.isSequence) {
      // LINEAR_PATTERN_REPEAT: Line 1D without sequence - repeat pattern cyclically in all directions
      const isVertical = sourceHeight > sourceWidth
      const patternLength = isVertical ? sourceHeight : sourceWidth
      
      // Calculate the actual destination rectangle
      const destX = fillDestination.x
      const destY = fillDestination.y
      const destEndX = destX + destWidth
      const destEndY = destY + destHeight
      const sourceX = patternSource.x
      const sourceY = patternSource.y

      // Fill all cells in the destination rectangle
      for (let y = destY; y < destEndY; y++) {
        for (let x = destX; x < destEndX; x++) {
          // Skip source cells
          if (isVertical) {
            // For vertical pattern, skip cells in the source column within source rows
            if (x === sourceX && y >= sourceY && y < sourceY + sourceHeight) continue
          } else {
            // For horizontal pattern, skip cells in the source row within source columns
            if (y === sourceY && x >= sourceX && x < sourceX + sourceWidth) continue
          }
          
          // Skip if out of bounds
          if (y < 0 || y >= sortedUnits.length || x < 0 || x >= visibleColumns.length) continue
          
          const column = visibleColumns[x]
          const key = column?.id as string
          const destRowUnit = sortedUnits[y]
          if (!key || isCellEffectivelyReadonly(key, destRowUnit)) continue

          // Calculate which cell in the pattern to use
          let sourceCell: { cell: Item; gridCell: GridCell }
          
          if (isVertical) {
            // Vertical pattern [A][B] (2×1)
            // When extending in same column: repeat pattern vertically
            // When extending horizontally: repeat entire column pattern
            
            if (x === sourceX) {
              // Same column: repeat pattern vertically [A, B, A, B, ...]
              const relativeY = y - sourceY
              const normalizedY = ((relativeY % patternLength) + patternLength) % patternLength
              sourceCell = patternMatrix[normalizedY][0]
            } else {
              // Different column: repeat entire column pattern
              // For each row, use the same pattern position as the source row
              const relativeY = y - sourceY
              const normalizedY = ((relativeY % patternLength) + patternLength) % patternLength
              sourceCell = patternMatrix[normalizedY][0]
            }
          } else {
            // Horizontal pattern [A][B] (1×2)
            // When extending in same row: repeat pattern horizontally
            // When extending vertically: repeat entire row pattern
            
            if (y === sourceY) {
              // Same row: repeat pattern horizontally [A, B, A, B, ...]
              const relativeX = x - sourceX
              const normalizedX = ((relativeX % patternLength) + patternLength) % patternLength
              sourceCell = patternMatrix[0][normalizedX]
            } else {
              // Different row: repeat entire row pattern
              // For each column, use the same pattern position as the source column
              const relativeX = x - sourceX
              const normalizedX = ((relativeX % patternLength) + patternLength) % patternLength
              sourceCell = patternMatrix[0][normalizedX]
            }
          }

          const targetCell: Item = [x, y]
          // Only include editable cell types
          if (sourceCell.gridCell.kind === GridCellKind.Text || sourceCell.gridCell.kind === GridCellKind.Number || sourceCell.gridCell.kind === GridCellKind.Boolean) {
            cellsToFill.push({
              location: targetCell,
              value: { ...sourceCell.gridCell } as EditableGridCell,
            })
          }
        }
      }
    } else if (isLine1D && sequenceInfo.isSequence) {
      // LINEAR_SEQUENCE: Line 1D with sequence - extend sequence in all directions
      const isVertical = sourceHeight > sourceWidth
      const step = sequenceInfo.stepRow ?? sequenceInfo.stepCol ?? 0
      if (step === 0) {
        fillPatternRef.current = null
        return
      }
      
      // Get first and last values from the pattern
      const firstValue = isVertical 
        ? numericMatrix[0][0]
        : numericMatrix[0][0]
      const lastValue = isVertical 
        ? numericMatrix[numericMatrix.length - 1][0]
        : numericMatrix[0][numericMatrix[0].length - 1]
      
      // Calculate the actual destination rectangle
      const destX = fillDestination.x
      const destY = fillDestination.y
      const destEndX = destX + destWidth
      const destEndY = destY + destHeight
      const sourceX = patternSource.x
      const sourceY = patternSource.y

      // Fill all cells in the destination rectangle
      for (let y = destY; y < destEndY; y++) {
        for (let x = destX; x < destEndX; x++) {
          // Skip source cells
          if (isVertical) {
            // For vertical pattern, skip cells in the source column within source rows
            if (x === sourceX && y >= sourceY && y < sourceY + sourceHeight) continue
          } else {
            // For horizontal pattern, skip cells in the source row within source columns
            if (y === sourceY && x >= sourceX && x < sourceX + sourceWidth) continue
          }
          
          // Skip if out of bounds
          if (y < 0 || y >= sortedUnits.length || x < 0 || x >= visibleColumns.length) continue
          
          const column = visibleColumns[x]
          const key = column?.id as string
          const destRowUnitSeq = sortedUnits[y]
          if (!key || isCellEffectivelyReadonly(key, destRowUnitSeq)) continue

          // AXIS_AWARE_SEQUENCE: Check if fill is on same axis or perpendicular
          let shouldExtendSequence = false
          let sourceCell: { cell: Item; gridCell: GridCell } | null = null
          let newValue: number | null = null
          
          if (isVertical) {
            // Vertical pattern [1][2] (2×1) - sequence axis is vertical
            const relativeY = y - sourceY
            
            if (x === sourceX) {
              // Same column: fill is on same axis (vertical) → EXTEND SEQUENCE
              shouldExtendSequence = true
              if (relativeY >= sourceHeight) {
                // Extending downward: continue from lastValue
                const offset = relativeY - sourceHeight + 1
                newValue = lastValue + (step * offset)
              } else if (relativeY < 0) {
                // Extending upward: continue from firstValue (inverse direction)
                const offset = Math.abs(relativeY)
                newValue = firstValue - (step * offset)
              } else {
                // This shouldn't happen (we skip source cells), but handle it
                continue
              }
            } else {
              // Different column: fill is on perpendicular axis (horizontal) → REPEAT PATTERN
              shouldExtendSequence = false
              const patternIndex = ((relativeY % sourceHeight) + sourceHeight) % sourceHeight
              sourceCell = patternMatrix[patternIndex][0]
            }
          } else {
            // Horizontal pattern [1][2] (1×2) - sequence axis is horizontal
            const relativeX = x - sourceX
            
            if (y === sourceY) {
              // Same row: fill is on same axis (horizontal) → EXTEND SEQUENCE
              shouldExtendSequence = true
              if (relativeX >= sourceWidth) {
                // Extending rightward: continue from lastValue
                const offset = relativeX - sourceWidth + 1
                newValue = lastValue + (step * offset)
              } else if (relativeX < 0) {
                // Extending leftward: continue from firstValue (inverse direction)
                const offset = Math.abs(relativeX)
                newValue = firstValue - (step * offset)
              } else {
                // This shouldn't happen (we skip source cells), but handle it
                continue
              }
            } else {
              // Different row: fill is on perpendicular axis (vertical) → REPEAT PATTERN
              shouldExtendSequence = false
              const patternIndex = ((relativeX % sourceWidth) + sourceWidth) % sourceWidth
              sourceCell = patternMatrix[0][patternIndex]
            }
          }

          const targetCell: Item = [x, y]
          
          if (shouldExtendSequence && newValue !== null) {
            // Extend sequence: create new NumberCell with calculated value
            cellsToFill.push({
              location: targetCell,
              value: {
                kind: GridCellKind.Number,
                data: newValue,
                displayData: newValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
                allowOverlay: true,
                readonly: false,
              } as NumberCell,
            })
          } else if (!shouldExtendSequence && sourceCell) {
            // Repeat pattern: use the source cell's GridCell (works for all types)
            if (sourceCell.gridCell.kind === GridCellKind.Text || sourceCell.gridCell.kind === GridCellKind.Number || sourceCell.gridCell.kind === GridCellKind.Boolean) {
              cellsToFill.push({
                location: targetCell,
                value: { ...sourceCell.gridCell } as EditableGridCell,
              })
            }
          }
        }
      }
    } else if (isMatrix2D && !sequenceInfo.isSequence) {
      // MATRIX_PATTERN_REPEAT: Matrix 2D without sequence - repeat matrix as a complete block in all directions
      // Calculate the actual destination rectangle
      const destX = fillDestination.x
      const destY = fillDestination.y
      const destEndX = destX + destWidth
      const destEndY = destY + destHeight
      const sourceX = patternSource.x
      const sourceY = patternSource.y

      // Fill all cells in the destination rectangle
      for (let y = destY; y < destEndY; y++) {
        for (let x = destX; x < destEndX; x++) {
          // Skip source cells
          if (y >= sourceY && y < sourceY + sourceHeight && x >= sourceX && x < sourceX + sourceWidth) continue
          
          // Skip if out of bounds
          if (y < 0 || y >= sortedUnits.length || x < 0 || x >= visibleColumns.length) continue
          
          const column = visibleColumns[x]
          const key = column?.id as string
          const destRowUnitMat = sortedUnits[y]
          if (!key || isCellEffectivelyReadonly(key, destRowUnitMat)) continue

          // Calculate which cell in the pattern matrix to use
          // Use modulo to repeat the pattern cyclically
          // Handle negative positions (extending leftward or upward)
          const relativeY = y - sourceY
          const relativeX = x - sourceX
          
          // Normalize to positive values using modulo
          const patternRow = ((relativeY % sourceHeight) + sourceHeight) % sourceHeight
          const patternCol = ((relativeX % sourceWidth) + sourceWidth) % sourceWidth
          
          const sourceCell = patternMatrix[patternRow][patternCol]
          
          const targetCell: Item = [x, y]
          // Only include editable cell types
          if (sourceCell.gridCell.kind === GridCellKind.Text || sourceCell.gridCell.kind === GridCellKind.Number || sourceCell.gridCell.kind === GridCellKind.Boolean) {
            cellsToFill.push({
              location: targetCell,
              value: { ...sourceCell.gridCell } as EditableGridCell,
            })
          }
        }
      }
    } else if (isMatrix2D && sequenceInfo.isSequence) {
      // MATRIX_SEQUENCE: Matrix 2D with sequence - extend sequence maintaining shape in all directions
      const stepRow = sequenceInfo.stepRow ?? 0
      const stepCol = sequenceInfo.stepCol ?? 0
      if (stepRow === 0 && stepCol === 0) {
        fillPatternRef.current = null
        return
      }
      
      // Get the first value from the source matrix (top-left corner)
      // This is our reference point for the sequence formula
      const firstValue = numericMatrix[0][0]
      
      // Calculate the actual destination rectangle
      const destX = fillDestination.x
      const destY = fillDestination.y
      const destEndX = destX + destWidth
      const destEndY = destY + destHeight
      const sourceX = patternSource.x
      const sourceY = patternSource.y

      // Fill all cells in the destination rectangle
      // Formula for matrix sequence: value = firstValue + (row * stepRow) + (col * stepCol)
      // where row and col are relative to the first cell (0,0) of the source matrix
      for (let y = destY; y < destEndY; y++) {
        for (let x = destX; x < destEndX; x++) {
          // Skip source cells
          if (y >= sourceY && y < sourceY + sourceHeight && x >= sourceX && x < sourceX + sourceWidth) continue
          
          // Skip if out of bounds
          if (y < 0 || y >= sortedUnits.length || x < 0 || x >= visibleColumns.length) continue
          
          const column = visibleColumns[x]
          const key = column?.id as string
          const destRowUnitMatSeq = sortedUnits[y]
          if (!key || isCellEffectivelyReadonly(key, destRowUnitMatSeq)) continue

          // Calculate position relative to the first cell of the source matrix
          // The first cell is at (sourceY, sourceX), so:
          const relativeRow = y - sourceY
          const relativeCol = x - sourceX
          
          // Calculate the new value using the sequence formula
          // This formula works for all directions (positive and negative offsets)
          const newValue = firstValue + (relativeRow * stepRow) + (relativeCol * stepCol)
          
          const targetCell: Item = [x, y]
          cellsToFill.push({
            location: targetCell,
            value: {
              kind: GridCellKind.Number,
              data: newValue,
              displayData: newValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
              allowOverlay: true,
              readonly: false,
            } as NumberCell,
          })
        }
      }
    }

    // Apply the filled values with type validation
    if (cellsToFill.length > 0) {
      // Validate types and collect incompatible cells
      const validatedCells: EditListItem[] = []
      const incompatibleCells: Array<{ location: Item; sourceType: CellDataType; destType: CellDataType; sourceValue: string; destKey: string }> = []
      const formatValForAlert = (v: GridCell): string => {
        if (v.kind === GridCellKind.Text) { const s = String((v as any).data ?? ""); return s.length > 50 ? s.slice(0, 50) + "…" : s }
        if (v.kind === GridCellKind.Number) return String((v as any).data ?? "")
        if (v.kind === GridCellKind.Boolean) return (v as any).data ? "true" : "false"
        return String((v as any).data ?? "").slice(0, 50)
      }
      
      cellsToFill.forEach(({ location, value }) => {
        const [col, row] = location
        const column = visibleColumns[col]
        const unit = row >= 0 && row < sortedUnits.length ? sortedUnits[row] : undefined
        
        if (!unit || !column) return
        
        const destKey = column.id as string
        if (!destKey || isCellEffectivelyReadonly(destKey, unit)) return

        // Get destination cell type
        const destCell = getCellContent(location)
        const destType = getCellDataType(destKey, destCell, dropdownFields)
        
        // Get source cell type from the original pattern
        // Determine which source cell this value came from
        let sourceType: CellDataType
        let sourceKey = destKey // Default to same key
        
        // For fill pattern, determine source based on pattern position
        let sourcePatternCell: { cell: Item; gridCell: GridCell } | null = null
        if (isSingleCell) {
          sourcePatternCell = patternMatrix[0][0]
        } else if (isLine1D) {
          const isVertical = sourceHeight > sourceWidth
          if (isVertical) {
            const relativeY = row - patternSource.y
            const patternIndex = ((relativeY % sourceHeight) + sourceHeight) % sourceHeight
            sourcePatternCell = patternMatrix[patternIndex]?.[0] || patternMatrix[0][0]
          } else {
            const relativeX = col - patternSource.x
            const patternIndex = ((relativeX % sourceWidth) + sourceWidth) % sourceWidth
            sourcePatternCell = patternMatrix[0]?.[patternIndex] || patternMatrix[0][0]
          }
        } else if (isMatrix2D) {
          const relativeY = row - patternSource.y
          const relativeX = col - patternSource.x
          const patternRow = ((relativeY % sourceHeight) + sourceHeight) % sourceHeight
          const patternCol = ((relativeX % sourceWidth) + sourceWidth) % sourceWidth
          sourcePatternCell = patternMatrix[patternRow]?.[patternCol] || patternMatrix[0][0]
        }
        
        if (sourcePatternCell) {
          const [sourceCol, sourceRow] = sourcePatternCell.cell
          const sourceColumn = visibleColumns[sourceCol]
          const sourceKeyCheck = sourceColumn?.id as string
          if (sourceKeyCheck) {
            sourceKey = sourceKeyCheck
            sourceType = getCellDataType(sourceKeyCheck, sourcePatternCell.gridCell, dropdownFields)
          } else {
            // Fallback to value kind
            if (value.kind === GridCellKind.Boolean) {
              sourceType = 'BOOLEAN'
            } else if (value.kind === GridCellKind.Number) {
              sourceType = 'NUMBER'
            } else {
              sourceType = 'TEXT'
            }
          }
        } else {
          // Fallback to value kind
          if (value.kind === GridCellKind.Boolean) {
            sourceType = 'BOOLEAN'
          } else if (value.kind === GridCellKind.Number) {
            sourceType = 'NUMBER'
          } else {
            sourceType = 'TEXT'
          }
        }
        
        // Validate type compatibility
        if (isTypeCompatible(sourceType, sourceKey, destType, destKey)) {
          validatedCells.push({ location, value })
        } else {
          incompatibleCells.push({ location, sourceType, destType, sourceValue: formatValForAlert(value), destKey })
        }
      })
      
      // If there are incompatible cells, show alert and abort
      if (incompatibleCells.length > 0) {
        const first = incompatibleCells[0]
        const sourceTypeName = first.sourceType
        const destTypeName = first.destType
        const plural = incompatibleCells.length > 1 ? 's' : ''
        const [ic, ir] = first.location
        const cellRef = gridCellToSpreadsheetRef(ic, ir)
        setTypeValidationAlert({
          open: true,
          message: t('typeIncompatibility', { 
            operation: t('typeIncompatibilityOperationExtend'),
            sourceType: sourceTypeName, 
            destType: destTypeName,
            count: incompatibleCells.length,
            plural
          }) || `No se puede extender valores de tipo ${sourceTypeName} a celdas de tipo ${destTypeName}. Revise la selección o el destino. (${incompatibleCells.length} celda${plural} afectada${plural})`,
          details: {
            sourceValue: first.sourceValue,
            sourceType: sourceTypeName,
            destColumnLabel: getFieldDisplayName(first.destKey),
            destType: destTypeName,
            count: incompatibleCells.length > 1 ? incompatibleCells.length : undefined,
            cellRef,
            cellRow1Based: ir + 1,
          },
          detailsExpanded: false,
        })
        fillPatternRef.current = null
        return
      }
      
      // Update dataRef immediately with validated cells only
      validatedCells.forEach(({ location, value }) => {
        const [col, row] = location
        const column = visibleColumns[col]
        const unit = row >= 0 && row < sortedUnits.length ? sortedUnits[row] : undefined
        
        if (!unit || !column) return
        
        const key = column.id as string
        if (!key || isCellEffectivelyReadonly(key, unit)) return

        // Update unit based on cell type (same logic as onCellsEdited)
        if (value.kind === GridCellKind.Number) {
          const numValue = (value as NumberCell).data
          if (!key.includes(".")) {
            (unit as any)[key] = numValue
          }
        } else if (value.kind === GridCellKind.Boolean) {
          const boolValue = (value as BooleanCell).data
          if (!key.includes(".")) {
            (unit as any)[key] = boolValue
          }
        } else if (value.kind === GridCellKind.Text) {
          const textValue = (value as any).data || ""
          // Remove "▼ " prefix for dropdown fields
          const cleanValue = String(textValue).replace(/^▼\s*/, "")
          
          // Handle dropdown fields
          if (key === "parkingType") {
            const selectedParkingType = parkingTypes.find(pt => pt.name === cleanValue)
            if (selectedParkingType) {
              unit.parkingType = {
                documentId: selectedParkingType.documentId || String(selectedParkingType.id || ""),
                id: selectedParkingType.id,
                name: selectedParkingType.name,
                code: selectedParkingType.code,
              }
            }
          } else if (key === "topography") {
            const selectedTopography = topographies.find(t => t.name === cleanValue)
            if (selectedTopography) {
              unit.topography = {
                documentId: selectedTopography.documentId || String(selectedTopography.id || ""),
                id: selectedTopography.id,
                name: selectedTopography.name,
                code: selectedTopography.code,
              }
            }
          } else if (key === "unitUsage") {
            const selectedUnitUsage = unitUsages.find(uu => 
              uu.name?.toLowerCase() === cleanValue.toLowerCase() ||
              uu.code?.toLowerCase() === cleanValue.toLowerCase()
            )
            if (selectedUnitUsage) {
              unit.unitUsage = {
                documentId: selectedUnitUsage.documentId || String(selectedUnitUsage.id || ""),
                id: selectedUnitUsage.id,
                name: selectedUnitUsage.name,
                code: selectedUnitUsage.code,
              }
            }
          } else if (key === "availability") {
            const availabilityValue = cleanValue === "Disponible" ? "Available" : 
                                     cleanValue === "No Disponible" ? "Not Available" : 
                                     cleanValue
            unit.availability = availabilityValue as "Available" | "Not Available" | undefined
          } else if (!key.includes(".")) {
            (unit as any)[key] = cleanValue
          }
        }
      })

      // No need to force refresh - grid will update automatically via getCellContent

      // Trigger onCellsEdited to save to API (only validated cells)
      cellsEditedHandler(validatedCells)
    }

    fillPatternRef.current = null
  }, [
    detectSequence,
    detectSequence2D,
    getCellContent,
    onCellsEditedRef,
    parkingTypes,
    topographies,
    unitUsages,
    getFieldDisplayName,
    sortedUnits,
    isCellEffectivelyReadonly,
    visibleColumns,
    dropdownFields,
    isTypeCompatible,
    setTypeValidationAlert,
    t,
  ])

  // Format cell value for type-error display (truncate if long)
  const formatCellValueForAlert = useCallback((value: GridCell): string => {
    if (value.kind === GridCellKind.Text) return String(value.data ?? "").slice(0, 50) + (String(value.data ?? "").length > 50 ? "…" : "")
    if (value.kind === GridCellKind.Number) return String(value.data ?? "")
    if (value.kind === GridCellKind.Boolean) return value.data ? "true" : "false"
    return String((value as any).data ?? "").slice(0, 50)
  }, [])

  // Handle multiple cells edited
  const onCellsEdited = useCallback((newValues: readonly EditListItem[]): boolean => {
    const keys = newValues.map(({ location }) => visibleColumns[location[0]]?.id).filter(Boolean)
    // Validate types before applying edits
    const incompatibleCells: Array<{ location: Item; sourceType: CellDataType; destType: CellDataType; sourceValue: string; destKey: string }> = []
    const validatedValues: EditListItem[] = []

    newValues.forEach(({ location, value: newValue }) => {
      const cell = location
      const [col, row] = cell
      const column = visibleColumns[col]
      const unit = row >= 0 && row < sortedUnits.length ? sortedUnits[row] : undefined

      if (!unit || !column) return

      const destKey = column.id as string
      if (!destKey || isCellEffectivelyReadonly(destKey, unit)) {
        if (destKey) showHabitableErrorIfNeeded(destKey, unit as Record<string, unknown>)
        return
      }

      // Get destination cell type
      const destCell = getCellContent(location)
      const destType = getCellDataType(destKey, destCell, dropdownFields)
      
      // Get source cell type from newValue
      let sourceType: CellDataType
      let sourceKey = destKey // Default to same key
      
      if (newValue.kind === GridCellKind.Boolean) {
        sourceType = 'BOOLEAN'
      } else if (newValue.kind === GridCellKind.Number) {
        sourceType = 'NUMBER'
      } else if (newValue.kind === GridCellKind.Text) {
        // Check if it's a dropdown
        if (dropdownFields.includes(destKey)) {
          // For dropdown, we need to check if the value came from the same dropdown field
          // Since we're editing, assume it's the same field if it's a dropdown destination
          sourceType = 'DROPDOWN'
          sourceKey = destKey
        } else {
          sourceType = 'TEXT'
        }
      } else {
        sourceType = 'TEXT'
      }
      
      // Validate type compatibility
      if (isTypeCompatible(sourceType, sourceKey, destType, destKey)) {
        validatedValues.push({ location, value: newValue })
      } else {
        incompatibleCells.push({
          location,
          sourceType,
          destType,
          sourceValue: formatCellValueForAlert(newValue),
          destKey,
        })
      }
    })
    
    // If there are incompatible cells, show alert and abort
    if (incompatibleCells.length > 0) {
      const first = incompatibleCells[0]
      const sourceTypeName = first.sourceType
      const destTypeName = first.destType
      const plural = incompatibleCells.length > 1 ? 's' : ''
      const [ic, ir] = first.location
      const cellRef = gridCellToSpreadsheetRef(ic, ir)
      setTypeValidationAlert({
        open: true,
        message: t('typeIncompatibility', { 
          operation: t('typeIncompatibilityOperationEdit'),
          sourceType: sourceTypeName, 
          destType: destTypeName,
          count: incompatibleCells.length,
          plural
        }) || `No se puede editar con valores de tipo ${sourceTypeName} a celdas de tipo ${destTypeName}. Revise la selección o el destino. (${incompatibleCells.length} celda${plural} afectada${plural})`,
        details: {
          sourceValue: first.sourceValue,
          sourceType: sourceTypeName,
          destColumnLabel: getFieldDisplayName(first.destKey),
          destType: destTypeName,
          count: incompatibleCells.length > 1 ? incompatibleCells.length : undefined,
          cellRef,
          cellRow1Based: ir + 1,
        },
        detailsExpanded: false,
      })
      return false // Abort the operation
    }
    
    // Save state before edits
    addToHistory([...dataRef.current])
    
    validatedValues.forEach(({ location, value: newValue }) => {
      const cell = location
      const [col, row] = cell
      const originalRow = gridRowToDataRefIndex(row)
      const column = visibleColumns[col]
      const unit = originalRow >= 0 ? dataRef.current[originalRow] : undefined

      if (!unit || !column) return

      const key = column.id as string
      if (!key || isCellEffectivelyReadonly(key, unit)) {
        if (key) showHabitableErrorIfNeeded(key, unit as Record<string, unknown>)
        return
      }

      // Handle currency conversion: map currency field to USD field
      const usdKey = currencyToUsdMap[key] || key
      const isCurrencyField = key in currencyToUsdMap
      // Extract currency code from field name
      let currencyCode = ''
      if (isCurrencyField) {
        for (const currency of activeCurrencies) {
          if (key.includes(currency.code.toUpperCase())) {
            currencyCode = currency.code
            break
          }
        }
      }
      
      // Handle varas² conversion: map varas² field to mts² field
      const targetKey = varasToM2Map[usdKey] || usdKey
      const isVarasField = usdKey in varasToM2Map

      // Check if this cell was deleted by onDelete - if so, skip API request
      // (onDelete already made the request)
      const cellKey = `${row}:${col}`
      if (deletedCellsRef.current.has(cellKey)) {
        // Remove from set and skip API request
        deletedCellsRef.current.delete(cellKey)
        // Still update the value in memory if needed, but don't make API request
        // The value was already cleared by onDelete
        return
      }

      // Skip API update if this is a new unit (no documentId or id)
      // New units will be saved only when user clicks Save button
      if (isNewUnit(unit)) {
        // Just update the unit in memory, don't call API
        // Extract value and update unit locally (similar logic to onCellEdited)
        let cellValue: unknown
        if (newValue.kind === GridCellKind.Number) {
          const num = newValue.data ?? 0
          // Convert currency to USD or varas to mts² (max 2 decimales)
          if (isCurrencyField) {
            const buyRate = getBuyRate(currencyCode)
            cellValue = num / buyRate
          } else {
            cellValue = isVarasField ? num / getVarasFactor(usdKey) : roundTo2(num)
          }
        } else if (newValue.kind === GridCellKind.Boolean) {
          cellValue = newValue.data
        } else if (newValue.kind === GridCellKind.Text && dropdownFields.includes(key)) {
          cellValue = String(newValue.data || "").replace(/^▼\s*/, "")
        } else if (newValue.kind === GridCellKind.Text) {
          cellValue = newValue.data
        } else {
          return
        }

        // Update the unit in memory
        if (targetKey === "parkingType") {
          const selectedParkingType = parkingTypes.find(pt => pt.name === cellValue)
          if (selectedParkingType) {
            unit.parkingType = {
              documentId: selectedParkingType.documentId || String(selectedParkingType.id || ""),
              id: selectedParkingType.id,
              name: selectedParkingType.name,
              code: selectedParkingType.code,
            }
          }
        } else if (targetKey === "topography") {
          const selectedTopography = topographies.find(t => t.name === cellValue)
          if (selectedTopography) {
            unit.topography = {
              documentId: selectedTopography.documentId || String(selectedTopography.id || ""),
              id: selectedTopography.id,
              name: selectedTopography.name,
              code: selectedTopography.code,
            }
          }
        } else if (targetKey === "unitUsage") {
          const selectedUnitUsage = unitUsages.find(uu => 
            uu.name?.toLowerCase() === String(cellValue).toLowerCase() ||
            uu.code?.toLowerCase() === String(cellValue).toLowerCase()
          )
          if (selectedUnitUsage) {
            unit.unitUsage = {
              documentId: selectedUnitUsage.documentId || String(selectedUnitUsage.id || ""),
              id: selectedUnitUsage.id,
              name: selectedUnitUsage.name,
              code: selectedUnitUsage.code,
            }
          }
        } else if (targetKey === "unitType") {
          const comp = labelToComponent(String(cellValue), unitTypeLabels)
          if (comp) {
            unit.unitType = [emptyUnitTypeEntry(comp)]
            delete (unit as StrapiUnit & { type?: unknown }).type
          } else {
            delete unit.unitType
            delete (unit as StrapiUnit & { type?: unknown }).type
          }
        } else if (targetKey === "availability") {
          const availabilityValue = String(cellValue) === "Disponible" ? "Available" :
                                   String(cellValue) === "No Disponible" ? "Not Available" :
                                   String(cellValue)
          unit.availability = availabilityValue as "Available" | "Not Available" | undefined
          syncUnitAbsorption(unit as any, blockCollectionDate, blockStartDate)
          syncUnitAbsorptionPerM2(unit as any)
        } else if (resolveUnitTypeDynamicColumn(key)) {
          applyUnitTypeDynamicLocalChange(
            unit,
            key,
            coerceOfficesDzEnumColumnValue(key, cellValue, t),
            { source: "grid", roundTo2 }
          )
          applyDimensionCascade(unit as any, key, "", true, row + 1)
        } else if (!targetKey.includes(".")) {
          // persist base mts² value or USD value
          (unit as any)[targetKey] = cellValue
          if (
            !isCurrencyField &&
            (targetKey === "totalPriceUSD" ||
              targetKey === "rentalPriceUSD" ||
              targetKey === "maintenanceTotalPriceM2USD")
          ) {
            clearEditableForeignPriceVisuals(unit as any, targetKey, activeCurrencies)
          }
          applyDimensionCascade(unit as any, targetKey, "", true, row + 1)
          applyCascadeRule(unit as any, targetKey, "", true, isCurrencyField, currencyCode, row + 1)

          // When unitNumber changes on a new unit, compute name/code for display (blockName - unitNumber, slugify)
          if (targetKey === "unitNumber") {
            const blockNameForNew = unit.block?.name ?? blockName ?? ""
            const unitNumStr = String(cellValue).trim()
            const computedName = blockNameForNew ? `${blockNameForNew} - ${unitNumStr}` : unitNumStr
            ;(unit as any).name = computedName
            ;(unit as any).code = slugify(computedName)
          }
          // keep visual varas² value for immediate display (avoid stale UI); lo editado prevalece
          if (isVarasField) {
            (unit as any)[key] = newValue.kind === GridCellKind.Number ? (newValue.data ?? cellValue) : cellValue
          } else {
            const varasKey = m2ToVarasMap[targetKey]
            if (varasKey) {
              ;(unit as any)[varasKey] = roundTo2(Number(cellValue || 0) * getVarasFactor(targetKey))
            }
          }
          // keep visual currency value for immediate display
          if (isCurrencyField) {
            (unit as any)[key] = newValue.kind === GridCellKind.Number ? (newValue.data ?? 0) : cellValue
            if (usdKey === "priceWithoutVATUSD") {
              syncPriceFromWithoutVAT(unit as any, unitVatRates(unit as any))
              syncUnitInstallment(unit as any, unitVatRates(unit as any), countryIsoRef.current)
              syncUnitIncome(unit as any)
              clearEditableForeignPriceVisuals(unit as any, "totalPriceUSD", activeCurrencies)
            }
            // unit.pricePerM2USD already set to correct USD value via unit[targetKey] = cellValue
            if (usdKey === "pricePerM2USD") {
              syncPriceFromPerM2(unit as any, unitVatRates(unit as any))
              syncUnitInstallment(unit as any, unitVatRates(unit as any), countryIsoRef.current)
              syncUnitIncome(unit as any)
              clearEditableForeignPriceVisuals(unit as any, "totalPriceUSD", activeCurrencies)
            }
            if (usdKey === "rentalPriceWithoutVATUSD") {
              syncRentalFromWithoutVAT(unit as any, unitVatRates(unit as any))
              clearEditableForeignPriceVisuals(unit as any, "rentalPriceUSD", activeCurrencies)
            }
            // unit.rentalPricePerM2WithoutVATUSD already set to correct USD value via unit[targetKey] = cellValue
            if (usdKey === "rentalPricePerM2WithoutVATUSD") {
              syncRentalFromPerM2(unit as any, unitVatRates(unit as any))
              clearEditableForeignPriceVisuals(unit as any, "rentalPriceUSD", activeCurrencies)
            }
            if (usdKey === "maintenanceWithoutVATUSD") {
              syncMaintenanceFromWithoutVAT(unit as any, unitVatRates(unit as any))
              clearEditableForeignPriceVisuals(unit as any, "maintenanceTotalPriceM2USD", activeCurrencies)
            }
            // unit.maintenancePricePerM2USD already set to correct USD value via unit[targetKey] = cellValue
            if (usdKey === "maintenancePricePerM2USD") {
              syncMaintenanceFromPerM2(unit as any, unitVatRates(unit as any))
              clearEditableForeignPriceVisuals(unit as any, "maintenanceTotalPriceM2USD", activeCurrencies)
            }
          }
        }
        return // Exit early, no API call
      }

      const unitId = getUnitRowKey(unit)

      // Extract value
      let cellValue: unknown
      if (newValue.kind === GridCellKind.Number) {
        const num = newValue.data ?? 0
        if (isCurrencyField) {
          const buyRate = getBuyRate(currencyCode)
          cellValue = num / buyRate
        } else {
          cellValue = isVarasField ? num / getVarasFactor(usdKey) : roundTo2(num)
        }
      } else if (newValue.kind === GridCellKind.Boolean) {
        cellValue = newValue.data
      } else if (newValue.kind === GridCellKind.Text && dropdownFields.includes(key)) {
      // For dropdown fields (TextCell), extract the value (remove the "▼ " prefix)
      cellValue = String(newValue.data || "").replace(/^▼\s*/, "")
    } else if ((newValue as any).kind === GridCellKind.Bubble) {
        // For BubbleCell, the data is an array of selected option names
        // We take the last element (most recently added) or first if only one
        const bubbleData = (newValue as any).data
        cellValue = Array.isArray(bubbleData) && bubbleData.length > 0 
          ? bubbleData[bubbleData.length - 1] 
          : ""
      } else if ((newValue as any).kind === GridCellKind.Drilldown) {
        // For DrilldownCell, the data is an array of DrilldownCellData
        // We take the last element's text (most recently added) or first if only one
        const drilldownData = (newValue as any).data
        cellValue = Array.isArray(drilldownData) && drilldownData.length > 0 
          ? drilldownData[drilldownData.length - 1]?.text || ""
          : ""
      } else if (newValue.kind === GridCellKind.Text) {
        cellValue = newValue.data
      } else {
        return
      }

      // Update the unit in the ref
      if (resolveUnitTypeDynamicColumn(key)) {
        const isBalconyKey = key === "housing.balconyTerraceM2" || key === "offices.balconyTerraceM2"
        if (isVerticalRef.current && isBalconyKey && !unitTypeDynamicAppliesToRow(unit as StrapiUnit, key)) {
          const autoComponent = (key.startsWith("offices.") ? "unit-types.offices" : "unit-types.housing") as Parameters<typeof emptyUnitTypeEntry>[0]
          ;(unit as StrapiUnit).unitType = [emptyUnitTypeEntry(autoComponent)]
        }
        const applyOk = applyUnitTypeDynamicLocalChange(
          unit,
          key,
          coerceOfficesDzEnumColumnValue(key, cellValue, t),
          { source: "grid", roundTo2 }
        )
        applyDimensionCascade(unit as any, key, unitId, false, row + 1)
      } else if (targetKey === "parkingType") {
        // Find the parking type by name and update the relation
        const selectedParkingType = parkingTypes.find(pt => pt.name === cellValue)
        if (selectedParkingType) {
          unit.parkingType = {
            documentId: selectedParkingType.documentId || String(selectedParkingType.id || ""),
            id: selectedParkingType.id,
            name: selectedParkingType.name,
            code: selectedParkingType.code,
          }
        }
      } else if (targetKey === "topography") {
        // Find the topography by name and update the relation (same as parkingType)
        const selectedTopography = topographies.find(t => t.name === cellValue)
        if (selectedTopography) {
          unit.topography = {
            documentId: selectedTopography.documentId || String(selectedTopography.id || ""),
            id: selectedTopography.id,
            name: selectedTopography.name,
            code: selectedTopography.code,
          }
        }
      } else if (targetKey === "unitUsage") {
        // Find the unit usage by name and update the relation
        const selectedUnitUsage = unitUsages.find(uu => 
          uu.name?.toLowerCase() === String(cellValue).toLowerCase() ||
          uu.code?.toLowerCase() === String(cellValue).toLowerCase()
        )
        if (selectedUnitUsage) {
          unit.unitUsage = {
            documentId: selectedUnitUsage.documentId || String(selectedUnitUsage.id || ""),
            id: selectedUnitUsage.id,
            name: selectedUnitUsage.name,
            code: selectedUnitUsage.code,
          }
        }
      } else if (targetKey === "unitType") {
        const comp = labelToComponent(String(cellValue), unitTypeLabels)
        if (comp) {
          unit.unitType = [emptyUnitTypeEntry(comp)]
          delete (unit as StrapiUnit & { type?: unknown }).type
        } else {
          delete unit.unitType
          delete (unit as StrapiUnit & { type?: unknown }).type
        }
    } else if (targetKey === "availability") {
      // Map availability display labels to values
      const availabilityValue = String(cellValue) === "Disponible" ? "Available" :
                               String(cellValue) === "No Disponible" ? "Not Available" :
                               String(cellValue)
      unit.availability = availabilityValue as "Available" | "Not Available" | undefined
      syncUnitAbsorption(unit as any, blockCollectionDate, blockStartDate)
      syncUnitAbsorptionPerM2(unit as any)
      addPendingChange(unitId, "unitAbsorption")
      addPendingChange(unitId, "absorptionPerM2")
      } else if (!targetKey.includes(".")) {
        // persist base mts² value or USD value
        (unit as any)[targetKey] = cellValue
        if (
          !isCurrencyField &&
          (targetKey === "totalPriceUSD" ||
            targetKey === "rentalPriceUSD" ||
            targetKey === "maintenanceTotalPriceM2USD")
        ) {
          clearEditableForeignPriceVisuals(unit as any, targetKey, activeCurrencies)
        }
        applyDimensionCascade(unit as any, targetKey, unitId, false, row + 1)
        applyCascadeRule(unit as any, targetKey, unitId, false, isCurrencyField, currencyCode, row + 1)
        // venta, rental and maintenance handled by applyCascadeRule above
        // keep visual varas² value in sync after single edit (max 2 decimales)
        if (isVarasField) {
          (unit as any)[key] = newValue.kind === GridCellKind.Number ? (newValue.data ?? cellValue) : cellValue
        } else {
          const varasKey = m2ToVarasMap[targetKey]
          if (varasKey) {
            ;(unit as any)[varasKey] = roundTo2(Number(cellValue || 0) * getVarasFactor(targetKey))
          }
        }
        // keep visual currency value in sync after single edit
        if (isCurrencyField) {
          (unit as any)[key] = newValue.kind === GridCellKind.Number ? (newValue.data ?? 0) : cellValue
          // cellValue ya está en USD — unit[targetKey] ya fue asignado, solo sincronizar derivados
          if (usdKey === "priceWithoutVATUSD") {
            syncPriceFromWithoutVAT(unit as any, unitVatRates(unit as any))
            syncUnitInstallment(unit as any, unitVatRates(unit as any), countryIsoRef.current)
            syncUnitIncome(unit as any)
            clearEditableForeignPriceVisuals(unit as any, "totalPriceUSD", activeCurrencies)
            addPendingChangeMirrored(unitId, "totalPriceUSD")
            addPendingChangeMirrored(unitId, "pricePerM2USD")
            addPendingChangeMirrored(unitId, "installmentUSD")
            addPendingChangeMirrored(unitId, "incomeUSD")
          }
          // unit.pricePerM2USD already set to correct USD value via unit[targetKey] = cellValue
          if (usdKey === "pricePerM2USD") {
            syncPriceFromPerM2(unit as any, unitVatRates(unit as any))
            syncUnitInstallment(unit as any, unitVatRates(unit as any), countryIsoRef.current)
            syncUnitIncome(unit as any)
            clearEditableForeignPriceVisuals(unit as any, "totalPriceUSD", activeCurrencies)
            addPendingChangeMirrored(unitId, "totalPriceUSD")
            addPendingChangeMirrored(unitId, "priceWithoutVATUSD")
            addPendingChangeMirrored(unitId, "installmentUSD")
            addPendingChangeMirrored(unitId, "incomeUSD")
          }
          if (usdKey === "rentalPriceWithoutVATUSD") {
            syncRentalFromWithoutVAT(unit as any, unitVatRates(unit as any))
            clearEditableForeignPriceVisuals(unit as any, "rentalPriceUSD", activeCurrencies)
            addPendingChangeMirrored(unitId, "rentalPriceUSD")
            addPendingChangeMirrored(unitId, "rentalPricePerM2WithoutVATUSD")
          }
          // unit.rentalPricePerM2WithoutVATUSD already set to correct USD value via unit[targetKey] = cellValue
          if (usdKey === "rentalPricePerM2WithoutVATUSD") {
            syncRentalFromPerM2(unit as any, unitVatRates(unit as any))
            clearEditableForeignPriceVisuals(unit as any, "rentalPriceUSD", activeCurrencies)
            addPendingChangeMirrored(unitId, "rentalPriceUSD")
            addPendingChangeMirrored(unitId, "rentalPriceWithoutVATUSD")
          }
          if (usdKey === "maintenanceWithoutVATUSD") {
            syncMaintenanceFromWithoutVAT(unit as any, unitVatRates(unit as any))
            clearEditableForeignPriceVisuals(unit as any, "maintenanceTotalPriceM2USD", activeCurrencies)
            addPendingChangeMirrored(unitId, "maintenanceWithoutVATUSD")
            addPendingChangeMirrored(unitId, "maintenanceTotalPriceM2USD")
            addPendingChangeMirrored(unitId, "maintenancePricePerM2USD")
          }
          // unit.maintenancePricePerM2USD already set to correct USD value via unit[targetKey] = cellValue
          if (usdKey === "maintenancePricePerM2USD") {
            syncMaintenanceFromPerM2(unit as any, unitVatRates(unit as any))
            clearEditableForeignPriceVisuals(unit as any, "maintenanceTotalPriceM2USD", activeCurrencies)
            addPendingChangeMirrored(unitId, "maintenanceWithoutVATUSD")
            addPendingChangeMirrored(unitId, "maintenanceTotalPriceM2USD")
          }
        }
        // When unitNumber changes, recompute name and code (name = "blockName - unitNumber", code = slugify(name))
        if (targetKey === "unitNumber") {
          const blockNameForUnit = unit.block?.name ?? ""
          const unitNumStr = String(cellValue).trim()
          const computedName = blockNameForUnit ? `${blockNameForUnit} - ${unitNumStr}` : unitNumStr
          const computedCode = slugify(computedName)
          ;(unit as any).name = computedName
          ;(unit as any).code = computedCode
        }
      }

      // Convert value for API
      // Always use USD field (targetKey) for API
      let convertedValue: unknown = cellValue
      
      // Handle parkingType - convert name to documentId
      if (targetKey === "parkingType") {
        const selectedParkingType = parkingTypes.find(pt => 
          pt.name?.toLowerCase() === String(cellValue).toLowerCase() ||
          pt.code?.toLowerCase() === String(cellValue).toLowerCase()
        )
        convertedValue = selectedParkingType?.documentId || selectedParkingType?.id || null
      }
      // Handle topography - convert name to documentId
      else if (targetKey === "topography") {
        const selectedTopography = topographies.find(t => 
          t.name?.toLowerCase() === String(cellValue).toLowerCase() ||
          t.code?.toLowerCase() === String(cellValue).toLowerCase()
        )
        convertedValue = selectedTopography?.documentId || selectedTopography?.id || null
      }
      // Handle unitUsage - convert name to documentId
      else if (targetKey === "unitUsage") {
        const selectedUnitUsage = unitUsages.find(uu => 
          uu.name?.toLowerCase() === String(cellValue).toLowerCase() ||
          uu.code?.toLowerCase() === String(cellValue).toLowerCase()
        )
        convertedValue = selectedUnitUsage?.documentId || selectedUnitUsage?.id || null
      }
      else if (targetKey === "unitType") {
        convertedValue = formatUnitTypeForStrapi(unit.unitType)
      }
      // Handle availability - map display labels to values
      else if (targetKey === "availability") {
        convertedValue = String(cellValue) === "Disponible" ? "Available" : 
                        String(cellValue) === "No Disponible" ? "Not Available" : 
                        String(cellValue)
      }
      else if (resolveUnitTypeDynamicColumn(key)) {
        convertedValue = convertValueForAPI(key, readUnitTypeDynamicValue(unit, key))
      }
      // Boolean fields
      else if (targetKey === "hasParking" || targetKey === "hasMotorcycleParking") {
        convertedValue = Boolean(cellValue)
      }
      // Number fields
      else {
        const numberFields = [
          "frontM2", "depthM2", "landM2",
          "unitSizeM2", "parkingSizeM2",
          "totalSizeM2", "habitableConstructionM2",
          "bathrooms", "parkingSpaces",
          "totalPriceUSD", "priceWithoutVATUSD",
          "pricePerM2USD",
          "rentalPriceUSD", "rentalPriceWithoutVATUSD",
          "rentalPricePerM2WithoutVATUSD",
          "maintenanceTotalPriceM2USD",
          "maintenancePricePerM2USD",
          "installmentUSD", "incomeUSD",
          "unitAbsorption", "absorptionPerM2"
        ]
        
        if (numberFields.includes(targetKey)) {
        convertedValue = typeof cellValue === "number" ? cellValue : parseFloat(String(cellValue)) || 0
        }
      }

      // For relation fields, use the direct field name
      const field =
        targetKey === "parkingType" || targetKey === "unitUsage" || targetKey === "topography" || targetKey === "availability" || targetKey === "unitType"
          ? targetKey
          : getFieldPath(targetKey, unit)

      // Get block documentId from unit in memory (to avoid GET request)
      const blockDocumentId = unit.block?.documentId || unit.block?.id

      // No auto-save: record pending change; Save button will flush to API
      const isUnitNumberEdit = targetKey === "unitNumber"
      if (isUnitNumberEdit) {
        addPendingChanges(unitId, ["unitNumber", "name", "code"])
      } else if (targetKey === "parkingSpaces") {
        // cascade pending (parkingSizeM2, totalSizeM2) manejado por applyDimensionCascade
        addPendingChange(unitId, field)
      } else if (targetKey === "unitSizeM2") {
        // cascade pending fields handled by applyDimensionCascade above; mark only the directly-edited field
        addPendingChange(unitId, field)
      } else if (targetKey === "landM2") {
        // cascade pending fields handled by applyDimensionCascade above (isLote condition checked inside)
        addPendingChange(unitId, field)
      } else if (targetKey === "maintenanceTotalPriceM2USD") {
        addPendingChangesMirrored(unitId, [field, "maintenanceWithoutVATUSD", "maintenancePricePerM2USD"])
      } else {
        const pendingKey = resolveUnitTypeDynamicColumn(key) ? key : field
        addPendingChangeMirrored(unitId, pendingKey)
      }
    })
    
    // Force re-render so visual varas² columns reflect updated mts² after multi-edit
    setRefreshKey(prev => prev + 1)
    return true
  }, [addToHistory, parkingTypes, unitUsages, topographies, unitTypeLabels, isNewUnit, getCellContent, t, blockName, getFieldDisplayName, formatCellValueForAlert, addPendingChange, addPendingChanges, activeCurrencies, blockCollectionDate, blockStartDate, gridRowToDataRefIndex, convertValueForAPI, readUnitTypeDynamicValue, sortedUnits, isCellEffectivelyReadonly, dropdownFields, varasToM2Map, currencyToUsdMap, m2ToVarasMap, applyDimensionCascade, applyCascadeRule])

  // Update ref when onCellsEdited changes (useLayoutEffect to ensure it's available synchronously)
  useLayoutEffect(() => {
    onCellsEditedRef.current = onCellsEdited
  }, [onCellsEdited])

  // Handle delete
  const onDelete = useCallback((selection: GridSelection): boolean => {
    if (!selection.current?.range) return false
    
    addToHistory([...dataRef.current])
    
    const range = selection.current.range
    
    // Handle rangeStack if present
    const rangesToProcess = selection.current.rangeStack && selection.current.rangeStack.length > 0
      ? selection.current.rangeStack
      : [range]
    
    rangesToProcess.forEach((range: { x: number; y: number; width: number; height: number }) => {
      for (let row = range.y; row < range.y + range.height; row++) {
        for (let col = range.x; col < range.x + range.width; col++) {
          if (row < sortedUnits.length && col < visibleColumns.length) {
            const column = visibleColumns[col]
            const unit = sortedUnits[row]
            const key = column.id as string
            
            if (unit && column && key && !isFieldReadonly(key)) {
              // Mark this cell as deleted to prevent duplicate API requests
              const cellKey = `${row}:${col}`
              deletedCellsRef.current.add(cellKey)
              
              // Get neutral value based on field type
              const neutralValue = getNeutralValue(key)
              
              // Clear the value with neutral value based on type
              if (key.includes(".")) {
                if (resolveUnitTypeDynamicColumn(key)) {
                  clearUnitTypeDynamicCell(unit, key, neutralValue)
                }
              } else {
                // Handle relation fields (dropdowns) - set to null
                if (key === "parkingType") {
                  unit.parkingType = null as any
                } else if (key === "unitUsage") {
                  unit.unitUsage = null as any
                } else if (key === "topography") {
                  unit.topography = null as any
                } else if (key === "unitType") {
                  delete unit.unitType
                  delete (unit as StrapiUnit & { type?: unknown }).type
                } else if (key === "availability") {
                  unit.availability = null as any
                } else {
                  // For other fields, set the neutral value
                  (unit as any)[key] = neutralValue
                }
              }
              
              // Skip API update if this is a new unit (no documentId or id)
              // New units will be saved only when user clicks Save button
              if (isNewUnit(unit)) {
                // Just update in memory, don't call API
                // Remove from deleted cells set since we're not making a request
                deletedCellsRef.current.delete(cellKey)
                continue
              }
              
              const unitId = getUnitRowKey(unit)
              const utDyn = getUnitTypeDynamicApiPath(unit, key)
              const field =
                key === "unitType"
                  ? "unitType"
                  : utDyn != null
                    ? utDyn
                    : getFieldPath(key, unit)
              
              // No auto-save: record pending change; Save button will flush to API
              const pendingKey = resolveUnitTypeDynamicColumn(key) ? key : field
              addPendingChangeMirrored(unitId, pendingKey)
              deletedCellsRef.current.delete(cellKey)
            }
          }
        }
      }
    })
    
    // No need to force refresh - grid will update automatically via getCellContent
    return true
  }, [columns, isFieldReadonly, addToHistory, isNewUnit, getNeutralValue, addPendingChange, visibleColumns, sortedUnits])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-sm text-muted-foreground">{t('loadingUnits')}</div>
      </div>
    )
  }

  // When block has zero units we still render the grid (with one empty row if blockId is provided) so the user can add the first unit.

  // Get status message and color
  const getStatusInfo = () => {
    if (saveStatus === 'saving') {
      // Calculate percentage: (completed / total) * 100
      // Always ensure it's between 0 and 100
      let percentage = 0
      if (totalUpdates > 0) {
        percentage = Math.round((completedUpdates / totalUpdates) * 100)
        // Clamp between 0 and 100
        percentage = Math.max(0, Math.min(100, percentage))
      }
      
      if (totalUpdates > 1 || pendingUpdates > 1) {
        return {
          message: t('autoSavingMultiple', { percentage }),
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
        }
      }
      return {
        message: t('autoSaving'),
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
      }
    }
    if (saveStatus === 'success') {
      return {
        message: t('autoSaved'),
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
      }
    }
    return {
      message: t('noPendingChanges'),
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/50',
    }
  }

  const statusInfo = getStatusInfo()

  /**
   * Reparto de los grupos de la barra entre visibles y menú de desbordamiento.
   * La clave enumera todo lo que altera el ANCHO de un grupo — no basta con escuchar
   * el resize de la ventana: los contadores cambian de 5 a 44, el selector de moneda
   * aparece o desaparece según el proyecto, y el idioma cambia el largo de cada etiqueta.
   */
  const overflowContentKey = [
    gridStats.total,
    gridStats.available,
    gridStats.notAvailable,
    gridStats.unknown,
    Math.round(gridStats.avgPricePerM2Usd * 100),
    Math.round(gridStats.avgMaintenancePerM2Usd * 100),
    editingCurrency,
    editingUnit,
    unitTypeViewFilter,
    activeCurrencies.length,
    hiddenColumnKeys.size,
    newUnitsCount,
    pendingChanges.size,
    t('toolbarGroupControl'),
  ].join('|')
  const { stripRef, overflowIds, contentWidth } = useOverflowGroups(overflowContentKey)

  return (
    <>
      {/* Toolbar - Excel style */}
      {/*
        El indicador de guardado va SIEMPRE debajo de la franja, nunca a su derecha: en la
        misma línea se estiraba a la altura de las cajas y le robaba ~160px de ancho a los
        grupos, mandando al menú ⋮ grupos que sí entraban. Abajo es una tira delgada.
      */}
      <div className="flex flex-col gap-1 mb-2 px-1" data-tour="units-toolbar">
        {/*
          Franja de una sola línea. Los grupos que no entran NO bajan a otra fila —eso
          empujaba la grilla hacia abajo— sino que pasan a un menú de desbordamiento (⋮)
          al final, al estilo de la barra de Google Sheets.

          Todos los grupos quedan siempre montados y maquetados; `overflow-hidden` recorta
          los que sobran. Esa es la clave para que la medición sea estable: lo que se mide
          no depende del resultado, así que no puede oscilar. Las copias recortadas quedan
          `inert` para que no reciban foco ni las lea un lector de pantalla; la copia viva
          de esos grupos es la que se dibuja dentro del menú.
        */}
        <div
          ref={stripRef}
          className="relative flex min-w-0 items-stretch flex-nowrap gap-x-3 overflow-hidden pt-2 pb-1"
        >
          {(() => {
            // Los promedios se calculan en USD y se convierten a la moneda activa del
            // selector, igual que las columnas de precio (getBuyRate = locales por 1 USD).
            const currencySymbol =
              editingCurrency === 'USD'
                ? '$'
                : activeCurrencies.find((c) => c.code === editingCurrency)?.symbol ?? ''
            const currencyRate = getBuyRate(editingCurrency)
            const formatAvg = (usdValue: number) =>
              `${currencySymbol}${(usdValue * currencyRate).toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}`

            const groups: Array<{ id: string; node: ReactNode }> = [
              {
                id: 'control',
                node: (
                  <div className={GROUP_BOX_CLASS}>
                    <span className={GROUP_LABEL_CLASS}>{t('toolbarGroupControl')}</span>
                    {/*
                      `flex-wrap` solo actúa dentro del menú ⋮. En la franja el grupo es
                      shrink-0 en un contenedor flex-nowrap, así que recibe siempre su ancho
                      natural y nunca llega a envolver; en el menú el ancho está limitado por
                      la pantalla y esto evita que el contenido se salga.
                    */}
                    <div className="flex flex-wrap items-center gap-1">

                      {/* Add row button */}
                      <button
                        onClick={handleAddRowClick}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="Agregar nueva fila"
                        aria-label="Agregar nueva fila"
                      >
                        <Plus className="w-4 h-4" />
                      </button>

                      {/* Save button - active when there are new rows or pending edits */}
                      <button
                        onClick={handleSaveClick}
                        disabled={newUnitsCount === 0 && pendingChanges.size === 0}
                        className="p-1.5 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title={
                          newUnitsCount > 0 && pendingChanges.size > 0
                            ? `Guardar ${pendingChanges.size} cambio(s) y ${newUnitsCount} nueva(s) fila(s)`
                            : newUnitsCount > 0
                              ? `Guardar ${newUnitsCount} nueva(s) fila(s)`
                              : pendingChanges.size > 0
                                ? `Guardar ${pendingChanges.size} cambio(s)`
                                : "No hay cambios ni filas nuevas para guardar"
                        }
                        aria-label="Guardar"
                      >
                        <Save className="w-4 h-4" />
                      </button>

                      {/* Sync/Refresh button */}
                      <button
                        onClick={handleSync}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="Sincronizar y refrescar datos"
                        aria-label="Sincronizar"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>

                    </div>
                  </div>
                ),
              },
              {
                id: 'view',
                node: (
                  <div className={GROUP_BOX_CLASS}>
                    <span className={GROUP_LABEL_CLASS}>{t('toolbarGroupView')}</span>
                    <div className="flex flex-wrap items-center gap-1">

                      {/* Search button */}
                      <button
                        onClick={() => setShowSearch(prev => !prev)}
                        className={`p-1.5 rounded hover:bg-muted transition-colors ${showSearch ? 'bg-muted' : ''}`}
                        title="Buscar (Ctrl+F)"
                        aria-label="Buscar"
                      >
                        <Search className="w-4 h-4" />
                      </button>

                      {/* Row status legend (info) */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            title={t('rowStatusLegendInfo')}
                            aria-label={t('rowStatusLegendInfo')}
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-3">
                          <p className="font-medium text-sm mb-2">{t('rowStatusLegendTitle')}</p>
                          <ul className="space-y-1.5 text-xs text-muted-foreground">
                            <li className="flex items-center gap-2">
                              <span className="shrink-0 w-4 h-4 rounded border border-border bg-background" aria-hidden />
                              {t('rowStatusNeutral')}
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="shrink-0 w-4 h-4 rounded" style={{ backgroundColor: '#fef3c7', border: '1px solid #92400e' }} aria-hidden />
                              {t('rowStatusNew')}
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="shrink-0 w-4 h-4 rounded" style={{ backgroundColor: '#dbeafe', border: '1px solid #1e40af' }} aria-hidden />
                              {t('rowStatusSaving')}
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="shrink-0 w-4 h-4 rounded" style={{ backgroundColor: '#fee2e2', border: '1px solid #991b1b' }} aria-hidden />
                              {t('rowStatusError')}
                            </li>
                            {/* Dos intensidades: pleno sin guardar, atenuado ya persistido */}
                            <li className="flex items-center gap-2">
                              <span className="shrink-0 flex gap-0.5" aria-hidden>
                                <span className="w-4 h-4 rounded" style={{ backgroundColor: '#fed7aa', border: '1px solid #9a3412' }} />
                                <span className="w-4 h-4 rounded" style={{ backgroundColor: '#ffedd5', border: '1px solid #9a3412' }} />
                              </span>
                              {t('rowStatusOutOfRange')}
                            </li>
                          </ul>
                        </PopoverContent>
                      </Popover>

                      {/* Column visibility toggle */}
                      {(() => {
                        const colGroups: { group: string; cols: typeof columns }[] = []
                        const seen = new Map<string, typeof columns[0][]>()
                        for (const col of columns) {
                          const g = col.group ?? '—'
                          if (!seen.has(g)) { seen.set(g, []); colGroups.push({ group: g, cols: seen.get(g)! }) }
                          seen.get(g)!.push(col)
                        }
                        // Razón de ocultamiento por combo (no togglable por el usuario)
                        const ALWAYS_VISIBLE = new Set(['name', 'code', 'unitNumber'])
                        const getSystemHideReason = (col: typeof columns[0]): string | null => {
                          const key = col.id as string
                          if (!columnGroupKeyMatchesUnitTypeViewFilter(col.groupKey, unitTypeViewFilter)) return 'Tipo unidad'
                          if (editingUnit === 'm2' && varas2DimensionKeys.includes(key)) return 'varas²'
                          if (editingUnit === 'varas2' && m2DimensionKeys.includes(key)) return 'mts²'
                          const colCurrency = currencyColumnToCode.get(key)
                          if (colCurrency !== undefined && colCurrency !== editingCurrency) return colCurrency
                          return null
                        }
                        const totalHidden = hiddenColumnKeys.size + columns.filter(c => getSystemHideReason(c) !== null).length
                        return (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={`p-1.5 rounded hover:bg-muted transition-colors relative ${totalHidden > 0 ? 'text-amber-600' : 'text-muted-foreground hover:text-foreground'}`}
                                title={totalHidden > 0 ? `${totalHidden} columna(s) oculta(s)` : 'Visibilidad de columnas'}
                                aria-label="Visibilidad de columnas"
                              >
                                {totalHidden > 0 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                {hiddenColumnKeys.size > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold bg-amber-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                                    {hiddenColumnKeys.size}
                                  </span>
                                )}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-64 p-2">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold">Visibilidad de columnas</span>
                                {hiddenColumnKeys.size > 0 && (
                                  <button type="button" onClick={() => setHiddenColumnKeys(new Set())} className="text-[11px] text-blue-600 hover:underline">
                                    Mostrar todas
                                  </button>
                                )}
                              </div>
                              <div className="max-h-72 overflow-y-auto space-y-3">
                                {colGroups.filter(({ cols }) => cols.some(c => !ALWAYS_VISIBLE.has(c.id as string))).map(({ group, cols }) => (
                                  <div key={group}>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-1">{group}</p>
                                    <div className="space-y-px">
                                      {cols.filter(col => !ALWAYS_VISIBLE.has(col.id as string)).map((col) => {
                                        const key = col.id as string
                                        const isHidByUser = hiddenColumnKeys.has(key)
                                        const systemReason = getSystemHideReason(col)
                                        const isHid = isHidByUser || systemReason !== null
                                        if (systemReason !== null) {
                                          return (
                                            <div key={key} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground/60 cursor-default select-none">
                                              <EyeOff className="w-3.5 h-3.5 shrink-0" />
                                              <span className="truncate text-left flex-1">{col.title}</span>
                                              <span className="shrink-0 text-[10px] bg-muted px-1 rounded">{systemReason}</span>
                                            </div>
                                          )
                                        }
                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            onClick={() => toggleHiddenColumn(key)}
                                            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-muted transition-colors ${isHid ? 'text-muted-foreground' : ''}`}
                                          >
                                            {isHid
                                              ? <EyeOff className="w-3.5 h-3.5 shrink-0" />
                                              : <Eye className="w-3.5 h-3.5 shrink-0 opacity-30" />}
                                            <span className="truncate text-left">{col.title}</span>
                                          </button>
                                        )
                                      })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )
                  })()}

                    </div>
                  </div>
                ),
              },
              {
                id: 'filters',
                node: (
                  <div className={GROUP_BOX_CLASS}>
                    <span className={GROUP_LABEL_CLASS}>{t('toolbarGroupFilters')}</span>
                    <div className="flex flex-wrap items-center gap-2">

                      {/*
                        Unit switch — sin etiqueta visible: "mts²"/"varas²" se explican solos dentro
                        de un grupo llamado FILTROS. El nombre vive en aria-label/title para lectores
                        de pantalla y hover.
                      */}
                      <div className="flex items-center gap-1">
                        <Select value={editingUnit} onValueChange={(value: 'm2' | 'varas2') => setEditingUnit(value)}>
                          <SelectTrigger
                            aria-label={t('unitLabel') || 'Unidad'}
                            title={t('unitLabel') || 'Unidad'}
                            className="h-7 w-20 bg-transparent border border-border rounded hover:bg-muted shadow-none focus:ring-0 focus:ring-offset-0 text-xs px-2 py-0 transition-colors"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="m2" className="text-xs">mts²</SelectItem>
                            <SelectItem value="varas2" className="text-xs">varas²</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Currency switch */}
                      {activeCurrencies.length > 0 && (
                          <div className="flex items-center gap-1">
                            {/* Currency switch — el código de moneda ya es la etiqueta. */}
                            <Select value={editingCurrency} onValueChange={setEditingCurrency}>
                              <SelectTrigger
                                aria-label={t('currencyLabel') || 'Moneda'}
                                title={t('currencyLabel') || 'Moneda'}
                                className="h-7 w-20 bg-transparent border border-border rounded hover:bg-muted shadow-none focus:ring-0 focus:ring-offset-0 text-xs px-2 py-0 transition-colors"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USD" className="text-xs">USD</SelectItem>
                                {activeCurrencies.map((currency) => (
                                  <SelectItem key={currency.code} value={currency.code} className="text-xs">
                                    {currency.code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                      )}

                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {t("unitTypeFilterLabel")}
                        </span>
                        <Select
                          value={unitTypeViewFilter}
                          onValueChange={(v) => {
                            setUnitTypeViewFilter(v as UnitKindViewFilter)
                            setGridSelection(undefined)
                          }}
                        >
                          <SelectTrigger className="h-7 min-w-32 bg-transparent border border-border rounded hover:bg-muted shadow-none focus:ring-0 focus:ring-offset-0 text-xs px-2 py-0 transition-colors">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">{t("unitTypeFilterAll")}</SelectItem>
                            <SelectItem value="residential" className="text-xs">{unitTypeLabels.residential}</SelectItem>
                            <SelectItem value="office" className="text-xs">{unitTypeLabels.office}</SelectItem>
                            <SelectItem value="industrial" className="text-xs">{unitTypeLabels.industrial}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                    </div>
                  </div>
                ),
              },
            ]

            if (gridStats.total > 0) {
              groups.push(
                {
                  id: 'units',
                  node: (
                    <div className={GROUP_BOX_CLASS}>
                      <span className={GROUP_LABEL_CLASS}>{t('statsGroupUnits')}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground whitespace-nowrap">
                          {t('statsTotal')} <span className="font-semibold text-foreground">{gridStats.total}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                          {t('statsAvailable')} <span className="font-semibold">{gridStats.available}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-2.5 py-1 text-xs text-red-700 dark:text-red-400 whitespace-nowrap">
                          {t('statsNotAvailable')} <span className="font-semibold">{gridStats.notAvailable}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground whitespace-nowrap">
                          {t('statsUnknown')} <span className="font-semibold">{gridStats.unknown}</span>
                        </span>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'avg',
                  node: (
                    <div className={GROUP_BOX_CLASS}>
                      <span className={GROUP_LABEL_CLASS}>{t('statsGroupAvg')}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground whitespace-nowrap">
                          {t('statsAvgPricePerM2')}{' '}
                          <span className="font-semibold text-foreground tabular-nums">
                            {formatAvg(gridStats.avgPricePerM2Usd)}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground whitespace-nowrap">
                          {t('statsAvgMaintenancePerM2')}{' '}
                          <span className="font-semibold text-foreground tabular-nums">
                            {formatAvg(gridStats.avgMaintenancePerM2Usd)}
                          </span>
                        </span>
                      </div>
                    </div>
                  ),
                },
              )
            }

            const hidden = new Set(overflowIds)
            // El ⋮ va pegado al último grupo que sí se ve, no fijo al borde derecho.
            // Si no entra ninguno, va al principio para no quedar en la zona recortada.
            const lastVisibleId = groups.filter((g) => !hidden.has(g.id)).at(-1)?.id

            const overflowTrigger = (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 self-center p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title={t('toolbarMoreGroups')}
                    aria-label={t('toolbarMoreGroups')}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                {/*
                  `bg-background` (no el bg-popover por defecto): la etiqueta de cada
                  grupo corta su borde con un fondo sólido, y --popover y --background
                  NO son el mismo color en ninguno de los dos temas. Sin esto la
                  etiqueta se ve como un parche dentro del menú.
                */}
                <PopoverContent
                  /*
                    En móvil se centra respecto al disparador y toma un ancho fijo de 92vw:
                    anclado al extremo quedaba medio panel fuera de la pantalla. En escritorio
                    se alinea al botón y el ancho lo fija el contenido.
                    `collisionPadding` deja aire contra los bordes; `max-h`/scroll evitan que
                    un menú con varios grupos supere el alto de pantalla.
                  */
                  align={isMobile ? 'center' : 'end'}
                  collisionPadding={8}
                  className={`p-4 bg-background max-h-[70vh] overflow-y-auto ${
                    isMobile ? 'w-[92vw]' : 'w-auto max-w-176'
                  }`}
                >
                  <div className="flex flex-col gap-4">
                    {groups
                      .filter((group) => hidden.has(group.id))
                      .map(({ id, node }) => (
                        <div key={id} className="min-w-0">{node}</div>
                      ))}
                  </div>
                </PopoverContent>
              </Popover>
            )

            return (
              <>
                {hidden.size > 0 && lastVisibleId === undefined && overflowTrigger}

                {groups.map(({ id, node }) => (
                  <Fragment key={id}>
                    <div
                      data-group-id={id}
                      /*
                        `invisible` (visibility:hidden), NO `hidden` ni desmontar: el grupo que
                        pasó al menú debe desaparecer de la franja —si solo se recorta, asoma a
                        medias junto al ⋮ y se lee como duplicado— pero tiene que conservar su
                        caja de layout, porque su `offsetWidth` es lo que mide el hook. Con
                        display:none mediría 0 y el reparto empezaría a oscilar.
                      */
                      className={`flex shrink-0 ${hidden.has(id) ? 'invisible' : ''}`}
                      aria-hidden={hidden.has(id) || undefined}
                      inert={hidden.has(id) || undefined}
                    >
                      {node}
                    </div>
                    {hidden.size > 0 && id === lastVisibleId && overflowTrigger}
                  </Fragment>
                ))}
              </>
            )
          })()}
        </div>

        {/*
          Auto-save status indicator — tira delgada bajo la franja. Toma el ancho del
          contenido visible (medido por el hook) para terminar donde termina el último
          grupo, en vez de encogerse a su texto y quedar desalineada.
        */}
        <div
          style={contentWidth ? { width: contentWidth } : undefined}
          className={`self-start max-w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color} border border-border/50 whitespace-nowrap`}
        >
          {saveStatus === 'saving' && (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          )}
          {saveStatus === 'success' && (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="truncate">{statusInfo.message}</span>
        </div>
      </div>

      <div
        ref={gridContainerRef}
        className="w-full border border-border rounded-lg overflow-hidden"
        style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}
        data-tour="units-table"
        onMouseLeave={() => setHeaderColumnTooltip(null)}
      >
        <DataEditor
          ref={dataEditorRef}
          columns={visibleColumns}
          rows={sortedUnits.length}
          minColumnWidth={104}
          maxColumnWidth={MAX_COLUMN_WIDTH}
          getCellContent={getCellContent}
          getGroupDetails={getGroupDetails}
          getCellsForSelection={true}
          freezeColumns={isMobile ? 0 : 3}
          rowHeight={30}
          onCellEdited={onCellEdited}
          onCellsEdited={onCellsEdited}
          onFillPattern={onFillPattern}
          onPaste={onPaste}
          onDelete={onDelete}
          gridSelection={gridSelection}
          onGridSelectionChange={setGridSelection}
          customRenderers={[]}
          headerIcons={{
            openLockOrange: () => HEADER_ICON_LOCK_OPEN,
            noApiSync:      () => HEADER_ICON_CLOUD_OFF,
          }}
          // Selection options
          rangeSelect="multi-rect"
          rangeSelectionBlending="mixed"
          rowSelect="multi"
          columnSelect="multi"
          rowSelectionBlending="mixed"
          columnSelectionBlending="mixed"
          // Fill handle for drag to fill
          fillHandle={true}
          allowedFillDirections="any"
          // Copy headers (disabled - only copy cell values, not column names)
          copyHeaders={false}
          // Row markers
          rowMarkers="number"
          // Keyboard navigation
          // Cell interactions
          onCellClicked={(cell, e) => {
            // Open dropdown for dropdown fields on double click (no abrir si la celda no aplica a la fila, p. ej. oficina en unidad vivienda)
            const [col, row] = cell
            const column = visibleColumns[col]
            if (!column || !dropdownFields.includes(column.id as string)) return

            const field = column.id as string
            const rowUnit = row >= 0 && row < sortedUnits.length ? sortedUnits[row] : undefined
            if (!rowUnit || isCellEffectivelyReadonly(field, rowUnit)) {
              lastClickRef.current = { cell: null, field: null, timestamp: 0 }
              return
            }

            const now = Date.now()
            const lastClick = lastClickRef.current

            // Check if this is a double click (same cell and field within DOUBLE_CLICK_DELAY ms)
            if (
              lastClick.cell &&
              lastClick.field === field &&
              lastClick.cell[0] === cell[0] &&
              lastClick.cell[1] === cell[1] &&
              now - lastClick.timestamp < DOUBLE_CLICK_DELAY
            ) {
              setActiveDropdown({ field, cell })
              lastClickRef.current = { cell: null, field: null, timestamp: 0 }
            } else {
              lastClickRef.current = { cell, field, timestamp: now }
            }
          }}
          onCellActivated={(cell) => {
            // Optional: handle cell activation
          }}
          // Column interactions
          onColumnResize={(column, newSize, colIndex, newSizeWithGrow) => {
            // Update column width in state
            if (column.id) {
              setColumnWidths(prev => {
                const newMap = new Map(prev)
                newMap.set(column.id as string, newSize)
                return newMap
              })
            }
          }}
          onColumnMoved={(startIndex, endIndex) => {
            // Optional: handle column move
          }}
          // TEMPORARILY COMMENTED: Header menu functionality
          // onHeaderMenuClick={onHeaderMenuClick}
          onHeaderClicked={(col) => {
            // Single click - toggle sort
            const column = visibleColumns[col]
            if (!column || !column.id) return
            
            const columnId = column.id as string
            if (sortColumn === columnId) {
              // Toggle direction
              setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
            } else {
              // Set new sort column
              setSortColumn(columnId)
              setSortDirection('asc')
            }
          }}
          // Row interactions
          onRowMoved={(startIndex, endIndex) => {
            // Optional: handle row move
          }}
          // Search
          showSearch={showSearch}
          searchValue={searchValue}
          onSearchValueChange={setSearchValue}
          onSearchClose={() => {
            setShowSearch(false)
            setSearchValue("")
          }}
          // Smooth scrolling
          smoothScrollX={true}
          smoothScrollY={true}
          // Draw focus ring
          drawFocusRing={true}
          // Vertical borders
          verticalBorder={true}
          onItemHovered={onItemHovered}
          getRowThemeOverride={getRowThemeOverride}
        />
      </div>

      {headerColumnTooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[200] max-w-sm rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md pointer-events-none leading-snug whitespace-pre-line"
            style={{
              left: headerColumnTooltip.left,
              top: headerColumnTooltip.top,
              transform: "translateX(-50%)",
            }}
          >
            {headerColumnTooltip.content}
          </div>,
          document.body
        )}
      
      <AlertDialog open={pasteDialog.open} onOpenChange={(open) => {
        if (!open) {
          setPasteDialog({ open: false, cellCount: 0, pasteData: [] })
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar pegado</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de actualizar {pasteDialog.cellCount} {pasteDialog.cellCount === 1 ? "celda" : "celdas"}. 
              ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedPaste}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Generic Dropdown for all dropdown fields */}
      {activeDropdown && (
        <DropdownCell
          options={getDropdownOptions(activeDropdown.field)}
          activeCell={activeDropdown.cell}
          columns={columns}
          gridContainerRef={gridContainerRef}
          onSelect={(value, cell) => {
            // Map availability display labels back to values
            let actualValue = value
            if (activeDropdown.field === "availability") {
              actualValue = value === "Disponible" ? "Available" : 
                           value === "No Disponible" ? "Not Available" : 
                           value
            }
            handleDropdownSelect(actualValue, cell, activeDropdown.field)
          }}
          getCurrentValue={(cell) => getDropdownValue(cell, activeDropdown.field)}
          onClose={() => setActiveDropdown(null)}
          cellInfo={getDropdownCellInfo(activeDropdown.cell, activeDropdown.field)}
        />
      )}

      {/* Type validation alert */}
      <AlertDialog open={typeValidationAlert.open} onOpenChange={(open) => {
        if (!open) {
          setTypeValidationAlert({ open: false, message: "", details: undefined, detailsExpanded: false })
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('typeIncompatibilityTitle') || 'Incompatibilidad de tipos'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{typeValidationAlert.message}</p>
                {typeValidationAlert.details?.cellRef != null && typeValidationAlert.details.cellRow1Based != null && (
                  <p className="text-sm">
                    <span className="font-medium text-foreground">
                      {t("typeIncompatibilityCellLabel") || "Celda afectada"}
                    </span>
                    {": "}
                    <span className="font-mono tabular-nums text-foreground">{typeValidationAlert.details.cellRef}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {t("typeIncompatibilityCellRowColumn", {
                        row: typeValidationAlert.details.cellRow1Based,
                        column: typeValidationAlert.details.destColumnLabel,
                      }) || `fila ${typeValidationAlert.details.cellRow1Based}, columna «${typeValidationAlert.details.destColumnLabel}»`}
                    </span>
                  </p>
                )}
                {typeValidationAlert.details && (
                  <Collapsible
                    open={typeValidationAlert.detailsExpanded ?? false}
                    onOpenChange={(open) => setTypeValidationAlert((prev) => (prev.details ? { ...prev, detailsExpanded: open } : prev))}
                  >
                    <CollapsibleTrigger className="flex items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full rounded border border-border bg-muted/30 px-3 py-2">
                      {typeValidationAlert.detailsExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      {t("typeIncompatibilityShowDetails") || "Ver detalles"}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-sm space-y-2 max-h-48 overflow-y-auto">
                        <p className="font-medium">{t('typeIncompatibilityValueLabel') || 'Valor que intentas usar:'}</p>
                        <p className="font-mono text-muted-foreground break-all">
                          &quot;{typeValidationAlert.details.sourceValue}&quot; <span className="text-foreground">({t('typeIncompatibilityType') || 'tipo'}: {typeValidationAlert.details.sourceType})
                        </span>
                        </p>
                        <p className="font-medium pt-1">{t('typeIncompatibilityColumnLabel') || 'Columna destino:'}</p>
                        <p className="text-muted-foreground">
                          {typeValidationAlert.details.destColumnLabel} <span className="text-foreground">({t('typeIncompatibilityType') || 'tipo'}: {typeValidationAlert.details.destType})
                        </span>
                        </p>
                        {typeValidationAlert.details.count != null && typeValidationAlert.details.count > 1 && (
                          <p className="text-muted-foreground pt-1">
                            {t('typeIncompatibilityAffectedCells', { count: typeValidationAlert.details.count }) || `${typeValidationAlert.details.count} celdas afectadas`}
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setTypeValidationAlert({ open: false, message: "", details: undefined, detailsExpanded: false })}>
              {t('close')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add rows dialog */}
      <AlertDialog open={addRowsDialog.open} onOpenChange={(open) => {
        if (!open) {
          setAddRowsDialog({ open: false, count: "1" })
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('addRows')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('addRowsDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="row-count" className="text-sm font-medium">
              {t('numberOfRows')}
            </Label>
            <Input
              id="row-count"
              type="number"
              min="1"
              max="100"
              value={addRowsDialog.count}
              onChange={(e) => setAddRowsDialog(prev => ({ ...prev, count: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmAddRows()
                }
              }}
              autoFocus
              className="w-full"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAddRows}>
              {t('add')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Validation alert dialog */}
      <AlertDialog open={validationAlert.open} onOpenChange={(open) => {
        if (!open) {
          setValidationAlert({ open: false, message: "", invalidUnits: undefined })
        }
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('requiredFieldsTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {validationAlert.invalidUnits 
                ? t('requiredFieldsDescription', { 
                    count: validationAlert.invalidUnits.length,
                    plural: validationAlert.invalidUnits.length > 1 ? 's' : ''
                  })
                : validationAlert.message
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          {validationAlert.invalidUnits && validationAlert.invalidUnits.length > 0 && (
            <div className={`py-2 ${validationAlert.invalidUnits.length > 5 ? 'max-h-64 overflow-y-auto' : ''}`}>
              <ul className="space-y-2 text-sm">
                {validationAlert.invalidUnits.map((item, idx) => {
                  const fieldsText = item.missingFields.join(', ')
                  const isSingle = item.missingFields.length === 1
                  return (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>
                        {isSingle
                          ? t('requiredFieldsRowSingle', { 
                              row: item.rowIndex,
                              fields: fieldsText
                            })
                          : t('requiredFieldsRowMultiple', { 
                              row: item.rowIndex,
                              fields: fieldsText
                            })
                        }
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setValidationAlert({ open: false, message: "", invalidUnits: undefined })}>
              {t('close')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={formulaSyncAlert.open} onOpenChange={(open) => {
        if (!open) setFormulaSyncAlert({ open: false, rows: [] })
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Valores a sincronizar</AlertDialogTitle>
            <AlertDialogDescription>
              Notamos que algunos valores guardados no coinciden con las fórmulas actuales. Los recalculamos y marcamos en amarillo. Revisa los cambios, ajusta lo que no estés de acuerdo y presiona Guardar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className={`py-2 ${formulaSyncAlert.rows.length > 5 ? 'max-h-64 overflow-y-auto' : ''}`}>
            <ul className="space-y-2 text-sm">
              {formulaSyncAlert.rows.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>Fila {item.rowIndex}: {item.fields.map((f) => RECONCILE_FIELD_LABELS[f] ?? f).join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setFormulaSyncAlert({ open: false, rows: [] })}>
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Valores fuera de rango — informa antes de guardar, nunca bloquea */}
      <AlertDialog open={outOfRangeDialog.open} onOpenChange={(open) => {
        if (!open) setOutOfRangeDialog({ open: false, rows: [] })
      }}>
        {/*
          Este diálogo se viste de naranja a propósito: en blanco se confundía con las demás
          confirmaciones y se aceptaba por reflejo. El naranja es además el mismo de la celda
          marcada, para que se lea como el mismo aviso y no como algo genérico.
        */}
        <AlertDialogContent className="max-w-md border-orange-300 dark:border-orange-800">
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950" aria-hidden>
                <TriangleAlert className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </span>
              <div className="min-w-0 space-y-1.5">
                <AlertDialogTitle className="text-orange-700 dark:text-orange-300">
                  {t('outOfRangeTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>{t('outOfRangeMessage')}</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <div
            className={`rounded-md border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40 p-3 ${
              outOfRangeDialog.rows.length > 5 ? 'max-h-64 overflow-y-auto' : ''
            }`}
          >
            <ul className="space-y-2 text-sm text-orange-900 dark:text-orange-200">
              {outOfRangeDialog.rows.map((row) => (
                <li key={row.rowIndex} className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>
                    {t('row')} {row.rowIndex}
                    {row.label ? ` · ${row.label}` : ''}:{' '}
                    <strong className="font-semibold">
                      {row.fields.map((f) => RECONCILE_FIELD_LABELS[f] ?? f).join(', ')}
                    </strong>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOutOfRangeDialog({ open: false, rows: [] })}>
              {t('cancel')}
            </AlertDialogCancel>
            {/* Naranja, no el primario neutro: seguir adelante es la opción arriesgada. */}
            <AlertDialogAction
              className="bg-orange-600 text-white hover:bg-orange-700 focus-visible:ring-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700"
              onClick={() => {
                setOutOfRangeDialog({ open: false, rows: [] })
                // Espera a que Radix termine de desmontar este diálogo antes de abrir el de
                // volumen: encadenados en el mismo tick, la limpieza del primero (foco y
                // pointer-events sobre el body) le pisa el montaje al segundo.
                setTimeout(() => continueSaveAfterOutOfRange(), 200)
              }}
            >
              {t('outOfRangeSaveAnyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sync confirmation dialog */}
      <AlertDialog open={syncConfirmDialog.open} onOpenChange={(open) => {
        if (!open) {
          setSyncConfirmDialog({ open: false })
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('syncConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('syncConfirmMessage')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSyncConfirmDialog({ open: false })}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={performSync}>
              {t('syncConfirmYes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk save confirmation (>5 rows) with math challenge */}
      <AlertDialog open={saveConfirmDialog.open} onOpenChange={(open) => {
        if (!open) {
          setSaveConfirmDialog({ open: false, totalRows: 0, step: 'confirm', mathAnswer: '', mathError: false })
        }
      }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {saveConfirmDialog.step === 'confirm'
                ? (t('saveConfirmTitle') || 'Confirmar guardado')
                : (t('saveConfirmMathTitle') || 'Verificación')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {saveConfirmDialog.step === 'confirm' ? (
                <p>
                  {t('saveConfirmMessage') || 'Está a punto de actualizar'}{' '}
                  <strong>{saveConfirmDialog.totalRows}</strong>{' '}
                  {saveConfirmDialog.totalRows === 1 ? (t('saveConfirmRowOne') || 'fila') : (t('saveConfirmRows') || 'filas')}.
                  {' '}{(t('saveConfirmRequired') || 'Es necesaria una confirmación.')}
                </p>
              ) : (
                <div className="space-y-3">
                  <p>
                    {t('saveConfirmMathPrompt') || 'Para confirmar, resuelva la siguiente suma:'}
                  </p>
                  <p className="text-lg font-semibold text-center py-2">
                    {saveConfirmDialog.mathA} + {saveConfirmDialog.mathB} = ?
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="math-answer">
                      {t('saveConfirmMathAnswer') || 'Resultado'}
                    </Label>
                    <Input
                      id="math-answer"
                      type="number"
                      min={1}
                      max={40}
                      value={saveConfirmDialog.mathAnswer}
                      onChange={(e) => setSaveConfirmDialog((prev) => ({ ...prev, mathAnswer: e.target.value.trim(), mathError: false }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const answer = parseInt(saveConfirmDialog.mathAnswer, 10)
                          const expected = (saveConfirmDialog.mathA ?? 0) + (saveConfirmDialog.mathB ?? 0)
                          if (!Number.isNaN(answer) && answer === expected) {
                            setSaveConfirmDialog({ open: false, totalRows: 0, step: 'confirm', mathAnswer: '', mathError: false })
                            queueMicrotask(() => handleSave())
                          } else {
                            setSaveConfirmDialog((prev) => ({ ...prev, mathError: true }))
                          }
                        }
                      }}
                      className={saveConfirmDialog.mathError ? 'border-destructive' : ''}
                      autoFocus
                    />
                    {saveConfirmDialog.mathError && (
                      <p className="text-sm text-destructive">
                        {t('saveConfirmMathWrong') || 'Resultado incorrecto. Intente de nuevo.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSaveConfirmDialog({ open: false, totalRows: 0, step: 'confirm', mathAnswer: '', mathError: false })}>
              {t('cancel')}
            </AlertDialogCancel>
            {saveConfirmDialog.step === 'confirm' ? (
              <Button
                type="button"
                onClick={() => {
                  const { a, b } = generateMathChallenge()
                  setSaveConfirmDialog((prev) => ({ ...prev, step: 'math', mathA: a, mathB: b, mathAnswer: '', mathError: false }))
                }}
              >
                {t('saveConfirmConfirm') || 'Confirmar'}
              </Button>
            ) : (
              <AlertDialogAction
                onClick={(e) => {
                  const answer = parseInt(saveConfirmDialog.mathAnswer, 10)
                  const expected = (saveConfirmDialog.mathA ?? 0) + (saveConfirmDialog.mathB ?? 0)
                  if (!Number.isNaN(answer) && answer === expected) {
                    setSaveConfirmDialog({ open: false, totalRows: 0, step: 'confirm', mathAnswer: '', mathError: false })
                    // Run save after closing dialog so it executes reliably
                    queueMicrotask(() => handleSave())
                  } else {
                    e.preventDefault()
                    setSaveConfirmDialog((prev) => ({ ...prev, mathError: true }))
                  }
                }}
              >
                {t('saveConfirmSubmit') || 'Enviar'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* TEMPORARILY COMMENTED: Context menu for column headers */}
      {/* {headerMenu && typeof document !== 'undefined' && createPortal(
        <div
          data-header-menu
          className="fixed bg-popover text-popover-foreground rounded-md border shadow-lg min-w-[180px] p-1 z-50"
          style={{
            left: `${headerMenu.bounds.x + headerMenu.bounds.width}px`,
            top: `${headerMenu.bounds.y + headerMenu.bounds.height}px`,
            transform: 'translateX(-100%)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            onClick={() => {
              const column = visibleColumns[headerMenu.col]
              if (column && column.id) {
                setSortColumn(column.id as string)
                setSortDirection('asc')
              }
              setHeaderMenu(undefined)
            }}
          >
            <ArrowUp className="w-4 h-4" />
            {t('sortAscending')}
          </button>
          <button
            className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            onClick={() => {
              const column = visibleColumns[headerMenu.col]
              if (column && column.id) {
                setSortColumn(column.id as string)
                setSortDirection('desc')
              }
              setHeaderMenu(undefined)
            }}
          >
            <ArrowDown className="w-4 h-4" />
            {t('sortDescending')}
          </button>
          {(() => {
            const column = visibleColumns[headerMenu.col]
            if (column && column.id && sortColumn === column.id) {
              return (
                <>
                  <div className="h-px bg-border my-1" />
                  <button
                    className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      setSortColumn(null)
                      setSortDirection('asc')
                      setHeaderMenu(undefined)
                    }}
                  >
                    {t('clearSort')}
                  </button>
                </>
              )
            }
            return null
          })()}
        </div>,
        document.body
      )} */}
    </>
  )
}
