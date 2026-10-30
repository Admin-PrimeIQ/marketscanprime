/**
 * Código (`block.code`, único) de un bloque en la base nueva. En Strapi lo pedía el formulario a
 * `/api/blocks/generate-code`, que entraba como administrador; acá lo arma el servidor al guardar:
 * el slug del nombre y, si ya existe, el primer sufijo libre (`-1`, `-2`, …), como el UID de Strapi.
 *
 * No importa nada de Prisma ni de React, así que corre bajo `node --test`.
 */

export const EMPTY_BLOCK_CODE = "No se puede generar el código del bloque: el nombre no tiene letras ni números."

/** El mismo slug que `components/blocks/block-form.tsx`: minúsculas, sin acentos, guiones. */
export function slugifyBlockCode(text: string): string {
  if (!text || typeof text !== "string") return ""
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** `base` si está libre; si no, `base-1`, `base-2`, … el primero que no esté en `taken`. */
export function nextFreeCode(base: string, taken: Iterable<string | null>): string {
  const used = new Set<string>()
  for (const code of taken) if (code) used.add(code)
  if (!used.has(base)) return base
  for (let suffix = 1; ; suffix++) {
    const candidate = `${base}-${suffix}`
    if (!used.has(candidate)) return candidate
  }
}

export interface StoredBlockCode {
  name: string | null
  code: string | null
}

/**
 * Nombre del que sale un código nuevo, o `null` si el bloque conserva el suyo.
 *
 * - Crear: siempre del nombre recibido.
 * - Editar: solo si el cuerpo trae `name` y el nombre cambió o el bloque no tiene código (la ETL
 *   deja `NULL` los códigos repetidos en Strapi). Sin `name` en el cuerpo, el código no se toca.
 */
export function codeSourceName(requestName: string | undefined, stored: StoredBlockCode | null): string | null {
  if (requestName === undefined) return null
  if (!stored) return requestName
  if (requestName === (stored.name ?? "") && stored.code) return null
  return requestName
}
