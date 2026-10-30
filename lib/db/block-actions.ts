"use server"

import type { StrapiBlock, StrapiBlocksResponse } from "@/lib/api/strapi"
import type { Permission } from "@/lib/auth/permissions"
import { actionFailure, type ActionResult } from "./action-result"
import type { BlockListParams } from "./block-list-mapping"
import type { BlockRequest } from "./block-mapping"
import { parseBlockId, parseBlockListParams, parseBlockRequest } from "./block-schemas"
import { createBlockRepository, type BlockRepository } from "./blocks"
import { getAppPrisma } from "./client"
import { requireRole } from "./session"

/**
 * Server Actions de bloques para la implementación `prisma` de `dataClient`
 * (`lib/api/prisma-client.ts`). Cada una exige sesión y el permiso de su operación (`requireRole`,
 * que también revisa la guarda) y después valida la entrada con Zod. Las escrituras quedan en
 * `audit_log` a nombre del usuario de la sesión.
 */
async function run<T>(permission: Permission, work: (repo: BlockRepository) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireRole(permission)
    return { ok: true, data: await work(createBlockRepository(getAppPrisma(), { userId: user.id })) }
  } catch (error) {
    return actionFailure(error, "Error inesperado en la base nueva")
  }
}

export async function listBlocksAction(params?: BlockListParams): Promise<ActionResult<StrapiBlocksResponse>> {
  return run("read", (repo) => repo.list(parseBlockListParams(params)))
}

export async function getBlockAction(id: string | number): Promise<ActionResult<StrapiBlock>> {
  return run("read", (repo) => repo.get(parseBlockId(id)))
}

export async function createBlockAction(data: BlockRequest): Promise<ActionResult<StrapiBlock>> {
  return run("create", (repo) => repo.create(parseBlockRequest(data)))
}

export async function updateBlockAction(id: string | number, data: BlockRequest): Promise<ActionResult<StrapiBlock>> {
  return run("update", (repo) => repo.update(parseBlockId(id), parseBlockRequest(data)))
}
