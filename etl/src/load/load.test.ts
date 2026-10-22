import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { draft, fixture, published } from "./fixtures"
import { checkUnits, FORMULA_COLUMNS, formulaCsv, formulaDiffs, summarizeFormulas, type FormulaField, type UnitCheck } from "./formulas"
import { cents, date, float, numeric, timestamp } from "./normalize"
import { snapshotCountMismatches, STRAPI_TABLES } from "./snapshot"
import { APP_LOCAL_PREFIX, mirroredRows, mirroredScope, SPEC_BY_TABLE, SPECS, type AppTable } from "./specs"
import { transform } from "./transform"
import { validate } from "./validate"
import { massDeletions, type TableStats } from "./write"

const categories = (snapshot = fixture(), allowed: string[] = []) => validate(snapshot, new Set(allowed)).issues.map((i) => i.category)

describe("normalización", () => {
  test("numeric quita ceros sobrantes y no acepta exponentes", () => {
    assert.equal(numeric("12.5000"), "12.5")
    assert.equal(numeric("-0.00"), "0")
    assert.equal(numeric("007.10"), "7.1")
    assert.equal(numeric(null), null)
    assert.throws(() => numeric("1e-7"))
  })
  test("float compara por número", () => {
    assert.equal(float("1e-07"), float(1e-7))
    assert.equal(float(2), "2")
  })
  test("cents suma exacto", () => {
    assert.equal(cents("100000.50") + cents("200000.25"), 30000075n)
    assert.equal(cents("-1.5"), -150n)
  })
  test("fechas e instantes", () => {
    assert.equal(date("2026-09-15T00:00:00.000Z"), "2026-09-15")
    assert.equal(timestamp("2026-10-01T12:00:00Z"), "2026-10-01T12:00:00.000Z")
  })
})

describe("camino feliz", () => {
  const result = validate(fixture())
  const data = transform(result.resolved)

  test("sin incidencias", () => {
    assert.deepEqual(result.issues, [])
    assert.deepEqual(result.exclusions, [])
  })
  test("relaciones por public_id del padre", () => {
    assert.equal(data.project[0].country_id, "country-gt")
    assert.equal(data.project[0].exchange_rate_profile_id, "profile-gt")
    assert.equal(data.block[0].project_id, "project-1")
    assert.deepEqual(data.unit.map((u) => u.block_id), ["block-1", "block-1"])
    assert.deepEqual(data.project_amenity, [{ project_id: "project-1", amenity_id: "amenity-pool", sort_order: "1" }])
  })
  test("columnas renombradas y normalizadas", () => {
    assert.equal(data.block[0].total_m2, "1500")
    assert.equal(data.block[0].collection_date, "2026-09-15")
    assert.equal(data.unit[0].unit_size_m2, "85.5")
    assert.equal(data.project[0].latitude, "14.6")
    assert.equal(data.project[0].muvi, "true")
  })
  test("zona dinámica: tipo y fila hija", () => {
    assert.equal(data.unit[0].kind, "housing")
    assert.equal(data.unit[1].kind, null)
    assert.deepEqual(data.unit_housing, [{ unit_id: "unit-1", bedrooms: "3", balcony_terrace_size_m2: "5.5" }])
  })
  test("financiamiento, monedas y usuario", () => {
    assert.equal(data.block_financing[0].down_payment_percent, "10")
    assert.deepEqual(data.block_bank_rate, [{ block_id: "block-1", bank: "bi", annual_rate_percent: "7.5" }])
    assert.deepEqual(data.exchange_rate_profile_currency, [{ profile_id: "profile-gt", currency: "GTQ", buy_rate: "7.75", sell_rate: "7.8" }])
    assert.equal(data.user[0].role, "administrator")
    assert.equal(data.user[0].blocked, "false")
    assert.equal(data.user[0].password_hash, "$2a$10$hash")
  })
  test("cuenta credential de Better Auth con el hash de Strapi", () => {
    assert.deepEqual(
      data.account.map(({ user_id, account_id, provider_id, password }) => ({ user_id, account_id, provider_id, password })),
      [{ user_id: "user-ana", account_id: "user-ana", provider_id: "credential", password: "$2a$10$hash" }],
    )
    assert.equal(data.account[0].updated_at, data.user[0].updated_at)
  })
  test("sin cuenta si el usuario no es local o no tiene clave", () => {
    const s = fixture()
    s.tables.up_users.push(
      published(71, "user-sso", { username: "sso", email: "sso@example.com", password: null, provider: "google", confirmed: true, blocked: null }),
      published(72, "user-nopass", { username: "nopass", email: "nopass@example.com", password: null, provider: "local", confirmed: true, blocked: null }),
    )
    assert.deepEqual(transform(validate(s).resolved).account.map((a) => a.user_id), ["user-ana"])
  })
})

