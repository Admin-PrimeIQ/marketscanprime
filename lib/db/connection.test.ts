import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeCaPem } from "./connection.ts"

const PEM = "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIU\nAbCd\n-----END CERTIFICATE-----"

test("DATABASE_CA_APP se acepta como PEM, con \\n literales o en base64", () => {
  assert.equal(normalizeCaPem(PEM), PEM)
  assert.equal(normalizeCaPem(PEM.replace(/\n/g, "\\n")), PEM)
  assert.equal(normalizeCaPem(`"${PEM.replace(/\n/g, "\\n")}"`), PEM)
  assert.equal(normalizeCaPem(Buffer.from(PEM).toString("base64")), PEM)
  assert.throws(() => normalizeCaPem("no-es-un-certificado"), /no es un certificado PEM/)
})
