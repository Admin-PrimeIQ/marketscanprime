import { writeFileSync } from "node:fs"
import net from "node:net"
import tls, { type DetailedPeerCertificate } from "node:tls"
import { STAGE_CA_FILE, stageUrl } from "./connection"

/**
 * Guarda la autoridad raíz del certificado del Postgres de staging (Railway usa certificados
 * autofirmados) para validar la conexión contra ella en lugar de desactivar la validación.
 *
 * Solo hace la negociación TLS: envía el SSLRequest del protocolo de Postgres y lee la cadena de
 * certificados. No envía usuario ni contraseña.
 */

const SSL_REQUEST = Buffer.from([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f])

function toPem(raw: Buffer): string {
  const body = raw.toString("base64").match(/.{1,64}/g)!.join("\n")
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`
}

function chainRoot(cert: DetailedPeerCertificate): DetailedPeerCertificate {
  let current = cert
  while (current.issuerCertificate && current.issuerCertificate !== current) current = current.issuerCertificate
  return current
}

async function main() {
  const url = stageUrl()
  const host = url.hostname
  const socket = net.connect({ host, port: Number(url.port || 5432) })
  await new Promise<void>((ok, fail) => socket.once("connect", ok).once("error", fail))
  socket.write(SSL_REQUEST)
  const answer = await new Promise<string>((ok) => socket.once("data", (data) => ok(data.toString("utf8", 0, 1))))
  if (answer !== "S") throw new Error("El servidor no acepta SSL.")

  const secure = tls.connect({ socket, servername: host, rejectUnauthorized: false })
  await new Promise<void>((ok, fail) => secure.once("secureConnect", ok).once("error", fail))
  const leaf = secure.getPeerCertificate(true)
  secure.destroy()

  const root = chainRoot(leaf)
  writeFileSync(STAGE_CA_FILE, toPem(root.raw))
  console.log(`servidor:  ${leaf.subject?.CN} (emitido por ${leaf.issuer?.CN})`)
  console.log(`raíz:      ${root.subject?.CN}, válida hasta ${root.valid_to}`)
  console.log(`huella SHA-256 de la raíz: ${root.fingerprint256}`)
  console.log(`guardada en ${STAGE_CA_FILE}`)
}

main().catch((error) => {
  console.error("No se pudo leer el certificado:", (error as Error).message)
  process.exitCode = 1
})
