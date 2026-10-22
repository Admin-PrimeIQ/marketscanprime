import type { BlockRegion } from './domain/region.ts'

// La regla GAM / Interior vive en lib/domain/region.ts (pura, sin UI); acá quedan
// la bandera y los colores, y se reexporta la regla para no romper importadores.
export { GAM_QUARTERS, INTERIOR_QUARTERS, getBlockRegion, getProjectRegions } from './domain/region.ts'
export type { BlockRegion } from './domain/region.ts'

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
