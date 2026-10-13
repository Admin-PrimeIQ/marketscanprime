// Campos derivados que la migración puede escribir (persistidos por Strapi).
// Excluye maintenanceWithoutVATUSD (client-only, ver lib/api/strapi.ts).
export const PERSISTED_FORMULA_FIELDS = [
  'parkingSizeM2', 'totalSizeM2', 'habitableConstructionM2',
  'priceWithoutVATUSD', 'pricePerM2USD',
  'rentalPriceWithoutVATUSD',
  'maintenancePricePerM2USD',
  'installmentUSD', 'incomeUSD',
  'unitAbsorption', 'absorptionPerM2',
  'unitSizeM2', // lote: unitSize = terreno
  'landM2',     // lote: land = unitSize (espejo bidireccional)
]
// Umbral para considerar que un campo "cambió" (DB vs recalculado).
// Antes era 0.01, pero cuando las columnas de Strapi estaban en numeric(8,2)
// truncaban a 2 decimales y 0.01 evitaba re-marcar ese ruido. Ahora que las
// columnas guardan precisión completa (p. ej. unitAbsorption decimal(18,12)),
// 0.01 era DEMASIADO grueso: una diferencia como 0.98 (DB viejo) vs
// 0.975794251123 (fórmula) = 0.0042 quedaba por debajo y NO se detectaba.
// 1e-6 detecta esas pérdidas de precisión sub-centésimo y sigue siendo
// idempotente: tras guardar el valor completo, el residual float (~1e-12)
// queda muy por debajo, así que no re-marca en corridas siguientes.
export const CHANGE_TOLERANCE = 0.000001
