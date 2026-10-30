"use server"

import type { StrapiProject, StrapiProjectsResponse } from "@/lib/api/strapi"
import type { Permission } from "@/lib/auth/permissions"
import { actionFailure, type ActionResult } from "./action-result"
import { getAppPrisma } from "./client"
import type { ProjectListParams } from "./project-list-mapping"
import type { ProjectRequest } from "./project-mapping"
import { parseProjectId, parseProjectListParams, parseProjectRequest } from "./project-schemas"
import { createProjectRepository, type ProjectRepository } from "./projects"
import { requireRole } from "./session"

/**
 * Server Actions de proyectos para la implementación `prisma` de `dataClient`
 * (`lib/api/prisma-client.ts`). Cada una exige sesión y el permiso de su operación (`requireRole`,
 * que también revisa la guarda) y después valida la entrada con Zod. Las escrituras quedan en
 * `audit_log` a nombre del usuario de la sesión.
 */
async function run<T>(permission: Permission, work: (repo: ProjectRepository) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireRole(permission)
    return { ok: true, data: await work(createProjectRepository(getAppPrisma(), { userId: user.id })) }
  } catch (error) {
    return actionFailure(error, "Error inesperado en la base nueva")
  }
}

export async function listProjectsAction(params?: ProjectListParams): Promise<ActionResult<StrapiProjectsResponse>> {
  return run("read", (repo) => repo.list(parseProjectListParams(params)))
}

export async function getProjectAction(id: string | number): Promise<ActionResult<StrapiProject>> {
  return run("read", (repo) => repo.get(parseProjectId(id)))
}

export async function createProjectAction(data: ProjectRequest): Promise<ActionResult<StrapiProject>> {
  return run("create", (repo) => repo.create(parseProjectRequest(data)))
}

export async function updateProjectAction(id: string | number, data: ProjectRequest): Promise<ActionResult<StrapiProject>> {
  return run("update", (repo) => repo.update(parseProjectId(id), parseProjectRequest(data)))
}
