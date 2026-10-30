/**
 * Reglas puras del detalle y la escritura de proyectos sobre Prisma (`getProjectById`,
 * `createProject`, `updateProject`): la fila con todas sus relaciones vuelve con la forma de
 * `StrapiProject` (perfil de tipo de cambio con sus monedas, y esas monedas copiadas a
 * `project.currencies` como hacía `normalizeProjectCurrenciesFromExchangeProfile`), y el cuerpo que
 * manda `components/projects/project-form.tsx` se traduce a columnas y referencias.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

import type { StrapiProject } from "../api/strapi.ts"
import { PublicError } from "./action-result.ts"
import { toCurrenciesComponent, toExchangeRateProfile, type DecimalLike, type ProfileRow } from "./exchange-rate-profile-mapping.ts"
import { ProjectError, toRelated, toStrapiProject, type ProjectListRow, type RelatedRow } from "./project-list-mapping.ts"

export const PROJECT_NOT_FOUND = "El proyecto no existe."
export const MISSING_REFERENCES = "Hay referencias que no existen en la base nueva"
export const INVALID_PROJECT = "Datos del proyecto inválidos"

export interface ProjectDetailRow extends ProjectListRow {
  countryId: number | null
  developerId: number | null
  nseId: number | null
  securityTypeId: number | null
  exchangeRateProfileId: number | null
  nse: RelatedRow | null
  securityType: RelatedRow | null
  exchangeRateProfile: ProfileRow | null
  amenities: Array<{ amenity: RelatedRow }>
  services: Array<{ service: RelatedRow }>
}

/** Lo que poblaba `getProjectById` de Strapi, con las tasas del perfil también en `currencies`. */
export function toStrapiProjectDetail(row: ProjectDetailRow): StrapiProject {
  const project = toStrapiProject(row)
  if (row.nse) project.nse = toRelated(row.nse)
  if (row.securityType) project.securityType = toRelated(row.securityType)
  if (row.exchangeRateProfile) {
    // Strapi no poblaba los proyectos del perfil dentro del proyecto.
    const { projects: _projects, ...profile } = toExchangeRateProfile(row.exchangeRateProfile)
    project.exchangeRateProfile = profile
  } else {
    project.exchangeRateProfile = null
  }
  const currencies = toCurrenciesComponent(row.exchangeRateProfile?.currencies)
  if (currencies) project.currencies = currencies
  return project
}

export type ProjectRef = string | number

export const PROJECT_RELATIONS = ["developer", "country", "nse", "securityType", "exchangeRateProfile"] as const
export type ProjectRelation = (typeof PROJECT_RELATIONS)[number]

/** Cuerpo de `createProject`/`updateProject` de `strapiClient`, con `null` para vaciar. */
export interface ProjectRequest {
  code?: string | null
  name?: string
  department?: string | null
  municipality?: string | null
  zone?: string | null
  subzone?: string | null
  imageUrl?: string | null
  latitude?: number | null
  longitude?: number | null
  downPaymentPercentage?: number | null
  accessQuantity?: number | null
  muvi?: boolean | null
  showroom?: boolean | null
  modelHouse?: boolean | null
  fha?: boolean | null
  fractionalDownPayment?: boolean | null
  developer?: ProjectRef | null
  country?: ProjectRef | null
  nse?: ProjectRef | null
  securityType?: ProjectRef | null
  exchangeRateProfile?: ProjectRef | null
  amenities?: ProjectRef[]
  services?: ProjectRef[]
}

export interface ProjectScalarData {
  code?: string | null
  name?: string
  department?: string | null
  municipality?: string | null
  zone?: string | null
  subzone?: string | null
  imageUrl?: string | null
  latitude?: number | null
  longitude?: number | null
  downPaymentPercentage?: number | null
  accessQuantity?: number | null
  muvi?: boolean | null
  showroom?: boolean | null
  modelHouse?: boolean | null
  fha?: boolean | null
  fractionalDownPayment?: boolean | null
}

export interface ProjectWriteData {
  scalars: ProjectScalarData
  /** `null` desvincula; las ausentes no cambian. */
  relations: Partial<Record<ProjectRelation, ProjectRef | null>>
  /** Reemplazan la lista completa, en este orden; `undefined` la deja como está. */
  amenities?: ProjectRef[]
  services?: ProjectRef[]
}

const TEXT_FIELDS = ["department", "municipality", "zone", "subzone", "imageUrl"] as const
const VALUE_FIELDS = [
  "latitude",
  "longitude",
  "downPaymentPercentage",
  "accessQuantity",
  "muvi",
  "showroom",
  "modelHouse",
  "fha",
  "fractionalDownPayment",
] as const

