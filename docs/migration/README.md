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

Documento de traspaso para que otra persona o agente de IA continúe el trabajo sin releer la conversación original (15 al 19 oct 2026). Resume el sistema actual, lo que se decidió, lo que ya está hecho y lo que falta.

**Para retomar rápido:** lee la sección 0, luego la §6 (estado), la §12 (el ETL Strapi → `msp_app`, lo último que se hizo), la §11 (el Postgres de staging, donde ocurre todo lo nuevo) y la §8 (próximos pasos). Después corre, desde `etl/`, los chequeos de solo lectura de la §6.1 para confirmar que el estado sigue igual.

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

También: [`CLAUDE.md`](../../CLAUDE.md) (arquitectura del backoffice) y [`.migration/README.md`](../../.migration/README.md) (CLI que recalculaba fórmulas de unidades vía API de Strapi; congelado desde el 11 sep 2026, su copia del motor es vieja y ya no es contrato de paridad).

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
| `dbo` | Postgres (Railway) | Copia de `dbo` (el usuario la considera idéntica a la de MySQL; **por confirmar**). También compartida con otros proyectos. **No es** el servidor de staging de la fila siguiente, aunque los dos estén en Railway y los dos tengan un esquema `dbo`. |
| `railway` (staging) | Postgres 18.6 (Railway, `DATABASE_URL_DBO_STAGE`) | Servidor de la migración, sin producción. Esquemas `msp_app` (app nueva), `dbo_stage` y `dbo` (estructura del warehouse). Detalle en la §11. |
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
| 6 | Después: **cliente Prisma de `dbo_stage`** (MySQL) para insertar lo leído de Strapi. El usuario enviará la conexión. **Hasta el corte, `dbo_stage` solo se lee; el ETL escribe en una copia sombra** (ver `ROADMAP.md`, fase 4). *Actualizada por la decisión 9: la conexión que llegó es Postgres, no MySQL.* |
| 7 | La promoción `dbo_stage` → `dbo` (MySQL y Postgres) **sigue siendo manual**, como hoy. |
| 8 | (15 oct 2026) El esquema de la app nueva vive en el **Postgres de staging de Railway** (`DATABASE_URL_DBO_STAGE`, base `railway`), en el esquema **`msp_app`**, junto al esquema `dbo_stage` de ese mismo servidor (5 tablas `sec_*`), que **solo se lee**. El usuario confirmó que nada de producción escribe en ese servidor y que no aloja el `dbo` de los otros proyectos. `msp_app` lo creó un administrador con dueño `j_stage_admin`; ese usuario no puede crear esquemas ni bases. |
| 9 | (15–16 oct 2026) El `dbo_stage` de referencia pasa a ser el **Postgres de staging**, tratado "como si fuera el `dbo_stage` de MySQL". El usuario (no el agente) creó ahí las **11 tablas del push** de n8n, vacías, en `dbo_stage` (con escritura para `j_stage_admin`) y en un esquema `dbo` (sin acceso para `j_stage_admin`). Ver §11.3. **Por confirmar con el usuario:** si `dbo_stage` de este servidor es el destino del ETL/push nuevo (la "copia sombra" de la Fase 4) y si el agente puede escribir en él. Mientras no lo confirme, el ETL lo abre en solo lectura. |

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
- Datos huérfanos conocidos: ~673 unidades sin bloque según el manual (238,177 vs 237,504 vínculos), 2 proyectos sin país (las fórmulas usan GT por defecto), solo ~130 mil unidades con `unitType`. Conteo real del ETL sobre filas publicadas (snapshot del 16 oct): **620 unidades sin bloque, 2 bloques sin proyecto, 42 unidades con `code` repetido** (§12.5).

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

Al 19 oct 2026. Todo está commiteado en `main` y `main` coincide con `origin/main` (último commit `fa54fe4`, subido por el usuario). El agente **no hace `git push`** sin pedido explícito. Los snapshots y reportes del ETL (`etl/.snapshots/`, `etl/reports/`) tienen datos reales: están en `.gitignore` y solo existen en la máquina donde se corrió el ETL.

