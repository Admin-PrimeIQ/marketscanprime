import { createStrapiClient } from "./client"

/**
 * Inventario de SOLO LECTURA: valores distintos (con su frecuencia) de las columnas que en el
 * esquema nuevo pasan a ser enums. Sirve para fijar los valores y detectar datos sucios antes
 * de la carga. Solo filas publicadas cuando la tabla tiene draft & publish.
 */

type Row = Record<string, unknown> & { _count: { _all: number } }

function print(title: string, rows: Row[], field: string) {
  console.log(`\n${title}`)
  const sorted = rows.toSorted((a, b) => b._count._all - a._count._all)
  for (const row of sorted) console.log(`  ${JSON.stringify(row[field] ?? null).padEnd(40)} ${row._count._all}`)
}

async function main() {
  const strapi = createStrapiClient()
  const published = { published_at: { not: null } }
  try {
    for (const field of ["quarter", "domain", "market", "block_usage"] as const) {
      const rows = await strapi.blocks.groupBy({ by: [field], where: published, _count: { _all: true } })
      print(`blocks.${field}`, rows as unknown as Row[], field)
    }
    const availability = await strapi.units.groupBy({ by: ["availability"], where: published, _count: { _all: true } })
    print("units.availability", availability as unknown as Row[], "availability")

    for (const field of [
      "office_classification",
      "general_size_classification",
      "employee_capacity_range",
      "m_2_range",
    ] as const) {
      const rows = await strapi.components_unit_types_offices.groupBy({ by: [field], _count: { _all: true } })
      print(`offices.${field}`, rows as unknown as Row[], field)
    }
    const quality = await strapi.components_unit_types_industrials.groupBy({
      by: ["quality_classification"],
      _count: { _all: true },
    })
    print("industrials.quality_classification", quality as unknown as Row[], "quality_classification")

    const unitTypes = await strapi.units_cmps.groupBy({ by: ["component_type", "field"], _count: { _all: true } })
    print("units_cmps.component_type", unitTypes as unknown as Row[], "component_type")
    const banks = await strapi.components_financing_financings_cmps.groupBy({ by: ["field"], _count: { _all: true } })
    print("financing_cmps.field (bancos)", banks as unknown as Row[], "field")
    const currencies = await strapi.components_currencies_currencies_cmps.groupBy({ by: ["field"], _count: { _all: true } })
    print("currencies_cmps.field (monedas)", currencies as unknown as Row[], "field")
    const blockCmps = await strapi.blocks_cmps.groupBy({ by: ["component_type", "field"], _count: { _all: true } })
    print("blocks_cmps.component_type", blockCmps as unknown as Row[], "component_type")
    const roles = await strapi.up_roles.groupBy({ by: ["type"], _count: { _all: true } })
    print("up_roles.type", roles as unknown as Row[], "type")
    const providers = await strapi.up_users.groupBy({ by: ["provider"], _count: { _all: true } })
    print("up_users.provider", providers as unknown as Row[], "provider")
  } finally {
    await strapi.$disconnect()
  }
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
