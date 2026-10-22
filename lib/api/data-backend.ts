/** Backend de datos de toda la app, elegido con `NEXT_PUBLIC_DATA_BACKEND` (ver `lib/api/client.ts`). */
export type DataBackend = "strapi" | "prisma"

export function resolveDataBackend(raw: string | undefined = process.env.NEXT_PUBLIC_DATA_BACKEND): DataBackend {
  const value = (raw ?? "").trim().toLowerCase()
  if (value === "" || value === "strapi") return "strapi"
  if (value === "prisma") return "prisma"
  throw new Error(`NEXT_PUBLIC_DATA_BACKEND="${raw}" no es válido: usa "strapi" o "prisma".`)
}

/**
 * URL de n8n de producción que el código usa cuando falta su variable. Con el backend `prisma`
 * devuelve "": la app paralela nunca debe mandar nada al n8n real por omisión.
 */
export function productionN8nDefault(url: string, raw: string | undefined = process.env.NEXT_PUBLIC_DATA_BACKEND): string {
  return resolveDataBackend(raw) === "prisma" ? "" : url
}