| Hecho | Detalle |
|---|---|
| graphify instalado | CLI 0.9.89, grafo en `graphify-out/`, regla `.cursor/rules/graphify.mdc` |
| `.env` (raíz, ignorado por git) | Variables del backoffice (`NEXT_PUBLIC_STRAPI_URL`, `STRAPI_USERNAME`, `STRAPI_PASSWORD`, `SYNC_API_URL`, `SYNC_API_KEY`: **el agente nunca las usa**), `DATABASE_HOST_STRAPI` / `DATABASE_PORT_STRAPI` / `DATABASE_NAME_STRAPI` / `DATABASE_USER_STRAPI` / `DATABASE_PASSWORD_STRAPI` (MySQL `strapi`, usuario solo `SELECT`) y `DATABASE_URL_DBO_STAGE` (Postgres de staging). `STRAPI_DATABASE_URL`, que mencionan versiones viejas de los documentos, ya no se usa. No imprimir valores del `.env`. |
| **Fase 1: cliente Prisma de Strapi** | **Terminada y verificada contra la base real** (15 oct). `npm run strapi:check`: los 52 modelos se leen sin error (cada uno lee una fila completa, así que una columna faltante fallaría), 0 borradores duplicados en las 5 colecciones con `document_id`. Diferencias con el manual por base viva: proyectos +13, unidades +~700 (238,880), bloques −2; ~688 unidades sin bloque. Ver §7. |
| Valores reales de enums | `etl/src/strapi/distinct-values.ts` (solo lectura). Valores en §11.5; con ellos se fijaron los enums del esquema de la app. |
| Conexión al Postgres de staging | TLS 1.3 con la raíz de Railway fijada en `etl/certs/dbo-stage-ca.pem`; sesión de solo lectura para `dbo_stage`. Ver §11.1. |
| **Fase 2: esquema de la app** | `prisma/schema.prisma` (29 modelos, 30 tablas con `_prisma_migrations`) y la migración `prisma/migrations/20261015210000_init`, aplicada en `msp_app` el 15 oct 2026. `migrate status`: al día; `migrate diff` contra la base: sin diferencias. Tablas vacías. Se opera desde `etl/` con `npm run app:*` (ver `etl/README.md`). |
| Revisión del warehouse en Postgres | 15–16 oct: comparadas las tablas del push de n8n contra el servidor de staging. Resultado en §11.3 y §11.4. |
| **Fase 3: ETL Strapi → `msp_app`** | **Carga inicial hecha** (19 oct, COMMIT) con el snapshot del RDS del 16 oct 22:21: 1,135 proyectos, 1,688 bloques, 238,226 unidades, 17 usuarios, catálogos, perfiles, financiamiento y tasas (los totales incluyen los padres «No definido»). Verificación antes del COMMIT y `load:verify` posterior: 25/25 tablas, 19/19 relaciones, 1/1 agregados. 0 filas excluidas; 664 advertencias. Migración `20261016120000_etl_run` aplicada (bitácora en `msp_app.etl_run`). Idempotencia comprobada el 19 oct: un `--dry-run` con el mismo snapshot dio 0 filas nuevas, 0 cambiadas y 0 borradas en las 25 tablas. Reporte de diferencias de fórmulas hecho el 19 oct (§12.8): 52 % de las unidades difiere del motor en al menos un campo, casi todo por reglas distintas en períodos viejos. Desde el 19 oct la carga guarda el valor recalculado (123,442 unidades cambiadas, COMMIT y `load:verify` 25/25). Falta refrescar con un snapshot nuevo. Detalle completo en la §12. |

### 6.1 Chequeos de solo lectura para confirmar el estado

Desde `etl/` (requieren el `.env` de la raíz; ninguno escribe):

| Comando | Qué debe dar hoy |
|---|---|
| `npm run strapi:check` | 52 modelos sin ERROR, 0 borradores. Correr fuera de horas pico si es posible (lee la base de producción, pool ≤ 2). |
| `npm run stage:ping` | Usuario `j_stage_admin`; esquemas `dbo` (11 tablas, sin acceso), `dbo_stage` (16 tablas, lectura y escritura), `msp_app` (31 con `etl_run`, dueño), `public` (0); las 11 tablas del push presentes en `dbo` y `dbo_stage`. |
| `npm run stage:describe` | Estructura de `dbo_stage`; `-- --schema dbo` para el otro esquema. Las 11 tablas del warehouse con `vivas≈0 insertadas=0`. |
| `npm run app:status` | "Database schema is up to date!" (2 migraciones: `init` y `etl_run`). |
| `npm run app:ping` | `current_schema = msp_app`, con los conteos de la carga del 19 oct (unidades 238,226, bloques 1,688, proyectos 1,135, usuarios 17). |
| `npm test` | 48 pruebas del ETL pasan (snapshot sintético, no se conecta a nada). Desde la raíz, `npm test` corre las del motor de fórmulas en `lib/domain/`. |
| `npm run load:verify -- --snapshot 20261016-222126-full` | «Verificación: OK» (25/25, 19/19, 1/1). Solo en la máquina que tiene ese snapshot; si no, ver §12.2. |

---

## 7. Cliente Prisma de Strapi

Vive en el paquete aislado [`etl/`](../../etl/README.md) (npm propio, fuera del build de la app), con uso documentado en [`etl/README.md`](../../etl/README.md):

- `etl/prisma/strapi/schema.prisma`: 52 modelos con nombres idénticos a las tablas (snake_case). Validado y generado.
- `etl/prisma.strapi.config.ts`: config de Prisma 7; arma la URL con las variables `DATABASE_*_STRAPI` del `.env` de la raíz.
- `etl/generated/strapi/`: cliente generado (gitignored; se regenera con `npm run strapi:generate`).
- `etl/src/strapi/client.ts`: `createStrapiClient()` con el adaptador `@prisma/adapter-mariadb`, SSL validado con `etl/certs/rds-global-bundle.pem`, pool de 2 conexiones como máximo y una extensión que bloquea toda escritura. Rechaza usuarios que empiecen con `adm` (el de Strapi).
- `etl/src/strapi/ping.ts`: conexión, SSL y permisos; se detiene si el usuario tiene algo más que `SELECT`.
- `etl/src/strapi/check.ts`: verificación de solo lectura (conteos contra el manual, columnas, `document_id` repetidos). **Pasa** contra la base real.
- `etl/src/strapi/distinct-values.ts`: valores distintos de las columnas que pasan a enum.

