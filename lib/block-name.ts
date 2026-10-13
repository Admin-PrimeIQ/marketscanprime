/**
 * Nombre visible de un bloque: "Proyecto - Fase X - Sector Y - Torre Z", sólo
 * con las partes que tienen valor.
 *
 * Es la MISMA regla que usa el sync con el warehouse
 * (`sync-database/scripts/strapi-prep/lib/strapi-display-names.js`). Si cambia
 * una, cambia la otra: dos reglas distintas renombrarían el bloque en cada
 * vuelta.
 */

/**
 * Una parte del nombre con su etiqueta: `withLabel("Fase", "3")` → "Fase 3".
 *
 * La etiqueta se antepone UNA vez aunque el valor ya la traiga. En los datos la
 * fase a veces dice "3" y a veces "Fase 3", y anteponer a ciegas producía
 * "Fase Fase 3". También limpia repeticiones que ya venían escritas.
 *
 * La etiqueta sólo cuenta como palabra entera: "Torreón" no empieza con "Torre".
 */
export function withLabel(label: string, value: string | null | undefined): string {
  if (value == null) return ''
  let v = String(value).trim()
  if (!v) return ''
  const repetida = new RegExp(`^${label}(?=\\s|$)\\s*`, 'i')
  while (repetida.test(v)) v = v.replace(repetida, '')
  return v ? `${label} ${v}` : label
}

export function buildBlockName(
  projectName: string | null | undefined,
  block: { phase?: string | null; sector?: string | null; tower?: string | null },
): string {
  return [
    projectName ? String(projectName).trim() : '',
    withLabel('Fase', block.phase),
    withLabel('Sector', block.sector),
    withLabel('Torre', block.tower),
  ]
    .filter(Boolean)
    .join(' - ')
}
