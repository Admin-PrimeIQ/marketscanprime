/**
 * Fachada de datos de la UI.
 *
 * Los componentes y páginas piden datos a `dataClient`, nunca a `strapiClient`. Detrás hay una
 * implementación por backend que devuelve la misma forma de datos (`documentId`, relaciones
 * anidadas, `unitType` como arreglo, `{ data, meta }` en listas). El backend se elige para toda la
 * app a la vez con `NEXT_PUBLIC_DATA_BACKEND`; mezclarlos por módulo dejaría dos fuentes de verdad.
 *
 * Hoy solo existe `strapi`. La implementación `prisma` se agrega módulo por módulo
 * (ver `docs/migration/ROADMAP.md`, fase 5).
 */

import { strapiClient } from "./strapi"

type StrapiClient = typeof strapiClient

/** Métodos que la UI usa hoy. Cada implementación debe cubrirlos todos. */
export type DataClient = Pick<
  StrapiClient,
  // Auth y cuenta
  | "login"
  | "logout"
  | "isAuthenticated"
  | "forgotPassword"
  | "resetPassword"
  | "getMe"
  | "updateMe"
  | "changePassword"
  // Proyectos
  | "getProjects"
  | "getProjectById"
  | "createProject"
  | "updateProject"
  // Bloques
  | "getBlocks"
  | "getBlocksLite"
  | "getBlockById"
  | "createBlock"
  | "updateBlock"
  // Unidades
  | "getUnitsAllPages"
  | "updateUnit"
  | "updateUnitBatch"
  | "createUnit"
  // Perfiles de tipo de cambio
  | "getExchangeRateProfiles"
  | "getExchangeRateProfileById"
  | "createExchangeRateProfile"
  | "updateExchangeRateProfile"
  | "deleteExchangeRateProfile"
  // Catálogos
  | "getCatalogList"
  | "getCatalogItem"
  | "createCatalogItem"
  | "updateCatalogItem"
  | "deleteCatalogItem"
>

export type DataBackend = "strapi" | "prisma"

export function resolveDataBackend(raw: string | undefined = process.env.NEXT_PUBLIC_DATA_BACKEND): DataBackend {
  const value = (raw ?? "").trim().toLowerCase()
  if (value === "" || value === "strapi") return "strapi"
  if (value === "prisma") return "prisma"
  throw new Error(`NEXT_PUBLIC_DATA_BACKEND="${raw}" no es válido: usa "strapi" o "prisma".`)
}

function createDataClient(backend: DataBackend): DataClient {
  switch (backend) {
    case "strapi":
      // El mismo singleton: sus métodos dependen de `this`, así que no se copian a otro objeto.
      return strapiClient
    case "prisma":
      throw new Error('La implementación "prisma" de la fachada de datos todavía no existe.')
  }
}

export const dataClient: DataClient = createDataClient(resolveDataBackend())