No se instaló en la raíz porque el pnpm global (9.15.4) no lee el `pnpm-workspace.yaml` del repo (`allowBuilds` es de pnpm 10+) y para no tocar el build de Vercel.

Reglas:

- **Solo lectura.** Conectar con un usuario MySQL que tenga únicamente `SELECT` sobre la base `strapi`.
- **Nunca** correr `prisma migrate`, `prisma db push` ni `prisma migrate reset` contra `strapi`, `dbo_stage` ni `dbo`. Son bases de producción y compartidas.
- El esquema se escribió a mano desde el inventario del manual y ya se validó contra la base real con `strapi:check`. Si Strapi cambia de estructura, comparar con `npm run strapi:pull:print` (nunca `db pull` sin `--print`: sobrescribe el esquema).
- Cargas completas (todas las unidades) **fuera de 7:00–19:00 (UTC-6)**: es la misma base que usa Strapi en producción.
- El cliente no se importa desde la app Next.js: es para scripts de ETL.

---

## 8. Próximos pasos

El plan completo por fases (decisiones, esquema nuevo, carga, push, app, workers, corte y limpieza) está en [`ROADMAP.md`](./ROADMAP.md). Sus casillas de la Fase 1 siguen sin marcar aunque la fase está terminada (ver §6); la Fase 2 sí está marcada.

Hechos ya: ~~verificar el cliente de Strapi~~ (Fase 1), ~~esquema limpio de Postgres para la app~~ (Fase 2), ~~revisar si el Postgres de staging tiene las tablas del push~~ (§11.3), ~~carga inicial Strapi → `msp_app`~~ (Fase 3, §12), ~~`lib/domain/` con el motor de fórmulas y su contexto de bloque~~ (19 oct), ~~reporte de diferencias de fórmulas~~ (§12.8).

Lo inmediato:

1. **Refrescar la carga de la Fase 3.** `msp_app` refleja Strapi al 16 oct 22:21. Desde `etl/`, **fuera de 7:00–19:00 (UTC-6)**: `npm run load -- --dry-run` (lee un snapshot nuevo del RDS, carga y hace ROLLBACK), y si cuadra, `npm run load -- --snapshot <el que acaba de crear>` para el COMMIT sin volver a leer el RDS. Es idempotente: solo inserta, actualiza o borra lo que cambió. El usuario ya autorizó esta carga en espejo hacia `msp_app`; avisarle del resultado.
2. **Confirmar en el warehouse el origen de las diferencias de fórmulas** (§12.8). El warehouse MySQL está en el mismo RDS que `strapi` (bases `dbo_stage` y `dbo`), pero `j_stage_admin` solo tiene `SELECT` sobre `strapi`. Hace falta que un administrador ejecute `GRANT SELECT, SHOW VIEW ON dbo_stage.* TO j_stage_admin` (no lo hace el agente). Con eso: correr `strapi:ping` para confirmar que sigue siendo solo lectura, y comparar `housing_units.cuota` de unos bloques de Interior 2026 y lotes 2024–2025 contra lo que tenía Strapi.
3. **Confirmar el destino de escritura** (decisión 9): si el ETL/push nuevo escribe en `dbo_stage` de staging y con qué usuario. Si sí, crear su cliente Prisma **sin migraciones** (introspección con `db pull --print` y esquema a mano, como el de Strapi; nunca `migrate`/`db push` sobre `dbo_stage`), con una conexión de escritura separada de la de solo lectura.
4. Revisar en el repo `n8n-manager` el workflow **Sync Block Worker** (`yBuM3XVk36DwRgbs`): cómo inserta en `housing_units`, si manda `id` explícito (choca con `IDENTITY ALWAYS`, §11.4) y si devuelve el ID nuevo a Strapi. Define cómo asignar `legacyId` a unidades nuevas.
5. **Fase 4:** mapeador puro bloque + unidades → filas del warehouse, con prueba de paridad contra lo que n8n dejó en el `dbo_stage` de MySQL (requiere una forma de leerlo: hoy no hay conexión a MySQL `dbo_stage`).
6. Workers BullMQ en Railway: contadores de bloque (debounce por `jobId`), tipo de cambio Banguat (repetitivo cada 6 h), sincronización hacia `dbo_stage`.

---

## 9. Preguntas abiertas

