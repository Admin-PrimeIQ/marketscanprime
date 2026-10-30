/**
 * Fachada de datos de la UI.
 *
 * Los componentes y páginas piden datos a `dataClient`, nunca a `strapiClient`. Detrás hay una
 * implementación por backend que devuelve la misma forma de datos (`documentId`, relaciones
 * anidadas, `unitType` como arreglo, `{ data, meta }` en listas). El backend se elige para toda la
 * app a la vez con `NEXT_PUBLIC_DATA_BACKEND`; mezclarlos por módulo dejaría dos fuentes de verdad.
 *
 * La implementación `prisma` (`lib/api/prisma-client.ts`) se completa módulo por módulo
 * (ver `docs/migration/ROADMAP.md`, fase 5); hoy cubre catálogos, perfiles de tipo de cambio, proyectos,
 * bloques y la hoja de unidades (lectura y guardado).
 */

import { resolveDataBackend, type DataBackend } from "./data-backend"
import { prismaDataClient } from "./prisma-client"
import { strapiClient } from "./strapi"

export { resolveDataBackend, type DataBackend }

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

function createDataClient(backend: DataBackend): DataClient {
  switch (backend) {
    case "strapi":
      // El mismo singleton: sus métodos dependen de `this`, así que no se copian a otro objeto.
      return strapiClient
    case "prisma":
      return prismaDataClient
  }
}

export const dataClient: DataClient = createDataClient(resolveDataBackend())
