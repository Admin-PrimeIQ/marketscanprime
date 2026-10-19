import type { Resolved } from "../model"
import { float } from "../normalize"
import type { RawRow } from "../snapshot"
import type { AppRow } from "../specs"
import { bool, doc, int, numeric, refDoc, stamps, text } from "./common"

export function projectRow(resolved: Resolved, row: RawRow): AppRow {
  const { present, rel } = resolved
  const id = Number(row.id)
  return {
    public_id: doc(row),
    code: text(row.code),
    name: text(row.name),
    department: text(row.department),
    municipality: text(row.municipality),
    zone: text(row.zone),
    subzone: text(row.subzone),
    latitude: numeric(row.latitude),
    longitude: numeric(row.longitude),
    muvi: bool(row.muvi),
    showroom: bool(row.showroom),
    model_house: bool(row.model_house),
    access_quantity: int(row.access_quantity),
    image_url: text(row.image_url),
    fha: bool(row.fha),
    fractional_down_payment: bool(row.fractional_down_payment),
    down_payment_percentage: numeric(row.down_payment_percentage),
    country_id: refDoc(present, "countries", rel.projectCountry.get(id)),
    developer_id: refDoc(present, "developers", rel.projectDeveloper.get(id)),
    nse_id: refDoc(present, "nses", rel.projectNse.get(id)),
    security_type_id: refDoc(present, "security_types", rel.projectSecurityType.get(id)),
    exchange_rate_profile_id: refDoc(present, "exchange_rate_profiles", rel.projectProfile.get(id)),
    ...stamps(row),
  }
}

export function projectLinks(resolved: Resolved): { amenities: AppRow[]; services: AppRow[] } {
  const { present, sets } = resolved
  const amenities: AppRow[] = []
  const services: AppRow[] = []
  for (const [projectId, list] of sets.projectAmenities) {
    const project = doc(present.projects.get(projectId)!)
    for (const { target, ord } of list) {
      amenities.push({ project_id: project, amenity_id: refDoc(present, "amenities", target), sort_order: float(ord) })
    }
  }
  for (const [projectId, list] of sets.projectServices) {
    const project = doc(present.projects.get(projectId)!)
    for (const { target, ord } of list) {
      services.push({ project_id: project, service_id: refDoc(present, "services", target), sort_order: float(ord) })
    }
  }
  return { amenities, services }
}
