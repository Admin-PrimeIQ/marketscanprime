import { test } from "node:test"
import assert from "node:assert/strict"
import {
  UNIT_OFFICE_CLASSIFICATION_VALUES,
  UNIT_OFFICE_EMPLOYEE_CAPACITY_RANGE_VALUES,
  UNIT_OFFICE_GENERAL_SIZE_VALUES,
} from "../units/unit-type-dynamic-columns.ts"
import { UnitError } from "./unit-mapping.ts"
import { NEW_UNIT_BLOCK_REQUIRED, parseUnitCreate, parseUnitUpdates } from "./unit-schemas.ts"
import {
  COMPONENT_DOMAIN_MISMATCH,
  INVALID_UNIT_VALUES,
  isClientOnlyUnitField,
  SINGLE_COMPONENT,
  toUnitCreateData,
  toUnitUpdateData,
  UNKNOWN_UNIT_FIELDS,
} from "./unit-write-mapping.ts"

function rejectsWith(work: () => unknown, message: string): UnitError {
  let caught: unknown
  assert.throws(work, (error) => {
    caught = error
    return error instanceof UnitError && error.message === message
  })
  return caught as UnitError
}

test("escalares: nombres de Strapi pasan a columnas de Prisma y la última entrada gana", () => {
  const data = toUnitUpdateData(
    [
      { field: "totalPriceUSD", value: 100 },
      { field: "priceWithoutVATUSD", value: "89.29" },
      { field: "parkingSpaces", value: 2 },
      { field: "hasParking", value: "true" },
      { field: "totalPriceUSD", value: 120 },
      { field: "model", value: "A" },
      { field: "landM2", value: "" },
    ],
    "housing",
  )
  assert.deepEqual(data.scalars, {
    totalPriceUsd: 120,
    priceWithoutVatUsd: 89.29,
    parkingSpaces: 2,
    hasParking: true,
    model: "A",
    landM2: null,
  })
  assert.deepEqual(data.relations, {})
  assert.equal(data.component, null)
})

test("availability: el valor de la UI pasa al nombre del miembro del enumerado", () => {
  assert.equal(toUnitUpdateData([{ field: "availability", value: "Not Available" }], "housing").scalars.availability, "Not_Available")
  assert.equal(toUnitUpdateData([{ field: "availability", value: "Available" }], "housing").scalars.availability, "Available")
  assert.equal(toUnitUpdateData([{ field: "availability", value: null }], "housing").scalars.availability, null)
  rejectsWith(() => toUnitUpdateData([{ field: "availability", value: "Vendida" }], "housing"), INVALID_UNIT_VALUES)
})

test("se descartan los campos que solo existen en el cliente", () => {
  assert.equal(isClientOnlyUnitField("maintenanceWithoutVATUSD"), true)
  assert.equal(isClientOnlyUnitField("totalPriceGTQ"), true)
  assert.equal(isClientOnlyUnitField("totalPriceUSD"), false)
  assert.equal(isClientOnlyUnitField("rentalPricePerM2WithoutVATUSD"), false)
  const data = toUnitUpdateData(
    [
      { field: "maintenanceWithoutVATUSD", value: 10 },
      { field: "totalPriceCRC", value: 5 },
      { field: "rentalPricePerM2WithoutVATUSD", value: 7.5 },
    ],
    "housing",
  )
  assert.deepEqual(data.scalars, { rentalPricePerM2WithoutVatUsd: 7.5 })
})

test("un campo desconocido o un valor inválido se rechazan con detalle", () => {
  const unknown = rejectsWith(() => toUnitUpdateData([{ field: "frontVaras2", value: 3 }], "housing"), UNKNOWN_UNIT_FIELDS)
  assert.deepEqual(unknown.details, ["frontVaras2"])
  const invalid = rejectsWith(
    () =>
      toUnitUpdateData(
        [
          { field: "parkingSpaces", value: 1.5 },
          { field: "totalPriceUSD", value: "doce" },
          { field: "hasParking", value: "sí" },
        ],
        "housing",
      ),
    INVALID_UNIT_VALUES,
  )
  assert.equal(invalid.details?.length, 3)
})

test("relaciones: documentId, id u objeto; vacío desvincula", () => {
  const data = toUnitUpdateData(
    [
      { field: "topography", value: "abc123" },
      { field: "parkingType", value: { documentId: "pt1", name: "Techado" } },
      { field: "unitUsage", value: "" },
    ],
    "housing",
  )
  assert.deepEqual(data.relations, { topography: "abc123", parkingType: "pt1", unitUsage: null })
})

test("código: se recorta, vacío queda nulo y con caracteres fuera del UID se rechaza", () => {
  assert.equal(toUnitUpdateData([{ field: "code", value: " torre-a-101 " }], "housing").scalars.code, "torre-a-101")
  assert.equal(toUnitUpdateData([{ field: "code", value: "" }], "housing").scalars.code, null)
  rejectsWith(() => toUnitUpdateData([{ field: "code", value: "torre a/101" }], "housing"), INVALID_UNIT_VALUES)
})

