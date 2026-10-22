/**
 * El motor de fórmulas de la unidad.
 *
 * Vivía dentro de `datasheet-units-table.tsx`, que pasa de ocho mil líneas. Se
 * sacó acá por una razón concreta: **no había forma de ejecutarlo**. Las reglas
 * de negocio de precios y medidas son lo que más caro sale equivocar —un signo
 * al revés escribe miles de filas mal— y estaban en el único lugar del proyecto
 * donde no se podían probar.
 *
 * Acá se prueban con `npm test`. El módulo no importa React ni nada del
 * navegador, a propósito.
 *
 * ── Cómo leerlo ─────────────────────────────────────────────────────────────
 *
 * Cada `sync*` recibe la unidad y la MUTA. No devuelven valores: el llamador
 * ordena la secuencia y la unidad va acumulando lo derivado. Es lo que ya hacía
 * el componente; mover el código no era momento de cambiarle la forma.
 *
 * Las cadenas son triángulos cerrados: total ↔ sin IVA ↔ por m². Editás
 * cualquier vértice y los otros dos se recalculan; por eso hay una `sync*` por
 * dirección.
 */

import { M2_TO_VARAS_SQUARED } from "./varas.ts"

/** mts² por cada espacio de parqueo; el tamaño de parqueo es calculado, no editable. */
export const PARKING_M2_PER_SPACE = 12.5

// Redondear a 2 decimales para visualización y para el "fragmento" (lado no editado)
export function roundTo2(n: number): number {
  return Math.round(n * 100) / 100
}


/** Parking Size (m²) = parkingSpaces × 12.5; actualiza parkingSizeM2 y parkingSizeVaras2 en el objeto unit */
export function syncUnitParkingSize(unit: Record<string, unknown>): void {
  const spaces = Number(unit.parkingSpaces) || 0
  unit.parkingSizeM2 = spaces * PARKING_M2_PER_SPACE
  unit.parkingSizeVaras2 = roundTo2(spaces * PARKING_M2_PER_SPACE * M2_TO_VARAS_SQUARED)
}

/**
 * Total Size = Construcción Habitable + (vertical: parqueo; horizontal/lote: 0).
 * Requiere habitableConstructionM2 ya sincronizado (llamar syncUnitHabitableConstruction antes).
 *
 * ── El parqueo cuenta sólo en vertical, y no es una convención de este código ─
 *
 * Es la regla que el warehouse ya trae, medida sobre sus tres dominios en
 * unidades CON parqueo:
 *
 *   Vivienda Vertical ....  99.9% lo incluye   (38.635 de 38.670)
 *   Oficinas Verticales ..  99.3% lo incluye   (868 de 874)
 *   Vivienda Horizontal ..  96.5% lo EXCLUYE   (20.216 de 20.947)
 *   Industrial ...........  81.0% lo EXCLUYE   (1.501 de 1.852)
 *
 * En un edificio vertical el parqueo está dentro de la estructura y es área
 * construida; en uno horizontal está afuera. Por eso oficinas lo suma e
 * industrial no: no discrepan, son tipos distintos de inmueble.
 *
 * Industrial toma las reglas de horizontal —fue una decisión explícita al abrir
 * el dominio— así que su par no es oficinas sino Vivienda Horizontal, y con ésa
 * coincide. Las 351 unidades industriales que hoy guardan otra cosa están
 * mezcladas incluso dentro de un mismo proyecto, o sea que son captura
 * inconsistente y no otra convención; al guardarlas se normalizan hacia la
 * mayoría.
 *
 * El precio por m² NUNCA usa este valor: divide por la construcción habitable,
 * que excluye el parqueo en los tres dominios. Confirmado con el negocio el
 * 2026-09-11.
 */
export function syncUnitTotalSize(unit: Record<string, unknown>, isVertical = false): void {
  const habitable = Number(unit.habitableConstructionM2) || 0
  const parkingSize = isVertical ? (Number(unit.parkingSizeM2) || 0) : 0
  const total = habitable + parkingSize
  unit.totalSizeM2 = total
  unit.totalSizeVaras2 = roundTo2(total * M2_TO_VARAS_SQUARED)
}

