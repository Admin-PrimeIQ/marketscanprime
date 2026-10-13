import { Badge } from "@/components/ui/badge"
import { countryFlag } from "@/lib/region"

export interface CountryLike {
  name?: string | null
  isoCode2?: string | null
  code?: string | null
}

/**
 * Pill/tag de país: bandera (emoji) + nombre. Reusable en tablas y vistas
 * (projects, blocks, units…) para detectar el país de un vistazo.
 * Devuelve null si no hay país.
 */
export function CountryPill({
  country,
  className,
}: {
  country?: CountryLike | null
  className?: string
}) {
  if (!country?.name) return null
  const flag = countryFlag(country.isoCode2 || country.code)
  return (
    <Badge variant="outline" className={`gap-1 font-normal ${className ?? ""}`}>
      {flag && <span aria-hidden="true">{flag}</span>}
      {country.name}
    </Badge>
  )
}
