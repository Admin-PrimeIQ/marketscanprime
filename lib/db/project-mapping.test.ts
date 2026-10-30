import { test } from "node:test"
import assert from "node:assert/strict"
import { ProjectError } from "./project-list-mapping.ts"
import {
  INVALID_PROJECT,
  MISSING_REFERENCES,
  orderedRefIds,
  PROJECT_NOT_FOUND,
  toProjectAuditRow,
  toProjectError,
  toProjectWriteData,
  toStrapiProjectDetail,
  type ProjectDetailRow,
} from "./project-mapping.ts"

const decimal = (value: string) => ({ toString: () => value })
const created = new Date("2026-01-01T00:00:00.000Z")
const updated = new Date("2026-01-02T00:00:00.000Z")

const row: ProjectDetailRow = {
  id: 10,
  publicId: "proj-10",
  code: "P-10",
  name: "Torre Norte",
  department: null,
  municipality: null,
  zone: null,
  subzone: null,
  latitude: decimal("14.60000000"),
  longitude: null,
  muvi: null,
  showroom: null,
  modelHouse: null,
  accessQuantity: null,
  imageUrl: null,
  fha: true,
  fractionalDownPayment: null,
  downPaymentPercentage: decimal("10.50"),
  createdAt: created,
  updatedAt: updated,
  countryId: null,
  developerId: 1,
  nseId: 5,
  securityTypeId: null,
  exchangeRateProfileId: 7,
  developer: { id: 1, publicId: "dev-1", code: null, name: "Constructora", description: null },
  country: null,
  nse: { id: 5, publicId: "nse-a", code: "A", name: "Alto", description: null },
  securityType: null,
  exchangeRateProfile: {
    id: 7,
    publicId: "erp-7",
    code: null,
    name: "Guatemala",
    description: null,
    createdAt: created,
    updatedAt: updated,
    currencies: [{ currency: "GTQ", buyRate: decimal("7.75"), sellRate: null }],
  },
  amenities: [
    { amenity: { id: 3, publicId: "am-3", code: null, name: "Piscina", description: null, category: null } },
    { amenity: { id: 2, publicId: "am-2", code: null, name: "Gimnasio", description: null, category: null } },
  ],
  services: [],
  blocks: [{ id: 4, publicId: "blk-4", quarter: "S1", domain: "housing" }],
}

test("toStrapiProjectDetail suma nse, perfil con monedas y copia las tasas a currencies", () => {
  const project = toStrapiProjectDetail(row)
  assert.deepEqual(project.nse, { id: 5, documentId: "nse-a", code: "A", name: "Alto" })
  assert.equal("securityType" in project, false)
  assert.deepEqual(project.exchangeRateProfile, {
    id: 7,
    documentId: "erp-7",
    name: "Guatemala",
    createdAt: created.toISOString(),
    updatedAt: updated.toISOString(),
    currencies: { gtq: { buyRate: 7.75 } },
  })
  assert.deepEqual(project.currencies, { gtq: { buyRate: 7.75 } })
  assert.deepEqual(project.amenities?.map((amenity) => amenity.documentId), ["am-3", "am-2"])
  assert.deepEqual(project.blocks, [{ id: 4, documentId: "blk-4", quarter: "S1", domain: "housing" }])
})

test("toStrapiProjectDetail sin perfil: exchangeRateProfile null y sin currencies", () => {
  const project = toStrapiProjectDetail({ ...row, exchangeRateProfile: null, exchangeRateProfileId: null })
  assert.equal(project.exchangeRateProfile, null)
  assert.equal("currencies" in project, false)
})

test("toProjectWriteData al crear exige code y name, y junta los dos problemas", () => {
  assert.throws(() => toProjectWriteData({ name: " ", code: "" }, "create"), (error: unknown) => {
    assert.ok(error instanceof ProjectError)
    assert.equal(error.message, INVALID_PROJECT)
    assert.deepEqual(error.details, ["name: es obligatorio", "code: es obligatorio"])
    return true
  })
})

test("toProjectWriteData al editar: undefined no cambia, null o vacío vacían, name no se puede vaciar", () => {
  assert.deepEqual(toProjectWriteData({}, "update"), { scalars: {}, relations: {} })
  assert.deepEqual(
    toProjectWriteData(
      {
        code: "",
        zone: " 10 ",
        subzone: null,
        latitude: 14.6,
        accessQuantity: null,
        fha: false,
        developer: " dev-1 ",
        exchangeRateProfile: null,
        nse: "",
        amenities: ["am-2", "am-3"],
      },
      "update",
    ),
    {
      scalars: { code: null, zone: "10", subzone: null, latitude: 14.6, accessQuantity: null, fha: false },
      relations: { developer: "dev-1", nse: null, exchangeRateProfile: null },
      amenities: ["am-2", "am-3"],
    },
  )
  assert.throws(() => toProjectWriteData({ name: "" }, "update"), ProjectError)
})

test("orderedRefIds respeta el orden recibido, acepta id o documentId y quita repetidos", () => {
  const rows = [
    { id: 2, publicId: "am-2" },
    { id: 3, publicId: "am-3" },
  ]
  assert.deepEqual(orderedRefIds(["am-3", 2, "3", "am-2", "no-existe"], rows), [3, 2])
})

test("toProjectAuditRow: decimales en texto, ids de relaciones y amenidades en su orden", () => {
  const audit = toProjectAuditRow(row)
  assert.equal(audit.latitude, "14.60000000")
  assert.equal(audit.longitude, null)
  assert.equal(audit.downPaymentPercentage, "10.50")
  assert.equal(audit.exchangeRateProfileId, 7)
  assert.deepEqual(audit.amenities, ["am-3", "am-2"])
  assert.deepEqual(audit.services, [])
  assert.equal("developer" in audit, false)
})

test("toProjectError traduce P2025 y P2003 y deja pasar lo demás", () => {
  assert.equal((toProjectError({ code: "P2025" }) as Error).message, PROJECT_NOT_FOUND)
  assert.equal((toProjectError({ code: "P2003" }) as Error).message, `${MISSING_REFERENCES}.`)
  const other = new Error("x")
  assert.equal(toProjectError(other), other)
  const known = new ProjectError("y")
  assert.equal(toProjectError(known), known)
})
