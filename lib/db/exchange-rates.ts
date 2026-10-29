import "server-only"

import type { ExchangeRateComparison } from "@/lib/exchange-rates"
import { getAppPrisma } from "./client"
import { toExchangeRateComparison } from "./exchange-rate-mapping"

/**
 * Tipo de cambio de la barra lateral desde `msp_app.exchange_rate` (backend `prisma`). La tabla
 * la llena `etl/src/exchange-rates` desde Banguat. `null` si está vacía. Quien llama ya validó la
 * sesión (`requireUser` en la ruta).
 */
export async function getLatestExchangeRateComparison(): Promise<ExchangeRateComparison | null> {
  const rows = await getAppPrisma().exchangeRate.findMany({
    where: { currency: "USD" },
    orderBy: { date: "desc" },
    take: 2,
  })
  return toExchangeRateComparison(rows)
}
