# Migración de los workflows de n8n

Documento de trabajo para el agente (o la persona) que **migra los workflows de n8n** a un servicio propio. Otro agente migra en paralelo **los módulos del sitio web** (proyectos, bloques, unidades, perfiles, cuenta) siguiendo [`README.md`](README.md) §14. Este documento dice qué hace hoy cada workflow, con qué sistemas habla, qué lo reemplaza, quién es dueño de cada pieza y cómo coordinarse con el otro agente.

Creado el 28 oct 2026. Fuentes: [`docs/manual-del-sistema.md`](../manual-del-sistema.md) (sección «Integraciones (n8n)», líneas 1760–1955; contratos de cada webhook, líneas 6612–7458; diagramas de secuencia, 7458–7800), [`ROADMAP.md`](ROADMAP.md) (fase 6 y §4.9–4.11) y el inventario de producción de la skill `proteger-produccion`.

---

## 0. Antes de empezar

1. Cumplir la sección **«0. Lectura obligatoria»** de [`README.md`](README.md): la skill [`proteger-produccion`](../../.agents/skills/proteger-produccion/SKILL.md), su [inventario](../../.agents/skills/proteger-produccion/inventario-produccion.md), [`ROADMAP.md`](ROADMAP.md) y el README completo. Este documento no la reemplaza.
2. Responder en español. Antes de explorar código, `graphify query "<pregunta>"`; después de modificarlo, `graphify update .`.
3. **Para retomar el trabajo**, leer en este orden: el bloque «Traspaso» al inicio de la §7 (dónde quedó todo y qué sigue), la entrada más reciente de la bitácora (§8), la §6 (lo que hay que preguntarle al usuario) y la §9 (cómo correr cosas en esta máquina sin tropezar).

**Todo n8n es producción.** Mientras dure la migración, los 9 workflows siguen corriendo igual y nadie debe notar que existimos. Reglas que aplican en especial a este trabajo:

- **Nunca** llamar un webhook de n8n con `POST` (incluidos `block-counter-update`, `primeiq/sync/writeback` y los de sesiones de chat). Solo se permite el `GET` público del tipo de cambio, para comparar.
- **Nunca** usar `SYNC_API_KEY`, `STRAPI_USERNAME`/`STRAPI_PASSWORD` ni tokens de Strapi. No están en el `.env` y no deben agregarse (decisión 15 del README).
- Del repo `n8n-manager`, **solo leer** los JSON exportados. Nunca `scripts/n8n-sync.js push` ni `activate`.
- No escribir en Supabase, en el Redis de Coolify ni en el bucket S3 `n8n-primeiqlatam`. No reiniciar ni editar contenedores en Coolify.
- El push nuevo escribe **solo** en el `dbo_stage` del Postgres de staging, **solo** en las 11 tablas del warehouse y nunca en las `sec_*` (decisión 9 del README, §11). El `dbo_stage` y el `dbo` de MySQL, y el `dbo` de Postgres de producción, solo se leen.
- Patrón **sombra**: el reemplazo lee la misma entrada que n8n, escribe en un destino propio y se compara contra lo que produjo n8n. Apagar un workflow es parte del corte (fase 7) y lo hace una persona.

---

## 1. Reparto del trabajo entre los dos agentes

| Pieza | Dueño | Notas |
|---|---|---|
| Servicio de workers (`workers/`, BullMQ, Redis, despliegue en Railway) | **Workflows** | No existe todavía (§6). |
| Sincronización con el warehouse: mapeador, push sombra, corridas, `sync_run*`, `/sync` y `app/api/sync/*` | **Workflows** | `ROADMAP.md` fase 4, fase 6 y §4.9. Incluye la pantalla `/sync`, porque es la cara de esos workflows. |
| Tipo de cambio: worker Banguat, tabla `exchange_rate`, `app/api/exchange-rates/route.ts`, `lib/exchange-rates.ts` | **Workflows** | `ROADMAP.md` §4.10. La forma de la respuesta de la ruta no cambia (la consume `components/exchange-rate-sidebar.tsx`). |
| **Cálculo** de contadores y promedios del bloque (función pura) | **Workflows** | Reemplaza a Block Edit Queue. Vive en `lib/domain/` (§3, workflow 6). |
| **Llamada** a ese cálculo dentro del guardado de unidades | **Módulos** | Va en la acción de guardado de la hoja (`saveUnitChanges`, `ROADMAP.md` §4.8). El agente de workflows entrega la función y sus pruebas; el de módulos la llama. |
| Endpoints de solo lectura para las herramientas del Copilot | **Workflows** | Antes del corte (§3, workflow 9). |
| Copilot y sesiones de chat | En espera | Decisión 2 del README: se quedan en n8n por ahora. |
| Proyectos, bloques, unidades, perfiles, cuenta, catálogos | **Módulos** | README §14 y `ROADMAP.md` §4.3–4.8. |

Si una tarea no cae claramente en ninguna fila, preguntarle al usuario antes de empezarla.

## 2. Reglas de coordinación

Los dos agentes trabajan en el mismo repo y la misma base `msp_app`. Lo que se comparte, y cómo no pisarse:

