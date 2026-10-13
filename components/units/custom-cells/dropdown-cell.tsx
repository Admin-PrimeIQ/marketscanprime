"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import type { Item, GridColumn } from "@glideapps/glide-data-grid"
import { X } from "lucide-react"

interface DropdownCellProps {
  options: string[]
  activeCell: Item | null
  columns: GridColumn[]
  gridContainerRef: React.RefObject<HTMLDivElement | null>
  onSelect: (value: string, cell: Item) => void
  getCurrentValue: (cell: Item) => string | undefined
  onClose?: () => void
  cellInfo?: {
    fieldName: string
    unitName?: string
    unitCode?: string
    rowNumber: number
  }
}

export function DropdownCell({
  options,
  activeCell,
  columns,
  gridContainerRef,
  onSelect,
  getCurrentValue,
  onClose,
  cellInfo,
}: DropdownCellProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Filtrar opciones basado en búsqueda
  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Cerrar con ESC
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeCell) {
        if (onClose) {
          onClose()
        }
      }
    }

    if (activeCell) {
      document.addEventListener("keydown", handleKeyDown)
      return () => {
        document.removeEventListener("keydown", handleKeyDown)
      }
    }
  }, [activeCell, onClose])

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        if (onClose) {
          onClose()
        }
      }
    }

    if (activeCell) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }
  }, [activeCell, onClose])

  // Auto-focus en el input de búsqueda cuando se abre
  useEffect(() => {
    if (activeCell && dropdownRef.current) {
      const input = dropdownRef.current.querySelector('input')
      if (input) {
        setTimeout(() => input.focus(), 100)
      }
    }
    // Reset search when closing
    if (!activeCell) {
      setSearchQuery("")
    }
  }, [activeCell])

  const handleSelect = useCallback(
    (option: string) => {
      if (activeCell) {
        onSelect(option, activeCell)
        if (onClose) {
          onClose()
        }
      }
    },
    [activeCell, onSelect, onClose],
  )

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose()
    }
  }, [onClose])

  if (!activeCell) {
    return null
  }

  const currentValue = getCurrentValue(activeCell)

  return (
    <>
      {/* Overlay backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={handleClose}
      />
      
      {/* Centered dropdown */}
      <div
        ref={dropdownRef}
        className="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-xl w-full max-w-md max-h-[500px] flex flex-col"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">
              Editar {cellInfo?.fieldName || "campo"}
            </h3>
            {cellInfo && (
              <p className="text-sm text-gray-600 mt-1">
                {cellInfo.unitName || cellInfo.unitCode ? (
                  <>
                    Unidad: <span className="font-medium">{cellInfo.unitName || cellInfo.unitCode}</span>
                    {cellInfo.unitCode && cellInfo.unitName && (
                      <span className="text-gray-400"> ({cellInfo.unitCode})</span>
                    )}
                  </>
                ) : null}
                {" • "}
                Fila: <span className="font-medium">{cellInfo.rowNumber + 1}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors ml-4"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Options list */}
        <div className="flex-1 overflow-y-auto">
          {filteredOptions.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              No se encontraron resultados
            </div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = currentValue === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-blue-50 transition-colors ${
                    isSelected ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isSelected && <span className="text-blue-600">✓</span>}
                    <span>{option}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
