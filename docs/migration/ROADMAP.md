# Roadmap: de Strapi + n8n a Next.js + Prisma + workers

Plan general para dejar de usar Strapi como backend, reemplazar n8n donde aporta complejidad sin valor y terminar con un repositorio que una sola persona pueda mantener. Complementa a [`README.md`](./README.md) (contexto, inventario de tablas y decisiones ya tomadas); aquí está el **orden de trabajo**.

> Responder siempre en **español**. Antes de explorar código, `graphify query "<pregunta>"`; después de modificar código, `graphify update .`.

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
2. **Reglas de negocio puras y probadas.** Fórmulas, IVA, cuota, varas, región: funciones sin I/O en `lib/domain/`, con pruebas. Una sola copia en todo el repo (hoy hay dos: app y `.migration/`).
3. **Un worker solo si hace falta.** Si algo se puede hacer en la transacción del guardado en menos de un segundo, se hace ahí. Los workers son para trabajo lento, programado o que habla con sistemas externos.
4. **Escritura validada en el servidor.** Server Actions / Route Handlers con Zod y verificación de sesión y rol en cada uno (no basta el layout).
5. **El esquema es la documentación.** Llaves foráneas reales, enums de Postgres, índices únicos donde hay unicidad de negocio (`code`, `document_id`).
6. **Mismo repo, dos procesos.** La app (Vercel) y los workers (Railway) comparten `lib/` y el cliente Prisma; se despliegan desde el mismo repositorio con entradas distintas.
7. **Cada fase es reversible hasta el corte.** Strapi sigue siendo la fuente de verdad hasta la fase 7; todo lo anterior se puede tirar y repetir.

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
- [ ] **Dónde vive la app nueva:** este repo (reemplazando el backoffice) o uno nuevo. Recomendación: **este repo**, reemplazando módulo por módulo; evita mantener dos UIs.

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

- [ ] Escribir el esquema y la primera migración en una base Postgres **nueva** (nunca sobre `dbo`).
- [ ] Decidir qué campos calculados se **guardan** (para el warehouse y reportes) y cuáles se calculan al leer.

**Hecho cuando:** el esquema migra limpio en una base vacía y un revisor puede entender el modelo sin leer Strapi.

### Fase 3 — Carga inicial Strapi → Postgres nuevo

Script en `etl/src/load/`, **idempotente** (se puede correr N veces; hace upsert por `publicId`).

- [ ] Orden: catálogos → desarrolladores → perfiles de tipo de cambio → proyectos → bloques (+ financiamiento) → unidades (+ tipo) → usuarios.
- [ ] Solo filas publicadas; unidades huérfanas (~673) a un reporte, no a la base.
- [ ] Unidades paginadas por cursor (`id > último`, lotes de ~2,000); `units_cmps` resuelto por lotes según `component_type`.
- [ ] Al cargar cada unidad, **recalcular** los campos de fórmula con `lib/domain` y reportar las diferencias contra lo guardado en Strapi (sustituye a `.migration/`).
- [ ] Reporte final: conteos por tabla Strapi vs Postgres, huérfanos, diferencias de fórmulas.

**Hecho cuando:** dos corridas seguidas dejan la base idéntica y los conteos cuadran con `strapi:check`.

### Fase 4 — Push al warehouse con paridad (reemplaza al Sync Block Worker)

Mientras Strapi siga vivo, el push lee de Strapi; después del corte, de Postgres. La lógica de mapeo es la misma (`README.md` §5).

- [ ] Cliente Prisma de `dbo_stage` en `etl/prisma/stage/` con `db pull` (solo lectura al inicio).
- [ ] Mapeador puro `lib/domain/warehouse-mapper.ts`: bloque + unidades → filas `housing_universe`, `housing_units`, `housing_amenities`, `banking_info` (y equivalentes de oficinas/industrial).
- [ ] **Prueba de paridad:** para N bloques, la salida del mapeador debe coincidir celda por celda con lo que n8n ya dejó en `dbo_stage`. Atención a redondeo de `Decimal`, textos recortados a 50/20 y `NULL` en columnas `_qtz`.
- [ ] Escritura por bloque en una transacción (borrar e insertar unidades, como hoy), con respaldo previo (S3 o tabla de respaldo).

