import type { StrapiProjectsResponse } from "@/lib/api/strapi"
import { normalizePagination } from "./catalog-mapping"
import type { Prisma, PrismaClient } from "./generated/client"
import { parseSort } from "./list-query"
import {
  buildProjectWhere,
  PROJECT_NULLABLE_SORT_FIELDS,
  PROJECT_SORTABLE_FIELDS,
  projectError,
  toProjectListResponse,
  type ProjectListParams,
} from "./project-list-mapping"

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

/** Listado de proyectos de `DataClient` (`getProjects`), solo lectura, sobre `msp_app`. */
export function createProjectRepository(prisma: PrismaClient) {
  return {
    async list(params?: ProjectListParams): Promise<StrapiProjectsResponse> {
      const { page, pageSize, skip, take } = normalizePagination(params)
      const where = buildProjectWhere(params) as Prisma.ProjectWhereInput
      const orderBy = parseSort(params?.sort, PROJECT_SORTABLE_FIELDS, projectError, PROJECT_NULLABLE_SORT_FIELDS)
      const [rows, total] = await Promise.all([
        prisma.project.findMany({ where, orderBy, skip, take, include: PROJECT_LIST_INCLUDE }),
        prisma.project.count({ where }),
      ])
      return toProjectListResponse(rows, total, { page, pageSize })
    },
  }
}