test("zona dinámica: componente completo y rutas unitType[0] / type[0] van a la tabla hija del bloque", () => {
  const data = toUnitUpdateData(
    [
      { field: "unitType", value: [{ __component: "unit-types.housing", id: 9, bedrooms: 3, balconyTerraceSizeM2: 4.5 }] },
      { field: "unitType[0].bedrooms", value: 2 },
    ],
    "housing",
  )
  assert.deepEqual(data.component, { bedrooms: 2, balconyTerraceSizeM2: 4.5 })
  assert.deepEqual(toUnitUpdateData([{ field: "type[0].bedrooms", value: "1" }], "housing").component, { bedrooms: 1 })
})

test("zona dinámica: un componente vacío deja la fila hija lista para crearse; [] no borra nada", () => {
  assert.deepEqual(toUnitUpdateData([{ field: "unitType", value: [{ __component: "unit-types.offices" }] }], "office").component, {})
  assert.equal(toUnitUpdateData([{ field: "unitType", value: [] }], "office").component, null)
})

test("zona dinámica: otro tipo que el del bloque, varios componentes o índice > 0 se rechazan", () => {
  rejectsWith(
    () => toUnitUpdateData([{ field: "unitType", value: [{ __component: "unit-types.industrial", heightM2: 3 }] }], "housing"),
    COMPONENT_DOMAIN_MISMATCH,
  )
  const many = rejectsWith(
    () =>
      toUnitUpdateData(
        [{ field: "unitType", value: [{ __component: "unit-types.housing" }, { __component: "unit-types.housing" }] }],
        "housing",
      ),
    INVALID_UNIT_VALUES,
  )
  assert.match(many.details?.[0] ?? "", new RegExp(SINGLE_COMPONENT.replace(/[.*+?^${}()|[\]\\`]/g, "\\$&")))
  rejectsWith(() => toUnitUpdateData([{ field: "unitType[1].bedrooms", value: 2 }], "housing"), INVALID_UNIT_VALUES)
  rejectsWith(() => toUnitUpdateData([{ field: "unitType[0].heightM2", value: 2 }], "housing"), UNKNOWN_UNIT_FIELDS)
})

test("oficinas: todos los valores de los desplegables de la UI se aceptan", () => {
  for (const value of UNIT_OFFICE_CLASSIFICATION_VALUES) {
    const data = toUnitUpdateData([{ field: "unitType[0].officeClassification", value }], "office")
    assert.equal(data.component?.officeClassification, value.replace(" ", "_"))
  }
  for (const value of UNIT_OFFICE_GENERAL_SIZE_VALUES) {
    assert.equal(toUnitUpdateData([{ field: "unitType[0].generalSizeClassification", value }], "office").component?.generalSizeClassification, value)
  }
  for (const value of UNIT_OFFICE_EMPLOYEE_CAPACITY_RANGE_VALUES) {
    assert.equal(toUnitUpdateData([{ field: "unitType[0].employeeCapacityRange", value }], "office").component?.employeeCapacityRange, value)
  }
  rejectsWith(() => toUnitUpdateData([{ field: "unitType[0].officeClassification", value: "Mega 1" }], "office"), INVALID_UNIT_VALUES)
})

test("industrial: incluye qualityClassification y additionalParkingPriceUSD", () => {
  const data = toUnitUpdateData(
    [{ field: "unitType", value: [{ __component: "unit-types.industrial", qualityClassification: "A+", additionalParkingPriceUSD: 50 }] }],
    "industrial",
  )
  assert.deepEqual(data.component, { qualityClassification: "A+", additionalParkingPriceUsd: 50 })
})

test("alta: ignora las claves de cliente y toma el bloque", () => {
  const data = toUnitCreateData(
    {
      clientTempId: "temp-1",
      id: undefined,
      documentId: undefined,
      name: "Torre A - 101",
      code: "torre-a-101",
      unitNumber: "101",
      model: "A",
      parkingType: "pt1",
      block: "blk1",
      totalPriceGTQ: 800,
      unitType: [{ __component: "unit-types.housing", bedrooms: 2 }],
    },
    "housing",
  )
  assert.equal(data.block, "blk1")
  assert.deepEqual(data.scalars, { name: "Torre A - 101", code: "torre-a-101", unitNumber: "101", model: "A" })
  assert.deepEqual(data.relations, { parkingType: "pt1" })
  assert.deepEqual(data.component, { bedrooms: 2 })
})

test("esquemas: lote de cambios y alta con bloque obligatorio", () => {
  assert.deepEqual(parseUnitUpdates([{ field: "model", value: "B" }]), [{ field: "model", value: "B" }])
  assert.throws(() => parseUnitUpdates([]), UnitError)
  assert.throws(() => parseUnitUpdates([{ field: "model", value: 1, extra: true }]), UnitError)
  rejectsWith(() => parseUnitCreate({ name: "x" }), NEW_UNIT_BLOCK_REQUIRED)
  assert.equal(parseUnitCreate({ block: "blk1", name: "x" }).block, "blk1")
})
