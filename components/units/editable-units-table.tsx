"use client"

import { useState, useCallback, useRef, useEffect, useMemo, memo } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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
import { StrapiUnit, StrapiUnitType } from "@/lib/api/strapi"
import { emptyUnitTypeEntry, formatUnitTypeForStrapi } from "@/lib/units/unit-type-zone"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, Check, X } from "lucide-react"
import { strapiClient } from "@/lib/api/strapi"
import { cn } from "@/lib/utils"

interface EditableUnitsTableProps {
  units: StrapiUnit[]
  isLoading?: boolean
  onUpdate?: (unitId: string, field: string, value: unknown) => void
}

type FieldType = "text" | "number" | "currency" | "select" | "boolean" | "readonly"

type UnitKindCombo = "residential" | "office" | "industrial"

interface ColumnDef {
  key: string
  label: string
  type: FieldType
  width?: number
  options?: { value: string; label: string }[]
  format?: (value: unknown) => string
  /** Si está definido, la columna solo es editable cuando el combo Tipo coincide. */
  complementFor?: UnitKindCombo
}

const UNIT_KIND_TO_COMPONENT: Record<UnitKindCombo, StrapiUnitType["__component"]> = {
  residential: "unit-types.housing",
  office: "unit-types.offices",
  industrial: "unit-types.industrial",
}

function getUnitDynamicZone(unit: StrapiUnit): StrapiUnitType[] {
  const u = unit as StrapiUnit & { type?: StrapiUnitType[] | null }
  const dz = u.unitType ?? u.type
  return Array.isArray(dz) ? dz : []
}

function getSelectedUnitKind(unit: StrapiUnit): UnitKindCombo | null {
  const dz = getUnitDynamicZone(unit)
  const first = dz[0]
  if (!first?.__component) return null
  const c = first.__component as string
  if (c === "unit-types.housing" || c === "unit-types.residential") return "residential"
  if (c === "unit-types.offices" || c === "unit-types.office") return "office"
  if (c === "unit-types.industrial") return "industrial"
  return null
}

function isComplementColumnActive(unit: StrapiUnit, column: ColumnDef): boolean {
  if (!column.complementFor) return true
  return getSelectedUnitKind(unit) === column.complementFor
}

function toApiFieldValue(field: string, value: unknown): unknown {
  if (field !== "unitType") return value
  return formatUnitTypeForStrapi(
    typeof value === "string" && value in UNIT_KIND_TO_COMPONENT
      ? [emptyUnitTypeEntry(UNIT_KIND_TO_COMPONENT[value as UnitKindCombo])]
      : value
  )
}

