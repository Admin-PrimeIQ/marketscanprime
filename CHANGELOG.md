# Changelog

Timeline in reverse chronological order (newest first). Each block groups related changes.

**Contact (consultas):** **Kike Rios** — [kike@devroot.studio](mailto:kike@devroot.studio) · GitHub: [web.lrios@gmail.com](mailto:web.lrios@gmail.com)

---

## Unidades sobre Prisma, parte 2: la hoja guarda en la base nueva (v1.40.0)

_2026-10-30_

Con `NEXT_PUBLIC_DATA_BACKEND=prisma`, la hoja `/units/list/[id]` guarda en `msp_app`: la edición celda por celda (`updateUnit`), el botón Guardar (`updateUnitBatch`) y las unidades nuevas (`createUnit`). **Producción no cambia**: con el backend `strapi` la hoja hace lo mismo que antes y `strapi.ts` no se tocó. Sin migraciones. Plan y decisiones: [docs/superpowers/plans/2026-10-30-unidades-guardado-prisma.md](docs/superpowers/plans/2026-10-30-unidades-guardado-prisma.md).

- **Cada guardado es una transacción** [lib/db/units.ts](lib/db/units.ts):
  - bloquea el bloque (`lockBlockForUpdate`);
  - escribe solo los campos recibidos (gana la última escritura, campo por campo, como en Strapi);
  - crea o actualiza la fila hija del tipo del bloque;
  - recalcula los contadores del bloque (`recalculateBlockCounters`; reemplaza el webhook de n8n "Block Edit Queue");
  - deja la unidad en `audit_log` a nombre del usuario de la sesión.

  Un lote sin campos guardables (solo precios en otra moneda, por ejemplo) no escribe nada.
- **Código de la unidad**: si el pedido ya es de otra unidad, el servidor usa el primer sufijo libre (`-1`, `-2`, …), la regla del UID de Strapi; si dos guardados chocan a la vez, reintenta. Sin `code` en el alta, sale del nombre. Ya no se llama a `/api/units/generate-code`, que entra a Strapi como administrador.
- **Mapeo** [lib/db/unit-write-mapping.ts](lib/db/unit-write-mapping.ts) (puro, con pruebas):
  - nombres de Strapi a columnas de Prisma, y los enumerados de la UI al nombre del miembro (`"Not Available"` → `Not_Available`, `"Micro 1"` → `Micro_1`);
  - la zona dinámica completa o por ruta (`unitType[0].campo`, también la heredada `type[0].campo`);
  - se descartan los campos que solo existen en el cliente (la misma regla que `strapi.ts`);
  - un campo desconocido, un valor inválido o un componente de otro tipo que el del bloque se rechazan con detalle;
  - un `unitType` vacío no borra el componente.
- **Entrada y acciones** [lib/db/unit-schemas.ts](lib/db/unit-schemas.ts), [lib/db/unit-actions.ts](lib/db/unit-actions.ts): `updateUnitAction` exige `update` y `createUnitAction` exige `create`; el alta exige el bloque. Un lote admite hasta 300 cambios.
- **Fachada** [lib/api/prisma-client.ts](lib/api/prisma-client.ts): `updateUnit`, `updateUnitBatch` y `createUnit` llaman a las acciones. Quedan 5 `notMigrated`.
- **Hoja** [components/units/datasheet-units-table.tsx](components/units/datasheet-units-table.tsx): después de Guardar, si el lote traía `code` y el servidor devolvió otro, la celda muestra el que quedó. Con Strapi el código devuelto es el enviado, así que no cambia nada.
- **Aviso**: se quitó el aviso fijo de "guardar no migrado" de [app/(main)/units/list/[id]/page.tsx](app/(main)/units/list/[id]/page.tsx) y sus textos de `messages/es.json` y `messages/en.json`.
- **Verificación**:
  - `npm test` 258/258 (13 pruebas nuevas) y `tsc` sin errores nuevos (38 previos).
  - Dos pruebas en `msp_app` autorizadas por el usuario, cada una dentro de transacciones que se revirtieron siempre. Después del rollback, conteos de unidades, filas hijas y `audit_log`, valores y `updatedAt` quedaron iguales. Con el repositorio real, sobre el bloque con más unidades de cada tipo:
    - vivienda (4,467 unidades): lote con disponibilidad, precio y recámaras, más campos de cliente descartados; dos filas de auditoría (unidad y contadores);
    - código de otra unidad del mismo bloque: quedó con `-1`;
    - unidad de vivienda sin componente: se creó su fila hija;
    - alta en oficinas (153 unidades) con código repetido, estacionamiento y `"Micro 1"`: quedó con `-1` y la respuesta trae todo;
    - industrial (205 unidades) por la ruta `type[0]`;
    - errores con detalle para componente de otro tipo, campo desconocido, catálogo inexistente, unidad inexistente y cambio de bloque.
  - Desde una PC fuera de Railway, cada guardado tardó entre 3.6 y 4.8 s, casi todo de ida y vuelta de red. **Falta medir en el staging de Vercel**: si allá una celda pasa de 500 ms, los contadores pasan al botón Guardar o a una cola.
  - Prisma 7.10 avisa en consola que lanza consultas simultáneas sobre la conexión de una transacción (`DeprecationWarning` de `pg`, por los `include`). Sale de su intérprete, no de este código, y no cambia el resultado.
- **Pendiente**: la revisión de versiones (`findStaleUnits`) cuando la hoja mande un lote por Guardar, y que Guardar siga con las demás filas si una falla (ROADMAP §4.8).

---

## Unidades sobre Prisma, parte 1: la hoja lee de la base nueva (v1.39.0)

_2026-10-30_

Con `NEXT_PUBLIC_DATA_BACKEND=prisma`, la hoja `/units/list/[id]` abre las unidades del bloque desde `msp_app`. Llegan con la misma forma que en Strapi, así que [components/units/datasheet-units-table.tsx](components/units/datasheet-units-table.tsx) no cambia. **Producción no cambia**: con el backend `strapi` nada de esto se usa. Sin migraciones ni escrituras en `msp_app`. Guardar y crear unidades siguen sin migrar (parte 2).

- **Mapeo** [lib/db/unit-mapping.ts](lib/db/unit-mapping.ts) (puro, con pruebas):
  - La fila de `unit` con su tabla hija vuelve como `StrapiUnit`, con la zona dinámica `unitType`:
    - `unit_housing` vuelve como `unit-types.housing`;
    - `unit_office` vuelve como `unit-types.offices`;
    - `unit_industrial` vuelve como `unit-types.industrial`.

    Una unidad sin tipo trae `[]`.
  - Las relaciones también vienen: el bloque con su proyecto y los tres catálogos.
  - `createdAt` y `updatedAt` conservan los milisegundos, que necesita el control de concurrencia de la parte 2.
  - Se traducen dos enumerados, porque el cliente de Prisma devuelve el nombre del miembro y no el valor guardado:
    - `Not_Available` vuelve como `"Not Available"`;
    - `Micro_1`…`Large_5` vuelven como `"Micro 1"`…`"Large 5"`.
  - El componente industrial incluye `qualityClassification`.
- **Entrada** [lib/db/unit-schemas.ts](lib/db/unit-schemas.ts): el bloque es obligatorio, sea `documentId` o id numérico. Un `pageSize` mayor que 1,000 o una clave desconocida se rechazan.
- **Repositorio y acción** [lib/db/units.ts](lib/db/units.ts) y [lib/db/unit-actions.ts](lib/db/unit-actions.ts):
  - `listUnitsAction` exige el permiso `read`.
  - El orden es el de Strapi: `createdAt` ascendente y luego `id`.
  - La búsqueda opcional es por `code`.
- **Fachada** [lib/api/prisma-client.ts](lib/api/prisma-client.ts): `getUnitsAllPages` pide páginas de 1,000 en paralelo, para que cada respuesta quede bajo el límite de 4.5 MB de las funciones de Vercel, y devuelve el sobre de una sola página de Strapi. Quedan 8 `notMigrated`.
- **Aviso** [app/(main)/units/list/[id]/page.tsx](app/(main)/units/list/[id]/page.tsx): solo en modo `prisma`, un aviso fijo dice que guardar unidades todavía no está migrado. El texto está en `messages/es.json` y `messages/en.json`.
- **Verificación**:
  - `npm test` 245/245 (10 pruebas nuevas) y `tsc` sin errores nuevos (38 previos).
  - Lectura con el repositorio real contra `msp_app`, en una sesión de solo lectura (`transaction_read_only = on`), sobre el bloque con más unidades de cada tipo: 4,467 de vivienda, 153 de oficinas y 205 industriales. En los tres coinciden:
    - el total con un `count` directo;
    - los `documentId`, sin repetidos;
    - el orden;
    - el componente según el tipo;
    - el bloque con su proyecto en todas las unidades;
    - las clasificaciones y los rangos de oficina dentro de los valores de la hoja.
  - La página más pesada midió 1.23 MB. Desde una PC fuera de Railway, con una conexión, cada página de 1,000 tardó unos 2 s; el bloque más grande, 10.2 s en serie. En la app las páginas van en paralelo (2 conexiones).

## Bloques sobre Prisma sin choques con los workflows: contadores, tipo de inmueble y `legacyId` (v1.38.1)

_2026-10-30_

Cierra, en el backend `prisma`, los huecos de bloques que chocaban con los reemplazos de los workflows de n8n (`docs/migration/N8N_WORKFLOWS.md`, bitácora del 30 oct). **Producción no cambia**: con el backend `strapi` nada de esto se usa. Sin migraciones ni escrituras en `msp_app`.

- **Contadores** [lib/db/block-mapping.ts](lib/db/block-mapping.ts): `toBlockWriteData` ya no escribe los 10 contadores y promedios (`totalUnits`, `availableUnits`, `totalM2`, `availableM2`, `averageSizeM2`, `assignedParking` y los cuatro promedios en USD). Solo los escribe `recalculateBlockCounters` ([lib/db/block-counters.ts](lib/db/block-counters.ts)) al guardar unidades. Antes, un formulario de bloque abierto antes de un guardado de unidades los regresaba a valores viejos, y clonar un bloque copiaba los del original. [lib/db/block-schemas.ts](lib/db/block-schemas.ts) los sigue aceptando (el formulario los manda y el esquema es estricto). En el formulario ya estaban deshabilitados.
- **Bloqueo** [lib/db/blocks.ts](lib/db/blocks.ts): `update` toma la fila del bloque con `lockBlockForUpdate` antes de leer el `before`, el mismo orden que seguirá `saveUnitChanges`.
- **Tipo de inmueble**: `update` rechaza cambiar `domain` si el bloque tiene unidades (`domainChangeProblem`). El dominio decide las tablas del warehouse del push y la tabla hija de las unidades.
- **`legacyId`**: `create` y `update` rechazan un `legacyId` nuevo o cambiado que ya tenga otro bloque (`legacyIdToCheck`). El push une el bloque con el warehouse por ese valor y salta los repetidos. Sin índice único: dos altas simultáneas con el mismo valor podrían pasar (riesgo bajo, aceptado). Lectura de solo lectura en `msp_app` el 30 oct: 0 valores repetidos entre los 1,688 bloques.
- **Verificación**: `npm test` 235/235 (3 pruebas nuevas), `tsc` sin errores nuevos (38 previos).

## Bloques sobre Prisma: listado, detalle con financiamiento, alta y edición (v1.38.0)

_2026-10-30_

Módulo de bloques de la implementación `prisma` de `dataClient` (`docs/migration/README.md` §14.20). **Producción no cambia**: con el backend `strapi` (el de `admin.primeiqlatam.com`) el formulario sigue pidiendo el código a `/api/blocks/generate-code` como antes, y las Server Actions siguen detrás de la guarda de `lib/db/guard.ts`. Sin migraciones. `getBlocksLite` (de `/sync`, del agente de workflows) sigue sin migrar.

- **Código del bloque** [lib/db/block-code.ts](lib/db/block-code.ts) (puro, con pruebas): en modo `prisma` lo genera el servidor al guardar, sin credenciales de Strapi. Es el slug del nombre (el mismo `slugify` del formulario) y, si ya existe, el primer sufijo libre (`-1`, `-2`, …). Al editar se conserva si el nombre no cambió; si cambió, o si el bloque no tenía código, se genera otro sin contar el propio bloque. Si otro guardado simultáneo toma el mismo código (`P2002`), se reintenta hasta 3 veces.
- **Listado** [lib/db/block-list-mapping.ts](lib/db/block-list-mapping.ts) (puro, con pruebas): búsqueda en nombre, código, fase, torre y sector; filtros de proyectos, región GAM/Interior, país por `documentId` o ISO y tipo de inmueble; el filtro avanzado `project.department` con la semántica de proyectos («distinto de» y «no contiene» incluyen los vacíos), y orden también por `project.name`, `project.department` y `blockCategory.name`. El `filters` libre responde con error. [lib/db/project-filters.ts](lib/db/project-filters.ts) acepta ahora una tabla de campos propia y campos de una relación.
- **Detalle y escritura** [lib/db/block-mapping.ts](lib/db/block-mapping.ts) (puro, con pruebas): el financiamiento vuelve como el componente `financing.financing` (nueve términos y un espacio por banco con fila en `block_bank_rate`, con la tasa vacía como `null`). Al guardar, el componente se reemplaza entero, `null` lo borra junto con los bancos y `undefined` no lo toca. Los contadores y promedios se guardan como llegan (se recalculan al guardar unidades). Al crear son obligatorios `name`, `project` y `domain`.
- **Repositorio** [lib/db/blocks.ts](lib/db/blocks.ts): las referencias se resuelven en paralelo antes de abrir la transacción; dentro van solo el `before` mínimo, el código si hace falta, la escritura (con financiamiento y bancos anidados) y `audit_log`. El detalle se lee después del commit. La fila de auditoría lleva términos y bancos.
- **Entrada** [lib/db/block-schemas.ts](lib/db/block-schemas.ts): `blockRequestSchema` estricto, **sin `code`**. Admite los enumerados de `msp_app`, `numeric(10, 2)`, enteros ≥ 0, fechas `YYYY-MM-DD` reales y los 18 bancos; descarta los `id` del componente que devolvía Strapi.
- **Acciones** [lib/db/block-actions.ts](lib/db/block-actions.ts), conectadas en [lib/api/prisma-client.ts](lib/api/prisma-client.ts) (`getBlocks`, `getBlockById`, `createBlock`, `updateBlock`); quedan 9 `notMigrated`.
- **Formulario** [components/blocks/block-form.tsx](components/blocks/block-form.tsx): en modo `prisma` no llama a `generate-code` ni manda `code`, y el error muestra también los `details` de la base nueva.
- **Verificación**: `npm test` 232/232, `tsc` sin errores nuevos (38 previos). Lectura de humo de solo lectura contra `msp_app`: cada par de filtros opuestos suma los 1,688 bloques; los 11 órdenes de la tabla, detalle con financiamiento, oficina sin financiamiento e id inexistente. Prueba de punta a punta con autorización, dentro de una transacción revertida: crear con 3 bancos, sufijo `-1`, editar sin renombrar, renombrar, borrar financiamiento, referencia inexistente, clonar, `audit_log` y listado, 9/9; `msp_app` quedó igual.

## Proyectos sobre Prisma: detalle, alta, edición y filtros avanzados (v1.37.0)

_2026-10-29_

