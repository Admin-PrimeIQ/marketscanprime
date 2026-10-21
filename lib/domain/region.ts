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
