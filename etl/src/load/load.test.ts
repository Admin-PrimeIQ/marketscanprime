import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { draft, fixture, published } from "./fixtures"
import { cents, date, float, numeric, timestamp } from "./normalize"
import { transform } from "./transform"
import { validate } from "./validate"

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

describe("incidencias", () => {
  test("unidad sin bloque bloquea la carga", () => {
    const s = fixture()
    s.tables.units_block_lnk = s.tables.units_block_lnk.filter((l) => l.unit_id !== 41)
    const result = validate(s)
    assert.deepEqual(result.blocking.map((i) => [i.category, i.documentId]), [["unidad-sin-bloque", "unit-2"]])
  })
  test("--allow excluye solo la fila afectada", () => {
    const s = fixture()
    s.tables.units_block_lnk = s.tables.units_block_lnk.filter((l) => l.unit_id !== 41)
    const result = validate(s, new Set(["unidad-sin-bloque"]))
    assert.deepEqual(result.blocking, [])
    assert.deepEqual(result.exclusions.map((e) => e.documentId), ["unit-2"])
    assert.deepEqual(transform(result.resolved).unit.map((u) => u.public_id), ["unit-1"])
  })
  test("--allow excluye en cascada: bloque sin proyecto se lleva sus unidades", () => {
    const s = fixture()
    s.tables.blocks_project_lnk = []
    const result = validate(s, new Set(["bloque-sin-proyecto"]))
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
  test("code duplicado", () => {
    const s = fixture()
    s.tables.units[1].code = "U-001"
    assert.deepEqual(categories(s), ["codigo-duplicado", "codigo-duplicado"])
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