/** Habitable Construction: para lotes usa Terreno (landM2); para vertical = Tamaño + Balcón; resto = Tamaño */
export function syncUnitHabitableConstruction(unit: Record<string, unknown>, isVertical = false, isLote = false): void {
  let habitable: number
  if (isLote) {
    habitable = Number(unit.landM2) || 0
  } else {
    const unitSize = Number(unit.unitSizeM2) || 0
    const balcony = isVertical ? (Number((unit as any).unitType?.[0]?.balconyTerraceSizeM2) || 0) : 0
    habitable = unitSize + balcony
  }
  unit.habitableConstructionM2 = habitable
  unit.habitableConstructionVaras2 = roundTo2(habitable * M2_TO_VARAS_SQUARED)
}

export const VAT_RATE = 1.092 // Tasa base del sistema (se sobreescribe dinámicamente por bloque)

// Cuota (hipoteca): parámetros por país (ISO). País desconocido → GT.
export const INSTALLMENT_BY_ISO: Record<string, { annualRate: number; years: number; loanRatio: number }> = {
  GT: { annualRate: 0.075, years: 20, loanRatio: 0.9 },
  SV: { annualRate: 0.08, years: 25, loanRatio: 0.85 },
}
export function installmentParamsForIso(iso?: string): { annualRate: number; years: number; loanRatio: number } {
  return INSTALLMENT_BY_ISO[(iso || '').toUpperCase()] ?? INSTALLMENT_BY_ISO.GT
}

/**
 * Quita IVA: total → sinIVA.
 * vatRate < 1 (ej. 0.916): sinIVA = total × vatRate
 * vatRate ≥ 1 (ej. 1.12):  sinIVA = total ÷ vatRate
 */
export function removeVat(total: number, vatRate: number): number {
  return vatRate < 1 ? total * vatRate : total / vatRate
}

/**
 * Pone IVA: sinIVA → total.
 * vatRate < 1 (ej. 0.916): total = sinIVA ÷ vatRate
 * vatRate ≥ 1 (ej. 1.12):  total = sinIVA × vatRate
 */
export function applyVat(base: number, vatRate: number): number {
  return vatRate < 1 ? base / vatRate : base * vatRate
}


/**
 * Las tasas de IVA de una unidad, una por operación.
 *
 * ── Por qué son tres y no una ───────────────────────────────────────────────
 *
 * Antes había UNA tasa por unidad, elegida por su uso declarado, y se aplicaba
 * a las tres cadenas: venta, renta y mantenimiento. Kevin lo dijo para
 * industrial y oficinas: **la tasa la manda la operación, no el uso**. Una
 * unidad que se vende Y se renta lleva 0.916 en su venta y ÷1.12 en su renta,
 * las dos a la vez.
 *
 * Hoy ninguna unidad tiene las dos cosas —medido: 0 de 213.254 tienen precio de
 * venta y de renta a la vez— así que el cambio no mueve un solo número. Se hace
 * igual porque el acoplamiento es una trampa armada: el día que alguien llene
 * las dos columnas, la renta saldría con la tasa de venta y nadie lo notaría.
 *
 * `maintenance` sigue siendo la tasa del uso de la unidad, sin cambio: Kevin no
 * dijo qué tasa lleva el mantenimiento y adivinarlo sería inventar una regla.
 * Está anotado para preguntárselo.
 */
export interface VatRates {
  /** Venta: precio total ↔ sin IVA ↔ por m², y la cuota. */
  sale: number
  /** Renta: precio de renta ↔ renta sin IVA ↔ renta por m². */
  rent: number
  /** Mantenimiento. Pendiente de confirmar con el negocio. */
  maintenance: number
}

/** Las tres tasas iguales — el comportamiento de siempre, para llamadas sueltas. */
export function sameVatRate(rate: number): VatRates {
  return { sale: rate, rent: rate, maintenance: rate }
}

