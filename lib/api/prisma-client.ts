import type { StrapiAuthResponse, StrapiUser } from "./strapi"
import type { DataClient } from "./client"
import type { ActionResult } from "@/lib/db/action-result"
import { getMeAction, loginAction, logoutAction } from "@/lib/db/auth-actions"
import {
  createCatalogItemAction,
  deleteCatalogItemAction,
  getCatalogItemAction,
  listCatalogAction,
  updateCatalogItemAction,
} from "@/lib/db/catalog-actions"

/**
 * Implementación `prisma` de `dataClient` (`NEXT_PUBLIC_DATA_BACKEND=prisma`).
 *
 * - Catálogos: reales, contra `msp_app` vía Server Actions, con permiso por rol.
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

  async getProjects() {
    notMigrated("getProjects")
  },
  async getProjectById() {
    notMigrated("getProjectById")
  },
  async createProject() {
    notMigrated("createProject")
  },
  async updateProject() {
    notMigrated("updateProject")
  },

  async getBlocks() {
    notMigrated("getBlocks")
  },
  async getBlocksLite() {
    notMigrated("getBlocksLite")
  },
  async getBlockById() {
    notMigrated("getBlockById")
  },
  async createBlock() {
    notMigrated("createBlock")
  },
  async updateBlock() {
    notMigrated("updateBlock")
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

  async getExchangeRateProfiles() {
    notMigrated("getExchangeRateProfiles")
  },
  async getExchangeRateProfileById() {
    notMigrated("getExchangeRateProfileById")
  },
  async createExchangeRateProfile() {
    notMigrated("createExchangeRateProfile")
  },
  async updateExchangeRateProfile() {
    notMigrated("updateExchangeRateProfile")
  },
  async deleteExchangeRateProfile() {
    notMigrated("deleteExchangeRateProfile")
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