- ~~¿Dónde está "la base de Strapi en mi db" (16 oct) y se usa como fuente de la Fase 3?~~ Resuelto el 16 oct: el usuario eligió el **RDS** (`strapi`, solo lectura) como fuente del ETL.
- ¿Quién corrige en Strapi los datos que el ETL cargó con parche (§12.5): las 620 unidades sin bloque, los 2 bloques de El Paraíso Fase 2 sin proyecto y las 42 unidades con `code` repetido? ¿Y qué hace la app nueva con los padres «No definido» (ocultarlos, una pantalla para reasignar)? Mientras no se corrija en Strapi, cada carga los vuelve a dejar igual.
- ¿El `dbo_stage` del Postgres de staging es el destino del ETL/push nuevo? ¿Para qué es el esquema `dbo` de ese mismo servidor (sin acceso para `j_stage_admin`)? ¿Las 5 tablas `sec_*` (mercado secundario) entran al alcance de la migración?
- `dbo_stage` de staging no tiene las 3 llaves foráneas unidades → universo que sí tiene `dbo` (§11.4). ¿Es intencional?
- ¿`dbo` en MySQL y `dbo` en Postgres de producción son realmente idénticos? ¿Y el `dbo_stage` de MySQL tiene la misma estructura que `dbo`?
- ¿Otros proyectos **escriben** en las tablas de Market Scan dentro de `dbo` (`housing_*`, `office_*`, `industrial_*`, `banking_info`) o solo las leen?
- El usuario dijo primero que los tableros "ya no leerán el warehouse MySQL" y después que ambos `dbo` se usan. Confirmar quién lee cada uno.
- ¿El ETL hacia `dbo_stage` es carga única o reemplaza al push de forma permanente? ¿Todos los bloques o por selección?
- ¿Se migran las contraseñas (`up_users.password`, bcrypt) a la app nueva? El ETL las copia tal cual a `user.password_hash` (no se imprimen en reportes) y no migra `reset_password_token`. Confirmar con el usuario.
- Red: ¿Railway puede llegar al RDS MySQL? (probablemente requiere IPs de salida fijas o túnel).

---

## 10. Hallazgos a tener en cuenta

- **IVA "Venta" (0.916):** el manual dice "dividir entre 0.916", pero el código **multiplica** cuando la tasa es menor que 1 (`lib/domain/units/formulas.ts`, `removeVat`). Desde v1.25.0 la tasa depende de la operación: venta 0.916, renta ÷1.12, mantenimiento sigue al uso.
- Webhooks de n8n sin autenticación: Block Edit Queue, Chat Sessions API y el Chat Trigger del Copilot.
- La conexión de Strapi a MySQL usa SSL sin validar el certificado (`DATABASE_SSL_REJECT_UNAUTHORIZED=false`).
- El pull de n8n no tiene reversa y borra del CRM las unidades que no estén en el warehouse.
- **Pendientes del esquema de la app (Fase 2):** los enums con `@map` (`Availability.Not_Available` ↔ `"Not Available"`, `OfficeClassification.Micro_1` ↔ `"Micro 1"`, …) necesitan un mapeo explícito al cargar desde Strapi y al exponer DTOs; el índice único parcial "una sola corrida de sync activa" no está modelado (Prisma no lo soporta; agregarlo a mano en una migración); `m2_range` de oficinas y la calidad industrial quedaron como texto porque Strapi tiene variantes sucias.
- **Permisos en staging:** `j_stage_admin` tiene `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` sobre todo `dbo_stage` (incluidas las `sec_*`). El ETL igual abre `dbo_stage` en solo lectura hasta que el usuario confirme la decisión 9.
- **Inventario de producción desactualizado:** `inventario-produccion.md` todavía nombra `STRAPI_DATABASE_URL` y no registra el Postgres de staging (`railway`, esquemas `msp_app`/`dbo_stage`/`dbo`). Solo el usuario puede editarlo.

---

## 11. El Postgres de staging (Railway)

Servidor de la migración. Base `railway`, Postgres 18.6. Conexión `DATABASE_URL_DBO_STAGE`, usuario `j_stage_admin` (no es superusuario; no puede crear bases, roles ni esquemas). El usuario confirmó que no es producción y que no aloja el `dbo` de los otros proyectos.

### 11.1 Cómo conectarse (ya resuelto en `etl/`)

- Railway firma con una **raíz propia** y el certificado se emite para `localhost`. `npm run stage:cert` guarda la raíz en `etl/certs/dbo-stage-ca.pem` (solo negocia TLS, no manda credenciales). Las conexiones con `pg` validan la cadena contra ella y omiten solo la comprobación del nombre (`etl/src/stage/connection.ts`).
- El CLI de Prisma exige que el nombre coincida, así que `etl/src/app/prisma-cli.ts` abre un **proxy TCP local** y Prisma se conecta a `localhost` con `sslaccept=strict` (TLS de punta a punta). El proxy bloquea `migrate reset`, `db push`, `--force-reset` y `--accept-data-loss`.
- Prisma 7.10 no admite adaptador en el CLI, por eso el proxy. Las migraciones nuevas se generan con `migrate diff --from-config-datasource` (no hay base shadow: el usuario no puede crear bases). Receta en `etl/README.md`.
- Sesiones: `dbo_stage` se abre con `default_transaction_read_only=on` (`stageClientConfig()`); la app usa `search_path=msp_app` (`appPoolConfig()`, `createAppClient()`).
- El rol tenía un límite de conexiones bajo; el usuario lo ajustó (15 oct). Mantener pools pequeños (2).

### 11.2 Esquemas (16 oct 2026)

| Esquema | Dueño | Contenido | `j_stage_admin` |
|---|---|---|---|
| `msp_app` | `j_stage_admin` | App nueva: 30 modelos (incluye `etl_run`) + `_prisma_migrations`, con los datos de la carga del 19 oct (§12). **Único destino de migraciones de Prisma.** | Dueño |
| `dbo_stage` | `postgres` | 5 tablas `sec_*` (mercado secundario, con datos) + 11 tablas del warehouse (vacías) | Lectura y escritura |
| `dbo` | `postgres` | 11 tablas del warehouse (vacías) | Sin acceso (ni `USAGE`) |
| `public` | `pg_database_owner` | Vacío | Uso |

