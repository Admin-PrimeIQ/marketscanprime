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

Documento de traspaso para que otra persona o agente de IA continúe el trabajo sin releer la conversación original (15 y 16 oct 2026). Resume el sistema actual, lo que se decidió, lo que ya está hecho y lo que falta.

**Para retomar rápido:** lee la sección 0, luego la §6 (estado), la §11 (el Postgres de staging, donde ocurre todo lo nuevo) y la §8 (próximos pasos). Después corre, desde `etl/`, los chequeos de solo lectura de la §6.1 para confirmar que el estado sigue igual.

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

Al 16 oct 2026. Todo está commiteado en `main` (último commit `d7045a6`). **No se ha hecho `git push`** de este trabajo por parte del agente; no hacerlo sin pedido explícito.

| Hecho | Detalle |
|---|---|
| graphify instalado | CLI 0.9.89, grafo en `graphify-out/`, regla `.cursor/rules/graphify.mdc` |
| `.env` (raíz, ignorado por git) | Variables del backoffice (`NEXT_PUBLIC_STRAPI_URL`, `STRAPI_USERNAME`, `STRAPI_PASSWORD`, `SYNC_API_URL`, `SYNC_API_KEY`: **el agente nunca las usa**), `DATABASE_HOST_STRAPI` / `DATABASE_PORT_STRAPI` / `DATABASE_NAME_STRAPI` / `DATABASE_USER_STRAPI` / `DATABASE_PASSWORD_STRAPI` (MySQL `strapi`, usuario solo `SELECT`) y `DATABASE_URL_DBO_STAGE` (Postgres de staging). `STRAPI_DATABASE_URL`, que mencionan versiones viejas de los documentos, ya no se usa. No imprimir valores del `.env`. |
| **Fase 1: cliente Prisma de Strapi** | **Terminada y verificada contra la base real** (15 oct). `npm run strapi:check`: los 52 modelos se leen sin error (cada uno lee una fila completa, así que una columna faltante fallaría), 0 borradores duplicados en las 5 colecciones con `document_id`. Diferencias con el manual por base viva: proyectos +13, unidades +~700 (238,880), bloques −2; ~688 unidades sin bloque. Ver §7. |
| Valores reales de enums | `etl/src/strapi/distinct-values.ts` (solo lectura). Valores en §11.5; con ellos se fijaron los enums del esquema de la app. |
| Conexión al Postgres de staging | TLS 1.3 con la raíz de Railway fijada en `etl/certs/dbo-stage-ca.pem`; sesión de solo lectura para `dbo_stage`. Ver §11.1. |
| **Fase 2: esquema de la app** | `prisma/schema.prisma` (29 modelos, 30 tablas con `_prisma_migrations`) y la migración `prisma/migrations/20261015210000_init`, aplicada en `msp_app` el 15 oct 2026. `migrate status`: al día; `migrate diff` contra la base: sin diferencias. Tablas vacías. Se opera desde `etl/` con `npm run app:*` (ver `etl/README.md`). |
| Revisión del warehouse en Postgres | 15–16 oct: comparadas las tablas del push de n8n contra el servidor de staging. Resultado en §11.3 y §11.4. |
| **Fase 3: ETL Strapi → `msp_app`** | 16 oct: escrito en `etl/src/load/` (`npm run load:validate` / `load` / `load:verify`; ver `etl/README.md` → «Carga Strapi → msp_app»). Fuente: el RDS (`strapi`), solo lectura. Política acordada con el usuario: ante cualquier incidencia no se escribe nada y se reporta qué y por qué; si algo falla durante la carga o la verificación, ROLLBACK completo. `--allow <categoría>` excluye las filas afectadas y sus dependientes. Decisión del usuario (19 oct): unidades sin bloque y bloques sin proyecto van a un padre «No definido» y los `code` repetidos se cargan vacíos, todo reportado como advertencia. 33 pruebas con snapshot sintético pasan. Snapshot completo del RDS leído (16 oct): 664 advertencias, 0 bloqueantes; dry-run sin `--allow` con verificación 25/25 tablas, 19/19 relaciones, 1/1 agregados y ROLLBACK. **19 oct: primera carga real (COMMIT) en `msp_app` con el snapshot del 16 oct**: 1,135 proyectos, 1,688 bloques, 238,226 unidades, 17 usuarios (incluye los padres «No definido»); `load:verify` posterior OK. Migración `20261016120000_etl_run` aplicada (bitácora en `msp_app.etl_run`). |

### 6.1 Chequeos de solo lectura para confirmar el estado

Desde `etl/` (requieren el `.env` de la raíz; ninguno escribe):