describe("draft & publish", () => {
  test("se toma la fila publicada y se ignoran los vínculos del borrador", () => {
    const s = fixture()
    s.tables.blocks.push(draft(31, "block-1", { code: "B-001-DRAFT", name: "Borrador", domain: "office" }))
    s.tables.blocks_project_lnk.push({ id: 2, block_id: 31, project_id: 10 })
    const result = validate(s)
    assert.deepEqual(result.issues, [])
    assert.equal(result.ignoredLinks.blocks_project_lnk, 1)
    assert.equal(transform(result.resolved).block[0].name, "Torre A")
  })
  test("documento solo en borrador", () => {
    const s = fixture()
    s.tables.amenities.push(draft(21, "amenity-gym", { name: "Gimnasio" }))
    assert.deepEqual(categories(s), ["sin-publicar"])
  })
  test("dos filas publicadas con el mismo document_id", () => {
    const s = fixture()
    s.tables.countries.push(published(2, "country-gt", { name: "Guatemala 2", iso_code: "GTX", iso_code_2: "GX" }))
    assert.ok(categories(s).includes("documento-duplicado"))
  })
})

describe("padres «No definido»", () => {
  test("unidad sin bloque: advierte y va al bloque «No definido» de su tipo", () => {
    const s = fixture()
    s.tables.units_block_lnk = []
    s.tables.units_cmps[0].component_type = "unit-types.offices"
    s.tables.components_unit_types_offices = [{ id: 1, employee_capacity: 10 }]
    s.tables.blocks[0].domain = "office"
    const result = validate(s)
    assert.deepEqual(result.blocking, [])
    assert.deepEqual(result.issues.map((i) => [i.category, i.severity, i.documentId]), [
      ["unidad-sin-bloque", "warning", "unit-1"],
      ["unidad-sin-bloque", "warning", "unit-2"],
    ])
    const data = transform(result.resolved)
    assert.deepEqual(data.unit.map((u) => u.block_id), ["etl-no-definido-office", "etl-no-definido-housing"])
    const placeholders = data.block.filter((b) => b.public_id!.startsWith("etl-"))
    assert.deepEqual(placeholders.map((b) => [b.public_id, b.name, b.domain, b.project_id, b.code]), [
      ["etl-no-definido-housing", "No definido", "housing", "etl-no-definido", null],
      ["etl-no-definido-office", "No definido", "office", "etl-no-definido", null],
    ])
    const project = data.project.find((p) => p.public_id === "etl-no-definido")!
    assert.equal(project.name, "No definido")
    assert.equal(project.country_id, null)
  })
  test("bloque sin proyecto: advierte y va al proyecto «No definido» con sus unidades", () => {
    const s = fixture()
    s.tables.blocks_project_lnk = []
    const result = validate(s)
    assert.deepEqual(result.issues.map((i) => [i.category, i.severity]), [["bloque-sin-proyecto", "warning"]])
    const data = transform(result.resolved)
    assert.equal(data.block[0].project_id, "etl-no-definido")
    assert.equal(data.unit.length, 2)
    assert.deepEqual(data.project.map((p) => p.public_id), ["project-1", "etl-no-definido"])
  })
  test("sin huérfanos no se crean padres «No definido»", () => {
    const data = transform(validate(fixture()).resolved)
    assert.ok(!data.block.some((b) => b.public_id!.startsWith("etl-")))
    assert.ok(!data.project.some((p) => p.public_id!.startsWith("etl-")))
  })
})

