# Roadmap: de Strapi + n8n a Next.js + Prisma + workers

<!-- SECCIÓN PROTEGIDA: no borrar, mover ni resumir. Solo puede cambiarla el usuario. -->
## 0. Lectura obligatoria antes de hacer cualquier cosa

Antes de ejecutar cualquier paso de este roadmap, lee:

1. **[`.agents/skills/proteger-produccion/SKILL.md`](../../.agents/skills/proteger-produccion/SKILL.md)** y su [`inventario-produccion.md`](../../.agents/skills/proteger-produccion/inventario-produccion.md).
2. **[`README.md`](./README.md)** de esta carpeta (contexto, decisiones y estado).

Reglas que aplican siempre:

- **Producción no se toca.** Todo este plan se construye **en paralelo**: Strapi, n8n y lo que depende de ellos siguen funcionando igual hasta el corte (fase 7), y el corte lo ejecuta **una persona**, no un agente.
- Si un paso requiere escribir, configurar, reiniciar, desplegar o borrar algo en producción: **detenerse y preguntar**.
- **No borrar, mover, resumir ni debilitar** esta sección, la sección equivalente de `README.md`, la skill `proteger-produccion` ni la regla `.cursor/rules/proteger-produccion.mdc`. Solo el usuario puede cambiarlas. Al editar este documento, conservar esta sección intacta al inicio.
- Responder siempre en **español**. Antes de explorar código, `graphify query "<pregunta>"`; después de modificar código, `graphify update .`.
<!-- FIN DE SECCIÓN PROTEGIDA -->

---

Plan general para dejar de usar Strapi como backend, reemplazar n8n donde aporta complejidad sin valor y terminar con un repositorio que una sola persona pueda mantener. Complementa a [`README.md`](./README.md) (contexto, inventario de tablas y decisiones ya tomadas); aquí está el **orden de trabajo**.

---

## 1. Dónde estamos y a dónde vamos

```text
HOY
Backoffice (Next.js) ──REST──► Strapi 5 ──► MySQL "strapi"
                                  ▲
n8n (9 workflows) ────────────────┘ ──push──► MySQL "dbo_stage" ──manual──► dbo (MySQL y Postgres)
Supabase (sync_runs, chat) · Redis (Coolify) · S3 (respaldos, tipo de cambio)

OBJETIVO
App Next.js ──Prisma──► Postgres (Railway)  ◄── fuente de verdad
     │                        ▲
     └─ encola ─► Workers BullMQ + Redis (Railway) ──push──► MySQL "dbo_stage" ──manual──► dbo
n8n solo para el Copilot (mientras se decide su futuro)
```

### Qué desaparece al terminar

| Pieza | Por qué se va |
|---|---|
| Strapi (App Runner) y la base MySQL `strapi` | La app lee y escribe Postgres directo con Prisma. |
| `lib/api/strapi.ts` (~3k líneas) y el proxy `app/api/strapi/[...path]` | Se reemplazan por una capa de datos tipada con Prisma, por dominio. |
| Rutas `generate-code` que hacen login de **admin** en Strapi | El código único se genera en la base (índice único + secuencia). |
| Workflows de sync, contadores y Banguat en n8n | Workers BullMQ o lógica dentro de la propia app. |
| Supabase para `sync_runs` / `sync_run_blocks` | Tablas en el mismo Postgres. |
| `.migration/` (recalcula fórmulas vía API de Strapi) | Las fórmulas se aplican al cargar y al guardar; ya no hay datos "en amarillo" que reparar. |
| Tablas alternativas de unidades (`editable-`, `luckysheet-`, `univer-`, `units-table`) | Código muerto: la hoja viva es `datasheet-units-table`. |

### Qué se queda

- El warehouse (`dbo_stage` → `dbo`) y su **promoción manual**: lo usan otros proyectos.
- Los factores del warehouse (1.4342 / 1.1976) en el push, distintos a propósito de los de la app (1.431 / 1.19).
- n8n **solo** para el Copilot, hasta que se decida (ver fase 6).

---

## 2. Principios para que el repo quede simple

1. **Una sola capa de datos.** Toda lectura/escritura pasa por `lib/db/<dominio>.ts` (Prisma). Nada de `fetch` a APIs propias desde componentes de servidor.
2. **Reglas de negocio puras y probadas.** Fórmulas, IVA, cuota, varas, región: funciones sin I/O en `lib/domain/`, con pruebas. Una sola copia en todo el repo: desde el 19 oct la importan la hoja de unidades y el ETL; `.migration/` queda congelado con una copia vieja que nadie importa.
3. **Un worker solo si hace falta.** Si algo se puede hacer en la transacción del guardado en menos de un segundo, se hace ahí. Los workers son para trabajo lento, programado o que habla con sistemas externos.
4. **Escritura validada en el servidor.** Server Actions / Route Handlers con Zod y verificación de sesión y rol en cada uno (no basta el layout).
5. **El esquema es la documentación.** Llaves foráneas reales, enums de Postgres, índices únicos donde hay unicidad de negocio (`code`, `document_id`).
6. **Mismo repo, dos procesos.** La app (Vercel) y los workers (Railway) comparten `lib/` y el cliente Prisma; se despliegan desde el mismo repositorio con entradas distintas.
7. **Cada fase es reversible hasta el corte.** Strapi sigue siendo la fuente de verdad hasta la fase 7; todo lo anterior se puede tirar y repetir.
8. **Paralelo, nunca encima.** Cada pieza nueva escribe en recursos propios (Postgres y Redis nuevos en Railway, copias locales del warehouse) y se valida comparándose contra producción en modo **sombra**. Producción solo se lee, con usuario de solo `SELECT`.

### Estructura propuesta de la app nueva

