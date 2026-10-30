# Unidades sobre Prisma, parte 1: la hoja lee de la base nueva — Plan

**Goal:** Con `NEXT_PUBLIC_DATA_BACKEND=prisma`, `/units/list/[id]` abre las unidades del bloque desde `msp_app`, con la misma forma que Strapi, sin tocar `components/units/datasheet-units-table.tsx`. Guardar sigue «no migrado» y la página lo avisa.

**Architecture:** `prismaDataClient.getUnitsAllPages` → `listUnitsAction` (`requireRole("read")`, Zod) → `createUnitRepository(prisma).list` (`findMany` + `count`) → `toStrapiUnit` (puro). Páginas de 1,000 pedidas en paralelo y juntadas en el cliente.

**Spec:** la conversación del 2026-10-30. Decisiones del usuario:
- Mientras el guardado no esté migrado: aviso fijo en la página; al guardar sale el error «no migrado».
- Páginas de 1,000 en paralelo (límite de 4.5 MB de respuesta de las funciones de Vercel; el bloque más grande tiene 4,467 unidades).
- Se trabaja en `jc_migrate_blocks`.

## Hechos verificados antes de planear

- La hoja pide `getUnitsAllPages({ blockDocumentId, pageSize: 200 })` en `app/(main)/units/list/[id]/page.tsx` (líneas 56 y 206) y en la línea 3390 de la hoja; nunca `search` ni `sort`.
- `blockDocumentId` puede ser `documentId` o id numérico; `whereUnique` resuelve los dos.
- De `unit.block`, la hoja lee `name`, `documentId`/`id` y `project.documentId`/`id`.
- Strapi ordena por `createdAt` ascendente y luego `id`; `created_at` no admite nulos en `msp_app`.
- El cliente de Prisma devuelve el nombre del miembro del enumerado: `Not_Available` y `Micro_1`…`Large_5` se traducen. `OfficeSizeClassification` y `EmployeeCapacityRange` ya coinciden con la hoja.

## Tareas

- [x] `lib/db/unit-mapping.ts`: `toStrapiUnit`, `toUnitType`, `toUnitListResponse`, `UnitError`.
- [x] `lib/db/unit-schemas.ts`: bloque obligatorio, `pageSize` ≤ 1000, estricto.
- [x] `lib/db/units.ts` y `lib/db/unit-actions.ts`.
- [x] `lib/db/unit-mapping.test.ts` (10 pruebas).
- [x] `lib/api/prisma-client.ts`: `getUnitsAllPages` paginado en paralelo.
- [x] Aviso en `app/(main)/units/list/[id]/page.tsx` y textos en `messages/es.json` / `en.json`.
- [x] Verificación de solo lectura con el repositorio real sobre el bloque más grande de cada tipo.
- [ ] Abrir la hoja en `pnpm dev:staging` sin guardar (usuario: el login escribe en `msp_app.session`).

## Parte 2 (sin planear)

`saveUnitChanges` (bloquear el bloque → `findStaleUnits` → escribir → `recalculateBlockCounters`), la regla de sufijo de los códigos y `createUnit`. Pregunta abierta: ¿un conflicto rechaza todo el guardado o solo esas filas?