- **Ramas.** Cada agente en su propia rama, que sale de `main` (el usuario fusionó ahí `feat/data-facade` con los PR [#9](https://github.com/Admin-PrimeIQ/marketscanprime/pull/9), [#10](https://github.com/Admin-PrimeIQ/marketscanprime/pull/10) y [#11](https://github.com/Admin-PrimeIQ/marketscanprime/pull/11) el 29 oct). La rama de este agente es **`jc_migrate_workflowsn`**. Ningún agente hace commit, `git push` ni merge: el usuario hace los commits. Un merge a `main` despliega `admin.primeiqlatam.com`: el código de la migración tiene que seguir apagado ahí (backend `strapi`, guardas de `lib/db/guard.ts`).
- **`prisma/schema.prisma` y migraciones (lo más delicado).** Las migraciones se generan con `migrate diff --from-config-datasource`, que compara **la base real** contra **tu** `schema.prisma`. Si el otro agente ya aplicó una migración que tu rama todavía no tiene, tu diff incluirá un `DROP` de sus tablas o columnas. Por eso:
  1. antes de generar una migración, traer a tu rama el `schema.prisma` y las carpetas de `prisma/migrations/` del otro agente (pedírselo al usuario si no están commiteadas);
  2. revisar línea por línea que el SQL **solo** traiga lo tuyo: ningún `DROP`, y nada que mencione `dbo_stage` ni `dbo`;
  3. aplicar con `npm run app:deploy` desde `etl/`, solo con confirmación del usuario, y avisar en la bitácora (§8) qué migración quedó aplicada.
  Los modelos `SyncRun`, `SyncRunBlock` y `ExchangeRate` ya existen (§5): extenderlos es tarea de este agente; los demás modelos, del otro.
- **`lib/domain/`.** Reglas puras compartidas (fórmulas, varas, contexto del bloque). Si el mapeador del warehouse o los contadores necesitan cambiar una regla existente, no se cambia en silencio: afecta a la hoja de unidades. Agregar archivos nuevos (p. ej. `lib/domain/warehouse/`, `lib/domain/blocks/counters.ts`) no choca.
- **Versión y `CHANGELOG.md`.** Ambos agentes suben la versión de `package.json` y escriben en `CHANGELOG.md`, así que chocan seguido. Al juntar ramas, el usuario decide el número final; cada entrada nombra los archivos que toca.
- **Documentos.** Este agente escribe su avance en **este** archivo (§7 y §8) y marca las casillas de la fase 4 y la fase 6 en `ROADMAP.md`. El README principal (§14) es del agente de módulos; aquí solo se agrega una línea en su §6 o §8 cuando algo de los workflows cambie el estado general.
- **Variables de entorno.** Las nuevas van en el `.env` único de la raíz (decisión 15) y en `.env.staging.example`, nunca en archivos `.env` aparte. Ninguna apunta a n8n, Strapi ni a una URL de producción con permisos de escritura.

---

## 3. n8n hoy

Instancia `https://n8n.primeiqlatam.com`, en Docker sobre un EC2 (AWS us-east-1) administrado con Coolify. Redis corre al lado, en la red privada de Docker. Los JSON de los workflows viven en el repo [`Admin-PrimeIQ/n8n-manager`](https://github.com/Admin-PrimeIQ/n8n-manager) (no está clonado en esta máquina al 28 oct).

```text
                         Backoffice (este repo / admin.primeiqlatam.com)
          ┌────────────────┬──────────────────┬──────────────────┬───────────────┐
          │ /sync          │ hoja de unidades │ barra tipo cambio│ /copilots     │
          ▼                ▼                  ▼                  ▼
   Sync Writeback API   Block Edit Queue   Banguat Exchange   Chat Sessions API
   (7 webhooks,         (webhook público)  Rate (GET público) Copilot 2.2 (chat)
    X-Sync-Key)               │                  │                  │
          │                   │ Redis            │ S3 + banguat     │ OpenAI, Supabase,
          ▼                   ▼                  │                  │ Strapi (lectura)
   Resolve Targets ◄── Drainer (cada 20 s)       │                  │
                          │         │            └──────────────────┘ (el Copilot
                          ▼         ▼                                  consulta el
                  Block Worker   Pull Block Worker                     tipo de cambio)
                  Strapi → MySQL  MySQL → Strapi
```

**Credenciales guardadas en n8n** (manual, línea 1943):

| Credencial | Tipo | La usan |
|---|---|---|
| `Strapi API` | Token de Strapi | Sync |
| `MySQL Warehouse` | MySQL | Sync (push y pull), listado de proyectos SQL |
| `Supabase` | Postgres | Sync, Chat Sessions, memoria del Copilot |
| `Redis Coolify` | Redis | Sync, Block Edit Queue |
| `AWS Account` | S3 | Sync, Banguat |
| `Sync API Auth` | Header `X-Sync-Key` | Webhooks de Sync Writeback API |
| `Prime IQ - OpenAi` | OpenAI | Copilot 2.2 |

**Dónde lo llama este repo** (con el backend `prisma` estas URLs quedan vacías o la ruta responde 503, salvo el `GET` del tipo de cambio):

| Código | Workflow | Variable |
|---|---|---|
| `lib/sync/runs-api.ts`, `app/api/sync/*` (6 rutas) | Sync Writeback API | `SYNC_API_URL`, `SYNC_API_KEY` |
| `components/units/datasheet-units-table.tsx` | Block Edit Queue | `NEXT_PUBLIC_BLOCK_COUNTER_WEBHOOK_URL` (trae la de producción por defecto) |
| `lib/exchange-rates.ts`, `app/api/exchange-rates/route.ts` | Banguat Exchange Rate | `EXCHANGE_RATES_WEBHOOK_URL` (trae la de producción por defecto) |
| `lib/copilot/constants.ts`, `lib/copilot/primeiq-chat-session-api.ts`, `app/api/copilot/n8n-chat/route.ts` | Copilot y Chat Sessions | `NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL`, `N8N_CHAT_WEBHOOK_UPSTREAM_URL` |

Las URLs por defecto de producción se anulan con el backend `prisma` en `productionN8nDefault` (`lib/api/data-backend.ts`). El repo hermano `scripts/sync-database` también llama a `block-counter-update`.

---

## 4. Los 9 workflows

Cada ficha: qué hace hoy, quién lo llama, contrato, reemplazo y criterio de «hecho». Los contratos completos (cuerpos, respuestas y códigos) están en el manual; las líneas se indican en cada ficha. **No copiar aquí las URLs con identificadores de los webhooks**: son de producción.

### Grupo A: sincronización con el warehouse (5 workflows)

Hoy: Strapi → `dbo_stage` MySQL (push) y `dbo_stage` MySQL → Strapi (pull), con la bitácora en Supabase, el progreso y los candados en Redis, y los respaldos en S3. De `dbo_stage` a `dbo` se promueve a mano y eso no cambia (decisión 7).

#### 1. [Prime IQ] Sync Writeback API · `ULurOzOGSpgNlRyY`

- **Hoy:** puerta de entrada. 7 webhooks con `X-Sync-Key`: lanzar corrida (`POST writeback`), listar corridas, ver una, liberarla, listar y bajar respaldos, y listar proyectos del warehouse. Crea la corrida en Supabase (409 si ya hay una activa), responde 202 con `runId` y dispara Resolve Targets.
- **Lo llama:** `lib/sync/runs-api.ts` desde las 6 rutas de `app/api/sync/` (validan el bearer de Strapi; 5 exigen super-admin).
- **Contrato:** manual, líneas 6614–7016 (`writeback`, `runs`, `runs/{runId}`, `release`, `snapshots`, `snapshot`, `sql/projects`). Estados: `resolving`, `running`, `completed`, `completed_with_skips`, `failed`, `aborted`.
- **Reemplazo:** las mismas 6 rutas, ahora sobre `msp_app.sync_run` / `sync_run_block` con `requireRole` (sin `X-Sync-Key` público). `sql-projects` lee el warehouse directo con Prisma. Las rutas deben devolver la misma forma que hoy para que `components/sync/*` no cambie. Hoy, con el backend `prisma`, responden 503 (`lib/sync/prisma-unavailable.ts`).
- **Hecho cuando:** la lista «debe seguir funcionando» de `ROADMAP.md` §4.9 pasa en staging.

#### 2. [Prime IQ] Sync Resolve Targets · `bpLA8t0B6vr7Qq7f`

- **Hoy:** sub-workflow. Push: pagina los bloques de Strapi del dominio y salta `legacyId` duplicados. Pull: lee el universo del warehouse y lo parte en tres fases (catálogos, proyectos, bloques). Inserta en `sync_run_blocks` y pasa la corrida a `running`.
- **Reemplazo:** función de la app que arma los jobs (uno por bloque) al crear la corrida. Con la app como fuente, lee los bloques de `msp_app`, no de Strapi (mientras Strapi siga vivo, el push sombra lee el espejo de `msp_app` que deja el ETL).

#### 3. [Prime IQ] Sync Drainer · `nnG8jsmOmPkBks7c`

- **Hoy:** cron cada 20 s. Toma la corrida activa más antigua, reinicia bloques trabados más de 35 min, reintenta la resolución (máximo 5), aborta si más del 20 % falla la protección de vaciado y reparte hasta 20 pendientes de la fase más baja.
- **Reemplazo:** **desaparece**. BullMQ reparte, reintenta y limita concurrencia; los trabados se cubren con `stalledInterval`. Conservar las dos reglas de negocio: la protección de vaciado (abortar si más del 20 % falla) y el orden por fase.

#### 4. [Prime IQ] Sync Block Worker (push) · `yBuM3XVk36DwRgbs`

- **Hoy:** reclama el bloque en Supabase, lee bloque (con financiamiento) y unidades de Strapi, respalda en S3 las filas actuales del warehouse y, en una transacción, escribe universo, unidades (borra e inserta), amenidades, servicios y `banking_info`. Guarda el resultado en S3.
- **Mapeo:** README §5 y `FORMULAS.md` (varas × 1.4342 / 1.1976, `_qtz` con la tasa de compra del perfil, textos recortados a 50/20, «Si»/«No», período `2026 - 2T`). Los factores de varas del warehouse **difieren a propósito** de los de la hoja: no unificarlos.
- **Reemplazo:** mapeador puro (propuesta: `lib/domain/warehouse/`) + worker `warehouse-push` que escribe en la copia sombra (`dbo_stage` del Postgres de staging). El SQL cambia por las diferencias de Postgres: `id` `IDENTITY ALWAYS`, columnas con eñe entre comillas dobles, amenidades `boolean`, industrial con `char(64)` y `real` (README §11.4).
- **Hecho cuando:** la prueba de paridad pasa celda por celda contra lo que n8n dejó en el `dbo_stage` de MySQL, para todos los bloques de un dominio, y el push sombra corre una semana junto a n8n sin diferencias (`ROADMAP.md` fase 4).
- **Bloqueado por:** acceso de lectura al warehouse MySQL (`npm run warehouse:ping` nunca corrió con éxito, README §13.3) y la identidad de filas (§6).

#### 5. [Prime IQ] Sync Pull Block Worker · `t2Sqx3pvDRuhBAdF`

- **Hoy:** del warehouse a Strapi en tres fases: busca o crea el catálogo, busca o crea el proyecto (con amenidades y servicios), crea o actualiza el bloque y aplica altas, cambios y **bajas** de unidades. Copia `cuota` e `ingresos` tal cual: es el origen de las ~85 mil cuotas legacy que no siguen la regla de la hoja (README §12.8).
- **Riesgo:** no tiene reversa y borra del CRM las unidades que no estén en el warehouse.
- **Reemplazo:** **sin decidir** (fase 0). Propuesta del `ROADMAP.md`: eliminarlo, o cambiarlo por un importador explícito con vista previa. No construir nada hasta que el usuario lo decida.

### Grupo B: contadores de bloque (1 workflow)

#### 6. Block Edit Queue (webhook + Redis debounce) · `VXpCCQ78qLYcR4r9`

- **Fuente:** el usuario lo exportó desde n8n el 29 oct (no está en `n8n-manager`). El JSON **no se guarda en el repo**: trae escrito en dos nodos el token de la API de Strapi de producción. Rotarlo lo decide quien administra producción.
- **Hoy:** webhook público `POST /webhook/block-counter-update` con `{ blockId, skipSync? }`.
  1. Si `skipSync` es `true`, salta directo al cálculo.
  2. Si no, pone el aviso arriba de una lista en Redis (`blockqueue:<blockId>`), espera 10 s y relee: si su aviso ya no está arriba, responde `skipped` (un aviso más nuevo hará el cálculo). La lista nunca se limpia ni vence.
  3. Lee de Strapi todas las unidades del bloque (de 100 en 100, por `documentId` o por `id` numérico).
  4. Calcula (nodo "Compute counters") y hace `PUT /api/blocks/<blockId>` con el resultado.
  5. Si el `PUT` falla, también responde `skipped`: un error no se distingue de un aviso descartado.
  - Tiene un "Schedule Trigger" suelto, sin conexiones: no corre.
- **Reglas del cálculo** (copiadas tal cual en `lib/domain/blocks/counters.ts`):
  - cuenta todas las unidades, disponibles o no; disponible = `availability` `Available` (o `available`);
  - tamaño de la unidad = `unitSizeM2`, y si es 0 o falta, `totalSizeM2`;
  - `totalM2` y `availableM2` suman ese tamaño; `averageSizeM2` = `totalM2 / totalUnits`, incluidas las de 0 m²;
  - `averagePriceUSD`, `averagePricePerM2USD`, `averageInstallmentUSD` y `averageIncomeUSD` promedian solo valores > 0; sin ninguno, `null`;
  - `assignedParking` = suma de `parkingSpaces`;
  - lo que no es número cuenta como 0; m² y promedios con `Math.round(x * 100) / 100`.
- **Lo llaman:** la hoja de unidades después de guardar (con el `documentId`) y `scripts/sync-database` después de un push de unidades. El ejemplo guardado en el JSON trae `blockId: "1310"` enviado con axios: el CLI manda el `id` numérico, y en Strapi v5 ese `PUT` probablemente falla (sin confirmar; no se llama a Strapi ni a n8n para comprobarlo). La paridad lo respalda: casi todos los bloques del warehouse nunca se recalcularon.
- **Reemplazo (hecho el 29 oct, v1.36.0):**
  - `computeBlockCounters` en [`lib/domain/blocks/counters.ts`](../../lib/domain/blocks/counters.ts), pura. Sus pruebas incluyen el código del nodo de n8n copiado tal cual y exigen el mismo resultado en 2,000 bloques al azar.
  - `lockBlockForUpdate` y `recalculateBlockCounters(tx, blockId, actor)` en [`lib/db/block-counters.ts`](../../lib/db/block-counters.ts): bloquean la fila del bloque, leen sus unidades, calculan y escriben las 10 columnas con su fila en `audit_log`, en la transacción de quien llama. Si nada cambió, no escriben.
  - **Decisión del usuario (29 oct):** recalcular en la misma transacción del guardado, sin cola. Pasar a BullMQ (`jobId = blockId` con retraso, que junta los guardados del mismo bloque) solo si el recálculo pasa de 500 ms o cuando exista el servicio de workers. Medido el 29 oct en `msp_app`: unidades por bloque mediana 78, p95 474, máximo 4,467; en el más grande, ~300 ms leyendo desde una PC fuera de Railway y ~5 ms calculando.
- **Paridad** (`npm run counters:parity` en `etl/`, solo lectura, 29 oct): de 1,688 bloques, 1,102 iguales. Nacidos en el backoffice: 199 de 204 iguales; los 5 restantes se explican sin tocar la fórmula (2 sin unidades, 2 con una unidad borrada después del último cálculo, 1 nunca calculado). Del warehouse: 903 de 1,484; de los 573 distintos, 482 tienen `total_units` vacío (n8n nunca los escribió y sus promedios vienen del warehouse), 71 tienen promedios del warehouse y 20 un total desactualizado.
- **Hecho cuando:** la función coincide con lo guardado donde n8n sí recalculó (cumplido, ver paridad) y el agente de módulos la llama dentro de `saveUnitChanges`. **Pendiente de decidir en el corte:** recalcular de una vez los ~580 bloques del warehouse o dejar que se actualicen al guardar; lo primero cambia los promedios que el push copia al warehouse.

### Grupo C: tipo de cambio (1 workflow)

#### 7. Banguat Exchange Rate · `Vr3vL5F0x9B04wEt`

- **Hoy:** cron cada 6 h. Baja el histórico de S3 (`exchange-rate.json`), consulta el formulario `HistoricoRango` de banguat.gob.gt, lee la tabla (fecha, compra, venta, TCR), une, quita duplicados y guarda en S3. Sus `GET` públicos sirven el histórico paginado en formato JSON:API y un día por fecha `DD-MM-AAAA`.
- **Lo llaman:** `app/api/exchange-rates/route.ts` (con caché en memoria que sirve el dato viejo si n8n falla; `DELETE` la vacía al cerrar sesión) y el Copilot.
- **Contrato:** manual, líneas 7079–7198. Dos correcciones verificadas el 29 oct: el `GET` pagina con `page` y `size` (o `pageNumber`/`pageSize`); los `page[number]`/`page[size]` del manual y de sus propios `links` se ignoran y siempre devuelven la página 1 con 10 filas. El histórico tiene 7,274 días (30/11/2006 → hoy), no 2,475.
- **Fuente nueva:** el servicio SOAP oficial de Banguat (`https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx`, operación `TipoCambioRango`), sin credenciales. Da los 7,274 días en una sola respuesta. Para el dólar devuelve compra = venta = la referencia de n8n, salvo el 30/11/2006 y el 01/12/2006, donde difieren: ahí n8n guarda `buy`/`sell` con `referenceRate` en null, y el reemplazo hace lo mismo.
- **Reemplazo:** reglas puras en `lib/domain/exchange-rates/`, carga y paridad en `etl/src/exchange-rates/` (`npm run rates:load`, `npm run rates:parity`), y la ruta lee `msp_app.exchange_rate` con el backend `prisma` manteniendo la forma de respuesta. Tarea periódica (decisión del usuario, 29 oct): **una vez al día, 7:17 de Guatemala**. La hace la ruta `POST /api/cron/exchange-rates` del Vercel de staging (últimos 15 días, `Authorization: Bearer <CRON_SECRET>`; 404 fuera de staging), disparada por el workflow de GitHub Actions [`.github/workflows/exchange-rates.yml`](../../.github/workflows/exchange-rates.yml) (`17 13 * * *` UTC y `workflow_dispatch`; secretos de repositorio `MSP_STAGING_URL`, `MSP_CRON_SECRET`, `MSP_VERCEL_BYPASS`). No se usan los Cron Jobs de Vercel porque `vercel.json` también se aplicaría al proyecto de producción. **En `main` desde el 29 oct ([PR #10](https://github.com/Admin-PrimeIQ/marketscanprime/pull/10)) y corrido a mano desde GitHub ese día: 200 en Vercel.** Para correrlo fuera de horario: Actions → «Tipo de cambio (Banguat)» → *Run workflow*, o `npm run rates:load -- --from DD/MM/AAAA` en `etl/`.
- **Hecho cuando:** una semana en sombra con los mismos valores que el `GET` de n8n, y la lista de `ROADMAP.md` §4.10 pasa (incluido «si Banguat no responde, se muestra el último dato»). La paridad (`npm run rates:parity` en `etl/`) se corre después de las 7:17; si solo aparece el día de hoy en `onlyInN8n`, es desfase de horario (n8n corre cada 6 h), no una diferencia. Apagar el workflow 7 en n8n es parte del corte y lo hace una persona.
- **Es el mejor primer paso:** no depende de decisiones de negocio ni del warehouse, y sirve para montar el servicio de workers.

### Grupo D: Copilot (2 workflows, en espera)

#### 8. [Prime IQ] Chat Sessions API · sin ID (no exportado)

- **Hoy:** tres webhooks públicos (`primeiq-chat-session-create`, `-list?email=`, `-rename`) sobre `public.chat_sessions` de Supabase. El id de la sesión es la llave de la memoria del chat. Contrato: manual, líneas 7200–7350.
- **Reemplazo:** tabla `chat_session` y Route Handlers, **cuando se trabaje el Copilot** (decisión 2). Hoy no se toca.

#### 9. [AI Agent] Orchestrator → AI Agents (2.2) · `xZlg5fXcX82Da7Yo`

- **Hoy:** Chat Trigger público (streaming, adjuntos). Procesa PDF, Office, hojas y audio; agente de OpenAI con memoria en Supabase (50 mensajes); herramientas *Search* y *Stats* que **leen Strapi** y la de tipo de cambio. Responde con bloques `:::` (`lib/copilot/ui-blocks-engine.ts`). Contrato: manual, líneas 7351–7457.
- **Reemplazo:** se queda en n8n (decisión 2). Lo único obligatorio antes de apagar Strapi: **endpoints de solo lectura con API key propia** que den lo que hoy *Search* y *Stats* consultan en Strapi, y apuntar esas herramientas a ellos (lo hace una persona en n8n, en el corte).
- **Antes de diseñar esos endpoints:** leer en `n8n-manager` qué consultas hacen *Search* y *Stats* (filtros, campos, populate).

---

## 5. Lo que ya existe en el repo para este trabajo

| Pieza | Dónde | Estado |
|---|---|---|
| Modelos `SyncRun` (`sync_run`), `SyncRunBlock` (`sync_run_block`) y enums `SyncRunStatus`, `SyncOperation`, `SyncBlockMode`, `SyncBlockOperation` | `prisma/schema.prisma` | Tablas creadas en `msp_app` (migración `init`), vacías. **Falta** el índice único parcial «una sola corrida activa» (Prisma no lo modela; agregarlo a mano en una migración, README §10). |
| Modelo `ExchangeRate` (`exchange_rate`) | `prisma/schema.prisma` | Único `(date, currency)`. Cargada con el histórico (7,274 días desde el 30/11/2006) y actualizada a diario por el cron (workflow 7). |
| Tipo de cambio (workflow 7) | Reglas y cliente SOAP en `lib/domain/exchange-rates/`; servicio `lib/db/exchange-rate-sync.ts`; rutas `app/api/exchange-rates/route.ts` y `app/api/cron/exchange-rates/route.ts`; `lib/cron-secret.ts`; carga y paridad en `etl/src/exchange-rates/` (`npm run rates:load`, `npm run rates:parity`); cron `.github/workflows/exchange-rates.yml` | En `main`. Corre a diario en staging; falta la semana en sombra (§7 paso 1). |
| Contadores del bloque (workflow 6) | `lib/domain/blocks/counters.ts` (cálculo puro), `lib/db/block-counter-mapping.ts` (puente con Prisma), `lib/db/block-counters.ts` (`lockBlockForUpdate`, `recalculateBlockCounters`), `lib/domain/units/concurrency.ts` (`findStaleUnits`); paridad en `etl/src/block-counters/` (`npm run counters:parity`). Cada archivo con su `.test.ts` | Commits del usuario `12155da` y `7a34015`, en `origin/jc_migrate_workflowsn`, sin fusionar a `main`. Probado contra `msp_app` (§8, 29 oct). Nadie lo llama todavía: lo conecta el agente de módulos en `saveUnitChanges` (`ROADMAP.md` §4.8). |
| Conexión de solo lectura al warehouse MySQL | `etl/src/warehouse/connection.ts`, `ping.ts` (`npm run warehouse:ping`), lista de tablas en `etl/src/db/warehouse-tables.ts` | Escrita, nunca probada: falta `DATABASE_HOST_WAREHOUSE` (README §13.3). |
| Conexión al Postgres de staging (`dbo_stage` en solo lectura) | `etl/src/stage/connection.ts`, `ping.ts`, `describe.ts` | Funciona. **Falta** el cliente de escritura para la copia sombra: conexión aparte con lista cerrada de las 11 tablas, y que cualquier escritura fuera de ella (en especial `sec_*`) falle en el código (README §8 punto 3). |
| Estructura del warehouse en Postgres | README §11.3 y §11.4 | Las 11 tablas del push existen vacías en `dbo_stage` y `dbo` del servidor de staging. |
| Mapeo Strapi → warehouse | README §5, `FORMULAS.md`, manual líneas 1704–1734 | Documentado; sin código. |
| Rutas de sync en modo `prisma` | `lib/sync/prisma-unavailable.ts` | Responden 503 hasta que se migre sync. |
| Bitácora y llaves actuales de n8n | Manual, líneas 1736–1758 | `sync_runs` / `sync_run_blocks` en Supabase; Redis `run:<id>:progress`, `run:<id>:claim:<doc>`, `blockqueue:<blockId>`; S3 `exchange-rate.json` y `sync-runs/<runId>/…`. |

**Qué reemplaza a cada almacenamiento de n8n:**

| Hoy | Después |
|---|---|
| Supabase `sync_runs`, `sync_run_blocks` | `msp_app.sync_run`, `sync_run_block` |
| Supabase `chat_sessions` y memoria del chat | Sin cambio mientras el Copilot siga en n8n |
| Redis de Coolify (progreso, candados, cola de contadores) | Redis propio en Railway (BullMQ); los contadores dejan de necesitar cola |
| S3 `exchange-rate.json` | `msp_app.exchange_rate` |
| S3 `sync-runs/<runId>/…` (respaldos del push) | **Sin decidir:** bucket propio o tabla de respaldo con retención (`ROADMAP.md` fase 6) |

---

## 6. Decisiones pendientes que bloquean

Preguntárselas al usuario; no suponer (README §13.4, «no supongas nada»).

| Pregunta | Bloquea |
|---|---|
| **Host del warehouse en el `.env`:** ¿ya agregó el usuario `DATABASE_HOST_WAREHOUSE` (y, si el usuario de Strapi no sirve ahí, `DATABASE_USER_WAREHOUSE` / `DATABASE_PASSWORD_WAREHOUSE`)? Es información, no permiso: `warehouse:ping` solo lee. El agente no lee el `.env` ni busca nombres de variables en él (la revisión automática lo bloquea); hay que preguntar. | `npm run warehouse:ping` (§7 paso 3) |
| **Identidad de filas en el warehouse:** cómo se asignan `legacyId` / `cod_proyecto` a bloques y unidades nuevos. Hoy un bloque se une a su fila de `housing_universe` por `cod_proyecto` ↔ `legacyId`, y los nacidos en la app (sin `legacyId`) por `documentId` (`CLAUDE.md`, «Sibling repo»). Revisar primero cómo inserta el Sync Block Worker en `housing_units` (si manda `id` explícito, que choca con `IDENTITY ALWAYS`, y si devuelve el id a Strapi). | Push (workflow 4) |
| **El pull:** eliminarlo o reemplazarlo por un importador con vista previa. | Workflow 5 |
| **Quién lee cada `dbo`** y si otros proyectos escriben en las tablas de Market Scan. | Corte del push |
| **Red:** ¿Railway llega al RDS MySQL? (IP fija o túnel). | Workers que lean el warehouse |
| **Infraestructura de workers:** proyecto o servicio de Railway, y Redis propio. No existen. Los crea una persona; nombres que no se confundan con producción (p. ej. `marketscan-next`, `msp-*`). | Servicio de workers |
| **Respaldos del push:** S3 propio o tabla con retención. | Workflow 4 en producción |
| **Acceso a `n8n-manager`:** clonarlo en esta máquina (solo lectura). Chat Sessions API no está en ese repo: pedirle al usuario que lo exporte desde n8n, como hizo con Block Edit Queue el 29 oct (lo busca por nombre en la lista de workflows y usa *Download*). Un JSON exportado puede traer tokens de producción: leerlo, no copiar el token y no guardarlo en el repo. | Workflows 4, 8 y 9 |
| **Regla de Interior** (README §13.2): no cambia el push (copia valores), pero sí la paridad si alguien recalcula unidades. | Paridad del push |

---

## 7. Orden propuesto y estado

Cada paso se puede probar solo. Marcar la casilla al cerrarlo y anotar la fecha en la §8.

> **Traspaso al 29 oct, 15:20 (UTC-6).** Para el agente que continúe esta conversación.
>
> **Git.** Rama `jc_migrate_workflowsn`, al día con `origin` en `fa2271e` (commit del usuario, ~15:20, con el resultado de la prueba en `CHANGELOG.md` y `README.md` §6), **sin fusionar a `main`**. El código de los contadores (v1.36.0) está en `12155da` y `7a34015`. Sin commit queda solo este archivo, con este traspaso y la §9. El commit lo hace el usuario.
>
> **Dónde quedó cada paso:**
> - Paso 1, tipo de cambio: construido y en `main`; corre a diario. Falta la semana en sombra (30 oct–5 nov): `npm run rates:parity` en `etl/` cada día después de las 7:17. El 30 oct, revisar además la primera corrida programada del workflow de GitHub.
> - Paso 2, contadores: construido, con paridad y probado contra `msp_app` en una transacción revertida (§8). **Este agente no tiene nada más que hacer ahí**: lo conecta el agente de módulos en `saveUnitChanges` (`ROADMAP.md` §4.8, con el orden bloquear → `findStaleUnits` → escribir unidades → `recalculateBlockCounters`). Queda una decisión del usuario para el corte: recalcular de una vez los ~580 bloques del warehouse o no.
> - **Siguiente para este agente: paso 3, acceso al warehouse.** No necesita permiso (es solo lectura); necesita que el usuario confirme que agregó `DATABASE_HOST_WAREHOUSE` al `.env` (§6). Con eso: `npm run warehouse:ping` desde `etl/` (receta y qué hacer según el resultado en `README.md` §13.3). Si muestra permisos de escritura, detenerse y avisar; si faltan permisos, el `GRANT SELECT` lo corre un administrador, no el agente.
> - Pasos 4 y 5 dependen del 3 y de la identidad de filas (§6). La red desde Railway (§6) solo hace falta cuando exista el worker.
>
> **Lo último que pidió el usuario** fue este traspaso. Antes había preguntado para qué hacía falta su permiso: solo para escribir (en `msp_app` o en cualquier sistema); el paso 3 pide datos, no autorización.

1. [ ] **Tipo de cambio** (workflow 7), sin workers. **Construido; falta solo la semana en sombra.**
   - v1.34.0 (29 oct): reglas puras, carga del histórico desde el SOAP de Banguat (7,274 días en `msp_app.exchange_rate`), paridad 7,274 de 7,274 contra el `GET` de n8n y ruta `/api/exchange-rates` leyendo la tabla en modo `prisma` (probada con sesión en `pnpm dev:staging`: 200 desde la tabla y barra lateral correcta).
   - v1.35.0 (29 oct): ruta del cron `POST /api/cron/exchange-rates`, probada a mano en el Vercel de staging (200).
   - 29 oct: workflow de GitHub [`.github/workflows/exchange-rates.yml`](../../.github/workflows/exchange-rates.yml) en `main` (PR #10), diario a las 7:17 de Guatemala; corrida manual desde GitHub con 200 en Vercel.
   - Para cerrar la casilla: semana en sombra (`npm run rates:parity` en `etl/` cada día, del 30 oct al 5 nov) sin diferencias, la lista de `ROADMAP.md` §4.10 y la casilla correspondiente marcada allí. Apagar el workflow 7 en n8n lo hace una persona en el corte.
   - Fuera de este paso: el histórico paginado que consulta el Copilot (paso 8).
2. [ ] **Contadores de bloque** (workflow 6, Block Edit Queue). **Construido el 29 oct (v1.36.0); falta que el agente de módulos lo llame.** Detalle en la ficha del workflow 6 (§4).
   - Hecho: `computeBlockCounters` (`lib/domain/blocks/counters.ts`, copia exacta de n8n), `lockBlockForUpdate` y `recalculateBlockCounters` (`lib/db/block-counters.ts`), el bloqueo optimista de unidades (`findStaleUnits` en `lib/domain/units/concurrency.ts`) y la paridad de solo lectura (`npm run counters:parity` en `etl/`).
   - Para cerrar la casilla: `saveUnitChanges` los usa (`ROADMAP.md` §4.8), y el usuario decide en el corte si se recalculan de una vez los ~580 bloques del warehouse. Apagar el workflow 6 en n8n lo hace una persona en el corte.
   - Probado contra `msp_app` el 29 oct con autorización del usuario, en una transacción revertida (bitácora del 29 oct, 15:10–15:20).
3. [ ] **Acceso al warehouse:** `npm run warehouse:ping` en verde (README §13.3) y respuesta a la identidad de filas (§6).
4. [ ] **Mapeador del push** (workflow 4): `lib/domain/warehouse/`, puro, con prueba de paridad celda por celda contra el `dbo_stage` de MySQL.
5. [ ] **Cliente de escritura de la copia sombra** con lista cerrada de las 11 tablas, y worker `warehouse-push` sobre BullMQ.
6. [ ] **Corridas y `/sync`** (workflows 1–3): las 6 rutas sobre `sync_run*`, índice único parcial de corrida activa, progreso en vivo, liberar y detener, respaldos. Una semana de push sombra junto a n8n.
7. [ ] **Pull** (workflow 5): según lo que decida el usuario.
8. [ ] **Endpoints de solo lectura para el Copilot** (workflow 9), antes del corte.
9. [ ] **Runbook del corte** para la persona que lo ejecuta (`ROADMAP.md` fase 7): qué workflows se desactivan, en qué orden y cómo se revierte.

Fuera de alcance por ahora: Chat Sessions API y el Copilot en sí (decisión 2).

---

## 8. Bitácora

Una entrada por sesión de trabajo, la más reciente arriba: fecha y hora (UTC-6), qué se hizo, qué se verificó, migraciones aplicadas en `msp_app`, commits del usuario y qué quedó pendiente o por preguntar.

### 29 oct 2026, 15:10–15:20

- El usuario hizo el commit `7a34015` (15:10, código de los contadores y documentos de la v1.36.0) y lo subió a `origin/jc_migrate_workflowsn`. No está fusionado a `main`.
- Prueba de `recalculateBlockCounters` contra `msp_app`, **autorizada por el usuario**, con un script temporal (ya borrado) que corrió todo en una transacción y la revirtió al final. Actor: el usuario de pruebas (`engteam`, id 137).
- Bloques: `ciudad-buenaventura-fase-1` (id 3374, contadores al día) y `lotificacion-caserio-navidad` (id 3383, 13 guardadas contra 14 unidades).
- Resultado, 6 de 6:
  - El bloque al día devuelve `changed: false` y no escribe en `audit_log`.
  - El bloque desactualizado devuelve `changed: true`; las 10 columnas quedan iguales al cálculo y se escribe una fila en `audit_log` (`block`, `update`, antes 13 y después 14).
  - Una segunda llamada sobre el mismo bloque ya devuelve `changed: false`.
  - Mientras dura la transacción, otra conexión no puede tomar ese bloque (`FOR UPDATE NOWAIT` da 55P03), pero sí uno distinto.
  - Un id inexistente da `PublicError` "El bloque no existe.".
  - Después del `ROLLBACK`, los dos bloques (incluido `updatedAt`) y el conteo de `audit_log` quedaron iguales.
- La secuencia del id de `audit_log` avanzó (Postgres no la revierte): es un hueco inofensivo en la numeración.
- Una corrida intermedia falló dentro de la transacción por un error del script (comprobaba el bloque libre con un bloque que la propia transacción tenía tomado). Se revirtió sola, y la corrida final lo confirmó al inicio: el bloque 3383 seguía con 13.
- Sin migraciones. Sin cambios de código. Resultado anotado en `CHANGELOG.md`, `README.md` §6 y la §7 de este archivo; el usuario los subió en `fa2271e`.
- El usuario preguntó para qué se necesitaba su permiso: solo para escribir. El paso 3 necesita datos (§6), no autorización.
- Se reescribió el traspaso (§7), se actualizaron la §2 (ramas), la §5 (piezas de los workflows 6 y 7) y la §6 (host del warehouse, exportar Chat Sessions API), y se agregó la §9 para que otro agente pueda continuar. Sin commit.
- Pendiente: el commit de este archivo (usuario), el paso 3 en cuanto el usuario confirme el host del warehouse, y la semana en sombra del tipo de cambio.

### 29 oct 2026, 14:30–15:10

- Rama `jc_migrate_workflowsn` (con `dce934a` y `main` ya fusionados por el usuario). El usuario exportó Block Edit Queue desde n8n; el JSON quedó fuera del repo porque trae el token de Strapi de producción (se le avisó).
- Decisiones del usuario: copiar la fórmula de n8n tal cual (las correcciones se deciden con el reporte); recalcular en la transacción del guardado y pasar a BullMQ solo si la medición lo pide (más de 500 ms o cuando exista el servicio de workers); **bloqueo optimista** de unidades: rechazar el cambio de una unidad editada por otra persona desde que se cargó la hoja y avisar.
- Hecho: `lib/domain/blocks/counters.ts` (commit del usuario `12155da`), `etl/src/block-counters/` (`npm run counters:parity`), `lib/db/block-counter-mapping.ts`, `lib/db/block-counters.ts` y `lib/domain/units/concurrency.ts`, con pruebas. v1.36.0, propuesta.
- Verificado: `npm test` 191/191 (antes 169), `etl` 64/64, `tsc` con los 38 errores previos y ninguno en archivos nuevos. Paridad en solo lectura: 1,102 de 1,688 bloques iguales; los distintos son bloques que n8n nunca recalculó (ficha del workflow 6). Medición en solo lectura: el bloque más grande (4,467 unidades) se lee en ~300 ms desde una PC y se calcula en ~5 ms.
- Sin escrituras en `msp_app` ni migraciones.
- Pendiente: prueba de `recalculateBlockCounters` contra la base (escribe; pedir autorización), la llamada desde `saveUnitChanges` (agente de módulos) y, en el corte, decidir el recálculo masivo de los bloques del warehouse. Siguiente paso de este agente: el 3 (acceso al warehouse).

### 29 oct 2026, 12:15–14:00

- El usuario fusionó `feat/data-facade` a `main` ([PR #9](https://github.com/Admin-PrimeIQ/marketscanprime/pull/9), `b5a9b65`). `main` es la rama por defecto del repo.
- Decisiones del usuario: cron **una vez al día a las 7:17 de Guatemala** (`17 13 * * *` UTC; el minuto 17 evita la congestión de GitHub al minuto 0) y secretos de repositorio `MSP_STAGING_URL`, `MSP_CRON_SECRET`, `MSP_VERCEL_BYPASS` (pestaña *Secrets*, no *Variables*).
- Escrito [`.github/workflows/exchange-rates.yml`](../../.github/workflows/exchange-rates.yml): `permissions: {}`, una corrida a la vez, solo en `Admin-PrimeIQ/marketscanprime`; valida que los secretos existan, reintenta 3 veces (60 s) ante 409, 5xx o fallo de red, da un mensaje por causa ante 401, 404 y redirección de Vercel, falla si faltan más de un día en `missingDays` y deja el resumen en la página del job. Verificado: YAML válido, `bash -n` limpio y simulación con un `curl` falso (200, 401, 409 seguido de 200). La parte con `jq` no se probó localmente (Git Bash no lo trae; `ubuntu-latest` sí).
- Commit del usuario `f6cdc03` y [PR #10](https://github.com/Admin-PrimeIQ/marketscanprime/pull/10) (`27c614d`): el workflow quedó en `main`. Después el usuario borró `README_TIPO_DE_CAMBIO.md` (el traspaso del tipo de cambio, ya cerrado); su contenido sigue en el historial de git (`git show 27c614d:docs/migration/README_TIPO_DE_CAMBIO.md`).
- 13:56, corrida manual desde GitHub (*Run workflow*): el log de Vercel muestra `200 POST marketscanprime.vercel.app/api/cron/exchange-rates`. La ruta solo da 200 con backend `prisma`, `MSP_STAGING_DEPLOY=true` y sin credenciales de Strapi, o sea en staging. El agente no vio el resultado del job en GitHub ni su resumen.
- Pendiente: confirmar en el panel de Vercel que `marketscanprime.vercel.app` es el proyecto de staging y qué rama sigue después de las fusiones; revisar mañana (30 oct) la primera corrida programada; semana en sombra del tipo de cambio (30 oct–5 nov). **Siguiente workflow: el 6, Block Edit Queue** (§7 paso 2), empezando por pedir su JSON exportado.

### 29 oct 2026, 9:43–12:15

- Decisiones del usuario: la recolección corre en el Vercel de staging, disparada por un cron de GitHub, **una vez al día en la mañana**; primero se prueba en Vercel con una corrida manual desde su máquina (PowerShell). Staging despliega `feat/data-facade`; producción, `main`. Deployment Protection de staging: sin confirmar.
- Verificado con una lectura desde un servidor externo: la página del servicio de Banguat responde fuera de Guatemala. Falta confirmar el `POST` desde las IP de Vercel (será la corrida manual).
- v1.35.0, sin commit: ruta `app/api/cron/exchange-rates/route.ts`, servicio `lib/db/exchange-rate-sync.ts`, cliente SOAP y SQL del upsert movidos a `lib/domain/exchange-rates/` (una copia para `etl/` y la app), `lib/cron-secret.ts`, `CRON_SECRET` en `.env.staging.example`.
- Verificado: `npm test` y pruebas puntuales en verde, `etl` 57/57, `tsc` sin errores en archivos tocados, `rates:load --dry-run` de 15 días con 0 cambios, ruta local sin `CRON_SECRET` → 404.
- 10:40, ruta local con `CRON_SECRET` (agregado por el usuario): 401 sin secreto o con uno incorrecto; 200 con el correcto, 15 días recibidos y 15 iguales (escribió en `msp_app` sin cambiar filas). `$queryRawUnsafe` de Prisma acepta los arreglos del `unnest`.
- 12:05, **corrida manual en el Vercel de staging** (commit y push del usuario, `CRON_SECRET` en el proyecto de staging): 200, 15 días recibidos y 15 iguales, Banguat en 329 ms. Banguat sí responde a las IP de Vercel. Staging tiene Vercel Authentication activa; la llamada pasa con el token de "Protection Bypass for Automation" (encabezado `x-vercel-protection-bypass`). Un despliegue fijo no ve las variables agregadas después de construirse: el primer intento dio 404 por eso.
- Contexto completo para que otro agente continúe: `README_TIPO_DE_CAMBIO.md` (borrado el 29 oct al cerrar el paso; queda en el historial de git, commit `27c614d`).
- Decisiones del usuario (12:10): el workflow de GitHub **espera a que `feat/data-facade` se fusione a `main`** (no se hace un push a `main` solo para el cron ni se toca el proyecto de producción de Vercel). Hora: **7:00 de Guatemala**, `cron: "0 13 * * *"` en UTC.
- Pendiente: el workflow (al fusionar), sus secretos en GitHub (URL estable de staging, `CRON_SECRET`, token de bypass), usar el dominio estable de la rama en vez de la URL de un despliegue, y la semana en sombra. Hasta entonces la tabla se actualiza corriendo la ruta a mano o `npm run rates:load` en `etl/`.

### 29 oct 2026, 9:15–9:40

- Ruta probada en `pnpm dev:staging` con sesión: `/api/exchange-rates` responde 200 desde la tabla (`| db` en el log) y la barra lateral muestra el tipo de cambio; sin sesión, 401.
- Por qué daba 503: en el `.env`, `DEV_LOGIN_PASSWORD=` seguida de espacios hace que `util.parseEnv` de Node (el lector de `dev:staging`) tome la línea siguiente (`BETTER_AUTH_SECRET=…`) como su valor. Un valor vacío no debe terminar en espacios.
- A pedido del usuario, clave nueva para `app-engteam`: hash bcrypt nuevo en `DEV_LOGIN_PASSWORD_HASH` y `npm run app:local-user -- --apply` (escribe solo esa cuenta en `msp_app`).
- Pendiente: dónde corre la tarea cada 6 h, la semana en sombra, el commit y borrar `DEV_LOGIN_PASSWORD` (clave en texto plano) del `.env`.

### 29 oct 2026, 7:00–9:30

- Paso 1 de la §7 (tipo de cambio), v1.34.0, sin commit. Decisiones del usuario: guardar como n8n (solo referencia si compra = venta; compra y venta si difieren), scripts en `etl/`, histórico desde el 30/11/2006, el histórico paginado queda para el paso 8.
- Verificado con lecturas: el SOAP de Banguat da los mismos valores que n8n y acepta todo el histórico en una consulta; el `GET` de n8n pagina con `page`/`size` (ver ficha del workflow 7).
- Escrito en `msp_app` con autorización del usuario: `npm run rates:load` insertó 7,274 filas en `exchange_rate`; repetido, 0 cambios. Sin migraciones.
- `npm run rates:parity`: 7,274 de 7,274 días iguales a n8n. `npm test` 162/162, pruebas de `etl` 4/4, `tsc` sin errores en archivos tocados.
- Ruta en `pnpm dev:staging`: responde 503 sin llegar a la tabla porque falta `BETTER_AUTH_SECRET` en el `.env`. El objeto que arma con la tabla se verificó con una lectura directa: igual al de n8n (29/10/2026, 7.64382, tendencia a la baja).
- `next dev` crea `AGENTS.md` en la raíz al arrancar; se borró.
- Pendiente: `BETTER_AUTH_SECRET` en el `.env` (lo agrega el usuario), dónde corre la tarea cada 6 h, la semana en sombra y el commit.

### 28 oct 2026

- Se creó este documento a partir del manual, el `ROADMAP.md` y el código. No se tocó ningún workflow, base ni servicio.
- Comprobado en el repo: `sync_run`, `sync_run_block` y `exchange_rate` existen en `prisma/schema.prisma`; las rutas de sync responden 503 con el backend `prisma`; `n8n-manager` no está clonado en esta máquina.
- Siguiente: preguntarle al usuario por las decisiones de la §6 y empezar por el paso 1 de la §7.

---

## 9. Cómo trabajar en esta máquina

Lo aprendido en las sesiones del 28 y 29 oct (Windows, PowerShell 5, Node 24). Las reglas de la §0 siguen mandando.

**Pruebas y tipos**
- Desde la raíz, `npm test` (módulos puros con `node --test`); desde `etl/`, su propio `npm test`. Al 29 oct: 191 en la raíz y 64 en `etl`.
- `npx tsc --noEmit` tiene 38 errores de base; filtrar la salida a los archivos tocados.
- En PowerShell, pasar la salida de `npm test` por `Select-String` no muestra nada: redirigirla a un archivo en `$env:TEMP` y leer el final.
- Un archivo nuevo de `lib/domain/` o de `lib/db/` con pruebas también va en el script `test` de `package.json`, que lista los patrones a mano.

**Scripts contra `msp_app`**
- Correrlos desde la raíz con el `tsx` del ETL: `.\etl\node_modules\.bin\tsx.cmd scripts/<archivo>.mts`, cargando el `.env` dentro del script con `process.loadEnvFile(".env")`.
- `lib/db/client.ts` importa `server-only` y falla fuera de Next. Armar el cliente aparte: `new PrismaClient({ adapter: new PrismaPg(new pg.Pool({ ...appPoolConfig(), max: 1 }), { schema: APP_SCHEMA }) })`, con `PrismaClient` de `lib/db/generated/client.ts` y `appPoolConfig`, `APP_SCHEMA` de `lib/db/connection.ts`. Pool chico: el Postgres de Railway corta con «too many connections».
- Solo lectura por defecto: abrir la conexión con `-c default_transaction_read_only=on`, como `etl/src/block-counters/index.ts`.
- **Cualquier escritura en `msp_app` necesita autorización del usuario.** Para probar código que escribe sin dejar rastro, correrlo dentro de `prisma.$transaction(async (tx) => { …; throw ROLLBACK })`, atrapar ese error afuera y comprobar después de la transacción que todo quedó igual. Las secuencias de Postgres avanzan igual (huecos inofensivos en los ids). Ojo: lo que la transacción ya bloqueó con `FOR UPDATE` no sirve como «fila libre» en una prueba de bloqueo.
- El usuario de pruebas se busca por el correo de `DEV_LOGIN_EMAIL` sin imprimirlo; su `username` es `engteam` (id 137), no `app-engteam`.
- Borrar los scripts temporales al terminar; no se suben.

**Archivos y `.env`**
- No leer ni imprimir valores del `.env`, ni buscar nombres de variables en él: preguntarle al usuario si una variable existe.
- `Set-Content -Encoding utf8` de PowerShell 5 agrega BOM. Para editar, usar las herramientas de edición; si hace falta PowerShell, `[System.IO.File]::WriteAllText($ruta, $texto, [System.Text.UTF8Encoding]::new($false))`.
- `next dev` crea un `AGENTS.md` en la raíz al arrancar: borrarlo.
- Los JSON exportados de n8n quedan fuera del repo (traen tokens de producción).
