# Migración de Market Scan: de Strapi a Prisma

<!-- SECCIÓN PROTEGIDA: no borrar, mover ni resumir. Solo puede cambiarla el usuario. -->
## 0. Lectura obligatoria antes de hacer cualquier cosa

Si eres un agente de IA (o una persona) y te pidieron leer este documento, **antes de ejecutar cualquier acción** lee, en este orden:

1. **[`.agents/skills/proteger-produccion/SKILL.md`](../../.agents/skills/proteger-produccion/SKILL.md)**: qué está en producción y no se toca, qué se puede leer y cómo construir en paralelo.
2. **[`.agents/skills/proteger-produccion/inventario-produccion.md`](../../.agents/skills/proteger-produccion/inventario-produccion.md)**: lista de sistemas, workflows, URLs y variables de producción.
3. **[`ROADMAP.md`](./ROADMAP.md)**: fases, inventario de módulos y orden de trabajo.
4. Este documento, completo.

Reglas que aplican siempre:

- **Producción no se toca.** Strapi, n8n, Coolify, las bases `strapi` / `dbo_stage` / `dbo`, el `dbo` de Postgres en Railway, Supabase, Redis, S3 y el Vercel de `admin.primeiqlatam.com` siguen funcionando igual. Todo lo nuevo se construye **en paralelo**.
- Si una tarea requiere escribir, configurar, reiniciar, desplegar o borrar algo en producción: **detenerse y preguntar**.
- **No borrar, mover, resumir ni debilitar** esta sección, la sección equivalente de `ROADMAP.md`, la skill `proteger-produccion` ni la regla `.cursor/rules/proteger-produccion.mdc`. Solo el usuario puede cambiarlas. Al editar este documento, conservar esta sección intacta al inicio.
- Responder siempre en **español**. Antes de explorar código, correr `graphify query "<pregunta>"` (regla `.cursor/rules/graphify.mdc`); después de modificar código, `graphify update .`.
<!-- FIN DE SECCIÓN PROTEGIDA -->

---

Documento de traspaso para que otra persona o agente de IA continúe el trabajo sin releer la conversación original (15 oct 2026). Resume el sistema actual, lo que se decidió, lo que ya está hecho y lo que falta.

---

## 1. Fuente de contexto

El sistema completo está documentado en [`docs/manual-del-sistema.md`](../manual-del-sistema.md) (8,202 líneas, generado el 8 oct 2026 por devroot.studio). Secciones clave:

| Tema | Líneas |
|---|---|
| Fichas técnicas (backoffice, CRM, integraciones) | 154–320 |
| Mapa del sistema y conexiones | 322–680 |
| Modelo de datos (entidades y campos) | 849–1445 |
| Almacenamiento en MySQL y convenciones de Strapi v5 | 1446–1570 |
| **Inventario de las 87 tablas de la base `strapi`** | 1571–1662 |
| Bases de datos, warehouse y **mapeo Strapi → warehouse** | 1665–1758 |
| Workflows de n8n | 1760–1955 |
| Reglas de negocio | 7802–7842 |
| Variables de entorno | 7843–7890 |

También: [`CLAUDE.md`](../../CLAUDE.md) (arquitectura del backoffice) y [`.migration/README.md`](../../.migration/README.md) (CLI que recalcula fórmulas de unidades vía API de Strapi).

---

## 2. El sistema actual, en corto

```text
Backoffice (Next.js, Vercel) ──API REST──► Strapi 5.30 (AWS App Runner) ──► MySQL "strapi" (RDS us-east-2)
                                                    ▲
n8n (Docker en EC2, administrado con Coolify) ──────┘ (pull, contadores, Copilot)
   │ push (/sync)
   ▼
MySQL "dbo_stage"  ──promoción MANUAL──►  dbo (MySQL)  y  dbo (Postgres en Railway)
```

- **Strapi** es la fuente de verdad. El backoffice nunca toca MySQL: todo pasa por `lib/api/strapi.ts` (34 métodos, ~38 archivos consumidores).
- **Solo Strapi** se conecta directo a la base `strapi`. n8n escribe en ella a través de la API.
- **n8n** corre 9 workflows: 5 de sincronización (Writeback API, Resolve Targets, Drainer, Block Worker, Pull Block Worker), contadores de bloque (Block Edit Queue), tipo de cambio Banguat, sesiones de chat y Copilot.
- **Coolify** es solo el panel que despliega y reinicia los contenedores Docker de n8n y Redis en el EC2.

### Bases de datos involucradas

