import type { BlockFinancing } from "@/lib/financing"
/**
 * Cliente API para Strapi v5.30.0
 * Maneja todas las comunicaciones con el backend de Strapi
 */

import { getUnitTypeZone } from "@/lib/units/unit-type-dynamic-columns"

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || 'http://localhost:1337'
const API_URL = `${STRAPI_URL}/api`

/**
 * Precios en moneda distinta de USD (p. ej. totalPriceGTQ) solo existen en el grid para edición/conversión.
 * Strapi persiste únicamente atributos *USD — estas claves provocan 400 "Invalid key" si se envían.
 * Debe coincidir con `FOREIGN_PRICE_COLUMN_KEY_RE` en datasheet-units-table.
 */
const CLIENT_ONLY_FOREIGN_PRICE_KEY_RE =
  /^(totalPrice|priceWithoutVAT|pricePerM2|rentalPrice|rentalPriceWithoutVAT|rentalPricePerM2WithoutVAT|maintenanceTotalPriceM2|maintenanceWithoutVAT|maintenancePricePerM2|installment|income)([A-Z]{3})$/

/**
 * Campos USD que existen solo en el cliente como pivot de cálculo pero NO están en el schema de Strapi.
 * maintenanceWithoutVATUSD es derivado de maintenanceTotalPriceM2USD — Strapi solo persiste esos dos.
 */
const CLIENT_ONLY_USD_FIELDS = new Set(["maintenanceWithoutVATUSD"])

function isClientOnlyForeignPriceKey(field: string): boolean {
  if (CLIENT_ONLY_USD_FIELDS.has(field)) return true
  const m = field.match(CLIENT_ONLY_FOREIGN_PRICE_KEY_RE)
  return Boolean(m && m[2] !== "USD")
}

function stripClientOnlyForeignPriceKeys(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (isClientOnlyForeignPriceKey(k)) {
      delete obj[k]
    }
  }
}

/** Public Strapi origin (same as API client). Trailing slash stripped. */
export function getStrapiPublicBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_STRAPI_URL
  const base =
    typeof raw === "string" && raw.trim() !== ""
      ? raw.trim()
      : "http://localhost:1337"
  return base.replace(/\/$/, "")
}

/** Rol de usuario (Users-Permissions-Role) */
export interface StrapiUserRole {
  id: number
  name: string
  description?: string
  type?: string
}

export interface StrapiUser {
  id: number
  username: string
  email: string
  provider: string
  confirmed: boolean
  blocked: boolean
  createdAt: string
  updatedAt: string
  /** Rol del usuario (viene al usar populate=role en GET /users/me) */
  role?: StrapiUserRole
}

export interface StrapiAuthResponse {
  jwt: string
  user: StrapiUser
}

export interface StrapiError {
  error: {
    status: number
    name: string
    message: string
    details?: unknown
  }
}

// Tipos para Proyectos
export interface StrapiCategory {
  id?: number
  documentId?: string
  name: string
  description?: string
  code: string
  isActive?: boolean
  sortOrder?: number
  locale?: string
  localizations?: (string | number)[]
}

export interface StrapiProjectLocation {
  city: string
  zone: number
  address: string
  country: string
  coordinates?: {
    lat: number
    lng: number
  }
}

export interface StrapiProjectTotals {
  totalArea: number
  totalUnits: number
  parkingSpaces: number
  commercialAreas: number
}

export interface StrapiProjectFinancingParam {
  maxLoanTerm: number
  interestRate: number
  minDownPayment: number
}

export interface StrapiProjectSegmentRule {
  currency: string
  priceRange: {
    max: number
    min: number
  }
  targetSegment: string
}

export interface StrapiCurrenciesComponent {
  id?: number
  mxn?: {
    id?: number
    buyRate?: number
    sellRate?: number
  }
  gtq?: {
    id?: number
    buyRate?: number
    sellRate?: number
  }
  hnl?: {
    id?: number
    buyRate?: number
    sellRate?: number
  }
  crc?: {
    id?: number
    buyRate?: number
    sellRate?: number
  }
  nio?: {
    id?: number
    buyRate?: number
    sellRate?: number
  }
  pab?: {
    id?: number
    buyRate?: number
    sellRate?: number
  }
  bzd?: {
    id?: number
    buyRate?: number
    sellRate?: number
  }
}

const CURRENCY_SUBCOMPONENT_KEYS: (keyof Omit<StrapiCurrenciesComponent, 'id'>)[] = [
  'mxn',
  'gtq',
  'hnl',
  'crc',
  'nio',
  'pab',
  'bzd',
]

/**
 * Strapi v5 rechaza `id` en el body al crear/actualizar componentes (p. ej. currencies).
 * Solo envía buyRate/sellRate por moneda; sin ids anidados.
 */