```text
app/                  Next.js (UI, Server Actions, Route Handlers)
lib/
  domain/             reglas puras: fórmulas, IVA, cuota, varas, región, geo
  db/                 cliente Prisma + un archivo por dominio (projects, blocks, units, …)
  auth/               sesión, roles, guardas
  queue/              definición de colas BullMQ (la app solo encola)
workers/              entradas de los workers (proceso aparte en Railway)
prisma/               schema.prisma + migraciones del Postgres NUEVO
etl/                  carga desde Strapi (temporal; se borra en la fase 8)
```

---

## 3. Fases

Cada fase tiene un **criterio de "hecho"**. No avanzar a la siguiente sin cumplirlo.

### Fase 0 — Decisiones que bloquean (antes de escribir más código)

Son preguntas de negocio/infraestructura; sin respuesta, el código posterior se reescribe.

- [ ] **Identidad de filas en el warehouse.** Cómo se asigna `legacyId` / `cod_proyecto` a bloques y unidades nuevos sin que difiera entre `dbo_stage`, `dbo` MySQL y `dbo` Postgres. Propuesta: la clave estable es el `document_id` de Strapi (y su equivalente en la app nueva), nunca un autoincremento del warehouse. Revisar primero el workflow **Sync Block Worker** (`yBuM3XVk36DwRgbs`) en `n8n-manager`.
- [ ] **El pull (warehouse → CRM).** ¿Sigue existiendo cuando la app sea la fuente de verdad? Propuesta: **eliminarlo**; si el equipo carga datos al warehouse por otra vía, se reemplaza por un importador explícito con vista previa, no por un pull que borra unidades.
- [ ] **Quién lee cada `dbo`** y si otros proyectos **escriben** en las tablas de Market Scan (`housing_*`, `office_*`, `industrial_*`, `banking_info`).
- [ ] **Red:** confirmar que Railway (y la máquina que corra el ETL) puede llegar al RDS MySQL; si no, IP de salida fija o túnel.
- [ ] **Usuarios:** migrar `up_users` con su hash bcrypt (nadie cambia contraseña) o forzar restablecimiento.
- [ ] **Dónde vive la app nueva:** este repo (`Admin-PrimeIQ/marketscanprime`), que es una copia paralela del backoffice. **Confirmar en Vercel que ningún proyecto de producción despliega desde este repo**; hasta entonces, `main` se trata como producción y no se hace `push` sin aprobación.
- [ ] **Infraestructura nueva:** crear un proyecto de Railway propio (p. ej. `marketscan-next`) con su Postgres y su Redis, separado del Postgres `dbo` que ya existe (ese es producción y lo usan otros proyectos).

**Hecho cuando:** cada punto tiene una respuesta escrita en `README.md` §9.

### Fase 1 — Leer Strapi con Prisma (en curso)

Paquete `etl/` ya creado (ver `README.md` §7).

- [ ] Agregar `STRAPI_DATABASE_URL` (usuario **solo `SELECT`**) al `.env` y correr `cd etl && npm run strapi:check`.
- [ ] Comparar el esquema contra `npm run strapi:pull:print` y corregir diferencias (columnas que sobran o faltan, tipos).
- [ ] Ampliar `check.ts`: unidades con más de un vínculo a bloque, unidades con más de una entrada `unitType` en `units_cmps`, vínculos que apuntan a filas inexistentes.
- [ ] Defensa adicional: extensión de Prisma que lance error ante `create`/`update`/`delete`/`upsert`.
- [ ] Conexión con SSL validando el certificado de RDS (no copiar el `rejectUnauthorized=false` de Strapi).
- [ ] Resolver el `.env` relativo al archivo, no al directorio de trabajo.

**Hecho cuando:** `strapi:check` pasa sin `ERROR`, y se conoce el número real de borradores/duplicados y huérfanos.

### Fase 2 — Esquema nuevo de Postgres

Diseñar `prisma/schema.prisma` de la app (no el de Strapi). Lineamientos:

| Strapi hoy | Esquema nuevo |
|---|---|
| Relaciones en tablas `_lnk` | Llaves foráneas directas (`block.projectId`, `unit.blockId`), muchos-a-muchos solo donde lo son (amenidades, servicios). |
| Zona dinámica `unitType` en `units_cmps` (polimórfica) | Tres tablas 1:1 `unit_housing`, `unit_office`, `unit_industrial` con `unitId` único, más `unit.kind` como enum. |
| Financiamiento: 4 tablas encadenadas, banco en `field` | `block_bank_rate (blockId, bank enum, annualRatePercent)` con único `(blockId, bank)`. |
| Monedas del perfil: 4 niveles de componentes | `exchange_rate_profile_currency (profileId, currency enum, buyRate, sellRate)`. |
| Enums como `varchar` | Enums de Postgres. |
| `code` sin índice único | Índice único; generación en la base. |
| `document_id` | Se conserva como `publicId` (o columna `legacyDocumentId`) para enlazar con el warehouse. |
| Usuarios `up_users` + roles | `user`, `role` enum; hash bcrypt reutilizable. |
| — | `sync_run`, `sync_run_block`, `exchange_rate`, `audit_log` (quién cambió qué). |

- [x] Escribir el esquema y la primera migración. Por decisión del usuario (15 oct 2026, `README.md` §3, decisión 8) viven en el Postgres de staging de Railway, esquema `msp_app`, separado del esquema `dbo_stage` de ese servidor (solo lectura) y nunca sobre `dbo`. Esquema: [`prisma/schema.prisma`](../../prisma/schema.prisma). Migración: `prisma/migrations/20261015210000_init`.
- [ ] Decidir qué campos calculados se **guardan** (para el warehouse y reportes) y cuáles se calculan al leer.

**Hecho cuando:** el esquema migra limpio en una base vacía y un revisor puede entender el modelo sin leer Strapi.

