"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Landmark, Plus, X } from "lucide-react"
import { NumericFormat } from "react-number-format"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  BANCOS,
  BANCO_LABEL,
  bancosActivos,
  plazoDeBanco,
  type BancoKey,
  type BlockFinancing,
} from "@/lib/financing"

/**
 * Los términos de financiamiento de un bloque de VIVIENDA.
 *
 * Vive en su propio archivo porque `block-form.tsx` ya pasa de mil seiscientas
 * líneas, y porque esta sección tiene una regla propia que no comparte con el
 * resto del formulario: sólo existe para vivienda.
 *
 * ── Por qué "obligatorio" se aplica acá y no en el schema ───────────────────
 *
 * El bloque es UNA sola colección para los tres tipos de inmueble, y
 * `banking_info` sólo existe para vivienda. Marcar el componente como requerido
 * en Strapi obligaría también a oficinas e industrial, que no tienen dónde
 * guardarlo. La regla vive donde está el contexto para aplicarla, igual que
 * `parkingForSale`, que sólo aplica a oficinas.
 *
 * ── Por qué se eligen los bancos en vez de mostrar los dieciocho ────────────
 *
 * En el warehouse, 121 de los 231 bloques con financiamiento usan EXACTAMENTE
 * un banco. Dibujar dieciocho filas para llenar una es pedirle al tabulador que
 * recorra diecisiete vacías cada vez. Se eligen del selector y aparecen.
 */

interface Props {
  value?: BlockFinancing | null
  onChange: (financing: BlockFinancing | null) => void
  disabled?: boolean
}

