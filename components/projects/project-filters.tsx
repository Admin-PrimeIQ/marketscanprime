"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Filter, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"

interface ProjectFiltersProps {
  selectedPhases: string[]
  onPhasesChange: (phases: string[]) => void
}

// Mapeo de availability a labels en español
const phaseLabels: Record<string, string> = {
  planning: 'Planificación',
  development: 'Desarrollo',
  marketing: 'Marketing',
  construction: 'En construcción',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const phaseValues = ['planning', 'development', 'marketing', 'construction', 'completed', 'cancelled'] as const

export function ProjectFilters({
  selectedPhases,
  onPhasesChange,
}: ProjectFiltersProps) {
  const t = useTranslations('common')

  const handlePhaseToggle = (phase: string) => {
    if (selectedPhases.includes(phase)) {
      onPhasesChange(selectedPhases.filter((p) => p !== phase))
    } else {
      onPhasesChange([...selectedPhases, phase])
    }
  }

  const hasActiveFilters = selectedPhases.length > 0

  const clearFilters = () => {
    onPhasesChange([])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="relative">
          <Filter className="w-4 h-4 mr-2" />
          Filtros
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1.5 text-xs">
              {selectedPhases.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="px-0">Filtros</DropdownMenuLabel>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-6 px-2 text-xs"
            >
              <X className="w-3 h-3 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('phase')}</DropdownMenuLabel>
        {phaseValues.map((phase) => (
          <DropdownMenuCheckboxItem
            key={phase}
            checked={selectedPhases.includes(phase)}
            onCheckedChange={() => handlePhaseToggle(phase)}
          >
            {phaseLabels[phase]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
