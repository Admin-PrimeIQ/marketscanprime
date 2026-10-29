import { test } from "node:test"
import assert from "node:assert/strict"
import { auditEntityName, buildAuditEntry, toAuditJson } from "./audit-entry.ts"

const createdAt = new Date("2026-10-28T16:00:00.000Z")
const row = { id: 7, publicId: "doc-7", name: "Piscina", code: null, createdAt, updatedAt: createdAt }

test("auditEntityName: modelo de Prisma → nombre de tabla", () => {
  assert.equal(auditEntityName("amenity"), "amenity")
  assert.equal(auditEntityName("securityType"), "security_type")
  assert.equal(auditEntityName("unitParkingType"), "unit_parking_type")
})

test("toAuditJson: fechas en ISO, bigint en texto, null se conserva", () => {
  assert.deepEqual(toAuditJson({ id: 1, big: BigInt("9007199254740993"), at: createdAt, code: null }), {
    id: 1,
    big: "9007199254740993",
    at: "2026-10-28T16:00:00.000Z",
    code: null,
  })
})

test("create: solo after, con id y publicId de la fila nueva", () => {
  const entry = buildAuditEntry({ userId: 3, model: "blockStatus", action: "create", after: row })
  assert.equal(entry.entity, "block_status")
  assert.equal(entry.entityId, 7)
  assert.equal(entry.publicId, "doc-7")
  assert.equal(entry.userId, 3)
  assert.equal(entry.before, undefined)
  assert.equal(entry.after?.name, "Piscina")
  assert.equal(entry.after?.createdAt, "2026-10-28T16:00:00.000Z")
})

test("update lleva las dos filas; delete solo before", () => {
  const update = buildAuditEntry({ userId: 3, model: "amenity", action: "update", before: row, after: { ...row, name: "Gimnasio" } })
  assert.equal(update.before?.name, "Piscina")
  assert.equal(update.after?.name, "Gimnasio")

  const removal = buildAuditEntry({ userId: 3, model: "amenity", action: "delete", before: row })
  assert.equal(removal.entityId, 7)
  assert.equal(removal.publicId, "doc-7")
  assert.equal(removal.after, undefined)
})

test("falta una fila que la acción necesita → error", () => {
  assert.throws(() => buildAuditEntry({ userId: 3, model: "amenity", action: "create" }))
  assert.throws(() => buildAuditEntry({ userId: 3, model: "amenity", action: "update", after: row }))
  assert.throws(() => buildAuditEntry({ userId: 3, model: "amenity", action: "delete" }))
})

test("sin publicId queda null", () => {
  const entry = buildAuditEntry({ userId: 3, model: "exchangeRate", action: "create", after: { id: 1 } })
  assert.equal(entry.publicId, null)
  assert.equal(entry.entity, "exchange_rate")
})
