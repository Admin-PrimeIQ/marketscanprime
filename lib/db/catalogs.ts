import type { CatalogItem, CatalogListResponse, CatalogRequest } from "@/lib/api/strapi"
import { writeAudit, type AuditActor } from "./audit"
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

/** El cliente o el de una transacción: los dos tienen los doce delegados. */
type CatalogDb = { [K in CatalogModel]: unknown }

function delegateFor(db: CatalogDb, model: CatalogModel): CatalogDelegate {
  return db[model] as unknown as CatalogDelegate
}

async function translateErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw toCatalogError(error)
  }
}

/**
 * Los cinco métodos de catálogo de `DataClient`, sobre `msp_app`. Cada escritura deja su fila en
 * `audit_log`, en la misma transacción, a nombre de `actor`.
 */
export function createCatalogRepository(prisma: PrismaClient, actor: AuditActor) {
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
        const writeData = toCatalogWriteData(model, data, "create")
        return prisma.$transaction(async (tx) => {
          const after = await delegateFor(tx, model).create({ data: writeData })
          await writeAudit(tx, { userId: actor.userId, model, action: "create", after })
          return toCatalogItem(after)
        })
      })
    },

    update(endpoint: string, id: string | number, data: CatalogRequest): Promise<CatalogItem> {
      return translateErrors(async () => {
        const model = resolveCatalogModel(endpoint)
        const where = catalogWhereUnique(id)
        const writeData = toCatalogWriteData(model, data, "update")
        return prisma.$transaction(async (tx) => {
          const delegate = delegateFor(tx, model)
          const before = await delegate.findUnique({ where })
          if (!before) throw new CatalogError("El elemento del catálogo no existe.")
          const after = await delegate.update({ where, data: writeData })
          await writeAudit(tx, { userId: actor.userId, model, action: "update", before, after })
          return toCatalogItem(after)
        })
      })
    },

    remove(endpoint: string, id: string | number): Promise<void> {
      return translateErrors(async () => {
        const model = resolveCatalogModel(endpoint)
        const where = catalogWhereUnique(id)
        await prisma.$transaction(async (tx) => {
          const delegate = delegateFor(tx, model)
          const before = await delegate.findUnique({ where })
          if (!before) throw new CatalogError("El elemento del catálogo no existe.")
          await delegate.delete({ where })
          await writeAudit(tx, { userId: actor.userId, model, action: "delete", before })
        })
      })
    },
  }
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>
