"use client"

import { ArrowDown, ArrowRight, ArrowUp, DollarSign } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type {
  ExchangeRateComparison,
  ExchangeRateDirection,
} from "@/lib/exchange-rates"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function formatNum(value: number | null, intlLocale: string): string | null {
  if (value == null || Number.isNaN(value)) return null
  return new Intl.NumberFormat(intlLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  }).format(value)
}

/** Texto principal y detalle para tooltip cuando Banguat manda solo compra, solo venta o solo referencia. */
function rateDisplayParts(
  rate: ExchangeRateComparison["current"],
  intlLocale: string,
  labels: { ref: string; buy: string; sell: string }
): { mainValue: string; tooltipDetail: string } | null {
  const buy = formatNum(rate.buy, intlLocale)
  const sell = formatNum(rate.sell, intlLocale)
  const ref = formatNum(rate.referenceRate, intlLocale)

  const hasAny = Boolean(buy || sell || ref)
  if (!hasAny) return null

  const parts: string[] = []
  if (ref) parts.push(`${labels.ref}: ${ref}`)
  if (buy) parts.push(`${labels.buy}: ${buy}`)
  if (sell) parts.push(`${labels.sell}: ${sell}`)
  const tooltipDetail = parts.join(" · ")

  let mainValue: string
  if (ref && !buy && !sell) {
    mainValue = `${labels.ref} ${ref}`
  } else if (buy && sell) {
    mainValue = `${buy} · ${sell}`
  } else if (buy) {
    mainValue = `${labels.buy} ${buy}`
  } else if (sell) {
    mainValue = `${labels.sell} ${sell}`
  } else {
    mainValue = ref!
  }

  return { mainValue, tooltipDetail }
}

/** Bloque compacto: dólar (tipo de cambio) + flecha de tendencia; colores por dirección. */
function RateTrendIcon({ direction }: { direction: ExchangeRateDirection }) {
  const box = cn(
    "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
    "ring-1 ring-inset"
  )
  const dollar = "h-3.5 w-3.5"
  const cornerArrow = "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 drop-shadow-sm"

  if (direction === "up") {
    return (
      <span
        className={cn(
          box,
          "bg-emerald-500/20 ring-emerald-500/35 dark:bg-emerald-500/12 dark:ring-emerald-400/25"
        )}
        aria-hidden
      >
        <DollarSign
          className={cn(dollar, "text-emerald-800 dark:text-emerald-200")}
          strokeWidth={2.25}
        />
        <ArrowUp
          className={cn(cornerArrow, "text-emerald-600 dark:text-emerald-400")}
          strokeWidth={2.75}
        />
      </span>
    )
  }

  if (direction === "down") {
    return (
      <span
        className={cn(
          box,
          "bg-rose-500/20 ring-rose-500/35 dark:bg-rose-500/12 dark:ring-rose-400/25"
        )}
        aria-hidden
      >
        <DollarSign
          className={cn(dollar, "text-rose-900 dark:text-rose-100")}
          strokeWidth={2.25}
        />
        <ArrowDown
          className={cn(cornerArrow, "text-rose-600 dark:text-rose-400")}
          strokeWidth={2.75}
        />
      </span>
    )
  }

  if (direction === "flat") {
    return (
      <span
        className={cn(
          box,
          "bg-sky-500/20 ring-sky-500/35 dark:bg-sky-500/12 dark:ring-sky-400/25"
        )}
        aria-hidden
      >
        <DollarSign
          className={cn(dollar, "text-sky-900 dark:text-sky-100")}
          strokeWidth={2.25}
        />
        <ArrowRight
          className={cn(
            cornerArrow,
            "text-sky-600 dark:text-sky-400",
            "-translate-y-px"
          )}
          strokeWidth={2.75}
        />
      </span>
    )
  }

  return (
    <span
      className={cn(
        box,
        "bg-muted/80 ring-border/60 dark:bg-muted/50 dark:ring-border/50"
      )}
      aria-hidden
    >
      <DollarSign className={cn(dollar, "text-muted-foreground")} strokeWidth={2.25} />
    </span>
  )
}

export function ExchangeRateSidebar({
  data,
  navCollapsed,
}: {
  data: ExchangeRateComparison | null
  navCollapsed: boolean
}) {
  const t = useTranslations("navigation")
  const locale = useLocale()
  const intlLocale = locale === "en" ? "en-US" : "es-GT"

  if (!data) return null

  const rate = data.current
  const display = rateDisplayParts(rate, intlLocale, {
    ref: t("exchangeRefShort"),
    buy: t("exchangeBuyShort"),
    sell: t("exchangeSellShort"),
  })
  if (!display) return null

  const pair = `${rate.currency}/${rate.unit}`
  const { mainValue, tooltipDetail } = display

  const trend = data.direction

  const tooltipBody = (
    <div className="space-y-1.5 text-xs">
      <p className="font-medium leading-snug">
        {pair} · {rate.date}
      </p>
      <p className="tabular-nums text-foreground">{tooltipDetail}</p>
      {rate.source ? (
        <p className="text-[10px] text-muted-foreground">{rate.source}</p>
      ) : null}
    </div>
  )

  if (navCollapsed) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-center rounded-lg border border-border/50 bg-muted/20 py-2.5 transition-colors hover:bg-muted/40",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            aria-label={t("exchangeSidebarAria")}
          >
            <RateTrendIcon direction={trend} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" className="max-w-[260px]">
          {tooltipBody}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border/40 bg-muted/20 px-3 py-2",
        "dark:border-border/30 dark:bg-muted/10"
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("exchangeSidebarTitle")}
      </p>
      <div className="mt-1 flex items-start gap-2">
        <RateTrendIcon direction={trend} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[10px] font-medium tabular-nums leading-tight text-muted-foreground">
            {pair}
          </p>
          <p className="break-words text-xs font-semibold tabular-nums leading-snug text-foreground">
            {mainValue}
          </p>
        </div>
      </div>
    </div>
  )
}