const DEFAULT_VAT_RATES: VatRates = { sale: VAT_RATE, rent: VAT_RATE, maintenance: VAT_RATE }

/**
 * La tasa de IVA según región, categoría, uso y país.
 *
 *   El Salvador (SV) → 1.0: no hay tasa aprobada todavía, así que sin IVA = total.
 *   Interior (S1/S2) + Lote → 1.12.
 *   Renta → 1.12 (divide). Venta → 0.916 (multiplica). Lo demás → 1.12.
 *
 * Vivía como closure dentro del componente, donde no se podía probar.
 */
export function getVatRate(
  quarter?: string,
  category?: string,
  usageName?: string,
  iso?: string,
): number {
  if ((iso || "").toUpperCase() === "SV") return 1.0
  const isInterior = quarter ? ["S1", "S2"].includes(quarter) : false
  const isLote = !!category?.toLowerCase().includes("lote")
  if (isInterior && isLote) return 1.12
  const usage = (usageName || "").toLowerCase()
  if (usage.includes("renta")) return 1.12
  if (usage.includes("venta")) return 0.916
  return 1.12
}

/**
 * Las tres tasas de una unidad.
 *
 * Venta y renta NO dependen del uso declarado: se piden con el uso que
 * corresponde a cada cadena. El mantenimiento sí sigue el uso, como siempre.
 */
export function vatRatesFor(opts: {
  quarter?: string
  category?: string
  usageName?: string
  iso?: string
}): VatRates {
  const { quarter, category, usageName, iso } = opts
  return {
    sale: getVatRate(quarter, category, "venta", iso),
    rent: getVatRate(quarter, category, "renta", iso),
    maintenance: getVatRate(quarter, category, usageName, iso),
  }
}

/** Price Without VAT = removeVat(Total, vatRate); Price per m² = Price Without VAT / Habitable m² */
export function syncUnitPriceFromTotal(unit: Record<string, unknown>, rates: VatRates = DEFAULT_VAT_RATES): void {
  const totalPrice = Number(unit.totalPriceUSD) || 0
  const priceWithoutVAT = removeVat(totalPrice, rates.sale)
  unit.priceWithoutVATUSD = roundTo2(priceWithoutVAT)
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  unit.pricePerM2USD = habitable > 0 ? roundTo2(priceWithoutVAT / habitable) : 0
}

/** Renta sin IVA = removeVat(Renta, vatRate); Renta por m² = Renta sin IVA / Espacio habitable */
export function syncUnitRentalFromTotal(unit: Record<string, unknown>, rates: VatRates = DEFAULT_VAT_RATES): void {
  const rental = Number(unit.rentalPriceUSD) || 0
  const rentalWithoutVAT = removeVat(rental, rates.rent)
  unit.rentalPriceWithoutVATUSD = roundTo2(rentalWithoutVAT)
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  unit.rentalPricePerM2WithoutVATUSD = habitable > 0 ? roundTo2(rentalWithoutVAT / habitable) : 0
}

/** Mantenimiento sin IVA (USD) = removeVat(Total, vatRate) */
export function maintenanceWithoutVatUsd(unit: Record<string, unknown>, rates: VatRates = DEFAULT_VAT_RATES): number {
  const total = Number(unit.maintenanceTotalPriceM2USD) || 0
  return roundTo2(removeVat(total, rates.maintenance))
}

