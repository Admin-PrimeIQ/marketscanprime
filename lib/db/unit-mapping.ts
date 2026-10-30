/**
 * Reglas puras de la lectura de unidades sobre Prisma (`getUnitsAllPages`): la fila de `unit` con su
 * tabla hija (`unit_housing` / `unit_office` / `unit_industrial`) vuelve con la forma de `StrapiUnit`,
 * con la zona dinámica `unitType` como arreglo de un componente (`documentId` = `publicId`).
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import type {
  StrapiUnit,
  StrapiUnitsResponse,
  StrapiUnitType,
  StrapiUnitTypeHousing,
  StrapiUnitTypeIndustrial,
  StrapiUnitTypeOffices,
} from "../api/strapi.ts"
import { PublicError } from "./action-result.ts"
import { decimalToNumber, type DecimalLike } from "./exchange-rate-profile-mapping.ts"
import { toRelated, withoutNulls, type RelatedRow } from "./project-list-mapping.ts"

export const UNIT_BLOCK_REQUIRED = "Falta el bloque: las unidades se listan siempre por bloque."
export const INVALID_UNIT_PARAMS = "Parámetros de unidades inválidos"

/** Error con el mismo contrato que los de `strapiClient`: `message` y, si hay, `details`. Llega al navegador. */
export class UnitError extends PublicError {
  constructor(message: string, details?: string[]) {
    super(message, details)
    this.name = "UnitError"
  }
}

export const unitError = (message: string) => new UnitError(message)

export interface UnitListParams {
  blockDocumentId: string | number
  page?: number
  pageSize?: number
  search?: string
}

/**
 * El cliente de Prisma devuelve el nombre del miembro del enumerado; la UI espera el valor guardado
 * (`@map` en `schema.prisma`). Los demás enumerados de unidades ya coinciden.
 */
const AVAILABILITY_VALUES: Record<string, NonNullable<StrapiUnit["availability"]>> = {
  Available: "Available",
  Not_Available: "Not Available",
}

const OFFICE_CLASSIFICATION_VALUES: Record<string, string> = {
  Micro_1: "Micro 1",
  Micro_2: "Micro 2",
  Small_1: "Small 1",
  Small_2: "Small 2",
  Medium_1: "Medium 1",
  Medium_2: "Medium 2",
  Medium_3: "Medium 3",
  Large_1: "Large 1",
  Large_2: "Large 2",
  Large_3: "Large 3",
  Large_4: "Large 4",
  Large_5: "Large 5",
}

export interface UnitHousingRow {
  bedrooms: number | null
  balconyTerraceSizeM2: DecimalLike | null
}

export interface UnitOfficeRow {
  employeeCapacity: number | null
  priceWithoutParkingM2Usd: DecimalLike | null
  propertyValueWithoutParkingUsd: DecimalLike | null
  officeClassification: string | null
  generalSizeClassification: string | null
  employeeCapacityRange: string | null
  m2Range: string | null
  sizeEmployeeCapacityCombined: string | null
  sizeM2Combined: string | null
  parkingForSale: number | null
  balconyTerraceSizeM2: DecimalLike | null
}

export interface UnitIndustrialRow {
  warehouseStorageSizeM2: DecimalLike | null
  officeSizeM2: DecimalLike | null
  mezzanineSizeM2: DecimalLike | null
  loadingAreaM2: DecimalLike | null
  width1M2: DecimalLike | null
  depth1M2: DecimalLike | null
  depth2M2: DecimalLike | null
  heightM2: DecimalLike | null
  additionalParkingPriceUsd: DecimalLike | null
  qualityClassification: string | null
}

export interface UnitListRow {
  id: number
  publicId: string
  code: string | null
  name: string | null
  legacyId: string | null
  kind: string | null
  unitNumber: string | null
  model: string | null
  availability: string | null
  frontM2: DecimalLike | null
  depthM2: DecimalLike | null
  landM2: DecimalLike | null
  unitSizeM2: DecimalLike | null
  habitableConstructionM2: DecimalLike | null
  parkingSizeM2: DecimalLike | null
  totalSizeM2: DecimalLike | null
  bathrooms: DecimalLike | null
  hasParking: boolean | null
  hasMotorcycleParking: boolean | null
  parkingSpaces: number | null
  totalPriceUsd: DecimalLike | null
  priceWithoutVatUsd: DecimalLike | null
  pricePerM2Usd: DecimalLike | null
  rentalPriceUsd: DecimalLike | null
  rentalPriceWithoutVatUsd: DecimalLike | null
  rentalPricePerM2WithoutVatUsd: DecimalLike | null
  maintenanceTotalPriceM2Usd: DecimalLike | null
  maintenancePricePerM2Usd: DecimalLike | null
  installmentUsd: DecimalLike | null
  incomeUsd: DecimalLike | null
  unitAbsorption: DecimalLike | null
  absorptionPerM2: DecimalLike | null
  createdAt: Date
  updatedAt: Date
  usage: RelatedRow | null
  topography: RelatedRow | null
  parkingType: RelatedRow | null
  block: {
    id: number
    publicId: string
    code: string | null
    name: string | null
    project: { id: number; publicId: string; code: string | null; name: string }
  }
  housing: UnitHousingRow | null
  office: UnitOfficeRow | null
  industrial: UnitIndustrialRow | null
}

function housingComponent(row: UnitHousingRow): StrapiUnitTypeHousing {
  return {
    __component: "unit-types.housing",
    ...withoutNulls({ bedrooms: row.bedrooms, balconyTerraceSizeM2: decimalToNumber(row.balconyTerraceSizeM2) }),
  }
}

