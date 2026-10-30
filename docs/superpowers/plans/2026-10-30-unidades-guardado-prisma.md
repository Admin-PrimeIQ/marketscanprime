# Unidades sobre Prisma, parte 2: guardado de la hoja

Fecha: 30 oct 2026. Rama: `jc_migrate_blocks`. Sigue a `2026-10-30-unidades-lectura-prisma.md` (v1.39.0, lectura).

Estado: implementado en la v1.40.0 (sin commit). Resultado y verificación en `CHANGELOG.md`.

## Objetivo

Con `NEXT_PUBLIC_DATA_BACKEND=prisma`, que la hoja de unidades (`/units/list/[id]`) guarde en `msp_app` lo mismo que hoy guarda en Strapi: la edición celda por celda, el botón Guardar y las unidades nuevas. Con `strapi` (producción) no cambia nada.

## Hechos verificados (no supuestos)

- **Tres caminos de escritura en la hoja** (`components/units/datasheet-units-table.tsx`):
  - `onCellEdited`, unidad existente: escribe en el acto con `dataClient.updateUnit` (L4941 zona dinámica, L5309 resto), sin esperar a la anterior; las cascadas quedan como pendientes.
  - Botón Guardar (`handleSave`, L2794): por unidad, en serie, `dataClient.updateUnitBatch` con los pendientes más los campos de fórmula y la zona dinámica completa (`mergeUnitTypePayloadFromZoneIntoUpdates`). Si el código choca, pide otro a `/api/units/generate-code` y reintenta hasta 5 veces. Ante cualquier otro error se detiene.
  - Unidades nuevas: `dataClient.createUnit` con `name = "bloque - número"` y `code = slugify(name)`.
  - Pegar (`applyPaste`) y borrar (`onDelete`) solo dejan pendientes. `detectChangesAndUpdateAPI` no se usa.
- La hoja ignora la respuesta de `updateUnit` y `updateUnitBatch`: el `updatedAt` cargado nunca se refresca.
- `/api/units/generate-code` entra a Strapi como administrador (`STRAPI_USERNAME`/`STRAPI_PASSWORD`): no sirve en el backend nuevo y no debe llamarse.
- En `msp_app` (consulta de solo lectura, 30 oct): ninguna unidad tiene `kind` distinto al `domain` de su bloque; 107.850 unidades de vivienda tienen `kind` nulo; no hay filas hijas sin unidad del tipo correcto ni al revés; 2.268 códigos son `base-N` con `base` existente (regla del UID de Strapi).

## Decisiones del usuario (30 oct)

1. **Adaptadores**: `updateUnit`, `updateUnitBatch` y `createUnit` de `prisma-client.ts` llaman a Server Actions; cada llamada es una transacción (bloquear el bloque, escribir, recalcular contadores, auditar). La hoja casi no cambia y `strapi.ts` no se toca.
2. **Concurrencia**: gana la última escritura campo por campo, como en Strapi. Solo se escriben los campos enviados. `findStaleUnits` queda pendiente hasta que la hoja mande un lote por Guardar.
3. **Código repetido**: el servidor usa el primer sufijo libre (`-1`, `-2`, …) dentro de la transacción y devuelve el código final; la hoja lo muestra.
4. **Tipo de unidad**: el del bloque. Un componente de otro tipo se rechaza. Las unidades sin componente siguen sin él hasta que se escriba un campo de la zona; ahí se crea la fila hija.
5. **Fila que falla**: Guardar sigue deteniéndose en la primera (igual en ambos backends); el punto del checklist de ROADMAP §4.8 queda pendiente.

## Prueba en `msp_app` revertida (30 oct, autorizada por el usuario)

Secuencia del plan con el código existente (`lockBlockForUpdate`, `recalculateBlockCounters`, `writeAudit`, `nextFreeCode`) en una transacción que se revirtió a propósito:

- Vivienda, bloque más grande (4.467 unidades): disponibilidad y recámaras escritas, `updatedAt` movido, contadores cambiados. 1,5 s la escritura + 1,6 s los contadores, desde la PC del usuario.
- Unidad de vivienda sin componente: tomó `kind` del bloque y se creó la fila hija.
- Oficina (153 unidades): unidad nueva con un código ya usado quedó con sufijo `-1`; 2,4 s.
- Industrial (205 unidades): altura escrita; los contadores no cambiaron, así que no hubo auditoría; 0,9 s.
- Dentro de la transacción, 4 filas de `audit_log`. Después del rollback, conteos, valores y `updatedAt` iguales a los de antes. Solo avanzaron las secuencias de id de `unit` y `audit_log`.

