"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { type StrapiProject, type StrapiCurrenciesComponent } from "@/lib/api/strapi"
import { useTranslations } from "next-intl"
import { Coins, DollarSign } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface CurrenciesTabProps {
  initialData?: Partial<StrapiProject>
  disabled?: boolean
  onCurrenciesChange?: (currencies: StrapiCurrenciesComponent | null) => void
}

// Mapeo de códigos de moneda a información
const currencyInfo = [
  { code: 'mxn', name: 'Peso Mexicano', symbol: '$' },
  { code: 'gtq', name: 'Quetzal', symbol: 'Q' },
  { code: 'hnl', name: 'Lempira', symbol: 'L' },
  { code: 'crc', name: 'Colón Costarricense', symbol: '₡' },
  { code: 'nio', name: 'Córdoba', symbol: 'C$' },
  { code: 'pab', name: 'Balboa', symbol: 'B/.' },
  { code: 'bzd', name: 'Dólar Beliceño', symbol: 'BZ$' },
] as const

function buildCurrencyStateFromComponent(
  initialCurrencies: StrapiCurrenciesComponent | null
): Record<
  string,
  { enabled: boolean; buyRate?: number; sellRate?: number }
> {
  const state: Record<string, { enabled: boolean; buyRate?: number; sellRate?: number }> = {}
  currencyInfo.forEach(({ code }) => {
    const currencyData = initialCurrencies?.[code as keyof StrapiCurrenciesComponent]
    state[code] = {
      enabled: !!(
        currencyData &&
        (currencyData.buyRate !== undefined || currencyData.sellRate !== undefined)
      ),
      buyRate: currencyData?.buyRate,
      sellRate: currencyData?.sellRate,
    }
  })
  return state
}

export function CurrenciesTab({ initialData, disabled = false, onCurrenciesChange }: CurrenciesTabProps) {
  const t = useTranslations('projectForm.currencies')
  const tCommon = useTranslations('common')

  const initialCurrencies = initialData?.currencies || null
  const currenciesSourceKey = JSON.stringify(initialCurrencies)

  const [currencies, setCurrencies] = useState(() =>
    buildCurrencyStateFromComponent(initialCurrencies)
  )

  useEffect(() => {
    setCurrencies(buildCurrencyStateFromComponent(initialData?.currencies ?? null))
  }, [currenciesSourceKey])

  // Actualizar el componente padre cuando cambian las currencies
  useEffect(() => {
    const currenciesComponent: StrapiCurrenciesComponent = {}
    
    currencyInfo.forEach(({ code }) => {
      const currencyState = currencies[code]
      if (currencyState?.enabled) {
        currenciesComponent[code as keyof StrapiCurrenciesComponent] = {
          buyRate: currencyState.buyRate,
          sellRate: currencyState.sellRate,
        }
      }
    })
    
    // Solo enviar si hay al menos una moneda habilitada
    const hasEnabledCurrency = Object.values(currencies).some(c => c.enabled)
    onCurrenciesChange?.(hasEnabledCurrency ? currenciesComponent : null)
  }, [currencies, onCurrenciesChange])

  const handleToggleCurrency = (code: string, enabled: boolean) => {
    setCurrencies(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        enabled,
        // Si se desactiva, limpiar los valores
        buyRate: enabled ? prev[code]?.buyRate : undefined,
        sellRate: enabled ? prev[code]?.sellRate : undefined,
      }
    }))
  }

  const handleRateChange = (code: string, field: 'buyRate' | 'sellRate', value: string) => {
    const numValue = value === '' ? undefined : (isNaN(parseFloat(value)) ? undefined : parseFloat(value))
    setCurrencies(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        enabled: prev[code]?.enabled || false,
        [field]: numValue,
      }
    }))
  }

  return (
    <div className="space-y-6">
      {/* USD como moneda base - solo informativo */}
      <Card className="border-border bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">USD - Dólar Estadounidense</p>
                <p className="text-xs text-muted-foreground">
                  {t('baseCurrency') || 'Moneda base del sistema'}
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-primary/10 px-2 py-1 rounded">
              {tCommon('base') || 'Base'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Monedas configurables */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('configuredCurrencies') || 'Monedas Configurables'}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t('configureCurrenciesDescription') || 'Activa las monedas que deseas configurar y establece las tasas de compra y venta vs USD'}
        </p>
        
        <div className="space-y-4">
          {currencyInfo.map(({ code, name, symbol }) => {
            const currencyState = currencies[code] || { enabled: false }
            
            return (
              <Card key={code} className="border-border">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {/* Header con toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary">
                          <Coins className="w-5 h-5 text-secondary-foreground" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{name} ({symbol})</p>
                          <p className="text-xs text-muted-foreground">
                            {t('vsUSD') || 'Tasas vs USD'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`currency-${code}-toggle`} className="text-sm">
                          {currencyState.enabled ? t('enabled') || 'Activada' : t('disabled') || 'Desactivada'}
                        </Label>
                        <Switch
                          id={`currency-${code}-toggle`}
                          checked={currencyState.enabled}
                          onCheckedChange={(checked) => handleToggleCurrency(code, checked)}
                          disabled={disabled}
                        />
                      </div>
                    </div>

                    {/* Campos de tasas (solo si está habilitada) */}
                    {currencyState.enabled && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                        <div className="space-y-2">
                          <Label htmlFor={`currency-${code}-buyRate`}>
                            {t('buyRate') || 'Tasa de Compra'} (USD → {symbol})
                          </Label>
                          <Input
                            id={`currency-${code}-buyRate`}
                            type="number"
                            step="0.0001"
                            placeholder="0.0000"
                            disabled={disabled}
                            value={currencyState.buyRate ?? ''}
                            onChange={(e) => handleRateChange(code, 'buyRate', e.target.value)}
                            className="bg-background border-border"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('buyRateDescription') || 'Cantidad de moneda local que se recibe por 1 USD'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`currency-${code}-sellRate`}>
                            {t('sellRate') || 'Tasa de Venta'} ({symbol} → USD)
                          </Label>
                          <Input
                            id={`currency-${code}-sellRate`}
                            type="number"
                            step="0.0001"
                            placeholder="0.0000"
                            disabled={disabled}
                            value={currencyState.sellRate ?? ''}
                            onChange={(e) => handleRateChange(code, 'sellRate', e.target.value)}
                            className="bg-background border-border"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('sellRateDescription') || 'Cantidad de USD que se recibe por 1 unidad de moneda local'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
