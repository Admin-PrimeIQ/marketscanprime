import type { StrapiUnitType } from "@/lib/api/strapi"

export type UnitTypeLabels = { residential: string; office: string; industrial: string }

export function emptyUnitTypeEntry(component: StrapiUnitType["__component"]): StrapiUnitType {
  return { __component: component }
}

export function getUnitTypeDisplayLabel(
  unit: { unitType?: StrapiUnitType[] | null },
  labels: UnitTypeLabels
): string {
  const first = unit.unitType?.[0]
  if (!first?.__component) return ""
  return componentToLabel(first.__component, labels)
}

export function componentToLabel(component: string, labels: UnitTypeLabels): string {
  if (component === "unit-types.housing") return labels.residential
  if (component === "unit-types.offices") return labels.office
  if (component === "unit-types.industrial") return labels.industrial
  /** Legacy UIDs (migrate datos viejos en memoria si vinieran del API antiguo) */
  if (component === "unit-types.residential") return labels.residential
  if (component === "unit-types.office") return labels.office
  return ""
}

export function labelToComponent(
  label: string,
  labels: UnitTypeLabels
): StrapiUnitType["__component"] | undefined {
  const t = label.trim()
  if (t === labels.residential) return "unit-types.housing"
  if (t === labels.office) return "unit-types.offices"
  if (t === labels.industrial) return "unit-types.industrial"
  return undefined
}

function normalizeDynamicZoneComponentUid(comp: unknown): unknown {
  if (comp === "unit-types.residential") return "unit-types.housing"
  if (comp === "unit-types.office") return "unit-types.offices"
  return comp
}

/** Body for Strapi `unitType` dynamic zone (one entry max in UI). */
export function formatUnitTypeForStrapi(value: unknown): unknown {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return value
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry
    const o = entry as Record<string, unknown>
    const comp = normalizeDynamicZoneComponentUid(o.__component)
    const out: Record<string, unknown> = { __component: comp }
    for (const [k, v] of Object.entries(o)) {
      if (k === "__component") continue
      /** Strapi v5 REST: `id` en componentes de dynamic zone provoca ValidationError al escribir. */
      if (k === "id") continue
      if (v === undefined) continue
      out[k] = v
    }
    return out
  })
}