function officeComponent(row: UnitOfficeRow): StrapiUnitTypeOffices {
  return {
    __component: "unit-types.offices",
    ...withoutNulls({
      balconyTerraceSizeM2: decimalToNumber(row.balconyTerraceSizeM2),
      employeeCapacity: row.employeeCapacity,
      parkingForSale: row.parkingForSale,
      priceWithoutParkingM2USD: decimalToNumber(row.priceWithoutParkingM2Usd),
      propertyValueWithoutParkingUSD: decimalToNumber(row.propertyValueWithoutParkingUsd),
      officeClassification:
        row.officeClassification === null ? null : (OFFICE_CLASSIFICATION_VALUES[row.officeClassification] ?? row.officeClassification),
      generalSizeClassification: row.generalSizeClassification,
      employeeCapacityRange: row.employeeCapacityRange,
      m2Range: row.m2Range,
      sizeEmployeeCapacityCombined: row.sizeEmployeeCapacityCombined,
      sizeM2Combined: row.sizeM2Combined,
    }),
  }
}

/** `qualityClassification` no está en `StrapiUnitTypeIndustrial`, pero viene en Strapi y en `msp_app`. */
function industrialComponent(row: UnitIndustrialRow): StrapiUnitTypeIndustrial & { qualityClassification?: string } {
  return {
    __component: "unit-types.industrial",
    ...withoutNulls({
      warehouseStorageSizeM2: decimalToNumber(row.warehouseStorageSizeM2),
      officeSizeM2: decimalToNumber(row.officeSizeM2),
      mezzanineSizeM2: decimalToNumber(row.mezzanineSizeM2),
      loadingAreaM2: decimalToNumber(row.loadingAreaM2),
      width1M2: decimalToNumber(row.width1M2),
      depth1M2: decimalToNumber(row.depth1M2),
      depth2M2: decimalToNumber(row.depth2M2),
      heightM2: decimalToNumber(row.heightM2),
      additionalParkingPriceUSD: decimalToNumber(row.additionalParkingPriceUsd),
      qualityClassification: row.qualityClassification,
    }),
  }
}

/** La zona dinámica de Strapi: un componente según `kind`, o vacía si la unidad no tiene tipo. */
export function toUnitType(row: Pick<UnitListRow, "kind" | "housing" | "office" | "industrial">): StrapiUnitType[] {
  switch (row.kind) {
    case "housing":
      return row.housing ? [housingComponent(row.housing)] : []
    case "office":
      return row.office ? [officeComponent(row.office)] : []
    case "industrial":
      return row.industrial ? [industrialComponent(row.industrial)] : []
    default:
      return []
  }
}

export function toStrapiUnit(row: UnitListRow): StrapiUnit {
  const { block } = row
  return {
    id: row.id,
    documentId: row.publicId,
    ...withoutNulls({
      code: row.code,
      name: row.name,
      legacyId: row.legacyId,
      unitNumber: row.unitNumber,
      model: row.model,
      availability: row.availability === null ? null : AVAILABILITY_VALUES[row.availability],
      frontM2: decimalToNumber(row.frontM2),
      depthM2: decimalToNumber(row.depthM2),
      landM2: decimalToNumber(row.landM2),
      unitSizeM2: decimalToNumber(row.unitSizeM2),
      habitableConstructionM2: decimalToNumber(row.habitableConstructionM2),
      parkingSizeM2: decimalToNumber(row.parkingSizeM2),
      totalSizeM2: decimalToNumber(row.totalSizeM2),
      bathrooms: decimalToNumber(row.bathrooms),
      hasParking: row.hasParking,
      hasMotorcycleParking: row.hasMotorcycleParking,
      parkingSpaces: row.parkingSpaces,
      totalPriceUSD: decimalToNumber(row.totalPriceUsd),
      priceWithoutVATUSD: decimalToNumber(row.priceWithoutVatUsd),
      pricePerM2USD: decimalToNumber(row.pricePerM2Usd),
      rentalPriceUSD: decimalToNumber(row.rentalPriceUsd),
      rentalPriceWithoutVATUSD: decimalToNumber(row.rentalPriceWithoutVatUsd),
      rentalPricePerM2WithoutVATUSD: decimalToNumber(row.rentalPricePerM2WithoutVatUsd),
      maintenanceTotalPriceM2USD: decimalToNumber(row.maintenanceTotalPriceM2Usd),
      maintenancePricePerM2USD: decimalToNumber(row.maintenancePricePerM2Usd),
      installmentUSD: decimalToNumber(row.installmentUsd),
      incomeUSD: decimalToNumber(row.incomeUsd),
      unitAbsorption: decimalToNumber(row.unitAbsorption),
      absorptionPerM2: decimalToNumber(row.absorptionPerM2),
    }),
    ...(row.topography ? { topography: toRelated(row.topography) } : {}),
    ...(row.parkingType ? { parkingType: toRelated(row.parkingType) } : {}),
    ...(row.usage ? { unitUsage: toRelated(row.usage) } : {}),
    unitType: toUnitType(row),
    block: {
      id: block.id,
      documentId: block.publicId,
      ...withoutNulls({ code: block.code, name: block.name }),
      project: {
        id: block.project.id,
        documentId: block.project.publicId,
        name: block.project.name,
        ...withoutNulls({ code: block.project.code }),
      },
    },
    // `toISOString` conserva los milisegundos que necesita el control de concurrencia al guardar.
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toUnitListResponse(
  rows: UnitListRow[],
  total: number,
  pagination: { page: number; pageSize: number },
): StrapiUnitsResponse {
  return {
    data: rows.map(toStrapiUnit),
    meta: {
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
        total,
      },
    },
  }
}
