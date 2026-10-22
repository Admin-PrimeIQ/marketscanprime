"use client"

import { useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Filter, X, Plus, Edit2, Calendar } from "lucide-react"
import { useTranslations } from "next-intl"
import { dataClient } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"

export type FilterOperator = 
  | 'equals' 
  | 'notEquals' 
  | 'contains' 
  | 'notContains' 
  | 'greaterThan' 
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'in'
  | 'notIn'
  | 'between'
  | 'isNull'
  | 'isNotNull'

export interface FilterCondition {
  id: string
  field: string
  operator: FilterOperator
  value: any
  value2?: any // Para rangos
  displayValue?: string
}

export interface FieldDefinition {
  key: string
  label: string
  type: 'string' | 'number' | 'date' | 'boolean' | 'relation' | 'enum'
  relationEndpoint?: string
  relationDisplayField?: string
  enumValues?: string[]
  operators: FilterOperator[]
}

interface AdvancedFiltersProps {
  filters: FilterCondition[]
  onFiltersChange: (filters: FilterCondition[]) => void
  fieldDefinitions?: FieldDefinition[]
}

export interface AdvancedFiltersRef {
  editFilter: (filter: FilterCondition) => void
}

// Constante antigua - ahora se usa getFieldDefinitions
// Las definiciones de campos se generan dinámicamente con traducciones
export const getFieldDefinitions = (t: (key: string) => string): FieldDefinition[] => [
  {
    key: 'code',
    label: 'Code',
    type: 'string',
    operators: ['equals', 'notEquals', 'contains', 'notContains']
  },
  {
    key: 'name',
    label: t('project'),
    type: 'string',
    operators: ['equals', 'notEquals', 'contains', 'notContains']
  },
  {
    key: 'developer',
    label: t('developer'),
    type: 'relation',
    relationEndpoint: 'developers',
    relationDisplayField: 'name',
    operators: ['equals', 'notEquals', 'in', 'notIn']
  },
  {
    key: 'country',
    label: t('country'),
    type: 'relation',
    relationEndpoint: 'countries',
    relationDisplayField: 'name',
    operators: ['equals', 'notEquals', 'in', 'notIn']
  },
  {
    key: 'department',
    label: 'Departamento',
    type: 'string',
    operators: ['equals', 'notEquals', 'contains', 'notContains', 'isNull', 'isNotNull']
  },
  {
    key: 'amenities',
    label: t('amenities'),
    type: 'relation',
    relationEndpoint: 'amenities',
    relationDisplayField: 'name',
    operators: ['in', 'notIn']
  },
  {
    key: 'services',
    label: t('services'),
    type: 'relation',
    relationEndpoint: 'services',
    relationDisplayField: 'name',
    operators: ['in', 'notIn']
  },
  {
    key: 'createdAt',
    label: t('createdAt'),
    type: 'date',
    operators: ['equals', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual', 'between', 'isNull', 'isNotNull']
  },
  {
    key: 'updatedAt',
    label: t('updatedAt'),
    type: 'date',
    operators: ['equals', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual', 'between', 'isNull', 'isNotNull']
  },
]

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'Equals',
  notEquals: 'Not equals',
  contains: 'Contains',
  notContains: 'Not contains',
  greaterThan: 'Greater than',
  lessThan: 'Less than',
  greaterThanOrEqual: 'Greater than or equal',
  lessThanOrEqual: 'Less than or equal',
  in: 'In',
  notIn: 'Not in',
  between: 'Between',
  isNull: 'Is null',
  isNotNull: 'Is not null',
}

export const getOperatorLabel = (operator: FilterOperator, t: (key: string) => string): string => {
  const labels: Record<FilterOperator, string> = {
    equals: t('operatorEquals'),
    notEquals: t('operatorNotEquals'),
    contains: t('operatorContains'),
    notContains: t('operatorNotContains'),
    greaterThan: t('operatorGreaterThan'),
    lessThan: t('operatorLessThan'),
    greaterThanOrEqual: t('operatorGreaterThanOrEqual'),
    lessThanOrEqual: t('operatorLessThanOrEqual'),
    in: t('operatorIn'),
    notIn: t('operatorNotIn'),
    between: t('operatorBetween'),
    isNull: t('operatorIsNull'),
    isNotNull: t('operatorIsNotNull'),
  }
  return labels[operator] || operator
}

export const AdvancedFilters = forwardRef<AdvancedFiltersRef, AdvancedFiltersProps>(
  ({ filters, onFiltersChange, fieldDefinitions: fieldDefinitionsProp }, ref) => {
  const t = useTranslations('common')
  const [isOpen, setIsOpen] = useState(false)
  const [editingFilter, setEditingFilter] = useState<FilterCondition | null>(null)
  const [selectedField, setSelectedField] = useState<string>('')
  const [selectedOperator, setSelectedOperator] = useState<FilterOperator>('equals')
  const [filterValue, setFilterValue] = useState<any>('')
  const [filterValue2, setFilterValue2] = useState<any>('')
  const [relationOptions, setRelationOptions] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingRelations, setIsLoadingRelations] = useState(false)
  const [relationSearch, setRelationSearch] = useState('')
  const [relationPopoverOpen, setRelationPopoverOpen] = useState(false)

  const defaultFieldDefinitions = useMemo(() => getFieldDefinitions(t), [t])
  const fieldDefinitions = fieldDefinitionsProp ?? defaultFieldDefinitions
  const selectedFieldDef = useMemo(() => 
    fieldDefinitions.find(f => f.key === selectedField), 
    [fieldDefinitions, selectedField]
  )

  const loadRelationOptions = useCallback(async (searchTerm?: string) => {
    if (!selectedFieldDef?.relationEndpoint) return
    
    setIsLoadingRelations(true)
    try {
      const response = await dataClient.getCatalogList(selectedFieldDef.relationEndpoint, {
        page: 1,
        pageSize: 100,
        search: searchTerm || undefined,
      })
      setRelationOptions(
        response.data.map((item: any) => ({
          id: item.documentId || String(item.id),
          name: item[selectedFieldDef.relationDisplayField || 'name'] || item.code || String(item.id)
        }))
      )
    } catch (error) {
      console.error('Error loading relation options:', error)
      setRelationOptions([])
    } finally {
      setIsLoadingRelations(false)
    }
  }, [selectedFieldDef?.relationEndpoint, selectedFieldDef?.relationDisplayField])

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (selectedFieldDef?.type === 'relation' && selectedFieldDef.relationEndpoint) {
      // Limpiar el timer anterior
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      // Si hay búsqueda, esperar 500ms antes de cargar (debounce)
      if (relationSearch) {
        debounceTimerRef.current = setTimeout(() => {
          loadRelationOptions(relationSearch.toLowerCase())
        }, 500)
      } else {
        // Si no hay búsqueda, cargar inmediatamente
        loadRelationOptions()
      }

      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }
      }
    } else {
      setRelationOptions([])
      setRelationSearch('')
    }
  }, [selectedFieldDef?.type, selectedFieldDef?.relationEndpoint, relationSearch, loadRelationOptions])

  // Resetear búsqueda cuando cambia el campo seleccionado
  useEffect(() => {
    setRelationSearch('')
    setRelationOptions([])
    setRelationPopoverOpen(false)
  }, [selectedField])

  // Cargar opciones cuando se abre el popover o cuando hay un valor editado
  useEffect(() => {
    if (relationPopoverOpen && selectedFieldDef?.type === 'relation' && selectedFieldDef.relationEndpoint) {
      // Si hay un valor pero no hay opciones cargadas, cargar todas las opciones
      if (filterValue && relationOptions.length === 0) {
        loadRelationOptions()
      }
    }
  }, [relationPopoverOpen, filterValue, relationOptions.length, selectedFieldDef?.type, selectedFieldDef?.relationEndpoint, loadRelationOptions])

  // Cargar el nombre del item seleccionado si no está en las opciones
  useEffect(() => {
    const loadSelectedItemName = async () => {
      if (selectedFieldDef?.type === 'relation' && 
          selectedFieldDef.relationEndpoint && 
          filterValue && 
          !relationOptions.find(opt => opt.id === filterValue)) {
        try {
          // Intentar obtener el item específico por ID
          const item = await dataClient.getCatalogItem(selectedFieldDef.relationEndpoint, filterValue)
          if (item) {
            const name = item[selectedFieldDef.relationDisplayField || 'name'] || item.code || String(item.id)
            // Agregar a las opciones si no existe
            setRelationOptions(prev => {
              if (!prev.find(opt => opt.id === filterValue)) {
                return [...prev, { id: filterValue, name }]
              }
              return prev
            })
          }
        } catch (error) {
          console.error('Error loading selected item name:', error)
        }
      }
    }
    loadSelectedItemName()
  }, [selectedFieldDef?.type, selectedFieldDef?.relationEndpoint, selectedFieldDef?.relationDisplayField, filterValue])

  const handleAddFilter = () => {
    if (!selectedField || !selectedOperator) return

    const fieldDef = fieldDefinitions.find(f => f.key === selectedField)
    if (!fieldDef) return

    // Validar que el valor esté presente (excepto para isNull/isNotNull)
    if (selectedOperator !== 'isNull' && selectedOperator !== 'isNotNull' && !filterValue) {
      return
    }

    // Validar between requiere ambos valores
    if (selectedOperator === 'between' && (!filterValue || !filterValue2)) {
      return
    }

    let displayValue = ''
    if (fieldDef.type === 'relation') {
      const selected = relationOptions.find(opt => opt.id === filterValue)
      if (selected) {
        displayValue = selected.name
      } else {
        // Si no está en las opciones, el useEffect debería cargarlo
        // Por ahora usar el valor como fallback, pero esto no debería ocurrir
        displayValue = filterValue
        console.warn('Selected relation option not found in relationOptions')
      }
    } else if (fieldDef.type === 'enum') {
      displayValue = filterValue
    } else if (fieldDef.type === 'date') {
      if (selectedOperator === 'between') {
        const date1 = new Date(filterValue)
        const date2 = new Date(filterValue2)
        const hasTime1 = filterValue.includes('T') || filterValue.includes(' ')
        const hasTime2 = filterValue2.includes('T') || filterValue2.includes(' ')
        const formatStr1 = hasTime1 ? 'dd/MM/yyyy hh:mm a' : 'dd/MM/yyyy'
        const formatStr2 = hasTime2 ? 'dd/MM/yyyy hh:mm a' : 'dd/MM/yyyy'
        displayValue = `${format(date1, formatStr1, { locale: es })} - ${format(date2, formatStr2, { locale: es })}`
      } else {
        const date = new Date(filterValue)
        const hasTime = filterValue.includes('T') || filterValue.includes(' ')
        const formatStr = hasTime ? 'dd/MM/yyyy hh:mm a' : 'dd/MM/yyyy'
        displayValue = format(date, formatStr, { locale: es })
      }
    } else {
      displayValue = String(filterValue)
    }

    const newFilter: FilterCondition = {
      id: editingFilter?.id || `filter-${Date.now()}`,
      field: selectedField,
      operator: selectedOperator,
      value: filterValue,
      value2: selectedOperator === 'between' ? filterValue2 : undefined,
      displayValue,
    }

    if (editingFilter) {
      onFiltersChange(filters.map(f => f.id === editingFilter.id ? newFilter : f))
      setEditingFilter(null)
    } else {
      onFiltersChange([...filters, newFilter])
    }

    // Reset form
    setSelectedField('')
    setSelectedOperator('equals')
    setFilterValue('')
    setFilterValue2('')
    setRelationSearch('')
    setRelationOptions([])
    setIsOpen(false)
  }

  const handleEditFilter = useCallback(async (filter: FilterCondition) => {
    setEditingFilter(filter)
    setSelectedField(filter.field)
    setSelectedOperator(filter.operator)
    setFilterValue(filter.value)
    setFilterValue2(filter.value2)
    setRelationSearch('')
    setRelationOptions([])
    setIsOpen(true)
    
    // Si es una relación y tiene un valor, cargar el nombre del item
    const fieldDef = fieldDefinitions.find(f => f.key === filter.field)
    if (fieldDef?.type === 'relation' && fieldDef.relationEndpoint && filter.value) {
      try {
        const item = await dataClient.getCatalogItem(fieldDef.relationEndpoint, filter.value)
        if (item) {
          const name = item[fieldDef.relationDisplayField || 'name'] || item.code || String(item.id)
          setRelationOptions([{ id: filter.value, name }])
        }
      } catch (error) {
        console.error('Error loading item name for edit:', error)
      }
    }
  }, [fieldDefinitions])

  // Exponer función de edición mediante ref
  useImperativeHandle(ref, () => ({
    editFilter: handleEditFilter
  }), [handleEditFilter])

  const handleRemoveFilter = (filterId: string) => {
    onFiltersChange(filters.filter(f => f.id !== filterId))
  }

  const getFieldLabel = (fieldKey: string) => {
    return fieldDefinitions.find(f => f.key === fieldKey)?.label || fieldKey
  }

  const getOperatorLabelLocalized = (operator: FilterOperator) => {
    return getOperatorLabel(operator, t)
  }

  return (
    <>
      {/* Add Filter Button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="relative">
            <Filter className="w-4 h-4 mr-2" />
            {t('addFilter')}
            {filters.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1.5 text-xs">
                {filters.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('field')}</label>
              <Select value={selectedField} onValueChange={setSelectedField}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectField')} />
                </SelectTrigger>
                <SelectContent>
                  {fieldDefinitions.map((field) => (
                    <SelectItem key={field.key} value={field.key}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedField && selectedFieldDef && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('operator')}</label>
                  <Select value={selectedOperator} onValueChange={(v) => setSelectedOperator(v as FilterOperator)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedFieldDef.operators.map((op) => (
                        <SelectItem key={op} value={op}>
                          {getOperatorLabel(op, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedOperator !== 'isNull' && selectedOperator !== 'isNotNull' && (
                  <>
                    {selectedFieldDef.type === 'relation' ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('value')}</label>
                        <Popover open={relationPopoverOpen} onOpenChange={setRelationPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between"
                            >
                              {filterValue
                                ? relationOptions.find(opt => opt.id === filterValue)?.name || t('selectValue')
                                : t('selectValue')}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder={t('search')}
                                value={relationSearch}
                                onValueChange={setRelationSearch}
                              />
                              <CommandList>
                                {isLoadingRelations ? (
                                  <div className="p-4 text-center text-sm text-muted-foreground">
                                    {t('loading')}...
                                  </div>
                                ) : relationOptions.length === 0 ? (
                                  <CommandEmpty>{t('noResults')}</CommandEmpty>
                                ) : (
                                  <CommandGroup>
                                    {relationOptions.map((option) => (
                                      <CommandItem
                                        key={option.id}
                                        value={`${option.id}-${option.name}`}
                                        onSelect={() => {
                                          setFilterValue(option.id)
                                          setRelationSearch('')
                                          setRelationPopoverOpen(false)
                                        }}
                                      >
                                        {option.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    ) : selectedFieldDef.type === 'enum' ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('value')}</label>
                        <Select value={filterValue} onValueChange={setFilterValue}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('selectValue')} />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedFieldDef.enumValues?.map((val) => (
                              <SelectItem key={val} value={val}>
                                {val}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : selectedFieldDef.type === 'date' ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('value')}</label>
                        {selectedOperator === 'between' ? (
                          <div className="space-y-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !filterValue && "text-muted-foreground"
                                  )}
                                >
                                  <Calendar className="mr-2 h-4 w-4" />
                                  {filterValue ? format(new Date(filterValue), 'PPP') : t('selectDate')}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarComponent
                                  mode="single"
                                  selected={filterValue ? new Date(filterValue) : undefined}
                                  onSelect={(date) => setFilterValue(date?.toISOString())}
                                />
                              </PopoverContent>
                            </Popover>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !filterValue2 && "text-muted-foreground"
                                  )}
                                >
                                  <Calendar className="mr-2 h-4 w-4" />
                                  {filterValue2 ? format(new Date(filterValue2), 'dd/MM/yyyy', { locale: es }) : t('selectEndDate')}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarComponent
                                  mode="single"
                                  selected={filterValue2 ? new Date(filterValue2) : undefined}
                                  onSelect={(date) => setFilterValue2(date?.toISOString())}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !filterValue && "text-muted-foreground"
                                )}
                              >
                                <Calendar className="mr-2 h-4 w-4" />
                                {filterValue ? format(new Date(filterValue), 'PPP') : t('selectDate')}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={filterValue ? new Date(filterValue) : undefined}
                                onSelect={(date) => setFilterValue(date?.toISOString())}
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('value')}</label>
                        <Input
                          type={selectedFieldDef.type === 'number' ? 'number' : 'text'}
                          value={filterValue}
                          onChange={(e) => setFilterValue(e.target.value)}
                          placeholder={t('enterValue')}
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleAddFilter} className="flex-1">
                    {editingFilter ? t('update') : t('add')}
                  </Button>
                  {editingFilter && (
                    <Button variant="outline" onClick={() => {
                      setEditingFilter(null)
                      setSelectedField('')
                      setSelectedOperator('equals')
                      setFilterValue('')
                      setFilterValue2('')
                      setIsOpen(false)
                    }}>
                      {t('cancel')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
})

AdvancedFilters.displayName = 'AdvancedFilters'

// Componente separado para mostrar los filtros activos
export function ActiveFilters({ 
  filters, 
  onEditFilter, 
  onRemoveFilter,
  getFieldLabel,
  getOperatorLabelLocalized 
}: { 
  filters: FilterCondition[]
  onEditFilter: (filter: FilterCondition) => void
  onRemoveFilter: (filterId: string) => void
  getFieldLabel: (fieldKey: string) => string
  getOperatorLabelLocalized: (operator: FilterOperator) => string
}) {
  if (filters.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <Badge
          key={filter.id}
          variant="secondary"
          className="px-3 py-1.5 text-sm flex items-center gap-2"
        >
          <span className="font-medium">{getFieldLabel(filter.field)}</span>
          <span className="text-muted-foreground">{getOperatorLabelLocalized(filter.operator)}</span>
          <span>{filter.displayValue || filter.value}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-destructive/20"
            onClick={() => onEditFilter(filter)}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-destructive/20"
            onClick={() => onRemoveFilter(filter.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
    </div>
  )
}