### Fase 3 — Carga inicial Strapi → Postgres nuevo

Script en `etl/src/load/`, **idempotente** (se puede correr N veces; hace upsert por `publicId`). Una sola transacción por corrida: si algo falla, ROLLBACK completo. Uso en `etl/README.md` → «Carga Strapi → msp_app».

- [x] Orden: catálogos → desarrolladores → perfiles de tipo de cambio → proyectos → bloques (+ financiamiento) → unidades (+ tipo) → usuarios.
- [x] Solo filas publicadas. Unidades sin bloque (620) y bloques sin proyecto (2) se cargan en un padre «No definido» (`etl-no-definido`, `etl-no-definido-<domain>`); los `code` repetidos (42) se cargan vacíos. Las tres quedan como advertencias en el reporte.
- [x] Unidades paginadas por cursor (`id > último`, lotes de ~2,000, pausa entre lotes, pool ≤ 2 conexiones). `units_cmps` se resuelve según `component_type`.
- [x] Cargas completas **fuera de horario laboral** (la extracción completa se rechaza entre 7:00 y 19:00): la base `strapi` es la misma que usa Strapi en producción.
- [x] **Recalcular** los campos de fórmula de cada unidad con `lib/domain` y reportar las diferencias contra lo guardado en Strapi (sustituye a `.migration/`). Hecho el 19 oct: la carga guarda el valor recalculado cuando difiere (decisión del usuario) y el original de Strapi queda en `etl/reports/formulas-*.csv`; `npm run load:formulas` da solo el reporte. Resultado en `README.md` §12.8.
- [x] Reporte final: incidencias con su porqué, exclusiones, filas nuevas/cambiadas/borradas por tabla y verificación de filas, relaciones y agregados. Las fórmulas van en su propio reporte (`etl/reports/formulas-*.json` y `.csv`) y el resumen de lo reemplazado queda en `etl_run.counts`.
- [x] Primera corrida real (`load:validate` → `load --dry-run` → `load`) y aplicar la migración `etl_run`. Hecho el 19 oct con el snapshot del 16 oct; falta refrescar con un snapshot nuevo leído de noche.

**Hecho cuando:** dos corridas seguidas dejan la base idéntica y los conteos cuadran con `strapi:check`.

### Fase 4 — Push al warehouse con paridad (reemplaza al Sync Block Worker)

Mientras Strapi siga vivo, el push lee de Strapi; después del corte, de Postgres. La lógica de mapeo es la misma (`README.md` §5).

El push nuevo **nunca escribe en `dbo_stage` ni en `dbo`** antes del corte. Escribe en una **copia sombra** y se compara contra lo que n8n deja en el `dbo_stage` real.

- [ ] Cliente Prisma de `dbo_stage` en `etl/prisma/stage/` con `db pull`, **solo lectura** (usuario `SELECT`).
- [ ] Copia sombra: MySQL local (Docker) o en el Railway propio, con el mismo esquema que `dbo_stage`, sin datos de producción salvo los que el propio push escriba.
- [ ] Mapeador puro `lib/domain/warehouse-mapper.ts`: bloque + unidades → filas `housing_universe`, `housing_units`, `housing_amenities`, `banking_info` (y equivalentes de oficinas/industrial).
- [ ] **Prueba de paridad:** para N bloques, la salida del mapeador debe coincidir celda por celda con lo que n8n ya dejó en `dbo_stage`. Atención a redondeo de `Decimal`, textos recortados a 50/20 y `NULL` en columnas `_qtz`.
- [ ] Escritura por bloque en una transacción en la copia sombra (borrar e insertar unidades, como hoy).

**Hecho cuando:** la prueba de paridad pasa en todos los bloques de un dominio y el push sombra corre una semana junto a n8n sin diferencias. Apuntar el push al `dbo_stage` real es un paso del corte (fase 7).

### Fase 5 — App Next.js sobre Prisma