const columns: ColumnDef[] = [
  { key: "code", label: "Código", type: "text", width: 120 },
  { key: "name", label: "Nombre", type: "text", width: 200 },
  { key: "description", label: "Descripción", type: "text", width: 250 },
  {
    key: "unitType",
    label: "Tipo",
    type: "select",
    width: 140,
    options: [
      { value: "residential", label: "Residencial" },
      { value: "office", label: "Oficina" },
      { value: "industrial", label: "Industrial" },
    ],
  },
  { key: "area", label: "Área", type: "number", width: 100 },
  {
    key: "areaUnit",
    label: "Unidad",
    type: "select",
    width: 100,
    options: [
      { value: "sqm", label: "mts²" },
      { value: "sqft", label: "ft²" },
    ],
  },
  { key: "price", label: "Precio", type: "currency", width: 140 },
  { key: "rent", label: "Renta", type: "currency", width: 140 },
  {
    key: "currency",
    label: "Moneda",
    type: "select",
    width: 100,
    options: [
      { value: "GTQ", label: "GTQ" },
      { value: "USD", label: "USD" },
    ],
  },
  { key: "kpis", label: "KPIs", type: "text", width: 150 },
  {
    key: "availability",
    label: "Disponibilidad",
    type: "select",
    width: 140,
    options: [
      { value: "available", label: "Disponible" },
      { value: "reserved", label: "Reservada" },
      { value: "sold", label: "Vendida" },
      { value: "rented", label: "Arrendada" },
    ],
  },
  { key: "isActive", label: "Activo", type: "boolean", width: 80 },
  // Campos de tipo (residential)
  { key: "bedrooms", label: "Habitaciones", type: "number", width: 110, complementFor: "residential" },
  { key: "bathrooms", label: "Baños", type: "number", width: 90, complementFor: "residential" },
  { key: "parkingSpaces", label: "Parqueos", type: "number", width: 100, complementFor: "residential" },
  { key: "floor", label: "Piso", type: "number", width: 80, complementFor: "residential" },
  {
    key: "orientation",
    label: "Orientación",
    type: "select",
    width: 120,
    complementFor: "residential",
    options: [
      { value: "north", label: "Norte" },
      { value: "south", label: "Sur" },
      { value: "east", label: "Este" },
      { value: "west", label: "Oeste" },
    ],
  },
  {
    key: "furnished",
    label: "Amueblado",
    type: "select",
    width: 120,
    complementFor: "residential",
    options: [
      { value: "unfurnished", label: "Sin amueblar" },
      { value: "semi-furnished", label: "Semi-amueblado" },
      { value: "furnished", label: "Amueblado" },
    ],
  },
  { key: "balcony", label: "Balcón", type: "boolean", width: 90, complementFor: "residential" },
  { key: "terrace", label: "Terraza", type: "boolean", width: 90, complementFor: "residential" },
  { key: "garden", label: "Jardín", type: "boolean", width: 90, complementFor: "residential" },
  { key: "petFriendly", label: "Mascotas", type: "boolean", width: 100, complementFor: "residential" },
  { key: "smokingAllowed", label: "Fumar", type: "boolean", width: 90, complementFor: "residential" },
  // Campos de tipo (office)
  {
    key: "class",
    label: "Clase",
    type: "select",
    width: 100,
    complementFor: "office",
    options: [
      { value: "A", label: "A" },
      { value: "B", label: "B" },
      { value: "C", label: "C" },
    ],
  },
  { key: "employees", label: "Empleados", type: "number", width: 110, complementFor: "office" },
  { key: "meetingRooms", label: "Salas", type: "number", width: 100, complementFor: "office" },
  { key: "privateOffices", label: "Oficinas", type: "number", width: 110, complementFor: "office" },
  { key: "receptionArea", label: "Recepción", type: "boolean", width: 110, complementFor: "office" },
  { key: "openSpace", label: "Open Space", type: "boolean", width: 120, complementFor: "office" },
  { key: "kitchenette", label: "Cocina", type: "boolean", width: 90, complementFor: "office" },
  { key: "storageRoom", label: "Almacén", type: "boolean", width: 100, complementFor: "office" },
  {
    key: "view",
    label: "Vista",
    type: "select",
    width: 120,
    complementFor: "office",
    options: [
      { value: "city", label: "Ciudad" },
      { value: "ocean", label: "Océano" },
      { value: "mountain", label: "Montaña" },
      { value: "garden", label: "Jardín" },
    ],
  },
  { key: "airConditioning", label: "A/C", type: "boolean", width: 80, complementFor: "office" },
  { key: "elevatorAccess", label: "Ascensor", type: "boolean", width: 100, complementFor: "office" },
  // Campos de tipo (industrial)
  { key: "land", label: "Terreno", type: "text", width: 120, complementFor: "industrial" },
  { key: "warehouse", label: "Bodega", type: "text", width: 120, complementFor: "industrial" },
  { key: "mezzanine", label: "Mezzanine", type: "text", width: 120, complementFor: "industrial" },
  { key: "dimensions", label: "Dimensiones", type: "text", width: 130, complementFor: "industrial" },
  { key: "ceilingHeight", label: "Altura Techo", type: "number", width: 120, complementFor: "industrial" },
  { key: "loadingDock", label: "Muelle", type: "boolean", width: 90, complementFor: "industrial" },
  { key: "loadingDockCount", label: "Muelles", type: "number", width: 100, complementFor: "industrial" },
  { key: "truckAccess", label: "Acceso Camión", type: "boolean", width: 130, complementFor: "industrial" },
  { key: "railAccess", label: "Acceso Ferroviario", type: "boolean", width: 140, complementFor: "industrial" },
  { key: "powerCapacity", label: "Capacidad Energía", type: "number", width: 140, complementFor: "industrial" },
  {
    key: "powerUnit",
    label: "Unidad Energía",
    type: "select",
    width: 130,
    complementFor: "industrial",
    options: [
      { value: "kW", label: "kW" },
      { value: "MW", label: "MW" },
    ],
  },
  { key: "waterSupply", label: "Agua", type: "boolean", width: 80, complementFor: "industrial" },
  { key: "sewageSystem", label: "Alcantarillado", type: "boolean", width: 130, complementFor: "industrial" },
  { key: "fireSuppression", label: "Supresión Fuego", type: "boolean", width: 140, complementFor: "industrial" },
  { key: "securitySystem", label: "Seguridad", type: "boolean", width: 110, complementFor: "industrial" },
  { key: "officeSpace", label: "Espacio Oficina", type: "number", width: 140, complementFor: "industrial" },
  { key: "storageCapacity", label: "Capacidad Almacén", type: "number", width: 150, complementFor: "industrial" },
  { key: "zoning", label: "Zonificación", type: "text", width: 120, complementFor: "industrial" },
  // Campos readonly
  { key: "documentId", label: "ID", type: "readonly", width: 180 },
  { key: "project", label: "Proyecto", type: "readonly", width: 150 },
]

function getNestedValue(unit: StrapiUnit, key: string): unknown {
  // Si la key no tiene punto, es un campo directo
  if (!key.includes(".")) {
    if (key === "unitType") {
      return getSelectedUnitKind(unit) ?? ""
    }
    const zi = dynamicZoneFieldIndex(unit, key)
    if (zi >= 0) {
      const dz = getUnitDynamicZone(unit)
      const comp = dz[zi] as unknown as Record<string, unknown> | undefined
      if (comp && key in comp) {
        return comp[key]
      }
    }
    return (unit as unknown as Record<string, unknown>)[key]
  }

  const [parent, child] = key.split(".")
  
  if (parent === "project") {
    const u = unit as StrapiUnit & { project?: Record<string, unknown> }
    return u.project?.[child]
  }
  
  if (parent === "type") {
    const dz = getUnitDynamicZone(unit)
    if (dz.length > 0) {
      const residential = dz.find((t) => {
        const c = t.__component as string
        return c === "unit-types.housing" || c === "unit-types.residential"
      })
      const office = dz.find((t) => {
        const c = t.__component as string
        return c === "unit-types.offices" || c === "unit-types.office"
      })
      const industrial = dz.find((t) => t.__component === "unit-types.industrial")
      
      if (residential && child in residential) {
        return (residential as unknown as Record<string, unknown>)[child]
      }
      if (office && child in office) {
        return (office as unknown as Record<string, unknown>)[child]
      }
      if (industrial && child in industrial) {
        return (industrial as unknown as Record<string, unknown>)[child]
      }
    }
    return undefined
  }
  
  return undefined
}