describe("incidencias", () => {
  test("--allow excluye solo la fila afectada", () => {
    const s = fixture()
    s.tables.units_unit_usage_lnk = [{ id: 1, unit_id: 41, unit_usage_id: 999 }]
    assert.deepEqual(validate(s).blocking.map((i) => [i.category, i.documentId]), [["relacion-rota", "unit-2"]])
    const result = validate(s, new Set(["relacion-rota"]))
    assert.deepEqual(result.blocking, [])
    assert.deepEqual(result.exclusions.map((e) => e.documentId), ["unit-2"])
    assert.deepEqual(transform(result.resolved).unit.map((u) => u.public_id), ["unit-1"])
  })
  test("--allow excluye en cascada: un bloque excluido se lleva sus unidades", () => {
    const s = fixture()
    s.tables.blocks_block_category_lnk = [{ id: 1, block_id: 30, block_category_id: 999 }]
    const result = validate(s, new Set(["relacion-rota"]))
    assert.deepEqual(result.exclusions.map((e) => [e.table, e.documentId]).sort(), [
      ["blocks", "block-1"],
      ["units", "unit-1"],
      ["units", "unit-2"],
    ])
    const data = transform(result.resolved)
    assert.equal(data.block.length, 0)
    assert.equal(data.unit.length, 0)
    assert.equal(data.unit_housing.length, 0)
    assert.equal(data.block_bank_rate.length, 0)
  })
  test("--allow en un catálogo excluye el proyecto y todo lo de abajo", () => {
    const s = fixture()
    s.tables.amenities[0].name = null
    const result = validate(s, new Set(["campo-obligatorio-vacio"]))
    const data = transform(result.resolved)
    assert.deepEqual([data.amenity.length, data.project.length, data.block.length, data.unit.length], [0, 0, 0, 0])
    assert.equal(data.country.length, 1)
  })
  test("relación rota: vínculo a una fila inexistente", () => {
    const s = fixture()
    s.tables.units_unit_usage_lnk = [{ id: 1, unit_id: 40, unit_usage_id: 999 }]
    assert.deepEqual(categories(s), ["relacion-rota"])
  })
  test("relación ambigua: unidad en dos bloques", () => {
    const s = fixture()
    s.tables.blocks.push(published(32, "block-2", { code: "B-002", name: "Torre B", domain: "housing" }))
    s.tables.blocks_project_lnk.push({ id: 3, block_id: 32, project_id: 10 })
    s.tables.units_block_lnk.push({ id: 3, unit_id: 40, block_id: 32 })
    assert.ok(categories(s).includes("relacion-ambigua"))
  })
  test("vínculo repetido al mismo destino no es ambiguo", () => {
    const s = fixture()
    s.tables.units_block_lnk.push({ id: 3, unit_id: 40, block_id: 30 })
    assert.deepEqual(categories(s), [])
  })
  test("code duplicado: advierte y todas las copias se cargan con code vacío", () => {
    const s = fixture()
    s.tables.units[1].code = "U-001"
    const result = validate(s)
    assert.deepEqual(result.issues.map((i) => [i.category, i.severity]), [
      ["codigo-duplicado", "warning"],
      ["codigo-duplicado", "warning"],
    ])
    assert.deepEqual(transform(result.resolved).unit.map((u) => u.code), [null, null])
  })
  test("code de bloque duplicado", () => {
    const s = fixture()
    s.tables.blocks.push(published(32, "block-2", { code: "B-001", name: "Torre B", domain: "housing" }))
    s.tables.blocks_project_lnk.push({ id: 3, block_id: 32, project_id: 10 })
    const data = transform(validate(s).resolved)
    assert.deepEqual(data.block.map((b) => b.code), [null, null])
    assert.deepEqual(data.unit.map((u) => u.code), ["U-001", "U-002"])
  })
  test("enum desconocido", () => {
    const s = fixture()
    s.tables.blocks[0].quarter = "T9"
    assert.deepEqual(categories(s), ["enum-desconocido"])
  })
  test("bloque sin domain", () => {
    const s = fixture()
    s.tables.blocks[0].domain = null
    assert.deepEqual(categories(s), ["campo-obligatorio-vacio"])
  })
  test("rol que no existe en el esquema nuevo", () => {
    const s = fixture()
    s.tables.up_roles[0].type = "public"
    assert.deepEqual(categories(s), ["rol-invalido"])
  })
  test("usuario duplicado por email", () => {
    const s = fixture()
    s.tables.up_users.push(published(71, "user-bob", { username: "bob", email: "ana@example.com" }))
    s.tables.up_users_role_lnk.push({ id: 2, user_id: 71, role_id: 60 })
    assert.deepEqual(categories(s), ["usuario-duplicado", "usuario-duplicado"])
  })
  test("unitType múltiple", () => {
    const s = fixture()
    s.tables.units_cmps.push({ id: 2, entity_id: 40, cmp_id: 2, component_type: "unit-types.housing", field: "unitType", order: 2 })
    s.tables.components_unit_types_housings.push({ id: 2, bedrooms: 2 })
    assert.deepEqual(categories(s), ["tipo-unidad-multiple"])
  })
  test("unitType a un componente inexistente", () => {
    const s = fixture()
    s.tables.units_cmps[0].cmp_id = 99
    assert.deepEqual(categories(s), ["tipo-unidad-roto"])
  })
  test("tipo de unidad distinto al domain del bloque solo advierte", () => {
    const s = fixture()
    s.tables.blocks[0].domain = "office"
    const result = validate(s)
    assert.deepEqual(result.issues.map((i) => [i.category, i.severity]), [["tipo-unidad-distinto-al-bloque", "warning"]])
    assert.deepEqual(result.blocking, [])
    assert.equal(transform(result.resolved).unit.length, 2)
  })
  test("banco desconocido en el financiamiento", () => {
    const s = fixture()
    s.tables.components_financing_financings_cmps[0].field = "banco-x"
    assert.deepEqual(categories(s), ["financiamiento-roto"])
  })
  test("moneda desconocida en el perfil", () => {
    const s = fixture()
    s.tables.components_currencies_currencies_cmps[0].field = "eur"
    assert.deepEqual(categories(s), ["moneda-rota"])
  })
  test("componente que el ETL no sabe migrar", () => {
    const s = fixture()
    s.tables.blocks_cmps.push({ id: 2, entity_id: 30, cmp_id: 1, component_type: "otro.componente", field: "x", order: 2 })
    assert.deepEqual(categories(s), ["componente-desconocido"])
  })
})

