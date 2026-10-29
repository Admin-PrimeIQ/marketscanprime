"use server"

import type { StrapiExchangeRateProfile, StrapiExchangeRateProfilesResponse } from "@/lib/api/strapi"
import type { Permission } from "@/lib/auth/permissions"
import { actionFailure, type ActionResult } from "./action-result"
import { getAppPrisma } from "./client"
import type { ExchangeRateProfileRequest } from "./exchange-rate-profile-mapping"
import { parseProfileId, parseProfileListParams, parseProfileRequest, type ProfileListParams } from "./exchange-rate-profile-schemas"
import { createExchangeRateProfileRepository, type ExchangeRateProfileRepository } from "./exchange-rate-profiles"
import { requireRole } from "./session"

/**
 * Server Actions de perfiles de tipo de cambio para la implementación `prisma` de `dataClient`
 * (`lib/api/prisma-client.ts`). Cada una exige sesión y el permiso de su operación (`requireRole`,
 * que también revisa la guarda) y después valida la entrada con Zod. Las escrituras quedan en
 * `audit_log` a nombre del usuario de la sesión.
 */
async function run<T>(permission: Permission, work: (repo: ExchangeRateProfileRepository) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireRole(permission)
    return { ok: true, data: await work(createExchangeRateProfileRepository(getAppPrisma(), { userId: user.id })) }
  } catch (error) {
    return actionFailure(error, "Error inesperado en la base nueva")
  }
}

export async function listExchangeRateProfilesAction(
  params?: ProfileListParams,
): Promise<ActionResult<StrapiExchangeRateProfilesResponse>> {
  return run("read", (repo) => repo.list(parseProfileListParams(params)))
}

export async function getExchangeRateProfileAction(id: string | number): Promise<ActionResult<StrapiExchangeRateProfile>> {
  return run("read", (repo) => repo.get(parseProfileId(id)))
}

export async function createExchangeRateProfileAction(
  data: ExchangeRateProfileRequest,
): Promise<ActionResult<StrapiExchangeRateProfile>> {
  return run("create", (repo) => repo.create(parseProfileRequest(data)))
}

export async function updateExchangeRateProfileAction(
  id: string | number,
  data: ExchangeRateProfileRequest,
): Promise<ActionResult<StrapiExchangeRateProfile>> {
  return run("update", (repo) => repo.update(parseProfileId(id), parseProfileRequest(data)))
}

export async function deleteExchangeRateProfileAction(id: string | number): Promise<ActionResult<null>> {
  return run("delete", async (repo) => {
    await repo.remove(parseProfileId(id))
    return null
  })
}