/**
 * Mantenimiento por m² = Mantenimiento sin IVA ÷ construcción habitable (m²).
 *
 * ── Qué tasa lleva el mantenimiento, y por qué ésta ─────────────────────────
 *
 * La del uso de la unidad: venta lleva 0.916 y renta ÷1.12. No es una decisión
 * de este código, es la convención vigente del warehouse. Medido sobre
 * `housing_units`, agrupando por período de recolección:
 *
 *   2026 - 3T   26.803 filas   91% sigue  total × 0.916 ÷ habitable
 *   2026 - 2T   21.133 filas   89% sigue  total ÷ habitable
 *   2026 - 1S  113.554 filas   54% no sigue ninguna fórmula
 *
 * La convención cambió entre el 2T y el 3T, y la vigente es la del 3T: la que
 * este código ya hacía. No es un proyecto grande arrastrando el número — son
 * 207 de 249 proyectos, y el mayor pesa 2.5% de las filas.
 *
 * Los períodos viejos no siguen ninguna regla porque son captura de años
 * distintos y personas distintas. Por eso la comparación global no decide nada
 * (la mejor fórmula gana con 27%) y hay que mirar por período.
 *
 * ── El divisor es la construcción habitable, no el tamaño total ─────────────
 *
 * El parqueo no entra. En vivienda vertical los dos difieren: 62 m² habitables
 * con 25 de parqueo dan 87 de total, y el mantenimiento se divide entre 62.
 * Misma regla que el precio por m², confirmada con el negocio el 2026-09-11.
 *
 * ── Lo que viaja al warehouse ───────────────────────────────────────────────
 *
 * Strapi es la verdad (decidido con el equipo el 2026-09-29). El sync con MySQL
 * (`sync-database`) copia el total y el por m² tal cual, sin factor de IVA en
 * ninguna dirección. Antes el pull multiplicaba por 1.12 y el writeback dividía:
 * como este por m² ya sale SIN IVA, lo capturado acá llegaba al warehouse con el
 * IVA quitado dos veces y los promedios de los tableros salían 10.7% abajo.
 */
export function syncUnitMaintenancePerM2(unit: Record<string, unknown>, rates: VatRates = DEFAULT_VAT_RATES): void {
  const withoutVat = maintenanceWithoutVatUsd(unit, rates)
  unit.maintenanceWithoutVATUSD = withoutVat
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  unit.maintenancePricePerM2USD = habitable > 0 ? roundTo2(withoutVat / habitable) : 0
}

/** Fórmula inversa: dado Mantenimiento por m², calcula sin IVA y total. Requiere habitable > 0. */
export function syncMaintenanceFromPerM2(unit: Record<string, unknown>, rates: VatRates): void {
  const perM2 = Number(unit.maintenancePricePerM2USD) || 0
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  if (habitable <= 0) return
  const withoutVat = roundTo2(perM2 * habitable)
  unit.maintenanceWithoutVATUSD = withoutVat
  unit.maintenanceTotalPriceM2USD = roundTo2(applyVat(withoutVat, rates.maintenance))
}

/** Fórmula inversa: dado Precio por m², recalcula Sin IVA y Total. Requiere habitable > 0. */
export function syncPriceFromPerM2(unit: Record<string, unknown>, rates: VatRates): void {
  const perM2 = Number(unit.pricePerM2USD) || 0
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  if (habitable <= 0) return
  const withoutVat = roundTo2(perM2 * habitable)
  unit.priceWithoutVATUSD = withoutVat
  unit.totalPriceUSD = roundTo2(applyVat(withoutVat, rates.sale))
}

/** Fórmula inversa: dado Precio sin IVA, recalcula Precio Total + derivados. */
export function syncPriceFromWithoutVAT(unit: Record<string, unknown>, rates: VatRates): void {
  const withoutVat = Number(unit.priceWithoutVATUSD) || 0
  unit.totalPriceUSD = roundTo2(applyVat(withoutVat, rates.sale))
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  unit.pricePerM2USD = habitable > 0 ? roundTo2(withoutVat / habitable) : 0
}

/** Fórmula inversa: dado Renta sin IVA, recalcula Precio Renta + derivados. */
export function syncRentalFromWithoutVAT(unit: Record<string, unknown>, rates: VatRates): void {
  const withoutVat = Number(unit.rentalPriceWithoutVATUSD) || 0
  unit.rentalPriceUSD = roundTo2(applyVat(withoutVat, rates.rent))
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  unit.rentalPricePerM2WithoutVATUSD = habitable > 0 ? roundTo2(withoutVat / habitable) : 0
}

