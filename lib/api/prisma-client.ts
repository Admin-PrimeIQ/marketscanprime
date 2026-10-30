import type { StrapiAuthResponse, StrapiUser } from "./strapi"
import type { DataClient } from "./client"
import type { ActionResult } from "@/lib/db/action-result"
import { getMeAction, loginAction, logoutAction } from "@/lib/db/auth-actions"
import type { BlockRequest } from "@/lib/db/block-mapping"
import { createBlockAction, getBlockAction, listBlocksAction, updateBlockAction } from "@/lib/db/block-actions"
import {
  createCatalogItemAction,
  deleteCatalogItemAction,
  getCatalogItemAction,
  listCatalogAction,
  updateCatalogItemAction,
} from "@/lib/db/catalog-actions"
import {
  createExchangeRateProfileAction,
  deleteExchangeRateProfileAction,
  getExchangeRateProfileAction,
  listExchangeRateProfilesAction,
  updateExchangeRateProfileAction,
} from "@/lib/db/exchange-rate-profile-actions"
import { createProjectAction, getProjectAction, listProjectsAction, updateProjectAction } from "@/lib/db/project-actions"

/**
 * Implementación `prisma` de `dataClient` (`NEXT_PUBLIC_DATA_BACKEND=prisma`).
 *
 * - Catálogos y perfiles de tipo de cambio: reales, contra `msp_app` vía Server Actions, con permiso por rol.
 * - Proyectos: listado (búsqueda, orden, filtros rápidos y avanzados), detalle, alta y edición; el
 *   filtro de fase responde con un error claro.
 * - Bloques: listado (búsqueda, orden, filtros rápidos y `project.department`), detalle con
 *   financiamiento, alta y edición; el código lo genera el servidor. `getBlocksLite` (de `/sync`)
 *   sigue sin migrar.
 * - Sesión: Better Auth (`lib/auth/server.ts`) con cookie httpOnly; nunca llama a Strapi. El
 *   navegador no ve la cookie: `getMe` la valida en el servidor.
 * - Todo lo demás falla con un error explícito hasta que se migre su módulo.
 *
 * Dónde se puede usar (`next dev` o un despliegue con `MSP_STAGING_DEPLOY=true`) lo decide la guarda
 * de las Server Actions (`lib/db/guard.ts`), no el navegador.
 */

/**
 * Va en `jwt` porque `lib/auth/auth.ts` guarda la respuesta del login tal cual; no es una credencial
 * (la sesión real viaja en la cookie).
 */
const COOKIE_SESSION = "cookie-session"

function notMigrated(method: string): never {
  throw new Error(`"${method}" todavía no está migrado a la base nueva (NEXT_PUBLIC_DATA_BACKEND=prisma).`)
}

function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data
  const error = new Error(result.message) as Error & { details?: string[] }
  if (result.details) error.details = result.details
  throw error
}

export const prismaDataClient: DataClient = {
  async login(identifier: string, password: string): Promise<StrapiAuthResponse> {
    const user = unwrap(await loginAction(identifier, password))
    return { jwt: COOKIE_SESSION, user }
  },
  logout() {
    void logoutAction().catch(() => {})
  },
  isAuthenticated() {
    return true
  },
  async getMe(): Promise<StrapiUser> {
    return unwrap(await getMeAction())
  },
  async forgotPassword() {
    notMigrated("forgotPassword")
  },
  async resetPassword() {
    notMigrated("resetPassword")
  },
  async updateMe() {
    notMigrated("updateMe")
  },
  async changePassword() {
    notMigrated("changePassword")
  },

  async getProjects(params) {
    return unwrap(await listProjectsAction(params))
  },
  async getProjectById(id) {
    return unwrap(await getProjectAction(id))
  },
  async createProject(data) {
    return unwrap(await createProjectAction(data))
  },
  async updateProject(id, data) {
    return unwrap(await updateProjectAction(id, data))
  },

  async getBlocks(params) {
    return unwrap(await listBlocksAction(params))
  },
  async getBlocksLite() {
    notMigrated("getBlocksLite")
  },
  async getBlockById(id) {
    return unwrap(await getBlockAction(id))
  },
  async createBlock(data) {
    return unwrap(await createBlockAction(data as BlockRequest))
  },
  async updateBlock(id, data) {
    return unwrap(await updateBlockAction(id, data as BlockRequest))
  },

  async getUnitsAllPages() {
    notMigrated("getUnitsAllPages")
  },
  async updateUnit() {
    notMigrated("updateUnit")
  },
  async updateUnitBatch() {
    notMigrated("updateUnitBatch")
  },
  async createUnit() {
    notMigrated("createUnit")
  },

  async getExchangeRateProfiles(params) {
    return unwrap(await listExchangeRateProfilesAction(params))
  },
  async getExchangeRateProfileById(id) {
    return unwrap(await getExchangeRateProfileAction(id))
  },
  async createExchangeRateProfile(data) {
    return unwrap(await createExchangeRateProfileAction(data))
  },
  async updateExchangeRateProfile(id, data) {
    return unwrap(await updateExchangeRateProfileAction(id, data))
  },
  async deleteExchangeRateProfile(id) {
    unwrap(await deleteExchangeRateProfileAction(id))
  },

  async getCatalogList(endpoint, params) {
    return unwrap(await listCatalogAction(endpoint, params))
  },
  async getCatalogItem(endpoint, id) {
    return unwrap(await getCatalogItemAction(endpoint, id))
  },
  async createCatalogItem(endpoint, data) {
    return unwrap(await createCatalogItemAction(endpoint, data))
  },
  async updateCatalogItem(endpoint, id, data) {
    return unwrap(await updateCatalogItemAction(endpoint, id, data))
  },
  async deleteCatalogItem(endpoint, id) {
    unwrap(await deleteCatalogItemAction(endpoint, id))
  },
}
