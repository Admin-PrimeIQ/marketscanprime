import { Prisma } from "../../generated/strapi/client"
import { createStrapiClient } from "./client"

/**
 * Verificación de SOLO LECTURA del esquema Prisma contra la base real de Strapi.
 *
 * Por cada modelo: count() y findFirst() (que selecciona todas las columnas declaradas, así
 * que falla si alguna no existe o tiene otro tipo). Compara el conteo con el inventario del
 * manual (docs/manual-del-sistema.md, «Tablas de la base strapi»); una diferencia no es error,
 * la base sigue viva. Al final revisa si hay document_id repetidos (borrador + publicado).
 */

// Conteos del inventario del manual; sirven de referencia, no de aserción.
const EXPECTED_ROWS: Record<string, number> = {
  amenities: 85,
  block_categories: 7,
  block_focuses: 15,
  block_statuses: 10,
  countries: 2,
  developers: 537,
  nses: 15,
  security_types: 9,
  services: 18,
  unit_parking_types: 5,
  unit_topographies: 12,
  unit_usages: 2,
  projects: 1115,
  projects_amenities_lnk: 5647,
  projects_country_lnk: 1113,
  projects_developer_lnk: 1062,
  projects_exchange_rate_profile_lnk: 929,
  projects_nse_lnk: 896,
  projects_security_type_lnk: 750,
  services_projects_lnk: 6252,
  blocks: 1693,
  blocks_project_lnk: 1691,
  blocks_block_category_lnk: 1693,
  blocks_block_focus_lnk: 1572,
  blocks_block_status_lnk: 1650,
  blocks_cmps: 798,
  components_financing_financings: 798,
  components_financing_financings_cmps: 1388,
  components_financing_bank_rates: 1388,
  exchange_rate_profiles: 2,
  exchange_rate_profiles_cmps: 2,
  components_currencies_currencies: 5,
  components_currencies_currencies_cmps: 6,
  components_currencies_currency_quetzals: 5,
  components_currencies_currency_peso_mexicanos: 1,
  components_currencies_currency_balboas: 0,
  components_currencies_currency_belizes: 0,
  components_currencies_currency_colon_costarricenses: 0,
  components_currencies_currency_cordobas: 0,
  components_currencies_currency_lempiras: 0,
  units: 238177,
  units_block_lnk: 237504,
  units_unit_usage_lnk: 234109,
  units_topography_lnk: 137474,
  units_parking_type_lnk: 73877,
  units_cmps: 130324,
  components_unit_types_housings: 126809,
  components_unit_types_offices: 1130,
  components_unit_types_industrials: 2548,
  up_roles: 6,
  up_users: 17,
  up_users_role_lnk: 17,
}

// Colecciones con document_id; en Strapi v5 un documento publicado tiene dos filas.
const DOCUMENT_TABLES = ["projects", "blocks", "units", "developers", "exchange_rate_profiles"] as const

type ReadDelegate = {
  count: () => Promise<number>
  findFirst: () => Promise<unknown>
}

async function main() {
  const prisma = createStrapiClient()
  let failures = 0

  try {
    console.log("tabla".padEnd(52), "filas".padStart(9), "manual".padStart(9), " estado")
    for (const [model, expected] of Object.entries(EXPECTED_ROWS)) {
      const delegate = (prisma as unknown as Record<string, ReadDelegate>)[model]
      try {
        const rows = await delegate.count()
        await delegate.findFirst()
        const status = rows === expected ? "ok" : `difiere (${rows - expected > 0 ? "+" : ""}${rows - expected})`
        console.log(model.padEnd(52), String(rows).padStart(9), String(expected).padStart(9), "", status)
      } catch (error) {
        failures++
        console.log(model.padEnd(52), "ERROR".padStart(9), String(expected).padStart(9), "", (error as Error).message.split("\n").at(-1))
      }
    }

    console.log("\ndocument_id repetidos (borrador + publicado):")
    for (const table of DOCUMENT_TABLES) {
      const [row] = await prisma.$queryRaw<{ documents: bigint | number; drafts: bigint | number }[]>(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM (SELECT document_id FROM ${Prisma.raw(table)} GROUP BY document_id HAVING COUNT(*) > 1) d) AS documents,
          (SELECT COUNT(*) FROM ${Prisma.raw(table)} WHERE published_at IS NULL) AS drafts
      `)
      console.log(`  ${table}: ${Number(row.documents)} documentos con más de una fila, ${Number(row.drafts)} filas sin published_at`)
    }
  } finally {
    await prisma.$disconnect()
  }

  if (failures > 0) {
    console.error(`\n${failures} modelo(s) no coinciden con la base. Compara con: npm run strapi:pull:print`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