/** Fórmula inversa: dado Precio Renta por m², recalcula Renta sin IVA y Renta Total. Requiere habitable > 0. */
export function syncRentalFromPerM2(unit: Record<string, unknown>, rates: VatRates): void {
  const perM2 = Number(unit.rentalPricePerM2WithoutVATUSD) || 0
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  if (habitable <= 0) return
  const withoutVat = roundTo2(perM2 * habitable)
  unit.rentalPriceWithoutVATUSD = withoutVat
  unit.rentalPriceUSD = roundTo2(applyVat(withoutVat, rates.rent))
}

/** Fórmula inversa: dado Mantenimiento sin IVA, recalcula Mantenimiento Total + derivados. */
export function syncMaintenanceFromWithoutVAT(unit: Record<string, unknown>, rates: VatRates): void {
  const withoutVat = Number(unit.maintenanceWithoutVATUSD) || 0
  unit.maintenanceTotalPriceM2USD = roundTo2(applyVat(withoutVat, rates.maintenance))
  const habitable = Number(unit.habitableConstructionM2) || Number(unit.unitSizeM2) || 0
  unit.maintenancePricePerM2USD = habitable > 0 ? roundTo2(withoutVat / habitable) : 0
}

/** Calcula cuota mensual desde precio sin IVA (para sync y para fallback de vista) */
export function calcInstallmentFromPriceWithoutVAT(priceWithoutVAT: number, iso?: string): number {
  const { annualRate, years, loanRatio } = installmentParamsForIso(iso)
  const loanAmount = priceWithoutVAT * loanRatio
  if (loanAmount <= 0) return 0
  const monthlyRate = annualRate / 12
  const nper = years * 12
  const pmt = (monthlyRate * loanAmount) / (1 - Math.pow(1 + monthlyRate, -nper))
  return roundTo2(Math.abs(pmt))
}

/** Cuota mensual hipoteca: 90% del precio sin IVA, 20 años, 7.5% anual. PMT(rate, nper, -pv) → valor positivo */
export function syncUnitInstallment(unit: Record<string, unknown>, rates: VatRates = DEFAULT_VAT_RATES, iso?: string): void {
  const priceWithoutVAT = Number(unit.priceWithoutVATUSD) || removeVat(Number(unit.totalPriceUSD) || 0, rates.sale)
  unit.installmentUSD = calcInstallmentFromPriceWithoutVAT(priceWithoutVAT, iso)
}

/** Ingreso = cuota × 4 */
export function syncUnitIncome(unit: Record<string, unknown>): void {
  const installment = Number(unit.installmentUSD) || 0
  unit.incomeUSD = roundTo2(installment * 4)
}

/**
 * Absorción de unidad: si disponibilidad es "Not Available",
 * 1 / (días entre fecha_recolección y fecha_inicio / 30) = unidades vendidas por mes.
 * Sin redondear (float). Si fechas faltan o diffDays <= 0, retorna 0.
 */
export function syncUnitAbsorption(
  unit: Record<string, unknown>,
  collectionDateStr?: string,
  startDateStr?: string
): void {
  const availability = unit.availability as string | undefined
  if (availability !== "Not Available" && availability !== "No Disponible") {
    unit.unitAbsorption = 0
    return
  }
  if (!collectionDateStr || !startDateStr) {
    unit.unitAbsorption = 0
    return
  }
  const collection = new Date(collectionDateStr).getTime()
  const start = new Date(startDateStr).getTime()
  const diffMs = collection - start
  const diffDays = diffMs / (24 * 60 * 60 * 1000)
  if (diffDays <= 0) {
    unit.unitAbsorption = 0
    return
  }
  const raw = 1 / (diffDays / 30)
  unit.unitAbsorption = Math.round(raw * 1e12) / 1e12
}

/**
 * Absorción por m² = absorción de unidad × tamaño habitable.
 * Si absorción es 0 o tamaño habitable es null/0, resultado 0. Float, no redondear.
 */
