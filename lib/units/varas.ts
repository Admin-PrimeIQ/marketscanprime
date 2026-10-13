/**
 * Conversión metros ↔ varas.
 *
 * Vive sola, sin importar nada, por dos razones. La primera es que el motor de
 * fórmulas la necesita y tiene que poder ejecutarse fuera del navegador para
 * probarse; `lib/constants.ts` importa `package.json`, que arrastra la
 * aplicación entera. La segunda es que el factor es UNA decisión: duplicarlo
 * garantiza que las dos copias divergan en la primera corrección.
 *
 * `lib/constants.ts` reexporta lo de acá, así que nada de lo que ya importaba
 * de ahí cambia.
 */

/** 1 mts² = 1.431 varas² — medidas de ÁREA. */
export const M2_TO_VARAS_SQUARED = 1.431

/** 1 m = 1.19 varas — medidas de UNA dimensión (frente, profundidad). */
export const M_TO_VARAS = 1.19

/** Claves de campo lineal (frente/profundidad) — usan M_TO_VARAS, no el de área. */
const LINEAR_VARAS_KEYS = new Set([
  "frontM2", "frontVaras2",
  "depthM2", "depthVaras2",
])

/**
 * El factor que le toca a un campo de varas.
 * Acepta la clave en m (`frontM2`) o en varas (`frontVaras2`).
 */
export function getVarasFactor(fieldKey: string): number {
  return LINEAR_VARAS_KEYS.has(fieldKey) ? M_TO_VARAS : M2_TO_VARAS_SQUARED
}