Módulo de proyectos de la implementación `prisma` de `dataClient` (`docs/migration/README.md` §14.18). **Producción no cambia**: con el backend `strapi` (el de `admin.primeiqlatam.com`) nada de esto se usa, y las Server Actions siguen detrás de la guarda de `lib/db/guard.ts`. Sin migraciones.

- **Filtros avanzados** [lib/db/project-filters.ts](lib/db/project-filters.ts) (puro, con pruebas): los 9 campos y 13 operadores de `components/projects/advanced-filters.tsx`, con lógica AND u OR, conectados en `buildProjectWhere`. Semántica corregida respecto de Strapi (decisión del usuario): «distinto de» y «no contiene» incluyen los vacíos; en amenidades y servicios, «en» = tiene alguna y «no en» = no tiene ninguna; «entre» con OR es una sola condición; las fechas valen el día completo. Un campo, operador o valor inválido responde «Filtros avanzados inválidos» con el detalle por filtro. El filtro de fase y el `filters` libre siguen con error.
- **Detalle y escritura** [lib/db/project-mapping.ts](lib/db/project-mapping.ts) (puro, con pruebas): `getProjectById` devuelve lo que poblaba Strapi (NSE, tipo de seguridad, perfil con sus monedas, copiadas también a `project.currencies`). El cuerpo del formulario pasa a columnas: `undefined` no cambia, `""`/`null` vacían; al crear, `code` y `name` son obligatorios. `code` sigue sin ser único, como en Strapi.
- **Repositorio** [lib/db/projects.ts](lib/db/projects.ts): `get`, `create` y `update` en una transacción. Las referencias que no existen dan «Hay referencias que no existen en la base nueva» con su lista y no se guarda nada. Amenidades y servicios se reemplazan conservando el orden recibido (`sortOrder`). Una fila de `audit_log` por proyecto, con los ids de sus relaciones y las listas de `publicId` de amenidades y servicios.
- **Entrada** [lib/db/project-schemas.ts](lib/db/project-schemas.ts): filtros avanzados tipados y `projectRequestSchema` estricto con los topes de las columnas (latitud ±90, longitud ±180, `numeric(10, 2)`, enteros ≥ 0, hasta 500 amenidades o servicios). [lib/db/input.ts](lib/db/input.ts) nombra los campos no permitidos.
- **Acciones** [lib/db/project-actions.ts](lib/db/project-actions.ts): `getProjectAction` (leer), `createProjectAction` (crear) y `updateProjectAction` (editar), conectadas en [lib/api/prisma-client.ts](lib/api/prisma-client.ts); quedan 13 `notMigrated`.
- **Verificación**: `npm test` 212/212, `tsc` sin errores nuevos (38 previos). Lectura de humo de solo lectura contra `msp_app`: cada par de filtros opuestos suma los 1,137 proyectos; detalle con perfil y monedas. Prueba de punta a punta con autorización, dentro de una transacción revertida: crear, editar, clonar, referencia inexistente, `audit_log` y listado filtrado, 6/6; `msp_app` quedó igual.

## Contadores del bloque sin n8n y bloqueo optimista de unidades (v1.36.0)

_2026-10-29_

Paso 2 de la §7 de [`docs/migration/N8N_WORKFLOWS.md`](docs/migration/N8N_WORKFLOWS.md): reemplazo del workflow de n8n "Block Edit Queue", que recalculaba los contadores del bloque después de cada guardado de la hoja. **Producción no cambia**: nada de esto se llama todavía; lo usará `saveUnitChanges` cuando se migre el módulo de unidades (`ROADMAP.md` §4.8).

- **Cálculo** [lib/domain/blocks/counters.ts](lib/domain/blocks/counters.ts): `computeBlockCounters`, copia exacta del nodo "Compute counters" (decisión del usuario: las reglas raras se conservan). Sus pruebas incluyen el código de n8n tal cual y exigen el mismo resultado en 2,000 bloques al azar.
- **Transacción** [lib/db/block-counters.ts](lib/db/block-counters.ts): `lockBlockForUpdate` (`SELECT … FOR UPDATE` del bloque) y `recalculateBlockCounters(tx, blockId, actor)`, que lee las unidades, calcula y escribe las 10 columnas con su fila en `audit_log` solo si cambiaron. Puente puro con Prisma en [lib/db/block-counter-mapping.ts](lib/db/block-counter-mapping.ts). Sin cola ni Redis: se pasa a BullMQ solo si el recálculo supera 500 ms o cuando exista el servicio de workers (decisión del usuario).
- **Bloqueo optimista** [lib/domain/units/concurrency.ts](lib/domain/units/concurrency.ts): `findStaleUnits` compara, en milisegundos, el `updatedAt` con el que la hoja cargó cada unidad contra el actual; una unidad que otra persona cambió o borró no se sobrescribe (decisión del usuario).
- **Paridad** `npm run counters:parity` en `etl/` ([etl/src/block-counters/](etl/src/block-counters/)), solo lectura sobre `msp_app`: 1,102 de 1,688 bloques iguales; en los nacidos en el backoffice, 199 de 204. Los distintos son bloques que n8n nunca recalculó (casi todos vienen del warehouse). Detalle en la ficha del workflow 6.
- **Verificación**: `npm test` 191/191 (antes 169), `etl` 64/64, `tsc` sin errores en archivos tocados. `recalculateBlockCounters` probado contra `msp_app` con autorización, en una transacción revertida, sobre los bloques 3374 (al día: no escribe) y 3383 (13 → 14 unidades, con su fila en `audit_log`): bloqueo de fila, segunda llamada sin cambios y bloque inexistente, 6/6. `msp_app` quedó igual.

## Ruta del cron del tipo de cambio para Vercel de staging (v1.35.0)

_2026-10-29_

Sigue el paso 1 de la §7 de [`docs/migration/N8N_WORKFLOWS.md`](docs/migration/N8N_WORKFLOWS.md): la tabla `exchange_rate` se actualiza sola desde Banguat. **Producción no cambia**: con el backend `strapi`, fuera de un despliegue con `MSP_STAGING_DEPLOY=true` o sin `CRON_SECRET`, la ruta responde 404. El cron de GitHub que la dispara queda para después: su archivo tiene que estar en `main`, que despliega producción.

- **Ruta** [app/api/cron/exchange-rates/route.ts](app/api/cron/exchange-rates/route.ts), solo `POST` con `Authorization: Bearer <CRON_SECRET>`, `maxDuration` 60 s. Trae los últimos 15 días de Banguat (si una corrida falla, la siguiente rellena el hueco) y responde los conteos y los días que Banguat todavía no publicó. Códigos: 401 secreto inválido, 409 otra carga en curso, 502 Banguat caído o con datos inválidos, 503 base.
- **Servicio** [lib/db/exchange-rate-sync.ts](lib/db/exchange-rate-sync.ts): consulta Banguat fuera de la transacción (20 s, 2 intentos) y hace el upsert con Prisma, con el mismo candado (`pg_try_advisory_xact_lock`) que la carga de `etl/`.
- **Una sola copia** en [lib/domain/exchange-rates/](lib/domain/exchange-rates/): el cliente SOAP ([banguat-client.ts](lib/domain/exchange-rates/banguat-client.ts), antes en `etl/src/exchange-rates/`) y el SQL del upsert ([upsert-sql.ts](lib/domain/exchange-rates/upsert-sql.ts)), que usan `etl/` y la ruta. En [dates.ts](lib/domain/exchange-rates/dates.ts), `recentRange` y `rangeCoverage`. Secreto comparado en tiempo constante en [lib/cron-secret.ts](lib/cron-secret.ts).
- **Variable nueva** `CRON_SECRET` (al menos 32 caracteres), documentada en [.env.staging.example](.env.staging.example). Va en el `.env` local y en el proyecto de Vercel de staging, nunca en producción.
- **Verificación**: `npm test` 169/169 (antes 162), `etl` 57/57, `tsc` sin errores en archivos tocados. `rates:load --dry-run` de 15 días: 0 cambios. Ruta local: 404 sin `CRON_SECRET` configurado; con él, 401 sin secreto o con uno incorrecto, y 200 con el correcto (15 días recibidos, 0 insertados, 0 cambiados, 15 iguales, Banguat en 327 ms).

## Tipo de cambio desde Banguat en la base nueva (v1.34.0)

_2026-10-29_

Paso 1 de la §7 de [`docs/migration/N8N_WORKFLOWS.md`](docs/migration/N8N_WORKFLOWS.md) (workflow 7, Banguat Exchange Rate). **Producción no cambia**: la ruta solo lee la tabla con `NEXT_PUBLIC_DATA_BACKEND=prisma`; con `strapi` sigue leyendo el webhook de n8n. Sin migraciones: `exchange_rate` ya existía en `msp_app`. La tarea periódica (cada 6 h) queda para después.

- **Fuente: el servicio SOAP oficial de Banguat** (`TipoCambio.asmx`, operación `TipoCambioRango`), no la página HTML que lee n8n. Todo el histórico (7,274 días desde el 30/11/2006) llega en una sola respuesta.
- **Reglas puras** en [lib/domain/exchange-rates/](lib/domain/exchange-rates/), con pruebas sobre respuestas reales de Banguat guardadas en `fixtures/`:
  - [dates.ts](lib/domain/exchange-rates/dates.ts): `DD/MM/AAAA` ↔ `AAAA-MM-DD` sin pasar por `new Date(texto)`, que lee `09/10` como 10 de septiembre;
  - [banguat.ts](lib/domain/exchange-rates/banguat.ts): el sobre SOAP y la traducción a filas. Misma regla que n8n: si compra = venta se guarda solo la referencia; si difieren (solo el 30/11/2006 y el 01/12/2006) se guardan compra y venta, sin referencia. Lanza ante un `TotalItems` que no cuadra, fechas repetidas, otra moneda o números inválidos;
  - [compare.ts](lib/domain/exchange-rates/compare.ts): la tendencia de la barra (`comparableRate`, `compareDirection`, `compareSnapshots`), movida desde [lib/exchange-rates.ts](lib/exchange-rates.ts), que la reexporta.
- **Carga y paridad** en [etl/src/exchange-rates/](etl/src/exchange-rates/):
  - `npm run rates:load [-- --from DD/MM/AAAA --to DD/MM/AAAA --dry-run]`: upsert idempotente por `(date, currency)` en una transacción con candado; un día igual no se toca, uno distinto se sobrescribe;
  - `npm run rates:parity`: compara la tabla día por día con el GET público de n8n (la única llamada a n8n permitida), en una transacción de solo lectura. Ese GET pagina con `page`/`size`; los `page[number]`/`page[size]` del manual y de sus propios `links` se ignoran.
- **Ruta** [app/api/exchange-rates/route.ts](app/api/exchange-rates/route.ts): con el backend `prisma` lee los dos días más recientes de la tabla ([lib/db/exchange-rates.ts](lib/db/exchange-rates.ts), forma en [exchange-rate-mapping.ts](lib/db/exchange-rate-mapping.ts)) y entrega el mismo objeto que daba n8n, sin caché en memoria; tabla vacía es 503. La barra lateral no cambia.
- **Verificación**: `npm test` 162/162 (antes 143) y `etl` 4/4 nuevas; `tsc` sin errores en archivos tocados. Carga real autorizada en `msp_app`: 7,274 filas; repetida, 0 cambios. **Paridad contra n8n: 7,274 de 7,274 días iguales.** Ruta probada en `dev:staging`: 200 desde la tabla con sesión, 401 sin ella, y la barra lateral muestra el tipo de cambio.

## Perfiles de tipo de cambio y listado de proyectos en la base nueva (v1.33.0)

_2026-10-28_

Primer módulo después del pulido (§14.16 de `docs/migration/README.md`). **Producción no cambia**: solo actúa con `NEXT_PUBLIC_DATA_BACKEND=prisma`. Sin migraciones: las tablas ya existían en `msp_app`.

- **Perfiles de tipo de cambio** (los 5 métodos de `dataClient`), en [exchange-rate-profiles.ts](lib/db/exchange-rate-profiles.ts) y [exchange-rate-profile-actions.ts](lib/db/exchange-rate-profile-actions.ts):
  - la forma de Strapi se arma en [exchange-rate-profile-mapping.ts](lib/db/exchange-rate-profile-mapping.ts): las monedas (una fila por moneda en `exchange_rate_profile_currency`) vuelven como el objeto `currencies`, y los proyectos vinculados como `projects`;
  - crear y editar reemplazan las monedas y vinculan o desvinculan proyectos, en una sola transacción. `currencies: null` las borra todas. `projects` acepta un arreglo (reemplaza la lista) o `{ connect, disconnect }`;
  - vincular un proyecto que tenía otro perfil lo pasa a este; un proyecto que no existe da error y no se guarda nada;
  - **borrar un perfil con proyectos se impide** ("No se puede eliminar: el perfil está en uso."). Strapi lo dejaba borrar y los proyectos quedaban sin perfil;
  - auditoría: una fila del perfil (con monedas y proyectos) y **una fila `update` de `project` por cada proyecto vinculado o desvinculado**, con `writeAuditMany` nuevo en [audit.ts](lib/db/audit.ts);
  - validación con Zod en [exchange-rate-profile-schemas.ts](lib/db/exchange-rate-profile-schemas.ts): solo las 7 monedas, tasas positivas de hasta 10 dígitos enteros y hasta 5,000 proyectos por escritura.
- **Listado de proyectos** (`getProjects`), que piden el formulario de perfiles y el de bloques, en [projects.ts](lib/db/projects.ts), [project-actions.ts](lib/db/project-actions.ts) y [project-list-mapping.ts](lib/db/project-list-mapping.ts):
  - paginación, orden, búsqueda (nombre, código y desarrolladora) y los filtros rápidos de dominio, región GAM/Interior y país, con las mismas relaciones que poblaba Strapi;
  - los filtros avanzados responden "todavía no están migrados", y el de fase "no está disponible en la base nueva" (los proyectos no tienen ese campo; la UI hoy no lo manda).
- **Orden compartido** en [list-query.ts](lib/db/list-query.ts): los vacíos de `code` y `department` quedan donde los ponía el MySQL de Strapi (primeros en ascendente, últimos en descendente).
- **Verificación**: `npm test` 143/143 (antes 116) y `tsc` con los mismos 38 errores previos, ninguno en archivos tocados. Lectura de humo en sesión de solo lectura contra `msp_app` (2 perfiles, 1,137 proyectos, filtros y orden) y prueba de punta a punta autorizada con 8 casos, sin datos de prueba al final.

## Auditoría de las escrituras en la base nueva (v1.32.0)

_2026-10-28_

Paso 4 de la §14.8 de `docs/migration/README.md`. **Producción no cambia**: solo actúa con `NEXT_PUBLIC_DATA_BACKEND=prisma`.

- **`audit_log` en cada escritura de catálogos** ([catalogs.ts](lib/db/catalogs.ts)):
  - crear, editar y borrar corren en una transacción que también escribe la fila de auditoría; si una de las dos falla, no se guarda ninguna;
  - la fila lleva el usuario de la sesión (`requireRole` en [catalog-actions.ts](lib/db/catalog-actions.ts)), la tabla, el `id`, el `publicId` (`documentId` de Strapi) y las filas antes y después en JSON;
  - editar o borrar un elemento que no existe da "El elemento del catálogo no existe.", como antes.