El detalle de **qué cambia en cada módulo** y qué funciones deben seguir funcionando está en la [sección 4](#4-inventario-qué-cambia-en-cada-módulo-para-dejar-strapi). Aquí, el método.

**Estrategia: fachada con dos implementaciones.** La UI no habla con Strapi ni con Prisma; habla con una fachada `lib/api/client.ts` que expone los mismos métodos que hoy tiene `strapiClient` (`getProjects`, `updateUnitBatch`, …) y devuelve **la misma forma de datos** (`documentId`, relaciones anidadas, `unitType` como arreglo). Detrás hay dos implementaciones:

- `strapi`: la actual, sin cambios.
- `prisma`: llama a Server Actions / Route Handlers que usan `lib/db/*` y convierten filas de Postgres a esa misma forma (DTO).

Una variable `DATA_BACKEND=strapi|prisma` elige la implementación **para toda la app a la vez** (no por módulo: mezclar dejaría dos fuentes de verdad). Producción sigue en `strapi` hasta el corte; staging corre en `prisma`. Así los componentes casi no cambian durante la migración y se simplifican después, con la app ya estable.

1. [ ] **Limpieza previa** (se puede hacer ya, sin esperar nada): borrar el código muerto de la sección 4.1.
2. [ ] **Base:** cliente Prisma, `lib/db/`, `lib/domain/`; tipos `Strapi*` renombrados a tipos de dominio en `lib/types/` (hoy los importan `lib/block-domain-ui.ts`, `lib/units/unit-type-*.ts` y `lib/auth/*`). `lib/domain/` ya existe (19 oct): `units/formulas.ts`, `units/varas.ts`, `units/context.ts` (contexto de bloque para el motor), `region.ts` y `geo.ts`, con pruebas en `npm test`. `lib/constants.ts` y `lib/region.ts` quedan como reexportaciones más lo de UI; el antiguo `lib/domain.ts` (etiquetas de UI) pasó a `lib/block-domain-ui.ts`.
3. [ ] **Fachada** `lib/api/client.ts` con la implementación `strapi`; cambiar los imports de la UI de `strapiClient` a la fachada. Producción no nota nada.
4. [ ] Implementación `prisma`, módulo por módulo, en el orden de la sección 4: auth → catálogos → perfiles → proyectos → bloques → unidades → sync → tipo de cambio.
5. [ ] Por cada módulo, recorrer su lista **"debe seguir funcionando"** en staging con `DATA_BACKEND=prisma`.
6. [ ] Linter funcionando (`eslint` instalado) y `tsc --noEmit` limpio en los archivos nuevos; quitar `ignoreBuildErrors`.

**Hecho cuando:** todas las listas "debe seguir funcionando" pasan en staging con `DATA_BACKEND=prisma` y ninguna petición sale hacia Strapi.

Después del corte (fase 8) se borra la implementación `strapi` y, ya sin presión, se simplifica la forma de los datos (quitar `documentId` duplicado, arreglo `unitType`, etc.).

### Fase 6 — Workers (reemplazo de n8n)

Un servicio en Railway (`workers/`) con BullMQ + Redis. La app solo **encola**.

| Workflow n8n hoy | Reemplazo | Notas |
|---|---|---|
| Sync Writeback API (7 webhooks) | Route Handlers en la app + tablas `sync_run*` | Sin `X-Sync-Key` público: sesión y rol. |
| Sync Resolve Targets | Función en la app que arma los jobs | Un job por bloque. |
| Sync Drainer (cada 20 s) | **Desaparece**: BullMQ ya reparte, reintenta y limita concurrencia | Bloques trabados → `stalledInterval`. |
| Sync Block Worker (push) | Worker `warehouse-push` | Usa el mapeador de la fase 4. |
| Sync Pull Block Worker | **Eliminar** (según decisión de fase 0) | O importador explícito con vista previa. |
| Block Edit Queue (contadores) | **Desaparece**: se calcula en la transacción del guardado | Si resultara lento, job con `jobId = blockId` y `delay` para debounce. |
| Banguat Exchange Rate | Worker programado cada 6 h → tabla `exchange_rate` | `/api/exchange-rates` lee la tabla; ya no S3 + caché en memoria. |
| Chat Sessions API | Tabla `chat_session` + Route Handlers | Cuando se trabaje el Copilot. |
| Copilot (Orchestrator 2.2) | **Se queda en n8n por ahora** | Sus herramientas *Search* y *Stats* leen **Strapi**: hay que apuntarlas a la API nueva **antes** de apagar Strapi. |

- [ ] Worker `exchange-rate` (el más simple; sirve para montar la infraestructura).
- [ ] Worker `warehouse-push` con reintentos, concurrencia limitada y bitácora en `sync_run_block`.
- [ ] Endpoints de solo lectura (con API key propia) para las herramientas del Copilot.
- [ ] Respaldos del push: decidir S3 (como hoy) o tabla de respaldo con retención.

Durante esta fase los workers corren en el Railway propio, en **modo sombra**: leen lo mismo que n8n, escriben en sus propios destinos y se comparan. n8n no se toca.

**Hecho cuando:** cada worker lleva al menos una semana en sombra con resultados iguales a los de su workflow de n8n.

### Fase 7 — Corte (lo ejecuta una persona)

Es la **única** fase que cambia producción. La ejecuta una persona con acceso, en una ventana anunciada; el agente solo prepara el runbook, los scripts y las verificaciones.

1. [ ] Ensayo completo en staging: carga (fase 3) + app (fase 5) + workers (fase 6).
2. [ ] Anunciar ventana; **congelar escrituras** en el backoffice actual (modo solo lectura).
3. [ ] Carga final Strapi → Postgres y reporte de conteos.
4. [ ] Desplegar la app nueva en `admin.primeiqlatam.com`.
5. [ ] Apuntar el worker `warehouse-push` al `dbo_stage` real.
6. [ ] Desactivar en n8n: sync (5 workflows), Block Edit Queue, Banguat. Apuntar el Copilot a la API nueva.
7. [ ] Strapi queda **encendido en solo lectura** 2–4 semanas como respaldo consultable.

**Plan de reversa:** si algo crítico falla en los primeros días, se vuelve a apuntar el dominio al backoffice anterior; las escrituras hechas en la app nueva se re-aplican con un script desde `audit_log`.

**Hecho cuando:** una semana de operación normal sin volver a Strapi.

### Fase 8 — Limpieza

- [ ] (Persona con acceso) Apagar Strapi (App Runner) y archivar un respaldo final de la base `strapi`.
- [ ] Borrar `etl/` (o dejar solo el mapeador si vive en `lib/domain`), `.migration/`, `lib/api/strapi.ts`, la implementación `strapi` de la fachada, el proxy `app/api/strapi/`, las rutas `generate-code`, `lib/sync/runs-api.ts`, `lib/server-logger.ts` (parte de `/users/me`), `lib/auth/is-strapi-super-admin.ts`, `verify-strapi-bearer.ts` y la variable `DATA_BACKEND`.
- [ ] Quitar las variables de entorno de la sección 4.13.
- [ ] Retirar de Supabase las tablas de sync (si el Copilot ya no las usa).
- [ ] Revisar el repo hermano `scripts/sync-database`: también habla con Strapi; retirarlo o apuntarlo a Postgres.
- [ ] Actualizar `CLAUDE.md`, `README.md` y `CHANGELOG.md`; `graphify update .`.

**Hecho cuando:** `rg -i strapi` en el código de la app no devuelve nada.

---

## 4. Inventario: qué cambia en cada módulo para dejar Strapi

Medido sobre el código el 15 oct 2026. **53 archivos** importan `lib/api/strapi.ts`; además hay **11 Route Handlers** (todos dependen de Strapi o de n8n) y **4 integraciones** directas con n8n (sync, tipo de cambio, contadores de bloque y Copilot). Ninguna pantalla habla con MySQL: todo pasa por la API REST de Strapi, así que el cambio se concentra en la capa de datos y en la autenticación. Los componentes visuales (`components/ui/`, i18n en `messages/*.json`, tema, tours) **no cambian**.

Para cada módulo: qué pantallas y archivos toca, qué métodos de `strapiClient` usa, qué hace Strapi hoy "gratis" y hay que construir, y la lista de funciones que **deben seguir funcionando** (criterio de aceptación de la fase 5).

### 4.1 Código muerto (borrar antes de empezar)

Nada lo importa ni lo enlaza desde una pantalla viva. Borrarlo reduce el alcance de la migración de 53 a 44 archivos.

| Archivo | Motivo |
|---|---|
| `components/units/editable-units-table.tsx`, `luckysheet-units-table.tsx`, `univer-units-table.tsx`, `units-table.tsx` | Alternativas de la hoja; la viva es `datasheet-units-table.tsx`. Sin imports. |
| `components/projects/projects-table-old.tsx`, `projects-table-advanced.tsx` | Sin imports; la lista usa `projects-table.tsx`. |
| `app/(main)/projects/[id]/page.tsx`, `projects/[id]/edit/page.tsx`, `blocks/[id]/edit/page.tsx` | Rutas huérfanas: solo las enlazan los componentes muertos. Las vivas son `projects/view|edit/[documentId]` y `blocks/view|edit/[id]`. |

Métodos de `strapiClient` **sin ningún consumidor** (no se migran): `register`, `getUnits`, `getUnitById`, `deleteBlock`, `getBlocksCountByProject`, y `getCategories` (solo lo usa una ruta huérfana).

A revisar con negocio:

- **`app/(main)/units/new`** muestra `UnitForm`, que **no guarda nada**. Las unidades se crean desde la hoja. Propuesta: eliminar la pantalla.
- **Catálogo `block-types`** aparece en `CATALOG_TYPES` y en `messages/*.json`, pero no existe tabla `block_types` en la base de Strapi. Verificar si la pantalla falla hoy; propuesta: quitarlo.
- **No se pueden borrar bloques** desde la UI (`deleteBlock` sin uso). Confirmar que es intencional antes de agregarlo en la app nueva.

### 4.2 Transversal: capa de datos, proxy y bitácora

| Hoy | Reemplazo |
|---|---|
| `lib/api/strapi.ts` (~3,250 líneas): interfaces, query-strings de Strapi v5 (`filters`, `populate`, `pagination`), 39 métodos | Fachada `lib/api/client.ts` + `lib/db/<dominio>.ts` (Prisma) + DTOs que devuelven la misma forma. |
| `app/api/strapi/[...path]/route.ts`: proxy cuyo único fin es registrar cada llamada | Desaparece. La bitácora se hace en cada Server Action / Route Handler con el usuario de la sesión; las escrituras van a `audit_log`. |
| `lib/server-logger.ts`: resuelve el correo del usuario llamando a `/users/me` y lo cachea | Se lee de la sesión; sin llamadas extra. |
| Reglas de escritura de Strapi: relaciones por `documentId`, componentes sin `id`, `sanitizeCurrenciesComponentForWrite`, `sanitizeUnitTypeArrayForWrite`, `mergeUnitTypeWithServer`, `stripClientOnlyForeignPriceKeys` | Desaparecen. En su lugar, un esquema Zod por operación que **solo acepta** los campos persistentes (los precios en moneda local y `maintenanceWithoutVATUSD` siguen siendo solo del cliente). |
| Respuestas `{ data, meta }` con `meta.pagination` | Los DTO de listas devuelven `{ data, meta: { pagination } }` igual, para no tocar tablas ni paginadores. |

### 4.3 Autenticación, cuenta y permisos

- **Pantallas:** `(auth)/login`, `(auth)/forgot-password`, `(auth)/reset-password`, `(auth)/register` (solo redirige), `(main)/settings`.
- **Archivos:** `context/AuthContext.tsx`, `lib/auth/auth.ts`, `lib/auth/is-strapi-super-admin.ts`, `lib/auth/verify-strapi-bearer.ts`, `middleware.ts` (hoy no hace nada), `components/main-layout-client.tsx` (guarda en el cliente).
- **Métodos:** `login`, `forgotPassword`, `resetPassword`, `getMe`, `updateMe`, `changePassword`, `logout`, `isAuthenticated`, `getCurrentToken`.
- **Lo que Strapi hace hoy y hay que construir:**
  - Verificar contraseñas bcrypt y emitir el JWT → sesión en cookie httpOnly (Auth.js o Better Auth, proveedor de credenciales).
  - **Enviar el correo de recuperación** con su proveedor de email → token de restablecimiento con expiración + proveedor de correo propio (Resend o SES). Requisito nuevo.
  - Roles (`up_roles`) → enum `role` en `user`; `isSuperAdmin()` deja de adivinar por nombre del rol.
  - Validar el bearer en el servidor contra `/users/me` de Strapi (`isValidStrapiBearer` / `fetchStrapiUserFromBearer`, en **7 Route Handlers**: los 6 de sync y `exchange-rates`) → helper `requireUser()` / `requireRole("super_admin")`.
  - ⚠️ Hoy las dos rutas `generate-code` **no validan al llamante** y usan credenciales de administrador de Strapi por dentro. En la app nueva desaparecen. En el backoffice de producción la corrección le corresponde a su responsable; desde este repo solo se reporta.
- **Debe seguir funcionando:**
  - [ ] Inicio de sesión con correo y contraseña actuales (sin pedir cambio de contraseña si se migran los hash).
  - [ ] Recuperar contraseña por correo y restablecerla con el enlace.
  - [ ] Editar perfil y cambiar contraseña en `/settings`.
  - [ ] Ver/ocultar por rol: tarjeta de endpoint en `/settings`, disparar y detener corridas de sync, archivos de corrida, funciones de super-admin en la hoja de unidades.
  - [ ] Cerrar sesión limpia la caché del tipo de cambio (`DELETE /api/exchange-rates`).
  - [ ] Nuevo: rutas protegidas en el servidor (`middleware.ts`), no solo en el layout.

### 4.4 Catálogos

- **Pantallas:** `(main)/catalogs/[[...slug]]`.
- **Archivos:** `components/catalogs/catalog-table.tsx`, `CATALOG_TYPES` en `lib/api/strapi.ts` (3 grupos: proyectos, bloques, unidades).
- **Métodos:** `getCatalogList`, `getCatalogItem`, `createCatalogItem`, `updateCatalogItem`, `deleteCatalogItem`. También los usan los formularios de proyectos, bloques y la hoja de unidades.
- **Catálogos:** amenidades, países, desarrolladores, NSE, tipos de seguridad, servicios, categorías / enfoques / estados de bloque, tipos de parqueo, topografías, usos de unidad.
- **Lo que Strapi hace hoy y hay que construir:** CRUD genérico por *endpoint* → un mapa `clave de catálogo → modelo Prisma` con un repositorio genérico. Al borrar, Strapi deja vínculos `_lnk` huérfanos; con llaves foráneas hay que **decidir**: impedir el borrado si está en uso (propuesta) o desvincular.
- **Debe seguir funcionando:**
  - [ ] Listar, buscar, paginar, crear, editar y borrar en cada catálogo.
  - [ ] Los selectores de proyectos, bloques y unidades cargan las opciones (hasta 200 por catálogo).
  - [ ] Países con `isoCode2`/`code`: de ellos dependen IVA, cuota y departamentos (`lib/geo.ts`).

### 4.5 Perfiles de tipo de cambio

- **Pantallas:** `exchange-rate-profiles` (lista, `new`, `view/[id]`, `edit/[id]`, `clone/[id]`).
- **Archivos:** `exchange-rate-profiles-table.tsx`, `exchange-rate-profile-form.tsx`.
- **Métodos:** `getExchangeRateProfiles`, `getExchangeRateProfileById`, `createExchangeRateProfile`, `updateExchangeRateProfile`, `deleteExchangeRateProfile`, `getProjects` (para vincular).
- **Lo que Strapi hace hoy y hay que construir:** componente `currencies` con 7 subcomponentes por moneda → tabla `exchange_rate_profile_currency`. Desaparecen `sanitizeCurrenciesComponentForWrite` y el anidado; se conservan `localCurrencyUnitsPerOneUsd` y `normalizeProjectCurrenciesFromExchangeProfile` (pasan a `lib/domain`).
- **Debe seguir funcionando:**
  - [ ] CRUD y clonar perfil.
  - [ ] Tasas de compra y venta con 8 decimales por moneda (GTQ, MXN, PAB, BZD, CRC, NIO, HNL).
  - [ ] Ver los proyectos vinculados a un perfil y navegar a ellos.
  - [ ] Los precios en moneda local de la hoja de unidades usan la tasa del perfil del proyecto.

### 4.6 Proyectos

- **Pantallas:** `projects` (lista), `new`, `view/[documentId]`, `edit/[documentId]`, `clone/[id]`.
- **Archivos:** `projects-table.tsx`, `advanced-filters.tsx`, `project-form.tsx` y sus 7 pestañas en `components/projects/form-tabs/` (`general-info`, `location`, `amenities`, `services`, `financing`, `banks`, `currencies`).
- **Métodos:** `getProjects` (filtros avanzados, búsqueda, orden, paginación), `getProjectById` (lo usan también bloques y la hoja), `createProject`, `updateProject`, más catálogos.
- **Lo que Strapi hace hoy y hay que construir:** la traducción de filtros a query-string de Strapi → un constructor de `where` de Prisma con los mismos filtros; `populate` profundo (país, desarrollador, NSE, amenidades, servicios, perfil) → `include` explícito; relaciones muchos-a-muchos (amenidades, servicios) por `documentId` → tablas puente con FK.
- **Debe seguir funcionando:**
  - [ ] Lista con todos los filtros avanzados actuales, búsqueda, orden y paginación.
  - [ ] Crear, editar y clonar con las 7 pestañas.
  - [ ] Ubicación: país → departamento → municipio según `GEO_BY_ISO`.
  - [ ] Amenidades y servicios (muchos-a-muchos).
  - [ ] Asignar perfil de tipo de cambio; las monedas del proyecto se derivan de él.
  - [ ] Datos de financiamiento y bancos del proyecto.

### 4.7 Bloques

- **Pantallas:** `blocks` (lista), `new`, `view/[id]`, `edit/[id]`, `clone/[id]`; `units` (selector de bloque para abrir la hoja).
- **Archivos:** `blocks-table.tsx`, `block-form.tsx`, `block-financing-card.tsx`, `lib/financing.ts`, `lib/domain.ts` (`BlockDomain`), `lib/block-name.ts`.
- **Métodos:** `getBlocks`, `getBlockById` (también la hoja), `createBlock`, `updateBlock`, `getBlocksLite` (sync), `getProjects`, `getProjectById`, catálogos de bloque.
- **Route Handler:** `app/api/blocks/generate-code/route.ts` hace **login de administrador en Strapi** y llama a `/content-manager/uid/generate` para obtener un código único.
- **Lo que Strapi hace hoy y hay que construir:**
  - Código único (campo `uid`, sin índice único en MySQL) → índice único en Postgres + función de generación (slug + sufijo) dentro de la transacción. Desaparecen la ruta y las credenciales de admin.
  - Financiamiento: 4 tablas encadenadas con el banco en el `field` → `block_bank_rate`.
- **Debe seguir funcionando:**
  - [ ] Lista con filtros por país, región (GAM/Interior por `quarter`) y dominio (vivienda, oficinas, industrial).
  - [ ] Crear, editar y clonar; el código se genera solo y nunca se repite.
  - [ ] Tasas por banco (18 bancos; `0` = no trabaja con ese banco).
  - [ ] Contadores y promedios del bloque (disponibles, totales, precio, tamaño, cuota, ingreso, parqueos) actualizados tras editar unidades.

### 4.8 Hoja de unidades (el módulo más crítico)

- **Pantallas:** `units/list/[id]`.
- **Archivos:** `datasheet-units-table.tsx` (~7,800 líneas), `datasheet-units-table-config.ts`, `lib/domain/units/formulas.ts`, `lib/domain/units/context.ts`, `lib/units/unit-type-dynamic-columns.ts`, `lib/units/unit-type-zone.ts`, `lib/constants.ts`, `lib/region.ts`.
- **Métodos:** `getUnitsAllPages`, `updateUnit` (3 lugares), `updateUnitBatch`, `createUnit`, `getBlockById`, `getProjectById`, `getCatalogList` ×3.
- **Llamadas externas:** `/api/units/generate-code` (login de admin en Strapi, igual que bloques) y el webhook de n8n `block-counter-update` (`NEXT_PUBLIC_BLOCK_COUNTER_WEBHOOK_URL`).
- **Lo que Strapi hace hoy y hay que construir:**
  - Zona dinámica `unitType` (`__component` = `unit-types.housing|offices|industrial`) → tablas 1:1. El DTO **sigue entregando** `unitType: [{ __component, … }]` para que `unit-type-dynamic-columns.ts` no cambie en la fase 5.
  - `updateUnitBatch` campo por campo con "gana el último" y reintentos → **una** acción `saveUnitChanges(blockId, cambios[])` que valida, guarda todo en una transacción y devuelve el resultado por fila.
  - Reintento con el siguiente código libre ante conflicto de `code` → lo resuelve la base dentro de la transacción.
  - Webhook de contadores con debounce de 10 s en n8n → recálculo del bloque en la misma transacción (fase 6).
- **Debe seguir funcionando** (ver `CLAUDE.md`, sección de la hoja):
  - [ ] Carga de todas las unidades del bloque con su tipo (vivienda, oficinas, industrial) y columnas dinámicas según el tipo.
  - [ ] Cascadas: editar un campo recalcula dependientes, los marca en amarillo y lo informa en un toast.
  - [ ] Fórmulas bidireccionales (desde total, desde sin IVA, desde precio por m²) para venta, renta y mantenimiento.
  - [ ] IVA por país, región, categoría y operación (0.916 multiplica, 1.12 divide; SV = 1.0).
  - [ ] Cuota por país (GT 7.5 % / 20 años / 90 %; SV 8 % / 25 años / 85 %).
  - [ ] Vista en m² o varas² (y varas lineales para frente y fondo).
  - [ ] Moneda local editable con conversión de ida y vuelta contra USD.
  - [ ] Conciliación al abrir: diferencias con las fórmulas marcadas y listadas en el diálogo.
  - [ ] Crear unidades nuevas desde la hoja con código único.
  - [ ] Guardado por lote; si una fila falla, las demás no se pierden y el error se ve en la fila.
  - [ ] Funciones exclusivas de super-admin.

### 4.9 Sincronización con el warehouse (`/sync`)

- **Pantallas:** `sync`, `sync/[runId]`.
- **Archivos:** `components/sync/*` (diálogo de nueva corrida, tablas de corridas y bloques, barra de estado, visor de respaldos, botón de detener), `lib/sync/runs-api.ts`.
- **Route Handlers (6):** `api/sync/runs`, `runs/[runId]`, `runs/[runId]/release`, `runs/[runId]/snapshot`, `runs/[runId]/snapshots`, `api/sync/sql-projects`. Todos validan el bearer de Strapi (5 de ellos exigen super-admin) y reenvían a n8n con `lib/sync/runs-api.ts` (`SYNC_API_URL` + `X-Sync-Key`).
- **Métodos:** `getBlocksLite` (elegir bloques para la corrida).
- **Lo que n8n hace hoy y hay que construir:** ver la tabla de la fase 6. Las corridas pasan de Supabase a `sync_run` / `sync_run_block` en Postgres; el progreso, de Redis a la propia cola BullMQ; `sql-projects` se lee directo de `dbo_stage` con Prisma.
- **Debe seguir funcionando:**
  - [ ] Crear corrida de push por dominio, por selección de bloques o todo, con opción *force*.
  - [ ] Solo una corrida activa a la vez (hoy n8n responde 409).
  - [ ] Progreso en vivo por bloque y por fase; detener y liberar corridas.
  - [ ] Ver y descargar los respaldos (snapshots) de cada bloque.
  - [ ] Listar los proyectos que existen en el warehouse.
  - [ ] Pull: **según la decisión de la fase 0** (eliminar o reemplazar por un importador con vista previa).

### 4.10 Tipo de cambio en vivo (barra lateral)

- **Archivos:** `components/exchange-rate-sidebar.tsx`, `lib/exchange-rates.ts`, `app/api/exchange-rates/route.ts` (GET con caché en memoria; DELETE al cerrar sesión).
- **Hoy:** webhook de n8n (`EXCHANGE_RATES_WEBHOOK_URL`) que sirve un histórico guardado en S3, raspado de Banguat cada 6 h.
- **Reemplazo:** worker programado → tabla `exchange_rate`; la ruta lee la tabla (la caché en memoria y el DELETE dejan de ser necesarios).
- **Debe seguir funcionando:**
  - [ ] Tasa del día (compra y venta) e histórico paginado.
  - [ ] Si Banguat no responde, se sigue mostrando el último dato conocido.

### 4.11 Copilot

- **Pantallas:** `copilots`, `copilots/c/[id]`.
- **Archivos:** `components/copilots/*`, `lib/copilot/*`, `app/api/copilot/n8n-chat/route.ts` (proxy al Chat Trigger).
- **Dependencia con Strapi:** la app no llama a Strapi para el Copilot, pero el **agente en n8n sí** (herramientas *Search* y *Stats*). Las sesiones de chat van a n8n → Supabase.
- **Alcance en esta migración:** solo lo mínimo para que no se rompa al apagar Strapi: endpoints de solo lectura (con API key) que reemplacen lo que las herramientas consultan en Strapi. El resto queda en espera (decisión 2 del README).
- **Debe seguir funcionando:**
  - [ ] Conversaciones, historial y renombrado de sesiones.
  - [ ] Respuestas con búsquedas y estadísticas de proyectos, bloques y unidades.

### 4.12 Sin cambios

- **Dashboard** (`(main)/dashboard`): no consulta el backend.
- **UI base** (`components/ui/`), tema, i18n (`messages/es.json` y `en.json`), tours de onboarding, navegación lateral y barra superior.

### 4.13 Variables de entorno

| Se eliminan al terminar | Se agregan |
|---|---|
| `NEXT_PUBLIC_STRAPI_URL`, `STRAPI_USERNAME`, `STRAPI_PASSWORD` | `DATABASE_URL_APP` (Postgres de la app, esquema `msp_app`; hoy el ETL usa las credenciales de `DATABASE_URL_DBO_STAGE` si falta) |
| `NEXT_PUBLIC_BLOCK_COUNTER_WEBHOOK_URL` | `REDIS_URL` (cola de workers) |
| `SYNC_API_URL`, `SYNC_API_KEY` | `AUTH_SECRET` (sesiones) |
| `EXCHANGE_RATES_WEBHOOK_URL` | Llave del proveedor de correo (Resend o SES) |
| — | `STAGE_DATABASE_URL` (solo workers: `dbo_stage`) |
| — | `DATA_BACKEND` (solo durante la migración) |

Se quedan mientras el Copilot siga en n8n: `NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL` / `N8N_CHAT_WEBHOOK_UPSTREAM_URL`.

### 4.14 Mapa de los 39 métodos de `strapiClient`

| Grupo | Métodos | Destino |
|---|---|---|
| Auth (10) | `login`, `register`, `forgotPassword`, `resetPassword`, `getMe`, `updateMe`, `changePassword`, `logout`, `isAuthenticated`, `getCurrentToken` | `lib/auth/` (sesión). `register` no se migra. |
| Proyectos (5) | `getProjects`, `getProjectById`, `createProject`, `updateProject`, `getBlocksCountByProject` | `lib/db/projects.ts`. El último no se migra. |
| Bloques (6) | `getBlocks`, `getBlocksLite`, `getBlockById`, `createBlock`, `updateBlock`, `deleteBlock` | `lib/db/blocks.ts`. `deleteBlock` no se migra (sin uso). |
| Unidades (6) | `getUnits`, `getUnitsAllPages`, `getUnitById`, `updateUnit`, `updateUnitBatch`, `createUnit` | `lib/db/units.ts` → `listUnitsByBlock`, `saveUnitChanges`. `getUnits` y `getUnitById` no se migran. |
| Perfiles (5) | `getExchangeRateProfiles`, `getExchangeRateProfileById`, `createExchangeRateProfile`, `updateExchangeRateProfile`, `deleteExchangeRateProfile` | `lib/db/exchange-rate-profiles.ts`. |
| Catálogos (6) | `getCatalogList`, `getCatalogItem`, `createCatalogItem`, `updateCatalogItem`, `deleteCatalogItem`, `getCategories` | `lib/db/catalogs.ts` (genérico). `getCategories` no se migra. |
| Constructor (1) | `constructor` | — |

---

## 5. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| IDs del warehouse divergen entre `dbo_stage` y los dos `dbo` | Fase 0: clave estable propia; nunca autoincrementos del warehouse. |
| El push nuevo produce valores distintos a n8n (redondeo, factores) | Prueba de paridad en la fase 4 y semana de corrida en paralelo. |
| Fórmulas divergen entre app, carga y push | Una sola copia en `lib/domain/` con pruebas; el ETL la importa. |
| Escrituras en Strapi durante la migración | Carga idempotente que se repite hasta el corte; congelamiento en la fase 7. |
| El Copilot deja de funcionar al apagar Strapi | Endpoints de solo lectura listos en la fase 6, antes del corte. |
| Tocar bases compartidas por error | Usuarios de solo lectura; nunca `migrate`/`db push` contra `strapi`, `dbo_stage` ni `dbo`. |
| Railway no alcanza el RDS | Fase 0: IP fija o túnel antes de construir los workers. |

---

## 6. Orden inmediato

1. Responder la fase 0 (al menos identidad de filas, pull y red) y los puntos "a revisar con negocio" de la sección 4.1.
2. Borrar el código muerto de la sección 4.1 en este repo (no afecta producción) y reportar al responsable del backoffice el hueco de las rutas `generate-code`.
3. Cerrar la fase 1 con `strapi:check`.
4. Diseñar el esquema nuevo (fase 2) en paralelo con el cliente de `dbo_stage` (fase 4, primer punto).
