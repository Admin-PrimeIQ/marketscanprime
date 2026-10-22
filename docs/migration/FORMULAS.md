# Dónde están las fórmulas de Market Scan

Mapa de todos los cálculos del sistema y la ruta de cada uno. Verificado contra el código el 21 oct 2026 (rama `feat/lib-domain`). Las rutas son relativas a la raíz del repo; se citan funciones y no números de línea porque estos cambian.

**Lo primero que hay que saber:** las fórmulas **no están en la base de datos ni en Strapi**. La base MySQL `strapi` solo guarda valores, y Strapi no calcula nada. Las fórmulas de la unidad están en el código del backoffice y corren **en el navegador**, cuando alguien edita la hoja de unidades; a Strapi llega el resultado como un número fijo. Por eso, todo lo que escribe en Strapi sin pasar por la hoja (el pull de n8n desde el warehouse, importaciones, el CLI `sync-database`) deja valores que la hoja no reconoce y pinta de amarillo al abrir el bloque.

---

## 1. Motor de fórmulas de la unidad

**`lib/domain/units/formulas.ts`** — la única copia del motor. La importan la hoja de unidades, la página de unidades y el ETL. No importa React ni alias `@/`, así que corre con `node --test` y `tsx`. Hasta el 19 oct vivía dentro de `components/units/datasheet-units-table.tsx`.

| Qué calcula | Funciones | Regla |
|---|---|---|
| Parqueo | `syncUnitParkingSize`, `PARKING_M2_PER_SPACE` | Espacios × 12.5 m². |
| Construcción habitable | `syncUnitHabitableConstruction` | Lote → terreno (`landM2`); vertical → tamaño + balcón; resto → tamaño. |
| Tamaño total | `syncUnitTotalSize` | Habitable + parqueo solo si el bloque es vertical. |
| Tamaño industrial | `industrialKindOf`, `industrialUnitSizeM2`, `syncIndustrialUnitSize` | Bodegas → bodega + oficina + mezzanine; Terrenos → terreno. Va a `unitSizeM2`, sin parqueo. |
| IVA | `getVatRate`, `vatRatesFor`, `removeVat`, `applyVat`, `sameVatRate` | SV → 1.0 (sin IVA); Interior (S1/S2) + Lote → 1.12; renta → ÷1.12; venta → ×0.916; resto → 1.12. Tasa < 1 multiplica, ≥ 1 divide. Tres tasas por unidad: venta, renta y mantenimiento (este sigue el uso de la unidad). |
| Precio de venta | `syncUnitPriceFromTotal`, `syncPriceFromWithoutVAT`, `syncPriceFromPerM2` | Total ↔ sin IVA ↔ por m² (el por m² divide por la construcción habitable). Una función por dirección. |
| Renta | `syncUnitRentalFromTotal`, `syncRentalFromWithoutVAT`, `syncRentalFromPerM2` | Igual que la venta, con la tasa de renta. |
| Mantenimiento | `maintenanceWithoutVatUsd`, `syncUnitMaintenancePerM2`, `syncMaintenanceFromPerM2`, `syncMaintenanceFromWithoutVAT` | Total ↔ sin IVA ↔ por m², con la tasa del uso. |
| Cuota | `INSTALLMENT_BY_ISO`, `installmentParamsForIso`, `calcInstallmentFromPriceWithoutVAT`, `syncUnitInstallment` | PMT sobre el precio sin IVA. GT (y país desconocido): 7.5 % anual, 20 años, 90 % de préstamo. SV: 8 %, 25 años, 85 %. **No distingue GAM de Interior** (pendiente, ver `README.md` §13.2). |
| Ingreso | `syncUnitIncome` | Cuota × 4. |
| Absorción | `syncUnitAbsorption`, `syncUnitAbsorptionPerM2` | Solo unidades no disponibles: 1 ÷ (días entre fecha de recolección y fecha de inicio ÷ 30). Por m² = absorción × habitable. |
| Recalcular todo | `ensureUnitFormulasSynced`, `RECONCILED_FORMULA_FIELDS` | Corre todas las anteriores en orden y devuelve los campos que cambiaron. Es lo que la hoja usa al abrir un bloque para pintar de amarillo, y lo que usa el reporte del ETL. |
| Redondeo | `roundTo2` | 2 decimales para mostrar. |

