"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useTranslations } from "next-intl"

export function MetricsTab() {
  const t = useTranslations('projectForm.metrics')
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('landData')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="total_m2">{t('totalM2')}</Label>
            <Input
              id="total_m2"
              type="number"
              step="0.01"
              placeholder="5000.00"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tamano_promedio_m2">{t('averageSizeM2')}</Label>
            <Input
              id="tamano_promedio_m2"
              type="number"
              step="0.01"
              placeholder="85.50"
              className="bg-background border-border"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('units')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="unidades_disponibles">{t('availableUnits')}</Label>
            <Input id="unidades_disponibles" type="number" placeholder="48" className="bg-background border-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="m2_disponibles">{t('availableM2')}</Label>
            <Input
              id="m2_disponibles"
              type="number"
              step="0.01"
              placeholder="4104.00"
              className="bg-background border-border"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('parking')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="parqueos_visita">{t('visitorParking')}</Label>
            <Input id="parqueos_visita" type="number" placeholder="10" className="bg-background border-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parqueos_venta">{t('saleParking')}</Label>
            <Input id="parqueos_venta" type="number" placeholder="96" className="bg-background border-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="total_parqueos">{t('totalParking')}</Label>
            <Input id="total_parqueos" type="number" placeholder="106" className="bg-background border-border" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('pricing')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="precio_prom_m2">{t('averagePricePerM2')} (USD)</Label>
            <Input
              id="precio_prom_m2"
              type="number"
              step="0.01"
              placeholder="1850.00"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cuota_promedio">{t('averageInstallment')} (GTQ)</Label>
            <Input
              id="cuota_promedio"
              type="number"
              step="0.01"
              placeholder="5500.00"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ingresos_promedio">{t('averageIncome')} (GTQ)</Label>
            <Input
              id="ingresos_promedio"
              type="number"
              step="0.01"
              placeholder="18000.00"
              className="bg-background border-border"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
