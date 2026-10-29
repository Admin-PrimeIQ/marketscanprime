import type { StrapiExchangeRateProfile, StrapiExchangeRateProfilesResponse } from "@/lib/api/strapi"
import { writeAudit, writeAuditMany, type AuditActor } from "./audit"
import type { AuditEntryInput } from "./audit-entry"
import { normalizePagination } from "./catalog-mapping"
import {
  buildProfileSearch,
  ExchangeRateProfileError,
  PROFILE_NOT_FOUND,
  PROFILE_NULLABLE_SORT_FIELDS,
  PROFILE_SORTABLE_FIELDS,
  profileError,
  resolveProjectLinks,
  toCurrencyRows,
  toExchangeRateProfile,
  toExchangeRateProfileListResponse,
  toProfileAuditRow,
  toProfileError,
  toProfileWriteData,
  type ExchangeRateProfileRequest,
  type ProjectRef,
} from "./exchange-rate-profile-mapping"
import type { ProfileListParams } from "./exchange-rate-profile-schemas"
import type { Prisma, PrismaClient } from "./generated/client"
import { missingRefs, parseSort, refsWhere, splitRefs, whereUnique } from "./list-query"

const PROFILE_INCLUDE = {
  currencies: true,
  projects: { select: { id: true, publicId: true, code: true, name: true }, orderBy: { name: "asc" } },
} satisfies Prisma.ExchangeRateProfileInclude

// Vincular cientos de proyectos son varias consultas seguidas contra Railway: el tope por defecto
// de una transacción interactiva (5 s) queda justo.
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 }

async function translateErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw toProfileError(error)
  }
}

/**
 * Vincula `connect` al perfil y desvincula `disconnect` (o, con `replace`, todos los que tenía y no
 * están en `connect`). Un proyecto vinculado a otro perfil pasa a este. Desvincular uno que no está
 * vinculado a este perfil no hace nada. Devuelve una fila de auditoría `update` de `project` por
 * cada proyecto que cambió.
 */
async function applyProjectLinks(
  tx: Prisma.TransactionClient,
  profileId: number,
  links: { connect: ProjectRef[]; disconnect: ProjectRef[]; replace: boolean },
  actor: AuditActor,
): Promise<AuditEntryInput[]> {
  const connectRefs = splitRefs(links.connect)
  const connectWhere = refsWhere(connectRefs)
  const connectRows = connectWhere ? await tx.project.findMany({ where: connectWhere }) : []
  const missing = missingRefs(connectRefs, connectRows)
  if (missing.length > 0) throw new ExchangeRateProfileError("Hay proyectos que no existen en la base nueva", missing)

  const connectIds = new Set(connectRows.map((project) => project.id))
  const toConnect = connectRows.filter((project) => project.exchangeRateProfileId !== profileId)

  let disconnectWhere: Prisma.ProjectWhereInput | null
  if (links.replace) {
    disconnectWhere = { exchangeRateProfileId: profileId, id: { notIn: [...connectIds] } }
  } else {
    const refsFilter = refsWhere(splitRefs(links.disconnect))
    disconnectWhere = refsFilter ? { ...refsFilter, exchangeRateProfileId: profileId } : null
  }
  const toDisconnect = disconnectWhere ? await tx.project.findMany({ where: disconnectWhere }) : []

  const changed = [...toConnect, ...toDisconnect]
  if (changed.length === 0) return []

  const updatedAt = new Date()
  if (toConnect.length > 0) {
    await tx.project.updateMany({
      where: { id: { in: toConnect.map((project) => project.id) } },
      data: { exchangeRateProfileId: profileId, updatedAt },
    })
  }
  if (toDisconnect.length > 0) {
    await tx.project.updateMany({
      where: { id: { in: toDisconnect.map((project) => project.id) } },
      data: { exchangeRateProfileId: null, updatedAt },
    })
  }

  // `updateMany` no devuelve las filas: se releen para el `after` de la auditoría.
  const afterRows = await tx.project.findMany({ where: { id: { in: changed.map((project) => project.id) } } })
  const afterById = new Map(afterRows.map((project) => [project.id, project]))
  return changed.map((before) => ({
    userId: actor.userId,
    model: "project",
    action: "update" as const,
    before,
    after: afterById.get(before.id) ?? before,
  }))
}

/**
 * Los cinco métodos de perfiles de tipo de cambio de `DataClient`, sobre `msp_app`. Cada escritura
 * deja en `audit_log`, en la misma transacción y a nombre de `actor`, la fila del perfil (con sus
 * monedas y proyectos) y una fila `update` por cada proyecto vinculado o desvinculado.
 */