Decisión tras la prueba: implementar como está y medir en el staging de Vercel. Si el guardado de una celda pasa de 500 ms allá, los contadores pasan al botón Guardar o a una cola. Los tiempos desde la PC están dominados por la red y no sirven para decidir.

## Pasos

1. **`lib/db/unit-write-mapping.ts`** (puro, sin Prisma ni React):
   - Mapa campo de Strapi → columna de `Unit` (escalares, decimales, enteros, booleanos) y de cada tabla hija (`unit_housing`, `unit_office`, `unit_industrial`), con los enumerados inversos (`"Not Available"` → `Not_Available`, `"Micro 1"` → `Micro_1`, …).
   - `toUnitWriteData(updates)`: última entrada gana por campo; descarta los campos que solo existen en el cliente (`maintenanceWithoutVATUSD` y los precios en otra moneda, la misma regla que `CLIENT_ONLY_FOREIGN_PRICE_KEY_RE` de `strapi.ts`); acepta `unitType` completo o rutas `unitType[0].campo`; relaciones (`topography`, `parkingType`, `unitUsage`, `block`) por `documentId` o id; rechaza campos desconocidos con `UnitError`.
   - Componente ↔ dominio (`unit-types.housing` ↔ `housing`, `.offices` ↔ `office`, `.industrial` ↔ `industrial`) y el error si no coincide con el bloque.
   - Tests en `unit-write-mapping.test.ts`.
2. **`lib/db/unit-schemas.ts`**: Zod de entrada para editar (`documentId` + lista `{ field, value }`, con tope) y crear (objeto con `block`).
3. **`lib/db/units.ts`** (`createUnitRepository(prisma, actor)`):
   - `update(documentId, updates)` y `create(data)`, cada uno en `prisma.$transaction(…, TX_OPTIONS)`: buscar la unidad o el bloque, `lockBlockForUpdate`, leer el antes, resolver relaciones, resolver el código (si el pedido ya es de otra unidad, `nextFreeCode` de `block-code.ts` sobre los códigos `base` y `base-N`), escribir la unidad y crear o actualizar la fila hija con `kind` del bloque, `recalculateBlockCounters`, `writeAudit` (`model: "unit"`).
   - Si dos guardados simultáneos generan el mismo código, reintentar como `withCodeRetry` de `blocks.ts`.
   - Devuelve `toStrapiUnit` de la unidad guardada.
   - No se tocan `block-counters.ts` ni `concurrency.ts`.
4. **`lib/db/unit-actions.ts`**: `updateUnitAction` con `requireRole("update")` y `createUnitAction` con `requireRole("create")`, con `parseInput` y `actionFailure`.
5. **`lib/api/prisma-client.ts`**: `updateUnit` (un campo) y `updateUnitBatch` llaman a `updateUnitAction`; `createUnit` a `createUnitAction`.
6. **Hoja**: después de `updateUnitBatch`, si la unidad devuelta trae otro `code`, mostrarlo. Con Strapi el código devuelto es el enviado, así que no cambia nada. Con Prisma el choque ya no llega como error, así que `fetchNextAvailableUnitCode` no se llama.
7. **Aviso**: quitar el banner de `app/(main)/units/list/[id]/page.tsx` y las claves `unitsSaveNotMigrated*` de `messages/es.json` y `messages/en.json`.
8. **Cierre**: versión 1.40.0, `CHANGELOG.md`, traspaso y bitácora en `docs/migration/N8N_WORKFLOWS.md`, `npm test`, `npx tsc --noEmit` filtrado a los archivos tocados, `graphify update .`.

## Verificación

- Tests puros de mapeo, enumerados, rutas de la zona dinámica, campos descartados y código con sufijo.
- **Sin escrituras en `msp_app` sin autorización aparte del usuario**, ni siquiera en una transacción revertida. Si se autoriza: guardar en una transacción con `ROLLBACK` sobre un bloque de cada tipo y comparar la unidad, la fila hija, los contadores y `audit_log` antes del rollback.
- Prueba manual con `pnpm dev:staging` solo cuando el usuario lo decida (iniciar sesión escribe una fila en `msp_app.session`).

## Pendiente después de este paso

- Revisión de versiones (`findStaleUnits`) cuando la hoja mande un lote por Guardar.
- Que Guardar siga con las demás filas si una falla (ROADMAP §4.8).
- Medir el recálculo de contadores por celda en uso real (cola de BullMQ solo si pasa de 500 ms).
