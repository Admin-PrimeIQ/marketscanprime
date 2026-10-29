import { test } from "node:test"
import assert from "node:assert/strict"
import {
  buildProfileSearch,
  ExchangeRateProfileError,
  resolveProjectLinks,
  toCurrenciesComponent,
  toCurrencyRows,
  toExchangeRateProfile,
  toExchangeRateProfileListResponse,
  toProfileAuditRow,
  toProfileError,
  toProfileWriteData,
  type ProfileRow,
} from "./exchange-rate-profile-mapping.ts"

const createdAt = new Date("2026-01-02T03:04:05.000Z")
const updatedAt = new Date("2026-02-03T04:05:06.000Z")

// Imita el `Decimal` de Prisma: solo importa que tenga `toString`.
const decimal = (value: string) => ({ toString: () => value })

const row: ProfileRow = {
  id: 7,
  publicId: "doc-7",
  code: "GT-2026",
  name: "Guatemala 2026",
  description: null,
  createdAt,
  updatedAt,
  currencies: [
    { currency: "MXN", buyRate: null, sellRate: decimal("0.05") },
    { currency: "GTQ", buyRate: decimal("7.75000000"), sellRate: decimal("0.12903226") },
  ],
  projects: [
    { id: 3, publicId: "p-b", code: null, name: "Torre B" },
    { id: 2, publicId: "p-a", code: "A1", name: "Torre A" },
  ],
}

test("toExchangeRateProfile devuelve la forma de Strapi: documentId, monedas como objeto y proyectos", () => {
  assert.deepEqual(toExchangeRateProfile(row), {
    id: 7,
    documentId: "doc-7",
    name: "Guatemala 2026",
    code: "GT-2026",
    createdAt: "2026-01-02T03:04:05.000Z",
    updatedAt: "2026-02-03T04:05:06.000Z",
    currencies: {
      gtq: { buyRate: 7.75, sellRate: 0.12903226 },
      mxn: { sellRate: 0.05 },
    },
    projects: [
      { id: 3, documentId: "p-b", name: "Torre B" },
      { id: 2, documentId: "p-a", name: "Torre A", code: "A1" },
    ],
  })
})

test("toExchangeRateProfile omite currencies sin filas y deja projects vacío", () => {
  const profile = toExchangeRateProfile({ ...row, currencies: [], projects: undefined })
  assert.equal("currencies" in profile, false)
  assert.deepEqual(profile.projects, [])
})

test("toCurrenciesComponent ignora monedas fuera del componente", () => {
  assert.deepEqual(toCurrenciesComponent([{ currency: "EUR", buyRate: 1, sellRate: 1 }]), undefined)
})

test("toExchangeRateProfileListResponse arma meta.pagination como Strapi", () => {
  const response = toExchangeRateProfileListResponse([row], 51, { page: 2, pageSize: 25 })
  assert.deepEqual(response.meta.pagination, { page: 2, pageSize: 25, pageCount: 3, total: 51 })
  assert.equal(response.data[0].documentId, "doc-7")
})

test("buildProfileSearch busca en name, code y description sin distinguir mayúsculas", () => {
  assert.deepEqual(buildProfileSearch("  "), {})
  assert.deepEqual(buildProfileSearch(" gt "), {
    OR: [
      { name: { contains: "gt", mode: "insensitive" } },
      { code: { contains: "gt", mode: "insensitive" } },
      { description: { contains: "gt", mode: "insensitive" } },
    ],
  })
})

test("toCurrencyRows: undefined deja igual, null borra todo y se omiten monedas sin tasas", () => {
  assert.equal(toCurrencyRows(undefined), undefined)
  assert.deepEqual(toCurrencyRows(null), [])
  assert.deepEqual(
    toCurrencyRows({
      gtq: { buyRate: 7.75, sellRate: undefined },
      hnl: {},
      crc: { sellRate: 0.002 },
    }),
    [
      { currency: "GTQ", buyRate: 7.75, sellRate: null },
      { currency: "CRC", buyRate: null, sellRate: 0.002 },
    ],
  )
})

test("toProfileWriteData exige name al crear y normaliza code/description", () => {
  assert.throws(() => toProfileWriteData({ name: "  " }, "create"), ExchangeRateProfileError)
  assert.deepEqual(toProfileWriteData({ name: " Perfil ", code: " ", description: null }, "create"), {
    name: "Perfil",
    code: null,
    description: null,
  })
  assert.deepEqual(toProfileWriteData({ description: " nota " }, "update"), { description: "nota" })
  assert.throws(() => toProfileWriteData({ name: "" }, "update"), ExchangeRateProfileError)
})

test("resolveProjectLinks: arreglo reemplaza; connect/disconnect cambia solo los nombrados", () => {
  assert.deepEqual(resolveProjectLinks(undefined), { connect: [], disconnect: [], replace: false })
  assert.deepEqual(resolveProjectLinks(["a", 2]), { connect: ["a", 2], disconnect: [], replace: true })
  assert.deepEqual(resolveProjectLinks({ connect: ["a"], disconnect: ["b"] }), {
    connect: ["a"],
    disconnect: ["b"],
    replace: false,
  })
  assert.throws(() => resolveProjectLinks({ connect: ["a", 2], disconnect: ["2"] }), (error: unknown) => {
    assert.ok(error instanceof ExchangeRateProfileError)
    assert.deepEqual(error.details, ["2"])
    return true
  })
})

test("toProfileAuditRow guarda tasas en texto y proyectos ordenados por publicId", () => {
  const audit = toProfileAuditRow(row)
  assert.deepEqual(audit.currencies, [
    { currency: "GTQ", buyRate: "7.75000000", sellRate: "0.12903226" },
    { currency: "MXN", buyRate: null, sellRate: "0.05" },
  ])
  assert.deepEqual(audit.projects, ["p-a", "p-b"])
})

test("toProfileError traduce P2003 y P2025 y deja pasar lo demás", () => {
  const inUse = toProfileError({ code: "P2003" })
  assert.ok(inUse instanceof ExchangeRateProfileError)
  assert.match(inUse.message, /en uso/)
  assert.ok(toProfileError({ code: "P2025" }) instanceof ExchangeRateProfileError)
  const other = new Error("boom")
  assert.equal(toProfileError(other), other)
})