**Hecho cuando:** la prueba de paridad pasa en todos los bloques de un dominio y el push nuevo corre en paralelo a n8n sin diferencias durante una semana.

### Fase 5 — App Next.js sobre Prisma

Reemplazo módulo por módulo, del más simple al más complejo. Cada módulo pasa de `strapiClient` a `lib/db/*` y se prueba contra el Postgres cargado en la fase 3.

1. [ ] **Base:** cliente Prisma, `lib/db/`, `lib/domain/` (mover ahí `lib/units/formulas.ts`, `lib/region.ts`, `lib/geo.ts`, `lib/constants.ts`).
2. [ ] **Auth:** sesión en cookie httpOnly (Auth.js o Better Auth) con credenciales y bcrypt; `middleware.ts` protege rutas de verdad; roles desde la base. Se elimina el JWT en `localStorage`.
3. [ ] **Catálogos** (`catalogs/[[...slug]]`).
4. [ ] **Perfiles de tipo de cambio.**
5. [ ] **Desarrolladores y proyectos.**
6. [ ] **Bloques** (con financiamiento).
7. [ ] **Hoja de unidades** (`datasheet-units-table`): mismas cascadas y fórmulas, guardado por lote en **una transacción**; el código único lo resuelve la base; los contadores del bloque se recalculan en esa misma transacción.
8. [ ] **Pantalla /sync** apuntando a las tablas nuevas y a la cola de workers.
9. [ ] Unificar rutas (`[id]` vs `[documentId]`) y borrar las tablas de unidades alternativas.
10. [ ] Linter funcionando (`eslint` instalado) y `tsc --noEmit` limpio en los archivos nuevos; quitar `ignoreBuildErrors`.

**Hecho cuando:** todo el backoffice funciona contra Postgres en un entorno de staging sin ninguna llamada a Strapi.

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

**Hecho cuando:** cada workflow reemplazado puede desactivarse en n8n sin que nada falle.

### Fase 7 — Corte

1. [ ] Ensayo completo en staging: carga (fase 3) + app (fase 5) + workers (fase 6).
2. [ ] Anunciar ventana; **congelar escrituras** en el backoffice actual (modo solo lectura).
3. [ ] Carga final Strapi → Postgres y reporte de conteos.
4. [ ] Desplegar la app nueva en `admin.primeiqlatam.com`.
5. [ ] Desactivar en n8n: sync (5 workflows), Block Edit Queue, Banguat. Apuntar el Copilot a la API nueva.
6. [ ] Strapi queda **encendido en solo lectura** 2–4 semanas como respaldo consultable.

**Plan de reversa:** si algo crítico falla en los primeros días, se vuelve a apuntar el dominio al backoffice anterior; las escrituras hechas en la app nueva se re-aplican con un script desde `audit_log`.

**Hecho cuando:** una semana de operación normal sin volver a Strapi.

### Fase 8 — Limpieza

- [ ] Apagar Strapi (App Runner) y archivar un respaldo final de la base `strapi`.
- [ ] Borrar `etl/` (o dejar solo el mapeador si vive en `lib/domain`), `.migration/`, `lib/api/strapi.ts`, el proxy, las rutas `generate-code`, `lib/auth/is-strapi-super-admin.ts`, `verify-strapi-bearer.ts`.
- [ ] Retirar de Supabase las tablas de sync (si el Copilot ya no las usa).
- [ ] Revisar el repo hermano `scripts/sync-database`: también habla con Strapi; retirarlo o apuntarlo a Postgres.
- [ ] Actualizar `CLAUDE.md`, `README.md` y `CHANGELOG.md`; `graphify update .`.

**Hecho cuando:** `rg -i strapi` en el código de la app no devuelve nada.

---

## 4. Riesgos principales

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

## 5. Orden inmediato

1. Responder la fase 0 (al menos identidad de filas, pull y red).
2. Cerrar la fase 1 con `strapi:check`.
3. Diseñar el esquema nuevo (fase 2) en paralelo con el cliente de `dbo_stage` (fase 4, primer punto).
