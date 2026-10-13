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
import { Filter } from "lucide-react"

export function UnitFilters() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Filtros
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Proyecto</DropdownMenuLabel>
        <DropdownMenuCheckboxItem>Torre Atlántida</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Residencial Las Palmas</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Office Plaza Central</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tipo</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked>Vivienda</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Oficina</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Industrial</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
