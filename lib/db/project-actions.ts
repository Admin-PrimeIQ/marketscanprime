"use server"

import type { StrapiProjectsResponse } from "@/lib/api/strapi"
import { actionFailure, type ActionResult } from "./action-result"
import { getAppPrisma } from "./client"
import type { ProjectListParams } from "./project-list-mapping"
import { parseProjectListParams } from "./project-schemas"
import { createProjectRepository } from "./projects"
import { requireRole } from "./session"

/**
 * Server Actions de proyectos para la implementación `prisma` de `dataClient`. Por ahora solo el
 * listado (`getProjects`), que piden el formulario de perfiles de tipo de cambio y el de bloques.
 */
export async function listProjectsAction(params?: ProjectListParams): Promise<ActionResult<StrapiProjectsResponse>> {
  try {
    await requireRole("read")
    return { ok: true, data: await createProjectRepository(getAppPrisma()).list(parseProjectListParams(params)) }
  } catch (error) {
    return actionFailure(error, "Error inesperado en la base nueva")
  }
}