export function syncUnitAbsorptionPerM2(unit: Record<string, unknown>): void {
  const absorption = Number(unit.unitAbsorption) || 0
  if (absorption === 0) {
    unit.absorptionPerM2 = 0
    return
  }
  const habitable = Number(unit.habitableConstructionM2) ?? Number(unit.unitSizeM2) ?? 0
  if (habitable === 0) {
    unit.absorptionPerM2 = 0
    return
  }
  unit.absorptionPerM2 = absorption * habitable
}


// ─────────────────────────────────────────────────────────────────────────────
// Industrial: el tamaño de la unidad se SUMA, no se escribe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De qué tipo es un bloque industrial. `null` = no es industrial.
 *
 * Son las dos únicas categorías que existen, medidas en el warehouse: Bodegas
 * (107 bloques) y Terrenos (12).
 */
export type IndustrialKind = "bodegas" | "terrenos" | null

/**
 * De qué tipo es un bloque, a partir de su categoría.
 *
 * ── Por qué se compara EXACTO y no por substring ────────────────────────────
 *
 * Los otros resolvedores del grid buscan un pedazo de palabra ("vertical",
 * "lote") porque esas categorías vienen escritas de varias formas. Acá no se
 * puede: una categoría de vivienda llamada "Terrenos campestres" haría que sus
 * unidades calcularan el tamaño como industriales y el precio por m² saldría de
 * la nada. Se exige el nombre o el código completo, que hoy son exactamente
 * "Bodegas" y "Terrenos".
 */
export function industrialKindOf(nombre?: string, codigo?: string): IndustrialKind {
  const partes = [nombre, codigo].map((v) => (v ?? "").trim().toLowerCase())
  if (partes.includes("terrenos")) return "terrenos"
  if (partes.includes("bodegas")) return "bodegas"
  return null
}

/** La zona dinámica de la unidad, donde viven bodega, oficina y mezzanine. */
function industrialZone(unit: Record<string, unknown>): Record<string, unknown> {
  const zona = (unit as { unitType?: unknown }).unitType
  return Array.isArray(zona) ? ((zona[0] as Record<string, unknown>) ?? {}) : {}
}

/**
 * El tamaño de una unidad industrial.
 *
 *   Terrenos → el terreno.
 *   Bodegas  → bodega + oficina + mezzanine.
 *
 * ── Por qué esto va a `unitSizeM2` y no a `totalSizeM2` ─────────────────────
 *
 * Kevin llama a esto "tamaño total", pero **no es la columna `tamano_total_m2`
 * del warehouse**. Medido sobre las 2.210 unidades industriales: la suma
 * reproduce `tamano_sin_parqueo_m2` en el 99.7% y `tamano_total_m2` en sólo el
 * 82.4%; las dos columnas difieren en 351 filas, con una mediana de 62,5 m².
 * `tamano_total_m2` incluye el parqueo, esto no.
 *
 * Y el push escribe `tamano_total_m2 ← totalSizeM2`. Si esta suma fuera a
 * `totalSizeM2`, el primer envío pisaría esas 351 filas. Va a `unitSizeM2`, que
 * es lo que el push manda a `tamano_sin_parqueo_m2` y lo que el divisor del
 * precio por m² ya usa — o sea que hoy no cambia ningún número: sólo hace que
 * la suma se RECALCULE cuando alguien edita una de sus partes, que antes no
 * pasaba.
 *
 * **Confirmado por el negocio el 2026-09-11.** Se le preguntó a Kevin con los
 * dos números sobre la mesa —210 sin parqueo contra 235 con parqueo— y
 * respondió: "sí, se debe calcular sin incluir el parqueo; así está alineado
 * con los demás usos". Y lo está: en oficinas el divisor es la construcción
 * habitable, que es el total MENOS el parqueo, y en vivienda igual. El parqueo
 * nunca entra en el divisor, en ningún dominio.
 */
