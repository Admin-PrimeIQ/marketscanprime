// Cliente Strapi para la migración. Soporta dos modos de autenticación,
// ocultos tras tres funciones uniformes: listBlocks, listUnitsForBlock, putUnit.
//
//   - Modo REST (recomendado): STRAPI_API_TOKEN presente.
//       Endpoints: /api/blocks, /api/units, PUT /api/units/:documentId
//       Header:   Authorization: Bearer <api-token>
//   - Modo admin (fallback): STRAPI_USERNAME + STRAPI_PASSWORD.
//       POST /admin/login -> data.data.token (JWT cacheado, re-login una vez en 401)
//       Endpoints: /content-manager/collection-types/api::block.block (y api::unit.unit)
//
// La resolución de credenciales es PEREZOSA: importar este módulo NO lanza error
// aunque falte .env. El error sólo ocurre cuando se LLAMA una función sin creds.

import 'dotenv/config'

// --- Configuración (leída de forma perezosa) ----------------------------------

function env() {
  return {
    url: (process.env.STRAPI_URL || '').replace(/\/$/, ''),
    apiToken: process.env.STRAPI_API_TOKEN || '',
    username: process.env.STRAPI_USERNAME || '',
    password: process.env.STRAPI_PASSWORD || '',
    putConcurrency: parseInt(process.env.PUT_CONCURRENCY || '8', 10) || 8,
    // Espera (ms) después de cada PUT en cada runner, para throttlear el rate. 0 = sin pausa.
    putDelayMs: parseInt(process.env.PUT_DELAY_MS || '0', 10) || 0,
  }
}

/**
 * Resuelve el modo de autenticación a partir del entorno. Lanza un error claro
 * (nombrando las variables faltantes) sólo cuando se invoca (perezoso).
 * @returns {{ mode: 'rest'|'admin', url: string, apiToken?: string, username?: string, password?: string }}
 */
function resolveAuth() {
  const e = env()
  if (!e.url) {
    throw new Error(
      'Falta STRAPI_URL en .migration/.env (apunta al host de Strapi destino).'
    )
  }
  if (e.apiToken) {
    return { mode: 'rest', url: e.url, apiToken: e.apiToken }
  }
  if (e.username && e.password) {
    return { mode: 'admin', url: e.url, username: e.username, password: e.password }
  }
  throw new Error(
    'Faltan credenciales de Strapi en .migration/.env: define STRAPI_API_TOKEN ' +
      '(modo REST) o bien STRAPI_USERNAME + STRAPI_PASSWORD (modo admin).'
  )
}

// --- Estado de autenticación admin --------------------------------------------

let cachedAdminToken = null

