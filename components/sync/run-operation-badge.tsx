"use client"

import { useTranslations } from "next-intl"
import { ArrowDownToLine, ArrowUpFromLine, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { SyncOperation } from "@/lib/sync/runs-api"

const OPERATION_STYLE = {
  push: {
    icon: ArrowUpFromLine,
    tone: "border-sky-500/40 text-sky-700 dark:text-sky-300",
    label: "operationPush",
    flow: "operationPushFlow",
  },
  pull: {
    icon: ArrowDownToLine,
    tone: "border-violet-500/40 text-violet-700 dark:text-violet-300",
    label: "operationPull",
    flow: "operationPullFlow",
  },
  // Rojo, y no un tono más del set: una purga borra en Strapi y no se parece a
  // las otras dos. El color es la primera lectura de la fila.
  purge: {
    icon: Trash2,
    tone: "border-red-500/50 text-red-700 dark:text-red-300",
    label: "operationPurge",
    flow: "operationPurgeFlow",
  },
} as const

/**
 * Qué hace la corrida.
 *
 * El valor viene del ledger, nunca del componente. Las corridas registradas
 * antes de la columna llegan como `push` desde arriba, que es lo que fueron —
 * así nada acá adivina, y el día que existan pull o purge estas insignias
 * siguen diciendo la verdad sobre las filas viejas.
 */
export function RunOperationBadge({
  operation,
  className,
}: {
  operation: SyncOperation
  className?: string
}) {
  const t = useTranslations("sync")
  const style = OPERATION_STYLE[operation] ?? OPERATION_STYLE.push
  const Icon = style.icon

  return (
    <Badge
      variant="outline"
      className={`gap-1 font-normal ${style.tone} ${className ?? ""}`}
      title={t(style.flow)}
    >
      <Icon className="size-3" />
      {t(style.label)}
    </Badge>
  )
}
