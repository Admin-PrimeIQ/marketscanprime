import { parseDmy } from "../../../lib/domain/exchange-rates/dates.ts"

/**
 * GET público del workflow «Banguat Exchange Rate» de n8n: la única llamada a n8n que permite la
 * skill proteger-produccion. Solo se usa para comparar; nunca como fuente de la tabla.
 *
 * Pagina con `page` y `size` (verificado el 29 oct 2026). Los `page[number]`/`page[size]` que
 * documenta el manual y que el propio webhook pone en `links` se ignoran: siempre devuelven la
 * página 1 con 10 filas.
 */
const DEFAULT_URL = "https://n8n.primeiqlatam.com/webhook/primeiq/exchange-rates"
const PAUSE_MS = 1_000

export type N8nRate = { date: string; buy: number | null; sell: number | null; referenceRate: number | null; currency: string; unit: string }

type Envelope = {
  data?: { id?: string; attributes?: { date?: string; buy?: number | null; sell?: number | null; referenceRate?: number | null; currency?: string; unit?: string } }[]
  meta?: { totalRecords?: number; pageCount?: number; pageNumber?: number; pageSize?: number }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getPage(base: string, page: number, size: number): Promise<Envelope> {
  const url = `${base}?page=${page}&size=${size}`
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`n8n HTTP ${res.status}`)
      return (await res.json()) as Envelope
    } catch (error) {
      if (attempt >= 3) throw new Error(`n8n página ${page}: ${(error as Error).message}`)
      await sleep(PAUSE_MS * 2 * attempt)
    }
  }
}

/** Todo el histórico que sirve n8n, con una pausa entre páginas. */
export async function fetchN8nHistory(size = 100, log: (msg: string) => void = console.log): Promise<{ rates: N8nRate[]; totalRecords: number }> {
  const base = process.env.EXCHANGE_RATES_WEBHOOK_URL?.trim() || DEFAULT_URL
  const rates: N8nRate[] = []
  let totalRecords = 0
  let pageCount = 1
  for (let page = 1; page <= pageCount; page++) {
    if (page > 1) await sleep(PAUSE_MS)
    const body = await getPage(base, page, size)
    const meta = body.meta ?? {}
    if (meta.pageNumber !== page || meta.pageSize !== size) {
      throw new Error(`n8n no respetó la paginación: pedí página ${page} de ${size} y respondió página ${meta.pageNumber} de ${meta.pageSize}`)
    }
    totalRecords = meta.totalRecords ?? 0
    pageCount = meta.pageCount ?? 0
    for (const item of body.data ?? []) {
      const a = item.attributes ?? {}
      if (!a.date) throw new Error(`n8n: fila sin fecha en la página ${page}`)
      rates.push({
        date: parseDmy(a.date),
        buy: a.buy ?? null,
        sell: a.sell ?? null,
        referenceRate: a.referenceRate ?? null,
        currency: a.currency ?? "USD",
        unit: a.unit ?? "GTQ",
      })
    }
    if (page === 1 || page % 10 === 0 || page === pageCount) log(`  n8n: página ${page}/${pageCount} (${rates.length} de ${totalRecords})`)
  }
  return { rates, totalRecords }
}