El agente **no creó ningún esquema**: `msp_app` lo creó el usuario/administrador, y las tablas de `dbo` y del warehouse en `dbo_stage` también. El agente solo creó las tablas de `msp_app` con las migraciones de Prisma (`init` el 15 oct, `etl_run` el 19 oct) y las llenó con el ETL.

### 11.3 Tablas del push de n8n: están todas

El Sync Block Worker escribe, en una transacción, en 11 tablas del `dbo_stage` de MySQL. Las 11 existen en `dbo_stage` y en `dbo` del servidor de staging, vacías (`n_tup_ins = 0`):

| Dominio | Tablas |
|---|---|
| Vivienda | `housing_universe`, `housing_units`, `housing_amenities`, `housing_services`, `banking_info` |
| Oficinas | `office_universe`, `office_units`, `office_amenities` |
| Industrial | `industrial_universe`, `industrial_units`, `industrial_amenities` |

Contra el mapeo Strapi → warehouse del manual (§5) **no falta ninguna columna**: varas, `_qtz`, mantenimiento, cuota, ingresos, absorción, las amenidades y las 18 tasas de `banking_info`. `cod_proyecto` es texto (`varchar(100)` / `varchar(255)`), así que caben `legacyId` y `documentId`. No se pudo comparar contra el DDL del MySQL porque no hay conexión a esa base; la referencia fue el manual.

`dbo_stage` y `dbo` tienen **las mismas columnas**. Diferencias: `dbo_stage` **no tiene las 3 llaves foráneas** unidades → universo (`housing_units`, `office_units`, `industrial_units` por `(cod_proyecto, periodo)`), y sus índices tienen nombres autogenerados (`*_cod_proyecto_key`, `*_idx`) en vez de los de `dbo` (`uk_*`, `uq_*`, `fk_*`, `idx_*`). Parece creado con `CREATE TABLE … (LIKE dbo.… INCLUDING ALL)`, que no copia llaves foráneas.

### 11.4 Diferencias con el MySQL que rompen el SQL actual del push

- **`id` es `IDENTITY ALWAYS`** en las 11 tablas: Postgres rechaza un `id` explícito salvo con `OVERRIDING SYSTEM VALUE`. Importa porque las unidades se enlazan por `legacyId = housing_units.id`: para cargar histórico o reinsertar unidades con su `id`, usar esa cláusula o pasar a `BY DEFAULT`.
- **Columnas con eñe, tilde o mayúscula** que hay que citar con comillas dobles: `housing_units."tamaño_unidad"`, `"tamaño_total"`, `"tamaño_balcon_terraza"`, `"tamaño_parqueo"`; `industrial_units."categoría"`, `"Disponible"`; `office_units."clasificacion_general_por_tamaño"`, `"leyenda_tamaño_cantidad_empleados"`, `"leyenda_tamaño_m2"`. Sin comillas, `Disponible` se vuelve `disponible` y falla.
- **Amenidades `boolean`** (en MySQL eran 0/1): insertar el entero `1` falla. `housing_services` sí es `integer` (default 1).
- **Industrial difiere del resto:** `cod_proyecto` es `char(64)` (rellena con espacios) y los precios y medidas son `real` (pierden precisión), no `numeric`. Existe la columna `precio_total_qzl` (con esa ortografía).
- **Orden:** en `dbo`, las unidades tienen FK a su universo; insertar el universo primero (como hoy). Al borrar: vivienda e industrial `RESTRICT`, oficinas `CASCADE`.
- `created_at` / `creation_date` son `timestamp without time zone`.

### 11.5 Las tablas `sec_*` (mercado secundario) y los valores de enums

No son del push. Es un dataset de mercado secundario importado de un Excel (`sec_universe.fuente_origen = excel_consolidado_sec`, cargado el 21 sep 2026): `sec_universe` (3,350), `sec_unit` (78,933) y sus hijas 1:1 `sec_unit_housing` (56,630), `sec_unit_office` (16,620), `sec_unit_industrial` (5,683). `cod_proyecto` es `bigint` (2–3374), así que no admite `documentId`. Calidad: `periodo`, `mercado` y `departamento` en NULL en todas las filas; `uso` mezcla "Renta"/"renta"/"Alquiler"/"Rento"/"Remta"; `fecha_recoleccion` va de 1900 a 2223. Sin decisión sobre si entran a la migración.

Valores reales de Strapi usados para los enums de `msp_app` (leídos el 15 oct con `distinct-values.ts`): `quarter` T1–T4, S1, S2; `domain` housing/office/industrial; `market` Primary/Secondary/null; `block_usage` Venta/Renta/null; `availability` Available/Not Available; 18 bancos (`lib/financing.ts`, incluye `ownerFinancing`); monedas con datos: gtq, mxn; `up_roles.type`: authenticated, public, operator, supervisor, administrator, super_administrator; 17 usuarios, todos `local`.

### 11.6 Reglas específicas de este servidor

