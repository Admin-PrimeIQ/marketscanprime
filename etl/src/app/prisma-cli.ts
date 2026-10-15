import { spawn } from "node:child_process"
import net from "node:net"
import { resolve } from "node:path"
import { ETL_ROOT } from "../db/env"
import { APP_TUNNEL_PORT_ENV, appUpstream } from "./connection"

/**
 * Corre el CLI de Prisma contra `msp_app` validando el certificado de Railway.
 *
 * Railway emite el certificado del servidor para `localhost`, y el motor de Prisma exige que ese
 * nombre coincida con el host. Este proxy TCP local reenvía los bytes tal cual hacia Railway: el
 * TLS sigue siendo de punta a punta entre Prisma y el servidor (el proxy no lo descifra), Prisma se
 * conecta a `localhost` y valida la cadena contra la raíz fijada.
 *
 * Uso: tsx src/app/prisma-cli.ts migrate status
 */

const BLOCKED = ["reset", "push", "--force-reset", "--accept-data-loss"]
const PRISMA_CLI = resolve(ETL_ROOT, "node_modules/prisma/build/index.js")

async function main() {
  const args = process.argv.slice(2)
  const blocked = args.find((arg) => BLOCKED.includes(arg))
  if (blocked) {
    throw new Error(`"${blocked}" está bloqueado: la base railway también contiene dbo_stage.`)
  }

  const upstream = appUpstream()
  const sockets = new Set<net.Socket>()
  const server = net.createServer((client) => {
    const remote = net.connect(upstream)
    sockets.add(client).add(remote)
    client.pipe(remote).pipe(client)
    const close = () => {
      client.destroy()
      remote.destroy()
    }
    client.on("error", close).on("close", close)
    remote.on("error", close).on("close", close)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const { port } = server.address() as net.AddressInfo

  const code = await new Promise<number>((ok) => {
    const child = spawn(process.execPath, [PRISMA_CLI, ...args, "--config", "prisma.app.config.ts"], {
      cwd: ETL_ROOT,
      stdio: "inherit",
      env: { ...process.env, [APP_TUNNEL_PORT_ENV]: String(port) },
    })
    child.on("exit", (exitCode) => ok(exitCode ?? 1))
  })
  for (const socket of sockets) socket.destroy()
  server.close()
  process.exitCode = code
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
