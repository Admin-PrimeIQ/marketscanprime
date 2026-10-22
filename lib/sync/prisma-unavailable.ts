import { resolveDataBackend } from "@/lib/api/data-backend"

/**
 * El módulo de sincronización todavía no está migrado. Con el backend `prisma`, los Route Handlers
 * de `/api/sync` responden 503 antes de validar nada ni llamar al n8n o al Supabase de producción.
 * Con `strapi` devuelve null y el handler sigue igual que siempre.
 */
export function syncUnavailableInPrisma(): Response | null {
  if (resolveDataBackend() !== "prisma") return null
  return Response.json(
    { error: "La sincronización no está disponible en el backend nuevo (NEXT_PUBLIC_DATA_BACKEND=prisma)." },
    { status: 503, headers: { "cache-control": "no-store" } },
  )
}
