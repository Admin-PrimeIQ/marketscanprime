import type { NextRequest } from "next/server"
import { getCopilotN8nUpstreamWebhookUrl } from "@/lib/copilot/constants"

/**
 * Proxies @n8n/chat webhook calls to your n8n Chat Trigger URL.
 * Browser → same-origin → no CORS. Server → n8n has no browser CORS requirement.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 120

function forwardUpstreamHeaders(res: Response): Headers {
  const out = new Headers()
  const ct = res.headers.get("content-type")
  if (ct) out.set("content-type", ct)
  const cc = res.headers.get("cache-control")
  if (cc) out.set("cache-control", cc)
  return out
}

export async function POST(req: NextRequest) {
  const upstream = getCopilotN8nUpstreamWebhookUrl()
  let target: URL
  try {
    target = new URL(upstream)
  } catch {
    return Response.json(
      { error: "Invalid N8N webhook URL (check env)." },
      { status: 500, headers: { "cache-control": "no-store" } },
    )
  }

  req.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value)
  })

  const hdrs = new Headers()
  for (const name of ["accept", "authorization"] as const) {
    const v = req.headers.get(name)
    if (v) hdrs.set(name, v)
  }

  const contentType = req.headers.get("content-type") ?? ""

  let upstreamRes: Response
  try {
    if (contentType.includes("application/json")) {
      const json = (await req.json()) as unknown
      hdrs.set("content-type", "application/json")
      upstreamRes = await fetch(target, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify(json),
      })
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      upstreamRes = await fetch(target, {
        method: "POST",
        headers: hdrs,
        body: form,
      })
    } else {
      const ct = req.headers.get("content-type")
      if (ct) hdrs.set("content-type", ct)
      const body = await req.arrayBuffer()
      upstreamRes = await fetch(target, {
        method: "POST",
        headers: hdrs,
        body: body.byteLength > 0 ? body : undefined,
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream fetch failed"
    return Response.json(
      { error: message },
      { status: 502, headers: { "cache-control": "no-store" } },
    )
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: forwardUpstreamHeaders(upstreamRes),
  })
}
