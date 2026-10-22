import type { StrapiAuthResponse, StrapiUser } from "./strapi"
import type { DataClient } from "./client"
import type { ActionResult } from "@/lib/db/action-result"
import { devLoginAction } from "@/lib/db/auth-actions"
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
 * - Catálogos: reales, contra `msp_app` vía Server Actions.
 * - Login: valida usuario y clave contra la tabla `user` de `msp_app` (hashes bcrypt de Strapi).
 *   Nunca llama a Strapi. La sesión vive en `localStorage` y solo en `next dev`; la reemplaza Auth.js.
 * - Todo lo demás falla con un error explícito hasta que se migre su módulo.
 */

const DEV_SESSION_KEY = "msp_dev_session"
const DEV_TOKEN = "dev-local"

function assertDevSession(): void {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("El backend prisma todavía no tiene autenticación: solo se puede usar en desarrollo local.")
  }
}

function readDevSession(): StrapiUser | null {
  if (typeof window === "undefined") return null
  try {
    const user = JSON.parse(localStorage.getItem(DEV_SESSION_KEY) ?? "null") as StrapiUser | null
    return user && typeof user.email === "string" ? user : null
  } catch {
    return null
  }
}

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
    assertDevSession()
    const user = unwrap(await devLoginAction(identifier, password))
    localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(user))
    return { jwt: DEV_TOKEN, user }
  },
  logout() {
    if (typeof window !== "undefined") localStorage.removeItem(DEV_SESSION_KEY)
  },
  isAuthenticated() {
    return readDevSession() !== null
  },
  async getMe() {
    assertDevSession()
    const user = readDevSession()
    if (!user) throw new Error("No hay sesión local de desarrollo.")
    return user
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