export function createExchangeRateProfileRepository(prisma: PrismaClient, actor: AuditActor) {
  return {
    list(params?: ProfileListParams): Promise<StrapiExchangeRateProfilesResponse> {
      return translateErrors(async () => {
        const { page, pageSize, skip, take } = normalizePagination(params)
        const where = buildProfileSearch(params?.search)
        const orderBy = parseSort(params?.sort, PROFILE_SORTABLE_FIELDS, profileError, PROFILE_NULLABLE_SORT_FIELDS)
        const [rows, total] = await Promise.all([
          prisma.exchangeRateProfile.findMany({ where, orderBy, skip, take, include: PROFILE_INCLUDE }),
          prisma.exchangeRateProfile.count({ where }),
        ])
        return toExchangeRateProfileListResponse(rows, total, { page, pageSize })
      })
    },

    get(id: string | number): Promise<StrapiExchangeRateProfile> {
      return translateErrors(async () => {
        const row = await prisma.exchangeRateProfile.findUnique({
          where: whereUnique(id, profileError),
          include: PROFILE_INCLUDE,
        })
        if (!row) throw new ExchangeRateProfileError(PROFILE_NOT_FOUND)
        return toExchangeRateProfile(row)
      })
    },

    create(request: ExchangeRateProfileRequest): Promise<StrapiExchangeRateProfile> {
      return translateErrors(async () => {
        const data = toProfileWriteData(request, "create")
        const currencies = toCurrencyRows(request.currencies) ?? []
        const links = resolveProjectLinks(request.projects)
        return prisma.$transaction(async (tx) => {
          const created = await tx.exchangeRateProfile.create({
            data: { ...data, name: data.name as string, currencies: { create: currencies } },
          })
          const projectAudits = await applyProjectLinks(tx, created.id, links, actor)
          const after = await tx.exchangeRateProfile.findUniqueOrThrow({ where: { id: created.id }, include: PROFILE_INCLUDE })
          await writeAudit(tx, { userId: actor.userId, model: "exchangeRateProfile", action: "create", after: toProfileAuditRow(after) })
          await writeAuditMany(tx, projectAudits)
          return toExchangeRateProfile(after)
        }, TX_OPTIONS)
      })
    },

    update(id: string | number, request: ExchangeRateProfileRequest): Promise<StrapiExchangeRateProfile> {
      return translateErrors(async () => {
        const where = whereUnique(id, profileError)
        const data = toProfileWriteData(request, "update")
        const currencies = toCurrencyRows(request.currencies)
        const links = resolveProjectLinks(request.projects)
        return prisma.$transaction(async (tx) => {
          const before = await tx.exchangeRateProfile.findUnique({ where, include: PROFILE_INCLUDE })
          if (!before) throw new ExchangeRateProfileError(PROFILE_NOT_FOUND)
          // `updatedAt` explícito: cambiar solo monedas o proyectos también es editar el perfil.
          await tx.exchangeRateProfile.update({ where: { id: before.id }, data: { ...data, updatedAt: new Date() } })
          if (currencies !== undefined) {
            await tx.exchangeRateProfileCurrency.deleteMany({ where: { profileId: before.id } })
            if (currencies.length > 0) {
              await tx.exchangeRateProfileCurrency.createMany({
                data: currencies.map((currency) => ({ ...currency, profileId: before.id })),
              })
            }
          }
          const projectAudits = await applyProjectLinks(tx, before.id, links, actor)
          const after = await tx.exchangeRateProfile.findUniqueOrThrow({ where: { id: before.id }, include: PROFILE_INCLUDE })
          await writeAudit(tx, {
            userId: actor.userId,
            model: "exchangeRateProfile",
            action: "update",
            before: toProfileAuditRow(before),
            after: toProfileAuditRow(after),
          })
          await writeAuditMany(tx, projectAudits)
          return toExchangeRateProfile(after)
        }, TX_OPTIONS)
      })
    },

    remove(id: string | number): Promise<void> {
      return translateErrors(async () => {
        const where = whereUnique(id, profileError)
        await prisma.$transaction(async (tx) => {
          const before = await tx.exchangeRateProfile.findUnique({ where, include: PROFILE_INCLUDE })
          if (!before) throw new ExchangeRateProfileError(PROFILE_NOT_FOUND)
          // La FK `Restrict` de `project.exchange_rate_profile_id` también lo impide; esto da el mensaje.
          if (before.projects.length > 0) {
            throw new ExchangeRateProfileError("No se puede eliminar: el perfil está en uso.", [
              `${before.projects.length} proyecto(s) vinculado(s)`,
            ])
          }
          await tx.exchangeRateProfile.delete({ where: { id: before.id } })
          await writeAudit(tx, { userId: actor.userId, model: "exchangeRateProfile", action: "delete", before: toProfileAuditRow(before) })
        })
      })
    },
  }
}

export type ExchangeRateProfileRepository = ReturnType<typeof createExchangeRateProfileRepository>
