"use server"

import type { CatalogItem, CatalogListResponse, CatalogRequest } from "@/lib/api/strapi"
import { actionFailure, type ActionResult } from "./action-result"
import type { CatalogListParams } from "./catalog-mapping"
import { createCatalogRepository } from "./catalogs"
import { getAppPrisma } from "./client"
import { assertPrismaActionsAllowed } from "./guard"

/** Server Actions de catálogos para la implementación `prisma` de `dataClient` (`lib/api/prisma-client.ts`). */
async function run<T>(work: (repo: ReturnType<typeof createCatalogRepository>) => Promise<T>): Promise<ActionResult<T>> {
  try {
    assertPrismaActionsAllowed()
    return { ok: true, data: await work(createCatalogRepository(getAppPrisma())) }
  } catch (error) {
    return actionFailure(error, "Error inesperado en la base nueva")
  }
}

export async function listCatalogAction(endpoint: string, params?: CatalogListParams): Promise<ActionResult<CatalogListResponse>> {
  return run((repo) => repo.list(endpoint, params))
}

export async function getCatalogItemAction(endpoint: string, id: string | number): Promise<ActionResult<CatalogItem>> {
  return run((repo) => repo.get(endpoint, id))
}

export async function createCatalogItemAction(endpoint: string, data: CatalogRequest): Promise<ActionResult<CatalogItem>> {
  return run((repo) => repo.create(endpoint, data))
}

export async function updateCatalogItemAction(
  endpoint: string,
  id: string | number,
  data: CatalogRequest,
): Promise<ActionResult<CatalogItem>> {
  return run((repo) => repo.update(endpoint, id, data))
}

export async function deleteCatalogItemAction(endpoint: string, id: string | number): Promise<ActionResult<null>> {
  return run(async (repo) => {
    await repo.remove(endpoint, id)
    return null
  })
}
