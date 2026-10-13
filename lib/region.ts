export type BlockRegion = 'GAM' | 'Interior' | 'Desconocido'

export const GAM_QUARTERS = ['T1', 'T2', 'T3', 'T4'] as const
export const INTERIOR_QUARTERS = ['S1', 'S2'] as const

export function getBlockRegion(quarter?: string | null): BlockRegion {
  if (!quarter) return 'Desconocido'
  if ((GAM_QUARTERS as readonly string[]).includes(quarter)) return 'GAM'
  if ((INTERIOR_QUARTERS as readonly string[]).includes(quarter)) return 'Interior'
  return 'Desconocido'
}

export function getProjectRegions(blocks?: Array<{ quarter?: string | null }>): BlockRegion[] {
  if (!blocks || blocks.length === 0) return ['Desconocido']
  const regions = new Set<BlockRegion>()
  for (const block of blocks) {
    regions.add(getBlockRegion(block.quarter))
  }
  return Array.from(regions)
}

/** Convierte un ISO 3166-1 alpha-2 (ej. "CR", "SV") a emoji de bandera. Vacío si no es válido. */
export function countryFlag(iso2?: string | null): string {
  if (!iso2 || iso2.length !== 2) return ''
  const base = 0x1f1e6 // 🇦
  const a = iso2.toUpperCase().charCodeAt(0) - 65
  const b = iso2.toUpperCase().charCodeAt(1) - 65
  if (a < 0 || a > 25 || b < 0 || b > 25) return ''
  return String.fromCodePoint(base + a, base + b)
}

export const REGION_BADGE_CLASS: Record<BlockRegion, string> = {
  GAM: 'bg-blue-600 text-white hover:bg-blue-700',
  Interior: 'bg-orange-500 text-white hover:bg-orange-600',
  Desconocido: 'bg-muted text-muted-foreground border border-border',
}
