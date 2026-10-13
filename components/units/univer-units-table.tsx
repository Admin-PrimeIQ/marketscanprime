"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { StrapiUnit } from "@/lib/api/strapi"
import { strapiClient } from "@/lib/api/strapi"
import { Univer, UniverSheetsPlugin, IWorkbookData, ISheetData } from "@univerjs/core"
import { useTranslations } from "next-intl"
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui"
import { UniverDesignPlugin } from "@univerjs/design"
import "@univerjs/core/lib/index.css"
import "@univerjs/sheets-ui/lib/index.css"
import "@univerjs/design/lib/index.css"

interface UniverUnitsTableProps {
  units: StrapiUnit[]
  isLoading?: boolean
  onUpdate?: (unitId: string, field: string, value: unknown) => void
}

// Column definitions matching the schema
const columnDefs = [
  { key: "code", label: "Código", width: 120 },
  { key: "name", label: "Nombre", width: 200 },
  { key: "description", label: "Descripción", width: 250 },
  { key: "unitType", label: "Tipo", width: 140 },
  { key: "area", label: "Área", width: 100 },
  { key: "areaUnit", label: "Unidad", width: 100 },
  { key: "price", label: "Precio", width: 140 },
  { key: "rent", label: "Renta", width: 140 },
  { key: "currency", label: "Moneda", width: 100 },
  { key: "kpis", label: "KPIs", width: 150 },
  { key: "availability", label: "Disponibilidad", width: 140 },
  { key: "isActive", label: "Activo", width: 80 },
  // Residential fields
  { key: "bedrooms", label: "Habitaciones", width: 110 },
  { key: "bathrooms", label: "Baños", width: 90 },
  { key: "parkingSpaces", label: "Parqueos", width: 100 },
  { key: "floor", label: "Piso", width: 80 },
  { key: "orientation", label: "Orientación", width: 120 },
  { key: "furnished", label: "Amueblado", width: 120 },
  { key: "balcony", label: "Balcón", width: 90 },
  { key: "terrace", label: "Terraza", width: 90 },
  { key: "garden", label: "Jardín", width: 90 },
  { key: "petFriendly", label: "Mascotas", width: 100 },
  { key: "smokingAllowed", label: "Fumar", width: 90 },
  // Office fields
  { key: "class", label: "Clase", width: 100 },
  { key: "employees", label: "Empleados", width: 110 },
  { key: "meetingRooms", label: "Salas", width: 100 },
  { key: "privateOffices", label: "Oficinas", width: 110 },
  { key: "receptionArea", label: "Recepción", width: 110 },
  { key: "openSpace", label: "Open Space", width: 120 },
  { key: "kitchenette", label: "Cocina", width: 90 },
  { key: "storageRoom", label: "Almacén", width: 100 },
  { key: "view", label: "Vista", width: 120 },
  { key: "airConditioning", label: "A/C", width: 80 },
  { key: "elevatorAccess", label: "Ascensor", width: 100 },
  // Industrial fields
  { key: "land", label: "Terreno", width: 120 },
  { key: "warehouse", label: "Bodega", width: 120 },
  { key: "mezzanine", label: "Mezzanine", width: 120 },
  { key: "dimensions", label: "Dimensiones", width: 130 },
  { key: "ceilingHeight", label: "Altura Techo", width: 120 },
  { key: "loadingDock", label: "Muelle", width: 90 },
  { key: "loadingDockCount", label: "Muelles", width: 100 },
  { key: "truckAccess", label: "Acceso Camión", width: 130 },
  { key: "railAccess", label: "Acceso Ferroviario", width: 140 },
  { key: "powerCapacity", label: "Capacidad Energía", width: 140 },
  { key: "powerUnit", label: "Unidad Energía", width: 130 },
  { key: "waterSupply", label: "Agua", width: 80 },
  { key: "sewageSystem", label: "Alcantarillado", width: 130 },
  { key: "fireSuppression", label: "Supresión Fuego", width: 140 },
  { key: "securitySystem", label: "Seguridad", width: 110 },
  { key: "officeSpace", label: "Espacio Oficina", width: 140 },
  { key: "storageCapacity", label: "Capacidad Almacén", width: 150 },
  { key: "zoning", label: "Zonificación", width: 120 },
  // Readonly
  { key: "documentId", label: "ID", width: 180 },
  { key: "project", label: "Proyecto", width: 150 },
]