`VAT_RATE = 1.092` es solo el valor por defecto de las funciones cuando no reciben tasa; la hoja siempre pasa la tasa del bloque.

## 2. Qué regla aplica a cada bloque

**`lib/domain/units/context.ts`** — traduce el bloque a las banderas que recibe el motor. Sin esto, `formulas.ts` no sabe qué fórmula usar.

| Función | Qué decide |
|---|---|
| `isVerticalCategory` | Vertical si la categoría contiene "vertical" o "vert". |
| `isLoteCategory` | Lote si contiene "lote" o "lot". |
| `blockFormulaContext` | Vertical, lote, tipo industrial (`industrialKindOf`, por nombre exacto), país (`isoCode2` o `code`) y fechas del bloque. |
| `unitVatRates` | Las tres tasas de IVA de una unidad según trimestre, categoría, uso y país. |

## 3. Medidas en varas

**`lib/domain/units/varas.ts`** — `M2_TO_VARAS_SQUARED = 1.431` (área), `M_TO_VARAS = 1.19` (lineal: frente y fondo) y `getVarasFactor(campo)`, que elige el factor por campo. `lib/constants.ts` los reexporta para el resto de la app.

Los factores del warehouse son otros a propósito (1.4342 / 1.1976, ver la sección 7). No unificarlos sin decidir quién manda.

## 4. Región GAM / Interior

**`lib/domain/region.ts`** — `getBlockRegion(quarter)`: T1–T4 → GAM, S1/S2 → Interior. `lib/region.ts` lo reexporta junto con los colores de las insignias. Lo usan el IVA (Interior + Lote) y los filtros.

Relacionado: **`lib/domain/geo.ts`** (`GEO_BY_ISO`) tiene los departamentos y municipios por país. No calcula, pero el país decide IVA y cuota.

## 5. Orquestación en la hoja de unidades

Las fórmulas vienen del motor; aquí se decide **cuándo** se disparan y qué se muestra.

| Archivo | Qué hace |
|---|---|
| `components/units/datasheet-units-table-config.ts` | `DATASHEET_CONFIG.cascade`: qué campo dispara qué recálculo, qué campos se pintan de amarillo y aparecen en el aviso. También qué campos tienen columna en moneda local. Su encabezado documenta los 7 pasos para agregar un grupo de campos nuevo. |
| `components/units/datasheet-units-table.tsx` | Conecta la configuración con las funciones del motor por nombre (`syncFnRegistry`), aplica las cascadas al editar, concilia al abrir el bloque y guarda en lote. |
| `app/(main)/units/list/[id]/page.tsx` | Arma el contexto del bloque (`isVerticalCategory`, `isLoteCategory`) antes de abrir la hoja. |

## 6. Moneda local ↔ USD

Todavía **no** está en `lib/domain/` (el `ROADMAP.md` §4.5 prevé moverla).

| Archivo | Funciones | Qué hace |
|---|---|---|
| `lib/api/strapi.ts` | `localCurrencyUnitsPerOneUsd`, `normalizeProjectCurrenciesFromExchangeProfile` | Tasa de la moneda local por 1 USD, sacada del perfil de tipo de cambio del proyecto. |
| `components/units/datasheet-units-table.tsx` | (internas) | Conversión de ida y vuelta de las columnas en moneda local de la hoja; USD es el pivote. |
| `components/blocks/block-form.tsx` | `usdToCurrency`, `currencyToUsd`, `m2ToVarasSquared`, `varasSquaredToM2` (locales al archivo) | Muestra los promedios del bloque en moneda local y en varas². |
| `app/(main)/blocks/view/[id]/page.tsx` | `m2ToVarasSquared` (local al archivo) | Copia de la conversión a varas² para la vista del bloque. |

