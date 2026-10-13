"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface UnitSpecificTabProps {
  unitType: "vivienda" | "oficina" | "industrial"
}

export function UnitSpecificTab({ unitType }: UnitSpecificTabProps) {
  if (unitType === "vivienda") {
    return (
      <Card className="border-border bg-background">
        <CardHeader>
          <CardTitle className="text-base">Unidad de Vivienda</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Las unidades de vivienda solo requieren la información general básica.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (unitType === "oficina") {
    return (
      <div className="space-y-6">
        <Card className="border-border bg-background">
          <CardHeader>
            <CardTitle className="text-base">Datos Específicos de Oficina</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="m2_sin_parqueo_usd">mts² sin Parqueo (USD)</Label>
                <Input
                  id="m2_sin_parqueo_usd"
                  type="number"
                  step="0.01"
                  placeholder="2350.00"
                  className="bg-card border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor_propiedad_sin_parqueo_usd">Valor Propiedad sin Parqueo (USD)</Label>
                <Input
                  id="valor_propiedad_sin_parqueo_usd"
                  type="number"
                  step="0.01"
                  placeholder="282000.00"
                  className="bg-card border-border"
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Leyendas de Cantidad</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="leyenda_cantidad_empleados">Cantidad de Empleados</Label>
                  <Input
                    id="leyenda_cantidad_empleados"
                    placeholder="8-12 empleados"
                    className="bg-card border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leyenda_cantidad_m2">Cantidad mts²</Label>
                  <Input id="leyenda_cantidad_m2" placeholder="120 mts²" className="bg-card border-border" />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Leyendas de Tamaño</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="leyenda_tamano_cantidad_empleados">Tamaño por Cantidad de Empleados</Label>
                  <Input
                    id="leyenda_tamano_cantidad_empleados"
                    placeholder="Mediana"
                    className="bg-card border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leyenda_tamano_m2">Tamaño por mts²</Label>
                  <Input id="leyenda_tamano_m2" placeholder="Mediana" className="bg-card border-border" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (unitType === "industrial") {
    return (
      <div className="space-y-6">
        <Card className="border-border bg-background">
          <CardHeader>
            <CardTitle className="text-base">Datos Específicos de Unidad Industrial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="fase">Fase</Label>
                <Select>
                  <SelectTrigger id="fase" className="bg-card border-border">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Fase 1</SelectItem>
                    <SelectItem value="2">Fase 2</SelectItem>
                    <SelectItem value="3">Fase 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sector_cluster">Sector / Cluster</Label>
                <Input id="sector_cluster" placeholder="Logística" className="bg-card border-border" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoria">Categoría</Label>
                <Input id="categoria" placeholder="Bodega" className="bg-card border-border" />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Tamaños de Terreno</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="tamano_terreno_m2">Tamaño Terreno (mts²)</Label>
                  <Input
                    id="tamano_terreno_m2"
                    type="number"
                    step="0.01"
                    placeholder="1500.00"
                    className="bg-card border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tamano_terreno_v2">Tamaño Terreno (v²)</Label>
                  <Input
                    id="tamano_terreno_v2"
                    type="number"
                    step="0.01"
                    placeholder="1500.00"
                    className="bg-card border-border"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Bodega / Almacenamiento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="tamano_bodega_m2">Tamaño Bodega (mts²)</Label>
                  <Input
                    id="tamano_bodega_m2"
                    type="number"
                    step="0.01"
                    placeholder="1200.00"
                    className="bg-card border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tamano_bodega_v2">Tamaño Bodega (v²)</Label>
                  <Input
                    id="tamano_bodega_v2"
                    type="number"
                    step="0.01"
                    placeholder="1200.00"
                    className="bg-card border-border"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Áreas Adicionales</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="tamano_oficina_m2">Tamaño Oficina (mts²)</Label>
                  <Input
                    id="tamano_oficina_m2"
                    type="number"
                    step="0.01"
                    placeholder="150.00"
                    className="bg-card border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tamano_mezzanine_m2">Tamaño Mezzanine (mts²)</Label>
                  <Input
                    id="tamano_mezzanine_m2"
                    type="number"
                    step="0.01"
                    placeholder="80.00"
                    className="bg-card border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="area_carga_m2">Área de Carga (mts²)</Label>
                  <Input
                    id="area_carga_m2"
                    type="number"
                    step="0.01"
                    placeholder="200.00"
                    className="bg-card border-border"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Medidas</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="ancho_1_m">Ancho 1 (m)</Label>
                  <Input
                    id="ancho_1_m"
                    type="number"
                    step="0.01"
                    placeholder="15.00"
                    className="bg-card border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fondo_1_m">Fondo 1 (m)</Label>
                  <Input
                    id="fondo_1_m"
                    type="number"
                    step="0.01"
                    placeholder="25.00"
                    className="bg-card border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fondo_2_m">Fondo 2 (m)</Label>
                  <Input
                    id="fondo_2_m"
                    type="number"
                    step="0.01"
                    placeholder="30.00"
                    className="bg-card border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="alto_m">Alto (m)</Label>
                  <Input id="alto_m" type="number" step="0.01" placeholder="8.00" className="bg-card border-border" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cantidad_banos">Cantidad de Baños</Label>
              <Input id="cantidad_banos" type="number" placeholder="2" className="bg-card border-border" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
