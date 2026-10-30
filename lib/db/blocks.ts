import type { StrapiBlock, StrapiBlocksResponse } from "@/lib/api/strapi"
import { writeAudit, type AuditActor } from "./audit"
import { codeSourceName, EMPTY_BLOCK_CODE, nextFreeCode, slugifyBlockCode } from "./block-code"
import {
  BlockError,
  blockError,
  buildBlockWhere,
  parseBlockSort,
  toBlockListResponse,
  type BlockListParams,
} from "./block-list-mapping"
import {
  BLOCK_NOT_FOUND,
  BLOCK_RELATIONS,
  isUniqueViolation,
  MISSING_REFERENCES,
  toBlockAuditRow,
  toBlockError,
  toBlockWriteData,
  toStrapiBlockDetail,
  type BlockRef,
  type BlockRelation,
  type BlockRequest,
  type BlockWriteData,
  type FinancingWrite,
} from "./block-mapping"
import { normalizePagination } from "./catalog-mapping"
import type { Prisma, PrismaClient } from "./generated/client"
import { whereUnique } from "./list-query"

const RELATED_SELECT = { id: true, publicId: true, code: true, name: true, description: true } as const

/** Lo que poblaba `getBlocks` de Strapi: proyecto con su país, categoría, enfoque y estado. */
const BLOCK_LIST_INCLUDE = {
  project: {
    select: {
      id: true,
      publicId: true,
      code: true,
      name: true,
      department: true,
      municipality: true,
      zone: true,
      subzone: true,
      country: { select: { ...RELATED_SELECT, isoCode: true, isoCode2: true } },
    },
  },
  category: { select: RELATED_SELECT },
  focus: { select: RELATED_SELECT },
  status: { select: RELATED_SELECT },
} satisfies Prisma.BlockInclude

/** `getBlockById` sumaba el financiamiento con sus bancos. */
const BLOCK_DETAIL_INCLUDE = { ...BLOCK_LIST_INCLUDE, financing: true, bankRates: true } satisfies Prisma.BlockInclude

/** Lo que entra en `audit_log`: la fila con su financiamiento y sus bancos, sin las relaciones pobladas. */
const AUDIT_INCLUDE = { financing: true, bankRates: true } satisfies Prisma.BlockInclude

const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 }

/** Intentos ante un choque de `code` con otro guardado simultáneo. */
const MAX_CODE_ATTEMPTS = 3

type ForeignKeyData = Partial<Record<(typeof BLOCK_RELATIONS)[BlockRelation], number | null>>

async function translateErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw toBlockError(error)
  }
}

async function findRelationId(prisma: PrismaClient, relation: BlockRelation, ref: BlockRef): Promise<number | null> {
  const where = whereUnique(ref, blockError)
  const select = { id: true } as const
  switch (relation) {
    case "project":
      return (await prisma.project.findUnique({ where, select }))?.id ?? null
    case "blockCategory":
      return (await prisma.blockCategory.findUnique({ where, select }))?.id ?? null
    case "blockFocus":
      return (await prisma.blockFocus.findUnique({ where, select }))?.id ?? null
    case "blockStatus":
      return (await prisma.blockStatus.findUnique({ where, select }))?.id ?? null
  }
}

/**
 * `id` de cada referencia del cuerpo, en paralelo y fuera de la transacción (si una se borra antes
 * de guardar, la FK responde P2003). Si alguna no existe, lanza un solo error que las nombra todas.
 */
async function resolveReferences(prisma: PrismaClient, write: BlockWriteData): Promise<ForeignKeyData> {
  const entries = Object.entries(write.relations) as Array<[BlockRelation, BlockRef | null]>
  const ids = await Promise.all(entries.map(([relation, ref]) => (ref === null ? null : findRelationId(prisma, relation, ref))))
  const missing: string[] = []
  const foreignKeys: ForeignKeyData = {}
  entries.forEach(([relation, ref], index) => {
    if (ref !== null && ids[index] === null) missing.push(`${relation}: ${ref}`)
    else foreignKeys[BLOCK_RELATIONS[relation]] = ids[index]
  })
  if (missing.length > 0) throw new BlockError(MISSING_REFERENCES, missing)
  return foreignKeys
}

/** Primer código libre para `name`, sin contar el propio bloque al editar. */
async function generateCode(db: PrismaClient | Prisma.TransactionClient, name: string, ownId?: number): Promise<string> {
  const base = slugifyBlockCode(name)
  if (!base) throw new BlockError(EMPTY_BLOCK_CODE)
  const rows = await db.block.findMany({
    where: { code: { startsWith: base }, ...(ownId !== undefined ? { NOT: { id: ownId } } : {}) },
    select: { code: true },
  })
  return nextFreeCode(
    base,
    rows.map((row) => row.code),
  )
}

const financingTerms = (financing: FinancingWrite) => financing.terms as Prisma.BlockFinancingCreateWithoutBlockInput