function setNestedValue(unit: StrapiUnit, key: string, value: unknown): StrapiUnit {
  const updated = { ...unit }
  
  if (key.includes(".")) {
    const typeIdx = key.match(/^type\[(\d+)]\.(.+)$/)
    if (typeIdx) {
      const index = parseInt(typeIdx[1], 10)
      const child = typeIdx[2]
      const dz = [...getUnitDynamicZone(updated)]
      const entry = dz[index]
      if (entry) {
        dz[index] = { ...entry, [child]: value } as StrapiUnitType
        return { ...updated, unitType: dz }
      }
      return updated
    }
    const [parent, child] = key.split(".")
    if (parent === "type") {
      const dz = getUnitDynamicZone(updated)
      if (dz.length > 0) {
        const newDz = dz.map((t) => {
          const c = t.__component as string
          if ((c === "unit-types.housing" || c === "unit-types.residential") && child in t) {
            return { ...t, [child]: value }
          }
          if ((c === "unit-types.offices" || c === "unit-types.office") && child in t) {
            return { ...t, [child]: value }
          }
          if (c === "unit-types.industrial" && child in t) {
            return { ...t, [child]: value }
          }
          return t
        })
        return { ...updated, unitType: newDz }
      }
    }
  } else {
    if (key === "unitType") {
      const kind = value as UnitKindCombo
      const comp = UNIT_KIND_TO_COMPONENT[kind]
      const next = comp ? [emptyUnitTypeEntry(comp)] : []
      return { ...updated, unitType: next }
    }
    ;(updated as unknown as Record<string, unknown>)[key] = value
  }
  
  return updated
}

const RESIDENTIAL_DZ_FIELDS = [
  "bedrooms",
  "bathrooms",
  "parkingSpaces",
  "floor",
  "orientation",
  "furnished",
  "balcony",
  "terrace",
  "garden",
  "petFriendly",
  "smokingAllowed",
] as const
const OFFICE_DZ_FIELDS = [
  "class",
  "employees",
  "meetingRooms",
  "privateOffices",
  "receptionArea",
  "openSpace",
  "kitchenette",
  "storageRoom",
  "view",
  "airConditioning",
  "elevatorAccess",
] as const
const INDUSTRIAL_DZ_FIELDS = [
  "land",
  "warehouse",
  "mezzanine",
  "dimensions",
  "ceilingHeight",
  "loadingDock",
  "loadingDockCount",
  "truckAccess",
  "railAccess",
  "powerCapacity",
  "powerUnit",
  "waterSupply",
  "sewageSystem",
  "fireSuppression",
  "securitySystem",
  "officeSpace",
  "storageCapacity",
  "zoning",
] as const

function dynamicZoneFieldIndex(unit: StrapiUnit, child: string): number {
  const dz = getUnitDynamicZone(unit)
  if (dz.length === 0) return -1
  if ((RESIDENTIAL_DZ_FIELDS as readonly string[]).includes(child)) {
    return dz.findIndex((t) => {
      const c = t.__component as string
      return c === "unit-types.housing" || c === "unit-types.residential"
    })
  }
  if ((OFFICE_DZ_FIELDS as readonly string[]).includes(child)) {
    return dz.findIndex((t) => {
      const c = t.__component as string
      return c === "unit-types.offices" || c === "unit-types.office"
    })
  }
  if ((INDUSTRIAL_DZ_FIELDS as readonly string[]).includes(child)) {
    return dz.findIndex((t) => t.__component === "unit-types.industrial")
  }
  return -1
}

function getFieldPath(key: string, unit?: StrapiUnit): { field: string; isNested: boolean; componentType?: string } {
  if (key.includes(".")) {
    const [parent, child] = key.split(".")
    if (parent === "type" && unit) {
      const componentIndex = dynamicZoneFieldIndex(unit, child)
      if (componentIndex >= 0) {
        return { field: `type[${componentIndex}].${child}`, isNested: true }
      }
    }
    return { field: key, isNested: false }
  }

  if (unit) {
    const componentIndex = dynamicZoneFieldIndex(unit, key)
    if (componentIndex >= 0) {
      return { field: `type[${componentIndex}].${key}`, isNested: true }
    }
  }

  return { field: key, isNested: false }
}

interface CellPosition {
  rowIndex: number
  colIndex: number
}

interface EditableCellProps {
  unit: StrapiUnit
  column: ColumnDef
  value: unknown
  onUpdate: (unitId: string, field: string, value: unknown) => void
  isUpdating: boolean
  complementDisabled: boolean
  position: CellPosition
  isSelected: boolean
  isActive: boolean
  isSelectionStart: boolean
  isSelectionEnd: boolean
  onMouseDown: (e: React.MouseEvent, position: CellPosition) => void
  onMouseEnter: (e: React.MouseEvent, position: CellPosition) => void
  onMouseUp: () => void
}

