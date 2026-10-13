import { getSession } from "@/lib/auth/auth"

/**
 * Descarga un artefacto de una corrida.
 *
 * No puede ser un `<a href>`: la sesión es un JWT en localStorage que se adjunta
 * a mano como `Authorization`, y una navegación normal del navegador no manda
 * headers. El enlace directo llegaba a la ruta sin credencial y devolvía
 * `{"error":"Unauthorized"}` — que además se ve como un JSON válido en la
 * pestaña, así que parecía que la descarga había funcionado.
 *
 * Se pide con fetch, se arma un blob y se entrega desde un object URL, que sí
 * respeta el nombre de archivo.
 */
export async function downloadRunFile(runId: string, key: string): Promise<void> {
  const token = getSession()?.token
  const res = await fetch(
    `/api/sync/runs/${encodeURIComponent(runId)}/snapshot?key=${encodeURIComponent(key)}&download=1`,
    {
      cache: "no-store",
      credentials: "same-origin",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }
  )

  if (!res.ok) {
    const raw = await res.text()
    let message = raw.slice(0, 200)
    try {
      const json = JSON.parse(raw) as { error?: string }
      if (json?.error) message = json.error
    } catch {
      // La ruta puede responder HTML; el texto crudo es el mejor mensaje.
    }
    throw new Error(message || `HTTP ${res.status}`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = key.slice(key.lastIndexOf("/") + 1)
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revocar de inmediato cancela la descarga en algunos navegadores; el tick
  // siguiente ya la tiene tomada.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