describe("integridad del snapshot", () => {
  const withCounts = () => {
    const s = fixture()
    s.meta.counts = Object.fromEntries(STRAPI_TABLES.map((t) => [t, s.tables[t].length]))
    return s
  }
  test("conteos de meta.json iguales a las filas", () => {
    assert.deepEqual(snapshotCountMismatches(withCounts()), [])
  })
  test("archivo truncado", () => {
    const s = withCounts()
    s.tables.units.pop()
    assert.deepEqual(snapshotCountMismatches(s), ["units: meta.json dice 2 filas y el archivo tiene 1"])
  })
  test("tabla sin conteo en meta.json", () => {
    const s = withCounts()
    delete s.meta.counts.countries
    assert.deepEqual(snapshotCountMismatches(s), ["countries: meta.json no registra su conteo (hay 1 filas)"])
  })
})

describe("freno al borrado masivo", () => {
  const stats = (overrides: Partial<Record<AppTable, Partial<TableStats>>>) =>
    Object.fromEntries(
      SPECS.map((s) => [s.table, { expected: 0, inserted: 0, updated: 0, deleted: 0, ...overrides[s.table] }]),
    ) as Record<AppTable, TableStats>

  test("refresco normal: unos cientos de unidades borradas no frenan", () => {
    assert.deepEqual(massDeletions(stats({ unit: { expected: 238_000, inserted: 300, deleted: 654 } })), [])
  })
  test("más del 5 % y más de 50 filas frena", () => {
    assert.deepEqual(massDeletions(stats({ unit: { expected: 200_000, deleted: 38_000 } })), [
      { table: "unit", before: 238_000, deleted: 38_000 },
    ])
  })
  test("tabla pequeña: pocas filas borradas no frenan aunque sean más del 5 %", () => {
    assert.deepEqual(massDeletions(stats({ amenity: { expected: 80, deleted: 5 } })), [])
  })
  test("tabla que queda vacía frena aunque sea pequeña", () => {
    assert.deepEqual(massDeletions(stats({ country: { expected: 0, deleted: 2 } })), [
      { table: "country", before: 2, deleted: 2 },
    ])
  })
  test("primera carga sobre msp_app vacía no frena", () => {
    assert.deepEqual(massDeletions(stats({ unit: { expected: 238_000, inserted: 238_000 } })), [])
  })
})

describe("cuentas propias de la app nueva", () => {
  test("el espejo deja fuera los usuarios con public_id app-…", () => {
    assert.equal(mirroredRows(SPEC_BY_TABLE.user, "t.public_id"), `t.public_id NOT LIKE '${APP_LOCAL_PREFIX}%'`)
  })
  test("las demás tablas son espejo completo", () => {
    for (const spec of SPECS.filter((s) => s.table !== "user")) assert.equal(mirroredRows(spec), "TRUE")
  })
  test("las cuentas de usuarios app-… tampoco son espejo (heredan del padre)", () => {
    assert.equal(mirroredScope(SPEC_BY_TABLE.account, "j0.public_id"), `j0.public_id NOT LIKE '${APP_LOCAL_PREFIX}%'`)
    assert.equal(mirroredScope(SPEC_BY_TABLE.unit_housing, "j0.public_id"), "TRUE")
  })
})