export function industrialUnitSizeM2(unit: Record<string, unknown>, kind: IndustrialKind): number {
  if (kind === "terrenos") return Number(unit.landM2) || 0
  const z = industrialZone(unit)
  return (
    (Number(z.warehouseStorageSizeM2) || 0) +
    (Number(z.officeSizeM2) || 0) +
    (Number(z.mezzanineSizeM2) || 0)
  )
}

/** Escribe el tamaño industrial en la unidad, con su espejo en varas². */
export function syncIndustrialUnitSize(unit: Record<string, unknown>, kind: IndustrialKind): void {
  if (!kind) return
  const total = industrialUnitSizeM2(unit, kind)
  unit.unitSizeM2 = total
  unit.unitSizeVaras2 = roundTo2(total * M2_TO_VARAS_SQUARED)
}

/**
 * Campos de fórmula que se reconcilian en carga (si difieren de la DB → se marcan como cambio).
 * Solo deben incluirse campos que Strapi PERSISTE; un campo derivado solo-cliente que no se
 * guarda siempre vendría en 0 desde la DB y se marcaría como "cambio" en cada carga (falso positivo).
 * Por eso se excluye `maintenanceWithoutVATUSD` (ver CLIENT_ONLY_USD_FIELDS en lib/api/strapi.ts:
 * es derivado de maintenanceTotalPriceM2USD y nunca se persiste).
 */
export const RECONCILED_FORMULA_FIELDS = [
  "parkingSizeM2", "totalSizeM2", "habitableConstructionM2",
  "priceWithoutVATUSD", "pricePerM2USD",
  "rentalPriceWithoutVATUSD",
  "maintenancePricePerM2USD",
  "installmentUSD", "incomeUSD",
  "unitAbsorption", "absorptionPerM2",
  "unitSizeM2", // lote: unitSize = terreno
] as const

/** Sincroniza todos los campos con fórmula en la unidad (para que existan en memoria y se persistan al guardar) */
export function ensureUnitFormulasSynced(
  unit: Record<string, unknown>,
  blockDates?: { collectionDate?: string; startDate?: string },
  isVertical = false,
  rates: VatRates = DEFAULT_VAT_RATES,
  isLote = false,
  countryIso?: string,
  /** Tipo de bloque industrial; null cuando no lo es. */
  industrialKind: IndustrialKind = null,
): Array<{ field: string; before: number; after: number }> {
  // Snapshot para reconciliación: detectar qué campos de fórmula cambian respecto a lo guardado.
  const before: Record<string, number> = {}
  for (const f of RECONCILED_FORMULA_FIELDS) before[f] = Number((unit as Record<string, unknown>)[f]) || 0

  syncUnitParkingSize(unit)
  // Industrial: el tamaño de unidad es la SUMA de sus partes (o el terreno), no
  // un valor que alguien escriba. Va antes del habitable, que depende de él.
  syncIndustrialUnitSize(unit, industrialKind)
  // Lote: unitSize = terreno = total (igualar el tamaño de unidad al terreno).
  if (isLote) {
    const land = Number(unit.landM2) || 0
    unit.unitSizeM2 = land
    unit.unitSizeVaras2 = roundTo2(land * M2_TO_VARAS_SQUARED)
  }
  syncUnitHabitableConstruction(unit, isVertical, isLote)
  syncUnitTotalSize(unit, isVertical)
  syncUnitPriceFromTotal(unit, rates)
  syncUnitRentalFromTotal(unit, rates)
  syncUnitMaintenancePerM2(unit, rates)
  syncUnitInstallment(unit, rates, countryIso)
  syncUnitIncome(unit)
  syncUnitAbsorption(unit, blockDates?.collectionDate, blockDates?.startDate)
  syncUnitAbsorptionPerM2(unit)

  const changed: Array<{ field: string; before: number; after: number }> = []
  for (const f of RECONCILED_FORMULA_FIELDS) {
    const after = Number((unit as Record<string, unknown>)[f]) || 0
    if (Math.abs(after - before[f]) > 0.01) changed.push({ field: f, before: before[f], after })
  }
  return changed
}
