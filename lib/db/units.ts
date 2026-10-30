import type { StrapiUnit, StrapiUnitsResponse } from "@/lib/api/strapi"
import { PublicError } from "./action-result"
import { writeAudit, type AuditActor } from "./audit"
import { slugifyBlockCode, nextFreeCode } from "./block-code"
import { lockBlockForUpdate, recalculateBlockCounters } from "./block-counters"
import { BLOCK_NOT_FOUND, isUniqueViolation } from "./block-mapping"
import { normalizePagination } from "./catalog-mapping"
import type { Prisma, PrismaClient } from "./generated/client"
import { whereUnique } from "./list-query"
import { toStrapiUnit, toUnitListResponse, UnitError, unitError, type UnitListParams } from "./unit-mapping"
import {
  DUPLICATE_UNIT_CODE,
  MISSING_UNIT_REFERENCES,
  toUnitCreateData,
  toUnitUpdateData,
  UNIT_BLOCK_CHANGE,
  UNIT_NOT_FOUND,
  type UnitColumnValue,
  type UnitDomain,
  type UnitRef,
  type UnitRelation,
  type UnitUpdateEntry,
  type UnitWriteData,
} from "./unit-write-mapping"

const RELATED_SELECT = { id: true, publicId: true, code: true, name: true, description: true } as const

/** Lo que poblaba `getUnits` de Strapi: bloque con su proyecto, los tres catálogos y la zona dinámica. */
const UNIT_LIST_INCLUDE = {
  block: {
    select: {
      id: true,
      publicId: true,
      code: true,
      name: true,
      project: { select: { id: true, publicId: true, code: true, name: true } },
    },
  },
  usage: { select: RELATED_SELECT },
  topography: { select: RELATED_SELECT },
  parkingType: { select: RELATED_SELECT },
  housing: true,
  office: true,
  industrial: true,
} satisfies Prisma.UnitInclude

/** La fila que queda en `audit_log`: la unidad con su tabla hija. */
const AUDIT_INCLUDE = { housing: true, office: true, industrial: true } satisfies Prisma.UnitInclude

/** El orden de `getUnitsAllPages` de Strapi: la más antigua arriba, la más nueva abajo. */
const UNIT_ORDER = [{ createdAt: "asc" }, { id: "asc" }] satisfies Prisma.UnitOrderByWithRelationInput[]

const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 }

// Dos guardados de bloques distintos pueden pedir a la vez el mismo código libre (`unit.code` es único en toda la base).
const MAX_CODE_ATTEMPTS = 3

const FOREIGN_KEYS = { topography: "topographyId", parkingType: "parkingTypeId", unitUsage: "usageId" } as const satisfies Record<UnitRelation, string>

type UnitListResult = Prisma.UnitGetPayload<{ include: typeof UNIT_LIST_INCLUDE }>

/** Traduce los errores conocidos de Prisma; el resto se propaga tal cual. */
function toUnitError(error: unknown): unknown {
  if (error instanceof PublicError) return error
  const code = (error as { code?: unknown } | null)?.code
  if (code === "P2025") return new UnitError(UNIT_NOT_FOUND)
  // FK: una referencia validada se borró antes de guardar.
  if (code === "P2003") return new UnitError(`${MISSING_UNIT_REFERENCES}.`)
  if (code === "P2002") return new UnitError(DUPLICATE_UNIT_CODE)
  return error
}

async function translateErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw toUnitError(error)
  }
}

async function findRelationId(tx: Prisma.TransactionClient, relation: UnitRelation, ref: UnitRef): Promise<number | null> {
  const where = whereUnique(ref, unitError)
  const select = { id: true } as const
  switch (relation) {
    case "topography":
      return (await tx.unitTopography.findUnique({ where, select }))?.id ?? null
    case "parkingType":
      return (await tx.unitParkingType.findUnique({ where, select }))?.id ?? null
    case "unitUsage":
      return (await tx.unitUsage.findUnique({ where, select }))?.id ?? null
  }
}