- Migraciones de Prisma **solo** en `msp_app` (`npm run app:deploy`). El SQL de una migración nueva no debe mencionar `dbo_stage` ni `dbo` ni crear esquemas.
- `dbo_stage` y `dbo`: no crear, alterar ni borrar nada desde el agente. Escribir datos en `dbo_stage` solo cuando el usuario lo confirme (decisión 9).
- Nunca `migrate reset`, `db push` ni `db pull` sin `--print` contra este servidor.

---

## 12. Fase 3: el ETL Strapi → `msp_app` (para retomar)

Código en `etl/src/load/`; uso detallado en [`etl/README.md`](../../etl/README.md) → «Carga Strapi → msp_app». Se escribió el 16 oct y se ajustó hasta la carga real del 19 oct. El usuario pidió que fuera **mantenible porque se seguirá actualizando**, y que se cuidaran en especial las relaciones: que lo insertado tenga sentido con lo que hay en Strapi.

### 12.1 Decisiones del usuario (no cambiarlas sin preguntarle)

| Fecha | Decisión | Cómo quedó en el código |
|---|---|---|
| 16 oct | Fuente: el **RDS** (`strapi`), solo lectura. | `extract.ts` con el cliente de solo lectura de la §7. |
| 16 oct | Ante conflictos: *"crealo como un trigger que si falla venga y me reporte el error y porque y quite los datos que ya se transfirieron esto para que la transferencia sea limpia y que las relaciones sean claras"*. | Una sola transacción. Si hay una incidencia fatal, no se escribe nada; si algo falla al escribir o verificar, ROLLBACK completo. El motivo queda en consola, en el reporte JSON y en `etl_run`. |
| 19 oct | Permitir la lectura del RDS en horario laboral cuando él lo decida. | Flag `--allow-business-hours` (más lento: 500 ms entre lotes). Sin el flag, la lectura completa entre 7:00 y 19:00 se rechaza. |
| 19 oct | *"a los que no tienen relacion pero es obligatorio crea un campo llamado no definido, y con codigo repetido Cargar con el código vacío y reportar"*. | Unidad sin bloque → bloque «No definido» de su tipo; bloque sin proyecto → proyecto «No definido»; `code` repetido → NULL en **todas** las copias. Las tres son advertencias (no bloquean) y quedan en el reporte. |
| 19 oct | Carga real ya con el snapshot del 16 oct, refrescar después con uno nuevo leído de noche. | Hecho; el refresco está pendiente (§8). |
| 19 oct | Campos de fórmula: cargar en `msp_app` el valor recalculado con la fórmula de la hoja y dejar el original de Strapi en el reporte. Lo que Strapi no trae (vacío) queda vacío. | `applyFormulas()` en `formulas.ts`, en `validate`, `run` y `verify`. Solo reemplaza lo que la hoja marcaría en amarillo (diferencia > 0.01). Originales en `etl/reports/formulas-<fecha>.csv` (columna `_stored`). Cargado con COMMIT el 19 oct: 123,442 unidades cambiadas. |

### 12.2 Cómo se corre

Siempre desde `etl/` (desde la raíz el script no existe):

| Comando | Qué hace |
|---|---|
| `npm run load:validate` | Extrae y valida; no escribe en `msp_app`. |
| `npm run load -- --dry-run` | Extrae, valida, escribe, verifica y hace ROLLBACK. |
| `npm run load` | Igual, pero con COMMIT si todo cuadra. |
| `npm run load:verify` | Compara `msp_app` contra Strapi sin escribir. |
| `npm run load:formulas -- --snapshot <nombre>` | Recalcula las unidades con el motor de la hoja y reporta diferencias (§12.8). No abre conexión a `msp_app`. |
| `npm test` | 48 pruebas con snapshot sintético (`fixtures.ts`). |

Flags: `--snapshot <nombre>` reusa `etl/.snapshots/<nombre>` y **no lee el RDS** (vale a cualquier hora); `--sample <doc,doc>` solo esos bloques y sus unidades (siempre dry-run); `--allow <cat,cat>` acepta categorías fatales excluyendo la fila y sus dependientes; `--dry-run`; `--allow-business-hours`; `--allow-mass-delete` (ver el freno en §12.3, paso 4). **Sin `--snapshot`, cualquiera de los comandos lee las 52 tablas del RDS de producción** (~12 min): hacerlo de noche.

Snapshot actual: `20261016-222126-full` (solo en la máquina del usuario). Los reportes quedan en `etl/reports/<fecha>-<id>.json` con cada incidencia (tabla, id, `document_id`, motivo).

### 12.3 Cómo funciona

