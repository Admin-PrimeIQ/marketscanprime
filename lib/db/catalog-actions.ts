"use server"

import type { CatalogItem, CatalogListResponse, CatalogRequest } from "@/lib/api/strapi"
import type { Permission } from "@/lib/auth/permissions"
import { actionFailure, type ActionResult } from "./action-result"
import type { CatalogListParams } from "./catalog-mapping"
import { parseCatalogEndpoint, parseCatalogId, parseCatalogListParams, parseCatalogRequest } from "./catalog-schemas"
import { createCatalogRepository } from "./catalogs"
import { getAppPrisma } from "./client"
import { requireRole } from "./session"

/**
 * Server Actions de catálogos para la implementación `prisma` de `dataClient` (`lib/api/prisma-client.ts`).
 * Cada una exige sesión y el permiso de su operación (`requireRole`, que también revisa la guarda) y
 * después valida la entrada con Zod (`catalog-schemas.ts`).
 */
async function run<T>(
  permission: Permission,
  work: (repo: ReturnType<typeof createCatalogRepository>) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    await requireRole(permission)
    return { ok: true, data: await work(createCatalogRepository(getAppPrisma())) }
  } catch (error) {
    return actionFailure(error, "Error inesperado en la base nueva")
  }
}

export async function listCatalogAction(endpoint: string, params?: CatalogListParams): Promise<ActionResult<CatalogListResponse>> {
  return run("read", (repo) => repo.list(parseCatalogEndpoint(endpoint), parseCatalogListParams(params)))
}

export async function getCatalogItemAction(endpoint: string, id: string | number): Promise<ActionResult<CatalogItem>> {
  return run("read", (repo) => repo.get(parseCatalogEndpoint(endpoint), parseCatalogId(id)))
}

export async function createCatalogItemAction(endpoint: string, data: CatalogRequest): Promise<ActionResult<CatalogItem>> {
  return run("create", (repo) => repo.create(parseCatalogEndpoint(endpoint), parseCatalogRequest(data)))
}

export async function updateCatalogItemAction(
  endpoint: string,
  id: string | number,
  data: CatalogRequest,
): Promise<ActionResult<CatalogItem>> {
  return run("update", (repo) => repo.update(parseCatalogEndpoint(endpoint), parseCatalogId(id), parseCatalogRequest(data)))
}

export async function deleteCatalogItemAction(endpoint: string, id: string | number): Promise<ActionResult<null>> {
  return run("delete", async (repo) => {
    await repo.remove(parseCatalogEndpoint(endpoint), parseCatalogId(id))
    return null
  })
}