// En serie: la transacción tiene una sola conexión y `pg` no admite consultas simultáneas en ella.
async function resolveRelations(tx: Prisma.TransactionClient, write: UnitWriteData): Promise<Record<string, number | null>> {
  const missing: string[] = []
  const foreignKeys: Record<string, number | null> = {}
  for (const [relation, ref] of Object.entries(write.relations) as Array<[UnitRelation, UnitRef | null]>) {
    const id = ref === null ? null : await findRelationId(tx, relation, ref)
    if (ref !== null && id === null) missing.push(`${relation}: ${ref}`)
    else foreignKeys[FOREIGN_KEYS[relation]] = id
  }
  if (missing.length > 0) throw new UnitError(MISSING_UNIT_REFERENCES, missing)
  return foreignKeys
}

/** `requested` si nadie más lo tiene; si no, el primer `requested-N` libre (la regla del UID de Strapi). */
async function freeUnitCode(tx: Prisma.TransactionClient, requested: string, ownId?: number): Promise<string> {
  const notOwn = ownId !== undefined ? { NOT: { id: ownId } } : {}
  const exact = await tx.unit.findFirst({ where: { code: requested, ...notOwn }, select: { id: true } })
  if (!exact) return requested
  const rows = await tx.unit.findMany({ where: { code: { startsWith: `${requested}-` }, ...notOwn }, select: { code: true } })
  return nextFreeCode(requested, [requested, ...rows.map((row) => row.code)])
}

/** Escritura anidada de la tabla hija del tipo del bloque: crea la fila si falta. */
function componentWrite(domain: UnitDomain, component: Record<string, UnitColumnValue>, mode: "create" | "upsert") {
  const data = component as never
  const nested = mode === "create" ? { create: data } : { upsert: { create: data, update: data } }
  switch (domain) {
    case "housing":
      return { kind: domain, housing: nested }
    case "office":
      return { kind: domain, office: nested }
    case "industrial":
      return { kind: domain, industrial: nested }
  }
}

/** La fila de auditoría: sin el bloque ni los catálogos poblados para la respuesta. */
function toUnitAuditRow(row: UnitListResult) {
  const { block: _block, usage: _usage, topography: _topography, parkingType: _parkingType, ...unit } = row
  return unit
}

/**
 * Los métodos de unidades de `DataClient`, sobre `msp_app`. Cada escritura es una transacción
 * (decidido con el usuario el 30 oct, docs/superpowers/plans/2026-10-30-unidades-guardado-prisma.md):
 * bloquea el bloque, escribe solo los campos recibidos (gana la última escritura, campo por campo,
 * como en Strapi), recalcula los contadores del bloque y deja la unidad en `audit_log` a nombre de
 * `actor`.
 */
