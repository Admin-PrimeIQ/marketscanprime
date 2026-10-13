"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

export function UnitRentalTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Renta</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="precio_renta_gtq">Precio Renta (GTQ)</Label>
            <Input
              id="precio_renta_gtq"
              type="number"
              step="0.01"
              placeholder="6500.00"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="renta_sin_iva_usd">Renta sin IVA (USD)</Label>
            <Input
              id="renta_sin_iva_usd"
              type="number"
              step="0.01"
              placeholder="825.00"
              className="bg-background border-border"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label htmlFor="renta_sin_iva_gtq">Renta sin IVA (GTQ)</Label>
          <Input
            id="renta_sin_iva_gtq"
            type="number"
            step="0.01"
            placeholder="6428.57"
            className="bg-background border-border"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="renta_m2_usd">Renta por mts² (USD)</Label>
          <Input
            id="renta_m2_usd"
            type="number"
            step="0.01"
            placeholder="9.65"
            className="bg-background border-border"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="renta_v2_usd">Renta v2 (USD)</Label>
          <Input
            id="renta_v2_usd"
            type="number"
            step="0.01"
            placeholder="9.65"
            className="bg-background border-border"
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Mantenimiento</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="mantenimiento_m2">Mantenimiento mts²</Label>
            <Input
              id="mantenimiento_m2"
              type="number"
              step="0.01"
              placeholder="3.50"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mantenimiento_v2">Mantenimiento v2</Label>
            <Input
              id="mantenimiento_v2"
              type="number"
              step="0.01"
              placeholder="3.50"
              className="bg-background border-border"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
