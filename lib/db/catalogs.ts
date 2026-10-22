import type { CatalogItem, CatalogListResponse, CatalogRequest } from "@/lib/api/strapi"
import type { PrismaClient } from "./generated/client"
import {
  buildCatalogSearch,
  CatalogError,
  catalogWhereUnique,
  normalizePagination,
  parseCatalogSort,
  resolveCatalogModel,
  toCatalogError,
  toCatalogItem,
  toCatalogListResponse,
  toCatalogWriteData,
  type CatalogListParams,
  type CatalogModel,
  type CatalogOrderBy,
  type CatalogRow,
  type CatalogWriteData,
} from "./catalog-mapping"

type CatalogWhereUnique = { id: number } | { publicId: string }

/**
 * Lo que los doce delegados de catálogo tienen en común. Prisma les da tipos distintos aunque las
 * columnas coincidan, y una unión de delegados no se puede invocar: por eso el cast en `delegateFor`.
 */
interface CatalogDelegate {
  findMany(args: { where?: object; orderBy?: CatalogOrderBy; skip?: number; take?: number }): Promise<CatalogRow[]>
  count(args: { where?: object }): Promise<number>
  findUnique(args: { where: CatalogWhereUnique }): Promise<CatalogRow | null>
  create(args: { data: CatalogWriteData }): Promise<CatalogRow>
  update(args: { where: CatalogWhereUnique; data: CatalogWriteData }): Promise<CatalogRow>
  delete(args: { where: CatalogWhereUnique }): Promise<CatalogRow>
}

function delegateFor(prisma: PrismaClient, model: CatalogModel): CatalogDelegate {
  return prisma[model] as unknown as CatalogDelegate
}

async function translateErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw toCatalogError(error)
  }
}

/** Los cinco métodos de catálogo de `DataClient`, sobre `msp_app`. */
export function createCatalogRepository(prisma: PrismaClient) {
  return {
    list(endpoint: string, params?: CatalogListParams): Promise<CatalogListResponse> {
      return translateErrors(async () => {
        const delegate = delegateFor(prisma, resolveCatalogModel(endpoint))
        const { page, pageSize, skip, take } = normalizePagination(params)
        const where = buildCatalogSearch(params?.search)
        const [rows, total] = await Promise.all([
          delegate.findMany({ where, orderBy: parseCatalogSort(params?.sort), skip, take }),
          delegate.count({ where }),
        ])
        return toCatalogListResponse(rows, total, { page, pageSize })
      })
    },

    get(endpoint: string, id: string | number): Promise<CatalogItem> {
      return translateErrors(async () => {
        const row = await delegateFor(prisma, resolveCatalogModel(endpoint)).findUnique({ where: catalogWhereUnique(id) })
        if (!row) throw new CatalogError("El elemento del catálogo no existe.")
        return toCatalogItem(row)
      })
    },

    create(endpoint: string, data: CatalogRequest): Promise<CatalogItem> {
      return translateErrors(async () => {
        const model = resolveCatalogModel(endpoint)
        const row = await delegateFor(prisma, model).create({ data: toCatalogWriteData(model, data, "create") })
        return toCatalogItem(row)
      })
    },

    update(endpoint: string, id: string | number, data: CatalogRequest): Promise<CatalogItem> {
      return translateErrors(async () => {
        const model = resolveCatalogModel(endpoint)
        const row = await delegateFor(prisma, model).update({
          where: catalogWhereUnique(id),
          data: toCatalogWriteData(model, data, "update"),
        })
        return toCatalogItem(row)
      })
    },

    remove(endpoint: string, id: string | number): Promise<void> {
      return translateErrors(async () => {
        await delegateFor(prisma, resolveCatalogModel(endpoint)).delete({ where: catalogWhereUnique(id) })
      })
    },
  }
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>
