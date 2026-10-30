import type { StrapiProject, StrapiProjectsResponse } from "@/lib/api/strapi"
import { writeAudit, type AuditActor } from "./audit"
import { normalizePagination } from "./catalog-mapping"
import type { Prisma, PrismaClient } from "./generated/client"
import { missingRefs, parseSort, refsWhere, splitRefs, whereUnique } from "./list-query"
import {
  buildProjectWhere,
  PROJECT_NULLABLE_SORT_FIELDS,
  PROJECT_SORTABLE_FIELDS,
  ProjectError,
  projectError,
  toProjectListResponse,
  type ProjectListParams,
} from "./project-list-mapping"
import {
  MISSING_REFERENCES,
  orderedRefIds,
  PROJECT_NOT_FOUND,
  PROJECT_RELATIONS,
  toProjectAuditRow,
  toProjectError,
  toProjectWriteData,
  toStrapiProjectDetail,
  type ProjectRef,
  type ProjectRelation,
  type ProjectRequest,
  type ProjectWriteData,
} from "./project-mapping"

const RELATED_SELECT = { id: true, publicId: true, code: true, name: true, description: true } as const

/** Lo que poblaba `getProjects` de Strapi: developer, country, amenities, services y blocks. */
const PROJECT_LIST_INCLUDE = {
  developer: { select: RELATED_SELECT },
  country: { select: { ...RELATED_SELECT, isoCode: true, isoCode2: true } },
  amenities: {
    include: { amenity: { select: { ...RELATED_SELECT, category: true } } },
    orderBy: [{ sortOrder: "asc" }, { amenityId: "asc" }],
  },
  services: {
    include: { service: { select: { ...RELATED_SELECT, category: true } } },
    orderBy: [{ sortOrder: "asc" }, { serviceId: "asc" }],
  },
  blocks: { select: { id: true, publicId: true, quarter: true, domain: true }, orderBy: { id: "asc" } },
} satisfies Prisma.ProjectInclude

/** Lo que poblaba `getProjectById`: lo del listado más nse, securityType y el perfil con sus monedas. */
const PROJECT_DETAIL_INCLUDE = {
  ...PROJECT_LIST_INCLUDE,
  nse: { select: RELATED_SELECT },
  securityType: { select: RELATED_SELECT },
  exchangeRateProfile: { include: { currencies: true } },
} satisfies Prisma.ProjectInclude

const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 }

const FOREIGN_KEYS = {
  developer: "developerId",
  country: "countryId",
  nse: "nseId",
  securityType: "securityTypeId",
  exchangeRateProfile: "exchangeRateProfileId",
} as const satisfies Record<ProjectRelation, keyof Prisma.ProjectUncheckedCreateInput>

type ForeignKeyData = Partial<Record<(typeof FOREIGN_KEYS)[ProjectRelation], number | null>>

interface ResolvedReferences {
  foreignKeys: ForeignKeyData
  amenityIds?: number[]
  serviceIds?: number[]
}

async function translateErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw toProjectError(error)
  }
}

async function findRelationId(tx: Prisma.TransactionClient, relation: ProjectRelation, ref: ProjectRef): Promise<number | null> {
  const where = whereUnique(ref, projectError)
  const select = { id: true } as const
  switch (relation) {
    case "developer":
      return (await tx.developer.findUnique({ where, select }))?.id ?? null
    case "country":
      return (await tx.country.findUnique({ where, select }))?.id ?? null
    case "nse":
      return (await tx.nse.findUnique({ where, select }))?.id ?? null
    case "securityType":
      return (await tx.securityType.findUnique({ where, select }))?.id ?? null
    case "exchangeRateProfile":
      return (await tx.exchangeRateProfile.findUnique({ where, select }))?.id ?? null
  }
}

/**
 * `id` de cada referencia del cuerpo. Si alguna no existe, lanza un solo error que las nombra todas
 * y la transacción no guarda nada.
 */
async function resolveReferences(tx: Prisma.TransactionClient, write: ProjectWriteData): Promise<ResolvedReferences> {
  const missing: string[] = []
  const foreignKeys: ForeignKeyData = {}
  for (const relation of PROJECT_RELATIONS) {
    const ref = write.relations[relation]
    if (ref === undefined) continue
    if (ref === null) {
      foreignKeys[FOREIGN_KEYS[relation]] = null
      continue
    }
    const id = await findRelationId(tx, relation, ref)
    if (id === null) missing.push(`${relation}: ${ref}`)
    else foreignKeys[FOREIGN_KEYS[relation]] = id
  }

  const select = { id: true, publicId: true } as const
  let amenityIds: number[] | undefined
  if (write.amenities !== undefined) {
    const refs = splitRefs(write.amenities)
    const where = refsWhere(refs)
    const rows = where ? await tx.amenity.findMany({ where, select }) : []
    missing.push(...missingRefs(refs, rows).map((ref) => `amenities: ${ref}`))
    amenityIds = orderedRefIds(write.amenities, rows)
  }
  let serviceIds: number[] | undefined
  if (write.services !== undefined) {
    const refs = splitRefs(write.services)
    const where = refsWhere(refs)
    const rows = where ? await tx.service.findMany({ where, select }) : []
    missing.push(...missingRefs(refs, rows).map((ref) => `services: ${ref}`))
    serviceIds = orderedRefIds(write.services, rows)
  }

  if (missing.length > 0) throw new ProjectError(MISSING_REFERENCES, missing)
  return { foreignKeys, amenityIds, serviceIds }
}