/** Al editar: el componente se reemplaza entero (términos y bancos) o, con `null`, se borra. */
function financingUpdate(financing: FinancingWrite | null | undefined, hadFinancing: boolean): Prisma.BlockUncheckedUpdateInput {
  if (financing === undefined) return {}
  if (financing === null) {
    return { bankRates: { deleteMany: {} }, ...(hadFinancing ? { financing: { delete: true } } : {}) }
  }
  const terms = financingTerms(financing)
  return {
    financing: { upsert: { create: terms, update: terms } },
    bankRates: {
      deleteMany: {},
      ...(financing.bankRates.length > 0 ? { createMany: { data: financing.bankRates } } : {}),
    },
  }
}

/**
 * Los métodos de bloques de `DataClient`, sobre `msp_app`. Cada escritura deja en `audit_log`, en la
 * misma transacción y a nombre de `actor`, la fila del bloque con su financiamiento y sus bancos. El
 * código lo genera el servidor (`block-code.ts`); si choca con otro guardado simultáneo, se reintenta.
 * Los contadores y promedios se guardan como llegan: se recalculan al guardar unidades.
 */
export function createBlockRepository(prisma: PrismaClient, actor: AuditActor) {
  async function readDetail(id: number): Promise<StrapiBlock> {
    return toStrapiBlockDetail(await prisma.block.findUniqueOrThrow({ where: { id }, include: BLOCK_DETAIL_INCLUDE }))
  }

  async function withCodeRetry(attempt: (generatesCode: (generated: boolean) => void) => Promise<number>): Promise<number> {
    for (let attemptNumber = 1; ; attemptNumber++) {
      let generated = false
      try {
        return await attempt((value) => {
          generated = value
        })
      } catch (error) {
        if (!(generated && isUniqueViolation(error) && attemptNumber < MAX_CODE_ATTEMPTS)) throw error
      }
    }
  }

  return {
    list(params?: BlockListParams): Promise<StrapiBlocksResponse> {
      return translateErrors(async () => {
        const { page, pageSize, skip, take } = normalizePagination(params)
        const where = buildBlockWhere(params) as Prisma.BlockWhereInput
        const orderBy = parseBlockSort(params?.sort) as Prisma.BlockOrderByWithRelationInput[]
        const [rows, total] = await Promise.all([
          prisma.block.findMany({ where, orderBy, skip, take, include: BLOCK_LIST_INCLUDE }),
          prisma.block.count({ where }),
        ])
        return toBlockListResponse(rows, total, { page, pageSize })
      })
    },

    get(id: string | number): Promise<StrapiBlock> {
      return translateErrors(async () => {
        const row = await prisma.block.findUnique({ where: whereUnique(id, blockError), include: BLOCK_DETAIL_INCLUDE })
        if (!row) throw new BlockError(BLOCK_NOT_FOUND)
        return toStrapiBlockDetail(row)
      })
    },

    create(request: BlockRequest): Promise<StrapiBlock> {
      return translateErrors(async () => {
        const write = toBlockWriteData(request, "create")
        const name = write.scalars.name as string
        const foreignKeys = await resolveReferences(prisma, write)
        const financing = write.financing
        const id = await withCodeRetry(async (markGenerated) => {
          const code = await generateCode(prisma, name)
          markGenerated(true)
          return prisma.$transaction(async (tx) => {
            const created = await tx.block.create({
              data: {
                ...write.scalars,
                ...foreignKeys,
                name,
                domain: write.scalars.domain!,
                projectId: foreignKeys.projectId!,
                code,
                ...(financing
                  ? {
                      financing: { create: financingTerms(financing) },
                      ...(financing.bankRates.length > 0 ? { bankRates: { createMany: { data: financing.bankRates } } } : {}),
                    }
                  : {}),
              },
              include: AUDIT_INCLUDE,
            })
            await writeAudit(tx, { userId: actor.userId, model: "block", action: "create", after: toBlockAuditRow(created) })
            return created.id
          }, TX_OPTIONS)
        })
        return readDetail(id)
      })
    },

    update(id: string | number, request: BlockRequest): Promise<StrapiBlock> {
      return translateErrors(async () => {
        const where = whereUnique(id, blockError)
        const write = toBlockWriteData(request, "update")
        const foreignKeys = await resolveReferences(prisma, write)
        const blockId = await withCodeRetry((markGenerated) =>
          prisma.$transaction(async (tx) => {
            const before = await tx.block.findUnique({ where, include: AUDIT_INCLUDE })
            if (!before) throw new BlockError(BLOCK_NOT_FOUND)
            const sourceName = codeSourceName(write.scalars.name, before)
            const code = sourceName === null ? undefined : await generateCode(tx, sourceName, before.id)
            markGenerated(code !== undefined)
            // `updatedAt` explícito: cambiar solo el financiamiento también es editar el bloque.
            const after = await tx.block.update({
              where: { id: before.id },
              data: {
                ...write.scalars,
                ...(foreignKeys as Prisma.BlockUncheckedUpdateInput),
                ...(code !== undefined ? { code } : {}),
                ...financingUpdate(write.financing, before.financing !== null),
                updatedAt: new Date(),
              },
              include: AUDIT_INCLUDE,
            })
            await writeAudit(tx, {
              userId: actor.userId,
              model: "block",
              action: "update",
              before: toBlockAuditRow(before),
              after: toBlockAuditRow(after),
            })
            return before.id
          }, TX_OPTIONS),
        )
        return readDetail(blockId)
      })
    },
  }
}

export type BlockRepository = ReturnType<typeof createBlockRepository>
