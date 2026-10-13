"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { StrapiUnit } from "@/lib/api/strapi"
import { strapiClient } from "@/lib/api/strapi"
import { useTranslations } from "next-intl"

interface LuckysheetUnitsTableProps {
  units: StrapiUnit[]
  isLoading?: boolean
  onUpdate?: (unitId: string, field: string, value: unknown) => void
}

// Column definitions
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
  // Residential
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
  // Office
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
  // Industrial
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

export function LuckysheetUnitsTable({ units, isLoading, onUpdate }: LuckysheetUnitsTableProps) {
  const t = useTranslations('common')
  const containerRef = useRef<HTMLDivElement>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoadingLibs, setIsLoadingLibs] = useState(true)
  const unitsRef = useRef<StrapiUnit[]>(units)
  const luckysheetRef = useRef<any>(null)

  useEffect(() => {
    unitsRef.current = units
  }, [units])

  // Load jQuery and Luckysheet
  useEffect(() => {
    if (typeof window === "undefined") return

    const loadLibraries = async () => {
      try {
        // Load CSS
        await import("luckysheet/dist/plugins/css/pluginsCss.css")
        await import("luckysheet/dist/plugins/plugins.css")
        await import("luckysheet/dist/css/luckysheet.css")
        await import("luckysheet/dist/assets/iconfont/iconfont.css")

        // Load jQuery first using dynamic import
        if (!(window as any).$) {
          const jquery = await import("jquery")
          ;(window as any).$ = (window as any).jQuery = jquery.default || jquery
        }

        // Wait a bit for jQuery to be fully available
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Load jquery-mousewheel plugin (required by Luckysheet)
        const $ = (window as any).$
        if ($ && !$.fn.mousewheel) {
          // Load from CDN (most reliable method)
          await new Promise<void>((resolve) => {
            // Check if already loaded
            if ($.fn.mousewheel) {
              resolve()
              return
            }
            
            const script = document.createElement("script")
            script.src = "https://cdn.jsdelivr.net/npm/jquery-mousewheel@3.1.13/jquery.mousewheel.min.js"
            script.onload = () => {
              console.log("jquery-mousewheel loaded successfully")
              resolve()
            }
            script.onerror = () => {
              console.error("Failed to load jquery-mousewheel from CDN")
              resolve() // Continue anyway
            }
            document.head.appendChild(script)
            // Timeout after 3s
            setTimeout(() => {
              if (!$.fn.mousewheel) {
                console.warn("jquery-mousewheel load timeout")
              }
              resolve()
            }, 3000)
          })
        }

        // Wait a bit more for plugins to register
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Load Luckysheet using dynamic import
        // Try both default and named exports
        const lsModule = await import("luckysheet")
        let luckysheet = lsModule.default || lsModule
        
        // If it's an object with a default property, try that
        if (luckysheet && typeof luckysheet === "object" && "default" in luckysheet && typeof luckysheet.default === "object") {
          luckysheet = luckysheet.default
        }
        
        // Make it available globally (Luckysheet expects this)
        if (!(window as any).luckysheet) {
          (window as any).luckysheet = luckysheet
        }
        
        // Store reference
        luckysheetRef.current = luckysheet
        
        // Verify create method exists
        if (luckysheet && typeof luckysheet.create === "function") {
          setIsLoadingLibs(false)
        } else {
          console.error("Luckysheet create method not found", luckysheet)
          setIsLoadingLibs(false)
        }
      } catch (error) {
        console.error("Error loading libraries:", error)
        setIsLoadingLibs(false)
      }
    }

    loadLibraries()
  }, [])

  // Convert units to Luckysheet data format
  const convertUnitsToLuckysheet = useCallback((unitsData: StrapiUnit[]) => {
    console.log("Converting units to Luckysheet format:", unitsData.length, "units")
    
    // Luckysheet expects celldata as an array of objects with r (row) and c (column) properties
    const celldata: Array<{ r: number; c: number; v: unknown; m?: string; ct?: { fa: string; t: string } }> = []
    
    // Header row (row 0)
    columnDefs.forEach((col, colIndex) => {
      celldata.push({
        r: 0,
        c: colIndex,
        v: col.label,
        m: col.label
      })
    })

    // Data rows (starting from row 1)
    unitsData.forEach((unit, rowIndex) => {
      const actualRow = rowIndex + 1 // Row 0 is header
      columnDefs.forEach((col, colIndex) => {
        let value = getNestedValue(unit, col.key)
        
        // Format values
        if (value === null || value === undefined) {
          value = ""
        } else if (typeof value === "boolean") {
          value = value ? "Sí" : "No"
        } else if (col.key === "project") {
          value = unit.project?.name || ""
        } else if (typeof value === "number") {
          value = value
        }
        
        celldata.push({
          r: actualRow,
          c: colIndex,
          v: value,
          m: String(value)
        })
      })
    })
    
    console.log("Converted celldata array length:", celldata.length)

    // Calculate row and column counts
    const rowCount = unitsData.length + 1 // +1 for header
    const colCount = columnDefs.length

    // Mark readonly columns and header row as non-editable
    // Authority format: array of objects with r, c, and lock properties
    const authority: Array<{ r: number; c: number; lock?: number }> = []
    
    // Lock header row (row 0) - all cells in first row
    columnDefs.forEach((col, colIndex) => {
      authority.push({
        r: 0,
        c: colIndex,
        lock: 1
      })
    })
    
    // Lock readonly columns (documentId, project) for all data rows
    columnDefs.forEach((col, colIndex) => {
      if (col.key === "documentId" || col.key === "project") {
        // Mark all data cells in this column as locked (readonly)
        for (let rowIndex = 1; rowIndex <= unitsData.length; rowIndex++) {
          authority.push({
            r: rowIndex,
            c: colIndex,
            lock: 1
          })
        }
      }
    })

    return [{
      name: "Unidades",
      index: "sheet1",
      order: 0,
      row: rowCount,
      column: colCount,
      celldata,
      config: {
        columnlen: columnDefs.reduce((acc, col, index) => {
          acc[index] = col.width || 100
          return acc
        }, {} as Record<number, number>),
        rowlen: {
          0: 30, // Header height
        },
        merge: {},
        borderInfo: [],
        authority,
      },
      scrollLeft: 0,
      scrollTop: 0,
      luckysheet_select_save: [],
      calcChain: [],
      isPivotTable: false,
      pivotTable: {},
      filter_select: {},
      filter: null,
      luckysheet_conditionformat_save: [],
      frozen: {},
      chart: [],
      zoomRatio: 1,
      image: [],
      showGridLines: 1,
      dataVerification: {},
    }]
  }, [])

  // Initialize Luckysheet
  useEffect(() => {
    if (!containerRef.current || isLoading || isInitialized || isLoadingLibs || !luckysheetRef.current) {
      console.log("Skipping initialization:", {
        container: !!containerRef.current,
        isLoading,
        unitsLength: units.length,
        isInitialized,
        isLoadingLibs,
        hasLuckysheet: !!luckysheetRef.current
      })
      return
    }
    
    if (units.length === 0) {
      console.log("No units to display")
      return
    }
    
    if (typeof window === "undefined") return

    const initLuckysheet = async () => {
      console.log("Initializing Luckysheet with", units.length, "units")
      
      // Ensure container exists and has an ID
      const containerId = "luckysheet-container"
      if (!containerRef.current) return
      
      // Ensure ID is set
      containerRef.current.id = containerId

      // Wait a bit to ensure DOM is ready
      await new Promise((resolve) => setTimeout(resolve, 100))

      const luckysheet = luckysheetRef.current
    
      // Check if create method exists
      if (!luckysheet || typeof luckysheet.create !== "function") {
        console.error("Luckysheet create method not available", luckysheet)
        return
      }

      const sheetData = convertUnitsToLuckysheet(units)
      console.log("Sheet data prepared:", sheetData)

      const options = {
        container: containerId,
        lang: "es",
        // Permisos de edición
        allowCopy: true,
        allowEdit: true,
        allowDelete: true,
        allowPaste: true,
        allowUndo: true,
        allowRedo: true,
        // UI
        showtoolbar: true,
        showinfobar: false,
        showsheetbar: false,
        showstatisticBar: false,
        // Estructura de la hoja (deshabilitado para mantener estructura fija)
        enableAddRow: false,
        enableAddCol: false,
        enableAddBackTop: false,
        enableAddBackBottom: false,
        allowSheetEdit: false,
        allowSheetDelete: false,
        allowSheetAdd: false,
        // Datos
        data: sheetData,
        hook: {
          cellUpdated: (r: number, c: number, oldValue: unknown, newValue: unknown, isRefresh: boolean) => {
            // Skip if it's a refresh (not a real user edit)
            if (isRefresh) return
            
            // Skip header row (row 0)
            if (r === 0) return
            
            // Calculate unit index (row 0 is header, so data starts at row 1)
            const unitIndex = r - 1
            
            // Get the unit from the current units array
            const currentUnits = unitsRef.current
            if (unitIndex < 0 || unitIndex >= currentUnits.length) {
              console.error(`Invalid unit index: ${unitIndex}, total units: ${currentUnits.length}`)
              return
            }
            
            const unit = currentUnits[unitIndex]
            if (!unit) {
              console.error(`Unit not found at index ${unitIndex}`)
              return
            }

            // Get column definition
            if (c < 0 || c >= columnDefs.length) {
              console.error(`Invalid column index: ${c}, total columns: ${columnDefs.length}`)
              return
            }
            
            const colDef = columnDefs[c]
            if (!colDef) {
              console.error(`Column definition not found at index ${c}`)
              return
            }

            // Skip readonly columns
            if (colDef.key === "documentId" || colDef.key === "project") return

            // Skip if value hasn't actually changed
            if (oldValue === newValue) return

            // Get the unit identifier
            const unitId = unit.documentId || String(unit.id)
            if (!unitId) {
              console.error("Unit has no documentId or id", unit)
              return
            }

            // Get the field path for nested fields (e.g., type[0].bedrooms)
            const field = getFieldPath(colDef.key, unit)
            
            // Debug log (can be removed in production)
            if (process.env.NODE_ENV === "development") {
              console.log("Cell updated:", {
                row: r,
                col: c,
                unitIndex,
                unitId,
                columnKey: colDef.key,
                field,
                oldValue,
                newValue
              })
            }
            
            // Convert value back to original format
            let convertedValue: unknown = newValue
            
            // Boolean fields
            const booleanFields = ["isActive", "balcony", "terrace", "garden", "petFriendly", "smokingAllowed", 
              "receptionArea", "openSpace", "kitchenette", "storageRoom", "airConditioning", "elevatorAccess", 
              "loadingDock", "truckAccess", "railAccess", "waterSupply", "sewageSystem", "fireSuppression", "securitySystem"]
            
            if (booleanFields.some(fieldName => colDef.key === fieldName || colDef.key.includes(fieldName))) {
              const stringValue = String(newValue).toLowerCase().trim()
              convertedValue = stringValue === "sí" || stringValue === "si" || stringValue === "true" || stringValue === "1" || stringValue === "yes"
            } 
            // Numeric fields
            else if (["area", "price", "rent", "bedrooms", "bathrooms", "parkingSpaces", "floor", 
              "employees", "meetingRooms", "privateOffices", "ceilingHeight", "loadingDockCount", 
              "powerCapacity", "officeSpace", "storageCapacity"].includes(colDef.key)) {
              if (typeof newValue === "number") {
                convertedValue = newValue
              } else {
                const parsed = parseFloat(String(newValue).replace(/[^\d.-]/g, ""))
                convertedValue = isNaN(parsed) ? 0 : parsed
              }
            }

            // Update in Strapi
            if (process.env.NODE_ENV === "development") {
              console.log(`Updating unit ${unitId}, field: ${field}, value:`, convertedValue)
            }
            
            strapiClient.updateUnit(unitId, field, convertedValue)
              .then(() => {
                if (process.env.NODE_ENV === "development") {
                  console.log(`Successfully updated unit ${unitId}, field: ${field}`)
                }
                // Update local ref to keep in sync
                if (unit && field in unit) {
                  (unit as any)[field] = convertedValue
                }
              })
              .catch((error) => {
                console.error(`Error updating unit ${unitId}, field: ${field}:`, error)
                // Optionally revert the change in the UI
                // Try to revert using Luckysheet API
                if (luckysheetRef.current) {
                  try {
                    // Try different possible methods to set cell value
                    const ls = luckysheetRef.current as any
                    if (typeof ls.setCellValue === "function") {
                      ls.setCellValue(r, c, oldValue)
                    } else if (typeof ls.setcellvalue === "function") {
                      ls.setcellvalue(r, c, oldValue)
                    } else if (typeof ls.setCellValueByIndex === "function") {
                      ls.setCellValueByIndex(r, c, oldValue)
                    } else {
                      // Use the global luckysheet object if available
                      const globalLS = (window as any).luckysheet
                      if (globalLS && typeof globalLS.setCellValue === "function") {
                        globalLS.setCellValue(r, c, oldValue)
                      }
                    }
                    console.log("Reverted cell value due to error")
                  } catch (revertError) {
                    console.error("Error reverting cell value:", revertError)
                  }
                }
              })
            
            if (onUpdate) {
              onUpdate(unitId, field, convertedValue)
            }
          },
        },
      }

      try {
        console.log("Calling luckysheet.create with options:", {
          container: options.container,
          dataLength: options.data?.length,
          firstSheetData: options.data?.[0] ? {
            name: options.data[0].name,
            row: options.data[0].row,
            column: options.data[0].column,
            celldataKeys: Object.keys(options.data[0].celldata || {}).length
          } : null
        })
        luckysheet.create(options)
        console.log("Luckysheet created successfully")
        setIsInitialized(true)
      } catch (error) {
        console.error("Error creating Luckysheet:", error)
      }
    }

    initLuckysheet()

    return () => {
      if (isInitialized && luckysheetRef.current && typeof luckysheetRef.current.destroy === "function") {
        try {
          luckysheetRef.current.destroy()
        } catch (e) {
          console.error("Error destroying luckysheet:", e)
        }
        setIsInitialized(false)
      }
    }
  }, [units, isLoading, convertUnitsToLuckysheet, isInitialized, isLoadingLibs, onUpdate])

  // Update when units change
  useEffect(() => {
    if (!isInitialized || isLoading || !luckysheetRef.current) return
    
    // Reload data if units change significantly
    try {
      const currentData = luckysheetRef.current.getSheetData()
      if (currentData && currentData.length > 0 && units.length !== currentData[0].celldata.length - 1) {
        luckysheetRef.current.destroy()
        setIsInitialized(false)
      }
    } catch (e) {
      console.error("Error checking sheet data:", e)
    }
  }, [units, isLoading, isInitialized])

  if (isLoading || isLoadingLibs) {
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
      <div id="luckysheet-container" ref={containerRef} className="w-full h-full" />
    </div>
  )
}