| Base | Motor | Rol |
|---|---|---|
| `strapi` | MySQL (RDS us-east-2) | Fuente de verdad del CRM. 87 tablas generadas por Strapi. |
| `dbo_stage` | MySQL | Destino del push de n8n. **Corrección aportada por el usuario:** el manual la muestra enmascarada como `dbo_****` y parecía ser el warehouse final; en realidad es una capa de *staging*. |
| `dbo` | MySQL | Warehouse final, compartido con **otros proyectos**. Se llena por promoción manual desde `dbo_stage`. |
| `dbo` | Postgres (Railway) | Copia de `dbo` (el usuario la considera idéntica a la de MySQL; **por confirmar**). También compartida con otros proyectos. |
| Supabase | Postgres | Bitácora de sync (`sync_runs`, `sync_run_blocks`), `chat_sessions` y memoria del Copilot. |
| Redis | En el EC2 de Coolify | Progreso, candados y colas temporales de n8n. Desechable. |
| S3 `n8n-primeiqlatam` | AWS | Respaldos de cada push e histórico del tipo de cambio. |

---

## 3. Objetivo de la migración

Dejar de depender de Strapi y n8n, en un proyecto propio y optimizado:

- **Next.js + Prisma** como backend (la web nueva irá en Vercel, independiente del backoffice actual).
- **Workers (BullMQ) + Redis** en **Railway** para el trabajo en segundo plano que hoy hace n8n.
- Postgres en Railway (ya existe una base ahí).

### Decisiones tomadas

| # | Decisión |
|---|---|
| 1 | Los workers reemplazan a n8n: sincronización, contadores de bloque y tipo de cambio. |
| 2 | El **Copilot queda en espera** hasta entender cómo funciona (prompts y herramientas viven en el repo `n8n-manager`, no aquí). |
| 3 | Infraestructura en **Railway**: Postgres (ya existe), workers y Redis. |
| 4 | **Prisma va en este repo** como herramienta de ETL, no dentro del runtime de la app Next.js. |
| 5 | Primero: **cliente Prisma de Strapi** (MySQL) con todas las tablas migrables. |
| 6 | Después: **cliente Prisma de `dbo_stage`** (MySQL) para insertar lo leído de Strapi. El usuario enviará la conexión. **Hasta el corte, `dbo_stage` solo se lee; el ETL escribe en una copia sombra** (ver `ROADMAP.md`, fase 4). |
| 7 | La promoción `dbo_stage` → `dbo` (MySQL y Postgres) **sigue siendo manual**, como hoy. |

### Propuestas descartadas durante la conversación (no retomar sin motivo)

- **Usar solo `dbo` como fuente:** `dbo` es un resumen derivado y con pérdidas (textos recortados a 50/20 caracteres, catálogos como texto, banco vacío = `0`, sin proyectos como entidad, sin usuarios, menos bloques que Strapi). La fuente completa es `strapi`.
- **Convertir `dbo` en vistas SQL:** descartado porque `dbo` es compartido con otros proyectos y debe seguir siendo tablas reales.
- **Que el worker escriba directo en los dos `dbo`:** reemplazado por el flujo vía `dbo_stage` + promoción manual.

---

## 4. Tablas de Strapi

Inventario completo con columnas y tipos en el manual (líneas 1571–1662). Conteos de agosto 2026.

### Migrables (52)

- **Colecciones de negocio (16):** `projects` (1,115), `blocks` (1,693), `units` (238,177), `developers` (537), `amenities` (85), `services` (18), `countries` (2), `nses` (15), `security_types` (9), `block_categories` (7), `block_focuses` (15), `block_statuses` (10), `unit_parking_types` (5), `unit_topographies` (12), `unit_usages` (2), `exchange_rate_profiles` (2).
- **Relaciones `_lnk` (15):** `units_block_lnk`, `units_unit_usage_lnk`, `units_topography_lnk`, `units_parking_type_lnk`, `blocks_project_lnk`, `blocks_block_category_lnk`, `blocks_block_status_lnk`, `blocks_block_focus_lnk`, `projects_amenities_lnk`, `services_projects_lnk`, `projects_country_lnk`, `projects_developer_lnk`, `projects_exchange_rate_profile_lnk`, `projects_nse_lnk`, `projects_security_type_lnk`.
- **Componentes (13):** `components_unit_types_housings|industrials|offices`, `components_financing_financings`, `components_financing_bank_rates`, `components_currencies_currencies`, `components_currencies_currency_{quetzals,peso_mexicanos,balboas,belizes,colon_costarricenses,cordobas,lempiras}`.
- **Pivotes de componentes `_cmps` (5):** `units_cmps`, `blocks_cmps`, `components_financing_financings_cmps`, `components_currencies_currencies_cmps`, `exchange_rate_profiles_cmps`.
- **Usuarios (3):** `up_users` (contraseñas bcrypt, reutilizables), `up_roles`, `up_users_role_lnk`.

### Excluidas (35)