export function createUnitRepository(prisma: PrismaClient, actor: AuditActor) {
  async function withCodeRetry<T>(attempt: (writesCode: (value: boolean) => void) => Promise<T>): Promise<T> {
    for (let attemptNumber = 1; ; attemptNumber++) {
      let writesCode = false
      try {
        return await attempt((value) => {
          writesCode = value
        })
      } catch (error) {
        if (!(writesCode && isUniqueViolation(error) && attemptNumber < MAX_CODE_ATTEMPTS)) throw error
      }
    }
  }

  return {
    async list(params: UnitListParams): Promise<StrapiUnitsResponse> {
      const block = await prisma.block.findUnique({
        where: whereUnique(params.blockDocumentId, unitError),
        select: { id: true },
      })
      if (!block) throw new UnitError(BLOCK_NOT_FOUND)

      const { page, pageSize, skip, take } = normalizePagination(params)
      const search = params.search?.trim()
      const where: Prisma.UnitWhereInput = {
        blockId: block.id,
        ...(search ? { code: { contains: search, mode: "insensitive" } } : {}),
      }
      const [rows, total] = await Promise.all([
        prisma.unit.findMany({ where, orderBy: UNIT_ORDER, skip, take, include: UNIT_LIST_INCLUDE }),
        prisma.unit.count({ where }),
      ])
      return toUnitListResponse(rows, total, { page, pageSize })
    },

    /** `updateUnit` y `updateUnitBatch`: los cambios de una unidad. Sin cambios guardables, no escribe. */
    update(id: string | number, entries: UnitUpdateEntry[]): Promise<StrapiUnit> {
      return translateErrors(async () => {
        const where = whereUnique(id, unitError)
        const saved = await withCodeRetry((markWritesCode) =>
          prisma.$transaction(async (tx) => {
            const target = await tx.unit.findUnique({ where, select: { id: true, blockId: true, block: { select: { domain: true } } } })
            if (!target) throw new UnitError(UNIT_NOT_FOUND)
            const domain = target.block.domain
            const write = toUnitUpdateData(entries, domain)
            if (write.block !== undefined) {
              const block = await tx.block.findUnique({ where: whereUnique(write.block, unitError), select: { id: true } })
              if (block?.id !== target.blockId) throw new UnitError(UNIT_BLOCK_CHANGE)
            }
            if (Object.keys(write.scalars).length === 0 && Object.keys(write.relations).length === 0 && write.component === null) {
              return tx.unit.findUniqueOrThrow({ where: { id: target.id }, include: UNIT_LIST_INCLUDE })
            }

            await lockBlockForUpdate(tx, target.blockId)
            const before = await tx.unit.findUniqueOrThrow({ where: { id: target.id }, include: AUDIT_INCLUDE })
            const foreignKeys = await resolveRelations(tx, write)

            const { code: requestedCode, ...scalars } = write.scalars
            let code: string | null | undefined
            if (requestedCode !== undefined && requestedCode !== before.code) {
              code = typeof requestedCode === "string" ? await freeUnitCode(tx, requestedCode, before.id) : null
              markWritesCode(code !== null)
            }

            // `updatedAt` explícito: cambiar solo la tabla hija también es editar la unidad.
            const after = await tx.unit.update({
              where: { id: before.id },
              data: {
                ...(scalars as Prisma.UnitUncheckedUpdateInput),
                ...foreignKeys,
                ...(code !== undefined ? { code } : {}),
                ...(write.component !== null ? componentWrite(domain, write.component, "upsert") : {}),
                updatedAt: new Date(),
              },
              include: UNIT_LIST_INCLUDE,
            })
            await recalculateBlockCounters(tx, target.blockId, actor)
            await writeAudit(tx, { userId: actor.userId, model: "unit", action: "update", before, after: toUnitAuditRow(after) })
            return after
          }, TX_OPTIONS),
        )
        return toStrapiUnit(saved)
      })
    },

    /** `createUnit`: la fila nueva de la hoja. Sin `code`, sale del nombre. */
    create(input: Record<string, unknown> & { block: UnitRef }): Promise<StrapiUnit> {
      return translateErrors(async () => {
        const blockWhere = whereUnique(input.block, unitError)
        const created = await withCodeRetry((markWritesCode) =>
          prisma.$transaction(async (tx) => {
            const block = await tx.block.findUnique({ where: blockWhere, select: { id: true, domain: true } })
            if (!block) throw new UnitError(BLOCK_NOT_FOUND)
            const write = toUnitCreateData(input, block.domain)

            await lockBlockForUpdate(tx, block.id)
            const foreignKeys = await resolveRelations(tx, write)

            const { code: requestedCode, ...scalars } = write.scalars
            const name = typeof scalars.name === "string" ? scalars.name : ""
            const base = typeof requestedCode === "string" ? requestedCode : slugifyBlockCode(name)
            const code = base ? await freeUnitCode(tx, base) : null
            markWritesCode(code !== null)

            const after = await tx.unit.create({
              data: {
                ...(scalars as Omit<Prisma.UnitUncheckedCreateInput, "blockId">),
                ...foreignKeys,
                blockId: block.id,
                code,
                ...(write.component !== null ? componentWrite(block.domain, write.component, "create") : {}),
              },
              include: UNIT_LIST_INCLUDE,
            })
            await recalculateBlockCounters(tx, block.id, actor)
            await writeAudit(tx, { userId: actor.userId, model: "unit", action: "create", after: toUnitAuditRow(after) })
            return after
          }, TX_OPTIONS),
        )
        return toStrapiUnit(created)
      })
    },
  }
}

export type UnitRepository = ReturnType<typeof createUnitRepository>