| Comando | Qué debe dar hoy |
|---|---|
| `npm run strapi:check` | 52 modelos sin ERROR, 0 borradores. Correr fuera de horas pico si es posible (lee la base de producción, pool ≤ 2). |
| `npm run stage:ping` | Usuario `j_stage_admin`; esquemas `dbo` (11 tablas, sin acceso), `dbo_stage` (16 tablas, lectura y escritura), `msp_app` (30, dueño), `public` (0); las 11 tablas del push presentes en `dbo` y `dbo_stage`. |
| `npm run stage:describe` | Estructura de `dbo_stage`; `-- --schema dbo` para el otro esquema. Las 11 tablas del warehouse con `vivas≈0 insertadas=0`. |
| `npm run app:status` | "Database schema is up to date!" |
| `npm run app:ping` | `current_schema = msp_app`, conteos en 0 (hasta que empiece la Fase 3). |

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

Hechos ya: ~~verificar el cliente de Strapi~~ (Fase 1), ~~esquema limpio de Postgres para la app~~ (Fase 2), ~~revisar si el Postgres de staging tiene las tablas del push~~ (§11.3).

Lo inmediato:

1. **Aclarar con el usuario** (16 oct dijo: "ya tengo la base de strapi en mi db"). En el catálogo verificado solo aparecen las 11 tablas del warehouse **vacías** en `dbo_stage` y `dbo`; no se ve una copia de las tablas de Strapi en el servidor de staging. Preguntar dónde quedó esa base (¿otro servidor o base?, ¿qué variable del `.env`?) y si reemplaza a la lectura del RDS para la Fase 3. **No leer el `.env` para averiguarlo**: preguntar.
2. **Confirmar el destino de escritura** (decisión 9): si el ETL/push nuevo escribe en `dbo_stage` de staging y con qué usuario. Si sí, crear su cliente Prisma **sin migraciones** (introspección con `db pull --print` y esquema a mano, como el de Strapi; nunca `migrate`/`db push` sobre `dbo_stage`), con una conexión de escritura separada de la de solo lectura.
3. **Fase 3, refrescar la carga** (primera carga hecha el 19 oct con el snapshot del 16 oct, ver §6). Fuera de 7:00–19:00 (UTC-6): `npm run load` (lee un snapshot nuevo y carga en espejo), o `npm run load -- --dry-run` primero. Pendiente de la Fase 3: el reporte de diferencias de fórmulas (recalcular con `lib/domain` y comparar con lo guardado).
4. Revisar en el repo `n8n-manager` el workflow **Sync Block Worker** (`yBuM3XVk36DwRgbs`): cómo inserta en `housing_units`, si manda `id` explícito (choca con `IDENTITY ALWAYS`, §11.4) y si devuelve el ID nuevo a Strapi. Define cómo asignar `legacyId` a unidades nuevas.
5. **Fase 4:** mapeador puro bloque + unidades → filas del warehouse, con prueba de paridad contra lo que n8n dejó en el `dbo_stage` de MySQL (requiere una forma de leerlo: hoy no hay conexión a MySQL `dbo_stage`).
6. Workers BullMQ en Railway: contadores de bloque (debounce por `jobId`), tipo de cambio Banguat (repetitivo cada 6 h), sincronización hacia `dbo_stage`.

---

## 9. Preguntas abiertas

- ¿Dónde está "la base de Strapi en mi db" que mencionó el usuario el 16 oct, y se usa como fuente de la Fase 3 en lugar del RDS?
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

- **IVA "Venta" (0.916):** el manual dice "dividir entre 0.916", pero el código **multiplica** cuando la tasa es menor que 1 (`lib/units/formulas.ts`, `removeVat`). Desde v1.25.0 la tasa depende de la operación: venta 0.916, renta ÷1.12, mantenimiento sigue al uso.
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
| `msp_app` | `j_stage_admin` | App nueva: 29 modelos + `_prisma_migrations`, vacías. **Único destino de migraciones de Prisma.** | Dueño |
| `dbo_stage` | `postgres` | 5 tablas `sec_*` (mercado secundario, con datos) + 11 tablas del warehouse (vacías) | Lectura y escritura |
| `dbo` | `postgres` | 11 tablas del warehouse (vacías) | Sin acceso (ni `USAGE`) |
| `public` | `pg_database_owner` | Vacío | Uso |

El agente **no creó ningún esquema**: `msp_app` lo creó el usuario/administrador, y las tablas de `dbo` y del warehouse en `dbo_stage` también. El agente solo creó las tablas de `msp_app` con la migración de Prisma.

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
