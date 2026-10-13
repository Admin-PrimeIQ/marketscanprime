/**
 * datasheet-units-table-config.ts
 *
 * Single source of truth for all declarative configuration of the
 * DatasheetUnitsTable component.  Runtime logic (sync functions, grid
 * event handlers, React state) stays in the component; pure data and
 * rule declarations live here.
 *
 * Sections
 * ────────
 *   display          → field labels and toast field order
 *   foreignCurrency  → which fields can have their foreign visual cleared,
 *                      and which prefer a stored foreign value over a
 *                      runtime USD→local conversion
 *   fields           → canonical list of USD price fields shared across
 *                      the component (getCellContent, pending-change sweeps, etc.)
 *   cascade          → which fields trigger syncs, what they affect,
 *                      yellow-highlight + toast behaviour
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDING A NEW FIELD GROUP  (e.g. "price-sale")
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  1. Add the USD field keys to DATASHEET_CONFIG.fields.usdPriceFields.
 *
 *  2. Add labels to DATASHEET_CONFIG.display.fieldLabels.
 *
 *  3. Insert the field keys at the right position in
 *     DATASHEET_CONFIG.display.toastFieldOrder.
 *
 *  4. If the group has a "parent total" field whose foreign-currency visual
 *     should be cleared on edit, add it to
 *     DATASHEET_CONFIG.foreignCurrency.clearableParentFields.
 *
 *  5. If any field prefers a stored GTQ/MXN value over a USD conversion,
 *     add it to DATASHEET_CONFIG.foreignCurrency.preferStoredForeignValue.
 *
 *  6. Add cascade group + rules to DATASHEET_CONFIG.cascade.groups.
 *
 *  7. Register new sync function names in syncFnRegistry inside
 *     datasheet-units-table.tsx (one line per new sync function).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types for cascade section
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single cascade rule: "when THIS field is edited, run THAT sync and
 * mark THOSE other fields as changed."
 */
export interface CascadeRule {
  /**
   * USD field key that triggers this rule.
   * Example: "maintenancePricePerM2USD"
   */
  editedField: string

  /**
   * Key in the component's syncFnRegistry.
   * The registered function receives the unit object and recomputes
   * derived values in-place.
   * Example: "syncMaintenanceFromPerM2"
   *   → calls syncMaintenanceFromPerM2(unit, vatRate)
   *   → recalculates maintenanceWithoutVATUSD and maintenanceTotalPriceM2USD
   */
  syncFn: string

  /**
   * USD field keys whose values change as a side-effect of the sync.
   * Each of these fields will be:
   *   • highlighted yellow (pending-change indicator)
   *   • mirrored to its foreign-currency column (e.g. maintenanceTotalPriceM2GTQ)
   *     when the group's hasCurrencyMirror is true
   *   • listed in the cascade toast
   * Example: ["maintenanceTotalPriceM2USD", "maintenanceWithoutVATUSD"]
   */
  affects: string[]

  /**
   * When set, clearEditableForeignPriceVisuals() is called for this field
   * after the sync.  Needed for inverse-formula edits that write back to
   * a "parent total" so the grid doesn't display a stale foreign-currency
   * visual value.
   * Example: "maintenanceTotalPriceM2USD"
   */
  clearForeignVisuals?: string

  /**
   * When true the grid redraws all cells in the row after the edit so
   * partner columns (e.g. the GTQ column) refresh immediately.
   * Required for inverse-formula edits where a "child" field rewrites
   * a "parent" field upstream.
   * Example: editing perM2 recalculates Total → inverseSync: true
   */
  inverseSync?: boolean

  /**
   * When true, applyCascadeRule will verify that habitableConstructionM2 > 0
   * before executing the sync. If it is zero or missing, the edit is rejected
   * with a Sileo error toast instead of silently producing a zero result.
   *
   * Set this on any perM2 rule where the formula divides by habitable area.
   * Example: pricePerM2 = priceWithoutVAT ÷ habitableM2 → division by zero if habitable = 0.
   */
  requiresHabitableM2?: boolean
}

/**
 * A single rule within a dimension cascade group.
 * "When dimension field X changes, run sync Y and mark Z fields as changed."
 */
export interface DimensionCascadeRule {
  /** The dimension field key that triggers this rule (e.g. "unitSizeM2", "housing.balconyTerraceM2"). */
  triggerField: string