function getNestedValue(unit: StrapiUnit, key: string): unknown {
  if (!key.includes(".")) {
    return (unit as unknown as Record<string, unknown>)[key]
  }

  const [parent, child] = key.split(".")
  
  if (parent === "project") {
    return unit.project?.[child as keyof typeof unit.project]
  }
  
  if (parent === "type") {
    if (Array.isArray(unit.type)) {
      const residential = unit.type.find((t) => t.__component === "unit-types.housing" || t.__component === "unit-types.residential")
      const office = unit.type.find((t) => t.__component === "unit-types.offices" || t.__component === "unit-types.office")
      const industrial = unit.type.find((t) => t.__component === "unit-types.industrial")
      
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

function getFieldPath(key: string, unit?: StrapiUnit): string {
  if (!key.includes(".")) {
    return key
  }

  const [parent, child] = key.split(".")
  if (parent === "type" && unit) {
    const residentialFields = ["bedrooms", "bathrooms", "parkingSpaces", "floor", "orientation", "furnished", "balcony", "terrace", "garden", "petFriendly", "smokingAllowed"]
    const officeFields = ["class", "employees", "meetingRooms", "privateOffices", "receptionArea", "openSpace", "kitchenette", "storageRoom", "view", "airConditioning", "elevatorAccess"]
    const industrialFields = ["land", "warehouse", "mezzanine", "dimensions", "ceilingHeight", "loadingDock", "loadingDockCount", "truckAccess", "railAccess", "powerCapacity", "powerUnit", "waterSupply", "sewageSystem", "fireSuppression", "securitySystem", "officeSpace", "storageCapacity", "zoning"]
    
    if (Array.isArray(unit.type)) {
      let componentIndex = -1
      
      if (residentialFields.includes(child)) {
        componentIndex = unit.type.findIndex((t) => t.__component === "unit-types.housing" || t.__component === "unit-types.residential")
      } else if (officeFields.includes(child)) {
        componentIndex = unit.type.findIndex((t) => t.__component === "unit-types.offices" || t.__component === "unit-types.office")
      } else if (industrialFields.includes(child)) {
        componentIndex = unit.type.findIndex((t) => t.__component === "unit-types.industrial")
      }
      
      if (componentIndex >= 0) {
        return `type[${componentIndex}].${child}`
      }
    }
  }
  
  return key
}

export function UniverUnitsTable({ units, isLoading, onUpdate }: UniverUnitsTableProps) {
  const t = useTranslations('common')
  const containerRef = useRef<HTMLDivElement>(null)
  const univerRef = useRef<Univer | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Convert units to Univer sheet data
  const convertUnitsToSheetData = useCallback((unitsData: StrapiUnit[]): IWorkbookData => {
    const cellData: Record<string, Record<string, { v: unknown; m?: string }>> = {}
    
    // Add header row
    columnDefs.forEach((col, colIndex) => {
      const colLetter = String.fromCharCode(65 + colIndex) // A, B, C, etc.
      if (!cellData[0]) cellData[0] = {}
      cellData[0][colLetter] = { v: col.label, m: col.label }
    })

    // Add data rows
    unitsData.forEach((unit, rowIndex) => {
      const actualRow = rowIndex + 1 // Row 0 is header
      columnDefs.forEach((col, colIndex) => {
        const colLetter = String.fromCharCode(65 + colIndex)
        if (!cellData[actualRow]) cellData[actualRow] = {}
        
        let value = getNestedValue(unit, col.key)
        
        // Format values
        if (value === null || value === undefined) {
          value = ""
        } else if (typeof value === "boolean") {
          value = value ? "Sí" : "No"
        } else if (col.key === "project") {
          value = unit.project?.name || ""
        }
        
        cellData[actualRow][colLetter] = { 
          v: value, 
          m: String(value) 
        }
      })
    })

    const sheetData: ISheetData = {
      id: "sheet1",
      name: "Unidades",
      cellData,
      rowCount: unitsData.length + 1,
      columnCount: columnDefs.length,
      defaultColumnWidth: 100,
      defaultRowHeight: 30,
    }

    // Set column widths
    const columnProperties: Record<number, { w: number }> = {}
    columnDefs.forEach((col, index) => {
      columnProperties[index] = { w: col.width || 100 }
    })
    sheetData.columnProperties = columnProperties

    return {
      id: "workbook1",
      name: "Unidades",
      appVersion: "3.0.0-alpha",
      sheets: {
        sheet1: sheetData,
      },
      locale: "es",
      styles: {},
    }
  }, [])

  // Initialize Univer
  useEffect(() => {
    if (!containerRef.current || isLoading || units.length === 0 || isInitialized) return

    const univer = Univer.newInstance({
      theme: "default",
      locale: "es",
    })

    // Register plugins
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin, {
      container: containerRef.current,
      layout: {
        outerLeft: false,
        outerRight: false,
        header: true,
        footer: false,
        innerLeft: false,
        innerRight: false,
      },
    })
    univer.registerPlugin(UniverDesignPlugin)

    // Create workbook with data
    const workbookData = convertUnitsToSheetData(units)
    univer.createUnit(workbookData)

    univerRef.current = univer
    setIsInitialized(true)

    // Listen for cell changes
    const sheetsPlugin = univer.getPlugin(UniverSheetsPlugin)
    if (sheetsPlugin) {
      // TODO: Add cell change listener to sync with Strapi
    }

    return () => {
      if (univerRef.current) {
        univerRef.current.dispose()
        univerRef.current = null
        setIsInitialized(false)
      }
    }
  }, [units, isLoading, convertUnitsToSheetData, isInitialized])

  // Update when units change
  useEffect(() => {
    if (!univerRef.current || !isInitialized || isLoading) return

    const workbookData = convertUnitsToSheetData(units)
    // Update the workbook data
    // Note: Univer doesn't have a direct update method, so we might need to recreate
    // For now, we'll just reinitialize if data changes significantly
  }, [units, isLoading, convertUnitsToSheetData, isInitialized])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-sm text-muted-foreground">{t('loadingUnits')}</div>
      </div>
    )
  }

  if (units.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-sm text-muted-foreground">No hay unidades disponibles</div>
      </div>
    )
  }

  return (
    <div className="w-full h-[calc(100vh-200px)] border border-border rounded-lg overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}

