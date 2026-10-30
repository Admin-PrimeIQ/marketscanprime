"use server"

import type { StrapiUnit, StrapiUnitsResponse } from "@/lib/api/strapi"
import type { Permission } from "@/lib/auth/permissions"
import { actionFailure, type ActionResult } from "./action-result"
import { getAppPrisma } from "./client"
import { requireRole } from "./session"
import { parseUnitCreate, parseUnitId, parseUnitListParams, parseUnitUpdates } from "./unit-schemas"
import { createUnitRepository, type UnitRepository } from "./units"

/**
 * Server Actions de unidades para la implementación `prisma` de `dataClient`
 * (`lib/api/prisma-client.ts`). Cada una exige sesión y el permiso de su operación (`requireRole`,
 * que también revisa la guarda) y después valida la entrada con Zod. Las escrituras quedan en
 * `audit_log` a nombre del usuario de la sesión.
 */
async function run<T>(permission: Permission, work: (repo: UnitRepository) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireRole(permission)
    return { ok: true, data: await work(createUnitRepository(getAppPrisma(), { userId: user.id })) }
  } catch (error) {
    return actionFailure(error, "Error inesperado en la base nueva")
  }
}

export async function listUnitsAction(params: unknown): Promise<ActionResult<StrapiUnitsResponse>> {
  return run("read", (repo) => repo.list(parseUnitListParams(params)))
}

export async function updateUnitAction(documentId: unknown, updates: unknown): Promise<ActionResult<StrapiUnit>> {
  return run("update", (repo) => repo.update(parseUnitId(documentId), parseUnitUpdates(updates)))
}

export async function createUnitAction(data: unknown): Promise<ActionResult<StrapiUnit>> {
  return run("create", (repo) => repo.create(parseUnitCreate(data)))
}