1. **Extracción** (`extract.ts`, `snapshot.ts`): 52 tablas por lotes de 2,000 con cursor por `id`, pool ≤ 2, a NDJSON en `etl/.snapshots/`.
2. **Validación** (`validate.ts`, categorías en `model.ts` → `CATEGORIES` / `WARNING_CATEGORIES`): elige la única fila publicada de cada `document_id` (draft & publish) y resuelve cada `_lnk` y `_cmps`. Fatales: `documento-sin-id`, `documento-duplicado`, `sin-publicar`, `campo-obligatorio-vacio`, `enum-desconocido`, `iso-duplicado`, `usuario-duplicado`, `relacion-ambigua`, `relacion-rota`, `rol-invalido`, `componente-desconocido`, `tipo-unidad-multiple`, `tipo-unidad-roto`, `financiamiento-multiple`, `financiamiento-roto`, `moneda-rota`. Advertencias: `unidad-sin-bloque`, `bloque-sin-proyecto`, `codigo-duplicado` (decisión del 19 oct), `tipo-unidad-distinto-al-bloque` y `componente-compartido`.
3. **Transformación** (`transform/*.ts`): funciones puras por dominio que devuelven filas con los nombres de columna de `msp_app` (`specs.ts` define las 25 tablas, columnas, tipos, clave y únicos). Las relaciones se expresan por `public_id` (= `document_id` de Strapi) del padre, nunca por `id` numérico. Después, los campos de fórmula de cada unidad se recalculan con el motor de la hoja y el valor recalculado reemplaza al de Strapi cuando difiere (decisión del 19 oct, §12.8).
4. **Escritura** (`write.ts`): una transacción con `pg_try_advisory_xact_lock` (no corren dos cargas a la vez), upsert por `public_id` en orden de dependencias y lotes de 2,000, liberación previa de únicos (`code`, `username`, `email`) para permitir intercambios, reemplazo de hijas (financiamiento, tasas, monedas, tipos de unidad, amenidades, servicios) y **prune espejo**: lo que ya no está publicado en Strapi se borra de `msp_app`. **Freno** (19 oct, `massDeletions()`): si una tabla quedaría vacía o perdería más del 5 % y más de 50 filas, ROLLBACK salvo `--allow-mass-delete`. Además, `readSnapshot` rechaza un snapshot cuyas filas no coincidan con los conteos de su `meta.json`.
5. **Verificación** (`verify.ts`), antes del COMMIT: cada tabla columna por columna contra la transformación; las 19 relaciones recalculadas **por separado** desde el snapshot crudo (no reusa la lógica de `validate.ts`) y comparadas con JOINs en `msp_app`; por bloque, número de unidades y suma de `total_price_usd` en centavos. Cualquier diferencia → ROLLBACK.
6. **Reporte** (`report.ts`): consola, JSON en `etl/reports/` y fila en `msp_app.etl_run` por una conexión aparte (sobrevive al ROLLBACK). Estados: `running`, `validated`, `committed`, `rolled_back`, `aborted`, `failed`.

### 12.4 Los padres «No definido» y los códigos vacíos

- Proyecto `public_id = 'etl-no-definido'` y bloques `etl-no-definido-housing|office|industrial` (`model.ts`: `UNDEFINED_PROJECT`, `undefinedBlock()`), todos con `name = 'No definido'` y el resto de columnas en NULL. Una unidad sin `unitType` va al de `housing`. Solo se crean si hay huérfanos; con los datos actuales existen el proyecto y el bloque `housing`.
- `verify.ts` calcula por su cuenta, desde el snapshot crudo, qué filas deben caer en ellos (`undefinedParents()`), así que una asignación equivocada hace fallar la carga.
- Si en Strapi se corrige un huérfano, la siguiente carga lo mueve a su padre real; si un «No definido» queda sin hijos, el prune lo borra.
- El `code` repetido se vacía en todas las copias porque no hay forma confiable de saber cuál es la buena. Cuando en Strapi deje de repetirse, la siguiente carga lo llena.

### 12.5 Datos reales (snapshot del 16 oct)

664 advertencias, 0 fatales, 0 filas excluidas:

- **620 unidades sin bloque:** sin ningún vínculo en `units_block_lnk`. Por proyecto de origen (según su `code`): Vía al Valle 114, Castitell Torre 2 98, Terra Alta 70, El Paraíso Fase 2 53, Bella Fe 27, y otros. Parecen restos de reimportaciones.
- **2 bloques sin proyecto:** El Paraíso Fase 2 Sector 1 (id 3529, 53 unidades) y Sector 2 (id 3548, 82 unidades), editados en octubre.
- **42 unidades con `code` repetido:** copias exactas (Cittah, La Cascada, San Andrés, Camantulul, Puerta del Istmo) y oficinas distintas con el mismo código (Petapolis Oficinas Torre C).

### 12.6 Para extender el ETL

- **Columna nueva:** agregarla a `prisma/schema.prisma` y crear la migración (receta en `etl/README.md`; aplicar con `npm run app:deploy` solo en `msp_app` y con confirmación del usuario), luego a `specs.ts` y al mapeador de `transform/`. La verificación por tabla la cubre sola.
- **Relación nueva:** además, agregarla a `LINKS` o `SET_LINKS` en `verify.ts` para que se compare contra el `_lnk` crudo.
- **Categoría de incidencia nueva:** `model.ts` (`CATEGORIES`, y `WARNING_CATEGORIES` si no debe bloquear) y una prueba en `load.test.ts`.
- Después: `npm test`, `npx tsc --noEmit`, `npm run load -- --snapshot <nombre> --dry-run` y `graphify update .` desde la raíz.

### 12.7 Trampas conocidas