## 7. Fuera de este repo

| Dónde | Qué calcula |
|---|---|
| n8n, workflow **Block Edit Queue** (no exportado; webhook `block-counter-update`) | Contadores y promedios del bloque: disponibles, totales, precio, tamaño, precio por m², cuota e ingreso promedio. Lo llama la hoja después de guardar. El formulario del bloque solo los muestra. |
| n8n, workflow **Sync Block Worker** (`yBuM3XVk36DwRgbs`, repo `n8n-manager`) | Mapeo al warehouse en cada push: varas × 1.4342 (área) y × 1.1976 (lineal), precio por vara² ÷ 1.4342, columnas `_qtz` (USD × tasa de compra del perfil), textos recortados a 50/20, "Si"/"No", períodos `2026 - 2T`. Detalle en `README.md` §5. |
| n8n, workflow **Sync Pull Block Worker** (`t2Sqx3pvDRuhBAdF`) | No calcula: copia `cuota` e `ingresos` del warehouse a Strapi tal cual. Es el origen de las ~85 mil cuotas legacy que no siguen la regla de la hoja (`README.md` §12.8). |
| Repo hermano `scripts/sync-database`, archivo `writeback-field-mapper.js` | Las mismas conversiones al warehouse que el push (varas 1.4342 / 1.1976, mantenimiento 1:1 sin IVA). Ver `CLAUDE.md`, «Sibling repo». |
| Sistema anterior (warehouse MySQL) | Calculó los datos legacy con otras reglas en Interior: cuota a 8 % / 10 años e IVA ×0.916 en lotes. Sin confirmar con el negocio (`README.md` §13.2). |

## 8. Copias y reportes

| Ruta | Qué es |
|---|---|
| `etl/src/load/formulas.ts` | No es otra copia: usa el motor de `lib/domain/` para **comparar** lo que trae Strapi contra lo que calcularía la hoja y deja el reporte en `etl/reports/formulas-<fecha>.json` / `.csv`. Desde el 21 oct no cambia lo que se carga en `msp_app`. Se corre con `npm run load:formulas -- --snapshot <nombre>` desde `etl/`. |
| `.migration/` | Copia **congelada** de un motor viejo (junio 2026, antes del IVA por operación y del tamaño industrial). Nadie la importa. No usarla ni replicar cambios ahí. |

## 9. Pruebas

| Archivo | Cubre |
|---|---|
| `lib/domain/units/formulas.test.ts` | El motor: tamaños, IVA, precios, cuota, ingreso, absorción, industrial. |
| `lib/domain/units/context.test.ts` | El contexto del bloque. |
| `etl/src/load/load.test.ts` (suite «reporte de fórmulas») | Que el reporte del ETL use el motor igual que la hoja y no modifique las filas. |

Desde la raíz, `npm test` corre las de `lib/domain/`; desde `etl/`, `npm test` corre las del ETL.

## 10. Antes de cambiar una fórmula

1. Cambiarla en `lib/domain/units/formulas.ts` (o `context.ts`), nunca en la hoja ni en una copia.
2. Agregar o ajustar la prueba en `formulas.test.ts` y correr `npm test` en la raíz y en `etl/`.
3. Medir el efecto sobre los datos con `npm run load:formulas -- --snapshot <nombre>` desde `etl/`.
4. **El cambio afecta la hoja del admin en producción** (`admin.primeiqlatam.com`) en cuanto se fusione y despliegue: es decisión del usuario, aparte del cambio de código.
5. Si cambia algo que el warehouse recibe (tamaños, precios, cuota), revisar también el mapeo de la sección 7.
6. Actualizar `CHANGELOG.md` y la versión de `package.json`.
