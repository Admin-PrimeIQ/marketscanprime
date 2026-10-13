"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

export function UnitPricingTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Precios de Venta</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="precio_total_gtq">Precio Total (GTQ)</Label>
            <Input
              id="precio_total_gtq"
              type="number"
              step="0.01"
              placeholder="1250000.00"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="precio_sin_iva_usd">Precio sin IVA (USD)</Label>
            <Input
              id="precio_sin_iva_usd"
              type="number"
              step="0.01"
              placeholder="158250.00"
              className="bg-background border-border"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="precio_sin_iva_gtq">Precio sin IVA (GTQ)</Label>
          <Input
            id="precio_sin_iva_gtq"
            type="number"
            step="0.01"
            placeholder="1232142.86"
            className="bg-background border-border"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="precio_m2_usd">Precio por mts² (USD)</Label>
          <Input
            id="precio_m2_usd"
            type="number"
            step="0.01"
            placeholder="1850.00"
            className="bg-background border-border"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="precio_v2_usd">Precio v2 (USD)</Label>
        <Input
          id="precio_v2_usd"
          type="number"
          step="0.01"
          placeholder="1850.00"
          className="bg-background border-border"
        />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Absorción</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="absorcion_unitaria">Absorción Unitaria</Label>
            <Input
              id="absorcion_unitaria"
              type="number"
              step="0.01"
              placeholder="0.125"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="absorcion_m2">Absorción mts²</Label>
            <Input
              id="absorcion_m2"
              type="number"
              step="0.01"
              placeholder="10.69"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="absorcion_v2">Absorción v²</Label>
            <Input
              id="absorcion_v2"
              type="number"
              step="0.01"
              placeholder="10.69"
              className="bg-background border-border"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