- **Reglas puras** en [audit-entry.ts](lib/db/audit-entry.ts), con pruebas; la escritura, en [audit.ts](lib/db/audit.ts).
- **Migración `20261028170000_audit_log_public_id`** ([prisma/migrations](prisma/migrations/20261028170000_audit_log_public_id/migration.sql)): agrega la columna `public_id` (admite `NULL`) y un índice `(entity, public_id)`. No toca filas.
- **Con `msp_app` todavía como copia de Strapi** (decisión 17): la próxima carga del ETL borra lo creado en la app, pero las filas de `audit_log` quedan.
- **Verificación**: `npm test` 116/116 y `tsc` con los mismos 38 errores previos, ninguno en archivos tocados. Migración aplicada en `msp_app` y prueba de punta a punta 15/15 (crear, editar y borrar, más los casos de error), sin datos de prueba al final.

## Límite de intentos de login, validación con Zod y errores genéricos en la base nueva (v1.31.0)

_2026-10-28_

Paso 3 de la §14.8 de `docs/migration/README.md` ("endurecer"). **Producción no cambia**: todo esto solo actúa con `NEXT_PUBLIC_DATA_BACKEND=prisma`.

- **Límite de intentos de login**:
  - Reglas puras en [lib/auth/login-throttle.ts](lib/auth/login-throttle.ts), con pruebas; contadores en [lib/db/login-throttle.ts](lib/db/login-throttle.ts); uso en [auth-actions.ts](lib/db/auth-actions.ts).
  - Por cuenta: 5 intentos en 15 minutos y luego 15 minutos de bloqueo. Por IP: 20 en 15 minutos.
  - Cada intento suma antes de comprobar la clave, en un solo `INSERT … ON CONFLICT`, así que una ráfaga en paralelo no pasa del límite. Pasado el límite se rechaza sin llegar a bcrypt, exista o no la cuenta.
  - El login correcto borra el contador de la cuenta y le resta uno al de la IP.
  - No usa el `rateLimit` de Better Auth: ese solo aplica a su ruta HTTP, que no está montada.
- **Migración `20261028153000_login_attempt`** ([prisma/migrations](prisma/migrations/20261028153000_login_attempt/migration.sql)): solo agrega la tabla `login_attempt`. El ETL no la carga ni la borra.
- **Validación con Zod** de la entrada de las Server Actions:
  - Login ([auth-schemas.ts](lib/db/auth-schemas.ts)): identificador de hasta 255 caracteres y clave de hasta 256. Una entrada inválida da el mismo mensaje que una clave mala.
  - Catálogos ([catalog-schemas.ts](lib/db/catalog-schemas.ts), con ayuda de [input.ts](lib/db/input.ts)):
    - endpoint, id, parámetros de lista y cuerpo, con tipos y largos;
    - las claves desconocidas se descartan;
    - `null` vacía el campo (antes se habría guardado el texto `"null"`);
    - los errores llegan como detalles en español (`name: máximo 255 caracteres`).
- **`/api/exchange-rates`** ([route.ts](app/api/exchange-rates/route.ts)): responde 401 solo sin sesión. Si la base no responde, responde 503 y deja el detalle en el log; antes daba un falso 401.
- **Incluye el commit `25871a7` (28 oct)**, que salió sin entrada:
  - Errores genéricos hacia el navegador: `PublicError` en [action-result.ts](lib/db/action-result.ts). El detalle de Prisma o `pg` queda en el log del servidor, y `P2037`/`53300` dan "La base de datos está ocupada…".
  - Pool que cierra las conexiones inactivas a los 5 s, con `attachDatabasePool` de `@vercel/functions` 3.10.4 ([client.ts](lib/db/client.ts), [connection.ts](lib/db/connection.ts)).
- **Verificación**: `npm test` 110/110 y `tsc` con los mismos 38 errores previos, ninguno en archivos nuevos.

## Actualización de seguridad: Next.js 16.4.3, React 19.2.9 y Node 24.22.1 (v1.30.1)

_2026-10-27_

Sube Next.js de 16.0.10 a 16.4.3 y React / React DOM de 19.2.0 a 19.2.9, con versiones exactas, y fija Node en 24.22.1. Es un salto menor dentro de la 16: no cambia código de la app. **Producción no se despliega desde aquí**: este cambio queda en la rama `feat/data-facade` hasta que alguien lo suba y lo publique.