/** Un decimal que acepta vacío: el vacío es ausencia, no cero. */
function CampoNumero({
  id,
  label,
  value,
  onChange,
  suffix,
  disabled,
  hint,
}: {
  id: string
  label: string
  value: number | null | undefined
  onChange: (v: number | undefined) => void
  suffix?: string
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <NumericFormat
        id={id}
        customInput={Input}
        value={value ?? ""}
        onValueChange={(v) => onChange(v.floatValue)}
        decimalScale={2}
        allowNegative={false}
        suffix={suffix}
        disabled={disabled}
        className="bg-background border-border"
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function BlockFinancingCard({ value, onChange, disabled }: Props) {
  // Las etiquetas viven en `common.blockForm`, donde ya está
  // `pricesAndFinancing`: el formulario y la vista del bloque las comparten, y
  // duplicarlas haría que divergieran en la primera corrección.
  const t = useTranslations("common.blockForm")
  const activo = value != null
  const activos = useMemo(() => bancosActivos(value), [value])
  const disponibles = useMemo(
    () => BANCOS.filter((b) => !activos.includes(b)),
    [activos]
  )

  const set = (cambios: Partial<BlockFinancing>) => onChange({ ...(value ?? {}), ...cambios })

  const agregarBanco = (banco: BancoKey) => set({ [banco]: { annualRatePercent: null } })

  const quitarBanco = (banco: BancoKey) => {
    // Se elimina la clave en vez de ponerla en null: un espacio presente con
    // tasa vacía y uno ausente significan cosas distintas, y el push escribe 0
    // en el warehouse justo para los ausentes.
    const { [banco]: _fuera, ...resto } = value ?? {}
    onChange(resto as BlockFinancing)
  }

  const setTasa = (banco: BancoKey, tasa: number | undefined) =>
    set({ [banco]: { ...(value?.[banco] ?? {}), annualRatePercent: tasa ?? null } })

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-muted-foreground" />
          {t("financingTitle")}
        </CardTitle>
        <CardDescription>{t("financingDescription")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center gap-3">
          <Switch
            id="tiene-financiamiento"
            checked={activo}
            disabled={disabled}
            onCheckedChange={(on) => onChange(on ? {} : null)}
          />
          <Label htmlFor="tiene-financiamiento" className="cursor-pointer">
            {t("financingEnabled")}
          </Label>
        </div>

        {!activo ? (
          <p className="text-sm text-muted-foreground">{t("financingDisabledHint")}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CampoNumero
                id="downPaymentPercent"
                label={t("downPayment")}
                suffix=" %"
                disabled={disabled}
                value={value?.downPaymentPercent}
                onChange={(v) => set({ downPaymentPercent: v ?? null })}
              />
              <div className="space-y-2">
                <Label htmlFor="fractionalDownPayment">{t("fractionalDownPayment")}</Label>
                <div className="flex items-center gap-3 h-10">
                  <Switch
                    id="fractionalDownPayment"
                    checked={value?.fractionalDownPayment === true}
                    disabled={disabled}
                    onCheckedChange={(on) => set({ fractionalDownPayment: on })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {value?.fractionalDownPayment === true
                      ? t("fractionalYes")
                      : value?.fractionalDownPayment === false
                        ? t("fractionalNo")
                        : t("fractionalUnset")}
                  </span>
                </div>
              </div>

              <CampoNumero
                id="minDownPaymentFHA"
                label={t("minDownPaymentFHA")}
                suffix=" %"
                disabled={disabled}
                value={value?.minDownPaymentFHA}
                onChange={(v) => set({ minDownPaymentFHA: v ?? null })}
              />
              <CampoNumero
                id="minDownPaymentOtherBanks"
                label={t("minDownPaymentOtherBanks")}
                suffix=" %"
                disabled={disabled}
                value={value?.minDownPaymentOtherBanks}
                onChange={(v) => set({ minDownPaymentOtherBanks: v ?? null })}
              />
              <CampoNumero
                id="fractionalDownPaymentFHA"
                label={t("fractionalDownPaymentFHA")}
                suffix=" %"
                disabled={disabled}
                value={value?.fractionalDownPaymentFHA}
                onChange={(v) => set({ fractionalDownPaymentFHA: v ?? null })}
              />
              <CampoNumero
                id="fractionalInstallmentsOtherBanks"
                label={t("fractionalInstallmentsOtherBanks")}
                disabled={disabled}
                value={value?.fractionalInstallmentsOtherBanks}
                onChange={(v) => set({ fractionalInstallmentsOtherBanks: v ?? null })}
              />
            </div>

            {/* Los plazos son TRES, no uno por banco: el warehouse los agrupa en
                FHA, bancos comerciales y financiamiento propio. Van juntos para
                que se lea que son de grupo, no de banco. */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("maxLoanTerm")}</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <CampoNumero
                  id="maxLoanTermYearsFHA"
                  label={t("maxLoanTermFHA")}
                  disabled={disabled}
                  value={value?.maxLoanTermYearsFHA}
                  onChange={(v) => set({ maxLoanTermYearsFHA: v ?? null })}
                />
                <CampoNumero
                  id="maxLoanTermYearsBanks"
                  label={t("maxLoanTermBanks")}
                  disabled={disabled}
                  value={value?.maxLoanTermYearsBanks}
                  onChange={(v) => set({ maxLoanTermYearsBanks: v ?? null })}
                  hint={t("maxLoanTermBanksHint")}
                />
                <CampoNumero
                  id="maxLoanTermYearsOwner"
                  label={t("maxLoanTermOwner")}
                  disabled={disabled}
                  value={value?.maxLoanTermYearsOwner}
                  onChange={(v) => set({ maxLoanTermYearsOwner: v ?? null })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-sm font-medium">
                  {t("banks")} {activos.length > 0 ? `(${activos.length})` : ""}
                </Label>
                {disponibles.length > 0 && !disabled ? (
                  <Select value="" onValueChange={(v) => agregarBanco(v as BancoKey)}>
                    <SelectTrigger className="w-auto min-w-[220px] bg-background border-border">
                      <span className="flex items-center gap-2 text-sm">
                        <Plus className="w-4 h-4" />
                        <SelectValue placeholder={t("addBank")} />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {disponibles.map((b) => (
                        <SelectItem key={b} value={b}>
                          {BANCO_LABEL[b]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              {activos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noBanks")}
                </p>
              ) : (
                <div className="space-y-2">
                  {activos.map((banco) => (
                    <div
                      key={banco}
                      className="flex items-center gap-3 rounded-md border border-border p-3"
                    >
                      <span className="flex-1 text-sm font-medium">{BANCO_LABEL[banco]}</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {plazoDeBanco(banco) === "FHA"
                          ? t("termFHA")
                          : plazoDeBanco(banco) === "Owner"
                            ? t("termOwner")
                            : t("termBanks")}
                      </span>
                      <NumericFormat
                        aria-label={t("bankRate", { bank: BANCO_LABEL[banco] })}
                        customInput={Input}
                        value={value?.[banco]?.annualRatePercent ?? ""}
                        onValueChange={(v) => setTasa(banco, v.floatValue)}
                        decimalScale={2}
                        allowNegative={false}
                        suffix=" %"
                        placeholder={t("annualRate")}
                        disabled={disabled}
                        className="w-32 bg-background border-border"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        onClick={() => quitarBanco(banco)}
                        aria-label={t("removeBank", { bank: BANCO_LABEL[banco] })}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
