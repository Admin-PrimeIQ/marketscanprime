"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface UnitGeneralTabProps {
  onUnitTypeChange: (type: "vivienda" | "oficina" | "industrial") => void
}

export function UnitGeneralTab({ onUnitTypeChange }: UnitGeneralTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="proyecto_id">Proyecto*</Label>
          <Select>
            <SelectTrigger id="proyecto_id" className="bg-background border-border">
              <SelectValue placeholder="Seleccionar proyecto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Torre Atlántida</SelectItem>
              <SelectItem value="2">Residencial Las Palmas</SelectItem>
              <SelectItem value="3">Office Plaza Central</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="num_unidad">Número de Unidad*</Label>
          <Input id="num_unidad" placeholder="A-101" className="bg-background border-border" required />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label htmlFor="modelo">Modelo</Label>
          <Input id="modelo" placeholder="Deluxe" className="bg-background border-border" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nivel">Nivel</Label>
          <Input id="nivel" placeholder="Piso 1" className="bg-background border-border" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="periodo">Periodo</Label>
          <Input id="periodo" placeholder="Q1 2024" className="bg-background border-border" />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Áreas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="area_total_m2">Área Total (mts²)*</Label>
            <Input
              id="area_total_m2"
              type="number"
              step="0.01"
              placeholder="85.50"
              className="bg-background border-border"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="area_balcon_terraza_m2">Área Balcón/Terraza (mts²)</Label>
            <Input
              id="area_balcon_terraza_m2"
              type="number"
              step="0.01"
              placeholder="12.00"
              className="bg-background border-border"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Características</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="banios">Baños</Label>
            <Input id="banios" type="number" placeholder="2" className="bg-background border-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cant_parqueos">Cantidad de Parqueos</Label>
            <Input id="cant_parqueos" type="number" placeholder="2" className="bg-background border-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo_parqueo">Tipo de Parqueo</Label>
            <Select>
              <SelectTrigger id="tipo_parqueo" className="bg-background border-border">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cubierto">Cubierto</SelectItem>
                <SelectItem value="descubierto">Descubierto</SelectItem>
                <SelectItem value="sotano">Sótano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="tamano_parqueo_m2">Tamaño Parqueo (mts²)</Label>
          <Input
            id="tamano_parqueo_m2"
            type="number"
            step="0.01"
            placeholder="12.50"
            className="bg-background border-border"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="precio_parqueo_adicional_usd">Precio Parqueo Adicional (USD)</Label>
          <Input
            id="precio_parqueo_adicional_usd"
            type="number"
            step="0.01"
            placeholder="5000.00"
            className="bg-background border-border"
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Clasificaciones</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="clasificacion_oficina">Clasificación Oficina</Label>
            <Input id="clasificacion_oficina" placeholder="A+" className="bg-background border-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clasificacion_general_por_tamano">Clasificación General por Tamaño</Label>
            <Select>
              <SelectTrigger id="clasificacion_general_por_tamano" className="bg-background border-border">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pequena">Pequeña</SelectItem>
                <SelectItem value="mediana">Mediana</SelectItem>
                <SelectItem value="grande">Grande</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Fechas</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="fecha_recoleccion">Fecha de Recolección</Label>
            <Input id="fecha_recoleccion" type="date" className="bg-background border-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hora_recoleccion">Hora de Recolección</Label>
            <Input id="hora_recoleccion" type="time" className="bg-background border-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha_inicio">Fecha de Inicio</Label>
            <Input id="fecha_inicio" type="date" className="bg-background border-border" />
          </div>
        </div>
      </div>
    </div>
  )
}