const EditableCell = memo(function EditableCell({
  unit,
  column,
  value,
  onUpdate,
  isUpdating,
  complementDisabled,
  position,
  isSelected,
  isActive,
  isSelectionStart,
  isSelectionEnd,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
}: EditableCellProps) {
  const [localValue, setLocalValue] = useState(value)
  const [isEditing, setIsEditing] = useState(false)
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = useCallback(
    (newValue: unknown) => {
      setLocalValue(newValue)
      setIsEditing(true)

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }

      debounceTimer.current = setTimeout(() => {
        const { field } = getFieldPath(column.key, unit)
        onUpdate(unit.documentId || String(unit.id), field, newValue)
        setIsEditing(false)
      }, 500)
    },
    [column.key, unit.documentId, unit.id, onUpdate]
  )

  const handleBlur = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    const { field } = getFieldPath(column.key, unit)
    onUpdate(unit.documentId || String(unit.id), field, localValue)
    setIsEditing(false)
  }, [column.key, unit, unit.documentId, unit.id, localValue, onUpdate])

  // Minimal styling for performance - similar to Airtable
  const cellClassName = cn("px-3 py-2 relative", complementDisabled && "opacity-50")
  const cellStyle: React.CSSProperties = {
    backgroundColor: complementDisabled
      ? "rgba(0, 0, 0, 0.04)"
      : isSelected
        ? "rgba(59, 130, 246, 0.15)"
        : isActive
          ? "rgba(59, 130, 246, 0.08)"
          : undefined,
    outline: isActive ? "2px solid rgb(37, 99, 235)" : undefined,
    outlineOffset: isActive ? "-2px" : undefined,
    transition: "background-color 0.05s ease",
  }
  const controlDisabled = isUpdating || complementDisabled

  if (column.type === "readonly") {
    if (column.key === "project") {
      return (
        <div
          ref={cellRef}
          data-cell-row={position.rowIndex}
          data-cell-col={position.colIndex}
          className={cellClassName}
          style={cellStyle}
          onMouseDown={(e) => onMouseDown(e, position)}
          onMouseEnter={(e) => onMouseEnter(e, position)}
          onMouseUp={onMouseUp}
        >
          {(unit as StrapiUnit & { project?: { name?: string } }).project?.name || "—"}
        </div>
      )
    }
    if (column.key === "documentId") {
      return (
        <div
          ref={cellRef}
          data-cell-row={position.rowIndex}
          data-cell-col={position.colIndex}
          className={cn(cellClassName, "text-sm font-mono text-muted-foreground")}
          style={cellStyle}
          onMouseDown={(e) => onMouseDown(e, position)}
          onMouseEnter={(e) => onMouseEnter(e, position)}
          onMouseUp={onMouseUp}
        >
          {unit.documentId || "—"}
        </div>
      )
    }
    return (
      <div
        ref={cellRef}
        data-cell-row={position.rowIndex}
        data-cell-col={position.colIndex}
          className={cn(cellClassName, "text-sm text-foreground")}
          style={cellStyle}
          onMouseDown={(e) => onMouseDown(e, position)}
          onMouseEnter={(e) => onMouseEnter(e, position)}
          onMouseUp={onMouseUp}
        >
          {String(value ?? "—")}
        </div>
    )
  }

  if (column.type === "boolean") {
      return (
        <div
          ref={cellRef}
          data-cell-row={position.rowIndex}
          data-cell-col={position.colIndex}
          className={cellClassName}
          style={cellStyle}
          onMouseDown={(e) => onMouseDown(e, position)}
          onMouseEnter={(e) => onMouseEnter(e, position)}
          onMouseUp={onMouseUp}
        >
        <Switch
          checked={Boolean(localValue)}
          onCheckedChange={handleChange}
          disabled={controlDisabled}
        />
        {isEditing && (
          <Loader2 className="ml-2 w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </div>
    )
  }

  if (column.type === "select") {
      return (
        <div
          ref={cellRef}
          data-cell-row={position.rowIndex}
          data-cell-col={position.colIndex}
          className={cellClassName}
          style={cellStyle}
          onMouseDown={(e) => onMouseDown(e, position)}
          onMouseEnter={(e) => onMouseEnter(e, position)}
          onMouseUp={onMouseUp}
        >
        <Select
          value={
            column.key === "unitType" && (localValue === "" || localValue == null)
              ? undefined
              : String(localValue ?? "")
          }
          onValueChange={handleChange}
          disabled={controlDisabled}
        >
          <SelectTrigger className="h-8 text-sm border-0 bg-transparent shadow-none focus:ring-0 focus:ring-offset-0 px-0">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {column.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isEditing && (
          <Loader2 className="mt-1 w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </div>
    )
  }

  if (column.type === "currency" || column.type === "number") {
      return (
        <div
          ref={cellRef}
          data-cell-row={position.rowIndex}
          data-cell-col={position.colIndex}
          className={cellClassName}
          style={cellStyle}
          onMouseDown={(e) => onMouseDown(e, position)}
          onMouseEnter={(e) => onMouseEnter(e, position)}
          onMouseUp={onMouseUp}
        >
          <Input
            ref={inputRef}
            type="number"
            value={localValue === null || localValue === undefined ? "" : String(localValue)}
            onChange={(e) => {
              const numValue = e.target.value === "" ? 0 : parseFloat(e.target.value)
              handleChange(isNaN(numValue) ? 0 : numValue)
            }}
            onBlur={handleBlur}
            disabled={controlDisabled}
            className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            step={column.type === "currency" ? "0.01" : "1"}
          />
        {isEditing && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </div>
    )
  }

  // Text type
  return (
    <div
      ref={cellRef}
      data-cell-row={position.rowIndex}
      data-cell-col={position.colIndex}
      className={cn(cellClassName, "relative")}
      onMouseDown={(e) => onMouseDown(e, position)}
      onMouseEnter={(e) => onMouseEnter(e, position)}
      onMouseUp={onMouseUp}
    >
        <Input
          ref={inputRef}
          type="text"
          value={String(localValue ?? "")}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          disabled={controlDisabled}
          className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
        />
      {isEditing && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render if these change
  return (
    prevProps.value === nextProps.value &&
    prevProps.isUpdating === nextProps.isUpdating &&
    prevProps.complementDisabled === nextProps.complementDisabled &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isSelectionStart === nextProps.isSelectionStart &&
    prevProps.isSelectionEnd === nextProps.isSelectionEnd &&
    prevProps.unit.documentId === nextProps.unit.documentId &&
    getUnitDynamicZone(prevProps.unit)[0]?.__component ===
      getUnitDynamicZone(nextProps.unit)[0]?.__component
  )
})

export function EditableUnitsTable({ units, isLoading, onUpdate }: EditableUnitsTableProps) {
  const [localUnits, setLocalUnits] = useState<StrapiUnit[]>(units)
  const [updatingFields, setUpdatingFields] = useState<Set<string>>(new Set())
  const [updateStatus, setUpdateStatus] = useState<Map<string, "success" | "error">>(new Map())
  
  // Selection state
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null)
  const [selectionStart, setSelectionStart] = useState<CellPosition | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<CellPosition | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [copiedData, setCopiedData] = useState<string[][]>([])
  const [showPasteConfirm, setShowPasteConfirm] = useState(false)
  const [pendingPaste, setPendingPaste] = useState<{
    data: string[][]
    targetStart: CellPosition
  } | null>(null)
  
  // Undo/Redo state
  const [history, setHistory] = useState<StrapiUnit[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const tableRef = useRef<HTMLTableElement>(null)

  useEffect(() => {
    setLocalUnits(units)
  }, [units])

  // Initialize history once
  useEffect(() => {
    if (history.length === 0 && units.length > 0) {
      setHistory([units])
      setHistoryIndex(0)
    }
  }, [units, history.length])

  const isKeyboardNavigable = useCallback((rowIndex: number, colIndex: number) => {
    const colDef = columns[colIndex]
    if (!colDef || colDef.type === "readonly") return false
    const unit = localUnits[rowIndex]
    if (!unit) return false
    return isComplementColumnActive(unit, colDef)
  }, [localUnits])

  // Initialize active cell
  useEffect(() => {
    if (localUnits.length > 0 && !activeCell) {
      for (let col = 0; col < columns.length; col++) {
        if (isKeyboardNavigable(0, col)) {
          setActiveCell({ rowIndex: 0, colIndex: col })
          setSelectionStart({ rowIndex: 0, colIndex: col })
          setSelectionEnd({ rowIndex: 0, colIndex: col })
          break
        }
      }
    }
  }, [localUnits, activeCell, isKeyboardNavigable])


  // Global mouse up handler
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsSelecting(false)
    }

    if (isSelecting) {
      window.addEventListener('mouseup', handleGlobalMouseUp)
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isSelecting])

  // Get selected cells
  const getSelectedCells = useCallback((): CellPosition[] => {
    if (!selectionStart || !selectionEnd) return []

    const minRow = Math.min(selectionStart.rowIndex, selectionEnd.rowIndex)
    const maxRow = Math.max(selectionStart.rowIndex, selectionEnd.rowIndex)
    const minCol = Math.min(selectionStart.colIndex, selectionEnd.colIndex)
    const maxCol = Math.max(selectionStart.colIndex, selectionEnd.colIndex)

    const cells: CellPosition[] = []
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        // Skip readonly columns
        if (columns[col]?.type === "readonly") continue
        cells.push({ rowIndex: row, colIndex: col })
      }
    }
    return cells
  }, [selectionStart, selectionEnd])

  // Memoized selection bounds for performance
  const selectionBounds = useMemo(() => {
    if (!selectionStart || !selectionEnd) return null
    return {
      minRow: Math.min(selectionStart.rowIndex, selectionEnd.rowIndex),
      maxRow: Math.max(selectionStart.rowIndex, selectionEnd.rowIndex),
      minCol: Math.min(selectionStart.colIndex, selectionEnd.colIndex),
      maxCol: Math.max(selectionStart.colIndex, selectionEnd.colIndex),
    }
  }, [selectionStart, selectionEnd])

  // Check if cell is selected (optimized)
  const isCellSelected = useCallback(
    (position: CellPosition): boolean => {
      if (!selectionBounds) return false
      const { rowIndex, colIndex } = position
      return (
        rowIndex >= selectionBounds.minRow &&
        rowIndex <= selectionBounds.maxRow &&
        colIndex >= selectionBounds.minCol &&
        colIndex <= selectionBounds.maxCol &&
        columns[colIndex]?.type !== "readonly"
      )
    },
    [selectionBounds]
  )


  // Copy handler
  const handleCopy = useCallback(() => {
    if (!selectionBounds) return

    const data: string[][] = []
    for (let row = selectionBounds.minRow; row <= selectionBounds.maxRow; row++) {
      const rowData: string[] = []
      for (let col = selectionBounds.minCol; col <= selectionBounds.maxCol; col++) {
        const unit = localUnits[row]
        const colDef = columns[col]
        if (unit && colDef) {
          const value = getNestedValue(unit, colDef.key)
          rowData.push(String(value ?? ""))
        } else {
          rowData.push("")
        }
      }
      data.push(rowData)
    }

    setCopiedData(data)
    
    // Copy to clipboard
    const text = data.map((row) => row.join("\t")).join("\n")
    navigator.clipboard.writeText(text).catch(console.error)
  }, [selectionBounds, localUnits])

  // Paste handler
  const handlePaste = useCallback(async () => {
    if (!selectionStart) return

    try {
      const clipboardText = await navigator.clipboard.readText()
      const data = clipboardText
        .split("\n")
        .map((row) => row.split("\t").map((cell) => cell.trim()))
        .filter((row) => row.length > 0)

      if (data.length === 0) return

      const targetStart = selectionStart
      const totalCells = data.reduce((sum, row) => sum + row.length, 0)

      // If more than 1 cell, show confirmation
      if (totalCells > 1) {
        setPendingPaste({ data, targetStart })
        setShowPasteConfirm(true)
      } else {
        // Single cell, paste directly
        await executePaste(data, targetStart)
      }
    } catch (error) {
      console.error("Error reading clipboard:", error)
    }
  }, [selectionStart])

  // Execute paste
  const executePaste = useCallback(
    async (data: string[][], targetStart: CellPosition) => {
      const updates: Array<{ unitId: string; field: string; value: unknown }> = []

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const unitIndex = targetStart.rowIndex + i
        if (unitIndex >= localUnits.length) break

        const unit = localUnits[unitIndex]
        if (!unit) continue

        for (let j = 0; j < row.length; j++) {
          const colIndex = targetStart.colIndex + j
          if (colIndex >= columns.length) break

          const colDef = columns[colIndex]
          if (!colDef || colDef.type === "readonly") continue
          if (!isComplementColumnActive(unit, colDef)) continue

          const cellValue = row[j]
          const { field } = getFieldPath(colDef.key, unit)

          // Convert value based on column type
          let convertedValue: unknown = cellValue
          if (colDef.type === "number" || colDef.type === "currency") {
            convertedValue = cellValue === "" ? 0 : parseFloat(cellValue) || 0
          } else if (colDef.type === "boolean") {
            convertedValue = cellValue.toLowerCase() === "true" || cellValue === "1"
          }

          updates.push({
            unitId: unit.documentId || String(unit.id),
            field,
            value: convertedValue,
          })
        }
      }

      // Batch update
      if (updates.length > 0) {
        await handleBatchUpdate(updates)
      }
    },
    [localUnits]
  )

  // Batch update handler
  const handleBatchUpdate = useCallback(
    async (updates: Array<{ unitId: string; field: string; value: unknown }>) => {
      // Optimistic update
      setLocalUnits((prev) =>
        prev.map((unit) => {
          const unitUpdates = updates.filter(
            (u) => (unit.documentId || String(unit.id)) === u.unitId
          )
          if (unitUpdates.length === 0) return unit

          let updated = unit
          for (const update of unitUpdates) {
            updated = setNestedValue(updated, update.field, update.value)
          }
          return updated
        })
      )

      // Update in Strapi
      try {
        await Promise.all(
          updates.map((update) =>
            strapiClient.updateUnit(
              update.unitId,
              update.field,
              toApiFieldValue(update.field, update.value)
            )
          )
        )

        // Show success
        updates.forEach((update) => {
          const updateKey = `${update.unitId}:${update.field}`
          setUpdateStatus((prev) => new Map(prev).set(updateKey, "success"))
          setTimeout(() => {
            setUpdateStatus((prev) => {
              const next = new Map(prev)
              next.delete(updateKey)
              return next
            })
          }, 2000)
        })
      } catch (error) {
        console.error("Error in batch update:", error)
        // Revert on error
        setLocalUnits(units)
      }
    },
    [units]
  )

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, position: CellPosition) => {
    if (columns[position.colIndex]?.type === "readonly") return
    e.preventDefault()
    
    if (e.shiftKey && activeCell) {
      // Shift+Click: extend selection
      setSelectionStart(activeCell)
      setSelectionEnd(position)
      setActiveCell(position)
    } else {
      // Regular click: new selection
      setActiveCell(position)
      setSelectionStart(position)
      setSelectionEnd(position)
      setIsSelecting(true)
    }
  }, [activeCell])

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, position: CellPosition) => {
      if (isSelecting && selectionStart && !e.shiftKey) {
        setSelectionEnd(position)
        setActiveCell(position)
      }
    },
    [isSelecting, selectionStart]
  )

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false)
  }, [])

  // Confirm paste
  const handleConfirmPaste = useCallback(async () => {
    if (pendingPaste) {
      await executePaste(pendingPaste.data, pendingPaste.targetStart)
      setPendingPaste(null)
    }
    setShowPasteConfirm(false)
  }, [pendingPaste, executePaste])

  // Save state to history
  const saveToHistory = useCallback((newState: StrapiUnit[]) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(JSON.parse(JSON.stringify(newState))) // Deep clone
      // Limit history to 50 states
      if (newHistory.length > 50) {
        newHistory.shift()
        setHistoryIndex(49)
        return newHistory
      }
      setHistoryIndex(newHistory.length - 1)
      return newHistory
    })
  }, [historyIndex])

  // Undo handler
  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (historyIndex > 0) {
        const prevIndex = historyIndex - 1
        setHistoryIndex(prevIndex)
        setLocalUnits(JSON.parse(JSON.stringify(prev[prevIndex]))) // Deep clone
      }
      return prev
    })
  }, [historyIndex])

  // Redo handler
  const handleRedo = useCallback(() => {
    setHistory((prev) => {
      if (historyIndex < prev.length - 1) {
        const nextIndex = historyIndex + 1
        setHistoryIndex(nextIndex)
        setLocalUnits(JSON.parse(JSON.stringify(prev[nextIndex]))) // Deep clone
      }
      return prev
    })
  }, [historyIndex])

  // Navigate to cell (optimized for performance)
  const navigateToCell = useCallback((row: number, col: number, extendSelection = false) => {
    const maxRow = localUnits.length - 1
    const maxCol = columns.length - 1
    
    // Clamp to valid range
    const newRow = Math.max(0, Math.min(row, maxRow))
    const newCol = Math.max(0, Math.min(col, maxCol))
    
    let finalCol = newCol
    while (finalCol >= 0 && !isKeyboardNavigable(newRow, finalCol)) {
      finalCol--
    }
    if (finalCol < 0) {
      finalCol = newCol
      while (finalCol <= maxCol && !isKeyboardNavigable(newRow, finalCol)) {
        finalCol++
      }
      if (finalCol > maxCol) finalCol = newCol
    }
    
    const newPosition: CellPosition = { rowIndex: newRow, colIndex: finalCol }
    
    // Batch state updates for better performance
    if (extendSelection && selectionStart) {
      setSelectionEnd(newPosition)
      setActiveCell(newPosition)
    } else {
      // Use functional updates to avoid dependencies
      setActiveCell(newPosition)
      setSelectionStart(newPosition)
      setSelectionEnd(newPosition)
    }
    
    // Scroll into view immediately for instant feedback
    const cellElement = tableRef.current?.querySelector(
      `[data-cell-row="${newRow}"][data-cell-col="${finalCol}"]`
    ) as HTMLElement
    if (cellElement) {
      // Use immediate scroll for instant feedback
      cellElement.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' })
    }
  }, [localUnits, selectionStart, isKeyboardNavigable])

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey
      const shiftKey = e.shiftKey

      // Track Shift key
      if (e.key === 'Shift') {
        setIsShiftPressed(true)
      }

      // Don't handle if typing in an input (except navigation keys)
      const target = e.target as HTMLElement
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.closest('[role="combobox"]')
      const isNavigationKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)
      
      // Allow navigation keys even in inputs for better UX
      if (isInput && !isNavigationKey && e.key.length === 1 && !ctrlKey) {
        return
      }
      
      // If in input and pressing navigation, blur first
      if (isInput && isNavigationKey) {
        ;(target as HTMLElement)?.blur()
      }

      // Undo (Ctrl+Z / Cmd+Z)
      if (ctrlKey && e.key === 'z' && !shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      }

      // Redo (Ctrl+Y or Ctrl+Shift+Z / Cmd+Y or Cmd+Shift+Z)
      if (ctrlKey && (e.key === 'y' || (e.key === 'z' && shiftKey))) {
        e.preventDefault()
        handleRedo()
        return
      }

      // Copy (Ctrl+C / Cmd+C)
      if (ctrlKey && e.key === 'c' && selectionStart && selectionEnd) {
        e.preventDefault()
        handleCopy()
        return
      }

      // Paste (Ctrl+V / Cmd+V)
      if (ctrlKey && e.key === 'v') {
        e.preventDefault()
        handlePaste()
        return
      }

      // Navigation keys - use current activeCell state directly
      if (!activeCell) return

      const { rowIndex, colIndex } = activeCell
      let newRow = rowIndex
      let newCol = colIndex
      let shouldNavigate = false

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          newRow = Math.max(0, rowIndex - 1)
          shouldNavigate = true
          break
        case 'ArrowDown':
          e.preventDefault()
          newRow = Math.min(localUnits.length - 1, rowIndex + 1)
          shouldNavigate = true
          break
        case 'ArrowLeft':
          e.preventDefault()
          newCol = Math.max(0, colIndex - 1)
          while (newCol >= 0 && !isKeyboardNavigable(rowIndex, newCol)) {
            newCol--
          }
          if (newCol < 0) newCol = colIndex
          shouldNavigate = true
          break
        case 'ArrowRight':
          e.preventDefault()
          newCol = Math.min(columns.length - 1, colIndex + 1)
          while (newCol < columns.length && !isKeyboardNavigable(rowIndex, newCol)) {
            newCol++
          }
          if (newCol >= columns.length) newCol = colIndex
          shouldNavigate = true
          break
        case 'Tab':
          e.preventDefault()
          if (shiftKey) {
            newCol = Math.max(0, colIndex - 1)
            while (newCol >= 0 && !isKeyboardNavigable(rowIndex, newCol)) {
              newCol--
            }
            if (newCol < 0) {
              newRow = Math.max(0, rowIndex - 1)
              newCol = columns.length - 1
              while (newCol >= 0 && !isKeyboardNavigable(newRow, newCol)) {
                newCol--
              }
              if (newCol < 0) newCol = colIndex
            }
          } else {
            newCol = Math.min(columns.length - 1, colIndex + 1)
            while (newCol < columns.length && !isKeyboardNavigable(rowIndex, newCol)) {
              newCol++
            }
            if (newCol >= columns.length) {
              newRow = Math.min(localUnits.length - 1, rowIndex + 1)
              newCol = 0
              while (newCol < columns.length && !isKeyboardNavigable(newRow, newCol)) {
                newCol++
              }
              if (newCol >= columns.length) newCol = colIndex
            }
          }
          shouldNavigate = true
          break
        case 'Enter':
          e.preventDefault()
          newRow = Math.min(localUnits.length - 1, rowIndex + 1)
          shouldNavigate = true
          break
        case 'Home':
          e.preventDefault()
          if (ctrlKey) {
            newRow = 0
            newCol = 0
            while (newCol < columns.length && !isKeyboardNavigable(newRow, newCol)) {
              newCol++
            }
          } else {
            newCol = 0
            while (newCol < columns.length && !isKeyboardNavigable(rowIndex, newCol)) {
              newCol++
            }
          }
          shouldNavigate = true
          break
        case 'End':
          e.preventDefault()
          if (ctrlKey) {
            newRow = localUnits.length - 1
            newCol = columns.length - 1
            while (newCol >= 0 && !isKeyboardNavigable(newRow, newCol)) {
              newCol--
            }
          } else {
            newCol = columns.length - 1
            while (newCol >= 0 && !isKeyboardNavigable(rowIndex, newCol)) {
              newCol--
            }
          }
          shouldNavigate = true
          break
        case 'PageUp':
          e.preventDefault()
          newRow = Math.max(0, rowIndex - 10)
          shouldNavigate = true
          break
        case 'PageDown':
          e.preventDefault()
          newRow = Math.min(localUnits.length - 1, rowIndex + 10)
          shouldNavigate = true
          break
      }

      if (shouldNavigate) {
        navigateToCell(newRow, newCol, shiftKey)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [
    activeCell,
    selectionStart,
    selectionEnd,
    localUnits.length,
    handleCopy,
    handlePaste,
    handleUndo,
    handleRedo,
    navigateToCell,
    isKeyboardNavigable,
  ])

  const handleUpdate = useCallback(
    async (unitId: string, field: string, value: unknown) => {
      const updateKey = `${unitId}:${field}`
      setUpdatingFields((prev) => new Set(prev).add(updateKey))

      // Save current state to history before update
      const currentState = [...localUnits]
      saveToHistory(currentState)

      try {
        // Optimistic update
        const updatedUnits = localUnits.map((unit) => {
          if ((unit.documentId || String(unit.id)) === unitId) {
            return setNestedValue(unit, field, value)
          }
          return unit
        })
        setLocalUnits(updatedUnits)

        await strapiClient.updateUnit(unitId, field, toApiFieldValue(field, value))

        setUpdateStatus((prev) => new Map(prev).set(updateKey, "success"))
        setTimeout(() => {
          setUpdateStatus((prev) => {
            const next = new Map(prev)
            next.delete(updateKey)
            return next
          })
        }, 2000)

        // Callback opcional
        if (onUpdate) {
          onUpdate(unitId, field, value)
        }
      } catch (error) {
        console.error("Error updating unit:", error)
        setUpdateStatus((prev) => new Map(prev).set(updateKey, "error"))

        // Revertir cambio
        setLocalUnits((prev) =>
          prev.map((unit) => {
            if ((unit.documentId || String(unit.id)) === unitId) {
              return units.find((u) => (u.documentId || String(u.id)) === unitId) || unit
            }
            return unit
          })
        )
      } finally {
        setUpdatingFields((prev) => {
          const next = new Set(prev)
          next.delete(updateKey)
          return next
        })
      }
    },
    [units, onUpdate, localUnits, saveToHistory]
  )

  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                {columns.slice(0, 10).map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    style={{ width: col.width }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, idx) => (
                <tr key={idx} className="border-b border-border">
                  {columns.slice(0, 10).map((col) => (
                    <td key={col.key} className="px-3 py-2">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )
  }

  if (localUnits.length === 0) {
    return (
      <Card className="border-border bg-card">
        <div className="p-10 text-center text-sm text-muted-foreground">
          No hay unidades disponibles
        </div>
      </Card>
    )
  }

  return (
    <div className="border border-border bg-background rounded-lg overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <table ref={tableRef} className="w-full border-collapse">
          <thead className="bg-muted/30 sticky top-0 z-20 border-b border-border">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-foreground border-r border-b border-border/50 bg-muted/50"
                  style={{ minWidth: col.width, width: col.width, position: 'sticky', top: 0 }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localUnits.map((unit, rowIndex) => (
              <tr
                key={unit.documentId || unit.id}
                className="hover:bg-muted/20 transition-none"
              >
                {columns.map((col, colIndex) => {
                  const value = getNestedValue(unit, col.key)
                  const updateKey = `${unit.documentId || unit.id}:${col.key}`
                  const isUpdating = updatingFields.has(updateKey)
                  const status = updateStatus.get(updateKey)
                  const position: CellPosition = { rowIndex, colIndex }
                  const isSelected = isCellSelected(position)
                  const isActive = activeCell?.rowIndex === rowIndex && activeCell?.colIndex === colIndex
                  const isSelectionStart =
                    selectionBounds !== null &&
                    rowIndex === selectionBounds.minRow &&
                    colIndex === selectionBounds.minCol
                  const isSelectionEnd =
                    selectionBounds !== null &&
                    rowIndex === selectionBounds.maxRow &&
                    colIndex === selectionBounds.maxCol

                  return (
                    <td
                      key={col.key}
                      className="align-top"
                      style={{
                        backgroundColor: status === "success" ? 'rgba(34, 197, 94, 0.1)' : status === "error" ? 'rgba(239, 68, 68, 0.1)' : undefined
                      }}
                    >
                      <EditableCell
                        unit={unit}
                        column={col}
                        value={value}
                        onUpdate={handleUpdate}
                        isUpdating={isUpdating}
                        complementDisabled={!isComplementColumnActive(unit, col)}
                        position={position}
                        isSelected={isSelected}
                        isActive={isActive}
                        isSelectionStart={isSelectionStart}
                        isSelectionEnd={isSelectionEnd}
                        onMouseDown={handleMouseDown}
                        onMouseEnter={handleMouseEnter}
                        onMouseUp={handleMouseUp}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={showPasteConfirm} onOpenChange={setShowPasteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar pegado</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPaste
                ? `Vas a afectar ${pendingPaste.data.reduce((sum, row) => sum + row.length, 0)} campo(s). ¿Deseas continuar?`
                : "¿Deseas pegar los datos?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPaste(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPaste}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

