import { DEFAULT_DOMAIN, undefinedBlock, type Resolved } from "../model"
import type { RawRow } from "../snapshot"
import type { AppRow } from "../specs"
import { bool, doc, int, numeric, refDoc, stamps, text } from "./common"

/** Los campos de fórmula se copian tal como están en Strapi: no se recalculan al cargar. */
export function unitRow(resolved: Resolved, row: RawRow): AppRow {
  const { present, rel, unitType, duplicateCodes } = resolved
  const id = Number(row.id)
  const kind = unitType.get(id)?.kind ?? null
  return {
    public_id: doc(row),
    code: duplicateCodes.units.has(id) ? null : text(row.code),
    name: text(row.name),
    legacy_id: text(row.legacy_id),
    block_id: refDoc(present, "blocks", rel.unitBlock.get(id)) ?? undefinedBlock(kind ?? DEFAULT_DOMAIN),
    kind,
    unit_number: text(row.unit_number),
    model: text(row.model),
    availability: text(row.availability),
    front_m2: numeric(row.front_m_2),
    depth_m2: numeric(row.depth_m_2),
    land_m2: numeric(row.land_m_2),
    unit_size_m2: numeric(row.unit_size_m_2),
    habitable_construction_m2: numeric(row.habitable_construction_m_2),
    parking_size_m2: numeric(row.parking_size_m_2),
    total_size_m2: numeric(row.total_size_m_2),
    bathrooms: numeric(row.bathrooms),
    has_parking: bool(row.has_parking),
    has_motorcycle_parking: bool(row.has_motorcycle_parking),
    parking_spaces: int(row.parking_spaces),
    total_price_usd: numeric(row.total_price_usd),
    price_without_vat_usd: numeric(row.price_without_vatusd),
    price_per_m2_usd: numeric(row.price_per_m_2_usd),
    rental_price_usd: numeric(row.rental_price_usd),
    rental_price_without_vat_usd: numeric(row.rental_price_without_vatusd),
    rental_price_per_m2_without_vat_usd: numeric(row.rental_price_per_m_2_without_vatusd),
    maintenance_total_price_m2_usd: numeric(row.maintenance_total_price_m_2_usd),
    maintenance_price_per_m2_usd: numeric(row.maintenance_price_per_m_2_usd),
    installment_usd: numeric(row.installment_usd),
    income_usd: numeric(row.income_usd),
    unit_absorption: numeric(row.unit_absorption),
    absorption_per_m2: numeric(row.absorption_per_m_2),
    usage_id: refDoc(present, "unit_usages", rel.unitUsage.get(id)),
    topography_id: refDoc(present, "unit_topographies", rel.unitTopography.get(id)),
    parking_type_id: refDoc(present, "unit_parking_types", rel.unitParkingType.get(id)),
    ...stamps(row),
  }
}

export function unitTypes(resolved: Resolved): { housing: AppRow[]; office: AppRow[]; industrial: AppRow[] } {
  const housing: AppRow[] = []
  const office: AppRow[] = []
  const industrial: AppRow[] = []
  for (const [unitId, { kind, row }] of resolved.unitType) {
    const unit = doc(resolved.present.units.get(unitId)!)
    if (kind === "housing") {
      housing.push({ unit_id: unit, bedrooms: int(row.bedrooms), balcony_terrace_size_m2: numeric(row.balcony_terrace_size_m_2) })
    } else if (kind === "office") {
      office.push({
        unit_id: unit,
        employee_capacity: int(row.employee_capacity),
        price_without_parking_m2_usd: numeric(row.price_without_parking_m_2_usd),
        property_value_without_parking_usd: numeric(row.property_value_without_parking_usd),
        office_classification: text(row.office_classification),
        general_size_classification: text(row.general_size_classification),
        employee_capacity_range: text(row.employee_capacity_range),
        m2_range: text(row.m_2_range),
        size_employee_capacity_combined: text(row.size_employee_capacity_combined),
        size_m2_combined: text(row.size_m_2_combined),
        parking_for_sale: int(row.parking_for_sale),
        balcony_terrace_size_m2: numeric(row.balcony_terrace_size_m_2),
      })
    } else {
      industrial.push({
        unit_id: unit,
        warehouse_storage_size_m2: numeric(row.warehouse_storage_size_m_2),
        office_size_m2: numeric(row.office_size_m_2),
        mezzanine_size_m2: numeric(row.mezzanine_size_m_2),
        loading_area_m2: numeric(row.loading_area_m_2),
        width_1_m2: numeric(row.width_1_m_2),
        depth_1_m2: numeric(row.depth_1_m_2),
        depth_2_m2: numeric(row.depth_2_m_2),
        height_m2: numeric(row.height_m_2),
        additional_parking_price_usd: numeric(row.additional_parking_price_usd),
        quality_classification: text(row.quality_classification),
      })
    }
  }
  return { housing, office, industrial }
}
