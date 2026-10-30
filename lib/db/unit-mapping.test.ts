import { test } from "node:test"
import assert from "node:assert/strict"
import { UNIT_OFFICE_CLASSIFICATION_VALUES, UNIT_OFFICE_EMPLOYEE_CAPACITY_RANGE_VALUES } from "../units/unit-type-dynamic-columns.ts"
import {
  INVALID_UNIT_PARAMS,
  toStrapiUnit,
  toUnitListResponse,
  toUnitType,
  UNIT_BLOCK_REQUIRED,
  UnitError,
  type UnitListRow,
} from "./unit-mapping.ts"
import { parseUnitListParams } from "./unit-schemas.ts"

const decimal = (value: string) => ({ toString: () => value })

const EMPTY_SCALARS = {
  code: null,
  name: null,
  legacyId: null,
  kind: null,
  unitNumber: null,
  model: null,
  availability: null,
  frontM2: null,
  depthM2: null,
  landM2: null,
  unitSizeM2: null,
  habitableConstructionM2: null,
  parkingSizeM2: null,
  totalSizeM2: null,
  bathrooms: null,
  hasParking: null,
  hasMotorcycleParking: null,
  parkingSpaces: null,
  totalPriceUsd: null,
  priceWithoutVatUsd: null,
  pricePerM2Usd: null,
  rentalPriceUsd: null,
  rentalPriceWithoutVatUsd: null,
  rentalPricePerM2WithoutVatUsd: null,
  maintenanceTotalPriceM2Usd: null,
  maintenancePricePerM2Usd: null,
  installmentUsd: null,
  incomeUsd: null,
  unitAbsorption: null,
  absorptionPerM2: null,
  usage: null,
  topography: null,
  parkingType: null,
  housing: null,
  office: null,
  industrial: null,
} satisfies Partial<UnitListRow>

function unitRow(overrides: Partial<UnitListRow> = {}): UnitListRow {
  return {
    id: 7,
    publicId: "unit-doc",
    ...EMPTY_SCALARS,
    createdAt: new Date("2026-01-02T03:04:05.678Z"),
    updatedAt: new Date("2026-02-03T04:05:06.789Z"),
    block: {
      id: 3,
      publicId: "block-doc",
      code: "torre-a",
      name: "Torre A",
      project: { id: 1, publicId: "project-doc", code: null, name: "Proyecto Uno" },
    },
    ...overrides,
  }
}

test("toStrapiUnit: escalares, decimales, relaciones, bloque con su proyecto y fechas con milisegundos", () => {
  const unit = toStrapiUnit(
    unitRow({
      code: "U-1",
      unitNumber: "101",
      availability: "Available",
      unitSizeM2: decimal("70.5000"),
      bathrooms: decimal("2.5"),
      hasParking: true,
      hasMotorcycleParking: false,
      parkingSpaces: 0,
      totalPriceUsd: decimal("150000.00"),
      priceWithoutVatUsd: decimal("133928.57"),
      unitAbsorption: decimal("0.123456789012"),
      usage: { id: 2, publicId: "usage-doc", code: "venta", name: "Venta", description: null },
      topography: { id: 4, publicId: "topo-doc", code: null, name: "Plano", description: null },
      parkingType: { id: 5, publicId: "parking-doc", code: "techado", name: "Techado", description: "Bajo techo" },
    }),
  )
  assert.deepEqual(unit, {
    id: 7,
    documentId: "unit-doc",
    code: "U-1",
    unitNumber: "101",
    availability: "Available",
    unitSizeM2: 70.5,
    bathrooms: 2.5,
    hasParking: true,
    hasMotorcycleParking: false,
    parkingSpaces: 0,
    totalPriceUSD: 150000,
    priceWithoutVATUSD: 133928.57,
    unitAbsorption: 0.123456789012,
    topography: { id: 4, documentId: "topo-doc", name: "Plano" },
    parkingType: { id: 5, documentId: "parking-doc", code: "techado", name: "Techado", description: "Bajo techo" },
    unitUsage: { id: 2, documentId: "usage-doc", code: "venta", name: "Venta" },
    unitType: [],
    block: {
      id: 3,
      documentId: "block-doc",
      code: "torre-a",
      name: "Torre A",
      project: { id: 1, documentId: "project-doc", name: "Proyecto Uno" },
    },
    createdAt: "2026-01-02T03:04:05.678Z",
    updatedAt: "2026-02-03T04:05:06.789Z",
  })
})

test("toStrapiUnit: availability vuelve con el valor guardado, no con el nombre del enumerado de Prisma", () => {
  assert.equal(toStrapiUnit(unitRow({ availability: "Not_Available" })).availability, "Not Available")
  assert.equal(toStrapiUnit(unitRow({ availability: "Available" })).availability, "Available")
  assert.equal("availability" in toStrapiUnit(unitRow()), false)
})

test("toUnitType: vivienda", () => {
  assert.deepEqual(toUnitType({ kind: "housing", housing: { bedrooms: 3, balconyTerraceSizeM2: decimal("4.50") }, office: null, industrial: null }), [
    { __component: "unit-types.housing", bedrooms: 3, balconyTerraceSizeM2: 4.5 },
  ])
})

