"use client"

import { useState } from "react"
import { StatsCard } from "@/components/dashboard/stats-card"
import { RecentProjects } from "@/components/dashboard/recent-projects"
import { QuickFilters } from "@/components/dashboard/quick-filters"
import { ActivityChart } from "@/components/dashboard/activity-chart"
import { Building2, Home, TrendingUp, DollarSign, Plus, Pencil, Check, Wand2, BarChart3, Layers, Flame, Map, LineChart, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslations } from "next-intl"

type DashboardItemId = string
type DashboardItemType =
  | "stats1"
  | "stats2"
  | "stats3"
  | "stats4"
  | "activity"
  | "filters"
  | "recent"
  | "proj-vs-units"
  | "period-compare"
  | "heatmap"
  | "top-absorption"
  | "pipeline"

type DashboardItem = {
  id: DashboardItemId
  type: DashboardItemType
  colSpan: number
  rowSpan: number
  minCol?: number
  minRow?: number
}

const baseCol = 1
const cellHeight = 90

const defaultLayout: DashboardItem[] = [
  { id: "stats1", type: "stats1", colSpan: 3, rowSpan: 2, minCol: 2, minRow: 2 },
  { id: "stats2", type: "stats2", colSpan: 3, rowSpan: 2, minCol: 2, minRow: 2 },
  { id: "stats3", type: "stats3", colSpan: 3, rowSpan: 2, minCol: 2, minRow: 2 },
  { id: "stats4", type: "stats4", colSpan: 3, rowSpan: 2, minCol: 2, minRow: 2 },
  { id: "activity", type: "activity", colSpan: 4, rowSpan: 4, minCol: 3, minRow: 3 },
  { id: "filters", type: "filters", colSpan: 4, rowSpan: 3, minCol: 2, minRow: 2 },
  { id: "recent", type: "recent", colSpan: 4, rowSpan: 4, minCol: 3, minRow: 3 },
]


const sectorCols = 4

function clampSize(item: DashboardItem, deltaCols = 0, deltaRows = 0) {
  const minCol = item.minCol || baseCol
  const minRow = item.minRow || baseCol
  const nextCol = Math.min(sectorCols, Math.max(minCol, item.colSpan + deltaCols))
  const nextRow = Math.max(minRow, item.rowSpan + deltaRows)
  return { colSpan: nextCol, rowSpan: nextRow }
}
export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const [layout, setLayout] = useState<DashboardItem[]>(defaultLayout)
  const [editMode, setEditMode] = useState(false)
  const [counter, setCounter] = useState(0)

  const widgetRender: Record<DashboardItemType, () => React.ReactNode> = {
    stats1: () => <StatsCard title={t('activeProjects')} value="24" change={`+3 ${t('thisMonth')}`} icon={Building2} trend="up" />,
    stats2: () => <StatsCard title={t('availableUnits')} value="1,247" change={`+124 ${t('thisMonth')}`} icon={Home} trend="up" />,
    stats3: () => (
      <StatsCard title={t('avgPricePerM2')} value="$1,850" change={`+5.2% ${t('vsPreviousMonth')}`} icon={DollarSign} trend="up" />
    ),
    stats4: () => (
      <StatsCard title={t('avgAbsorption')} value="12.5%" change={`-2.1% ${t('vsPreviousMonth')}`} icon={TrendingUp} trend="down" />
    ),
    activity: () => <ActivityChart />,
    filters: () => <QuickFilters />,
    recent: () => <RecentProjects />,
    "proj-vs-units": () => (
      <StatsCard title={t('projectsVsUnits')} value="24 / 1,247" change={`+4 / +120 ${t('vsPreviousMonth')}`} icon={Layers} trend="up" />
    ),
    "period-compare": () => (
      <StatsCard title={t('periodCompare')} value="+8.4%" change="QoQ" icon={LineChart} trend="up" />
    ),
    heatmap: () => <StatsCard title={t('heatmap')} value="Zonas clave: 5" change="GT datos mock" icon={Map} trend="up" />,
    "top-absorption": () => (
      <StatsCard title={t('topAbsorption')} value="Residencial" change="2.1% mes" icon={Flame} trend="up" />
    ),
    pipeline: () => <StatsCard title={t('pipeline')} value="Planning 12 / Const 8" change="Funnel dummy" icon={BarChart3} trend="up" />,
  }

  const resetLayout = () => setLayout(defaultLayout)

  const addWidget = (type: DashboardItemType) => {
    if (!editMode) return
    const id = `${type}-${Date.now()}-${counter}`
    setCounter((c) => c + 1)
    setLayout((items) => [
      ...items,
      {
        id,
        type,
        colSpan: 2,
        rowSpan: 2,
        minCol: 2,
        minRow: 2,
      },
    ])
  }

  const deleteWidget = (id: DashboardItemId) => {
    setLayout((items) => items.filter((it) => it.id !== id))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>
        <div className="flex gap-2 flex-wrap">
          {editMode ? (
            <Button variant="secondary" size="sm" onClick={() => setEditMode(false)}>
              <Check className="w-4 h-4 mr-2" />
              {t('save')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              {t('edit')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!editMode}>
                <Plus className="w-4 h-4 mr-2" />
                {t('newWidget')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('addWidget')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => addWidget("proj-vs-units")}>{t('projectsVsUnitsTime')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addWidget("period-compare")}>{t('periodCompare')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addWidget("heatmap")}>{t('heatmap')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addWidget("top-absorption")}>{t('topAbsorption')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addWidget("pipeline")}>{t('pipeline')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={resetLayout} disabled={!editMode}>
            <Wand2 className="w-4 h-4 mr-2" />
            {t('magicAdjust')}
          </Button>
        </div>
      </div>

      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gridAutoRows: `${cellHeight}px`,
          gridAutoFlow: "dense",
        }}
      >
        {layout.map((item) => (
          <div
            key={item.id}
            style={{ gridColumn: `span ${Math.min(sectorCols, item.colSpan)}`, gridRow: `span ${item.rowSpan}` }}
            className="relative h-full w-full rounded-lg border border-border bg-card shadow-sm"
          >
            {editMode && (
              <button
                type="button"
                onClick={() => deleteWidget(item.id)}
                className="absolute top-2 right-2 h-8 w-8 rounded-md border border-border bg-muted/80 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors flex items-center justify-center z-10"
                aria-label={t('deleteWidget')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <div className={`h-full w-full ${editMode ? "p-4 pt-10" : "p-4"}`}>
              {widgetRender[item.type] ? widgetRender[item.type]() : <div className="p-4">Widget</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
