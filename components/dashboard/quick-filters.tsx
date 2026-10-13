"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Filter } from "lucide-react"

export function QuickFilters() {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Filter className="w-5 h-5" />
          Filtros Rápidos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="department">Departamento</Label>
          <Select>
            <SelectTrigger id="department" className="bg-background border-border">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="guatemala">Guatemala</SelectItem>
              <SelectItem value="sacatepequez">Sacatepéquez</SelectItem>
              <SelectItem value="escuintla">Escuintla</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="zone">Zona</Label>
          <Select>
            <SelectTrigger id="zone" className="bg-background border-border">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">Zona 10</SelectItem>
              <SelectItem value="14">Zona 14</SelectItem>
              <SelectItem value="15">Zona 15</SelectItem>
              <SelectItem value="16">Zona 16</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Categoría</Label>
          <Select>
            <SelectTrigger id="category" className="bg-background border-border">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="residencial">Residencial</SelectItem>
              <SelectItem value="comercial">Comercial</SelectItem>
              <SelectItem value="industrial">Industrial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="uso">Tipo de Uso</Label>
          <Select>
            <SelectTrigger id="uso" className="bg-background border-border">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vivienda">Vivienda</SelectItem>
              <SelectItem value="oficina">Oficina</SelectItem>
              <SelectItem value="bodega">Bodega</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full" variant="default">
          Aplicar Filtros
        </Button>
      </CardContent>
    </Card>
  )
}