  /**
   * Key in the component's syncFnRegistry.
   * The registered function receives the unit object and recomputes all
   * affected derived values in-place (habitable area, perM2 prices, absorption…).
   */
  syncFn: string

  /**
   * Fields to show in the cascade toast as affected.
   * Example: ["totalSizeM2", "habitableConstructionM2", "pricePerM2USD", …]
   */
  affects: string[]

  /**
   * Plain fields to mark as pending-change (addPendingChange).
   * Use for non-price fields that have no foreign-currency variant.
   * Example: ["totalSizeM2", "habitableConstructionM2", "absorptionPerM2"]
   */
  pendingFields: string[]

  /**
   * Price fields to mark as pending-change AND mirror to active foreign-currency
   * columns (addPendingChangeMirrored).
   * Example: ["pricePerM2USD", "rentalPricePerM2WithoutVATUSD", "maintenancePricePerM2USD"]
   */
  pendingMirroredFields: string[]

  /**
   * When the raw triggerField key has no fieldLabel (e.g. DZ keys like
   * "housing.balconyTerraceM2"), use this key as the "edited" field in the
   * toast so the right label is highlighted.
   * Example: "habitableConstructionM2" (shown as the trigger when balcony changes)
   */
  toastTriggerField?: string
}

/**
 * A group of dimension-triggered cascade rules.
 * Unlike price CascadeGroupConfig, these are triggered by changes to
 * physical dimension fields (m², terreno, balcón) rather than price fields.
 */
export interface DimensionCascadeGroup {
  /** Human-readable label for this variant. */
  label: string

  /**
   * Optional condition that must hold for this group to fire.
   *   "isVertical"   → only runs for vertical unit types
   *   "isLote"       → only runs for lote (land) unit types
   *   "isIndustrial" → industrial de categoría Bodegas: el tamaño de unidad es
   *                    bodega + oficina + mezzanine, y esas tres viven en la
   *                    zona dinámica
   *   "isTerrenos"   → industrial de categoría Terrenos: el tamaño de unidad es
   *                    el terreno; la zona dinámica va en cero
   *   absent         → always runs (e.g. unitSizeM2 applies to all types)
   */
  condition?: "isVertical" | "isLote" | "isNotLote" | "isHorizontal" | "isIndustrial" | "isTerrenos"

  /**
   * When true, applyDimensionCascade automatically mirrors every mts² field in
   * pendingFields to its varas² counterpart (via m2ToVarasMap in the component),
   * marking it as pending AND including it in the cascade toast.
   * Equivalent to hasCurrencyMirror for price groups.
   */
  mirrorVaras?: boolean

  /** One rule per dimension trigger field in this variant. */
  rules: DimensionCascadeRule[]
}

export interface CascadeGroupConfig {
  /** Human-readable label (used in toast title prefix, future admin UI). */
  label: string

  /**
   * All USD field keys that belong to this group.
   * Drives fast "does this group own this field?" lookups.
   * Example: ["maintenanceTotalPriceM2USD", "maintenanceWithoutVATUSD", "maintenancePricePerM2USD"]
   */
  fields: string[]

  /**
   * When true, pending-change yellow highlights are automatically mirrored
   * to every active foreign-currency column.
   * Example: maintenanceTotalPriceM2USD → maintenanceTotalPriceM2GTQ
   */
  hasCurrencyMirror: boolean

  /**
   * User actions that trigger cascade for this group.
   *   "edit"   → user types a value directly in a cell
   *   "paste"  → user pastes from clipboard (single or multi-cell)
   *   "create" → new row (optimistic in-memory only; no pendingChanges added)
   */
  triggers: ReadonlyArray<"edit" | "paste" | "create">