`admin_*` (5), `strapi_*` (22: tokens, sesiones, historial, migraciones, releases, workflows de revisión, webhooks, core store, esquema), `files*` y `upload_folders*` (5, vacías), `i18n_locale`, `up_permissions`, `up_permissions_role_lnk` (los permisos se rehacen en código).

### Particularidades de Strapi v5 que el ETL debe resolver

- **Relaciones** en tablas `<tabla>_<campo>_lnk`; la relación inversa (`mappedBy`) no crea tabla. Unidad → bloque está declarada `oneToOne` pero se usa como muchos-a-uno.
- **Zona dinámica `unitType`** de la unidad: `units_cmps` es **polimórfica** (`component_type` = `unit-types.housing` | `unit-types.offices` | `unit-types.industrial`, `cmp_id` apunta a la tabla correspondiente, `field = 'unitType'`). Prisma no modela esto: se resuelve en el script.
- **Financiamiento del bloque:** `blocks_cmps` → `components_financing_financings` → `components_financing_financings_cmps` → `components_financing_bank_rates` (el banco sale del `field` del pivote: `bac`, `bam`, `fha`, … 18 bancos).
- **Monedas del perfil:** `exchange_rate_profiles_cmps` → `components_currencies_currencies` → `components_currencies_currencies_cmps` → `components_currencies_currency_*` (`buy_rate`/`sell_rate` DECIMAL(18,8)).
- **`document_id`** es el identificador estable. **Conservarlo:** los bloques creados en el backoffice se enlazan con el warehouse por `cod_proyecto = documentId`; los que vinieron del warehouse, por `cod_proyecto = legacyId`. Las unidades se enlazan por `legacyId = housing_units.id`.
- `uid` (`code`) no tiene índice único en MySQL; los enums se guardan como `varchar`.
- Verificar **draft & publish**: si alguna colección lo tiene activo, un documento puede tener dos filas (borrador y publicado). Filtrar por `published_at IS NOT NULL` y comprobar unicidad de `document_id`.
- Datos huérfanos conocidos: ~673 unidades sin bloque (238,177 vs 237,504 vínculos), 2 proyectos sin país (las fórmulas usan GT por defecto), solo ~130 mil unidades con `unitType`.

---

## 5. Mapeo Strapi → warehouse (lo que hoy hace el push de n8n)

Detalle en el manual, líneas 1704–1734. Lo esencial:

| Warehouse | Origen | Regla |
|---|---|---|
| `housing_universe.cod_proyecto` | bloque | `legacyId`, o `documentId` si no tiene |
| `proyecto` / `categoria` | `project.name` / `blockCategory.name` | Máx. 50 / 20 caracteres |
| `periodo` | `year + quarter` | `2026` + `T2` → `"2026 - 2T"` |
| `mercado` | `market` | `Primary` → `Primario` |
| booleanos del proyecto | `fha`, `muvi`, `showroom`, `modelHouse` | `"Si"` / `"No"` |
| `disponibilidad` | `availability` | `Available` → `Disponible` |
| `frente_v2`, `fondo_v2` | `frontM2`, `depthM2` | × **1.1976** |
| medidas en v² | m² | × **1.4342** |
| `precio_v2_usd` | `pricePerM2USD` | ÷ 1.4342 |
| columnas `_qtz` | USD | × `gtq.buyRate` del perfil; `NULL` si no hay perfil |
| mantenimiento | `maintenance*USD` | 1:1, sin factor de IVA (desde 29 sep 2026) |
| `banking_info.percentage_<banco>` | `financing.<banco>.annualRatePercent` | `0` = no trabaja con ese banco |
| `housing_amenities.<amenidad>` | `project.amenities` | columnas 0/1; `area-bbq` ↔ `area_bbq` |

Los factores de varas del warehouse (1.4342 / 1.1976) **difieren a propósito** de los del backoffice (1.431 / 1.19). No unificarlos sin decidir quién manda.

---

## 6. Estado actual del trabajo

| Hecho | Detalle |
|---|---|
| graphify instalado | CLI 0.9.89, grafo en `graphify-out/`, regla `.cursor/rules/graphify.mdc` |
| `.env` creado | Variables del backoffice (`NEXT_PUBLIC_STRAPI_URL`, `STRAPI_USERNAME`, `STRAPI_PASSWORD`, `SYNC_API_URL`, `SYNC_API_KEY`) más `STRAPI_DATABASE_URL` para el ETL, vacía. Ignorado por git. |
| Este README | `docs/migration/README.md` |
| Cliente Prisma de Strapi | Esquema validado y cliente generado en `etl/` (sección 7). **Falta probarlo contra la base real** (requiere `STRAPI_DATABASE_URL`). |

---

## 7. Cliente Prisma de Strapi

Vive en el paquete aislado [`etl/`](../../etl/README.md) (npm propio, fuera del build de la app), con uso documentado en [`etl/README.md`](../../etl/README.md):

