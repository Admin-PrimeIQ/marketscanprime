"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"

type SeriesKey = "projects" | "units"

const mockData = [
  { month: "Ene", projects: 12, units: 140 },
  { month: "Feb", projects: 15, units: 180 },
  { month: "Mar", projects: 18, units: 210 },
  { month: "Abr", projects: 16, units: 190 },
  { month: "May", projects: 22, units: 260 },
  { month: "Jun", projects: 24, units: 300 },
  { month: "Jul", projects: 21, units: 250 },
  { month: "Ago", projects: 25, units: 320 },
  { month: "Sep", projects: 27, units: 340 },
  { month: "Oct", projects: 23, units: 280 },
  { month: "Nov", projects: 19, units: 230 },
  { month: "Dic", projects: 26, units: 330 },
]

const ranges = [
  { label: "Últimos 6 meses", start: 6, end: 12 },
  { label: "Últimos 3 meses", start: 9, end: 12 },
  { label: "Año completo", start: 0, end: 12 },
]

export function ActivityChart() {
  const [series, setSeries] = useState<SeriesKey>("projects")
  const [rangeIndex, setRangeIndex] = useState(0)

  const range = ranges[rangeIndex]
  const sliced = useMemo(() => mockData.slice(range.start, range.end), [range.start, range.end])

  const totals = useMemo(() => {
    const current = sliced.reduce((sum, d) => sum + d[series], 0)
    const prevSlice = mockData.slice(Math.max(0, range.start - (range.end - range.start)), range.start)
    const prev = prevSlice.reduce((sum, d) => sum + d[series], 0)
    const diff = current - prev
    const pct = prev > 0 ? (diff / prev) * 100 : 0
    return { current, prev, diff, pct }
  }, [sliced, series, range.start, range.end])

  const maxValue = Math.max(...sliced.map((d) => d[series]), 1)

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="w-5 h-5" />
          Gráfico de actividad — Proyectos registrados por mes
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <div className="flex gap-1 rounded-full bg-muted px-3 py-1">
            {(["projects", "units"] as SeriesKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSeries(key)}
                className={cn(
                  "px-2 py-1 rounded-full transition-colors",
                  series === key ? "bg-primary text-primary-foreground" : "hover:bg-muted-foreground/10"
                )}
              >
                {key === "projects" ? "Proyectos" : "Unidades"}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-full bg-muted px-3 py-1">
            {ranges.map((r, idx) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setRangeIndex(idx)}
                className={cn(
                  "px-2 py-1 rounded-full transition-colors",
                  rangeIndex === idx ? "bg-primary text-primary-foreground" : "hover:bg-muted-foreground/10"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          <div className="lg:col-span-3">
            <div className="h-64 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-end gap-2 h-full">
                {sliced.map((d) => {
                  const value = d[series]
                  const height = Math.max(8, (value / maxValue) * 200)
                  return (
                    <div key={d.month} className="flex-1 flex flex-col items-center gap-2">
                      <div
                        className="w-full rounded-md bg-primary/80 hover:bg-primary transition-colors"
                        style={{ height }}
                        aria-label={`${d.month}: ${value}`}
                      />
                      <span className="text-xs text-muted-foreground">{d.month}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 grid grid-cols-2 gap-3">
            <MetricCard
              label="Actual"
              value={totals.current}
              series={series}
              highlight
            />
            <MetricCard label="Anterior" value={totals.prev} series={series} />
            <MetricCard label="Diferencia" value={totals.diff} series={series} />
            <MetricCard label="Variación" value={totals.pct} series={series} isPercent />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Datos dummy para comparativa temporal. Cambia de métrica y periodo para ver la variación.
        </p>
      </CardContent>
    </Card>
  )
}

function MetricCard({
  label,
  value,
  series,
  highlight,
  isPercent = false,
}: {
  label: string
  value: number
  series: SeriesKey
  highlight?: boolean
  isPercent?: boolean
}) {
  const formatter = new Intl.NumberFormat("es-GT", {
    maximumFractionDigits: isPercent ? 1 : 0,
  })
  const display = isPercent ? `${formatter.format(value)}%` : formatter.format(value)
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/70 p-3 flex flex-col gap-1",
        highlight && "border-primary/60 shadow-sm"
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold text-foreground">
        {display} {isPercent ? "" : series === "projects" ? "proj" : "u"}
      </span>
    </div>
  )
}
