/**
 * Los bancos del financiamiento, en la interfaz.
 *
 * Vive acá y no dentro del formulario porque la lista se va a dibujar en más de
 * un lugar —la ficha del bloque, su vista de sólo lectura— y porque el orden y
 * el nombre visible son una sola decisión: dos copias divergen en la primera
 * corrección, igual que pasó con los colores de tipo de inmueble.
 *
 * ── Por qué son espacios con nombre y no una lista ──────────────────────────
 *
 * En Strapi el componente `financing.financing` tiene DIECIOCHO campos, uno por
 * banco, cada uno opcional. No es una lista repetible ni una zona dinámica: un
 * campo con nombre no se puede duplicar, así que nadie puede meter Banrural dos
 * veces. El precio de eso es que la lista de bancos es fija y vive acá.
 *
 * Cada campo corresponde a UNA columna de `banking_info`. El mapeo está del lado
 * del pipeline (`banking-translations.js`); acá sólo hace falta el orden y la
 * etiqueta.
 */

/** Las claves de banco del componente `financing.financing`, en orden. */
export const BANCOS = [
  "fha",
  "bi",
  "gtc",
  "chn",
  "banrural",
  "bac",
  "bam",
  "bantrab",
  "credicorp",
  "internacional",
  "promerica",
  "azteca",
  "inmobiliario",
  "inv",
  "ficohsa",
  "vivibanco",
  "antigua",
  "ownerFinancing",
] as const

export type BancoKey = (typeof BANCOS)[number]

/**
 * El nombre visible de cada banco.
 *
 * Cuatro son siglas que todavía no confirmó nadie del negocio —BI, CHN, GTC y
 * Banco INV—. Cambiarlos es editar este mapa y el layout de config-sync; no hay
 * migración de datos de por medio, porque la identidad es la clave del campo.
 */
export const BANCO_LABEL: Record<BancoKey, string> = {
  fha: "FHA",
  bi: "Banco Industrial (BI)",
  gtc: "G&T Continental",
  chn: "CHN",
  banrural: "Banrural",
  bac: "BAC",
  bam: "BAM",
  bantrab: "Bantrab",
  credicorp: "Credicorp",
  internacional: "Banco Internacional",
  promerica: "Promerica",
  azteca: "Banco Azteca",
  inmobiliario: "Banco Inmobiliario",
  inv: "Banco INV",
  ficohsa: "Ficohsa",
  vivibanco: "Vivibanco",
  antigua: "Banco de Antigua",
  ownerFinancing: "Financiamiento propio",
}

/** Una tasa dentro del componente. */
export interface TasaBanco {
  id?: number
  annualRatePercent?: number | null
}

/**
 * El componente `financing.financing` tal como lo devuelve y lo acepta Strapi.
 *
 * Los nueve términos son del desarrollo; los dieciocho bancos son opcionales y
 * ausentes cuando no se trabaja con ellos. Un banco presente con tasa 0 diría
 * algo distinto de uno ausente, así que la interfaz nunca debe crear el espacio
 * "por si acaso".
 */
export type BlockFinancing = {
  id?: number
  downPaymentPercent?: number | null
  fractionalDownPayment?: boolean | null
  fractionalDownPaymentFHA?: number | null
  fractionalInstallmentsOtherBanks?: number | null
  minDownPaymentFHA?: number | null
  minDownPaymentOtherBanks?: number | null
  maxLoanTermYearsFHA?: number | null
  maxLoanTermYearsBanks?: number | null
  maxLoanTermYearsOwner?: number | null
} & Partial<Record<BancoKey, TasaBanco | null>>

/** Los bancos que el bloque tiene activos, en el orden de `BANCOS`. */
export function bancosActivos(financing?: BlockFinancing | null): BancoKey[] {
  if (!financing) return []
  return BANCOS.filter((b) => financing[b] != null)
}

/**
 * El plazo que le toca a un banco.
 *
 * MySQL no guarda un plazo por banco: guarda TRES, uno por grupo. FHA tiene el
 * suyo, el financiamiento propio el suyo, y los dieciséis comerciales comparten
 * uno. Se muestra junto a cada banco para que el tabulador vea qué plazo aplica
 * sin tener que recordar la regla, pero se EDITA arriba una sola vez.
 */
export function plazoDeBanco(banco: BancoKey): "FHA" | "Banks" | "Owner" {
  if (banco === "fha") return "FHA"
  if (banco === "ownerFinancing") return "Owner"
  return "Banks"
}

/**
 * El financiamiento tal como Strapi lo ACEPTA al guardar.
 *
 * Strapi devuelve cada componente con su `id` —el del financiamiento y el de
 * cada banco— y **rechaza ese mismo `id` al recibirlo**: contesta 400
 * "Invalid key id" y no guarda nada. No es sólo el de la raíz: el de cualquier
 * banco anidado rompe igual. Comprobado contra la instancia real.
 *
 * Por eso el formulario no puede devolver lo que leyó. Es el mismo tratamiento
 * que ya recibían las relaciones del bloque, que se reducen a `{ documentId }`
 * en vez de mandarse enteras.
 *
 * Quitar los `id` no pierde nada: el componente se REEMPLAZA entero en cada
 * guardado, nunca se fusiona, así que los identificadores de la versión
 * anterior no significan nada para la nueva.
 *
 * `null` sobrevive tal cual: es el interruptor apagado, y borra el componente.
 */
export function financingParaGuardar(
  financing?: BlockFinancing | null
): BlockFinancing | null {
  if (!financing) return null

  const limpio: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(financing)) {
    if (clave === "id") continue
    // Un banco: sólo su tasa. Nada de `id`, y nada que Strapi no espere.
    if (valor !== null && typeof valor === "object") {
      limpio[clave] = { annualRatePercent: (valor as TasaBanco).annualRatePercent ?? null }
      continue
    }
    limpio[clave] = valor
  }
  return limpio as BlockFinancing
}