test("toUnitType: oficinas, con la clasificación traducida y el rango de empleados tal cual", () => {
  const [office] = toUnitType({
    kind: "office",
    housing: null,
    industrial: null,
    office: {
      employeeCapacity: 12,
      priceWithoutParkingM2Usd: decimal("1500.00"),
      propertyValueWithoutParkingUsd: null,
      officeClassification: "Medium_2",
      generalSizeClassification: "Medium",
      employeeCapacityRange: "Range_11_To_15",
      m2Range: "10 a 50",
      sizeEmployeeCapacityCombined: null,
      sizeM2Combined: "Medium 10 a 50",
      parkingForSale: 1,
      balconyTerraceSizeM2: null,
    },
  })
  assert.deepEqual(office, {
    __component: "unit-types.offices",
    employeeCapacity: 12,
    parkingForSale: 1,
    priceWithoutParkingM2USD: 1500,
    officeClassification: "Medium 2",
    generalSizeClassification: "Medium",
    employeeCapacityRange: "Range_11_To_15",
    m2Range: "10 a 50",
    sizeM2Combined: "Medium 10 a 50",
  })
})

test("toUnitType: cada clasificación de oficina de Prisma vuelve con un valor que la hoja reconoce", () => {
  const prismaNames = UNIT_OFFICE_CLASSIFICATION_VALUES.map((value) => value.replace(" ", "_"))
  const office = (officeClassification: string) => ({
    employeeCapacity: null,
    priceWithoutParkingM2Usd: null,
    propertyValueWithoutParkingUsd: null,
    officeClassification,
    generalSizeClassification: null,
    employeeCapacityRange: null,
    m2Range: null,
    sizeEmployeeCapacityCombined: null,
    sizeM2Combined: null,
    parkingForSale: null,
    balconyTerraceSizeM2: null,
  })
  const translated = prismaNames.map(
    (name) => (toUnitType({ kind: "office", housing: null, industrial: null, office: office(name) })[0] as { officeClassification?: string }).officeClassification,
  )
  assert.deepEqual(translated, [...UNIT_OFFICE_CLASSIFICATION_VALUES])
  assert.ok(UNIT_OFFICE_EMPLOYEE_CAPACITY_RANGE_VALUES.every((value) => /^Range_\w+$/.test(value)))
})

test("toUnitType: industrial conserva qualityClassification", () => {
  assert.deepEqual(
    toUnitType({
      kind: "industrial",
      housing: null,
      office: null,
      industrial: {
        warehouseStorageSizeM2: decimal("1000.00"),
        officeSizeM2: decimal("50.00"),
        mezzanineSizeM2: null,
        loadingAreaM2: null,
        width1M2: decimal("20.00"),
        depth1M2: decimal("50.00"),
        depth2M2: null,
        heightM2: decimal("9.50"),
        additionalParkingPriceUsd: null,
        qualityClassification: "A+",
      },
    }),
    [
      {
        __component: "unit-types.industrial",
        warehouseStorageSizeM2: 1000,
        officeSizeM2: 50,
        width1M2: 20,
        depth1M2: 50,
        heightM2: 9.5,
        qualityClassification: "A+",
      },
    ],
  )
})

test("toUnitType: sin tipo o sin la fila hija, la zona dinámica queda vacía", () => {
  assert.deepEqual(toUnitType({ kind: null, housing: null, office: null, industrial: null }), [])
  assert.deepEqual(toUnitType({ kind: "housing", housing: null, office: null, industrial: null }), [])
})

test("toUnitListResponse: sobre con la paginación de Strapi", () => {
  const response = toUnitListResponse([unitRow(), unitRow({ id: 8, publicId: "unit-doc-2" })], 2_500, { page: 2, pageSize: 1_000 })
  assert.equal(response.data.length, 2)
  assert.deepEqual(response.meta.pagination, { page: 2, pageSize: 1_000, pageCount: 3, total: 2_500 })
  assert.deepEqual(toUnitListResponse([], 0, { page: 1, pageSize: 1_000 }).meta.pagination, {
    page: 1,
    pageSize: 1_000,
    pageCount: 1,
    total: 0,
  })
})

test("parseUnitListParams: el bloque es obligatorio", () => {
  for (const value of [undefined, null, {}, { blockDocumentId: "" }, { blockDocumentId: null }]) {
    assert.throws(
      () => parseUnitListParams(value),
      (error: unknown) => error instanceof UnitError && error.message === UNIT_BLOCK_REQUIRED,
    )
  }
})

test("parseUnitListParams: acepta documentId o id numérico y rechaza páginas de más de 1,000 o claves desconocidas", () => {
  assert.deepEqual(parseUnitListParams({ blockDocumentId: "abc", page: 2, pageSize: 1_000, search: "U-1" }), {
    blockDocumentId: "abc",
    page: 2,
    pageSize: 1_000,
    search: "U-1",
  })
  assert.deepEqual(parseUnitListParams({ blockDocumentId: 42 }), { blockDocumentId: 42 })
  for (const value of [{ blockDocumentId: "abc", pageSize: 1_001 }, { blockDocumentId: "abc", sort: "code:asc" }]) {
    assert.throws(
      () => parseUnitListParams(value),
      (error: unknown) => error instanceof UnitError && error.message === INVALID_UNIT_PARAMS,
    )
  }
})