/** `undefined` deja el campo como está (igual que omitirlo en el `PUT` de Strapi); `""` o `null` lo vacían. */
function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = String(value).trim()
  return text === "" ? null : text
}

function optionalRef(value: ProjectRef | null | undefined): ProjectRef | null | undefined {
  if (value === undefined || value === null || typeof value === "number") return value
  const text = value.trim()
  return text === "" ? null : text
}

/** Al crear, `code` y `name` son obligatorios (como en el formulario); al editar, `name` no se puede vaciar. */
export function toProjectWriteData(request: ProjectRequest, mode: "create" | "update"): ProjectWriteData {
  const scalars: ProjectScalarData = {}
  const problems: string[] = []

  const name = typeof request.name === "string" ? request.name.trim() : ""
  if (name) scalars.name = name
  else if (mode === "create" || request.name !== undefined) problems.push("name: es obligatorio")

  const code = optionalText(request.code)
  if (mode === "create" && !code) problems.push("code: es obligatorio")
  if (code !== undefined) scalars.code = code

  if (problems.length > 0) throw new ProjectError(INVALID_PROJECT, problems)

  for (const field of TEXT_FIELDS) {
    const value = optionalText(request[field])
    if (value !== undefined) scalars[field] = value
  }
  for (const field of VALUE_FIELDS) {
    const value = request[field]
    if (value !== undefined) (scalars as Record<string, unknown>)[field] = value
  }

  const relations: ProjectWriteData["relations"] = {}
  for (const relation of PROJECT_RELATIONS) {
    const ref = optionalRef(request[relation])
    if (ref !== undefined) relations[relation] = ref
  }

  return {
    scalars,
    relations,
    ...(request.amenities !== undefined ? { amenities: request.amenities } : {}),
    ...(request.services !== undefined ? { services: request.services } : {}),
  }
}

/**
 * `id`s de las referencias en el orden en que llegaron, sin repetidos. Las que no aparecen entre
 * `rows` se omiten: el repositorio ya las reportó como faltantes.
 */
export function orderedRefIds(refs: ReadonlyArray<ProjectRef>, rows: ReadonlyArray<{ id: number; publicId: string }>): number[] {
  const byId = new Map(rows.map((row) => [row.id, row.id]))
  const byPublicId = new Map(rows.map((row) => [row.publicId, row.id]))
  const out: number[] = []
  const seen = new Set<number>()
  for (const ref of refs) {
    const value = typeof ref === "number" ? ref : ref.trim()
    const id = typeof value === "number" || /^\d+$/.test(value) ? byId.get(Number(value)) : byPublicId.get(value)
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

const decimalText = (value: DecimalLike | null) => (value === null ? null : value.toString())

/**
 * Fila del proyecto para `audit_log`: columnas (decimales en texto, sin perder precisión), ids de las
 * relaciones y los `publicId` de amenidades y servicios en su orden, que también es un dato.
 */
export function toProjectAuditRow(row: ProjectDetailRow) {
  return {
    id: row.id,
    publicId: row.publicId,
    code: row.code,
    name: row.name,
    department: row.department,
    municipality: row.municipality,
    zone: row.zone,
    subzone: row.subzone,
    latitude: decimalText(row.latitude),
    longitude: decimalText(row.longitude),
    muvi: row.muvi,
    showroom: row.showroom,
    modelHouse: row.modelHouse,
    accessQuantity: row.accessQuantity,
    imageUrl: row.imageUrl,
    fha: row.fha,
    fractionalDownPayment: row.fractionalDownPayment,
    downPaymentPercentage: decimalText(row.downPaymentPercentage),
    countryId: row.countryId,
    developerId: row.developerId,
    nseId: row.nseId,
    securityTypeId: row.securityTypeId,
    exchangeRateProfileId: row.exchangeRateProfileId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    amenities: row.amenities.map(({ amenity }) => amenity.publicId),
    services: row.services.map(({ service }) => service.publicId),
  }
}

/** Traduce los errores conocidos de Prisma; el resto se propaga tal cual. */
export function toProjectError(error: unknown): unknown {
  if (error instanceof PublicError) return error
  const code = (error as { code?: unknown } | null)?.code
  if (code === "P2025") return new ProjectError(PROJECT_NOT_FOUND)
  // FK: una referencia validada se borró en medio de la transacción.
  if (code === "P2003") return new ProjectError(`${MISSING_REFERENCES}.`)
  return error
}