export function sanitizeCurrenciesComponentForWrite(
  c: StrapiCurrenciesComponent | null | undefined
): StrapiCurrenciesComponent | null {
  if (c === null || c === undefined) return null
  const out: StrapiCurrenciesComponent = {}
  for (const k of CURRENCY_SUBCOMPONENT_KEYS) {
    const v = c[k]
    if (v && typeof v === 'object') {
      const buyRate = v.buyRate
      const sellRate = v.sellRate
      if (buyRate !== undefined || sellRate !== undefined) {
        out[k] = { buyRate, sellRate }
      }
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Unidades de moneda local por 1 USD (misma convención que el formulario de monedas).
 * - `buyRate`: cuánta moneda local equivale a 1 USD.
 * - Si solo hay `sellRate` (USD por 1 unidad local), entonces local por USD = 1 / sellRate.
 */
export function localCurrencyUnitsPerOneUsd(
  entry: { buyRate?: number; sellRate?: number } | undefined | null
): number | null {
  if (!entry || typeof entry !== 'object') return null
  const buy = entry.buyRate
  if (typeof buy === 'number' && buy > 0 && !Number.isNaN(buy)) return buy
  const sell = entry.sellRate
  if (typeof sell === 'number' && sell > 0 && !Number.isNaN(sell)) return 1 / sell
  return null
}

function projectCurrenciesHasConfiguredRate(
  c: StrapiCurrenciesComponent | undefined | null
): boolean {
  if (!c || typeof c !== 'object') return false
  for (const k of CURRENCY_SUBCOMPONENT_KEYS) {
    if (localCurrencyUnitsPerOneUsd(c[k]) != null) return true
  }
  return false
}

export interface StrapiProject {
  id: number
  documentId: string
  name: string
  code: string
  developer?: string | {
    id?: number
    documentId?: string
    code?: string
    name?: string
    description?: string
  }
  country?: {
    id?: number
    documentId?: string
    code?: string
    name?: string
    isoCode?: string
    isoCode2?: string
  }
  department?: string
  municipality?: string
  zone?: string
  subzone?: string
  /**
   * Los bloques del proyecto, tal como los popula `getProjects`.
   *
   * `quarter` y `domain` están declarados porque la UI deriva de ellos dos
   * filtros que el proyecto no puede responder solo: la región sale del
   * trimestre, y el tipo de inmueble no existe como campo del proyecto — vive
   * en el bloque, que es lo que decide contra qué tablas se sincroniza.
   */
  blocks?: Array<{ id?: number; documentId?: string; quarter?: string | null; domain?: BlockDomain | null }>
  latitude?: number
  longitude?: number
  nse?: string | {
    id?: number
    documentId?: string
    code?: string
    name?: string
  }
  securityType?: string | {
    id?: number
    documentId?: string
    code?: string
    name?: string
  }
  muvi?: boolean
  showroom?: boolean
  modelHouse?: boolean
  accessQuantity?: number
  imageUrl?: string
  fha?: boolean
  fractionalDownPayment?: boolean
  downPaymentPercentage?: number
  /** Tasas del proyecto: vienen del perfil enlazado (`exchangeRateProfile.currencies`) o normalizadas aquí. */
  currencies?: StrapiCurrenciesComponent
  /** Relación api::exchange-rate-profile.exchange-rate-profile (documentId en writes). */
  exchangeRateProfile?: StrapiExchangeRateProfile | null
  amenities?: Array<{
    id?: number
    documentId?: string
    name?: string
    description?: string
    code?: string
    icon?: string
    category?: string
  }>
  services?: Array<{
    id?: number
    documentId?: string
    name?: string
    description?: string
    code?: string
    serviceType?: string
    isEssential?: boolean
  }>
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

// Tipos para Unidades (UIDs Strapi en dynamic zone unitType)
export interface StrapiUnitTypeHousing {
  id?: number
  __component: "unit-types.housing"
  bedrooms?: number
  balconyTerraceSizeM2?: number
}

export interface StrapiUnitTypeOffices {
  id?: number
  __component: "unit-types.offices"
  balconyTerraceSizeM2?: number
  employeeCapacity?: number
  parkingForSale?: number
  priceWithoutParkingM2USD?: number
  propertyValueWithoutParkingUSD?: number
  officeClassification?: string
  generalSizeClassification?: string
  employeeCapacityRange?: string
  m2Range?: string
  sizeEmployeeCapacityCombined?: string
  sizeM2Combined?: string
}

export interface StrapiUnitTypeIndustrial {
  id?: number
  __component: "unit-types.industrial"
  warehouseStorageSizeM2?: number
  officeSizeM2?: number
  mezzanineSizeM2?: number
  loadingAreaM2?: number
  width1M2?: number
  depth1M2?: number
  depth2M2?: number
  heightM2?: number
  additionalParkingPriceUSD?: number
}

export type StrapiUnitType =
  | StrapiUnitTypeHousing
  | StrapiUnitTypeOffices
  | StrapiUnitTypeIndustrial

export interface StrapiUnit {
  id?: number
  /** Solo cliente: `temp-…` estable para filas nuevas; no enviar a Strapi. */
  clientTempId?: string
  documentId?: string
  code?: string
  name?: string
  legacyId?: string
  unitNumber?: string
  model?: string
  topography?: {
    id?: number
    documentId?: string
    name?: string
    code?: string
  }
  frontM2?: number
  depthM2?: number
  landM2?: number
  unitSizeM2?: number
  parkingSizeM2?: number
  totalSizeM2?: number
  habitableConstructionM2?: number
  bathrooms?: number
  hasParking?: boolean
  hasMotorcycleParking?: boolean
  parkingType?: {
    id?: number
    documentId?: string
    name?: string
    code?: string
  }
  parkingSpaces?: number
  availability?: 'Available' | 'Not Available'
  unitUsage?: {
    id?: number
    documentId?: string
    name?: string
    code?: string
  }
  unitType?: StrapiUnitType[]
  totalPriceUSD?: number
  priceWithoutVATUSD?: number
  pricePerM2USD?: number
  rentalPriceUSD?: number
  rentalPriceWithoutVATUSD?: number
  rentalPricePerM2WithoutVATUSD?: number
  maintenanceTotalPriceM2USD?: number
  maintenancePricePerM2USD?: number
  installmentUSD?: number
  incomeUSD?: number
  unitAbsorption?: number
  absorptionPerM2?: number
  block?: {
    id?: number
    documentId?: string
    code?: string
    name?: string
    project?: {
      id?: number
      documentId?: string
      code?: string
      name?: string
    }
  }
  createdAt?: string
  updatedAt?: string
  publishedAt?: string
}

export interface StrapiUnitsResponse {
  data: StrapiUnit[]
  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}

export interface StrapiProjectsResponse {
  data: StrapiProject[]
  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}

// Tipos para Blocks
/** Los tres dominios del warehouse. Mismo conjunto que el selector de /sync. */
export type BlockDomain = "housing" | "office" | "industrial"

export interface StrapiBlock {
  id?: number
  documentId?: string
  code?: string
  name?: string
  legacyId?: string
  phase?: string
  tower?: string
  sector?: string
  year: number
  quarter: 'T1' | 'T2' | 'T3' | 'T4' | 'S1' | 'S2'
  collectionDate?: string
  project?: {
    id?: number
    documentId?: string
    code?: string
    name?: string
    department?: string
    municipality?: string
    zone?: string
    subzone?: string
    country?: {
      id?: number
      documentId?: string
      code?: string
      name?: string
      isoCode?: string
      isoCode2?: string
    }
  }
  blockCategory?: {
    id?: number
    documentId?: string
    name?: string
    code?: string
  }
  /**
   * Qué tipo de inmueble contiene el bloque. Decide contra QUÉ TABLAS del
   * warehouse se sincroniza —`housing_universe` y `office_universe` no
   * comparten columnas ni nombres—, así que no es una etiqueta: un bloque de
   * oficinas marcado como vivienda se migra contra las tablas equivocadas.
   *
   * Strapi tiene `default: "housing"`, de modo que nunca llega vacío. El riesgo
   * no es el null: es que quede MAL sin que nadie lo note, y por eso el
   * formulario obliga a elegirlo al crear en vez de dejar correr el default.
   */
  domain?: BlockDomain

  /** Parqueos del bloque destinados a venta (`parqueos_para_venta` en SQL). */
  parkingForSale?: number
  /**
   * Términos de financiamiento. SÓLO vivienda: `banking_info` no existe para
   * oficinas ni industrial, así que en esos dos el campo viene ausente y el
   * formulario no muestra la sección.
   */
  financing?: BlockFinancing | null

  blockFocus?: {
    id?: number
    documentId?: string
    name?: string
    code?: string
  }
  blockStatus?: {
    id?: number
    documentId?: string
    name?: string
    code?: string
  }
  market?: 'Primary' | 'Secondary'
  startDate?: string
  deliveryDate?: string
  commercializationMonths?: number
  totalUnits?: number
  totalM2?: number
  availableUnits?: number
  availableM2?: number
  averagePriceUSD?: number
  averageSizeM2?: number
  averagePricePerM2USD?: number
  averageInstallmentUSD?: number
  averageIncomeUSD?: number
  additionalParkingPriceUSD?: number
  visitorParking?: number
  assignedParking?: number
  totalProjectParking?: number
  createdAt?: string
  updatedAt?: string
  publishedAt?: string
}

export interface StrapiBlocksResponse {
  data: StrapiBlock[]
  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}

/** Perfiles de tipo de cambio (api::exchange-rate-profile.exchange-rate-profile) */
export interface StrapiExchangeRateProfile {
  id?: number
  documentId?: string
  name?: string
  code?: string
  description?: string
  currencies?: StrapiCurrenciesComponent
  projects?: Array<{
    id?: number
    documentId?: string
    code?: string
    name?: string
  }>
  createdAt?: string
  updatedAt?: string
  publishedAt?: string
}

export interface StrapiExchangeRateProfilesResponse {
  data: StrapiExchangeRateProfile[]
  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}

/** documentId preferido para relaciones Strapi v5 (string | number en el API). */
export function getRelationDocumentId(rel: unknown): string | undefined {
  if (rel == null) return undefined
  if (typeof rel === 'string' || typeof rel === 'number') return String(rel)
  if (typeof rel === 'object') {
    const o = rel as { documentId?: string; id?: number }
    if (o.documentId) return String(o.documentId)
    if (o.id != null) return String(o.id)
  }
  return undefined
}

/**
 * El proyecto ya no expone `currencies` en populate; vienen en `exchangeRateProfile.currencies`.
 * Mantiene `project.currencies` para el resto del front sin cambiar cada pantalla.
 */
export function normalizeProjectCurrenciesFromExchangeProfile(
  project: StrapiProject
): StrapiProject {
  if (projectCurrenciesHasConfiguredRate(project.currencies)) return project
  const erp = project.exchangeRateProfile
  if (!erp || typeof erp !== 'object') return project
  const nested = erp.currencies
  if (!nested) return project
  return { ...project, currencies: nested }
}

// Tipos genéricos para catálogos
export interface CatalogItem {
  id?: number
  documentId?: string
  name: string
  code?: string
  description?: string
  isoCode?: string // Para countries
  isoCode2?: string // Para countries
  createdAt?: string
  updatedAt?: string
  publishedAt?: string
  createdBy?: {
    id?: number
    documentId?: string
    username?: string
    firstname?: string
    lastname?: string
    email?: string // Puede no estar disponible por seguridad
  }
  updatedBy?: {
    id?: number
    documentId?: string
    username?: string
    firstname?: string
    lastname?: string
    email?: string // Puede no estar disponible por seguridad
  }
}

export interface CatalogListResponse {
  data: CatalogItem[]
  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}

export interface CatalogResponse {
  data: CatalogItem
  meta?: unknown
}

export interface CatalogRequest {
  name: string
  code?: string
  description?: string
  isoCode?: string // Para countries (alpha-2, requerido)
  isoCode2?: string // Para countries (alpha-3, opcional)
}

// Definición de catálogos por tipo (estructura base, nombres se obtienen de traducciones)
export const CATALOG_TYPES = {
  projects: {
    catalogs: [
      { key: 'amenities', endpoint: 'amenities' },
      { key: 'countries', endpoint: 'countries' },
      { key: 'developers', endpoint: 'developers' },
      { key: 'nses', endpoint: 'nses' },
      { key: 'security-types', endpoint: 'security-types' },
      { key: 'services', endpoint: 'services' },
    ],
  },
  blocks: {
    catalogs: [
      { key: 'block-categories', endpoint: 'block-categories' },
      { key: 'block-focuses', endpoint: 'block-focuses' },
      { key: 'block-statuses', endpoint: 'block-statuses' },
      { key: 'block-types', endpoint: 'block-types' },
    ],
  },
  units: {
    catalogs: [
      { key: 'unit-parking-types', endpoint: 'unit-parking-types' },
      { key: 'unit-topographies', endpoint: 'unit-topographies' },
      { key: 'unit-usages', endpoint: 'unit-usages' },
    ],
  },
} as const

/**
 * Strapi v5 REST: los componentes dentro de `unitType` (dynamic zone) no deben incluir `id` en el body del PUT.
 * @see https://docs.strapi.io — ValidationError "Invalid key id"
 */
function sanitizeUnitTypeArrayForWrite(components: unknown[]): unknown[] {
  return components.map((entry) => {
    if (!entry || typeof entry !== "object") return entry
    const { id: _omit, ...rest } = entry as Record<string, unknown>
    return rest
  })
}

/** Evita que un `unitType` mínimo (ej. solo `__component` tras el dropdown) borre campos ya guardados. */
function mergeUnitTypeWithServer(incoming: unknown[], serverArr: unknown[]): unknown[] {
  return incoming.map((inc, i) => {
    const incObj =
      inc && typeof inc === "object" ? ({ ...(inc as Record<string, unknown>) }) : {}
    const srvRaw = serverArr[i]
    const srv =
      srvRaw && typeof srvRaw === "object" ? ({ ...(srvRaw as Record<string, unknown>) }) : null
    const incComp = incObj.__component
    const srvComp = srv?.__component
    if (
      srv &&
      typeof incComp === "string" &&
      typeof srvComp === "string" &&
      incComp === srvComp
    ) {
      return { ...srv, ...incObj }
    }
    return incObj
  })
}

/** Orden de tabla: más antiguo arriba, más nuevo abajo (createdAt ascendente). */
function sortUnitsOldestFirstNewestLast(units: StrapiUnit[]): void {
  units.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : NaN
    const tb = b.createdAt ? Date.parse(b.createdAt) : NaN
    const aOk = !Number.isNaN(ta)
    const bOk = !Number.isNaN(tb)
    if (aOk && bOk && ta !== tb) return ta - tb
    if (aOk !== bOk) return aOk ? 1 : -1
    return (a.id ?? 0) - (b.id ?? 0)
  })
}

class StrapiClient {
  private baseURL: string

  constructor() {
    // In the browser, route all Strapi calls through the Next.js proxy
    // (/api/strapi/[...path]) so they are logged server-side.
    // On the server (SSR/API routes), call Strapi directly to avoid loopback.
    if (typeof window !== "undefined") {
      this.baseURL = "/api/strapi"
    } else {
      this.baseURL = API_URL
    }
  }

  /**
   * Realiza una petición autenticada a Strapi
   * Maneja el formato de respuesta de Strapi v5 que puede ser { data: {...} } o directamente el objeto
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken()
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      let errorMessage = 'Error en la petición'
      let responseText = ''

      let errorData: StrapiError | null = null
      
      try {
        responseText = await response.text()
        if (responseText) {
          try {
            const parsed = JSON.parse(responseText)
            errorData = parsed as StrapiError
            errorMessage = errorData.error?.message || errorMessage
          } catch {
            errorMessage = responseText || response.statusText || errorMessage
          }
        } else {
          errorMessage = response.statusText || errorMessage
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }

      // Log para debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('Error en petición Strapi:', {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          responseText,
          errorData,
        })
      }

      // Crear un error con información adicional
      const error = new Error(errorMessage) as Error & { strapiError?: StrapiError }
      error.strapiError = errorData || undefined
      throw error
    }

    const jsonResponse = await response.json()
    
    // Strapi v5 puede devolver { data: {...} } o directamente el objeto
    if (jsonResponse && typeof jsonResponse === 'object' && 'data' in jsonResponse) {
      return jsonResponse.data as T
    }
    
    return jsonResponse as T
  }

  /**
   * Obtiene el token JWT del localStorage
   */
  private getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('strapi_token')
  }

  /**
   * Guarda el token JWT en localStorage
   */
  private setToken(token: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem('strapi_token', token)
  }

  /**
   * Elimina el token JWT
   */
  private removeToken(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem('strapi_token')
  }

  /**
   * Autentica un usuario con email y contraseña
   * Endpoint: POST /api/auth/local
   */
  async login(identifier: string, password: string): Promise<StrapiAuthResponse> {
    try {
      const loginUrl = `${STRAPI_URL}/api/auth/local`
      
      // Log de la petición en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.log('🔵 Intentando autenticar en:', loginUrl)
      }

      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier, // Puede ser email o username
          password,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Error al iniciar sesión'
        let errorDetails: StrapiError | null = null
        let responseText = ''

        try {
          // Intentar obtener el texto de la respuesta primero
          responseText = await response.text()
          
          // Intentar parsear como JSON si hay contenido
          if (responseText && responseText.trim()) {
            try {
              const parsed = JSON.parse(responseText)
              errorDetails = parsed
              
              // Strapi puede devolver el error en diferentes formatos
              // Intentar extraer el mensaje de diferentes formas
              if (parsed.error?.message) {
                errorMessage = parsed.error.message
              } else if (parsed.message) {
                errorMessage = parsed.message
              } else if (typeof parsed === 'string') {
                errorMessage = parsed
              } else if (parsed.data?.error?.message) {
                errorMessage = parsed.data.error.message
              }
            } catch (parseError) {
              // Si no es JSON válido, usar el texto como mensaje
              errorMessage = responseText || response.statusText || errorMessage
            }
          } else {
            errorMessage = response.statusText || 'Error al iniciar sesión'
          }
        } catch (textError) {
          // Si no se puede obtener el texto, usar el status text
          errorMessage = response.statusText || 'Error al iniciar sesión'
        }

        // Mensajes más descriptivos según el código de estado
        if (response.status === 400) {
          // Si tenemos un mensaje específico de Strapi, usarlo; si no, mensaje genérico
          const strapiMessage = errorDetails?.error?.message
          if (strapiMessage) {
            errorMessage = strapiMessage
          } else if (!errorMessage || errorMessage === 'Error al iniciar sesión') {
            errorMessage = 'Credenciales inválidas. Verifica tu email/username y contraseña.'
          }
        } else if (response.status === 401) {
          errorMessage = (errorDetails && errorDetails.error?.message) || errorMessage || 'No autorizado. Verifica tus credenciales.'
        } else if (response.status === 403) {
          errorMessage = (errorDetails && errorDetails.error?.message) || errorMessage || 'Acceso denegado. Tu cuenta puede estar bloqueada o no confirmada.'
        } else if (response.status === 404) {
          errorMessage = 'Endpoint de autenticación no encontrado. Verifica la URL de Strapi en .env.local'
        } else if (response.status >= 500) {
          errorMessage = (errorDetails && errorDetails.error?.message) || 'Error del servidor. Por favor, intenta más tarde.'
        }

        // Log para debugging (solo en desarrollo)
        if (process.env.NODE_ENV === 'development') {
          console.group('🔴 Error de autenticación Strapi')
          console.error('Status:', response.status)
          console.error('Status Text:', response.statusText)
          console.error('URL:', `${STRAPI_URL}/api/auth/local`)
          console.error('Response Text:', responseText || '(vacío)')
          console.error('Error Details:', errorDetails || '(null)')
          console.error('Headers:', Object.fromEntries(response.headers.entries()))
          console.error('Content-Type:', response.headers.get('content-type'))
          console.groupEnd()
        }

        throw new Error(errorMessage)
      }

      const data: StrapiAuthResponse = await response.json()
      
      // Validar que la respuesta tenga los campos necesarios
      if (!data.jwt || !data.user) {
        throw new Error('Respuesta inválida del servidor. Falta token o información de usuario.')
      }
      
      // Guardar token
      this.setToken(data.jwt)
      
      return data
    } catch (error) {
      // Si es un error de red, mostrar mensaje más claro
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('No se pudo conectar con el servidor. Verifica que Strapi esté ejecutándose y que la URL sea correcta.')
      }
      
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Error desconocido al iniciar sesión')
    }
  }

  /**
   * Solicita un enlace de recuperación de contraseña
   * Endpoint: POST /api/auth/forgot-password
   */
  async forgotPassword(email: string): Promise<void> {
    try {
      const forgotPasswordUrl = `${STRAPI_URL}/api/auth/forgot-password`
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔵 Solicitando recuperación de contraseña en:', forgotPasswordUrl)
      }

      const response = await fetch(forgotPasswordUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Error al solicitar recuperación de contraseña'
        let errorDetails: StrapiError | null = null
        let responseText = ''

        try {
          responseText = await response.text()
          
          if (responseText && responseText.trim()) {
            try {
              const parsed = JSON.parse(responseText)
              errorDetails = parsed
              
              if (parsed.error?.message) {
                errorMessage = parsed.error.message
              } else if (parsed.message) {
                errorMessage = parsed.message
              }
            } catch {
              errorMessage = responseText || response.statusText || errorMessage
            }
          } else {
            errorMessage = response.statusText || errorMessage
          }
        } catch {
          errorMessage = response.statusText || errorMessage
        }

        // Mensajes más descriptivos según el código de estado
        if (response.status === 400) {
          errorMessage = errorDetails?.error?.message || 'Email inválido. Verifica el formato del email.'
        } else if (response.status === 404) {
          errorMessage = 'Usuario no encontrado con ese email.'
        } else if (response.status >= 500) {
          errorMessage = errorDetails?.error?.message || 'Error del servidor. Por favor, intenta más tarde.'
        }

        if (process.env.NODE_ENV === 'development') {
          console.error('🔴 Error en forgot password:', {
            status: response.status,
            statusText: response.statusText,
            responseText,
            errorDetails,
          })
        }

        throw new Error(errorMessage)
      }

      // Strapi devuelve un objeto con ok: true o similar, pero no necesitamos procesarlo
      // Solo verificamos que la respuesta sea exitosa
      const data = await response.json()
      
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Solicitud de recuperación de contraseña enviada:', data)
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Error desconocido al solicitar recuperación de contraseña')
    }
  }

  /**
   * Resetea la contraseña usando el código de recuperación
   * Endpoint: POST /api/auth/reset-password
   */
  async resetPassword(
    code: string,
    password: string,
    passwordConfirmation: string
  ): Promise<void> {
    try {
      const resetPasswordUrl = `${STRAPI_URL}/api/auth/reset-password`
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔵 Reseteando contraseña en:', resetPasswordUrl)
      }

      const response = await fetch(resetPasswordUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          password,
          passwordConfirmation,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Error al resetear la contraseña'
        let errorDetails: StrapiError | null = null
        let responseText = ''

        try {
          responseText = await response.text()
          
          if (responseText && responseText.trim()) {
            try {
              const parsed = JSON.parse(responseText)
              errorDetails = parsed
              
              if (parsed.error?.message) {
                errorMessage = parsed.error.message
              } else if (parsed.message) {
                errorMessage = parsed.message
              }
            } catch {
              errorMessage = responseText || response.statusText || errorMessage
            }
          } else {
            errorMessage = response.statusText || errorMessage
          }
        } catch {
          errorMessage = response.statusText || errorMessage
        }

        // Mensajes más descriptivos según el código de estado
        if (response.status === 400) {
          errorMessage = errorDetails?.error?.message || 'Código inválido o expirado. Verifica el código de recuperación.'
        } else if (response.status === 404) {
          errorMessage = 'Código de recuperación no encontrado o expirado.'
        } else if (response.status >= 500) {
          errorMessage = errorDetails?.error?.message || 'Error del servidor. Por favor, intenta más tarde.'
        }

        if (process.env.NODE_ENV === 'development') {
          console.error('🔴 Error en reset password:', {
            status: response.status,
            statusText: response.statusText,
            responseText,
            errorDetails,
          })
        }

        throw new Error(errorMessage)
      }

      const data = await response.json()
      
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Contraseña reseteada exitosamente:', data)
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Error desconocido al resetear la contraseña')
    }
  }

  /**
   * Registra un nuevo usuario
   * Endpoint: POST /api/auth/local/register
   */
  async register(
    username: string,
    email: string,
    password: string
  ): Promise<StrapiAuthResponse> {
    try {
      const response = await fetch(`${STRAPI_URL}/api/auth/local/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          email,
          password,
        }),
      })

      if (!response.ok) {
        const error: StrapiError = await response.json().catch(() => ({
          error: {
            status: response.status,
            name: 'Error',
            message: response.statusText || 'Error al registrar usuario',
          },
        }))
        throw new Error(error.error?.message || 'Error al registrar usuario')
      }

      const data: StrapiAuthResponse = await response.json()
      
      // Guardar token
      this.setToken(data.jwt)
      
      return data
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Error desconocido al registrar usuario')
    }
  }

  /**
   * Obtiene el usuario actual autenticado (con rol poblado)
   * Endpoint: GET /api/users/me?populate=role
   * Nota: En Strapi v5, este endpoint puede devolver el usuario en formato { data: {...} }
   */
  async getMe(): Promise<StrapiUser> {
    const response = await this.request<{ data?: StrapiUser } | StrapiUser>(
      '/users/me?populate=role'
    )
    
    // Strapi v5 puede devolver { data: {...} } o directamente el objeto
    if (response && typeof response === 'object' && 'data' in response && response.data) {
      return response.data
    }
    
    return response as StrapiUser
  }

  /**
   * Actualiza el usuario actual
   * Endpoint: PUT /api/users/:id
   * En Strapi v5, necesitamos usar el ID del usuario en lugar de /me
   */
  async updateMe(data: Partial<StrapiUser>): Promise<StrapiUser> {
    // Primero obtener el usuario actual para obtener su ID
    const currentUser = await this.getMe()
    
    // Actualizar usando el ID del usuario
    return this.request<StrapiUser>(`/users/${currentUser.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  /**
   * Cambia la contraseña del usuario actual
   * Endpoint: PUT /api/users/:id
   * En Strapi v5, necesitamos usar el ID del usuario
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      // Obtener el usuario actual para obtener su ID
      const currentUser = await this.getMe()
      const userId = currentUser.id
      
      const response = await fetch(`${STRAPI_URL}/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify({
          currentPassword,
          password: newPassword,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Error al cambiar la contraseña'
        let responseText = ''

        try {
          responseText = await response.text()
          if (responseText) {
            try {
              const parsed = JSON.parse(responseText)
              errorMessage = parsed.error?.message || parsed.message || errorMessage
            } catch {
              errorMessage = responseText || errorMessage
            }
          }
        } catch {
          errorMessage = response.statusText || errorMessage
        }

        // Mensajes más descriptivos
        if (response.status === 400) {
          errorMessage = errorMessage || 'La contraseña actual es incorrecta'
        } else if (response.status === 401) {
          errorMessage = 'No autorizado. Por favor, inicia sesión nuevamente.'
        }

        throw new Error(errorMessage)
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Error desconocido al cambiar la contraseña')
    }
  }

  /**
   * Cierra la sesión del usuario
   */
  logout(): void {
    this.removeToken()
  }

  /**
   * Verifica si hay un token guardado
   */
  isAuthenticated(): boolean {
    return !!this.getToken()
  }

  /**
   * Obtiene el token actual
   */
  getCurrentToken(): string | null {
    return this.getToken()
  }

  /**
   * Obtiene la lista de proyectos
   * Endpoint: GET /api/projects
   */
  async getProjects(params?: {
    page?: number
    pageSize?: number
    filters?: Record<string, unknown>
    sort?: string
    search?: string
    availability?: string[]
    domain?: BlockDomain
    region?: 'GAM' | 'Interior'
    country?: string
    advancedFilters?: Array<{
      field: string
      operator: string
      value: any
      value2?: any
    }>
    filterLogic?: 'AND' | 'OR'
  }): Promise<StrapiProjectsResponse> {
    const queryParams = new URLSearchParams()
    
    if (params?.page) {
      queryParams.append('pagination[page]', params.page.toString())
    }
    if (params?.pageSize) {
      queryParams.append('pagination[pageSize]', params.pageSize.toString())
    }
    if (params?.sort) {
      queryParams.append('sort', params.sort)
    }
    
    // Agregar búsqueda en múltiples campos (OR)
    if (params?.search && params.search.trim()) {
      const searchTerm = params.search.trim()
      
      // En Strapi v5, para búsqueda OR en múltiples campos, usamos $or con $containsi (case insensitive)
      // Buscar en: name, code, developer.name (developer es una relación)
      queryParams.append('filters[$or][0][name][$containsi]', searchTerm)
      queryParams.append('filters[$or][1][code][$containsi]', searchTerm)
      queryParams.append('filters[$or][2][developer][name][$containsi]', searchTerm)
    }
    
    // Agregar filtro de availability/fase (si hay fases seleccionadas)
    if (params?.availability && params.availability.length > 0) {
      // Si hay múltiples fases, usar $in
      if (params.availability.length === 1) {
        queryParams.append('filters[availability][$eq]', params.availability[0])
      } else {
        params.availability.forEach((phase, index) => {
          queryParams.append(`filters[availability][$in][${index}]`, phase)
        })
      }
    }
    

    // Filtro por tipo de inmueble.
    //
    // `api::project` NO tiene el campo: el tipo vive en el BLOQUE, porque es lo
    // que decide contra qué tablas del warehouse se sincroniza. Agregarlo al
    // proyecto obligaría a un backfill de 1020 filas y a mantener dos verdades
    // sobre el mismo hecho.
    //
    // Se filtra por la relación, igual que la región justo abajo. Un proyecto
    // aparece si ALGUNO de sus bloques es de ese tipo; en la práctica son de uno
    // solo, porque el pull agrupa hermanos dentro del mismo dominio.
    if (params?.domain) {
      queryParams.append('filters[blocks][domain][$eq]', params.domain)
    }

    // Filtro de región GAM / Interior (basado en quarter de bloques del proyecto)
    if (params?.region === 'GAM') {
      const gamQuarters = ['T1', 'T2', 'T3', 'T4']
      gamQuarters.forEach((q, i) => queryParams.append(`filters[blocks][quarter][$in][${i}]`, q))
    } else if (params?.region === 'Interior') {
      const interiorQuarters = ['S1', 'S2']
      interiorQuarters.forEach((q, i) => queryParams.append(`filters[blocks][quarter][$in][${i}]`, q))
    }

    // Filtro rápido por país (relación country, por documentId)
    if (params?.country) {
      queryParams.append('filters[country][documentId][$eq]', params.country)
    }

    // Agregar filtros avanzados
    if (params?.advancedFilters && params.advancedFilters.length > 0) {
      const filterLogic = params.filterLogic || 'AND'
      
      if (filterLogic === 'OR') {
        // Para OR, necesitamos usar $or con un array de condiciones
        const orConditions: any[] = []
        
        params.advancedFilters.forEach((filter) => {
          const { field, operator, value, value2 } = filter
          
          // Mapear operadores a sintaxis de Strapi
          let strapiOperator = ''
          switch (operator) {
            case 'equals':
              strapiOperator = '$eq'
              break
            case 'notEquals':
              strapiOperator = '$ne'
              break
            case 'contains':
              strapiOperator = '$containsi'
              break
            case 'notContains':
              strapiOperator = '$notContainsi'
              break
            case 'greaterThan':
              strapiOperator = '$gt'
              break
            case 'lessThan':
              strapiOperator = '$lt'
              break
            case 'greaterThanOrEqual':
              strapiOperator = '$gte'
              break
            case 'lessThanOrEqual':
              strapiOperator = '$lte'
              break
            case 'in':
              strapiOperator = '$in'
              break
            case 'notIn':
              strapiOperator = '$notIn'
              break
            case 'between':
              // Para between en OR, crear dos condiciones separadas
              if (value && value2) {
                orConditions.push({ [field]: { $gte: value } })
                orConditions.push({ [field]: { $lte: value2 } })
              }
              break
            case 'isNull':
              orConditions.push({ [field]: { $null: true } })
              break
            case 'isNotNull':
              orConditions.push({ [field]: { $notNull: true } })
              break
            default:
              strapiOperator = '$eq'
          }

          // Solo procesar si no es un caso especial (between, isNull, isNotNull)
          if (strapiOperator && operator !== 'between' && operator !== 'isNull' && operator !== 'isNotNull') {
            // Manejar relaciones (developer, country, amenities, services)
            if (field === 'developer' || field === 'country') {
              orConditions.push({ [field]: { documentId: { [strapiOperator]: String(value) } } })
            } else if (field === 'amenities' || field === 'services') {
              if (operator === 'in' && Array.isArray(value)) {
                orConditions.push({ [field]: { documentId: { [strapiOperator]: value.map(v => String(v)) } } })
              } else {
                orConditions.push({ [field]: { documentId: { [strapiOperator]: String(value) } } })
              }
            } else {
              if (operator === 'in' || operator === 'notIn') {
                if (Array.isArray(value)) {
                  orConditions.push({ [field]: { [strapiOperator]: value.map(v => String(v)) } })
                } else {
                  orConditions.push({ [field]: { [strapiOperator]: String(value) } })
                }
              } else {
                orConditions.push({ [field]: { [strapiOperator]: String(value) } })
              }
            }
          }
        })
        
        // Agregar $or usando el formato de Strapi
        if (orConditions.length > 0) {
          orConditions.forEach((condition, index) => {
            Object.entries(condition).forEach(([field, fieldCondition]) => {
              if (typeof fieldCondition === 'object' && fieldCondition !== null) {
                Object.entries(fieldCondition as Record<string, any>).forEach(([op, val]) => {
                  if (op === 'documentId' && typeof val === 'object' && val !== null) {
                    // Para relaciones con documentId
                    Object.entries(val as Record<string, any>).forEach(([docOp, docVal]) => {
                      if (Array.isArray(docVal)) {
                        docVal.forEach((v, i) => {
                          queryParams.append(`filters[$or][${index}][${field}][documentId][${docOp}][${i}]`, String(v))
                        })
                      } else {
                        queryParams.append(`filters[$or][${index}][${field}][documentId][${docOp}]`, String(docVal))
                      }
                    })
                  } else if (Array.isArray(val)) {
                    val.forEach((v, i) => {
                      queryParams.append(`filters[$or][${index}][${field}][${op}][${i}]`, String(v))
                    })
                  } else {
                    queryParams.append(`filters[$or][${index}][${field}][${op}]`, String(val))
                  }
                })
              }
            })
          })
        }
      } else {
        // Para AND (comportamiento por defecto), agregar filtros al mismo nivel
        params.advancedFilters.forEach((filter) => {
          const { field, operator, value, value2 } = filter
          
          // Mapear operadores a sintaxis de Strapi
          let strapiOperator = ''
          switch (operator) {
            case 'equals':
              strapiOperator = '$eq'
              break
            case 'notEquals':
              strapiOperator = '$ne'
              break
            case 'contains':
              strapiOperator = '$containsi'
              break
            case 'notContains':
              strapiOperator = '$notContainsi'
              break
            case 'greaterThan':
              strapiOperator = '$gt'
              break
            case 'lessThan':
              strapiOperator = '$lt'
              break
            case 'greaterThanOrEqual':
              strapiOperator = '$gte'
              break
            case 'lessThanOrEqual':
              strapiOperator = '$lte'
              break
            case 'in':
              strapiOperator = '$in'
              break
            case 'notIn':
              strapiOperator = '$notIn'
              break
            case 'between':
              // Para between necesitamos $gte y $lte
              if (value && value2) {
                queryParams.append(`filters[${field}][$gte]`, value)
                queryParams.append(`filters[${field}][$lte]`, value2)
              }
              break
            case 'isNull':
              queryParams.append(`filters[${field}][$null]`, 'true')
              break
            case 'isNotNull':
              queryParams.append(`filters[${field}][$notNull]`, 'true')
              break
            default:
              strapiOperator = '$eq'
          }

          // Solo procesar si no es un caso especial (between, isNull, isNotNull)
          if (strapiOperator && operator !== 'between' && operator !== 'isNull' && operator !== 'isNotNull') {
            // Manejar relaciones (developer, country, amenities, services)
            if (field === 'developer' || field === 'country') {
              queryParams.append(`filters[${field}][documentId][${strapiOperator}]`, String(value))
            } else if (field === 'amenities' || field === 'services') {
              // Para arrays de relaciones, usar $contains
              if (operator === 'in') {
                if (Array.isArray(value)) {
                  value.forEach((v: any, i: number) => {
                    queryParams.append(`filters[${field}][documentId][$in][${i}]`, String(v))
                  })
                } else {
                  queryParams.append(`filters[${field}][documentId][${strapiOperator}]`, String(value))
                }
              } else {
                queryParams.append(`filters[${field}][documentId][${strapiOperator}]`, String(value))
              }
            } else {
              // Campos normales
              if (operator === 'in' || operator === 'notIn') {
                if (Array.isArray(value)) {
                  value.forEach((v: any, i: number) => {
                    queryParams.append(`filters[${field}][${strapiOperator}][${i}]`, String(v))
                  })
                } else {
                  queryParams.append(`filters[${field}][${strapiOperator}]`, String(value))
                }
              } else {
                queryParams.append(`filters[${field}][${strapiOperator}]`, String(value))
              }
            }
          }
        })
      }
    }
    
    // Agregar filtros adicionales si existen
    if (params?.filters) {
      Object.entries(params.filters).forEach(([key, value]) => {
        queryParams.append(`filters[${key}]`, String(value))
      })
    }

    // Agregar populate para obtener relaciones
    queryParams.append('populate[0]', 'developer')
    queryParams.append('populate[1]', 'country')
    queryParams.append('populate[2]', 'amenities')
    queryParams.append('populate[3]', 'services')
    queryParams.append('populate[4]', 'blocks')

    const queryString = queryParams.toString()
    const endpoint = `/projects${queryString ? `?${queryString}` : ''}`
    
    // El método request ya maneja el formato { data: {...} }, pero para proyectos
    // necesitamos devolver la estructura completa con meta
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
      },
    })

    if (!response.ok) {
      let errorMessage = 'Error al obtener proyectos'
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText)
            errorMessage = parsed.error?.message || errorMessage
          } catch {
            errorMessage = errorText || response.statusText || errorMessage
          }
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      throw new Error(errorMessage)
    }

    const jsonResponse = await response.json()
    
    // Strapi v5 devuelve { data: [...], meta: {...} }
    // Devolver la estructura completa
    return jsonResponse as StrapiProjectsResponse
  }

  /**
   * Obtiene la lista de bloques
   * Endpoint: GET /api/blocks
   */
  async getBlocks(params?: {
    page?: number
    pageSize?: number
    filters?: Record<string, unknown>
    sort?: string
    search?: string
    projectIds?: string[]
    region?: 'GAM' | 'Interior'
    country?: string
    countryIso?: string
    domain?: BlockDomain
    advancedFilters?: Array<{ field: string; operator: string; value: any; value2?: any }>
    filterLogic?: 'AND' | 'OR'
  }): Promise<StrapiBlocksResponse> {
    const queryParams = new URLSearchParams()
    
    if (params?.page) {
      queryParams.append('pagination[page]', params.page.toString())
    }
    if (params?.pageSize) {
      queryParams.append('pagination[pageSize]', params.pageSize.toString())
    }
    if (params?.sort) {
      queryParams.append('sort', params.sort)
    }
    
    // Agregar búsqueda en múltiples campos (OR)
    if (params?.search && params.search.trim()) {
      const searchTerm = params.search.trim()
      queryParams.append('filters[$or][0][name][$containsi]', searchTerm)
      queryParams.append('filters[$or][1][code][$containsi]', searchTerm)
      queryParams.append('filters[$or][2][phase][$containsi]', searchTerm)
      queryParams.append('filters[$or][3][tower][$containsi]', searchTerm)
      queryParams.append('filters[$or][4][sector][$containsi]', searchTerm)
    }
    
    // Agregar filtro de proyectos (si hay proyectos seleccionados).
    // Se filtra por documentId, igual que el resto de filtros por relación del
    // cliente: `filters[project][$eq]` compara contra el id numérico de la
    // relación, así que pasarle un documentId devuelve cero filas en silencio.
    if (params?.projectIds && params.projectIds.length > 0) {
      if (params.projectIds.length === 1) {
        queryParams.append('filters[project][documentId][$eq]', params.projectIds[0])
      } else {
        params.projectIds.forEach((id, index) => {
          queryParams.append(`filters[project][documentId][$in][${index}]`, id)
        })
      }
    }
    
    // Filtro de región GAM / Interior (basado en quarter del bloque)
    if (params?.region === 'GAM') {
      const gamQuarters = ['T1', 'T2', 'T3', 'T4']
      gamQuarters.forEach((q, i) => queryParams.append(`filters[quarter][$in][${i}]`, q))
    } else if (params?.region === 'Interior') {
      const interiorQuarters = ['S1', 'S2']
      interiorQuarters.forEach((q, i) => queryParams.append(`filters[quarter][$in][${i}]`, q))
    }

    // Filtro rápido por país (a través del proyecto relacionado, por documentId)
    if (params?.country) {
      queryParams.append('filters[project][country][documentId][$eq]', params.country)
    }
    // Filtro por país vía ISO code (isoCode2) — estable, igual que las banderas.
    // Filtro rápido por tipo de inmueble. Va contra la columna del bloque y no
    // contra una relación: `domain` es un enumerado en el propio bloque.
    if (params?.domain) {
      queryParams.append('filters[domain][$eq]', params.domain)
    }

    if (params?.countryIso) {
      queryParams.append('filters[project][country][isoCode2][$eq]', params.countryIso)
    }

    // Filtros avanzados para bloques
    if (params?.advancedFilters && params.advancedFilters.length > 0) {
      const operatorMap: Record<string, string> = {
        equals: '$eq', notEquals: '$ne', contains: '$containsi', notContains: '$notContainsi',
        greaterThan: '$gt', lessThan: '$lt', greaterThanOrEqual: '$gte', lessThanOrEqual: '$lte',
        in: '$in', notIn: '$notIn',
      }
      params.advancedFilters.forEach((filter) => {
        const { field, operator, value, value2 } = filter
        // Convertir dot-notation: "project.department" → "filters[project][department]"
        const fieldPath = field.split('.').map(s => `[${s}]`).join('')
        if (operator === 'between' && value && value2) {
          queryParams.append(`filters${fieldPath}[$gte]`, String(value))
          queryParams.append(`filters${fieldPath}[$lte]`, String(value2))
        } else if (operator === 'isNull') {
          queryParams.append(`filters${fieldPath}[$null]`, 'true')
        } else if (operator === 'isNotNull') {
          queryParams.append(`filters${fieldPath}[$notNull]`, 'true')
        } else {
          const strapiOp = operatorMap[operator] ?? '$eq'
          queryParams.append(`filters${fieldPath}[${strapiOp}]`, String(value ?? ''))
        }
      })
    }

    // Agregar filtros adicionales si existen
    if (params?.filters) {
      Object.entries(params.filters).forEach(([key, value]) => {
        queryParams.append(`filters[${key}]`, String(value))
      })
    }

    // Agregar populate para obtener relaciones (blockType fue removido de la API).
    // project se popula en profundidad para traer su país (block → project → country).
    queryParams.append('populate[project][populate][country]', 'true')
    queryParams.append('populate[blockCategory]', 'true')
    queryParams.append('populate[blockFocus]', 'true')
    queryParams.append('populate[blockStatus]', 'true')

    const queryString = queryParams.toString()
    const endpoint = `/blocks${queryString ? `?${queryString}` : ''}`
    
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
      },
    })

    if (!response.ok) {
      let errorMessage = 'Error al obtener bloques'
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText)
            errorMessage = parsed.error?.message || errorMessage
          } catch {
            errorMessage = errorText || response.statusText || errorMessage
          }
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      throw new Error(errorMessage)
    }

    const jsonResponse = await response.json()
    
    // Strapi v5 devuelve { data: [...], meta: {...} }
    return jsonResponse as StrapiBlocksResponse
  }

  /**
   * Obtiene un bloque por ID
   * Endpoint: GET /api/blocks/:id
   */
  async getBlockById(id: number | string): Promise<StrapiBlock> {
    const params = new URLSearchParams()
    // Solo relaciones vigentes; blockType fue removido de la API.
    // project en profundidad para traer su país (block → project → country).
    params.append('populate[project][populate][country]', 'true')
    params.append('populate[blockCategory]', 'true')
    params.append('populate[blockFocus]', 'true')
    params.append('populate[blockStatus]', 'true')
    // El financiamiento y sus dieciocho espacios de banco. Sin el populate
    // anidado el componente llega con los términos y SIN los bancos, y el
    // formulario los borraría al guardar sin que nadie lo note.
    params.append('populate[financing][populate]', '*')

    const response = await this.request<{ data: StrapiBlock }>(`/blocks/${id}?${params.toString()}`)
    
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data
    }
    
    return response as StrapiBlock
  }

  /**
   * Crea un nuevo bloque
   * Endpoint: POST /api/blocks
   */
  async createBlock(data: Partial<StrapiBlock>): Promise<StrapiBlock> {
    const response = await fetch(`${this.baseURL}/blocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
      },
      body: JSON.stringify({ data }),
    })

    if (!response.ok) {
      let errorMessage = 'Error al crear bloque'
      let strapiError: StrapiError | null = null
      let responseText = ''

      try {
        responseText = await response.text()
        if (responseText) {
          try {
            strapiError = JSON.parse(responseText)
            errorMessage = strapiError?.error?.message || errorMessage
          } catch {
            errorMessage = responseText || response.statusText || errorMessage
          }
        } else {
          errorMessage = response.statusText || errorMessage
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }

      const customError = new Error(errorMessage) as any
      customError.strapiError = strapiError
      throw customError
    }

    const jsonResponse = await response.json()
    return jsonResponse.data as StrapiBlock
  }

  /**
   * Actualiza un bloque existente
   * Endpoint: PUT /api/blocks/:id
   */
  async updateBlock(id: number | string, data: Partial<StrapiBlock>): Promise<StrapiBlock> {
    const response = await fetch(`${this.baseURL}/blocks/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
      },
      body: JSON.stringify({ data }),
    })

    if (!response.ok) {
      let errorMessage = 'Error al actualizar bloque'
      let strapiError: StrapiError | null = null
      let responseText = ''

      try {
        responseText = await response.text()
        if (responseText) {
          try {
            strapiError = JSON.parse(responseText)
            errorMessage = strapiError?.error?.message || errorMessage
          } catch {
            errorMessage = responseText || response.statusText || errorMessage
          }
        } else {
          errorMessage = response.statusText || errorMessage
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }

      const customError = new Error(errorMessage) as any
      customError.strapiError = strapiError
      throw customError
    }

    const jsonResponse = await response.json()
    return jsonResponse.data as StrapiBlock
  }

  /**
   * Elimina un bloque
   * Endpoint: DELETE /api/blocks/:id
   */
  async deleteBlock(id: number | string): Promise<void> {
    const response = await fetch(`${this.baseURL}/blocks/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
      },
    })

    if (!response.ok) {
      let errorMessage = 'Error al eliminar bloque'
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText)
            errorMessage = parsed.error?.message || errorMessage
          } catch {
            errorMessage = errorText || response.statusText || errorMessage
          }
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      throw new Error(errorMessage)
    }
  }

  /**
   * Lista perfiles de tipo de cambio
   * Endpoint: GET /api/exchange-rate-profiles
   */
  async getExchangeRateProfiles(params?: {
    page?: number
    pageSize?: number
    sort?: string
    search?: string
  }): Promise<StrapiExchangeRateProfilesResponse> {
    const queryParams = new URLSearchParams()

    if (params?.page) {
      queryParams.append('pagination[page]', params.page.toString())
    }
    if (params?.pageSize) {
      queryParams.append('pagination[pageSize]', params.pageSize.toString())
    }
    if (params?.sort) {
      queryParams.append('sort', params.sort)
    }
    if (params?.search?.trim()) {
      const term = params.search.trim()
      queryParams.append('filters[$or][0][name][$containsi]', term)
      queryParams.append('filters[$or][1][code][$containsi]', term)
      queryParams.append('filters[$or][2][description][$containsi]', term)
    }
    queryParams.append('populate', 'projects')
    queryParams.append('populate', 'currencies')

    const qs = queryParams.toString()
    const endpoint = `/exchange-rate-profiles${qs ? `?${qs}` : ''}`

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getToken()}`,
      },
    })

    if (!response.ok) {
      let errorMessage = 'Error al obtener perfiles de tipo de cambio'
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText)
            errorMessage = parsed.error?.message || errorMessage
          } catch {
            errorMessage = errorText || response.statusText || errorMessage
          }
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      throw new Error(errorMessage)
    }

    return (await response.json()) as StrapiExchangeRateProfilesResponse
  }

  /**
   * Obtiene un perfil de tipo de cambio por id o documentId
   */
  async getExchangeRateProfileById(id: number | string): Promise<StrapiExchangeRateProfile> {
    const populateParams: string[] = [
      'populate[0]=projects',
      'populate[1]=currencies',
      'populate[2]=currencies.mxn',
      'populate[3]=currencies.gtq',
      'populate[4]=currencies.hnl',
      'populate[5]=currencies.crc',
      'populate[6]=currencies.nio',
      'populate[7]=currencies.pab',
      'populate[8]=currencies.bzd',
    ]
    const queryString = populateParams.join('&')
    const response = await this.request<{ data: StrapiExchangeRateProfile }>(
      `/exchange-rate-profiles/${id}?${queryString}`
    )
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data
    }
    return response as StrapiExchangeRateProfile
  }

  async createExchangeRateProfile(data: {
    name: string
    code?: string
    description?: string
    currencies?: StrapiCurrenciesComponent | null
    projects?: (string | number)[]
  }): Promise<StrapiExchangeRateProfile> {
    const payload = { ...data }
    if (data.currencies !== undefined) {
      payload.currencies =
        data.currencies === null
          ? null
          : sanitizeCurrenciesComponentForWrite(data.currencies)
    }
    const response = await fetch(`${this.baseURL}/exchange-rate-profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getToken()}`,
      },
      body: JSON.stringify({ data: payload }),
    })

    if (!response.ok) {
      let errorMessage = 'Error al crear perfil de tipo de cambio'
      let strapiError: StrapiError | null = null
      let responseText = ''
      try {
        responseText = await response.text()
        if (responseText) {
          try {
            strapiError = JSON.parse(responseText)
            errorMessage = strapiError?.error?.message || errorMessage
          } catch {
            errorMessage = responseText || response.statusText || errorMessage
          }
        } else {
          errorMessage = response.statusText || errorMessage
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      const customError = new Error(errorMessage) as Error & { strapiError?: StrapiError }
      customError.strapiError = strapiError ?? undefined
      throw customError
    }

    const jsonResponse = await response.json()
    return jsonResponse.data as StrapiExchangeRateProfile
  }

  async updateExchangeRateProfile(
    id: number | string,
    data: {
      name?: string
      code?: string
      description?: string
      currencies?: StrapiCurrenciesComponent | null
      projects?: (string | number)[] | { connect: (string | number)[]; disconnect: (string | number)[] }
    }
  ): Promise<StrapiExchangeRateProfile> {
    const payload: Record<string, unknown> = {}
    if (data.name !== undefined) payload.name = data.name
    if (data.code !== undefined) payload.code = data.code
    if (data.description !== undefined) payload.description = data.description
    if (data.currencies !== undefined) {
      payload.currencies =
        data.currencies === null
          ? null
          : sanitizeCurrenciesComponentForWrite(data.currencies)
    }
    if (data.projects !== undefined) payload.projects = data.projects

    const response = await fetch(`${this.baseURL}/exchange-rate-profiles/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getToken()}`,
      },
      body: JSON.stringify({ data: payload }),
    })

    if (!response.ok) {
      let errorMessage = 'Error al actualizar perfil de tipo de cambio'
      let strapiError: StrapiError | null = null
      let responseText = ''
      try {
        responseText = await response.text()
        if (responseText) {
          try {
            strapiError = JSON.parse(responseText)
            errorMessage = strapiError?.error?.message || errorMessage
          } catch {
            errorMessage = responseText || response.statusText || errorMessage
          }
        } else {
          errorMessage = response.statusText || errorMessage
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      const customError = new Error(errorMessage) as Error & { strapiError?: StrapiError }
      customError.strapiError = strapiError ?? undefined
      throw customError
    }

    const jsonResponse = await response.json()
    return jsonResponse.data as StrapiExchangeRateProfile
  }

  async deleteExchangeRateProfile(id: number | string): Promise<void> {
    const response = await fetch(`${this.baseURL}/exchange-rate-profiles/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
    })

    if (!response.ok) {
      let errorMessage = 'Error al eliminar perfil de tipo de cambio'
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText)
            errorMessage = parsed.error?.message || errorMessage
          } catch {
            errorMessage = errorText || response.statusText || errorMessage
          }
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      throw new Error(errorMessage)
    }
  }

  /**
   * Bloques con lo MÍNIMO para elegirlos: código, nombre y su proyecto.
   *
   * Existe aparte de `getBlocks` porque aquél popula project→country,
   * blockCategory, blockFocus y blockStatus y devuelve todos los campos del
   * bloque: 1.277 KB y ~1.800 ms por página de 500, contra 108 KB y ~400 ms
   * pidiendo sólo esto. Sobre las 3 páginas del universo son ~5,4 s de espera
   * antes de poder mostrar nada, y el selector no usa ninguna de esas
   * relaciones.
   *
   * Trae hasta `pageSize` de una; el llamador pagina si `meta.pagination`
   * indica que falta. Con 1.330 bloques hoy entra en una sola petición.
   */
  async getBlocksLite(params?: {
    page?: number
    pageSize?: number
    region?: 'GAM' | 'Interior'
    country?: string
    /** Acota a estos bloques. Pensado para pocos: van en la URL. */
    /**
     * Acota al tipo de inmueble. El selector de push DEBE pasarlo: el backend
     * ya filtra por dominio al resolver los objetivos, así que sin esto el
     * selector ofrecía bloques de vivienda en una corrida de oficinas y la
     * corrida después los ignoraba en silencio.
     */
    domain?: BlockDomain
    documentIds?: string[]
    /**
     * Acota por `legacyId` en vez de por documentId.
     *
     * Lo necesita el detalle de un PULL: sus filas del ledger se identifican
     * por `cod_proyecto`, no por un documentId de Strapi — el bloque puede ni
     * existir cuando la corrida arranca. En un push las dos cosas coinciden.
     */
    legacyIds?: string[]
  }) {
    const queryParams = new URLSearchParams()
    queryParams.append('pagination[page]', String(params?.page ?? 1))
    queryParams.append('pagination[pageSize]', String(params?.pageSize ?? 2000))
    queryParams.append('sort', 'code:asc')
    queryParams.append('fields[0]', 'code')
    queryParams.append('fields[1]', 'name')
    // quarter es de donde sale la región (GAM vs Interior, ver lib/region.ts);
    // el país cuelga del proyecto. Los dos suman ~143 KB sobre el universo
    // completo y siguen entrando en una sola petición.
    queryParams.append('fields[2]', 'quarter')
    // Va siempre: es lo que permite emparejar un bloque con la fila del ledger
    // de un pull. Sobre el universo completo suma ~14 KB a los ~143 KB que ya
    // pesa, y evita tener dos formas de esta consulta según quién la llame.
    queryParams.append('fields[3]', 'legacyId')
    queryParams.append('populate[project][fields][0]', 'name')
    queryParams.append('populate[project][populate][country][fields][0]', 'name')
    queryParams.append('populate[project][populate][country][fields][1]', 'isoCode2')

    // Mismos filtros que getBlocks, para que el conteo por proyecto coincida
    // con lo que se ve al expandir.
    // Va ANTES del de región porque es el filtro más grueso: vivienda y
    // oficinas no comparten ni tablas ni columnas.
    if (params?.domain) {
      queryParams.append('filters[domain][$eq]', params.domain)
    }

    if (params?.region === 'GAM') {
      ;['T1', 'T2', 'T3', 'T4'].forEach((q, i) =>
        queryParams.append(`filters[quarter][$in][${i}]`, q)
      )
    } else if (params?.region === 'Interior') {
      ;['S1', 'S2'].forEach((q, i) => queryParams.append(`filters[quarter][$in][${i}]`, q))
    }
    if (params?.country) {
      queryParams.append('filters[project][country][documentId][$eq]', params.country)
    }
    params?.documentIds?.forEach((id, i) => {
      queryParams.append(`filters[documentId][$in][${i}]`, id)
    })
    params?.legacyIds?.forEach((id, i) => {
      queryParams.append(`filters[legacyId][$in][${i}]`, id)
    })

    // fetch directo, como getBlocks: `request()` desenvuelve `data` y acá hace
    // falta `meta.pagination` para saber si quedó algo fuera.
    const response = await fetch(`${this.baseURL}/blocks?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getToken()}`,
      },
    })
    if (!response.ok) {
      throw new Error(`Error al obtener bloques (${response.status})`)
    }

    return (await response.json()) as {
      data: Array<{
        documentId: string
        code?: string
        name?: string
        legacyId?: string | null
        quarter?: string | null
        project?: {
          documentId: string
          name?: string
          country?: { name?: string; isoCode2?: string } | null
        }
      }>
      meta?: { pagination?: { page: number; pageSize: number; pageCount: number; total: number } }
    }
  }

  /**
   * Obtiene el conteo de blocks para un proyecto
   * Endpoint: GET /api/blocks?filters[project][documentId][$eq]=...
   */
  async getBlocksCountByProject(projectDocumentId: string): Promise<number> {
    try {
      const params = new URLSearchParams()
      params.append('filters[project][documentId][$eq]', projectDocumentId)
      params.append('pagination[pageSize]', '1')
      params.append('pagination[withCount]', 'true')
      
      const response = await fetch(`${this.baseURL}/blocks?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      })

      if (!response.ok) {
        return 0
      }

      const jsonResponse = await response.json()
      return jsonResponse.meta?.pagination?.total || 0
    } catch (error) {
      console.error('Error getting blocks count:', error)
      return 0
    }
  }

  /**
   * Obtiene un proyecto por ID
   * Endpoint: GET /api/projects/:id
   */
  async getProjectById(id: number | string): Promise<StrapiProject> {
    // En Strapi v5, para poblar componentes anidados usamos populate con índices
    // Construir los parámetros manualmente
    const populateParams: string[] = []
    
    // Poblar relaciones simples
    populateParams.push('populate[0]=developer')
    populateParams.push('populate[1]=country')
    populateParams.push('populate[2]=amenities')
    populateParams.push('populate[3]=services')
    populateParams.push('populate[4]=nse')
    populateParams.push('populate[5]=securityType')

    // Monedas viven en el perfil de tipo de cambio, no en el proyecto
    populateParams.push('populate[6]=exchangeRateProfile')
    populateParams.push('populate[7]=exchangeRateProfile.currencies')
    populateParams.push('populate[8]=exchangeRateProfile.currencies.mxn')
    populateParams.push('populate[9]=exchangeRateProfile.currencies.gtq')
    populateParams.push('populate[10]=exchangeRateProfile.currencies.hnl')
    populateParams.push('populate[11]=exchangeRateProfile.currencies.crc')
    populateParams.push('populate[12]=exchangeRateProfile.currencies.nio')
    populateParams.push('populate[13]=exchangeRateProfile.currencies.pab')
    populateParams.push('populate[14]=exchangeRateProfile.currencies.bzd')
    populateParams.push('populate[15]=blocks')

    const queryString = populateParams.join('&')

    const response = await this.request<{ data: StrapiProject }>(`/projects/${id}?${queryString}`)

    // Strapi v5 devuelve { data: {...} }
    if (response && typeof response === 'object' && 'data' in response) {
      return normalizeProjectCurrenciesFromExchangeProfile(response.data)
    }

    return normalizeProjectCurrenciesFromExchangeProfile(response as StrapiProject)
  }

  /**
   * Crea un nuevo proyecto
   * Endpoint: POST /api/projects
   */
  async createProject(data: {
    code: string
    name: string
    developer?: string | number
    country?: string | number
    department?: string
    municipality?: string
    zone?: string
    subzone?: string
    latitude?: number
    longitude?: number
    nse?: string | number
    securityType?: string | number
    muvi?: boolean
    showroom?: boolean
    modelHouse?: boolean
    accessQuantity?: number
    imageUrl?: string
    fha?: boolean
    fractionalDownPayment?: boolean
    downPaymentPercentage?: number
    exchangeRateProfile?: string | number | null
    amenities?: (string | number)[]
    services?: (string | number)[]
  }): Promise<StrapiProject> {
    const response = await this.request<{ data: StrapiProject }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ data }),
    })

    if (response && typeof response === 'object' && 'data' in response) {
      return normalizeProjectCurrenciesFromExchangeProfile(response.data)
    }

    return normalizeProjectCurrenciesFromExchangeProfile(response as StrapiProject)
  }

  /**
   * Actualiza un proyecto existente
   * Endpoint: PUT /api/projects/{id}
   */
  async updateProject(id: number | string, data: {
    code?: string
    name?: string
    developer?: string | number
    country?: string | number
    department?: string
    municipality?: string
    zone?: string
    subzone?: string
    latitude?: number
    longitude?: number
    nse?: string | number
    securityType?: string | number
    muvi?: boolean
    showroom?: boolean
    modelHouse?: boolean
    accessQuantity?: number
    imageUrl?: string
    fha?: boolean
    fractionalDownPayment?: boolean
    downPaymentPercentage?: number
    exchangeRateProfile?: string | number | null
    amenities?: (string | number)[]
    services?: (string | number)[]
  }): Promise<StrapiProject> {
    const response = await this.request<{ data: StrapiProject }>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    })

    if (response && typeof response === 'object' && 'data' in response) {
      return normalizeProjectCurrenciesFromExchangeProfile(response.data)
    }

    return normalizeProjectCurrenciesFromExchangeProfile(response as StrapiProject)
  }

  /**
   * Obtiene la lista de unidades (puede filtrar por documentId de bloque)
   * Endpoint: GET /api/units
   */
  async getUnits(params?: { blockDocumentId?: string; page?: number; pageSize?: number; search?: string; sort?: string }): Promise<StrapiUnitsResponse> {
    const queryParams = new URLSearchParams()

    if (params?.page) {
      queryParams.append('pagination[page]', params.page.toString())
    }
    if (params?.pageSize) {
      queryParams.append('pagination[pageSize]', params.pageSize.toString())
    }

    // Populate block y sus relaciones según el schema
    queryParams.append('populate', 'block')
    queryParams.append('populate', 'block.project')
    queryParams.append('populate', 'topography')
    queryParams.append('populate', 'parkingType')
    queryParams.append('populate', 'unitUsage')
    queryParams.append('populate', 'unitType')

    if (params?.blockDocumentId) {
      queryParams.append('filters[block][documentId][$eq]', params.blockDocumentId)
    }

    if (params?.search) {
      queryParams.append('filters[code][$containsi]', params.search)
    }

    if (params?.sort) {
      queryParams.append('sort', params.sort)
    }

    const endpoint = `/units${queryParams.toString() ? `?${queryParams.toString()}` : ''}`

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
      },
    })

    if (!response.ok) {
      let errorMessage = 'Error al obtener unidades'
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText)
            errorMessage = parsed.error?.message || errorMessage
          } catch {
            errorMessage = errorText || response.statusText || errorMessage
          }
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      throw new Error(errorMessage)
    }

    const jsonResponse = await response.json()
    return jsonResponse as StrapiUnitsResponse
  }

  /**
   * Obtiene todas las unidades que coincidan con los filtros, pidiendo todas las páginas de Strapi en la primera carga.
   * Usa siempre el pageSize efectivo que devuelve Strapi (p. ej. 100) en todas las páginas: si pides 200 pero el
   * límite real es 100, el offset de la página 2 se calcula con 200 y se saltan registros (p. ej. solo 111 de 211).
   * Tras fusionar, ordena por createdAt ascendente (más nuevo al final de la lista / abajo en la tabla).
   */
  async getUnitsAllPages(
    params?: Omit<{ blockDocumentId?: string; pageSize?: number; search?: string; sort?: string }, 'page'>
  ): Promise<StrapiUnitsResponse> {
    const sort = params?.sort ?? 'createdAt:asc'
    const requestedSize = Math.min(Math.max(params?.pageSize ?? 100, 1), 100)

    const first = await this.getUnits({ ...params, page: 1, pageSize: requestedSize, sort })
    const pageSize = first.meta?.pagination?.pageSize ?? requestedSize
    const pageCount = first.meta?.pagination?.pageCount ?? 1
    const total = first.meta?.pagination?.total ?? (first.data?.length ?? 0)
    const data: StrapiUnit[] = [...(first.data ?? [])]

    if (pageCount <= 1) {
      sortUnitsOldestFirstNewestLast(data)
      return {
        data,
        meta: {
          pagination: {
            page: 1,
            pageSize: data.length,
            pageCount: 1,
            total,
          },
        },
      }
    }

    const extraPages = Array.from({ length: pageCount - 1 }, (_, i) => i + 2)
    const rest = await Promise.all(
      extraPages.map((page) => this.getUnits({ ...params, page, pageSize, sort }))
    )
    for (const r of rest) {
      data.push(...(r.data ?? []))
    }

    sortUnitsOldestFirstNewestLast(data)

    return {
      data,
      meta: {
        pagination: {
          page: 1,
          pageSize: data.length,
          pageCount: 1,
          total,
        },
      },
    }
  }

  /**
   * Obtiene la lista de categorías
   * Endpoint: GET /api/ref-categories
   */
  async getCategories(): Promise<StrapiCategory[]> {
    try {
      const response = await fetch(`${this.baseURL}/ref-categories?pagination[pageSize]=100&filters[isActive][$eq]=true&sort=sortOrder:asc`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      })

      if (!response.ok) {
        throw new Error('Error al obtener categorías')
      }

      const jsonResponse = await response.json()
      
      // Strapi v5 devuelve { data: [...], meta: {...} }
      if (jsonResponse && jsonResponse.data && Array.isArray(jsonResponse.data)) {
        return jsonResponse.data
      }
      
      return []
    } catch (error) {
      console.error('Error al obtener categorías:', error)
      return []
    }
  }

  /**
   * Obtiene una unidad por su documentId
   * Endpoint: GET /api/units/:documentId
   */
  async getUnitById(documentId: string): Promise<StrapiUnit> {
    try {
      if (!documentId || documentId === "undefined") {
        throw new Error("Identificador de unidad inválido")
      }
      const params = new URLSearchParams()
      params.append('populate', 'block')
      params.append('populate', 'block.project')
      params.append('populate', 'topography')
      params.append('populate', 'parkingType')
      params.append('populate', 'unitUsage')
      params.append('populate', 'unitType')
      const response = await fetch(`${this.baseURL}/units/${documentId}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      })

      if (!response.ok) {
        throw new Error('Error al obtener unidad')
      }

      const jsonResponse = await response.json()
      
      if (jsonResponse && jsonResponse.data) {
        return jsonResponse.data
      }
      
      return jsonResponse as StrapiUnit
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Error desconocido al obtener unidad')
    }
  }

  /**
   * Actualiza un campo específico de una unidad
   * Endpoint: PUT /api/units/:documentId
   * Soporta campos anidados en type[] usando notación tipo "type[0].fieldName"
   * @param blockDocumentId - Opcional: documentId del block (para evitar GET innecesario)
   * @param blockId - Opcional: id numérico del block (fallback si no hay documentId)
   */
  async updateUnit(
    documentId: string, 
    field: string, 
    value: unknown, 
    blockDocumentId?: string | number,
    blockId?: number
  ): Promise<StrapiUnit> {
    try {
      if (!documentId || documentId === "undefined") {
        throw new Error("Identificador de unidad inválido")
      }
      if (isClientOnlyForeignPriceKey(field)) {
        return this.getUnitById(documentId)
      }
      // Manejar campos anidados en type[] - estos requieren obtener la unidad actual
      let updateData: Record<string, unknown> = {}
      let needsCurrentUnit = false
      
      if (field.startsWith('type[') && field.includes('].')) {
        needsCurrentUnit = true
      }
      if (field.startsWith('unitType[') && field.includes('].')) {
        needsCurrentUnit = true
      }
      
      // Si necesitamos la unidad actual (para type[]) o no tenemos el block, obtenerla
      let currentUnit: StrapiUnit | null = null
      if (needsCurrentUnit || (!blockDocumentId && !blockId)) {
        currentUnit = await this.getUnitById(documentId)
      }
      
      if (field.startsWith('type[') && field.includes('].')) {
        // Campo anidado en type array, ej: "type[0].bedrooms" (legacy)
        const match = field.match(/^type\[(\d+)\]\.(.+)$/)
        const dz = (currentUnit ? getUnitTypeZone(currentUnit) : []) as unknown[]
        if (match && currentUnit) {
          const index = parseInt(match[1])
          const nestedField = match[2]
          
          if (Array.isArray(dz) && dz[index]) {
            const component = dz[index] as Record<string, unknown>
            const updatedComponent = {
              ...component,
              [nestedField]: value,
            }
            
            const updatedType = [...dz]
            updatedType[index] = updatedComponent
            
            updateData = { unitType: sanitizeUnitTypeArrayForWrite(updatedType) }
          } else {
            throw new Error(`No se encontró el componente en el índice ${index}`)
          }
        } else {
          updateData = { [field]: value }
        }
      } else if (field.startsWith('unitType[') && field.includes('].')) {
        const match = field.match(/^unitType\[(\d+)\]\.(.+)$/)
        const dz = (currentUnit ? getUnitTypeZone(currentUnit) : []) as unknown[]
        if (match && currentUnit) {
          const index = parseInt(match[1], 10)
          const nestedField = match[2]
          if (Array.isArray(dz) && dz[index]) {
            const component = dz[index] as Record<string, unknown>
            const updatedComponent = { ...component, [nestedField]: value }
            const updatedType = [...dz]
            updatedType[index] = updatedComponent
            updateData = { unitType: sanitizeUnitTypeArrayForWrite(updatedType) }
          } else {
            throw new Error(`No se encontró el componente en el índice ${index}`)
          }
        } else {
          updateData = { [field]: value }
        }
      } else {
        // Campo directo - solo enviar el campo que cambió
        if (field === "unitType" && Array.isArray(value)) {
          updateData = { [field]: sanitizeUnitTypeArrayForWrite(value as unknown[]) }
        } else {
          updateData = { [field]: value }
        }
      }

      // Incluir el block si existe (requerido por Strapi)
      // Priorizar el parámetro pasado, luego el de currentUnit
      if (blockDocumentId) {
        updateData.block = blockDocumentId
      } else if (blockId) {
        updateData.block = blockId
      } else if (currentUnit?.block?.documentId) {
        updateData.block = currentUnit.block.documentId
      } else if (currentUnit?.block?.id) {
        updateData.block = currentUnit.block.id
      }

      const response = await fetch(`${this.baseURL}/units/${documentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify({
          data: updateData,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Error al actualizar unidad'
        try {
          const errorText = await response.text()
          if (errorText) {
            try {
              const parsed = JSON.parse(errorText)
              errorMessage = parsed.error?.message || errorMessage
            } catch {
              errorMessage = errorText || response.statusText || errorMessage
            }
          }
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }

      const jsonResponse = await response.json()
      
      // Strapi v5 devuelve { data: {...} }
      if (jsonResponse && jsonResponse.data) {
        return jsonResponse.data
      }
      
      return jsonResponse as StrapiUnit
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Error desconocido al actualizar unidad')
    }
  }

  /**
   * Actualiza varios campos de una unidad en un solo request (PUT).
   * Agrupa todos los cambios en un único payload para optimizar requests.
   */
  async updateUnitBatch(
    documentId: string,
    updates: Array<{ field: string; value: unknown }>,
    blockDocumentId?: string | number,
    blockId?: number
  ): Promise<StrapiUnit> {
    if (!documentId || documentId === "undefined") {
      throw new Error("Identificador de unidad inválido")
    }
    if (updates.length === 0) {
      return this.getUnitById(documentId)
    }
    const updateData: Record<string, unknown> = {}
    const typeUpdates: Array<{ index: number; nestedField: string; value: unknown }> = []
    let currentUnit: StrapiUnit | null = null

    for (const { field, value } of updates) {
      if (isClientOnlyForeignPriceKey(field)) {
        continue
      }
      if (field.startsWith('type[') && field.includes('].')) {
        const match = field.match(/^type\[(\d+)\]\.(.+)$/)
        if (match) {
          typeUpdates.push({ index: parseInt(match[1], 10), nestedField: match[2], value })
        } else {
          updateData[field] = value
        }
      } else if (field.startsWith('unitType[') && field.includes('].')) {
        const match = field.match(/^unitType\[(\d+)\]\.(.+)$/)
        if (match) {
          typeUpdates.push({ index: parseInt(match[1], 10), nestedField: match[2], value })
        } else {
          updateData[field] = value
        }
      } else {
        if (field === "unitType" && Array.isArray(value)) {
          updateData[field] = sanitizeUnitTypeArrayForWrite(value as unknown[])
        } else {
          updateData[field] = value
        }
      }
    }

    if (Object.keys(updateData).length === 0 && typeUpdates.length === 0) {
      return this.getUnitById(documentId)
    }

    const serverTypeArr = (): unknown[] | null => {
      if (!currentUnit) return null
      const z = getUnitTypeZone(currentUnit)
      return z.length > 0 ? [...z] : null
    }

    if (typeUpdates.length > 0) {
      currentUnit = await this.getUnitById(documentId)
      const typeArr = serverTypeArr() ?? []
      let updatedType: unknown[] =
        updateData.unitType !== undefined &&
        Array.isArray(updateData.unitType) &&
        (updateData.unitType as unknown[]).length > 0
          ? mergeUnitTypeWithServer(updateData.unitType as unknown[], typeArr)
          : [...typeArr]
      for (const { index, nestedField, value } of typeUpdates) {
        if (updatedType[index]) {
          updatedType[index] = { ...(updatedType[index] as object), [nestedField]: value }
        }
      }
      updateData.unitType = sanitizeUnitTypeArrayForWrite(updatedType as unknown[])
    } else if (
      updateData.unitType !== undefined &&
      Array.isArray(updateData.unitType) &&
      (updateData.unitType as unknown[]).length > 0
    ) {
      currentUnit = currentUnit ?? (await this.getUnitById(documentId))
      const typeArr = serverTypeArr()
      if (Array.isArray(typeArr) && typeArr.length > 0) {
        updateData.unitType = sanitizeUnitTypeArrayForWrite(
          mergeUnitTypeWithServer(updateData.unitType as unknown[], typeArr)
        )
      } else {
        updateData.unitType = sanitizeUnitTypeArrayForWrite(updateData.unitType as unknown[])
      }
    }

    if (blockDocumentId) {
      updateData.block = blockDocumentId
    } else if (blockId) {
      updateData.block = blockId
    } else if (currentUnit?.block?.documentId) {
      updateData.block = currentUnit.block.documentId
    } else if (currentUnit?.block?.id) {
      updateData.block = currentUnit.block.id
    } else if (Object.keys(updateData).length > 0) {
      currentUnit = currentUnit ?? (await this.getUnitById(documentId))
      if (currentUnit?.block?.documentId) updateData.block = currentUnit.block.documentId
      else if (currentUnit?.block?.id) updateData.block = currentUnit.block.id
    }

    const response = await fetch(`${this.baseURL}/units/${documentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`,
      },
      body: JSON.stringify({ data: updateData }),
    })

    if (!response.ok) {
      let errorMessage = 'Error al actualizar unidad'
      let strapiError: StrapiError | null = null
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            strapiError = JSON.parse(errorText)
            errorMessage = strapiError?.error?.message || errorMessage
          } catch {
            errorMessage = errorText || response.statusText || errorMessage
          }
        }
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      const customError = new Error(errorMessage) as Error & { strapiError?: StrapiError }
      customError.strapiError = strapiError ?? undefined
      throw customError
    }

    const jsonResponse = await response.json()
    if (jsonResponse?.data) return jsonResponse.data
    return jsonResponse as StrapiUnit
  }

  /**
   * Crea una nueva unidad
   * Endpoint: POST /api/units
   */
  async createUnit(data: Partial<StrapiUnit>): Promise<StrapiUnit> {
    try {
      // Add populate parameters to get relation fields in the response
      const queryParams = new URLSearchParams()
      queryParams.append('populate', 'block')
      queryParams.append('populate', 'block.project')
      queryParams.append('populate', 'topography')
      queryParams.append('populate', 'parkingType')
      queryParams.append('populate', 'unitUsage')
      queryParams.append('populate', 'unitType')
      
      const queryString = queryParams.toString()
      const endpoint = `/units${queryString ? `?${queryString}` : ''}`

      const dataOut: Record<string, unknown> = { ...(data as Record<string, unknown>) }
      stripClientOnlyForeignPriceKeys(dataOut)
      delete dataOut.type
      if (Array.isArray(dataOut.unitType)) {
        dataOut.unitType = sanitizeUnitTypeArrayForWrite(dataOut.unitType as unknown[])
      }
      
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify({ data: dataOut }),
      })

      if (!response.ok) {
        let errorMessage = 'Error al crear unidad'
        let strapiError: StrapiError | null = null
        try {
          const errorData = await response.json()
          strapiError = errorData
          if (errorData.error) {
            errorMessage = errorData.error.message || errorMessage
          }
        } catch {
          // If error response is not JSON, use default message
        }
        const customError = new Error(errorMessage) as Error & { strapiError?: StrapiError }
        customError.strapiError = strapiError ?? undefined
        throw customError
      }

      const jsonResponse = await response.json()
      
      if (jsonResponse && typeof jsonResponse === 'object' && 'data' in jsonResponse) {
        return jsonResponse.data
      }
      
      return jsonResponse as StrapiUnit
    } catch (error) {
      console.error('Error creating unit:', error)
      throw error
    }
  }

  /**
   * Funciones genéricas para catálogos
   * Todas las funciones de catálogos siguen el mismo patrón
   */

  /**
   * Obtiene la lista de elementos de un catálogo
   * @param endpoint Nombre del endpoint del catálogo (ej: 'amenities', 'countries')
   * @param params Parámetros de paginación, ordenamiento y filtros
   */
  async getCatalogList(
    endpoint: string,
    params?: {
      page?: number
      pageSize?: number
      sort?: string
      search?: string
    }
  ): Promise<CatalogListResponse> {
    try {
      const queryParams = new URLSearchParams()
      if (params?.page) queryParams.append('pagination[page]', params.page.toString())
      if (params?.pageSize) queryParams.append('pagination[pageSize]', params.pageSize.toString())
      if (params?.sort) queryParams.append('sort', params.sort)
      
      // Agregar filtros de búsqueda si se proporcionan
      if (params?.search) {
        // Buscar en name y code
        queryParams.append('filters[$or][0][name][$containsi]', params.search)
        queryParams.append('filters[$or][1][code][$containsi]', params.search)
      }
      
      const queryString = queryParams.toString()
      const url = `${this.baseURL}/${endpoint}${queryString ? `?${queryString}` : ''}`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Error al obtener catálogo ${endpoint}`)
      }

      const jsonResponse = await response.json()
      
      // Debug: Verificar si createdBy y updatedBy vienen en la respuesta
      if (jsonResponse.data && jsonResponse.data.length > 0) {
        console.log('Sample catalog item:', jsonResponse.data[0])
        console.log('createdBy:', jsonResponse.data[0].createdBy)
        console.log('updatedBy:', jsonResponse.data[0].updatedBy)
      }
      
      return jsonResponse as CatalogListResponse
    } catch (error) {
      console.error(`Error al obtener catálogo ${endpoint}:`, error)
      throw error
    }
  }

  /**
   * Obtiene un elemento específico de un catálogo por su ID
   * @param endpoint Nombre del endpoint del catálogo
   * @param id ID o documentId del elemento
   */
  async getCatalogItem(endpoint: string, id: string | number): Promise<CatalogItem> {
    try {
      const response = await fetch(`${this.baseURL}/${endpoint}/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Error al obtener elemento del catálogo ${endpoint}`)
      }

      const jsonResponse = await response.json()
      const catalogResponse = jsonResponse as CatalogResponse
      return catalogResponse.data
    } catch (error) {
      console.error(`Error al obtener elemento del catálogo ${endpoint}:`, error)
      throw error
    }
  }

  /**
   * Crea un nuevo elemento en un catálogo
   * @param endpoint Nombre del endpoint del catálogo
   * @param data Datos del elemento a crear
   */
  async createCatalogItem(endpoint: string, data: CatalogRequest): Promise<CatalogItem> {
    try {
      const response = await fetch(`${this.baseURL}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify({
          data,
        }),
      })

      if (!response.ok) {
        let errorMessage = `Error al crear elemento en catálogo ${endpoint}`
        let errorDetails: string[] = []
        try {
          const errorText = await response.text()
          console.error('Error response text:', errorText) // Debug
          if (errorText) {
            try {
              const parsed = JSON.parse(errorText)
              console.error('Parsed error:', parsed) // Debug
              // Extraer mensaje principal
              errorMessage = parsed.error?.message || errorMessage
              
              // Extraer detalles de validación si existen
              if (parsed.error?.details?.errors && Array.isArray(parsed.error.details.errors)) {
                errorDetails = parsed.error.details.errors.map((err: any) => {
                  const path = Array.isArray(err.path) ? err.path.join('.') : (err.path || 'unknown')
                  return `${path}: ${err.message || 'Error de validación'}`
                })
              }
            } catch (parseError) {
              console.error('Error parsing JSON:', parseError) // Debug
              errorMessage = errorText || response.statusText || errorMessage
            }
          }
        } catch (fetchError) {
          console.error('Error fetching error text:', fetchError) // Debug
          errorMessage = response.statusText || errorMessage
        }
        
        const error = new Error(errorMessage) as Error & { details?: string[] }
        if (errorDetails.length > 0) {
          error.details = errorDetails
        }
        console.error('Throwing error:', error) // Debug
        throw error
      }

      const jsonResponse = await response.json()
      const catalogResponse = jsonResponse as CatalogResponse
      return catalogResponse.data
    } catch (error) {
      console.error(`Error al crear elemento en catálogo ${endpoint}:`, error)
      throw error
    }
  }

  /**
   * Actualiza un elemento de un catálogo
   * @param endpoint Nombre del endpoint del catálogo
   * @param id ID o documentId del elemento
   * @param data Datos actualizados del elemento
   */
  async updateCatalogItem(endpoint: string, id: string | number, data: CatalogRequest): Promise<CatalogItem> {
    try {
      const response = await fetch(`${this.baseURL}/${endpoint}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify({
          data,
        }),
      })

      if (!response.ok) {
        let errorMessage = `Error al actualizar elemento en catálogo ${endpoint}`
        let errorDetails: string[] = []
        try {
          const errorText = await response.text()
          console.error('Error response text:', errorText) // Debug
          if (errorText) {
            try {
              const parsed = JSON.parse(errorText)
              console.error('Parsed error:', parsed) // Debug
              // Extraer mensaje principal
              errorMessage = parsed.error?.message || errorMessage
              
              // Extraer detalles de validación si existen
              if (parsed.error?.details?.errors && Array.isArray(parsed.error.details.errors)) {
                errorDetails = parsed.error.details.errors.map((err: any) => {
                  const path = Array.isArray(err.path) ? err.path.join('.') : (err.path || 'unknown')
                  return `${path}: ${err.message || 'Error de validación'}`
                })
              }
            } catch (parseError) {
              console.error('Error parsing JSON:', parseError) // Debug
              errorMessage = errorText || response.statusText || errorMessage
            }
          }
        } catch (fetchError) {
          console.error('Error fetching error text:', fetchError) // Debug
          errorMessage = response.statusText || errorMessage
        }
        
        const error = new Error(errorMessage) as Error & { details?: string[] }
        if (errorDetails.length > 0) {
          error.details = errorDetails
        }
        console.error('Throwing error:', error) // Debug
        throw error
      }

      const jsonResponse = await response.json()
      const catalogResponse = jsonResponse as CatalogResponse
      return catalogResponse.data
    } catch (error) {
      console.error(`Error al actualizar elemento en catálogo ${endpoint}:`, error)
      throw error
    }
  }

  /**
   * Elimina un elemento de un catálogo
   * @param endpoint Nombre del endpoint del catálogo
   * @param id ID o documentId del elemento
   */
  async deleteCatalogItem(endpoint: string, id: string | number): Promise<void> {
    try {
      const response = await fetch(`${this.baseURL}/${endpoint}/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
        },
      })

      if (!response.ok) {
        let errorMessage = `Error al eliminar elemento del catálogo ${endpoint}`
        try {
          const errorText = await response.text()
          if (errorText) {
            try {
              const parsed = JSON.parse(errorText)
              errorMessage = parsed.error?.message || errorMessage
            } catch {
              errorMessage = errorText || response.statusText || errorMessage
            }
          }
        } catch {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }
    } catch (error) {
      console.error(`Error al eliminar elemento del catálogo ${endpoint}:`, error)
      throw error
    }
  }
}

// Exportar instancia singleton
export const strapiClient = new StrapiClient()

