import { NextRequest, NextResponse } from 'next/server'
import { logApi, userFromBearer } from "@/lib/server-logger"

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || 'http://localhost:1337'
const STRAPI_USERNAME = process.env.STRAPI_USERNAME
const STRAPI_PASSWORD = process.env.STRAPI_PASSWORD

// Cache del JWT de admin en memoria (válido ~30 días en Strapi por defecto)
let cachedToken: string | null = null

async function getAdminToken(): Promise<string> {
  if (cachedToken) return cachedToken

  const res = await fetch(`${STRAPI_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STRAPI_USERNAME, password: STRAPI_PASSWORD }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Strapi admin login failed: ${text}`)
  }

  const data = await res.json()
  cachedToken = data.data.token as string
  return cachedToken
}

export async function POST(request: NextRequest) {
  const t0   = Date.now()
  const user = userFromBearer(request.headers.get("authorization"))
  const path = request.nextUrl.pathname

  if (!STRAPI_USERNAME || !STRAPI_PASSWORD) {
    logApi({ tag: "route:POST", path, user, status: 500, durationMs: Date.now() - t0, error: "Admin credentials not configured" })
    return NextResponse.json({ error: 'Admin credentials not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { name } = body

  if (!name) {
    logApi({ tag: "route:POST", path, user, status: 400, durationMs: Date.now() - t0, error: "name is required" })
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  try {
    const token = await getAdminToken()

    const res = await fetch(`${STRAPI_URL}/content-manager/uid/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ contentTypeUID: 'api::unit.unit', field: 'code', data: { name } }),
    })

    // Si el token expiró, limpiar cache y reintentar una vez
    if (res.status === 401) {
      cachedToken = null
      const freshToken = await getAdminToken()

      const retry = await fetch(`${STRAPI_URL}/content-manager/uid/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
        body: JSON.stringify({ contentTypeUID: 'api::unit.unit', field: 'code', data: { name } }),
      })

      if (!retry.ok) {
        const text = await retry.text()
        logApi({ tag: "route:POST", path, user, status: retry.status, durationMs: Date.now() - t0, detail: `name:${name}`, error: text.slice(0, 200) })
        return NextResponse.json({ error: `Strapi error: ${text}` }, { status: retry.status })
      }

      const retryData = await retry.json()
      logApi({ tag: "route:POST", path, user, status: 200, durationMs: Date.now() - t0, detail: `name:${name} code:${retryData.data}` })
      return NextResponse.json({ code: retryData.data })
    }

    if (!res.ok) {
      const text = await res.text()
      logApi({ tag: "route:POST", path, user, status: res.status, durationMs: Date.now() - t0, detail: `name:${name}`, error: text.slice(0, 200) })
      return NextResponse.json({ error: `Strapi error: ${text}` }, { status: res.status })
    }

    const data = await res.json()
    logApi({ tag: "route:POST", path, user, status: 200, durationMs: Date.now() - t0, detail: `name:${name} → ${data.data}` })
    return NextResponse.json({ code: data.data })

  } catch (err: any) {
    logApi({ tag: "route:POST", path, user, status: 500, durationMs: Date.now() - t0, error: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