async function adminLogin(auth) {
  const res = await fetch(`${auth.url}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: auth.username, password: auth.password }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Strapi admin login falló (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  cachedAdminToken = data?.data?.token
  if (!cachedAdminToken) throw new Error('Strapi admin login: respuesta sin token.')
  return cachedAdminToken
}

async function adminToken(auth) {
  if (cachedAdminToken) return cachedAdminToken
  return adminLogin(auth)
}

// --- Fetch con headers de auth + re-login admin en 401 ------------------------

/**
 * Hace fetch contra Strapi resolviendo el header de auth según el modo.
 * En modo admin, ante un 401 limpia el JWT y reintenta una vez.
 */
async function authedFetch(auth, fullUrl, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }

  if (auth.mode === 'rest') {
    headers.Authorization = `Bearer ${auth.apiToken}`
    return fetch(fullUrl, { ...options, headers })
  }

  // admin
  const token = await adminToken(auth)
  headers.Authorization = `Bearer ${token}`
  let res = await fetch(fullUrl, { ...options, headers })
  if (res.status === 401) {
    cachedAdminToken = null
    const fresh = await adminLogin(auth)
    headers.Authorization = `Bearer ${fresh}`
    res = await fetch(fullUrl, { ...options, headers })
  }
  return res
}

// --- Construcción de URLs según modo ------------------------------------------

// Tamaño de página al traer (el Strapi destino permite hasta 5k).
const PAGE_SIZE = '5000'

function blocksListUrl(auth, page) {
  if (auth.mode === 'rest') {
    const qs = new URLSearchParams()
    qs.set('populate[blockCategory]', 'true')
    qs.set('populate[project][populate][country]', 'true')
    qs.set('pagination[pageSize]', PAGE_SIZE)
    qs.set('pagination[page]', String(page))
    return `${auth.url}/api/blocks?${qs.toString()}`
  }
  // admin / content-manager
  const qs = new URLSearchParams()
  qs.set('populate[blockCategory]', 'true')
  qs.set('populate[project][populate][country]', 'true')
  qs.set('pageSize', PAGE_SIZE)
  qs.set('page', String(page))
  return `${auth.url}/content-manager/collection-types/api::block.block?${qs.toString()}`
}

function unitsListUrl(auth, blockDocumentId, page) {
  if (auth.mode === 'rest') {
    const qs = new URLSearchParams()
    qs.set('filters[block][documentId][$eq]', String(blockDocumentId))
    qs.set('populate[unitUsage]', 'true')
    qs.set('populate[unitType]', 'true')
    qs.set('pagination[pageSize]', PAGE_SIZE)
    qs.set('pagination[page]', String(page))
    return `${auth.url}/api/units?${qs.toString()}`
  }
  const qs = new URLSearchParams()
  qs.set('filters[block][documentId][$eq]', String(blockDocumentId))
  qs.set('populate[unitUsage]', 'true')
  qs.set('populate[unitType]', 'true')
  qs.set('pageSize', PAGE_SIZE)
  qs.set('page', String(page))
  return `${auth.url}/content-manager/collection-types/api::unit.unit?${qs.toString()}`
}

function unitPutUrl(auth, documentId) {
  if (auth.mode === 'rest') {
    return `${auth.url}/api/units/${documentId}`
  }
  return `${auth.url}/content-manager/collection-types/api::unit.unit/${documentId}`
}

// Tanto /api como /content-manager devuelven { data, meta:{pagination} }.
function paginationOf(json) {
  const p = json?.meta?.pagination || {}
  const page = p.page || 1
  const pageCount = p.pageCount || 1
  return { page, pageCount }
}

// --- Normalización de bloques -------------------------------------------------

function normalizeBlock(raw) {
  // En /content-manager los atributos vienen aplanados (igual que en v5 REST).
  const cat = raw?.blockCategory || {}
  return {
    documentId: raw?.documentId,
    id: raw?.id,
    quarter: raw?.quarter,
    categoryName: cat?.name,
    categoryCode: cat?.code,
    name: raw?.name,
    collectionDate: raw?.collectionDate,
    startDate: raw?.startDate,
    countryIso: raw?.project?.country?.isoCode2 || raw?.project?.country?.code,
  }
}

// --- API pública --------------------------------------------------------------

/**
 * Lista todos los bloques (paginado, pageSize 5000), con blockCategory poblado.
 * @returns {Promise<Array<{documentId,id,quarter,categoryName,categoryCode,name,collectionDate,startDate}>>}
 */
export async function listBlocks() {
  const auth = resolveAuth()
  const out = []
  let page = 1
  for (;;) {
    const res = await authedFetch(auth, blocksListUrl(auth, page))
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`listBlocks falló (${res.status}): ${text.slice(0, 200)}`)
    }
    const json = await res.json()
    const rows = Array.isArray(json?.data) ? json.data : []
    for (const r of rows) out.push(normalizeBlock(r))
    const { page: cur, pageCount } = paginationOf(json)
    if (cur >= pageCount) break
    page = cur + 1
  }
  return out
}

/**
 * Lista todas las unidades de un bloque (paginado, pageSize 5000), con
 * unitUsage y unitType poblados. Devuelve los objetos crudos de Strapi.
 * @param {string} blockDocumentId
 * @returns {Promise<Array<object>>}
 */
export async function listUnitsForBlock(blockDocumentId) {
  const auth = resolveAuth()
  const out = []
  let page = 1
  for (;;) {
    const res = await authedFetch(auth, unitsListUrl(auth, blockDocumentId, page))
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `listUnitsForBlock(${blockDocumentId}) falló (${res.status}): ${text.slice(0, 200)}`
      )
    }
    const json = await res.json()
    const rows = Array.isArray(json?.data) ? json.data : []
    for (const r of rows) out.push(r)
    const { page: cur, pageCount } = paginationOf(json)
    if (cur >= pageCount) break
    page = cur + 1
  }
  return out
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504])
const BACKOFF_MS = [250, 500, 1000, 2000, 4000]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * PUT de SÓLO los campos cambiados de una unidad: body `{ data: dataObj }`.
 * Backoff exponencial (5 reintentos) en 429/502/503/504. Otros no-2xx: sin
 * reintento.
 * @param {string} documentId
 * @param {object} dataObj campos cambiados
 * @returns {Promise<{ok:boolean,status:number,error?:string}>}
 */
export async function putUnit(documentId, dataObj) {
  const auth = resolveAuth()
  const url = unitPutUrl(auth, documentId)
  const body = JSON.stringify({ data: dataObj })

  let lastStatus = 0
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    let res
    try {
      res = await authedFetch(auth, url, { method: 'PUT', body })
    } catch (err) {
      // Error de red: trátalo como reintentos disponibles.
      if (attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt])
        continue
      }
      return { ok: false, status: 0, error: String(err?.message || err) }
    }

    lastStatus = res.status
    if (res.ok) return { ok: true, status: res.status }

    if (RETRYABLE_STATUSES.has(res.status) && attempt < BACKOFF_MS.length) {
      await sleep(BACKOFF_MS[attempt])
      continue
    }

    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, error: text.slice(0, 300) || undefined }
  }
  return { ok: false, status: lastStatus }
}

/**
 * Pool de concurrencia simple: ejecuta worker(item, index) sobre items con un
 * máximo de `size` en vuelo. Resuelve con el array de resultados (en orden).
 * @template T,R
 * @param {T[]} items
 * @param {(item:T, index:number)=>Promise<R>} worker
 * @param {number} [size]
 * @returns {Promise<R[]>}
 */
export async function runPool(items, worker, size = env().putConcurrency, delayMs = env().putDelayMs) {
  const limit = Math.max(1, size || 1)
  const wait = Math.max(0, delayMs || 0)
  const results = new Array(items.length)
  let next = 0

  async function runner() {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
      // Throttle proactivo: pausa entre PUTs de un mismo runner.
      if (wait > 0 && next < items.length) await sleep(wait)
    }
  }

  const runners = []
  for (let i = 0; i < Math.min(limit, items.length); i++) runners.push(runner())
  await Promise.all(runners)
  return results
}

/** Modo de auth actual (sin lanzar si falta config: devuelve 'unconfigured'). */
export function authMode() {
  try {
    return resolveAuth().mode
  } catch {
    return 'unconfigured'
  }
}