- **Next.js 16.4.3** ([package.json](package.json), [pnpm-lock.yaml](pnpm-lock.yaml)): corrige todos los avisos publicados desde enero que afectaban a 16.0.10. Los que más importan aquí:
  - [GHSA-mq59](https://github.com/vercel/next.js/security/advisories/GHSA-mq59-m269-xvcx): `Origin: null` saltaba la protección CSRF de Server Actions. Las acciones de catálogo y de login escriben con la cookie de sesión de Better Auth.
  - [GHSA-p3m5](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) (denegación de servicio en Server Actions), [GHSA-673q](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) y [GHSA-2464](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), corregidos en 16.4.1.
  - Los saltos de `proxy.ts` de mayo y las denegaciones de servicio de Server Components; lista completa en los [avisos de Next.js](https://github.com/vercel/next.js/security/advisories).
  - `sharp` pasa de 0.34.5 a 0.35.5 como dependencia opcional de Next.
- **React 19.2.9**: corrige [GHSA-xqc2](https://github.com/facebook/react/security/advisories/GHSA-xqc2-xf4c-x3h3) y GHSA-h3gv (14 oct) en `react-server-dom-*`, que Next trae incluido.
- **Node 24.22.1** ([.nvmrc](.nvmrc)) y `engines.node` de `>=20` a `24.x` ([package.json](package.json)): incluye los parches de seguridad de Node de junio, julio y [octubre](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) (Brotli, undici, TLS). En Vercel, `engines` fija la versión mayor de Node por encima del ajuste del proyecto.
- **Verificación**, igual que antes de actualizar:
  - `npm test` 96/96;
  - `tsc` con los mismos 38 errores previos y ninguno nuevo;
  - build aislado (`__NEXT_PROCESSED_ENV=true`, backend `prisma`, sin `.env`) en verde, con las mismas 42 rutas y `Proxy (Middleware)` que con 16.0.10.
  - `pnpm audit --prod` ya no muestra avisos de `next` ni `react`. Quedan 36 en otras dependencias, sin tocar en este cambio: `maplibre-gl` (crítico), `@n8n/chat`, `zod`, `luckysheet` y algunas transitivas de `@prisma/client` y `@glideapps/glide-data-grid`.
  - Falta probarlo en el navegador con `pnpm dev:staging`: login, catálogos, logout y la hoja de unidades.
- Documentación: [CLAUDE.md](CLAUDE.md) y la tabla de dependencias de [docs/migration/README.md](docs/migration/README.md).

## Sesión de servidor y permisos por rol en la base nueva (v1.30.0)

_2026-10-22_

Puntos 1 y 2 de `docs/migration/README_Backend_full.md`, con **Better Auth** en vez de Auth.js (la decisión 12 de `docs/migration/README.md` se reemplazó; detalle en su §14.9). **Producción no cambia**: todo esto solo actúa con `NEXT_PUBLIC_DATA_BACKEND=prisma`.

- **Sesión en la base**: [lib/auth/server.ts](lib/auth/server.ts) configura Better Auth 1.7.12 (`better-auth` en [package.json](package.json)). Usa el adaptador de Prisma, ids numéricos, bcrypt de costo 10 con los hashes de Strapi, login con correo o usuario (plugin `username`), sin registro, y no crea sesión para usuarios bloqueados. La sesión vive en `msp_app.session` con cookie httpOnly de 7 días renovados con el uso. Variables nuevas: `BETTER_AUTH_SECRET` (obligatoria) y `BETTER_AUTH_URL`, en [.env.staging.example](.env.staging.example). No se montó la ruta `/api/auth/[...all]`: login, logout y sesión pasan por Server Actions.
- **Migración `20261022183000_better_auth`** ([prisma/migrations](prisma/migrations/20261022183000_better_auth/migration.sql)), que solo agrega:
  - las columnas `name` e `image` en `user`;
  - las tablas `session`, `account` y `verification`.

  Ya está aplicada en `msp_app` con `npm run app:deploy` desde `etl/`.
- **Login, logout y `getMe`** ([auth-actions.ts](lib/db/auth-actions.ts), [user-mapping.ts](lib/db/user-mapping.ts)) usan esa sesión. [prisma-client.ts](lib/api/prisma-client.ts) ya no guarda el usuario en `localStorage` (`msp_dev_session`). El login dejó de leer la cuenta de desarrollo `DEV_LOGIN_*`: esas variables siguen en el `.env` solo para `npm run app:local-user`.
- **Permisos**: la matriz de roles de Strapi está en [permissions.ts](lib/auth/permissions.ts), con pruebas.
  - `authenticated` lee.
  - `operator` lee, crea y edita.
  - `supervisor` tiene CRUD completo.
  - `administrator` tiene CRUD y administra usuarios.
  - `super_administrator` puede todo.

  [session.ts](lib/db/session.ts) agrega `requireUser()` / `requireRole()`, y cada acción de [catalog-actions.ts](lib/db/catalog-actions.ts) pide su permiso.
- **Rutas**: `middleware.ts` (no hacía nada) se reemplazó por [proxy.ts](proxy.ts), el nombre de Next 16, que manda a `/login` sin cookie de sesión. [exchange-rates](app/api/exchange-rates/route.ts) valida la sesión nueva. Las 6 rutas de `app/api/sync/` responden 503 ([prisma-unavailable.ts](lib/sync/prisma-unavailable.ts)).
- **ETL**: tabla `account` en [specs.ts](etl/src/load/specs.ts), con una cuenta `credential` por usuario local con clave ([users.ts](etl/src/load/transform/users.ts)).
  - Better Auth exige que `account_id` sea el id del usuario: el ETL lo resuelve como una `ref` guardada en texto (`textRef`, en [sql.ts](etl/src/load/sql.ts) y [verify.ts](etl/src/load/verify.ts)).
  - Las cuentas de usuarios `app-…` quedan fuera del espejo por su padre (`mirroredScope`, en [write.ts](etl/src/load/write.ts) y `verify.ts`).
  - [local-user.ts](etl/src/app/local-user.ts) también escribe la cuenta de `app-engteam`.
  - Carga real con el snapshot `20261022-172111-full`: solo cambió `account`, verificación 26/26, 19/19 y 1/1.
- **Verificación**: `npm test` 96/96 en la raíz y 53/53 en el ETL. `tsc` sin errores en los archivos tocados.
  - Prueba de punta a punta contra `msp_app` con dos usuarios temporales `app-qa-…`, borrados al terminar: 13/13.
  - Falta probarlo en el navegador con `pnpm dev:staging`, una vez que el `.env` tenga `BETTER_AUTH_SECRET`.

## Los catálogos ya pueden leerse y escribirse en la base nueva (v1.29.0)

_2026-10-21_

Primer módulo de la implementación `prisma` de la fachada (fase 5 de `docs/migration/ROADMAP.md`). **Producción no cambia**: sigue en `NEXT_PUBLIC_DATA_BACKEND=strapi`, y todo lo nuevo se niega a responder fuera de `next dev`.

- **Prisma en la app** (decisión 10 del README de migración): `@prisma/client`, `@prisma/adapter-pg` y `pg` en la raíz, con `prisma` como dependencia de desarrollo, en las mismas versiones que `etl/`. [prisma/schema.prisma](prisma/schema.prisma) tiene un segundo generador, `app`, que escribe en `lib/db/generated/` (ignorado por git). Lo regeneran `postinstall` y `pnpm db:generate`. `npm run app:generate` en `etl/` ahora genera solo su propio cliente.
- **`lib/db/`**: [connection.ts](lib/db/connection.ts) se conecta a `msp_app` solo con `DATABASE_URL_APP`, sin respaldo a otras URL, con la raíz TLS de Railway y un pool de 2. [client.ts](lib/db/client.ts) es el cliente `server-only`. [catalogs.ts](lib/db/catalogs.ts) es un repositorio genérico de los 12 catálogos, y [catalog-mapping.ts](lib/db/catalog-mapping.ts) tiene sus reglas puras: el modelo de cada endpoint, paginación, `sort` y búsqueda como en Strapi, `documentId` = `publicId`, validación y errores de Prisma traducidos ("está en uso", "debe ser único"). Las Server Actions están en [catalog-actions.ts](lib/db/catalog-actions.ts).
- **Fachada**: [lib/api/prisma-client.ts](lib/api/prisma-client.ts) implementa `DataClient`. Los 5 métodos de catálogo son reales, y los demás fallan con "todavía no está migrado". `resolveDataBackend` pasó a [lib/api/data-backend.ts](lib/api/data-backend.ts).
- **Login sobre la base nueva, sin sesión de servidor todavía** (llega con Auth.js): [guard.ts](lib/db/guard.ts) hace que las Server Actions solo respondan en `next dev` con el backend `prisma`. El login de ese backend ([auth-actions.ts](lib/db/auth-actions.ts)) valida correo o usuario y clave contra la tabla `user` de `msp_app`, con los hashes bcrypt copiados de Strapi (decisión 13), y nunca llama a Strapi. Responde con el mismo mensaje de Strapi si falla. El usuario y su rol real quedan en `localStorage`. Dependencia nueva: `bcryptjs`.
- **`pnpm dev:staging`** ([scripts/dev-staging.mjs](scripts/dev-staging.mjs)): corre la app en modo `prisma` con las variables de `.env.staging.local` (plantilla en [.env.staging.example](.env.staging.example)), sin cargar el `.env` de producción y con sus claves vaciadas. El lanzador se niega a arrancar si `.env.staging.local` trae credenciales de Strapi.
- **Un solo `.env` y despliegue de staging en Vercel** (22 oct): el `.env` local es ahora el del backend `prisma`; las variables de Strapi y n8n de producción quedan comentadas como referencia y las del ETL siguen activas. [dev-staging.mjs](scripts/dev-staging.mjs) usa `.env.staging.local` si existe, si no el `.env`, y también rechaza `SYNC_API_URL` y `STRAPI_URL`. Más tarde ese mismo día (decisión 15 de `docs/migration/README.md`, commit `0cb1d02`) se borraron del `.env` las variables de Strapi y n8n que habían quedado comentadas, y el lanzador pasó a leer solo el `.env` de la raíz: ya no busca `.env.staging.local`, y no se crean `.env.local`, `.env.staging.local` ni `.env` por carpeta ([.env.staging.example](.env.staging.example) lo explica). La [guarda](lib/db/guard.ts) acepta un despliegue de staging marcado con `MSP_STAGING_DEPLOY=true` (y lo rechaza si trae credenciales de Strapi o de sync); [prisma-client.ts](lib/api/prisma-client.ts) ya no repite en el navegador la comprobación de `next dev`, que bloqueaba el login en Vercel: decide solo la guarda del servidor. [connection.ts](lib/db/connection.ts) acepta `DATABASE_CA_APP` como PEM, con `\n` literales o en base64 (`normalizeCaPem`, con prueba), porque pegar un PEM de varias líneas en Vercel suele romperlo. Los errores de la guarda y del certificado dicen qué ven y en qué entorno de Vercel corren. Además, `etl/certs/dbo-stage-ca.pem` (raíz pública de Railway) se versiona como excepción en [.gitignore](.gitignore) y [next.config.mjs](next.config.mjs) lo incluye en cada función (`outputFileTracingIncludes`), así que en Vercel `DATABASE_CA_APP` ya no es obligatoria. Con el backend `prisma`, las URLs de n8n de producción que el código usaba por defecto (Copilot en [constants.ts](lib/copilot/constants.ts), sesiones de chat en [primeiq-chat-session-api.ts](lib/copilot/primeiq-chat-session-api.ts) y contadores de bloque en la [hoja](components/units/datasheet-units-table.tsx)) quedan vacías (`productionN8nDefault` en [data-backend.ts](lib/api/data-backend.ts)). Variables de Vercel en `docs/migration/README.md` §14.2.1. `npm test` 91/91.
- **Cuenta `engteam@primeiqlatam.com` en la base nueva** (22 oct): fila `app-engteam` en `msp_app.user`, rol `super_administrator`, con el mismo hash bcrypt de `DEV_LOGIN_PASSWORD_HASH`. Entra igual en local y en Vercel, sin variables de login. El prefijo `app-` del `public_id` marca las cuentas propias de la app nueva: el ETL ([specs.ts](etl/src/load/specs.ts), `localPrefix` / `mirroredRows`) ya no las renombra ni las borra en la carga espejo ([write.ts](etl/src/load/write.ts)), ni las cuenta como sobrantes en la verificación ([verify.ts](etl/src/load/verify.ts)). Script nuevo `npm run app:local-user` en `etl/` ([local-user.ts](etl/src/app/local-user.ts)), que simula salvo con `--apply`. Hallazgo de paso: `next dev` expande los `$` de un hash bcrypt en el `.env` aunque esté entre comillas simples, así que `DEV_LOGIN_PASSWORD_HASH` solo funciona con `pnpm dev:staging` (que lee el `.env` sin expandir) o en Vercel. ETL `npm test` 50/50.
- **pnpm fijado en 10.34.7** (`packageManager` en [package.json](package.json)): corepack usaba su versión por defecto (9.15.4), que no entiende el `allowBuilds` de [pnpm-workspace.yaml](pnpm-workspace.yaml) y abortaba cualquier comando (`pnpm run build`, incluso `pnpm --version`) con "packages field missing or empty". El lockfile sigue en el formato 9.0.
- **Hallazgo**: en los datos, `isoCode` de los países es alfa-3 (`GTM`) e `isoCode2` alfa-2 (`GT`). El formulario de catálogos valida al revés, así que hoy no deja guardar un país existente, tampoco con Strapi. El servidor nuevo no impone largo. Queda anotado en `ROADMAP.md` §4.4 para decidir con negocio.
- **Verificación**: lectura de los 12 catálogos contra `msp_app` en una sesión de solo lectura (totales, `documentId` de 24 caracteres, ida y vuelta por id, búsqueda). `npm test` 86/86, con 12 pruebas nuevas en `lib/db/`. `tsc --noEmit` da 38 errores, los mismos de antes, ninguno en archivos nuevos. `next build` sin `.env` compila. Falta recorrer en el navegador la lista "debe seguir funcionando" de catálogos.

## La UI pide los datos a una fachada, no a Strapi; fuera el código muerto (v1.28.2)

_2026-10-21_

Primer paso de la fase 5 de la migración (`docs/migration/ROADMAP.md`): que la UI no sepa de qué backend vienen los datos.

- **Fachada de datos**: [lib/api/client.ts](lib/api/client.ts) exporta `dataClient` y el tipo `DataClient`, con los 31 métodos que la UI usa hoy. Detrás está el mismo `strapiClient` de siempre: no cambia ninguna petición, ni el proxy `/api/strapi`, ni la forma de los datos. `NEXT_PUBLIC_DATA_BACKEND` elige la implementación (`strapi` por defecto; `prisma` todavía no existe y falla con un mensaje claro).
- **33 archivos** (páginas, formularios, la hoja de unidades, `AuthContext` y `lib/auth/auth.ts`) importan `dataClient` en vez de `strapiClient`. Fuera de `lib/api/` ya nadie importa el cliente de Strapi. Los tipos `Strapi*` y los helpers puros (`getRelationDocumentId`, `localCurrencyUnitsPerOneUsd`, `CATALOG_TYPES`, …) se siguen importando de [lib/api/strapi.ts](lib/api/strapi.ts); pasan a tipos de dominio en un paso aparte.
- **Código muerto borrado** (nada lo importaba ni lo enlazaba desde una pantalla viva): las tablas alternativas de unidades `editable-units-table`, `luckysheet-units-table`, `univer-units-table` y `units-table`; `projects-table-old` y `projects-table-advanced`; y las rutas huérfanas `projects/[id]`, `projects/[id]/edit` y `blocks/[id]/edit`. Esas tres URL ahora dan 404; las vivas son `projects/view|edit/[documentId]` y `blocks/view|edit/[id]`.
- **Dependencias sin quitar todavía**: `@univerjs/*` y `luckysheet` ya no las usa ningún archivo, pero siguen en `package.json` para no cambiar el lockfile en este paso.
- **Verificación**: la fachada compila en modo estricto junto con `strapi.ts`; los 31 métodos llamados coinciden uno a uno con el contrato; `npm test` 74/74. El `tsc` de toda la app no se pudo correr porque la raíz no tiene `node_modules`.

## Las reglas de unidad viven en `lib/domain/` y el ETL las usa para medir diferencias (v1.28.1)

_2026-10-19_

- **Una sola copia del motor de fórmulas**: se movieron a [lib/domain/](lib/domain/) el motor ([formulas.ts](lib/domain/units/formulas.ts)), las varas ([varas.ts](lib/domain/units/varas.ts)), la región GAM / Interior ([region.ts](lib/domain/region.ts)) y los departamentos ([geo.ts](lib/domain/geo.ts)). [lib/constants.ts](lib/constants.ts) y [lib/region.ts](lib/region.ts) los reexportan, así que sus importadores no cambian.
- **Contexto de bloque compartido**: [context.ts](lib/domain/units/context.ts) decide vertical / lote / tipo industrial por la categoría y las tasas de IVA por uso. Antes esa lógica estaba copiada tres veces (la [página de unidades](app/(main)/units/list/[id]/page.tsx) y dos lugares de la [hoja](components/units/datasheet-units-table.tsx)); ahora las tres llaman a las mismas funciones. Con pruebas.
- **Renombre**: el antiguo `lib/domain.ts` (etiquetas y colores de dominio para la UI) pasó a [lib/block-domain-ui.ts](lib/block-domain-ui.ts) para no chocar con la carpeta. Se actualizaron sus 6 importadores.
- **No cambia ningún número**: las fórmulas son las mismas, solo cambian de lugar.
- **`npm test` en la raíz corre en Windows**: las comillas simples del script llegaban literales a `cmd` y no encontraba ninguna prueba. Ahora corre 74, incluidas las de `lib/domain/units/`.
- **ETL (`etl/`)**: comando nuevo `npm run load:formulas -- --snapshot <nombre>`, que recalcula cada unidad con este mismo motor y reporta qué campos guardados no coinciden. No toca ninguna base. Con el snapshot del 16 oct, el 52 % de las unidades difiere en al menos un campo; el detalle está en `docs/migration/README.md` §12.8. La carga a `msp_app` (staging) guarda el valor recalculado cuando difiere, y el original queda en el reporte. Strapi no cambia, así que la hoja del admin sigue marcando esas celdas en amarillo. Además, la carga se frena si el espejo fuera a borrar en masa, y rechaza snapshots incompletos.
- **Documentación**: [CLAUDE.md](CLAUDE.md) ya no describe a `.migration/` como contrato de paridad (está congelado desde el 2026-09-11).
- **Sin verificar**: el `tsc` de la app no se pudo correr porque la raíz no tiene `node_modules`. `lib/domain/` sí compila en modo estricto.

## El bloque tiene uso: Venta o Renta (v1.28.0)

_2026-10-14_

- **Campo nuevo `blockUsage`** en el bloque, editable en el [formulario](components/blocks/block-form.tsx) y visible en la [vista](app/(main)/blocks/view/[id]/page.tsx). Es la columna `uso` del universo en MySQL, con los mismos dos valores.
- **No cambia ninguna fórmula**: el IVA y la tabla de unidades siguen usando el uso de cada unidad.
- **Dependencia de datos**: requiere el campo `blockUsage` en Strapi. El llenado inicial lo hace el workflow manual `[Prime IQ] Sync Import Block Usage` de n8n, y el sync lo lee y lo escribe de vuelta a MySQL solo cuando tiene dato.

## Nombres sin «Fase Fase» ni el bloque repetido en las unidades (v1.27.3)

El equipo reportó bloques llamados «… - Fase Fase 3» y unidades que heredaban el error y se iban alargando con cada migración.

- **Etiqueta duplicada**: el nombre del bloque se arma como `Proyecto - Fase X - Sector Y - Torre Z`, anteponiendo la etiqueta a ciegas. Cuando el campo ya la traía (el warehouse guarda `fase` como "3" o como "Fase 3") salía «Fase Fase 3». Pasaba en dos lugares con la misma regla: el formulario de bloques del admin y el sync con el warehouse. Ahora los dos usan `withLabel()`, que pone la etiqueta una sola vez y limpia repeticiones. Sólo cuenta palabras enteras: «Torreón» no se toca. En el admin vive en [lib/block-name.ts](lib/block-name.ts), con tests, y lo usa [block-form.tsx](components/blocks/block-form.tsx).
- **Nombres de unidad que crecían**: el pull armaba el nombre de la unidad a partir de la columna `unidad` de MySQL, pero el writeback escribe ahí el nombre completo de la unidad, así que cada vuelta le sumaba otra copia del bloque (hasta 7 tramos). Ahora sale de `num_unidad` / `no_unidad`, la misma regla que usa el datasheet (`bloque - unitNumber`). Cambio en `scripts/sync-database` y republicados en n8n "Sync Pull Block Worker" y "Sync Resolve Targets".
- **Strapi no interviene**: no tiene hooks sobre el nombre.
- **Dependencia de datos**: esto corrige el proceso, no los datos. Al 2026-09-30 hay 23 bloques con «Fase Fase», 1 con «Torre Torre», 6 con «Sector Sector», ~42.000 unidades con el bloque repetido y ~67.000 con «Fase Fase» heredado. Se corrigen con un proceso aparte, empezando por el bloque de prueba `jso0rnmjko12n5jsmy2binin`.

## El mantenimiento llega a los tableros igual que en el admin (v1.27.2)

El equipo reportó que el mantenimiento por m² se veía bien en el admin pero salía alterado en los tableros, sobre todo al promediar. Era real: el sync con el warehouse le quitaba el IVA dos veces a lo capturado acá.

- **La causa**: el admin calcula el mantenimiento por m² ya sin IVA ([lib/units/formulas.ts](lib/units/formulas.ts)). El sync (`scripts/sync-database`) trataba ese valor como si lo trajera: dividía entre 1.12 al escribir en MySQL y multiplicaba por 1.12 al traerlo. Para lo importado de MySQL el ida y vuelta se cancelaba, pero todo valor capturado o editado en el admin llegaba al warehouse 10.7% abajo (total, por m² y `_v2`), y los promedios de los tableros mezclaban las dos escalas.
- **La decisión**: Strapi es la fuente de verdad, acordado con el equipo. El sync copia `maintenanceTotalPriceM2USD` y `maintenancePricePerM2USD` 1:1 en las dos direcciones y en los tres dominios (vivienda, oficinas, industrial). Se eliminó `vat.js` de `sync-database` y se republicaron en n8n "Sync Block Worker", "Sync Pull Block Worker" y "Sync Resolve Targets".
- **En el admin no cambia ningún número**: esta versión sólo actualiza documentación (el comentario de `syncUnitMaintenancePerM2`, que describía el contrato viejo, y el CLAUDE.md).
- **Dependencia de datos**: MySQL se corrige con un push completo de los bloques. Hasta que termine **no se debe hacer ningún pull**, porque traería a Strapi el valor bajo que hoy tiene MySQL. Después de ese push, el mantenimiento de los tableros sube 12% respecto a lo que mostraban (todas las unidades con mantenimiento), igualando al admin.
- Cierra el pendiente "el mantenimiento total podría venir 12% inflado" de la v1.25.0: con Strapi como verdad, la pregunta de qué escala usaba el warehouse deja de importar.

## Bloques del copiloto que salían como texto crudo (v1.27.1)

Algunas respuestas del copiloto mostraban `note{title="…"}` o `buttons` como texto en pantalla, en lugar de dibujar la nota o los botones.

- **La causa**: el asistente escribió esos bloques sin sus delimitadores. Cuando eso pasa, lo que el investigador ve es la instrucción cruda — peor que no haber usado el bloque.
- **El arreglo**: ahora la vista acepta también esa forma incompleta y dibuja el bloque igual, conservando el título de la nota y la etiqueta, el enlace y el estilo de cada botón. La forma correcta sigue funcionando exactamente igual.
- Se le reforzó además la instrucción al asistente, con el ejemplo de la respuesta que falló.
- Una palabra suelta que no venga seguida de contenido sigue siendo texto: no se inventan bloques donde no los hay.

## Archivar varias conversaciones del copiloto a la vez (v1.27.0)

La barra lateral del copiloto gana un modo de selección: marcar varias conversaciones y archivarlas —o desarchivarlas— de una sola vez.

- **Botón "Seleccionar"** junto al buscador. Enciende el modo; hasta entonces la barra se ve y se usa igual que siempre, porque la acción normal de una conversación es abrirla y unas casillas permanentes le cobrarían ese ruido a quien sólo quiere leer.
- **Un botón por acción aplicable.** Si lo marcado son conversaciones activas aparece *Archivar (N)*; si son archivadas, *Desarchivar (N)*; si se mezclan, aparecen los dos con su cuenta. Nadie tiene que adivinar qué hará el botón con lo que marcó.
- **"Seleccionar todo" sólo marca lo que se está viendo.** Si la sección de archivadas está plegada no las toca, y si hay una búsqueda activa se limita a los resultados.
- **Si se archiva la conversación abierta, se sale de ella.** Quedarse dentro de algo que acaba de desaparecer de la lista se lee como un error.
- El menú de cada conversación sigue igual cuando no se está seleccionando, con su confirmación para archivar de a una.

Por dentro, el lote se escribe de una sola vez en lugar de una por conversación: con veinte marcadas la diferencia se nota.

Recordatorio de cómo funciona archivar: es una vista de la barra lateral, no un estado del servidor. No borra nada —el historial sigue completo— y se restablece al cerrar la pestaña.

## El Tour Guiado queda desactivado (v1.26.0)

El recorrido interactivo que arrancaba solo al entrar a Proyectos, Bloques, Unidades o Catálogos ya no aparece, y tampoco se puede lanzar desde Ajustes.

- **No se borró nada.** El recorrido, sus pasos y la tarjeta de Ajustes siguen en su lugar. La tarjeta se deja visible a propósito, atenuada y con la nota "Tour desactivado hasta nuevo aviso": si desapareciera, quien la conoce la buscaría creyendo que se rompió.
- **Se apaga desde un solo lugar.** Una constante, `TOUR_ENABLED` en `lib/tour-utils.ts`. Reactivarlo es cambiar ese `false` por `true` y nada más.
- **La guarda vive en el hook, no en las cinco páginas** que usan el tour. Si mañana se agrega una sexta, queda apagada sola; repetir el `if` en cada página garantizaba que alguna se olvidara. El botón de Ajustes queda deshabilitado y además guardado por dentro: un botón deshabilitado es una decisión de la vista, y la de negocio vive en la constante.
- **Lo que cada quien ya había completado no se tocó.** Si el tour vuelve a encenderse, no se lo repite a quien ya lo hizo.

Efecto lateral: los mensajes de depuración del tour, que se escribían en la consola del navegador en cada carga de página, dejaron de ejecutarse.

## Las medidas de Industrial se calculan solas, y cada operación usa su IVA (v1.25.0)

Reglas de negocio que Kevin pasó para Industrial y Oficinas, verificadas contra la base de datos antes de construirlas y probadas en pantalla unidad por unidad.

- **En Industrial el tamaño de la unidad se suma.** Es bodega + oficina + mezzanine, o el terreno cuando el bloque es de categoría Terrenos. Hasta ahora nadie sumaba: el valor venía precalculado y editar el tamaño de bodega no recalculaba nada. El investigador cambiaba una pieza y la fila se quedaba quieta.
- **Y arrastra todo lo que depende de ella**: construcción habitable, tamaño total, los tres precios por m² y la absorción por m². Editar una oficina de 100 m² en una bodega de 1.054 mueve el precio por m² de 590 a 538.87.
- **El tamaño de unidad pasa a ser de sólo lectura en Industrial.** Es un valor derivado; dejarlo editable invitaba a escribir un número que la siguiente edición de cualquiera de sus partes borraría.
- **El IVA lo manda la operación, no el uso declarado de la unidad.** La venta usa su tasa y la renta la suya, las dos a la vez si hace falta. Antes había una sola tasa por unidad y se aplicaba a las tres cadenas por igual: una unidad de uso Renta con precio de venta sacaba su venta con la tasa de renta.
- **El parqueo no entra en ningún precio por m².** Confirmado con el negocio, y ahora fijado con pruebas en los tres tipos de inmueble — es el tipo de regla que se respeta en dos y se olvida en el tercero.

### Lo que cambió por debajo

- **El motor de fórmulas salió del componente de la tabla**, que pasaba de ocho mil líneas, y ahora se puede ejecutar. Las reglas de precios y medidas son lo que más caro sale equivocar y estaban en el único lugar del proyecto donde no se podían probar. Son 56 casos que corren en dos segundos.
- **Los números de cada caso salen de la base**, no están inventados, y el comentario dice de dónde. Cada regla se probó también al revés: al romperla a propósito, las pruebas caen.
- **La copia del motor en `.migration` quedó congelada** con una nota. Era de junio, nadie la importa y ningún CI la corre, así que iba a divergir en silencio.

### Lo que queda abierto, a propósito

- **El mantenimiento total podría venir 12% inflado, y se espera el reporte del equipo.** Todo indica que el dato del warehouse ya trae el IVA y que el proceso que lo trae se lo vuelve a agregar: la conclusión sale del patrón de nombres del warehouse, donde toda columna `_total` lleva IVA y toda `_m2` es neta. Pero es una deducción indirecta, no confirmada con quien captura el dato, y la corrección movería ese número en más de doscientas mil filas. Un investigador que compare contra el recibo de un condominio lo resuelve en un minuto. Por eso se pidió en Ajustes → Changelog que avisen, y la corrección espera ese caso concreto. El precio por m² no está afectado.

## No se podía guardar un bloque de vivienda con financiamiento (v1.24.1)

Guardar un bloque de vivienda que tuviera financiamiento devolvía un error y no guardaba nada, aunque no se hubiera tocado ningún campo. Afectaba a los 482 bloques cargados en la v1.24.0.

- **La causa.** Strapi devuelve cada componente con un identificador interno —el del financiamiento y el de cada banco— y **rechaza ese mismo identificador al recibirlo**. El formulario devolvía tal cual lo que había leído.
- **El arreglo.** Al guardar, el financiamiento se manda sin esos identificadores, igual que ya se hacía con las relaciones del bloque. No se pierde nada: el componente se reemplaza entero en cada guardado, así que los identificadores de la versión anterior no significan nada para la nueva.
- **Comprobado contra el bloque que falló**, escribiéndole exactamente lo que ya tenía: los cuatro bancos, sus tasas, el enganche y el plazo quedaron idénticos, y el resto del bloque también.

## Financiamiento por bloque (v1.24.0)

Los bloques de Vivienda ya guardan sus condiciones de financiamiento: enganche, plazos y la tasa de cada banco con el que se trabaja. Se editan en el formulario del bloque y se leen en su vista.

- **Sólo Vivienda.** El bloque es una sola colección para los tres tipos de inmueble, pero la tabla del warehouse que respalda esto existe únicamente para Vivienda. En Oficinas e Industrial la sección no aparece.
- **Los bancos se eligen, no se recorren.** Hay dieciocho espacios con nombre y sólo se dibujan los que el bloque usa. De los bloques con financiamiento, 121 trabajan con exactamente un banco: mostrarle dieciocho filas a quien va a llenar una es hacerle recorrer diecisiete vacías.
- **Un banco ausente y un banco con tasa cero dicen cosas distintas.** Quitar un banco borra el espacio; dejarlo con la tasa en blanco lo conserva. El envío al warehouse escribe cero justamente para los ausentes.
- **Los plazos son tres, y son de grupo.** El warehouse no guarda un plazo por banco: guarda uno para FHA, uno para el financiamiento propio y uno que comparten los dieciséis bancos comerciales. Cada banco muestra cuál le toca, pero se edita una sola vez arriba.
- **Pull y Push de Vivienda ya lo incluyen.** Traer un bloque trae su financiamiento; enviarlo lo devuelve a las veintisiete columnas del warehouse.
- **La información ya está cargada: 482 bloques.** Entró con una carga única que escribe ese campo y ninguno más, en vez de con un Pull. Un Pull de Vivienda habría traído el bloque entero y borrado las unidades que el warehouse no tiene, que hoy son 144.053 — se habría llevado por delante el trabajo de las últimas semanas. Se comprobó campo por campo contra la base y las 214.633 unidades quedaron intactas.

### Lo que queda abierto, a propósito

- **53 bloques quedaron sin financiamiento.** Su fila existe en el warehouse pero está entera en cero, y un bloque sin financiamiento es distinto de uno con el financiamiento en cero. Si resulta que esos ceros significan "al contado", es volver a correr la carga sobre esos 53.
- **Cuatro nombres de banco están sin confirmar** —BI, CHN, GTC y Banco INV—, y 151 bloques usan al menos uno. Cambiarles el nombre visible no mueve datos.
- **Una fila trae el enganche fraccionado ilegible** (dice "24", que no es sí ni no). Entró vacía en vez de adivinada.

## Los tres dominios cerrados, en las dos direcciones (v1.23.0)

Cierre del trabajo de migraciones. Vivienda, Oficinas e Industrial corren Pull y Push.

- **Industrial cierra el grupo.** 119 bloques y 2.210 unidades de 67 proyectos, traídos y verificados contra MySQL campo por campo — las 2.205 unidades reales sin una sola diferencia, incluidos los diez campos propios de la unidad industrial.
- **El push se verificó con una huella por bloque**, no con el resumen de la corrida: se hashea cada fila de universo con todas sus unidades antes y después. El bloque enviado cambió y los otros 118 dieron el hash idéntico.
- **Lo que Strapi no puede representar se conserva.** El sufijo de ubicación del nombre de proyecto, el uso del bloque, si es compartido o exclusivo, el identificador de lote, la hora de recolección y la fecha de creación de cada unidad.
- **Las diez columnas derivadas se recalculan**, con reglas medidas contra los datos reales una por una: las áreas se multiplican por el factor de varas y los precios por área se dividen. La absorción parecía un precio y era un área.

### Lo que queda abierto, a propósito

- **766 unidades de Oficinas con valores viejos**, 99 de ellas con el precio por m² anterior a la corrección de la fórmula. Un Pull completo de Oficinas las pone al día.
- **El contador "Escritos: N/N" no incluye unidades.** Cuenta catálogos, proyectos y bloques, así que una corrida puede salir en verde habiendo perdido unidades. Hasta que se arregle, la comprobación buena es contra la base de datos.
- **El changelog de Ajustes se saltó de la v1.6.0 a la v1.21.0.** Catorce versiones que no se anunciaron a quien usa la aplicación.

## Industrial también se puede enviar al warehouse (v1.22.0)

Hasta ahora Industrial salía apagado en Push: se podía traer, no devolver. Ya corre en las dos direcciones, igual que Vivienda y Oficinas.

- **El mapeo de escritura es propio de Industrial**, no una adaptación del de Vivienda. Sus tablas tienen 27 columnas que ninguna otra comparte, y varias de las que comparte se llaman distinto.
- **Diez columnas que el warehouse guarda y Strapi no** —seis en varas² y cuatro en quetzales— se recalculan en cada envío en vez de borrarse. Las reglas se midieron contra los datos reales, una por una: las áreas se multiplican por el factor de varas y los precios por área se dividen. La absorción parecía un precio y resultó ser un área; tratarla como precio habría escrito 2.205 filas a menos de la mitad.
- **Lo que Strapi no puede representar se conserva.** El nombre de proyecto del warehouse lleva a veces un código de ubicación ("Parque Industrial E50") que el admin no modela, así que el envío no lo toca. Lo mismo con el uso del bloque y si es compartido o exclusivo.
- **La hora y la fecha de creación de cada unidad se preservan.** En Vivienda y Oficinas el envío las sobreescribe; en Industrial no. La hora varía entre unidades de un mismo bloque, así que no se puede reconstruir — y perderla sería perder dato real.

### Una corrida en verde ya no basta

El contador "Escritos: N/N" de una corrida cuenta catálogos, proyectos y bloques, **no unidades**. Para este envío se construyó una verificación aparte que toma una huella de cada bloque del warehouse antes de la corrida y la compara después: los bloques que se enviaron tienen que haber cambiado y **todos los demás tienen que estar idénticos**. Un conteo de filas no detecta que se borró una unidad y se insertó otra; la huella sí.

## Industrial abierto para operadores (v1.21.0)

Cierre del trabajo de Industrial. No trae funcionalidad nueva sobre v1.20.1: marca que el dominio quedó certificado y lo anuncia dentro de la app, en el changelog de Ajustes.

- **119 bloques y 2.210 unidades de 67 proyectos**, traídos del warehouse y verificados contra MySQL: las 2.205 unidades reales coinciden **campo por campo**, incluidos los diez campos propios de la unidad industrial y sus tres relaciones de catálogo. Cero faltantes, cero sobrantes, cero identificadores duplicados.
- **Industrial corre Pull, no Push.** No es una casilla pendiente de habilitar: falta el mapeo que devuelve sus columnas al warehouse, que es un trabajo distinto del que se hizo. Al elegir Industrial, la tarjeta de Push queda apagada con su razón.
- **El changelog de Ajustes vuelve a moverse.** Estaba detenido en v1.6.0 desde el 8 de junio mientras la aplicación avanzaba hasta v1.20.1, así que catorce versiones de trabajo no llegaban a quien las usa. Esta entrada aparece ahí; las anteriores siguen sin estar.

### Lo que queda abierto, a propósito

- **766 unidades de Oficinas traen valores viejos** — entre ellas 99 con el precio por m² anterior a la corrección de la fórmula. Son bloques que no se han vuelto a traer desde que se corrigieron los mapeos; un Pull completo de Oficinas los pone al día.
- **El contador "Escritos: N/N" de una corrida no incluye unidades.** Cuenta catálogos, proyectos y bloques. Una corrida puede salir en verde habiendo perdido unidades, así que por ahora la comprobación buena es contra la base de datos, no contra el resumen.

## Los bloques industriales dejan de rotularse "Desconocido" (v1.20.1)

En el grid de unidades, un bloque industrial mostraba *"Bodegas, Desconocido"*. Son dos cosas distintas: la categoría real del warehouse y una etiqueta que dice qué hace el motor de fórmulas con ella. La categoría estaba bien; la etiqueta mentía.

- **El cálculo nunca estuvo mal.** El motor tiene tres comportamientos: un *lote* mide por terreno, un *vertical* suma balcón a la construcción habitable y parqueo al total, y *horizontal* es todo lo demás. "Bodegas" y "Terrenos" no son ni lote ni vertical, así que ya se calculaban como horizontales — sin sumar balcón ni parqueo.
- **La etiqueta usaba una prueba distinta a la del motor.** El motor pregunta "¿dice vertical?" y si no, calcula horizontal. El badge preguntaba además "¿dice horizontal?" y si no, mostraba "Desconocido". Los 119 bloques industriales caían justo en esa grieta: bien calculados, mal rotulados.
- **Ahora la etiqueta sale de los mismos valores que las fórmulas**, así que no pueden volver a discrepar. "Desconocido" desaparece porque no es un comportamiento: cuando el motor no reconoce vertical ni lote, calcula horizontal, no se detiene.
- Nada más cambia. Vivienda Vertical, Vivienda Horizontal, Lotes y Oficinas Verticales siguen rotulándose igual que antes.

**Sobre el IVA**, que motivó el reporte: no depende de vertical ni de horizontal. Depende del país, de la combinación Interior + Lote, y del uso de la unidad. Los 119 bloques industriales son GAM, así que su IVA lo decide sólo el uso — Venta 0.916, Renta 1.12 — y eso ya venía funcionando.

## Industrial se filtra en todas las listas, y los proyectos ganan el filtro por tipo (v1.20.0)

Los chips de tipo de inmueble sólo ofrecían Vivienda y Oficinas. Industrial estaba excluido a propósito —no había bloques cargados y un chip que siempre devuelve vacío es ruido—, pero ya hay 119 bloques y 2210 unidades industriales.

- **Industrial aparece en bloques y en unidades**, con su color propio.
- **Proyectos gana el filtro por tipo**, que no tenía ninguno. Va primero, antes de región y país, porque acota más: los tres tipos no comparten ni tablas ni columnas. Filtra 917 de vivienda, 67 industriales y 18 de oficinas.
- **En Tipo de cambio, el filtro va donde sirve**: el selector de proyectos del formulario, que lista más de mil. La tabla de perfiles se quedó sin chips a propósito — son dos filas, y filtrarlas no ayuda a nadie.
- **Un proyecto no tiene tipo propio; lo tienen sus bloques.** Se filtra por esa relación en vez de agregar el campo al proyecto: evita un backfill de más de mil filas y, sobre todo, evita dos verdades sobre el mismo hecho. Un proyecto aparece si alguno de sus bloques es de ese tipo; en la práctica son de uno solo.
- **La lista de tipos vive en un solo lugar.** Antes estaba escrita a mano en tres pantallas, y el color y la etiqueta salían de condicionales que sólo podían expresar DOS valores — agregar el tercero no era sumarlo a una lista, era reescribir cada chip. Ahora un tipo nuevo se agrega una vez.

## Industrial ya se puede traer del warehouse (v1.19.0)

Industrial salía apagado en el diálogo de corridas: sus tablas existían en el warehouse y nadie había traducido sus columnas. Ya están traducidas para el sentido de bajada, así que **Industrial se elige y corre Pull**.

- **Pull sí, Push no, y el diálogo lo dice.** Al elegir Industrial, la tarjeta de Push queda apagada con su razón. No es una restricción temporal disfrazada: falta el mapeo que devuelve sus columnas al warehouse, que es un trabajo distinto del que se acaba de hacer. Oficinas pasó exactamente por esta etapa.
- **El selector ya lista los proyectos industriales**: 66 proyectos sobre 118 bloques. Vivienda (883) y Oficinas (18) siguen listando lo mismo que antes — se verificó contra el warehouse, porque las tres consultas comparten el mismo endpoint y una columna mal pedida ahí no vacía un campo, tumba la consulta entera.
- **El portero valida el par acción×tipo, no el tipo suelto.** Es lo único que separa las dos direcciones: un push de Industrial se rechaza con un 400 que dice qué sí corre, en vez de entrar y morir dentro del worker.
- **Industrial no trae ni sector ni torre.** Sus tablas no tienen esas columnas, así que el agrupador del selector las trata como ausentes en vez de mostrarlas vacías.

## El selector de push deja de ofrecer bloques de otro tipo de inmueble (v1.18.1)

Al filtrar por "demo" en un push de Oficinas aparecían también DEMO ABC y DEMO XYZ, que son de Vivienda. Se podían marcar, pero la corrida después procesaba sólo los de oficina, sin decir por qué.

- **El desajuste era entre el selector y el backend.** La resolución de objetivos ya acota por tipo de inmueble; el selector no. Ofrecía opciones que la corrida iba a ignorar en silencio, que es peor que no ofrecerlas.
- **Ahora la consulta del selector lleva el tipo**, igual que la del backend. Un push de Oficinas ve 26 bloques; uno de Vivienda, 1.376.
- Sólo afectaba al selector de push: el de pull ya filtraba, porque lee del warehouse y ahí las tablas de cada tipo están separadas de origen.

## Oficinas ya se puede enviar a la base de datos, no sólo traer (v1.18.0)

Hasta ahora el diálogo de corridas ofrecía Oficinas sólo para Pull, y Push salía apagado. La razón era real: el mapeo de escritura armaba nombres de columna de vivienda sin mirar el tipo, así que un push de oficinas habría leído sus tablas y les habría escrito encima columnas equivocadas.

- **Oficinas ya corre en las dos direcciones.** El worker pide su mapeo a un registro por tipo de inmueble en vez de llamar al de vivienda, y el SQL apunta a las tablas de ese tipo.
- **El portero sigue validando el par acción×tipo**, aunque hoy vivienda y oficinas corran las dos igual. No es simetría de adorno: oficinas pasó semanas con Pull y sin Push, e Industrial va a repetir la misma secuencia.
- **Industrial sigue rechazado en ambas direcciones**, con su razón: sus tablas existen en el warehouse y nadie tradujo sus columnas.
- El chip apagado de una acción no disponible ahora dice *"No disponible"* en vez de *"Sólo vivienda"* — la copia vieja habría quedado falsa en cuanto Industrial entrara por una sola dirección.

## Las columnas del grid de unidades se estiran hasta ver el nombre completo (v1.17.1)

Un nombre como `Zona AX - Fase Ampliación - Torre Corporate Collection - Corporate Collection Nivel 7 - Oficina 701 C071` se cortaba a la mitad, y por más que se arrastrara el borde la columna no crecía más.

- **El tope no era nuestro, era de la librería.** `glide-data-grid` aplica `maxColumnWidth = 500` por defecto y el grid sólo declaraba el mínimo, así que el límite regía en silencio: el arrastre no fallaba, ya estaba en el máximo.
- **Ahora el tope es 2000px.** No ilimitado a propósito: el nombre más largo del warehouse tiene 129 caracteres —unos 950px—, así que hay más del doble de aire para el peor caso real, y un tope alto pero existente evita que un arrastre accidental deje una columna de veinte mil píxeles con un scroll horizontal del que cuesta volver.
- **También sube el auto-ajuste.** Al hacer doble clic en el borde, la columna ahora se ajusta al contenido completo en vez de cortarse en 500.

## El tipo de inmueble se elige, se ve y se filtra (v1.17.0)

Vivienda y oficinas no comparten tablas ni columnas en el warehouse, así que el tipo de un bloque no es una etiqueta: decide contra qué datos se sincroniza. Hasta ahora vivía sólo en la base y el admin no lo mostraba ni lo dejaba elegir.

- **En el formulario de bloques** (crear, editar y clonar son el mismo componente) aparece primero en Clasificación, obligatorio y **sin preselección**. Strapi tiene `default: "housing"`, así que el riesgo nunca fue que quedara vacío: era que una oficina naciera como vivienda sin que nadie lo notara. Arrancar en blanco obliga a decidirlo. Al clonar sí se arrastra: el clon es del mismo tipo que su origen.
- **Parqueos para venta** se agregó a Estacionamiento, activo sólo con Oficinas. `parqueos_para_venta` existe únicamente en `office_universe`; vivienda e industrial no tienen esa columna. Al cambiar de tipo el valor se limpia en vez de quedar escondido: un dato invisible que igual se guarda es peor que uno ausente.
- **En el listado de bloques** hay columna con insignia y chips de filtro rápido, antes de región y país porque acotan más que ninguno. El filtro es del lado del servidor, no un recorte de la página visible.
- **En unidades** la insignia va en el selector de bloque y en la cabecera del listado, no como columna: todas las unidades de esa pantalla son de un mismo bloque, así que una columna repetiría el mismo valor en cada fila. El filtro rápido también está en el selector.
- Los colores viven en un módulo compartido. Ya se dibujaban en cuatro lugares y tres copias del mapa divergen en la primera corrección de tono; entonces el chip que se aprieta y la insignia que resulta dejan de parecer lo mismo.

## El diálogo de nueva corrida es una cascada (v1.17.0)

Se elegía el alcance antes de saber sobre qué universo, y el texto explicaba el warehouse en vez de la decisión.

- **Tres pasos numerados, nada preseleccionado:** tipo de inmueble → acción → alcance. Cada paso decide las opciones del siguiente y se apaga hasta que el anterior está resuelto.
- **Las acciones dependen del tipo.** Con Oficinas, Push sale apagado con su razón: el mapper de escritura arma columnas de vivienda sin mirar el dominio, así que un push de oficinas leería sus tablas y les escribiría encima nombres de columna equivocados. La ruta del API valida el mismo par, de modo que la puerta no depende de que el control siga apagado.
- **Menos texto.** Se fue el párrafo que explicaba las tablas del warehouse y quedó una línea por opción. El aviso de que el pull borra unidades se quedó, corto: es la única advertencia de pérdida de datos de la pantalla.
- **Dos textos que eran falsos** se arreglaron: el aviso de "todos los bloques" decía "~1,330 bloques… se crearán en MySQL", que es lenguaje de push y un número de vivienda — mentira en un pull de oficinas.
- **El diálogo hace scroll.** Nunca lo había hecho: lo que no cabía en `max-h-[90vh]` se salía y se encimaba con el pie. Las listas del selector se acotaron a seis filas.

## Los nombres de bloque aparecen aunque el pull los esté creando (v1.16.1)

En un pull que crea bloques nuevos, la tabla se quedaba con el código crudo —`DEMOQA1`— aunque al terminar el bloque existiera con su nombre.

- **La causa es cuándo se resuelven.** El ledger inserta sus filas al arrancar, pero en un pull los bloques **se crean durante la corrida**, en la fase 3, minutos después. El primer intento de resolver nombres no encontraba nada, y el guardia que evita volver a pedir un id ya intentado —puesto para que un bloque borrado de Strapi no se pidiera en cada refresco— los marcaba como intentados para siempre.
- **Ahora sólo se marcan cuando la corrida terminó.** Mientras sigue viva se reintenta en cada refresco, que es exactamente cuando las entidades están apareciendo. Con la corrida cerrada, el guardia original vuelve a valer.
- Por eso una corrida sobre bloques que ya existían sí mostraba los nombres, y una que los recreaba no: no dependía del pull sino de si el bloque existía cuando se abrió la página.


## El dominio viaja y queda guardado en la corrida (v1.16.0)

El selector de tipo de inmueble dejó de ser decorativo: el dominio ahora viaja con la petición, se valida en el servidor y **queda escrito en el ledger**. Es lo que va a decidir qué tablas consulta cada corrida.

- **Se valida en la ruta además de en n8n**, por lo mismo que la operación: dejar pasar uno desconocido no fallaría ruidosamente —n8n lo rechazaría— pero el operador vería un 502 opaco en vez de saber qué eligió mal.
- **El selector de un pull manda el dominio**, y entra en su llave de caché junto a la operación. Elegir sobre un universo y disparar sobre otro ofrecería bloques que la corrida no va a encontrar.
- **El detalle de la corrida muestra el dominio.** Hoy siempre dice Vivienda, y aun así se muestra: una corrida vieja tiene que poder decir qué tocó el día que existan dos.
- **Sólo `housing` corre.** Los otros dos son valores legales de la columna —para no migrarla cuando exista el segundo mapper— y se rechazan en la entrada, igual que `purge` con la operación.

**Del lado del pipeline** (`sync-database` y `n8n-manager`): `sync_runs` gana la columna `domain` con default `housing`, que backfillea las corridas viejas correctamente. `Validate body` la valida, `Prepare run` la reenvía y el `INSERT` la escribe; las lecturas la sacan por `to_jsonb` para que el historial no se vea vacío si los workflows se publican antes de correr el SQL. El selector de universo resuelve su **tabla** desde un mapa cerrado —el nombre de una tabla no puede ser un bind, así que va interpolado y nunca puede venir del request—.

**Corregido de paso:** `GET sql/projects` era el único endpoint **sin rama de error**, así que un rechazo de su validación caía al nodo MySQL sin tabla y n8n devolvía `500 Workflow execution failed`. Y `Respond 409` dejó de mentir: cuando el INSERT falla por algo que no es el candado, responde 500 con el error real de la base en vez de "A writeback is already running" con `runId: undefined` — el mensaje que ya costó un diagnóstico.


## El diálogo dice de qué universo se está hablando (v1.15.0)

Nada en `/sync` decía que lo que se ve son **únicamente viviendas**. El warehouse tiene tres dominios y los tres tienen datos: `housing` (1.358 bloques), `industrial` (116) y `office` (23). Sólo el primero está migrado, y esa limitación estaba escondida.

- **Selector de tipo de inmueble** arriba del de operación, porque enmarca todavía más: decide de qué universo se habla, no qué se le hace.
- **Oficinas e Industrial se muestran apagados, con su razón**, en vez de omitirse. Existen en el warehouse y alguien va a preguntar por ellos; una pantalla que los esconde deja creer que no hay nada más.
- **No son una bandera pendiente de encender.** Cada dominio tiene sus propias tablas —industrial y office **no tienen `services`**— y su propia zona dinámica en Strapi: `unit-types.industrial` son 9 campos y `unit-types.offices` 11, contra los 2 de vivienda. `buildUnitStrapiPayload` escribe `unit-types.housing` fijo, y `housing_` está cableado en 37 lugares de los cinco workflows. Prender uno es un mapper propio y una rama por dominio en el worker, no un parámetro.
- **El selector es visual y no viaja al backend**, a propósito: hoy no habría quién lo leyera, y una plomería que siempre manda el mismo valor es una que nadie prueba. El día que exista un segundo dominio se cablea entera, con su columna en el ledger y su rechazo del lado del servidor.


## En un pull, la tabla de bloques muestra su nombre (v1.14.1)

La sección de Bloques de un pull mostraba el código crudo —`DEMOQA1`— en la columna donde uno busca su bloque, y el proyecto en blanco. Los datos estaban bien; lo que fallaba era la resolución del nombre.

- **La causa es la identidad de la fila.** El admin resuelve nombres pidiendo bloques **por `documentId`**, y en un pull la fila del ledger se identifica por `cod_proyecto` — que en Strapi es el `legacyId` del bloque, no su documentId, que puede ni existir cuando la corrida arranca. En un push las dos cosas coinciden, y por eso nunca se había notado.
- **`getBlocksLite` acepta ahora `legacyIds`** y devuelve `legacyId` en la respuesta. Va siempre, no sólo cuando se filtra por él: suma ~14 KB sobre los ~143 KB que ya pesa el universo completo, y evita tener dos formas de la misma consulta según quién la llame.
- **El mapa de nombres se llavea con la identidad de la fila**, no con la del bloque, así que la tabla sigue buscando por `b.documentId` sin saber de operaciones.
- **Sólo se piden las filas de bloque.** Las de catálogo y las de proyecto no son entidades de Strapi —`countries/Guatemala` y la clave natural de un proyecto no son documentIds—, así que pedirlas gastaba la petición en ids que nunca podían resolver. Eso ya estaba mal antes; se ve ahora que las fases están separadas.


## El detalle de un pull se lee por fases (v1.14.0)

Un pull de **un** bloque decía **"Blocks: 8"**. No era un error de cuenta: la corrida escribe tres clases de cosa —seis catálogos, un proyecto y el bloque— y la vista las listaba juntas bajo el rótulo de bloques, así que encontrar el bloque obligaba a leer seis filas de catálogo primero. Un push no tenía este problema porque sus filas son de una sola clase.

- **Tres secciones plegables en vez de una tabla**: Catálogos, Proyectos y Bloques, cada una con su contador y su insignia de incidencias. Sólo se dibuja la que tiene filas.
- **El encabezado cuenta bloques**, no filas del ledger. Los catálogos y el proyecto son *cómo* se logra, no *qué* se logró; su desglose vive en sus propias secciones.
- **Catálogos viene plegada.** Es maquinaria: cuando todo sale bien no aporta, y cuando algo falla su contador en rojo lleva hasta ahí sin abrirla.
- **Cada sección muestra sólo sus columnas útiles.** Un catálogo no tiene `cod_proyecto`, ni modo, ni escritura, y mostrarlas siempre vacías era parte del ruido. El botón de archivos queda sólo en las filas de bloque, que son las únicas que producen artefacto.
- **El identificador se parte en vez de mostrarse crudo.** En las fases 1 y 2 no es opaco: un catálogo es `coleccion/valor` y un proyecto es su clave natural. Ahora se lee `Guatemala` con `countries` debajo, en vez de `countries/Guatemala`.
- **Un push se ve exactamente igual que antes.** Sus filas llevan todas `phase = 3`, así que caen en un solo grupo y la vista dibuja la tabla sin el envoltorio de secciones. Lo mismo vale para cualquier corrida vieja: las filas sin fase se tratan como bloques, que es lo que eran.

**Del lado del pipeline** (`sync-database` y `n8n-manager`): `Postgres read run` no seleccionaba `b.phase`, así que el dato existía en el ledger desde el 19 de agosto y nunca llegaba al admin. Se agrega a las dos ramas del UNION y se mapea en `Merge status`.

Archivo nuevo: `components/sync/run-phase-groups.tsx`. Claves nuevas: `phaseCatalogs`, `phaseCatalogsHint`, `phaseProjects`, `phaseBlocks`, `colCatalog`.


## El pull ya se puede ejecutar (v1.13.0)

La operación **pull** (MySQL → Strapi) queda habilitada de punta a punta. El selector ya leía el warehouse desde 1.12.0; ahora la corrida se dispara y escribe.

- **Tres fases con barreras**, porque el pull no puede escribir en cualquier orden: catálogos → proyectos → bloques (con sus unidades). Un proyecto referencia sus amenidades y un bloque su proyecto. Las unidades NO son una cuarta fase: dependen sólo de SU bloque, no de todos.
- **No duplica proyectos.** El proyecto no tiene campo estable en Strapi, así que se alcanza por cualquier bloque hermano suyo (`cod_proyecto` → `block.legacyId` → `block.project.documentId`). No hay coincidencia difusa por nombre ni por distancia: o hay un hermano con ese `legacyId` exacto, o el proyecto no existe y se crea.
- **Los catálogos se referencian, no se actualizan.** Son un conjunto compartido: sobrescribir el nombre curado de una amenidad con el texto crudo de SQL degradaría lo que ve todo el mundo. Y usan la misma regla de `code` que la migración (`C+` → `c-plus`, no `c`), o el pull crearía un duplicado al lado del que ya está en uso.
- **Guarda de vaciado antes de borrar**: cero unidades en MySQL con unidades en Strapi casi nunca es un bloque que se vació, sino una consulta que falló. Se marca `failed_sanity` y el drainer la cuenta para su umbral de aborto.
- **El diálogo avisa que el pull borra** antes de elegir, no después: las unidades que el warehouse no tenga se eliminan en Strapi, incluidas las creadas a mano en el admin. Es lo que se pidió —SQL como fuente de verdad— y por eso se dice de frente.
- **`purge` sigue rechazada** en la ruta del servidor, no sólo en la UI: una operación desconocida que cayera al disparador no fallaría, correría un push en silencio.
- Clave nueva: `pullWarning`. Se retiran `operationPullSoon` del badge y el aviso de vista previa.

**Del lado del pipeline** (repos `sync-database` y `n8n-manager`): `sync_run_blocks` gana `phase` y `resolved_document_id`; el drainer despacha sólo la fase mínima con trabajo pendiente y elige worker por operación; `Resolve Targets` bifurca y arma el ledger de las tres fases; y hay un `Pull Block Worker` nuevo de 54 nodos. 620 tests en total.

---

## El selector de un pull lee el warehouse, no Strapi (v1.12.0)

Primer trozo visible del **pull** (MySQL → Strapi). La operación ya se puede elegir y el selector cambia de fuente: con `pull` lista los bloques de `housing_universe`, que es de donde vendrían los datos. **Todavía no se puede ejecutar** — falta su resolución de objetivos y su worker— y eso está dicho en el diálogo y forzado en el botón.

- **Ruta nueva `GET /api/sync/sql-projects`**, proxy de `primeiq/sync/sql/projects` en n8n, que consulta MySQL y agrupa en proyectos. Restringida a super admin y comprobado en el servidor: expone la cartera completa del warehouse —nombres, constructoras, países— y esconder un botón no detiene a quien arme el GET. Verificado en vivo: **851 proyectos, 1.271 bloques**.
- **Elegir sobre Strapi habría sido incorrecto**, no sólo distinto: ofrecería bloques que el warehouse no tiene y escondería los que sí. Por eso el selector cambia de universo con la operación.
- **La respuesta se normaliza a las mismas estructuras del camino de push**, así que el árbol, los filtros de país y región, el panel de selección y el contador funcionan sin duplicar UI. Lo único que cambia es la identidad: acá la llave es `cod_proyecto`, que es con lo que el pull une contra `block.legacyId`.
- **Cambiar de operación limpia la selección.** Push identifica por `documentId` y pull por `cod_proyecto`; arrastrarla dejaría llaves inexistentes en el universo nuevo y la corrida apuntaría a objetivos que no resuelven. La caché del selector también se llavea por operación.
- **El filtro de región se aplica en memoria**: la consulta SQL agruparía igual, y cada bloque ya trae su trimestre. El de país se traduce de `documentId` de Strapi al nombre que guarda el warehouse.
- **Sin bandera en el modo pull**: MySQL guarda el país como texto, no como ISO. Preferible a inventar una equivocada.
- Claves nuevas: `operationPullPreview`, `pullPreviewBanner`.

---

## La barra de progreso pasa a ser una línea de tiempo por segmentos (v1.11.0)

Una barra de progreso lisa al 96% se ve idéntica con 0 fallas que con tres. Ahora es el patrón de **barra de uptime** (statuspage): ancho fijo, N segmentos, cada uno pintado por lo que pasó ahí.

- **Es una línea de tiempo, no un listado.** Los bloques se dibujan en el orden en que la corrida los trabaja, y para eso `Postgres read run` pasó de `ORDER BY document_id` a `ORDER BY seq` sobre el `bigserial` del ledger — el mismo con el que `Postgres list pending` del drainer elige el siguiente. La tabla sigue ordenándose alfabéticamente para poder buscar; aplicar ese orden a la barra movería cada marca a una posición que no corresponde a cuándo ocurrió.
- **La barra siempre ocupa el ancho completo**, tenga la corrida 5 bloques o 1.300: es porcentual. Con muchos, un segmento cubre un rango y se pinta con el **peor** estado del rango — promediar perdería justo la falla que se busca. Con pocos, un bloque abarca varios segmentos (5 bloques → cada uno el 20%).
- **`pending` gana sobre `done`**, así un segmento sólo verdea cuando todo su rango terminó y la barra no aparenta avance que no hubo. Un estado que el build no conoce tampoco se esconde bajo el verde.
- **Cantidad de segmentos según el ancho** (`ResizeObserver`, de 12 a 100 a ~9px cada uno). Fijar 100 dejaba marcas de menos de 2px en móvil, donde un rojo suelto no se distingue del borde de su vecino.
- **Una parada manual se pinta gris, no roja**, igual que en la insignia: se guarda como `failed` porque el CHECK de `sync_run_blocks` no admite otra cosa.
- **En el banner del listado la barra es proporcional, no temporal**, y está anotado como tal: ese endpoint sólo trae totales — pedir el estado de mil bloques para pintar una barra no vale el viaje.
- Archivo nuevo: `components/sync/run-status-bar.tsx`. Clave nueva: `statusBarLabel`.

**Corregido de paso** — `Postgres read run` traía **dos columnas llamadas `operation`** en cada rama del UNION, la de la corrida y la del bloque. Con nombres repetidos gana la última, así que la corrida llegaba con `NULL` y caía al `'push'` por defecto: una corrida `pull` se habría mostrado como push. La del bloque pasa a llamarse `block_operation`. Invisible hasta hoy porque sólo existe push.

---

## Los archivos dejan de ser una pestaña y pasan a estar un nivel adentro (v1.11.0)

La vista de una corrida tenía dos pestañas —bloques y archivos— que **listaban los mismos bloques**, así que llegar a los JSON de uno obligaba a leer su nombre, cambiar de pestaña y volver a buscarlo entre cientos de carpetas. Ahora hay un solo listado y los archivos están un nivel más adentro: se entra desde la fila del bloque y se vuelve por la miga de pan.

- **Se elimina `Tabs` de `app/(main)/sync/[runId]/page.tsx`.** La página guarda qué está mostrando (`viewingFiles`): el listado, o los archivos de una carpeta con su rótulo.
- **La miga de pan apunta al listado, no a la ruta de S3.** Estando en archivos queda `Operaciones de datos › <corrida> › <bloque>`, y `<corrida>` vuelve al listado. La jerarquía que le sirve al operador es la de la corrida, no la del bucket.
- **Cada fila trae un botón que entra a `blocks/<documentId>/`** (`components/sync/run-blocks-table.tsx`), en la tabla de escritorio y en las tarjetas móviles.
- **Las migas de carpeta del navegador ahora son relativas al punto de entrada** (`components/sync/run-files-browser.tsx`, prop `initialPath`). Entrando desde un bloque no se dibuja ninguna —esa carpeta no tiene subcarpetas—; entrando por la raíz de la corrida siguen funcionando igual que antes.
- **La raíz sigue alcanzable** con el botón `Archivos` de la cabecera, para los archivos que no cuelgan de un bloque.
- **Todo lo de archivos sigue detrás de `isStrapiSuperAdmin`**, el mismo criterio que escondía la pestaña.
- Claves nuevas en `messages/es.json` y `messages/en.json`: `blockFiles`, `blockFilesHint`, `backToBlocks`.

---

## El diff se ve como código, izquierda contra derecha (v1.10.1)

El diff pasa de una lista de campos a las **dos columnas de JSON alineadas**, con números de línea, rojo lo que había y verde lo que quedó.

- **La alineación se construye, no se adivina** (`sideBySide` en `lib/sync/diff-snapshot.ts`). Un diff de texto sobre los archivos crudos sería inservible: tienen forma distinta —el respaldo trae `universe/units/amenities/services`, lo escrito trae `operation/cod/universe/units/flags`—, distinto orden de claves, `id` y `created_at` de un solo lado, y números como texto contra números. Se recorre la estructura ya emparejada por fila y por campo y se emite un par de líneas por cada una, así el desfase es imposible por construcción.
- **Tramos sin cambios plegados**, como GitHub. Sobre una corrida real son **2.490 líneas de las que cambia 1**: con "Sólo cambios" activado se dibujan 7 filas en vez de 2.490. El interruptor permite ver el JSON completo cuando hace falta.
- **`cod_proyecto` se suma a las columnas ignoradas.** El mapper la excluye de la fila de universe porque va en el `WHERE` y no en el `SET`, y el respaldo se consultó filtrando por ella — no puede diferir. Sin ignorarla, la vista lado a lado mostraba un cambio que el contador no reportaba: dos vistas del mismo dato contradiciéndose, que es peor que omitir una columna de identidad.

## Diff de una corrida: qué había, qué se escribió y qué cambió (v1.10.0)

Cada intento deja ahora **cuatro archivos** en S3 en vez de dos, y la vista compara los dos que importan.

```
sync-runs/<runId>/blocks/<documentId>/
  strapi-source-<execId>.json   ← lo que Strapi entregó        (nuevo)
  mysql-snapshot-<execId>.json  ← MySQL ANTES de escribir
  written-<execId>.json         ← las filas que se escribieron (nuevo)
  apply-result.json             ← resultado y conteos
```

- **Diff con contador estilo GitHub** (`components/sync/snapshot-diff-dialog.tsx`): `+agregadas −eliminadas ~modificadas`, global y por tabla, con el detalle campo por campo — lo anterior en rojo, lo nuevo en verde. El botón sólo aparece cuando existen **los dos** archivos del mismo intento; un `written` sin su respaldo no se ofrece en vez de abrir un diálogo que después avisa que falta algo.
- **La comparación normaliza tres cosas, y sin ellas el diff sería ruido** (`lib/sync/diff-snapshot.ts`). MySQL devuelve los `DECIMAL` como texto (`"106900.44"`) y el mapper produce números, así que se comparan por valor y no por tipo. Se ignoran las columnas que administra MySQL (`id`, `created_at`, `key_units`), ausentes del lado escrito. Y se compara **con la precisión de la columna**, que el lado "antes" revela: el mapper calcula `207.959` donde la columna guarda `207.96`, y sin eso cada push marcaría esos campos como modificados en todas las filas. Calibrado contra datos reales: sobre un bloque de 90 unidades reporta exactamente las 18 que tenían el error ÷1000 y ninguna más, y sigue detectando un cambio de un centavo.
- **Los tres archivos comparten el `execution id`**, así las piezas de un mismo intento quedan emparejadas: comparar el respaldo de un intento con lo escrito por otro mezclaría dos estados distintos del warehouse.
- **Sólo el respaldo de MySQL puede frenar la escritura.** Sin él no se puede volver atrás; los otros dos son material de análisis y perderlos no justifica abortar un bloque listo. Y sólo él se marca *restaurable* — restaurar desde `written` reinstalaría justo lo que se quiere deshacer.
- **Costo**: de ~85 KB a ~250 KB por bloque; una corrida completa pasa de 0.11 GB a ~0.33 GB.
- Verificado con una corrida real de punta a punta: los cuatro archivos en S3 con el mismo `execution id`, y el diff sobre ellos dando `+0 −0 ~0` sobre 46 filas — el bloque ya tenía esos datos.

## Operaciones de datos: la sección deja de llamarse Sincronizaciones (v1.9.1)

La sección va a alojar también un **borrado en cascada en Strapi**, y "sincronización" describe mover datos entre dos lados — una purga no sincroniza nada, destruye. Se renombra a **Operaciones de datos** (`navigation.sync`, título, subtítulo y migas), que es el paraguas más chico que sigue siendo cierto con las tres.

- **`direction` pasa a `operation`** en el ledger, en n8n y en el admin. Push y pull son direcciones —sentidos opuestos del mismo movimiento—, pero una purga no tiene dirección. El campo ahora dice QUÉ hace la corrida: `push` | `pull` | `purge`.
- **Migración reemplazada**: `n8n-manager/sql/2026-08-18-sync-runs-operation.sql` sustituye a la de `direction`, que nunca llegó a correrse. Arrastra el valor y retira la columna vieja **sólo si existe**, dentro de un bloque `DO` con SQL dinámico: Postgres compila la sentencia entera antes de ejecutarla, así que un `set operation = direction` sobre una base sin esa columna falla al parsear aunque el `WHERE` lo excluyera.
- **Tercera tarjeta en el diálogo**: Purga, deshabilitada como Pull, en rojo y con su propia advertencia. No se parece a las otras dos y la vista no debería sugerir que sí.
- **Colisión de rótulos resuelta**: `sync_run_blocks.operation` ya existía con otro significado (`insert`/`update`). En la tabla de bloques esa columna pasa a llamarse **Escritura**, para que "Operación" signifique una sola cosa en pantalla.
- Verificado contra n8n: una operación inválida responde 400 nombrando las tres válidas, y `purge` responde 400 diciendo que todavía no está implementada.
- ⚠️ **La purga no tiene respaldo**. El push snapshotea MySQL a S3 antes de escribir; un borrado en cascada en Strapi hoy no tendría de dónde volver. Hay que resolverlo antes de habilitarla.

## Sincronizaciones: nueva sección para empujar el admin al warehouse (v1.9.0)

Sección nueva **Sincronizaciones** (`/sync`), entre Catálogos y el Copiloto, para disparar y seguir el writeback **Strapi → MySQL** sin entrar a la terminal. El pipeline corre en n8n (`scripts/sync-database`, rama `feature/n8n-writeback-orchestration`); el admin es su tablero.

- **Listado y detalle** (`app/(main)/sync/`): historial paginado, banner de la corrida activa con progreso y cronómetro que avanza **segundo a segundo** —independiente del refresco de 5 s, que hacía saltar el contador de cinco en cinco— y detalle con resumen, bloques y archivos en pestañas. Las pestañas además sacan del DOM la tabla de bloques mientras se miran los archivos: con 1.330 bloques eso importa.
- **Crear una corrida** (`components/sync/new-run-dialog.tsx`): dirección **Push** (Strapi → MySQL) o **Pull** (MySQL → Strapi, deshabilitado hasta que exista el pipeline), y selección por proyecto. Plegar un proyecto y seleccionarlo son acciones distintas; los proyectos de un solo bloque no se expanden; cada fila muestra bandera del país y región (GAM/Interior); un check marca todo lo filtrado. Se cargan los 1.330 bloques en **una** petición liviana (`getBlocksLite`) en vez de tres pesadas — `getBlocks` popula proyecto→país, categoría, foco y estado: 1.277 KB y ~1,8 s por página contra 108 KB y ~400 ms.
- **Detener una corrida**, sólo super admins, verificado en el servidor y no sólo en la UI. Una corrida detenida se marca `aborted` y se ve **gris**, no roja: antes un stop y un error de SQL se leían igual. El histórico también, reconociendo el texto que dejó el release.
- **Archivos de la corrida**: navegador de los respaldos que el pipeline sube a S3, con visor de JSON de sólo lectura (CodeMirror, con plegado y búsqueda; el panel de reemplazo no existe porque el editor está en modo lectura). Cada carpeta dice a qué bloque y proyecto pertenece. **Marca cuál respaldo es el restaurable** — el del primer intento: los reintentos se toman cuando el intento previo quizá ya escribió, así que restaurar del archivo equivocado reinstala los datos nuevos creyendo que restaura los viejos.
- **Seguridad**: `SYNC_API_KEY` nunca sale del servidor; todo pasa por rutas proxy en `app/api/sync/`. Listar y leer archivos, disparar y detener exigen super admin **en el servidor**. Aguas arriba, las rutas de S3 acotan prefijo y llave a `sync-runs/<runId>/`: sin eso, quien tuviera la llave podía recorrer el bucket entero.
- **Correcciones de datos encontradas en el camino**: `getBlocks` filtraba `projectIds` contra el id numérico de la relación y devolvía cero filas con `documentId`; la descarga de archivos usaba `<a href>`, que no manda cabeceras, así que bajaba un JSON con `{"error":"Unauthorized"}` adentro con aspecto de respaldo legítimo.
- **Variables nuevas**: `SYNC_API_URL` y `SYNC_API_KEY` (n8n). Sin ellas la sección responde 500 con un mensaje explícito.
- ⚠️ **Pendiente de la base**: `n8n-manager/sql/2026-08-18-sync-runs-direction.sql` agrega `direction` al ledger. La sección funciona sin correrla —las lecturas toleran la columna ausente y caen a `push`— pero conviene aplicarla.

## Units datasheet: grouped toolbar, block averages, and out-of-range alert (v1.8.0)

- **Block averages (`datasheet-units-table.tsx`)**: new **AVG** group next to the availability counters, with **Precio mts²** (`pricePerM2USD`) and **Mantenimiento mts²** (`maintenancePricePerM2USD`). Averaged over **all rows** — a unit with no value counts as 0 — and converted to the currency selected in the grid via `getBuyRate`, with the same formatting as the price cells.
- **Counters are now derived, not synced by hand**: `availabilityStats` (five `setState` call sites) was replaced by a `gridStats` memo over `dataRef.current`. Correctness rests on the fact that every mutation path already triggers a re-render (`pendingChanges`, `rowCount`, `refreshKey`, `historyIndex`, or the `units` prop), so the value can never go stale. This repaired **two pre-existing drift bugs**: neither `handleUndo`/`handleRedo` nor `performSync` ever recomputed the counters, so they showed stale numbers after an undo or a sync.
- **Toolbar and stats grouped into labelled boxes**: **Control** (add, save, sync), **Vista** (search, row-status legend, column visibility), **Filtros** (unit, currency, unit type), **Unidades** and **AVG**. The toolbar's own frame was dissolved — the groups are the frames now — and the six vertical separators are gone. Filtros drops the redundant "Unidad:"/"Moneda:" labels (the select value reads on its own inside a group called FILTROS); the name moves to `aria-label`/`title`.
- **Overflow menu (`hooks/use-overflow-groups.ts`)**: the five groups live on a single line; whatever does not fit moves to a **⋮ menu** pinned to the last visible group, Google Sheets style — stacking into rows pushed the grid down and made the screen unusable. All groups stay mounted and laid out and are clipped with `overflow-hidden`, so what gets measured never depends on the result of the measurement and the split cannot oscillate. A `ResizeObserver` watches the strip **and each group**, plus a content key: width also changes when a counter goes from 5 to 44, when the currency selector appears, or on locale change. Clipped copies are `inert`/`aria-hidden`; the live copy is the one drawn in the menu.
- **Save status indicator** moved below the strip as a thin bar: sharing the row stretched it to the height of the group boxes and cost the strip ~160px of width, pushing groups into the overflow menu that actually fit.
- **Out-of-range alert (`OUT_OF_RANGE_*`)**: flags **Precio por m²** and **Mantenimiento por m²** values that stray from the block — typically a digit added or dropped while tabbing. Each row is compared against the average of **the other** rows with a value (`(sum − xᵢ) / (n − 1)`), over rows with value > 0 only, with a minimum of 5 such rows and a symmetric **8×** threshold (or one eighth). The cell is painted orange — full while unsaved, muted once persisted — and a coloured dialog lists the affected rows before saving. **It never blocks**: an extreme value can be legitimate. The two save gates are chained, not merged: out-of-range first, then the existing >5-row volume confirmation.
- ⚠️ **Why not "5× the displayed average"**: the displayed AVG counts empty rows as 0, so the first price entered into a fresh block would be flagged (2000 against an average of 2000/44); and comparing each row against an average that includes it lets a large error raise its own threshold — with `n ≤ F` the condition can never be met at all. Both traps are documented in `docs/superpowers/specs/2026-08-05-units-out-of-range-alert-design.md`.
- **i18n**: the five stat pills, the toolbar group names and the alert strings moved into `messages/es.json` and `messages/en.json`. The counters were hardcoded in Spanish, so the row rendered half-translated under the EN locale.
- **Docs**: adds `CLAUDE.md` (repo guide for Claude Code) and two design specs under `docs/superpowers/specs/`.
- **No backend changes**: every metric is derived on the client and nothing new is persisted to Strapi.
- Release: **1.8.0**.

---

## El Salvador support: country filters/pills, Cuota & IVA by country ISO (v1.7.0)

- **Country as a first-class dimension**: quick country filters (like region) and a `CountryPill` (flag + name, via `lib/region.ts#countryFlag` from `isoCode2`) across projects, blocks, exchange-rate-profiles, and the units datasheet. New **País** column in projects/blocks tables (left of Región) and a read-only **País** reference column + header pill in the datasheet. Country is resolved through `project.country` (blocks/units deep-populate `populate[project][populate][country]`).
- **Departments by country** (`lib/departments.ts`): `DEPARTMENTS_BY_ISO` hardcoded per ISO (GT: 22, SV: 14), keyed by `isoCode2`. The units list filter groups departments under their country and scopes the available list to the selected country.
- **Cuota (installmentUSD) by country ISO** (`datasheet-units-table.tsx`, `.migration/src/core/formulas.js`): `INSTALLMENT_BY_ISO` — GT (default) `7.5% / 20 años / 90%`, SV `8% / 25 años / 85%`, same `priceWithoutVATUSD` base; unknown ISO → GT. Replicated in the migration CLI so UI and migration don't diverge (parity test).
- **IVA (getVatRate) by country ISO**: El Salvador (`SV`) uses factor `1.0` = **0% IVA** (price without VAT = total) as a placeholder until its rate is approved; Guatemala/default keep the current logic (`1.12` / `0.916` for "Uso Venta"). Flows through the single `unitVatRate` closure; mirrored in the CLI.
- **Units datasheet (`/units/list/[id]`)**: removed the top-right block switcher and its region/department filters — to change block/project, go up to `/units` with all filters. Back arrow preserved.
- **Migration CLI**: `normalizeBlock` now carries `countryIso` (from `project.country.isoCode2`); the formulas phase threads the ISO into installment and VAT, so a SV block migrates with 0% IVA + SV cuota and a GT block is unchanged.
- ⚠️ **Depends on Strapi data**: every country-aware behavior keys off `country.isoCode2` (fallback `code`). Guatemala must be `GT` and El Salvador `SV`, else SV units fall back to GT (12% IVA + GT cuota). Post-deploy, existing SV blocks (computed under GT rules) will show as pending/yellow under load reconciliation until saved or migrated.
- Release: **1.7.0**.

---

## Units datasheet: total-size formula + load reconciliation + migration CLI (v1.6.0)

- **Tamaño Total reformulado** (`datasheet-units-table.tsx`, `datasheet-units-table-config.ts`): `totalSizeM2 = habitableConstructionM2 + (isVertical ? parkingSizeM2 : 0)`. Vertical → (unitSize + balcón) + parqueo; horizontal → habitable; lote → terreno. New `isHorizontal` cascade condition; parking adds to total only on vertical; the balcony cascade now recomputes total; lote cascades keep `unitSize = terreno = total` (bidirectional). The grid cell now displays the stored `totalSizeM2` instead of recomputing the old `unitSize + parking`.
- **Reconciliation on load**: formula fields whose stored value differs from the recomputed value are marked pending (yellow) — including their varas²/foreign-currency counterparts — and an informational dialog lists the affected rows so the user reviews and saves. A per-row diff (DB → nuevo, Δ) is logged to the browser console. `maintenanceWithoutVATUSD` (client-only) is excluded to avoid false positives.
- **Migration CLI** (`.migration/`, fully isolated — no impact on front/back): an oclif-based interactive CLI that migrates the formula fields of all units to the DB block by block, replicating the pure formula engine. Per-block JSONL snapshots, per-phase sí/no/sí-a-todo gate, spinners/progress, checkpoint/resume, idempotent diff (tolerance 1e-6), configurable concurrency + PUT throttle (`PUT_DELAY_MS`), and a rollback command (re-PUT originals). See `.migration/README.md`.
- Release: **1.6.0**.

---

## Units datasheet: auto-assign next available code on duplicate, surface save errors (v1.5.0)

- **Feature (`/api/units/generate-code`, `datasheet-units-table.tsx`, `lib/api/strapi.ts`)**: when saving a unit whose `code` collides with an existing one (Strapi `ValidationError` — "This attribute must be unique" on `code`), the grid now fetches the next available code via Strapi's `content-manager/uid/generate` (correlative `-1`, `-2`, …), swaps it into the payload, and retries the save silently (max 5 attempts). The unit `name` is left unchanged; only `code` is reassigned. Mirrors the existing blocks generate-code flow. Applies to both the edit (rename) and create paths.
- **Fix (retry path)**: editing `unitNumber` marks `unitNumber`+`name`+`code` as pending, so the `updates` array carried two `{ field: "code" }` entries. The retry mutated only the first via `.find()`; since `updateUnitBatch` applies updates last-wins, the stale second entry overwrote it and the PUT kept resending the old code (infinite conflict loop). All `code` entries are now updated on retry.
- **Error reporting (`datasheet-units-table.tsx`, `lib/api/strapi.ts`)**: `updateUnitBatch`/`createUnit` now attach the full `strapiError` to thrown errors; a failed save surfaces a Sileo toast with the row detail (row number, unit number, model) and the exact system message instead of only turning the row red.
- Release: **1.5.0**.

---

## Units datasheet: fix stale-closure bug in handleSave (v1.4.3)

- **Bug fix (`datasheet-units-table.tsx`)**: `handleSave` was wrapped in `useCallback` but `pendingChanges` was missing from its dependency array. After saving several sets of edits in sequence, the closure captured an old snapshot of `pendingChanges` and flushed the wrong units to the API — cells remained amber even though the save appeared to succeed.
- **Fix**: added `pendingChangesRef` (a `useRef` kept in sync on every render via `pendingChangesRef.current = pendingChanges`). `handleSave` now reads `pendingChangesRef.current` at call time instead of the stale closure value, guaranteeing it always flushes the current pending set.
- Release: **1.4.3**.

---

## Repo metadata, contact, and Node (unreleased)

- **`package.json`**: `author` set to `Kike Rios <kike@devroot.studio>`.
- **`README.md`**: **Contact** section (consultas) and **Quick Reference** rows for maintainer and GitHub email.
- **`CHANGELOG.md`**: contact line at top of file (this section records the same policy in the timeline).
- **`.nvmrc`**: Node **24** for `nvm use`, aligned with the project’s current Node toolchain.

---

## Units datasheet: batch sync, maintenance VAT, editable local currency (v0.2.0)

- **`onCellsEdited` (multi-cell / same commit path as the grid)**: for saved units, in-memory sync now matches `onCellEdited` — changing **parking spaces** recalculates parking size, totals, and pending fields; changing **total price** or **rent** updates net-of-VAT, per m², installment, and income where applicable; **unit size**, **total maintenance**, **front/depth**, and pending flags stay aligned with single-cell edits.
- **Maintenance**: total is treated **with 12% VAT** (same convention as sale/rent); new read-only **Maintenance without VAT** column (USD and foreign-currency counterparts); **Maintenance per m²** = maintenance without VAT ÷ habitable construction; EN/ES column help updated.
- **Local currency (GTQ, MXN, etc.)**: **Total price**, **rental price**, and **total maintenance** in the selected currency are **editable**; two-way conversion with USD; typed amounts kept on the row when applicable; editing those fields in **USD** clears stale “visual” amounts in other currencies; column headers no longer show a lock solely for being a foreign-currency column (read-only remains for formulas, USD when another currency is active, etc.).
- Release: **0.2.0**.

---

## Units: absorption, absorption per m², sync webhook (v0.1.5)

- **Unit absorption** (read-only): when availability is “Not Available”, computed as 1 / (days between collection date and block start date / 30); up to 12 decimal places; persisted via API.
- **Absorption per m²** (read-only): unit absorption × habitable size; up to 12 decimal places; persisted via API.
- **block-counter-update webhook**: after each row save (edit or new unit), calls the webhook with the view context `blockId` (parent block) to sync counters; default URL and block id configurable via `NEXT_PUBLIC_BLOCK_COUNTER_WEBHOOK_URL` and `NEXT_PUBLIC_BLOCK_COUNTER_DEFAULT_BLOCK_ID`.
- Release: **0.1.5**.

---

## UI: collection period and version (v0.1.4)

- **Collection period** card: Quarter field matches the width of other fields (block form and block view).
- Release: **0.1.4**.

---

## Blocks: market, blockType, migNumber, and form

- **Market** moved from Projects to Blocks; no longer edited on projects.
- Removed **block type** (`blockType`) and **MIG number** (`migNumber`); MIG is managed outside this app.
- Block form shows only the selected unit system (m² or varas²) and currency (USD or other).
- Several fields are **read-only** (backend-calculated): unit counts/availability, areas, pricing and financing, parking (visitors, assigned, total).
- Translation tweaks (session loading messages).

---

## Settings and user role

- **User role** loaded from the API and shown in Settings and the header menu.
- Notifications card moved below the tour card (still disabled).
- OpenAPI documentation updated.

---

## Currencies and formatting on blocks/projects

- Units datasheet: multi-currency support and conversion; fixes for maintenance and financing columns.
- Block view and block form: amount formatting and currency handling; currency management on project forms.
- Block form: unit dimension selector (m² / varas²) and currency selector for editing values.

---

## Tours and Notion-style UI (v0.1.3)

- Guided tours on multiple screens.
- Notion-inspired styling tweaks.

---

## Password recovery and language (v0.1.1)

- Full “forgot password” and reset flow.
- Language selector (ES/EN) and desktop notice.
- App version visible; branding and redirects updated.
- Units table: better on mobile; pagination with page jump.
- Responsive layout improvements.

---

## Units table: columns, rows, and auto-save

- Resizable columns, add rows, refresh data, cell type validation.
- Pattern/sequence fill, cell dropdowns, auto-save and status indicators.
- Login/register pages with language support.

---

## Block CRUD and project form

- Block CRUD (create, edit, clone, view) with improved UI.
- Project form as cards (general info, location, amenities, services, financing).
- Navigation and per-block units page improvements.
- App internationalization (ES/EN).

---

## Projects table and detail

- Projects table with sort, pagination, and filters; Strapi types for projects.
- Project detail and edit pages; forms with amenities and services; improved loading and error handling.

---

## Auth, theme, and settings

- AuthContext (login/logout); light/dark theme; settings page with profile and password change.

---

## Project bootstrap

- Initial structure: Next.js, TypeScript, styles, base components, login, and layout.

---

*For commit-level detail, run `git log --oneline`.*