- `etl/prisma/strapi/schema.prisma`: 52 modelos con nombres idénticos a las tablas (snake_case). Validado y generado.
- `etl/prisma.strapi.config.ts`: config de Prisma 7; lee `STRAPI_DATABASE_URL` del `.env` de la raíz.
- `etl/generated/strapi/`: cliente generado (gitignored; se regenera con `npm run strapi:generate`).
- `etl/src/strapi/client.ts`: `createStrapiClient()` con el adaptador `@prisma/adapter-mariadb`.
- `etl/src/strapi/check.ts`: verificación de solo lectura (conteos contra el manual, columnas, `document_id` repetidos).

No se instaló en la raíz porque el pnpm global (9.15.4) no lee el `pnpm-workspace.yaml` del repo (`allowBuilds` es de pnpm 10+) y para no tocar el build de Vercel.

Reglas:

- **Solo lectura.** Conectar con un usuario MySQL que tenga únicamente `SELECT` sobre la base `strapi`.
- **Nunca** correr `prisma migrate`, `prisma db push` ni `prisma migrate reset` contra `strapi`, `dbo_stage` ni `dbo`. Son bases de producción y compartidas.
- El esquema se escribió a mano desde el inventario del manual. Cuando haya conexión, validarlo con `prisma db pull --print` y ajustar diferencias.
- El cliente no se importa desde la app Next.js: es para scripts de ETL.

---

## 8. Próximos pasos

El plan completo por fases (decisiones, esquema nuevo, carga, push, app, workers, corte y limpieza) está en [`ROADMAP.md`](./ROADMAP.md). Lo inmediato:

1. El usuario agrega `STRAPI_DATABASE_URL` (usuario de solo lectura) al `.env` y corre `cd etl && npm run strapi:check`; si algún modelo da ERROR, comparar con `npm run strapi:pull:print` y corregir el esquema a mano.
2. El usuario envía la conexión de **`dbo_stage` (MySQL)** → crear su cliente Prisma en `etl/prisma/stage/` (config `etl/prisma.stage.config.ts`, salida `etl/generated/stage`) con `db pull` y revisar si su estructura es idéntica a `dbo`.
3. Revisar en el repo `n8n-manager` el workflow **Sync Block Worker** (`yBuM3XVk36DwRgbs`): cómo inserta en `housing_units`, si conserva IDs y si devuelve el ID nuevo a Strapi. Define cómo asignar `legacyId` a unidades nuevas sin que difieran entre bases.
4. Escribir el script ETL Strapi → `dbo_stage` (en `etl/src/`), con `--dry-run`, por dominio (`housing` | `office` | `industrial`) y validación de conteos.
5. Diseñar el esquema limpio de Postgres para la app nueva (proyectos, bloques, unidades con FKs reales, tipos de unidad 1:1, financiamiento, monedas, usuarios, `sync_outbox`, `exchange_rates`).
6. Workers BullMQ en Railway: contadores de bloque (debounce por `jobId`), tipo de cambio Banguat (repetitivo cada 6 h), sincronización hacia `dbo_stage`.

---

## 9. Preguntas abiertas

- ¿`dbo` en MySQL y `dbo` en Postgres son realmente idénticos? ¿Y `dbo_stage` tiene la misma estructura que `dbo`?
- ¿Otros proyectos **escriben** en las tablas de Market Scan dentro de `dbo` (`housing_*`, `office_*`, `industrial_*`, `banking_info`) o solo las leen?
- El usuario dijo primero que los tableros "ya no leerán el warehouse MySQL" y después que ambos `dbo` se usan. Confirmar quién lee cada uno.
- ¿El ETL hacia `dbo_stage` es carga única o reemplaza al push de forma permanente? ¿Todos los bloques o por selección?
- ¿Se migran las contraseñas (`up_users.password`, bcrypt) a la app nueva?
- Red: ¿Railway puede llegar al RDS MySQL? (probablemente requiere IPs de salida fijas o túnel).

---

## 10. Hallazgos a tener en cuenta

- **IVA "Venta" (0.916):** el manual dice "dividir entre 0.916", pero el código **multiplica** cuando la tasa es menor que 1 (`lib/units/formulas.ts`, `removeVat`). Desde v1.25.0 la tasa depende de la operación: venta 0.916, renta ÷1.12, mantenimiento sigue al uso.
- Webhooks de n8n sin autenticación: Block Edit Queue, Chat Sessions API y el Chat Trigger del Copilot.
- La conexión de Strapi a MySQL usa SSL sin validar el certificado (`DATABASE_SSL_REJECT_UNAUTHORIZED=false`).
- El pull de n8n no tiene reversa y borra del CRM las unidades que no estén en el warehouse.