- `prisma migrate diff` no imprime nada en PowerShell: correrlo con `cmd /c` y `--config prisma.app.config.ts`, redirigiendo la salida con `>` (no `Out-File`, que cambia la codificación).
- El revisor automático bloquea comandos que combinan `Remove-Item -Recurse -Force` con otros: borrar carpetas temporales en un comando aparte.
- `npm` muestra el aviso `Unknown env config "devdir"`: es del entorno del usuario, no afecta.
- `lib/domain/` se importa desde `etl/` con extensión `.ts` (`allowImportingTsExtensions` en `etl/tsconfig.json`). Esos archivos no pueden usar alias `@/` ni importar React: el ETL no los resolvería.
- La Fase 1 contó 238,880 unidades (15 oct, §6) y el ETL cargó 238,226. No es pérdida del ETL: el snapshot guarda la tabla `units` completa, sin filtrar, y el 16 oct tenía 238,226 filas, todas publicadas. La diferencia (654) ocurrió en Strapi entre las dos lecturas (probablemente borrados por reimportación). Si importa, confirmarlo con un conteo nuevo.

### 12.8 Reporte de diferencias de fórmulas (19 oct)

`npm run load:formulas -- --snapshot <nombre>` (`etl/src/load/formulas.ts`) genera solo el reporte, sin conectarse a `msp_app`; `validate`, `run` y `verify` lo generan también y además aplican el recálculo. Toma la transformación de la carga, arma cada unidad como la ve la hoja (contexto del bloque con `lib/domain/units/context.ts`: categoría, trimestre, ISO del país, fechas y uso de la unidad) y corre `ensureUnitFormulasSynced`. Una diferencia es lo mismo que la hoja pinta de amarillo al abrir el bloque: más de 0.01 en un campo de `RECONCILED_FORMULA_FIELDS`. Las unidades de padres «No definido» no tienen contexto y se cuentan aparte. Salida: `etl/reports/formulas-<fecha>.json` (totales, por campo con ejemplos, por período y dominio, los 20 bloques con más diferencias) y `.csv` (una fila por unidad con diferencias, guardado y esperado por campo).

Con el snapshot del 16 oct: **237,471 unidades revisadas** (755 sin contexto, 0 sin categoría), **123,446 con diferencias (52 %)**, 114,025 limpias.

| Campo | Unidades | Lo que muestra el CSV |
|---|---:|---|
| `incomeUSD` / `installmentUSD` | 97,799 / 91,919 | Interior 2026 (S1, S2): razón fija 0.664 en ~85 mil unidades. Es exacto PMT(7.5 %, 20 años) ÷ PMT(8 %, 10 años), ambos al 90 %: los datos se calcularon con **8 % a 10 años** y la hoja usa 7.5 % a 20. En 2026 T1–T2, razón 0.993. En oficinas e industrial nunca se calculó (vacía). |
| `maintenancePricePerM2USD` | 37,840 | Razones dispersas (0.90–0.94) en períodos viejos; ya documentado en `formulas.ts`: hasta 2026 2T la captura no seguía una fórmula. 2026 T3 vivienda: 97 % coincide. |
| `absorptionPerM2` / `unitAbsorption` | 24,911 / 6,984 | Dispersas: dependen de las fechas del bloque (si cambiaron después de calcular) y del tamaño usado. |
| `priceWithoutVATUSD` / `pricePerM2USD` | 7,689 / 5,855 | 2024–2025 S vivienda: razón fija 0.975 = guardado ×0.916 contra ÷1.12 de la hoja (regla «Interior + Lote → 1.12»). Del resto, la mayoría es redondeo (razón 1.000). |
| `totalSizeM2`, `habitableConstructionM2`, `unitSizeM2`, `parkingSizeM2`, `rentalPriceWithoutVATUSD` | < 1,500 cada uno | Casos sueltos; la mitad, campos vacíos en la base. |

**De dónde vienen las dos diferencias grandes** (cruzado con `legacy_id` y `updated_at` en el snapshot): las 85,176 cuotas con razón 0.664 son **todas** unidades con `legacy_id`, es decir, importadas del warehouse MySQL. Todas tienen `updated_at` de octubre 2026. Eso coincide con una corrida del pull (workflow «Sync Pull Block Worker», que copia `cuota`/`ingresos` tal cual, §5), pero es una inferencia: el snapshot no dice qué proceso las tocó. Las unidades de Interior 2026 nacidas en el admin coinciden con la hoja en el 99 %. Los lotes de Interior 2024–2025 son todos «Lotes para vivienda», también legacy, con IVA 0.916 y cuota 8 %/10 años (razón 0.647 = 0.975 × 0.664). O sea: el warehouse calculaba Interior con 8 % a 10 años y los lotes con 0.916; el admin (desde junio 2026 como mínimo, ver `CHANGELOG.md` y `.migration/`) usa 7.5 % a 20 años y 1.12, y nunca recalculó lo importado. Falta confirmarlo leyendo `housing_units` del warehouse.

Por período: 2026 T3 vivienda 25 % con diferencias, 2026 S1 vivienda 71 % (la cuota), 2026 T4 oficinas 0 %. **Decisión del usuario (19 oct):** la carga guarda en `msp_app` el valor recalculado y deja el original en el reporte (§12.1). La carga real con COMMIT cambió 123,442 unidades: cuota 91,558, ingreso 97,438, mantenimiento por m² 37,020, absorción por m² 24,904, precio sin IVA 7,684 y el resto en menor número. 2,771 diferencias contra campos vacíos se dejaron vacías. Strapi no cambia: la hoja del admin seguirá marcando esas celdas en amarillo hasta que alguien guarde los bloques.