/** Reemplaza amenidades y servicios por los recibidos; `sortOrder` guarda el orden en que llegaron. */
async function replaceLinks(tx: Prisma.TransactionClient, projectId: number, refs: ResolvedReferences): Promise<void> {
  if (refs.amenityIds !== undefined) {
    await tx.projectAmenity.deleteMany({ where: { projectId } })
    if (refs.amenityIds.length > 0) {
      await tx.projectAmenity.createMany({
        data: refs.amenityIds.map((amenityId, index) => ({ projectId, amenityId, sortOrder: index })),
      })
    }
  }
  if (refs.serviceIds !== undefined) {
    await tx.projectService.deleteMany({ where: { projectId } })
    if (refs.serviceIds.length > 0) {
      await tx.projectService.createMany({
        data: refs.serviceIds.map((serviceId, index) => ({ projectId, serviceId, sortOrder: index })),
      })
    }
  }
}

/**
 * Los métodos de proyectos de `DataClient`, sobre `msp_app`. Cada escritura deja en `audit_log`, en
 * la misma transacción y a nombre de `actor`, una fila con el proyecto (columnas, ids de sus
 * relaciones y la lista ordenada de amenidades y servicios).
 */
export function createProjectRepository(prisma: PrismaClient, actor: AuditActor) {
  return {
    list(params?: ProjectListParams): Promise<StrapiProjectsResponse> {
      return translateErrors(async () => {
        const { page, pageSize, skip, take } = normalizePagination(params)
        const where = buildProjectWhere(params) as Prisma.ProjectWhereInput
        const orderBy = parseSort(params?.sort, PROJECT_SORTABLE_FIELDS, projectError, PROJECT_NULLABLE_SORT_FIELDS)
        const [rows, total] = await Promise.all([
          prisma.project.findMany({ where, orderBy, skip, take, include: PROJECT_LIST_INCLUDE }),
          prisma.project.count({ where }),
        ])
        return toProjectListResponse(rows, total, { page, pageSize })
      })
    },

    get(id: string | number): Promise<StrapiProject> {
      return translateErrors(async () => {
        const row = await prisma.project.findUnique({ where: whereUnique(id, projectError), include: PROJECT_DETAIL_INCLUDE })
        if (!row) throw new ProjectError(PROJECT_NOT_FOUND)
        return toStrapiProjectDetail(row)
      })
    },

    create(request: ProjectRequest): Promise<StrapiProject> {
      return translateErrors(async () => {
        const write = toProjectWriteData(request, "create")
        return prisma.$transaction(async (tx) => {
          const refs = await resolveReferences(tx, write)
          const created = await tx.project.create({
            data: { ...write.scalars, name: write.scalars.name as string, ...refs.foreignKeys },
          })
          await replaceLinks(tx, created.id, refs)
          const after = await tx.project.findUniqueOrThrow({ where: { id: created.id }, include: PROJECT_DETAIL_INCLUDE })
          await writeAudit(tx, { userId: actor.userId, model: "project", action: "create", after: toProjectAuditRow(after) })
          return toStrapiProjectDetail(after)
        }, TX_OPTIONS)
      })
    },

    update(id: string | number, request: ProjectRequest): Promise<StrapiProject> {
      return translateErrors(async () => {
        const where = whereUnique(id, projectError)
        const write = toProjectWriteData(request, "update")
        return prisma.$transaction(async (tx) => {
          const before = await tx.project.findUnique({ where, include: PROJECT_DETAIL_INCLUDE })
          if (!before) throw new ProjectError(PROJECT_NOT_FOUND)
          const refs = await resolveReferences(tx, write)
          // `updatedAt` explícito: cambiar solo amenidades o servicios también es editar el proyecto.
          await tx.project.update({
            where: { id: before.id },
            data: { ...write.scalars, ...refs.foreignKeys, updatedAt: new Date() },
          })
          await replaceLinks(tx, before.id, refs)
          const after = await tx.project.findUniqueOrThrow({ where: { id: before.id }, include: PROJECT_DETAIL_INCLUDE })
          await writeAudit(tx, {
            userId: actor.userId,
            model: "project",
            action: "update",
            before: toProjectAuditRow(before),
            after: toProjectAuditRow(after),
          })
          return toStrapiProjectDetail(after)
        }, TX_OPTIONS)
      })
    },
  }
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>