describe("reporte de fórmulas", () => {
  const appData = (snapshot = fixture()) => transform(validate(snapshot).resolved)
  const unitCheck = (checks: UnitCheck[], publicId: string) => checks.find((c) => c.unit.public_id === publicId)!
  const expected = (check: UnitCheck, field: string) => check.diffs.find((d) => d.field === field)?.expected
  const column = (field: string) => FORMULA_COLUMNS[field as FormulaField].column
  const withCategory = (data: ReturnType<typeof appData>, name: string) => {
    data.block_category.push({ public_id: "cat-1", code: null, name, description: null, created_at: null, updated_at: null })
    data.block[0].category_id = "cat-1"
    return data
  }

  test("nada calculado: el precio sin IVA sale como diferencia desde vacío", () => {
    const check = unitCheck(checkUnits(appData()), "unit-1")
    const diff = check.diffs.find((d) => d.field === "priceWithoutVATUSD")!
    assert.equal(diff.storedNull, true)
    assert.equal(diff.stored, 0)
    assert.ok(diff.expected > 0)
  })

  test("guardar lo recalculado deja la unidad limpia: las columnas mapean ida y vuelta", () => {
    const data = appData()
    for (const check of checkUnits(data)) {
      for (const d of check.diffs) check.unit[column(d.field)] = String(d.expected)
    }
    assert.deepEqual(checkUnits(data).flatMap((c) => c.diffs), [])
  })

  test("comparar no modifica las filas: la carga copia lo que trae Strapi", () => {
    const data = appData()
    const unit = data.unit.find((u) => u.public_id === "unit-1")!
    unit.price_without_vat_usd = "1"
    unit.installment_usd = "1"
    const before = structuredClone(data.unit)

    const checks = checkUnits(data)
    const fields = unitCheck(checks, "unit-1").diffs.map((d) => d.field)
    assert.ok(fields.includes("priceWithoutVATUSD") && fields.includes("installmentUSD"))
    assert.deepEqual(data.unit, before)

    const diffs = formulaDiffs(summarizeFormulas(checks, "prueba"))
    assert.ok(diffs.units >= 1)
    assert.ok((diffs.byField.priceWithoutVATUSD ?? 0) >= 1)
    assert.ok((diffs.byField.installmentUSD ?? 0) >= 1)
  })

  test("vertical suma el balcón de la fila hija al habitable", () => {
    assert.equal(expected(unitCheck(checkUnits(appData()), "unit-1"), "habitableConstructionM2"), 85.5)
    const vertical = unitCheck(checkUnits(withCategory(appData(), "Vivienda Vertical")), "unit-1")
    assert.equal(vertical.context?.isVertical, true)
    assert.equal(expected(vertical, "habitableConstructionM2"), 91)
  })

  test("bodegas: el tamaño es bodega + oficina + mezzanine", () => {
    const data = withCategory(appData(), "Bodegas")
    data.unit_housing = []
    data.unit_industrial.push({ unit_id: "unit-1", warehouse_storage_size_m2: "100", office_size_m2: "20", mezzanine_size_m2: "10" })
    const check = unitCheck(checkUnits(data), "unit-1")
    assert.equal(check.context?.industrialKind, "bodegas")
    assert.equal(expected(check, "unitSizeM2"), 130)
  })

  test("unidad en el bloque «No definido» queda sin contexto y no se compara", () => {
    const snapshot = fixture()
    snapshot.tables.units_block_lnk = snapshot.tables.units_block_lnk.filter((l) => l.unit_id !== 41)
    const checks = checkUnits(appData(snapshot))
    assert.equal(unitCheck(checks, "unit-2").context, null)
    assert.deepEqual(unitCheck(checks, "unit-2").diffs, [])
    const report = summarizeFormulas(checks, "fixture")
    assert.equal(report.units.withoutContext, 1)
    assert.equal(report.units.checked, 1)
  })

  test("resumen por campo, período y bloque; CSV con una fila por unidad con diferencias", () => {
    const checks = checkUnits(appData())
    const report = summarizeFormulas(checks, "fixture")
    assert.equal(report.units.checked, 2)
    assert.equal(report.units.withoutCategory, 2)
    assert.equal(report.units.withDiffs, 2)
    assert.equal(report.byField.priceWithoutVATUSD.units, 2)
    assert.equal(report.byField.priceWithoutVATUSD.examples[0].unitCode, "U-002")
    assert.deepEqual(
      report.byPeriod.map((p) => [p.period, p.domain, p.units, p.withDiffs]),
      [["T1", "housing", 2, 2]],
    )
    assert.equal(report.topBlocks[0].code, "B-001")

    const lines = formulaCsv(checks).trim().split("\n")
    assert.equal(lines.length, 3)
    assert.ok(lines[0].startsWith("unit,unit_code,block,block_code,period,domain,category,fields,"))
    assert.ok(lines[1].startsWith("unit-1,U-001,block-1,B-001,T1,housing,,"))
  })
})