  /** One rule per editable field in the group. */
  rules: CascadeRule[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Main config object
// ─────────────────────────────────────────────────────────────────────────────

export const DATASHEET_CONFIG = {

  // ───────────────────────────────────────────────────────────────────────────
  // display
  // Human-readable labels and ordering used by the cascade toast.
  // ───────────────────────────────────────────────────────────────────────────
  display: {

    /**
     * Maps USD field keys to their display labels in the cascade toast.
     * Only fields listed here will appear in the toast; unlisted fields are
     * silently skipped.
     * Add an entry whenever a new field should be visible in cascade toasts.
     */
    fieldLabels: {
      // Parqueo
      parkingSpaces:                    "Espacios Parqueo",
      parkingSizeM2:                    "Tamaño Parqueo (mts²)",
      parkingSizeVaras2:                "Tamaño Parqueo (varas²)",
      // Medidas — mismo texto que los headers del grid
      landM2:                           "Terreno (mts²)",
      landVaras2:                       "Terreno (varas²)",
      unitSizeM2:                       "Tamaño Unidad (mts²)",
      unitSizeVaras2:                   "Tamaño Unidad (varas²)",
      "housing.balconyTerraceM2":       "Balcón / terraza (m²)",
      "offices.balconyTerraceM2":       "Balcón / terraza (m²)",
      // Las tres piezas del tamaño industrial. Sin etiqueta, el aviso en
      // cascada mostraría la clave cruda al investigador.
      "industrial.warehouseM2":          "Bodega de almacenamiento (m²)",
      "industrial.officeM2":             "Oficina (m²)",
      "industrial.mezzanineM2":          "Mezzanine (m²)",
      totalSizeM2:                      "Tamaño Total (mts²)",
      totalSizeVaras2:                  "Tamaño Total (varas²)",
      habitableConstructionM2:          "Construcción Habitable (mts²)",
      habitableConstructionVaras2:      "Construcción Habitable (varas²)",
      // Venta
      totalPriceUSD:                    "Precio Total (USD)",
      priceWithoutVATUSD:               "Precio sin IVA (USD)",
      pricePerM2USD:                    "Precio por mts² (USD)",
      // Renta
      rentalPriceUSD:                   "Precio Renta (USD)",
      rentalPriceWithoutVATUSD:         "Renta sin IVA (USD)",
      rentalPricePerM2WithoutVATUSD:    "Renta por mts² (USD)",
      // Mantenimiento
      maintenanceTotalPriceM2USD:       "Mantenimiento Total (USD)",
      maintenanceWithoutVATUSD:         "Mantenimiento sin IVA (USD)",
      maintenancePricePerM2USD:         "Mantenimiento por mts² (USD)",
      // Financiamiento
      installmentUSD:                   "Cuota (USD)",
      incomeUSD:                        "Ingreso (USD)",
      // Absorción
      unitAbsorption:                   "Absorción Unidad",
      absorptionPerM2:                  "Absorción por mts²",
    } as Record<string, string>,

    /**
     * Orden idéntico al orden izquierda→derecha de columnas en el grid.
     * Reordenar este array cuando cambie el orden de columnas.
     */
    toastFieldOrder: [
      // Medidas
      "landM2",           "landVaras2",
      "unitSizeM2",       "unitSizeVaras2",
      // Parqueo
      "parkingSizeM2",    "parkingSizeVaras2",
      
      // Medidas
      
      "totalSizeM2",      "totalSizeVaras2",
      "habitableConstructionM2", "habitableConstructionVaras2",
      // Parqueo
      "parkingSpaces",
      // Medidas
      "housing.balconyTerraceM2",
      "offices.balconyTerraceM2",
      "industrial.warehouseM2",
      "industrial.officeM2",
      "industrial.mezzanineM2",
      // Venta
      "totalPriceUSD",
      "priceWithoutVATUSD",
      "pricePerM2USD",
      // Renta
      "rentalPriceUSD",
      "rentalPriceWithoutVATUSD",
      "rentalPricePerM2WithoutVATUSD",
      // Mantenimiento
      "maintenanceTotalPriceM2USD",
      "maintenanceWithoutVATUSD",
      "maintenancePricePerM2USD",
      // Financiamiento
      "installmentUSD",
      "incomeUSD",
      // Absorción
      "unitAbsorption",
      "absorptionPerM2",
    ] as string[],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // foreignCurrency
  // Rules that control how foreign-currency (non-USD) columns behave when
  // their USD counterpart is edited.
  // ───────────────────────────────────────────────────────────────────────────
  foreignCurrency: {

    /**
     * USD fields whose foreign-currency visual value should be cleared after
     * the user edits that USD field directly.
     *
     * Background: when a user types Q2,000 in the GTQ column of "Total", that
     * Q2,000 is stored visually on the unit so the grid can show it without
     * converting back.  If the user then edits the USD "Total" column, that
     * stored GTQ value is stale → we clear it so the grid recomputes from USD.
     *
     * Only "top-level total" fields need this because they are the ones whose
     * foreign visual is stored separately.  Derived fields (sinIVA, perM2) are
     * always computed on the fly and never have a stored visual.
     *
     * Example: editing totalPriceUSD → clear stored totalPriceGTQ visual.
     */
    clearableParentFields: [
      "totalPriceUSD",
      "rentalPriceUSD",
      "maintenanceTotalPriceM2USD",
    ] as string[],

    /**
     * USD fields whose foreign-currency column should display the STORED GTQ
     * value (if one exists) rather than computing USD × buyRate in real time.
     *
     * This matters when the user has typed a "round" foreign number (e.g. Q100
     * per m²) and the round-trip USD → GTQ would introduce a rounding error.
     * By storing and preferring the original GTQ value the display stays clean.
     *
     * Only applies when the active editing currency matches the column's
     * currency (checked at runtime in getCellContent).
     *
     * Example: user types Q764 in maintenancePricePerM2GTQ → stored as Q764.
     *   Grid shows Q764 directly instead of (764/7.64)*7.64 = 763.9999…
     */
    preferStoredForeignValue: [
      "totalPriceUSD",
      "rentalPriceUSD",
      "rentalPricePerM2WithoutVATUSD",   // user may type a round GTQ value; prefer stored over USD×rate
      "maintenanceTotalPriceM2USD",
      "maintenancePricePerM2USD",
    ] as string[],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // fields
  // Canonical lists of field keys reused across getCellContent, pending-change
  // sweeps, column visibility, and paste/fill handlers.
  // ───────────────────────────────────────────────────────────────────────────
  fields: {

    /**
     * All USD price/financial fields that have foreign-currency counterparts
     * (e.g. totalPriceGTQ).  Used in:
     *   • getCellContent  → iterates this list to detect currency columns
     *   • pending-change  → mirroring yellow highlights to GTQ columns
     *   • column defs     → generating the full set of currency columns
     *
     * Add a field here when it participates in the USD ↔ foreign-currency
     * display and editing system.
     */
    usdPriceFields: [
      "totalPriceUSD",
      "priceWithoutVATUSD",
      "pricePerM2USD",
      "rentalPriceUSD",
      "rentalPriceWithoutVATUSD",
      "rentalPricePerM2WithoutVATUSD",
      "maintenanceTotalPriceM2USD",
      "maintenanceWithoutVATUSD",
      "maintenancePricePerM2USD",
      "installmentUSD",
      "incomeUSD",
    ] as string[],

    /**
     * USD fields that are client-side computed display values only — they must
     * NOT be sent to the API on save.
     *
     * When a field here is edited, its inverse formula updates the sibling fields
     * that DO go to the API (e.g. editing rentalPricePerM2WithoutVATUSD updates
     * rentalPriceWithoutVATUSD and rentalPriceUSD, which are the real API fields).
     *
     * Add a field here when it is always derivable from other API-persisted fields
     * and storing it in the DB would be redundant.
     *
     * Note: foreign-currency fields (e.g. rentalPricePerM2WithoutVATGTQ) are
     * excluded from the API via isForeignCurrencyPriceColumnKey — this list is
     * for USD fields that are still client-only.
     */
    clientOnlyFields: [
      "rentalPricePerM2WithoutVATUSD",   // derivable: rentalPriceWithoutVATUSD ÷ habitableM2
    ] as string[],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // cascade
  // Field-cascade rules: which edited field triggers which sync function,
  // what it affects, and how highlights + toasts behave.
  // See the file-level JSDoc for a step-by-step guide to adding a new group.
  // ───────────────────────────────────────────────────────────────────────────
  cascade: {

    groups: {

      /**
       * Maintenance price group.
       *
       * Three fields form a closed triangle — editing any one recomputes the
       * other two:
       *
       *   maintenanceTotalPriceM2USD  (total maintenance cost with VAT)
       *       ↑ syncUnitMaintenancePerM2        ↓ syncMaintenanceFromWithoutVAT
       *   maintenanceWithoutVATUSD    (total maintenance cost without VAT)
       *       ↑ syncMaintenanceFromPerM2
       *   maintenancePricePerM2USD    (maintenance cost per habitable m²)
       *
       * All three have GTQ / MXN / etc. columns → hasCurrencyMirror: true
       */
      maintenance: {
        label: "Mantenimiento",
        fields: [
          "maintenanceTotalPriceM2USD",
          "maintenanceWithoutVATUSD",
          "maintenancePricePerM2USD",
        ],
        hasCurrencyMirror: true,
        triggers: ["edit", "paste", "create"] as const,
        rules: [
          {
            // Editing the total (with VAT) recomputes sinIVA and perM2.
            // No clearForeignVisuals: the total itself is the parent; its
            // foreign visual is cleared upstream before this rule runs.
            editedField: "maintenanceTotalPriceM2USD",
            syncFn: "syncUnitMaintenancePerM2",
            affects: ["maintenanceWithoutVATUSD", "maintenancePricePerM2USD"],
          },
          {
            // Editing sinIVA → forward to total (+ VAT), derive perM2.
            // inverseSync: the Total column must redraw immediately.
            editedField: "maintenanceWithoutVATUSD",
            syncFn: "syncMaintenanceFromWithoutVAT",
            affects: ["maintenanceTotalPriceM2USD", "maintenancePricePerM2USD"],
            clearForeignVisuals: "maintenanceTotalPriceM2USD",
            inverseSync: true,
          },
          {
            // Editing perM2 → sinIVA = perM2 × habitableM2, total = sinIVA × vatRate.
            // inverseSync: both Total and sinIVA columns must redraw.
            editedField: "maintenancePricePerM2USD",
            syncFn: "syncMaintenanceFromPerM2",
            affects: ["maintenanceTotalPriceM2USD", "maintenanceWithoutVATUSD"],
            clearForeignVisuals: "maintenanceTotalPriceM2USD",
            inverseSync: true,
            requiresHabitableM2: true,
          },
        ],
      } satisfies CascadeGroupConfig,

      /**
       * Rental price group.
       *
       * Three fields form a closed triangle — editing any one recomputes the
       * other two:
       *
       *   rentalPriceUSD              (total rental price with VAT)
       *       ↑ syncUnitRentalFromTotal       ↓ syncRentalFromWithoutVAT
       *   rentalPriceWithoutVATUSD    (rental price without VAT)
       *       ↑ syncRentalFromPerM2
       *   rentalPricePerM2WithoutVATUSD  (rental price per habitable m², no VAT)
       *
       * rentalPricePerM2WithoutVATUSD is client-only — its computed value is NOT
       * sent to the API (see DATASHEET_CONFIG.fields.clientOnlyFields).
       * Editing it triggers the inverse formula which updates the API fields.
       *
       * All three have GTQ / MXN / etc. columns → hasCurrencyMirror: true
       */
      rental: {
        label: "Precio de Renta",
        fields: [
          "rentalPriceUSD",
          "rentalPriceWithoutVATUSD",
          "rentalPricePerM2WithoutVATUSD",
        ],
        hasCurrencyMirror: true,
        triggers: ["edit", "paste", "create"] as const,
        rules: [
          {
            // Editing the rental total recomputes sinIVA and perM2.
            editedField: "rentalPriceUSD",
            syncFn: "syncUnitRentalFromTotal",
            affects: ["rentalPriceWithoutVATUSD", "rentalPricePerM2WithoutVATUSD"],
          },
          {
            // Editing sinIVA → total (forward) and perM2 (derived).
            // inverseSync: the Total column must redraw immediately.
            editedField: "rentalPriceWithoutVATUSD",
            syncFn: "syncRentalFromWithoutVAT",
            affects: ["rentalPriceUSD", "rentalPricePerM2WithoutVATUSD"],
            clearForeignVisuals: "rentalPriceUSD",
            inverseSync: true,
          },
          {
            // Editing perM2 → sinIVA = perM2 × habitableM2, total = sinIVA × vatRate.
            // inverseSync: both Total and sinIVA columns must redraw.
            editedField: "rentalPricePerM2WithoutVATUSD",
            syncFn: "syncRentalFromPerM2",
            affects: ["rentalPriceUSD", "rentalPriceWithoutVATUSD"],
            clearForeignVisuals: "rentalPriceUSD",
            inverseSync: true,
            requiresHabitableM2: true,
          },
        ],
      } satisfies CascadeGroupConfig,

      /**
       * Sale price group ("venta").
       *
       * Three editable fields form a triangle — editing any one recomputes the
       * other two.  Additionally, two readonly derived fields (installment and
       * income) are always recalculated as a side-effect and appear in `affects`:
       *
       *   totalPriceUSD          (total sale price with VAT)
       *       ↑ syncPriceGroupFromTotal       ↓ syncPriceGroupFromWithoutVAT
       *   priceWithoutVATUSD     (sale price without VAT)
       *       ↑ syncPriceGroupFromPerM2
       *   pricePerM2USD          (sale price per habitable m², no VAT)
       *       ─────── side effects ───────
       *   installmentUSD         (monthly installment — READONLY, always derived)
       *   incomeUSD              (income = installment × 4 — READONLY, always derived)
       *
       * The syncFn wrappers in syncFnRegistry call the price sync + installment
       * + income so a single applyCascadeRule call keeps all 5 fields consistent.
       */
      venta: {
        label: "Precio de Venta",
        fields: [
          "totalPriceUSD",
          "priceWithoutVATUSD",
          "pricePerM2USD",
        ],
        hasCurrencyMirror: true,
        triggers: ["edit", "paste", "create"] as const,
        rules: [
          {
            // Editing the total (with VAT) recomputes sinIVA, perM2, installment, income.
            editedField: "totalPriceUSD",
            syncFn: "syncPriceGroupFromTotal",
            affects: ["priceWithoutVATUSD", "pricePerM2USD", "installmentUSD", "incomeUSD"],
          },
          {
            // Editing sinIVA → total (forward), perM2 (derived), installment, income.
            // inverseSync: Total column must redraw immediately.
            editedField: "priceWithoutVATUSD",
            syncFn: "syncPriceGroupFromWithoutVAT",
            affects: ["totalPriceUSD", "pricePerM2USD", "installmentUSD", "incomeUSD"],
            clearForeignVisuals: "totalPriceUSD",
            inverseSync: true,
          },
          {
            // Editing perM2 → sinIVA = perM2 × habitableM2, total = sinIVA × vatRate,
            // then installment and income cascade from the new sinIVA.
            // inverseSync: both Total and sinIVA columns must redraw.
            editedField: "pricePerM2USD",
            syncFn: "syncPriceGroupFromPerM2",
            affects: ["totalPriceUSD", "priceWithoutVATUSD", "installmentUSD", "incomeUSD"],
            clearForeignVisuals: "totalPriceUSD",
            inverseSync: true,
            requiresHabitableM2: true,
          },
        ],
      } satisfies CascadeGroupConfig,

    },

    // ─────────────────────────────────────────────────────────────────────────
    // dimensionGroups
    // Cascades triggered by changes to physical dimension fields (m², terreno,
    // balcón/terraza) rather than price fields.  Each variant is independent
    // and conditions restrict it to the relevant unit type.
    //
    // Cuatro variantes:
    //   medidas_unitsize      → unitSizeM2; no-lote; recalcula totalSizeM2 +
    //                           habitable + todos los perM2 + absorción
    //   medidas_unitsize_lote → unitSizeM2; lote; solo recalcula totalSizeM2
    //                           (habitable lo controla landM2 en lotes)
    //   medidas_lote          → landM2; lote; recalcula habitable + perM2
    //   medidas_balcony       → balconyTerraceM2; vertical; recalcula habitable + perM2
    // ─────────────────────────────────────────────────────────────────────────
    dimensionGroups: {

      /**
       * parkingSpaces cascade — vertical y horizontal (no lotes).
       *
       * Al cambiar el número de espacios de parqueo recalcula:
       *   • parkingSizeM2   (espacios × 12.5 m² por espacio)
       *   • totalSizeM2     (unitSize + parkingSize)
       */
      parqueo_vertical: {
        label: "Parqueo",
        condition: "isVertical",
        mirrorVaras: true,
        rules: [
          { triggerField: "parkingSpaces", syncFn: "syncMedidasParqueo",
            affects: ["parkingSizeM2", "totalSizeM2"], pendingFields: ["parkingSizeM2", "totalSizeM2"], pendingMirroredFields: [] },
        ],
      } satisfies DimensionCascadeGroup,

      parqueo_horizontal: {
        label: "Parqueo",
        condition: "isHorizontal",
        mirrorVaras: true,
        rules: [
          { triggerField: "parkingSpaces", syncFn: "syncParkingOnly",
            affects: ["parkingSizeM2"], pendingFields: ["parkingSizeM2"], pendingMirroredFields: [] },
        ],
      } satisfies DimensionCascadeGroup,

      /**
       * unitSizeM2 cascade — unidades NO lote (vertical, horizontal, etc.)
       *
       * Cambiar el tamaño de la unidad recalcula:
       *   • totalSizeM2              (unitSize + parkingSize)
       *   • habitableConstructionM2  (unitSize [+ balcón si es vertical])
       *   • los tres grupos de precio por mts² (venta, renta, mantenimiento)
       *   • absorptionPerM2
       */
      medidas_unitsize: {
        label: "Medidas - Tamaño Unidad",
        condition: "isNotLote",
        mirrorVaras: true,
        rules: [
          {
            triggerField: "unitSizeM2",
            syncFn: "syncMedidasWithTotal",
            affects: [
              "totalSizeM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["totalSizeM2", "habitableConstructionM2", "absorptionPerM2"],
            pendingMirroredFields: [
              "pricePerM2USD",
              "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD",
            ],
          },
        ],
      } satisfies DimensionCascadeGroup,

      /**
       * unitSizeM2 cascade — unidades LOTE.
       *
       * En lotes, la construcción habitable depende de landM2, no de unitSizeM2.
       * Solo se actualiza totalSizeM2 (huella = unitSize + parqueo).
       * Los precios por mts² no cambian.
       */
      medidas_unitsize_lote: {
        label: "Medidas - Tamaño Unidad (Lote)",
        condition: "isLote",
        mirrorVaras: true,
        rules: [
          {
            triggerField: "unitSizeM2",
            syncFn: "syncMedidasLoteFromUnitSize",
            affects: [
              "totalSizeM2", "landM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["totalSizeM2", "landM2", "habitableConstructionM2", "absorptionPerM2"],
            pendingMirroredFields: [
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD", "maintenancePricePerM2USD",
            ],
          },
        ],
      } satisfies DimensionCascadeGroup,

      /**
       * landM2 cascade — lote units only.
       *
       * For lote units, unitSize = terreno = total. Changing landM2 recomputes:
       *   • unitSizeM2               (= landM2: unitSize sigue al terreno)
       *   • habitableConstructionM2  (= landM2 for lotes)
       *   • totalSizeM2              (= habitable = landM2; lote no suma parqueo)
       *   • all three perM2 price groups
       *   • absorptionPerM2
       */
      medidas_lote: {
        label: "Medidas - Lote (Terreno)",
        condition: "isLote",
        mirrorVaras: true,
        rules: [
          {
            triggerField: "landM2",
            syncFn: "syncMedidasLoteFromLand",
            affects: [
              "totalSizeM2", "unitSizeM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["totalSizeM2", "unitSizeM2", "habitableConstructionM2", "absorptionPerM2"],
            pendingMirroredFields: [
              "pricePerM2USD",
              "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD",
            ],
          },
        ],
      } satisfies DimensionCascadeGroup,

      /**
       * balconyTerraceM2 cascade — vertical units only.
       *
       * For vertical units, habitable area = unitSize + balcony.  Changing
       * the balcony/terrace size recomputes:
       *   • habitableConstructionM2
       *   • all three perM2 price groups
       *   • absorptionPerM2
       * totalSizeM2 IS recomputed (total = habitable + parqueo).
       * toastTriggerField: the DZ key has no label → show "Construcción Habitable"
       * as the highlighted trigger field in the cascade toast.
       */
      medidas_balcony: {
        label: "Medidas - Balcón/Terraza",
        condition: "isVertical",
        mirrorVaras: true,
        rules: [
          {
            triggerField: "housing.balconyTerraceM2",
            syncFn: "syncMedidasWithTotal",
            affects: [
              "totalSizeM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["totalSizeM2", "habitableConstructionM2", "absorptionPerM2"],
            pendingMirroredFields: [
              "pricePerM2USD",
              "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD",
            ],
          },
          {
            triggerField: "offices.balconyTerraceM2",
            syncFn: "syncMedidasWithTotal",
            affects: [
              "totalSizeM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["totalSizeM2", "habitableConstructionM2", "absorptionPerM2"],
            pendingMirroredFields: [
              "pricePerM2USD",
              "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD",
            ],
          },
        ],
      } satisfies DimensionCascadeGroup,


      /**
       * Industrial "Bodegas" — el tamaño de unidad es la SUMA de sus partes.
       *
       * Kevin: "tamaño total es igual a tamaño bodega + tamaño oficina +
       * tamaño mezzanine". Las tres viven en la zona dinámica de la unidad, así
       * que el disparador es una clave `industrial.*`, igual que el balcón.
       *
       * Editar cualquiera de las tres recalcula:
       *   • unitSizeM2               (la suma)
       *   • habitableConstructionM2  (= unitSize; industrial no es vertical)
       *   • totalSizeM2
       *   • los tres precios por m² y la absorción por m²
       *
       * La suma va a `unitSizeM2`, NO a `totalSizeM2`: ver el porqué en
       * `industrialUnitSizeM2` de lib/units/formulas.ts — `totalSizeM2` viaja a
       * una columna del warehouse que incluye el parqueo.
       */
      medidas_industrial: {
        label: "Medidas - Bodega/Oficina/Mezzanine",
        condition: "isIndustrial",
        mirrorVaras: true,
        rules: (["industrial.warehouseM2", "industrial.officeM2", "industrial.mezzanineM2"] as const).map(
          (campo) => ({
            triggerField: campo,
            syncFn: "syncMedidasIndustrial",
            affects: [
              "unitSizeM2", "totalSizeM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["unitSizeM2", "totalSizeM2", "habitableConstructionM2", "absorptionPerM2"],
            pendingMirroredFields: [
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD", "maintenancePricePerM2USD",
            ],
          })
        ),
      } satisfies DimensionCascadeGroup,

      /**
       * Industrial "Terrenos" — el tamaño de unidad es el terreno.
       *
       * Kevin: "Categoría terrenos: tamaño total es igual a tamaño terreno".
       * Medido: en las 216 unidades de Terrenos el warehouse ya guarda el
       * terreno en la columna del tamaño de unidad, en el 100% de los casos, y
       * bodega/oficina/mezzanine están en cero en las 216.
       *
       * NO se reusa el grupo `medidas_lote`: ése espeja `landM2 ↔ unitSizeM2` en
       * las dos direcciones, y acá el terreno manda y el tamaño de unidad lo
       * sigue. Además la categoría se llama "Terrenos" y no dispara `isLote`,
       * que busca la palabra "lote".
       */
      medidas_terrenos: {
        label: "Medidas - Terreno",
        condition: "isTerrenos",
        mirrorVaras: true,
        rules: [
          {
            triggerField: "landM2",
            syncFn: "syncMedidasIndustrial",
            affects: [
              "unitSizeM2", "totalSizeM2", "habitableConstructionM2",
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD",
              "maintenancePricePerM2USD", "absorptionPerM2",
            ],
            pendingFields: ["unitSizeM2", "totalSizeM2", "habitableConstructionM2", "absorptionPerM2"],
            pendingMirroredFields: [
              "pricePerM2USD", "rentalPricePerM2WithoutVATUSD", "maintenancePricePerM2USD",
            ],
          },
        ],
      } satisfies DimensionCascadeGroup,

    },
  },

} as const

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the cascade group + matching rule for a given USD field key,
 * or null if the field is not managed by any cascade group.
 *
 * Example:
 *   findCascadeRule("maintenancePricePerM2USD")
 *   // → { group: maintenance config, rule: { editedField: "maintenancePricePerM2USD", … } }
 */
export function findCascadeRule(
  targetKey: string
): { group: CascadeGroupConfig; rule: CascadeRule } | null {
  for (const group of Object.values(DATASHEET_CONFIG.cascade.groups) as CascadeGroupConfig[]) {
    const rule = (group.rules as CascadeRule[]).find((r) => r.editedField === targetKey)
    if (rule) return { group, rule }
  }
  return null
}

/**
 * Returns the dimension cascade group + matching rule for a given trigger field key,
 * respecting the group's condition (isVertical / isLote).
 * Returns null when no group matches (wrong field key or condition not met).
 *
 * Example:
 *   findDimensionCascadeRule("landM2", false, true)
 *   // → { group: medidas_lote, rule: { triggerField: "landM2", … } }
 *
 *   findDimensionCascadeRule("landM2", false, false)
 *   // → null  (condition isLote not met)
 */
export function findDimensionCascadeRule(
  triggerField: string,
  isVertical: boolean,
  isLote: boolean,
  /** Tipo de bloque industrial; null cuando no lo es. */
  industrialKind: "bodegas" | "terrenos" | null = null,
): { group: DimensionCascadeGroup; rule: DimensionCascadeRule } | null {
  for (const group of Object.values(DATASHEET_CONFIG.cascade.dimensionGroups) as DimensionCascadeGroup[]) {
    if (group.condition === "isVertical"   && !isVertical) continue
    if (group.condition === "isLote"       && !isLote) continue
    if (group.condition === "isNotLote"    && isLote)  continue
    if (group.condition === "isHorizontal" && (isVertical || isLote)) continue
    if (group.condition === "isIndustrial" && industrialKind !== "bodegas") continue
    if (group.condition === "isTerrenos"   && industrialKind !== "terrenos") continue
    const rule = (group.rules as DimensionCascadeRule[]).find((r) => r.triggerField === triggerField)
    if (rule) return { group, rule }
  }
  return null
}
