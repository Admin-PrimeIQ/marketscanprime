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

Documento de traspaso para que otra persona o agente de IA continúe el trabajo sin releer las conversaciones originales (15 al 22 oct y 27–28 oct 2026). Resume el sistema actual, lo que se decidió, lo que ya está hecho y lo que falta.

**Foco actual (22 oct, tarde): terminar de pulir el backend nuevo (Next.js + Prisma sobre `msp_app`).** Sesión y autorización ya están hechas con Better Auth (§14.9; v1.30.0, commit `75541cb`, subido). **El usuario estaba corriendo pruebas de penetración** sobre eso; dónde quedó esa conversación y qué sigue: **§14.10**. Después: endurecer (límite de intentos, errores genéricos, Zod) y `audit_log`. Qué hay, qué falta y en qué orden: **§14.8** y la lista con casillas [`README_Backend_full.md`](README_Backend_full.md). Decisiones que lo enmarcan: 14, 15 y 16 (§3).

**Lo más reciente (28 oct, después de las 9:15): §14.13** (límite de intentos de login y Zod, v1.31.0, sin commit; migración `login_attempt` aplicada y prueba de punta a punta 13/13; falta el navegador). Antes, **§14.12 (28 oct, 9:10):** El error **`too many connections for role "j_stage_admin"`** sigue abierto: el rol está saturado por conexiones que **no** salen de la PC del usuario (sospechoso principal: el staging de Vercel). En código ya se hizo lo que toca a la app (errores genéricos al navegador, pool que suelta conexiones inactivas y `attachDatabasePool` para Vercel), con commit `25871a7` del usuario, subido. Falta lo que hace **una persona** en Railway y en Vercel (§14.12). Antes, 27 oct: actualización de seguridad a Next.js 16.4.3, React 19.2.9 y Node 24.22.1 (v1.30.1, `d154426`, §14.11).

**Para retomar rápido:** lee la sección 0, luego la **§14.12** (28 oct: dónde quedó la conversación, qué se hizo, qué falta y qué preguntar), la **§14.11** (27–28 oct: actualización de seguridad y la primera parte del error de conexiones), la **§14.10** (dónde quedó la conversación del 22 oct a las 14:41: pruebas de penetración, qué está protegido y qué no, siguiente paso), la §14.9 (cómo se hizo la sesión con Better Auth y sus trampas), la §13 (la duda de Interior y lo ofrecido sin respuesta, de antes) y la §14 (Fase 5: la app sobre `msp_app`, con cómo correrla, desplegarla en Vercel y seguir). Lo último que se hizo (22 oct: staging en Vercel, `.env` único, certificado, cuenta `app-engteam`) y lo que quedó pendiente está en la **§14.7**. Después la §6 (estado), la §12 (el ETL Strapi → `msp_app`), la §11 (el Postgres de staging) y la §8 (próximos pasos). Para confirmar que el estado sigue igual: los chequeos de solo lectura de la §6.1 desde `etl/`, y `npm test` desde la raíz.

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

Dónde está cada fórmula del sistema (motor, hoja, n8n, warehouse): [`FORMULAS.md`](FORMULAS.md).

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

- **Strapi** es la fuente de verdad. El backoffice nunca toca MySQL: todo pasa por `lib/api/strapi.ts` (39 métodos, inventario en `ROADMAP.md` §4). Desde el 21 oct la UI no lo importa directo: llama a la fachada `dataClient` (`lib/api/client.ts`), que en producción delega en ese mismo cliente (§14).
- **El backoffice de producción vive en otro repo y con otro dominio** (dicho por el usuario el 22 oct); este repo es la copia paralela donde se construye la migración. El Strapi al que apuntaba este repo (`NEXT_PUBLIC_STRAPI_URL`) y la base MySQL `strapi` que lee el ETL **son los de producción** (confirmado por el usuario el 22 oct), los mismos que usa ese otro repo. Por eso **no se modifica nada de Strapi ni de su base** desde aquí (datos, contenido, configuración ni estructura): afectaría al otro repo. Solo lectura, con los límites de la skill `proteger-produccion`.
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
| 4 | **Prisma va en este repo** como herramienta de ETL, no dentro del runtime de la app Next.js. *Actualizada el 21 oct 2026 (decisión 10): para la Fase 5 Prisma entra también al runtime de la app, en la raíz.* |
| 5 | Primero: **cliente Prisma de Strapi** (MySQL) con todas las tablas migrables. |
| 6 | Después: **cliente Prisma de `dbo_stage`** (MySQL) para insertar lo leído de Strapi. El usuario enviará la conexión. **Hasta el corte, `dbo_stage` solo se lee; el ETL escribe en una copia sombra** (ver `ROADMAP.md`, fase 4). *Actualizada por la decisión 9: la conexión que llegó es Postgres, no MySQL.* |
| 7 | La promoción `dbo_stage` → `dbo` (MySQL y Postgres) **sigue siendo manual**, como hoy. |
| 8 | (15 oct 2026) El esquema de la app nueva vive en el **Postgres de staging de Railway** (`DATABASE_URL_DBO_STAGE`, base `railway`), en el esquema **`msp_app`**, junto al esquema `dbo_stage` de ese mismo servidor (5 tablas `sec_*`), que **solo se lee**. El usuario confirmó que nada de producción escribe en ese servidor y que no aloja el `dbo` de los otros proyectos. `msp_app` lo creó un administrador con dueño `j_stage_admin`; ese usuario no puede crear esquemas ni bases. |
| 9 | (15–16 oct 2026) El `dbo_stage` de referencia pasa a ser el **Postgres de staging**, tratado "como si fuera el `dbo_stage` de MySQL". El usuario (no el agente) creó ahí las **11 tablas del push** de n8n, vacías, en `dbo_stage` (con escritura para `j_stage_admin`) y en un esquema `dbo` (sin acceso para `j_stage_admin`). Ver §11.3. **Confirmado por el usuario (21 oct 2026):** el `dbo_stage` de este servidor es la copia sombra de la Fase 4 y el push nuevo escribe en él con `j_stage_admin`, **solo en las 11 tablas del warehouse** (§11.3); las 5 tablas `sec_*` no se tocan nunca. Las conexiones que no son del push siguen abriéndolo en solo lectura. |
| 10 | (21 oct 2026) **Prisma entra al runtime de la app**, instalado en la raíz del repo (cambia `package.json` y `pnpm-lock.yaml`; se trabaja en rama, sin merge hasta probarlo). La app lee y escribe `msp_app` desde `lib/db/`. Las migraciones se siguen aplicando desde `etl/` (`npm run app:deploy`). |
| 11 | (21 oct 2026) La implementación `prisma` de la fachada **empieza por catálogos** (valida la base con poco riesgo); auth va después. |
| 12 | (21 oct 2026) Sesión con **Auth.js** (NextAuth v5), proveedor de credenciales. *Reemplazada el 22 oct 2026 por **Better Auth** (decisión del usuario): sesión en `msp_app.session` con cookie httpOnly de 7 días renovada con el uso, login con correo o usuario, sin registro, roles con la matriz de Strapi (`lib/auth/permissions.ts`) y la clave en `account` (cuenta `credential`, la carga el ETL). Detalle en la §14.9.* |
| 13 | (21 oct 2026) **Se reutilizan los hashes bcrypt** de `up_users` (copiados por el ETL a `user.password_hash`): nadie cambia contraseña al pasar a la app nueva. |
| 14 | (22 oct 2026) **Sin fallback automático a Strapi.** El usuario propuso usar Strapi si el backend nuevo cae; se descartó porque (1) el backend es el mismo proceso de Next que sirve la UI, (2) dos bases con escrituras divergen y el ETL espejo borraría lo guardado en `msp_app`, y (3) el staging tendría que llevar credenciales de Strapi (la guarda lo prohíbe) y Strapi se apaga en las fases 7–8. Elegido: **reversa manual** = `NEXT_PUBLIC_DATA_BACKEND=strapi` + redeploy + reaplicar `audit_log` (lo ejecuta una persona) + respaldos de `msp_app`. *Reabierta el 22 oct, 11:12: el usuario dejó el tema del fallback pendiente de decidir (§9). Mientras tanto no se implementa ningún fallback.* |
| 15 | (22 oct 2026) **Un solo `.env`, en la raíz.** Todo programa del repo que necesite credenciales (la app, `scripts/dev-staging.mjs`, `etl/`) lee ese archivo; no se crean `.env.local`, `.env.staging.local` ni `.env` por carpeta. No contiene variables de Strapi ni n8n de producción, ni siquiera comentadas. Vercel usa sus propias variables (§14.2.1). `.migration/` (congelado) es la única excepción: lee su propio `.migration/.env`, que no existe y no debe crearse. |
| 16 | (22 oct 2026) **Prioridad: pulir el backend antes que los respaldos.** Mientras `msp_app` sea espejo de Strapi, perderla se repara recargando el ETL (§14.8); el riesgo real hoy son las Server Actions sin autenticación en el staging de Vercel. Los respaldos probados van **antes** de que `msp_app` deje de ser espejo. |

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

Al 22 oct 2026, 12:10 (UTC-6), comprobado con git. `main` coincide con `origin/main` (último commit `fa54fe4`). Nada está fusionado a `main`. Hay dos ramas encadenadas:

- **`feat/lib-domain`**: `87809d4` y `05b0cdb` (19 oct: `lib/domain/`, reporte y recálculo de fórmulas) y `f8c8ea6` (21 oct: copia tal cual de los campos de fórmula, `warehouse:ping`, `FORMULAS.md`, documentos corregidos). Subida a `origin`.
- **`feat/data-facade`**, que sale de la anterior: `6d5adec` y `9b39f51` (21 oct: código muerto fuera y fachada `dataClient`, v1.28.2), y encima los commits que hizo **el usuario** el 22 oct con el trabajo de catálogos, login, pnpm, `.env` único, despliegue en Vercel y certificado versionado (v1.29.0): `4a2d42f`, `fe5e52b`, `9dc8e36`, `04933ed`, `9c0ab82`, `a9baab4`, `2678ecf` (cuenta propia `app-engteam` y el cambio del ETL para no borrar cuentas `app-…`, §14.7) y `0cb1d02` (22 oct, 11:59: `.env` único sin variables de Strapi/n8n y lanzador que lee solo el `.env`, decisión 15, §14.7 puntos 9–10; archivos `scripts/dev-staging.mjs`, `lib/db/auth-actions.ts`, `lib/db/user-mapping.ts`, `lib/api/strapi.ts`, `.env.staging.example`, `CLAUDE.md`, la skill `proteger-produccion`, `docs/migration/README.md` y `docs/migration/ROADMAP.md`). Subida a `origin` hasta `0cb1d02` (la rama local está al día con `origin/feat/data-facade`).

**Después de `0cb1d02`** (comprobado con git el 22 oct a las 14:41: árbol de trabajo limpio, `feat/data-facade` al día con `origin`), el usuario hizo y subió dos commits más: **`75541cb`** (sesión y autorización con Better Auth, v1.30.0: código, migración `20261022183000_better_auth`, ETL `account`, `middleware.ts` → `proxy.ts`, documentos; §14.9) y **`3720200`** (14:33, documentos: clave propia de `app-engteam`, §14.10). Ahí entraron también la corrección de contradicciones de los puntos 17 y 18 de la §14.7 y `README_Backend_full.md`. La versión subió a **v1.30.0** por decisión del usuario. **El 27 oct a las 16:29** el usuario hizo **`d154426`** (actualización de seguridad, v1.30.1, §14.11). El 28 oct a las 8:46 el árbol está limpio y, según la referencia local, `feat/data-facade` está igual que `origin/feat/data-facade`. **El 28 oct a las 9:09** el usuario hizo y subió **`25871a7`** (errores genéricos, pool de conexiones y `@vercel/functions`, §14.12), sin subir la versión (sigue en v1.30.1) ni entrada en `CHANGELOG.md`; comprobado a las 9:10: árbol limpio y rama igual que `origin`. El agente **no hace commit ni `git push`** ni fusiona sin pedido explícito; el usuario hace sus commits y push él mismo. Los snapshots y reportes del ETL (`etl/.snapshots/`, `etl/reports/`) tienen datos reales: están en `.gitignore` y solo existen en la máquina donde se corrió el ETL.

| Hecho | Detalle |
|---|---|
| graphify instalado | CLI 0.9.89, grafo en `graphify-out/`, regla `.cursor/rules/graphify.mdc` |
| `.env` (raíz, ignorado por git) | Único `.env` del repo (decisión 15). Comprobado por nombre de variable, sin leer valores, el 22 oct a las 12:10 (29 líneas): `DATABASE_HOST_STRAPI` / `DATABASE_PORT_STRAPI` / `DATABASE_NAME_STRAPI` / `DATABASE_USER_STRAPI` / `DATABASE_PASSWORD_STRAPI` (MySQL `strapi`, usuario solo `SELECT`), `DATABASE_URL_DBO_STAGE` (Postgres de staging), `DATABASE_URL_APP`, `MSP_STAGING_DEPLOY`, `NEXT_PUBLIC_DATA_BACKEND` y `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD_HASH`. **Ya no están** (ni activas ni comentadas) `NEXT_PUBLIC_STRAPI_URL`, `STRAPI_USERNAME`, `STRAPI_PASSWORD`, `SYNC_API_URL`, `SYNC_API_KEY`, `market_scan_USERNAME` ni `market_scan_PASSWORD` (§14.7 punto 9); el agente nunca las usa. Tampoco está `DATABASE_HOST_WAREHOUSE` (§13.3). `STRAPI_DATABASE_URL`, que mencionan versiones viejas de los documentos, ya no se usa. No imprimir valores del `.env`. |
| **Fase 1: cliente Prisma de Strapi** | **Terminada y verificada contra la base real** (15 oct). `npm run strapi:check`: los 52 modelos se leen sin error (cada uno lee una fila completa, así que una columna faltante fallaría), 0 borradores duplicados en las 5 colecciones con `document_id`. Diferencias con el manual por base viva: proyectos +13, unidades +~700 (238,880), bloques −2; ~688 unidades sin bloque. Ver §7. |
| Valores reales de enums | `etl/src/strapi/distinct-values.ts` (solo lectura). Valores en §11.5; con ellos se fijaron los enums del esquema de la app. |
| Conexión al Postgres de staging | TLS 1.3 con la raíz de Railway fijada en `etl/certs/dbo-stage-ca.pem`; sesión de solo lectura para `dbo_stage`. Ver §11.1. |
| **Fase 2: esquema de la app** | `prisma/schema.prisma` (29 modelos, 30 tablas con `_prisma_migrations`) y la migración `prisma/migrations/20261015210000_init`, aplicada en `msp_app` el 15 oct 2026. `migrate status`: al día; `migrate diff` contra la base: sin diferencias. Tablas vacías hasta la carga del 19 oct (fila siguiente). Se opera desde `etl/` con `npm run app:*` (ver `etl/README.md`). |
| Revisión del warehouse en Postgres | 15–16 oct: comparadas las tablas del push de n8n contra el servidor de staging. Resultado en §11.3 y §11.4. |
| **Fase 3: ETL Strapi → `msp_app`** | **Carga inicial hecha** (19 oct, COMMIT) con el snapshot del RDS del 16 oct 22:21: 1,135 proyectos, 1,688 bloques, 238,226 unidades, 17 usuarios, catálogos, perfiles, financiamiento y tasas (los totales incluyen los padres «No definido»). Verificación antes del COMMIT y `load:verify` posterior: 25/25 tablas, 19/19 relaciones, 1/1 agregados. 0 filas excluidas; 664 advertencias. Migración `20261016120000_etl_run` aplicada (bitácora en `msp_app.etl_run`). Idempotencia comprobada el 19 oct: un `--dry-run` con el mismo snapshot dio 0 filas nuevas, 0 cambiadas y 0 borradas en las 25 tablas. Reporte de diferencias de fórmulas hecho el 19 oct (§12.8): 52 % de las unidades difiere del motor en al menos un campo, casi todo por reglas distintas en períodos viejos. Del 19 al 21 oct la carga guardó el valor recalculado; desde el 21 oct copia los campos de fórmula tal cual vienen de Strapi (recarga con COMMIT el 21 oct con el mismo snapshot: 123,442 unidades vueltas a su valor de Strapi, verificación y `load:verify` 25/25, 19/19, 1/1). **Refrescada el 22 oct** con el snapshot `20261022-172111-full`, leído de día con `--allow-business-hours` porque el usuario lo autorizó (§14.7 puntos 15 y 16); `msp_app.etl_run` registra ese COMMIT como la última carga. Detalle completo en la §12. |
| **Fase 5 (inicio): fachada y limpieza** | 21 oct, rama **`feat/data-facade`** (sale de `feat/lib-domain`, commit `9b39f51`, v1.28.2). Borrado el código muerto de `ROADMAP.md` §4.1 (9 archivos). La UI pide los datos a `dataClient` (`lib/api/client.ts`, contrato `DataClient` de 31 métodos) en vez de `strapiClient`; detrás sigue el mismo cliente de Strapi, así que producción no cambia. Backend elegido con `NEXT_PUBLIC_DATA_BACKEND` (ese día solo existía `strapi`). Lo que siguió: implementación `prisma`, empezando por catálogos (decisión 11); ver las dos filas siguientes. |
| **Fase 5: staging en Vercel** | 22 oct, commits del usuario hasta `a9baab4`. Proyecto de Vercel **nuevo** (no `admin.primeiqlatam.com`) con el backend `prisma`, funcionando: login y catálogos contra `msp_app`. Un solo `.env` local, guarda que acepta `MSP_STAGING_DEPLOY=true`, raíz TLS de Railway versionada y metida en cada función. Cuenta `app-engteam` en `msp_app.user` (el cambio del ETL que la protege tiene commit desde `2678ecf`). Detalle en §14.2, §14.2.1 y §14.7. |
| **Fase 5: catálogos sobre Prisma** | 21–22 oct, misma rama, con commit desde el 22 oct (v1.29.0). Detalle para retomar en la §14. Las verificaciones de esta fila son del 21 oct; lo que cambió el 22 (staging en Vercel, `.env` único) está en la fila de arriba y ya está reflejado aquí. Prisma en la raíz (decisión 10): segundo generador `app` en `prisma/schema.prisma` → `lib/db/generated` (ignorado; lo crea `postinstall` o `pnpm db:generate`). `lib/db/`: conexión a `msp_app` solo con `DATABASE_URL_APP` (sin respaldo a `DATABASE_URL_DBO_STAGE`), repositorio genérico de los 12 catálogos y Server Actions. La implementación `prisma` de `dataClient` cubre los 5 métodos de catálogo; los demás fallan con un mensaje claro. Sin auth todavía: las Server Actions solo responden con `NEXT_PUBLIC_DATA_BACKEND=prisma` y, además, en `next dev` o en un despliegue con `MSP_STAGING_DEPLOY=true` (desde el 22 oct, §14.2.1), y el login valida contra `msp_app.user` con los hashes bcrypt (decisión 13), sin llamar a Strapi; la sesión queda en el navegador hasta Auth.js. Se corre con `pnpm dev:staging`, que lee solo el `.env` único de la raíz (decisión 15; el 21 oct usaba `.env.staging.local`, que ya no existe y no debe crearse). Verificado: lectura de los 12 catálogos contra `msp_app` en sesión de solo lectura (totales, `documentId` de 24 caracteres, ida y vuelta por id), `npm test` 89/89, `tsc` sin errores nuevos, `next build` aislado OK, servidor levantado y proxy de Strapi sin salida a producción. Falta recorrer la lista "debe seguir funcionando" de `ROADMAP.md` §4.4 en el navegador. *Desde el 22 oct, 14:06 (sin commit), hay sesión de servidor y permisos por rol: fila siguiente.* |
| **Fase 5: sesión y autorización (Better Auth)** | 22 oct por la tarde, v1.30.0, commit `75541cb` (subido). Better Auth 1.7.12 en vez de Auth.js (decisión 12): sesión en `msp_app.session`, login con correo o usuario, matriz de roles de Strapi en cada Server Action, `proxy.ts`, `/sync` en 503 con el backend `prisma`. Migración `20261022183000_better_auth` aplicada en `msp_app`; el ETL carga `account`. Verificado: `npm test` 96/96, ETL 53/53, prueba de punta a punta 13/13 con usuarios temporales y `pnpm run build` del usuario con código 0. `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` ya están en el `.env` (comprobado por nombre). El usuario está haciendo pruebas de penetración; no se confirmó con él un recorrido completo en el navegador (§14.10). Detalle en la §14.9. |

### 6.1 Chequeos de solo lectura para confirmar el estado

Desde `etl/` (requieren el `.env` de la raíz; ninguno escribe):

| Comando | Qué debe dar hoy |
|---|---|
| `npm run strapi:check` | 52 modelos sin ERROR, 0 borradores. Correr fuera de horas pico si es posible (lee la base de producción, pool ≤ 2). |
| `npm run stage:ping` | Usuario `j_stage_admin`; esquemas `dbo` (11 tablas, sin acceso), `dbo_stage` (16 tablas, lectura y escritura), `msp_app` (31 con `etl_run`, dueño), `public` (0); las 11 tablas del push presentes en `dbo` y `dbo_stage`. |
| `npm run stage:describe` | Estructura de `dbo_stage`; `-- --schema dbo` para el otro esquema. Las 11 tablas del warehouse con `vivas≈0 insertadas=0`. |
| `npm run app:status` | "Database schema is up to date!" (2 migraciones: `init` y `etl_run`). |
| `npm run app:ping` | `current_schema = msp_app`, con los conteos de la carga del 22 oct (unidades 238,449, bloques 1,688, proyectos 1,137) y **18 usuarios**: los 17 de Strapi más la cuenta propia `app-engteam` (22 oct, §14.7). |
| `npm run app:local-user` | Sin `--apply` solo simula: debe decir `public_id app-engteam … ya existe: se actualizará`. |
| `npm test` | 53 pruebas del ETL pasan (snapshot sintético, no se conecta a nada; 22 oct). Desde la raíz, `npm test` corre 96 (comprobado el 27 oct con Next 16.4.3): el motor de fórmulas (`lib/domain/`), `lib/db/` (catálogos, guarda, login y `normalizeCaPem`), `lib/auth/` y el resto de módulos puros. |
| `npm run load:verify -- --snapshot 20261022-172111-full` | «Verificación: OK» (25/25, 19/19, 1/1). Solo en la máquina que tiene ese snapshot; si no, ver §12.2. |
| `npm run warehouse:ping` | **Todavía no se ha corrido con éxito.** Necesita `DATABASE_HOST_WAREHOUSE` en el `.env` (§13.3). Debe mostrar solo `SELECT`/`SHOW VIEW` y las 11 tablas del push en `dbo_stage` y `dbo`. |

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

No se instaló en la raíz porque el pnpm global (9.15.4) no lee el `pnpm-workspace.yaml` del repo (`allowBuilds` es de pnpm 10+) y para no tocar el build de Vercel. (Desde el 22 oct `package.json` fija pnpm 10.34.7 y ese problema ya no existe; el cliente de Strapi sigue en `etl/` porque es solo para el ETL.)

Reglas:

- **Solo lectura.** Conectar con un usuario MySQL que tenga únicamente `SELECT` sobre la base `strapi`.
- **Nunca** correr `prisma migrate`, `prisma db push` ni `prisma migrate reset` contra `strapi`, `dbo_stage` ni `dbo`. Son bases de producción y compartidas.
- El esquema se escribió a mano desde el inventario del manual y ya se validó contra la base real con `strapi:check`. Si Strapi cambia de estructura, comparar con `npm run strapi:pull:print` (nunca `db pull` sin `--print`: sobrescribe el esquema).
- Cargas completas (todas las unidades) **fuera de 7:00–19:00 (UTC-6)**: es la misma base que usa Strapi en producción.
- El cliente no se importa desde la app Next.js: es para scripts de ETL.

---

## 8. Próximos pasos

El plan completo por fases (decisiones, esquema nuevo, carga, push, app, workers, corte y limpieza) está en [`ROADMAP.md`](./ROADMAP.md). Sus casillas de las fases 1 a 3 están al día (21 oct); en la Fase 1 queda abierta la comparación con `strapi:pull:print`, que no bloquea.

Hechos ya: ~~verificar el cliente de Strapi~~ (Fase 1), ~~esquema limpio de Postgres para la app~~ (Fase 2), ~~revisar si el Postgres de staging tiene las tablas del push~~ (§11.3), ~~carga inicial Strapi → `msp_app`~~ (Fase 3, §12), ~~`lib/domain/` con el motor de fórmulas y su contexto de bloque~~ (19 oct), ~~reporte de diferencias de fórmulas~~ (§12.8), ~~fachada `dataClient` y código muerto~~ (21 oct), ~~catálogos y login de la app sobre `msp_app`~~ (21–22 oct, §14), ~~commit de catálogos y login~~ (22 oct, el usuario), ~~staging en Vercel con el backend `prisma`~~ (22 oct, §14.2.1), ~~cuenta `engteam@` en la base nueva~~ (22 oct, §14.7).

Lo inmediato en la **Fase 5** (la línea en la que se estaba trabajando; detalle en la §14.6):

- **A. Decidido el 22 oct: pulir el backend** (decisiones 12, 14 y 16). Sesión y autorización con Better Auth, hechas el 22 oct (§14.9). Plan, estado del código y preguntas pendientes para el usuario en la **§14.8**. Después: `audit_log` en cada escritura, endurecer errores y login, y recién entonces el siguiente módulo (proyectos o perfiles).
- **B.** Que el usuario recorra en el navegador (local o el staging de Vercel) la lista de catálogos de `ROADMAP.md` §4.4. Lo del `.env` único ya tiene commit (`0cb1d02`); faltan el commit de las correcciones de documentos y decidir si sube la versión (§6).

Lo inmediato en el resto de la migración:

1. **Refrescar la carga de la Fase 3** cuando haga falta. Último refresco: 22 oct, snapshot `20261022-172111-full` (§14.7 puntos 15 y 16); `msp_app` refleja Strapi al 22 oct 11:21. Desde `etl/`, **fuera de 7:00–19:00 (UTC-6)**: `npm run load -- --dry-run` (lee un snapshot nuevo del RDS, carga y hace ROLLBACK), y si cuadra, `npm run load -- --snapshot <el que acaba de crear>` para el COMMIT sin volver a leer el RDS. Es idempotente: solo inserta, actualiza o borra lo que cambió. El usuario ya autorizó esta carga en espejo hacia `msp_app`; avisarle del resultado.
2. **Confirmar qué regla de Interior vale** (§12.8 y §13). Desde el 21 oct `msp_app` guarda los valores de Strapi tal cual; la respuesta decide con qué regla se recalculará después (en la app nueva o en una carga posterior). Dos vías, no excluyentes: preguntarle al negocio (§13.2) o leer el warehouse. El usuario dice que ya hay acceso (21 oct, mismas credenciales que `j_stage_admin`); falta comprobarlo con `npm run warehouse:ping` (§13.3).
3. **Cliente de escritura para `dbo_stage` de staging** (decisión 9, confirmada el 21 oct: copia sombra con `j_stage_admin`, solo las 11 tablas del warehouse). Crear su cliente Prisma **sin migraciones** (introspección con `db pull --print` y esquema a mano, como el de Strapi; nunca `migrate`/`db push` sobre `dbo_stage`), con una conexión de escritura separada de la de solo lectura y una lista cerrada de las 11 tablas: cualquier escritura fuera de ella, en especial en `sec_*`, debe fallar en el código.
4. Revisar en el repo `n8n-manager` el workflow **Sync Block Worker** (`yBuM3XVk36DwRgbs`): cómo inserta en `housing_units`, si manda `id` explícito (choca con `IDENTITY ALWAYS`, §11.4) y si devuelve el ID nuevo a Strapi. Define cómo asignar `legacyId` a unidades nuevas.
5. **Fase 4:** mapeador puro bloque + unidades → filas del warehouse, con prueba de paridad contra lo que n8n dejó en el `dbo_stage` de MySQL (requiere leer el MySQL `dbo_stage`: la conexión ya está escrita en `etl/src/warehouse/`, falta confirmar el acceso; ver §13.3).
6. Workers BullMQ en Railway: contadores de bloque (debounce por `jobId`), tipo de cambio Banguat (repetitivo cada 6 h), sincronización hacia `dbo_stage`.

---

## 9. Preguntas abiertas

- ~~¿Dónde está "la base de Strapi en mi db" (16 oct) y se usa como fuente de la Fase 3?~~ Resuelto el 16 oct: el usuario eligió el **RDS** (`strapi`, solo lectura) como fuente del ETL.
- ¿Quién corrige en Strapi los datos que el ETL cargó con parche (§12.5): las 620 unidades sin bloque, los 2 bloques de El Paraíso Fase 2 sin proyecto y las 42 unidades con `code` repetido? ¿Y qué hace la app nueva con los padres «No definido» (ocultarlos, una pantalla para reasignar)? Mientras no se corrija en Strapi, cada carga los vuelve a dejar igual.
- ~~¿El `dbo_stage` del Postgres de staging es el destino del ETL/push nuevo?~~ Resuelto el 21 oct: sí, como copia sombra, con `j_stage_admin` y solo en las 11 tablas del warehouse (decisión 9). Siguen abiertas: ¿para qué es el esquema `dbo` de ese mismo servidor (sin acceso para `j_stage_admin`)? ¿Las 5 tablas `sec_*` (mercado secundario) entran al alcance de la migración?
- `dbo_stage` de staging no tiene las 3 llaves foráneas unidades → universo que sí tiene `dbo` (§11.4). ¿Es intencional?
- ¿`dbo` en MySQL y `dbo` en Postgres de producción son realmente idénticos? ¿Y el `dbo_stage` de MySQL tiene la misma estructura que `dbo`?
- ¿Otros proyectos **escriben** en las tablas de Market Scan dentro de `dbo` (`housing_*`, `office_*`, `industrial_*`, `banking_info`) o solo las leen?
- El usuario dijo primero que los tableros "ya no leerán el warehouse MySQL" y después que ambos `dbo` se usan. Confirmar quién lee cada uno.
- ¿El ETL hacia `dbo_stage` es carga única o reemplaza al push de forma permanente? ¿Todos los bloques o por selección?
- ~~¿Se migran las contraseñas (`up_users.password`, bcrypt) a la app nueva?~~ Resuelto el 21 oct: sí, se reutilizan (decisión 13). El ETL las copia tal cual a `user.password_hash` (no se imprimen en reportes) y no migra `reset_password_token`.
- Red: ¿Railway puede llegar al RDS MySQL? (probablemente requiere IPs de salida fijas o túnel).
- **¿Qué abre exactamente la credencial `j_stage_admin`?** (22 oct) Hoy está en `DATABASE_URL_APP` del `.env` y del staging de Vercel. La §13.3 dice que el usuario la usa también para el warehouse MySQL de producción, y la §10 dice que "ve el `dbo` de producción del servidor de Railway", lo que choca con la §2 y la §11.2 (ese servidor no aloja el `dbo` de producción y `j_stage_admin` no tiene acceso a `dbo`). Aclararlo con el usuario: si la misma clave abre algo de producción, la app necesita un rol propio solo para `msp_app` antes de seguir.
- **¿El Postgres de staging tiene respaldos automáticos en Railway?** (22 oct) No se sabe; lo responde quien administra Railway. Define cuánto trabajo lleva el punto de respaldos (decisión 16).
- **¿Qué fallback tendrá la app nueva hacia Strapi?** (22 oct, 11:12) El usuario quiere dejar Strapi en este repo como fallback, pero dejó pendiente cómo (la decisión 14 había elegido reversa manual y descartado el automático). No implementar nada hasta que lo decida. Restricción ya fijada: el fallback no puede modificar Strapi ni su base, porque son los de producción del otro repo (§2).
- **Reglas de Interior (negocio):** ¿la cuota de Interior (S1/S2) es 8 % a 10 años o 7.5 % a 20 años como GAM? ¿Los lotes de Interior llevan IVA 0.916 o 1.12? Detalle en la §13.2.

---

## 10. Hallazgos a tener en cuenta

- **IVA "Venta" (0.916):** el manual dice "dividir entre 0.916", pero el código **multiplica** cuando la tasa es menor que 1 (`lib/domain/units/formulas.ts`, `removeVat`). Desde v1.25.0 la tasa depende de la operación: venta 0.916, renta ÷1.12, mantenimiento sigue al uso.
- Webhooks de n8n sin autenticación: Block Edit Queue, Chat Sessions API y el Chat Trigger del Copilot.
- La conexión de Strapi a MySQL usa SSL sin validar el certificado (`DATABASE_SSL_REJECT_UNAUTHORIZED=false`).
- El pull de n8n no tiene reversa y borra del CRM las unidades que no estén en el warehouse.
- **Pendientes del esquema de la app (Fase 2):** los enums con `@map` (`Availability.Not_Available` ↔ `"Not Available"`, `OfficeClassification.Micro_1` ↔ `"Micro 1"`, …) necesitan un mapeo explícito al cargar desde Strapi y al exponer DTOs; el índice único parcial "una sola corrida de sync activa" no está modelado (Prisma no lo soporta; agregarlo a mano en una migración); `m2_range` de oficinas y la calidad industrial quedaron como texto porque Strapi tiene variantes sucias.
- **Permisos en staging:** `j_stage_admin` tiene `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` sobre todo `dbo_stage` (incluidas las `sec_*`). Desde el 21 oct (decisión 9) el push nuevo puede escribir en las 11 tablas del warehouse; como el permiso alcanza también a las `sec_*`, la protección de esas tablas tiene que estar en el código (lista cerrada de tablas en el cliente de escritura).
- **Códigos ISO de países invertidos respecto al formulario** (22 oct): en los datos, `isoCode` es alfa-3 (`GTM`, `SLV`) e `isoCode2` alfa-2 (`GT`), y el IVA, la cuota y los departamentos leen `isoCode2`. El formulario de `components/catalogs/catalog-table.tsx` valida al revés (2 letras en `isoCode`, 3 en `isoCode2`), así que hoy no deja guardar un país existente sin cambiarle los códigos, tampoco con Strapi. El servidor nuevo no valida el largo. Sin decidir; anotado en `ROADMAP.md` §4.4.
- **`j_stage_admin` también ve el `dbo` de producción del servidor de Railway** (**sin confirmar**: choca con la §2 y la §11, donde el usuario confirmó que ese servidor no aloja el `dbo` de los otros proyectos y `j_stage_admin` no tiene acceso a `dbo`; el comentario de `APP_MAX_CONNECTIONS` en `lib/db/connection.ts` repite la misma afirmación. Pregunta abierta en la §9): la app nueva usa esa credencial (copiada como `DATABASE_URL_APP` en el `.env` y, desde el 22 oct, también en las variables del proyecto de staging de Vercel), y el código la fija a `msp_app`. Lo seguro sería un usuario de Postgres propio que solo pueda entrar a `msp_app`; tiene que crearlo un administrador, no el agente. Con el despliegue en Vercel esto pesa más: es una razón más para la protección de despliegues (§14.2.1).
- **`next dev` expande los `$` del `.env`** (22 oct): Next carga el `.env` con `dotenv-expand`, que reemplaza `$2a`, `$10`… aunque el valor esté entre comillas simples. Un hash bcrypt en `DEV_LOGIN_PASSWORD_HASH` llega roto a `pnpm run dev` (39 caracteres en vez de 60) y el login falla con "Invalid identifier or password". `pnpm dev:staging` lee con `util.parseEnv` de Node, que no expande; escapar con `\$` arregla Next pero rompe ese lector. Vercel entrega los valores tal cual. Por eso la cuenta `engteam@` se metió en la base (§14.7).
- **`.env.local` manda sobre `.env`** en Next. El 22 oct había un `.env.local` (un `vercel env pull` de producción) con `STRAPI_PASSWORD`, `SYNC_API_KEY` y `STRAPI_ADMIN_TOKEN` activos, aunque el `.env` los tenía comentados; se absorbió en el `.env` (§14.2). Antes de afirmar que un entorno "no tiene credenciales de producción", revisar **todos** los `.env*`.
- **Clave de producción expuesta en el chat** (22 oct): el usuario pegó en la conversación las líneas `market_scan_USERNAME`/`market_scan_PASSWORD` del `.env` (cuenta `engteam@primeiqlatam.com` del panel de Strapi). Se le recomendó rotarla. Es un cambio en Strapi de producción: lo hace una persona, no el agente. Desde el 22 oct, 14:26, `app-engteam` ya no usa esa clave: el usuario le puso una propia (hash nuevo en `DEV_LOGIN_PASSWORD_HASH` y `npm run app:local-user -- --apply`), así que rotar la de Strapi ya no afecta a la app nueva.
- **Valores del `.env` en la salida de la terminal** (22 oct): al revisar la estructura del `.env`, un filtro del agente no reconoció el formato `# [Strapi/n8n producción] CLAVE=valor` y mostró en la terminal los valores de `STRAPI_PASSWORD` y `market_scan_PASSWORD` (ya borrados del `.env`; siguen en `.env.respaldo-20261022.local`). Refuerza rotar la clave de `engteam@`. Para inspeccionar un `.env`, imprimir solo lo que va antes del primer `=` de **cada** línea, incluidas las comentadas.
- **Mensajes de error de la base hacia el navegador**: `actionFailure` (`lib/db/action-result.ts`) devuelve el mensaje del error al cliente; un fallo de conexión podría mostrar el usuario o el host de Postgres (nunca la clave). Se ofreció volverlos genéricos y registrar el detalle solo en el servidor; sin respuesta.
- **Skill e inventario de producción desactualizados:** `inventario-produccion.md` y la skill `proteger-produccion` todavía nombran `STRAPI_DATABASE_URL` (hoy son las variables `DATABASE_*_STRAPI`) y no registran el Postgres de staging (`railway`, esquemas `msp_app`/`dbo_stage`/`dbo`). La skill además pide un proyecto de Railway nuevo para la app, y la decisión 8 usó el servidor de staging. Solo el usuario puede editarlos.

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
| `msp_app` | `j_stage_admin` | App nueva: 30 modelos (incluye `etl_run`) + `_prisma_migrations`, con los datos de la carga del 22 oct (snapshot `20261022-172111-full`, §12.2). **Único destino de migraciones de Prisma.** | Dueño |
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
- `dbo_stage` y `dbo`: no crear, alterar ni borrar estructura desde el agente. Datos en `dbo_stage`: solo el push nuevo, solo en las 11 tablas del warehouse (decisión 9, 21 oct). Las `sec_*` no se escriben nunca.
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
| 19 oct | Carga real ya con el snapshot del 16 oct, refrescar después con uno nuevo leído de noche. | Hecho. El refresco se hizo el 22 oct con el snapshot `20261022-172111-full`, leído **de día** con `--allow-business-hours` porque el usuario lo autorizó (§14.7 puntos 15 y 16). |
| 19 oct | Campos de fórmula: cargar en `msp_app` el valor recalculado con la fórmula de la hoja y dejar el original de Strapi en el reporte. Lo que Strapi no trae (vacío) queda vacío. | `applyFormulas()` en `formulas.ts`, en `validate`, `run` y `verify`. Solo reemplaza lo que la hoja marcaría en amarillo (diferencia > 0.01). Originales en `etl/reports/formulas-<fecha>.csv` (columna `_stored`). Cargado con COMMIT el 19 oct: 123,442 unidades cambiadas. **Reemplazada el 21 oct** (fila siguiente). |
| 21 oct | Copiar los campos de fórmula **tal cual** vienen de Strapi y dejar el recálculo solo como reporte. Motivos: copia verificable 1:1 contra la fuente, paridad del push de la Fase 4 y reglas de Interior sin confirmar (§13.2). | Se quitó `applyFormulas()`; `formulas.ts` solo compara y reporta (`etl_run.counts.formulas`: unidades con diferencia por campo). Recarga con COMMIT el 21 oct con el snapshot del 16 oct: 123,442 unidades vueltas a su valor de Strapi, verificación 25/25, 19/19, 1/1. |

### 12.2 Cómo se corre

Siempre desde `etl/` (desde la raíz el script no existe):

| Comando | Qué hace |
|---|---|
| `npm run load:validate` | Extrae y valida; no escribe en `msp_app`. |
| `npm run load -- --dry-run` | Extrae, valida, escribe, verifica y hace ROLLBACK. |
| `npm run load` | Igual, pero con COMMIT si todo cuadra. |
| `npm run load:verify` | Compara `msp_app` contra Strapi sin escribir. |
| `npm run load:formulas -- --snapshot <nombre>` | Recalcula las unidades con el motor de la hoja y reporta diferencias (§12.8). No abre conexión a `msp_app`. |
| `npm test` | 50 pruebas con snapshot sintético (`fixtures.ts`). |

Flags: `--snapshot <nombre>` reusa `etl/.snapshots/<nombre>` y **no lee el RDS** (vale a cualquier hora); `--sample <doc,doc>` solo esos bloques y sus unidades (siempre dry-run); `--allow <cat,cat>` acepta categorías fatales excluyendo la fila y sus dependientes; `--dry-run`; `--allow-business-hours`; `--allow-mass-delete` (ver el freno en §12.3, paso 4). **Sin `--snapshot`, cualquiera de los comandos lee las 52 tablas del RDS de producción** (~12 min): hacerlo de noche.

Snapshot cargado en `msp_app`: `20261022-172111-full` (COMMIT el 22 oct; `msp_app.etl_run` lo registra como `committed`, terminado a las 11:58; §14.7 punto 16). El anterior era `20261016-222126-full`. Los dos existen solo en la máquina del usuario. Los reportes quedan en `etl/reports/<fecha>-<id>.json` con cada incidencia (tabla, id, `document_id`, motivo).

### 12.3 Cómo funciona

1. **Extracción** (`extract.ts`, `snapshot.ts`): 52 tablas por lotes de 2,000 con cursor por `id`, pool ≤ 2, a NDJSON en `etl/.snapshots/`.
2. **Validación** (`validate.ts`, categorías en `model.ts` → `CATEGORIES` / `WARNING_CATEGORIES`): elige la única fila publicada de cada `document_id` (draft & publish) y resuelve cada `_lnk` y `_cmps`. Fatales: `documento-sin-id`, `documento-duplicado`, `sin-publicar`, `campo-obligatorio-vacio`, `enum-desconocido`, `iso-duplicado`, `usuario-duplicado`, `relacion-ambigua`, `relacion-rota`, `rol-invalido`, `componente-desconocido`, `tipo-unidad-multiple`, `tipo-unidad-roto`, `financiamiento-multiple`, `financiamiento-roto`, `moneda-rota`. Advertencias: `unidad-sin-bloque`, `bloque-sin-proyecto`, `codigo-duplicado` (decisión del 19 oct), `tipo-unidad-distinto-al-bloque` y `componente-compartido`.
3. **Transformación** (`transform/*.ts`): funciones puras por dominio que devuelven filas con los nombres de columna de `msp_app` (`specs.ts` define las 25 tablas, columnas, tipos, clave y únicos). Las relaciones se expresan por `public_id` (= `document_id` de Strapi) del padre, nunca por `id` numérico. Los campos de fórmula se copian tal cual; el motor de la hoja solo los compara para el reporte (decisión del 21 oct, §12.1 y §12.8).
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

`npm run load:formulas -- --snapshot <nombre>` (`etl/src/load/formulas.ts`) genera solo el reporte, sin conectarse a `msp_app`; `validate`, `run` y `verify` lo generan también, sin cambiar lo que se carga (desde el 21 oct). Toma la transformación de la carga, arma cada unidad como la ve la hoja (contexto del bloque con `lib/domain/units/context.ts`: categoría, trimestre, ISO del país, fechas y uso de la unidad) y corre `ensureUnitFormulasSynced`. Una diferencia es lo mismo que la hoja pinta de amarillo al abrir el bloque: más de 0.01 en un campo de `RECONCILED_FORMULA_FIELDS`. Las unidades de padres «No definido» no tienen contexto y se cuentan aparte. Salida: `etl/reports/formulas-<fecha>.json` (totales, por campo con ejemplos, por período y dominio, los 20 bloques con más diferencias) y `.csv` (una fila por unidad con diferencias, guardado y esperado por campo).

Con el snapshot del 16 oct: **237,471 unidades revisadas** (755 sin contexto, 0 sin categoría), **123,446 con diferencias (52 %)**, 114,025 limpias.

| Campo | Unidades | Lo que muestra el CSV |
|---|---:|---|
| `incomeUSD` / `installmentUSD` | 97,799 / 91,919 | Interior 2026 (S1, S2): razón fija 0.664 en ~85 mil unidades. Es exacto PMT(7.5 %, 20 años) ÷ PMT(8 %, 10 años), ambos al 90 %: los datos se calcularon con **8 % a 10 años** y la hoja usa 7.5 % a 20. En 2026 T1–T2, razón 0.993. En oficinas e industrial nunca se calculó (vacía). |
| `maintenancePricePerM2USD` | 37,840 | Razones dispersas (0.90–0.94) en períodos viejos; ya documentado en `formulas.ts`: hasta 2026 2T la captura no seguía una fórmula. 2026 T3 vivienda: 97 % coincide. |
| `absorptionPerM2` / `unitAbsorption` | 24,911 / 6,984 | Dispersas: dependen de las fechas del bloque (si cambiaron después de calcular) y del tamaño usado. |
| `priceWithoutVATUSD` / `pricePerM2USD` | 7,689 / 5,855 | 2024–2025 S vivienda: razón fija 0.975 = guardado ×0.916 contra ÷1.12 de la hoja (regla «Interior + Lote → 1.12»). Del resto, la mayoría es redondeo (razón 1.000). |
| `totalSizeM2`, `habitableConstructionM2`, `unitSizeM2`, `parkingSizeM2`, `rentalPriceWithoutVATUSD` | < 1,500 cada uno | Casos sueltos; la mitad, campos vacíos en la base. |

**De dónde vienen las dos diferencias grandes** (cruzado con `legacy_id` y `updated_at` en el snapshot): las 85,176 cuotas con razón 0.664 son **todas** unidades con `legacy_id`, es decir, importadas del warehouse MySQL. Todas tienen `updated_at` de octubre 2026. Eso coincide con una corrida del pull (workflow «Sync Pull Block Worker», que copia `cuota`/`ingresos` tal cual, §5), pero es una inferencia: el snapshot no dice qué proceso las tocó. Las unidades de Interior 2026 nacidas en el admin coinciden con la hoja en el 99 %. Los lotes de Interior 2024–2025 son todos «Lotes para vivienda», también legacy, con IVA 0.916 y cuota 8 %/10 años (razón 0.647 = 0.975 × 0.664). O sea: el warehouse calculaba Interior con 8 % a 10 años y los lotes con 0.916; el admin (desde junio 2026 como mínimo, ver `CHANGELOG.md` y `.migration/`) usa 7.5 % a 20 años y 1.12, y nunca recalculó lo importado. Falta confirmarlo leyendo `housing_units` del warehouse.

Por período: 2026 T3 vivienda 25 % con diferencias, 2026 S1 vivienda 71 % (la cuota), 2026 T4 oficinas 0 %. **Decisión del usuario (19 oct):** la carga guardó en `msp_app` el valor recalculado y dejó el original en el reporte (§12.1). Esa carga con COMMIT cambió 123,442 unidades: cuota 91,558, ingreso 97,438, mantenimiento por m² 37,020, absorción por m² 24,904, precio sin IVA 7,684 y el resto en menor número. **Revertida el 21 oct:** la carga copia los valores tal cual vienen de Strapi y el recálculo queda solo como reporte; la recarga del 21 oct devolvió esas 123,442 unidades a su valor de Strapi. Strapi no cambia: la hoja del admin seguirá marcando esas celdas en amarillo hasta que alguien guarde los bloques.

---

## 13. Dónde quedó la última conversación (22 oct 2026)

### 13.1 Estado

- **Lo último (22 oct, 11:12–12:10):** el usuario reabrió el tema del fallback a Strapi (decisión 14, §9) y confirmó que el Strapi y la base `strapi` de este repo son los de producción (§2); se leyó un snapshot nuevo del RDS y se guardó con COMMIT en `msp_app` (§14.7 puntos 14–16); el usuario hizo commit y push de lo del `.env` único (`0cb1d02`); cuarto análisis como senior dev y corrección de las contradicciones de este documento (§14.7 punto 17). **Siguiente paso: el mismo, §14.8.**
- **Antes (22 oct, 10:20–10:50):** análisis del README como senior dev (riesgos principales: Server Actions sin autenticación en el staging de Vercel, login sin límite de intentos sobre hashes de claves reales, errores internos al navegador; ver §14.8), limpieza del `.env` (decisión 15), explicación al usuario de cómo funciona el backend nuevo (§14.8, "Cómo funciona hoy"), y dos decisiones: sin fallback automático a Strapi (decisión 14) y pulir el backend antes de los respaldos (decisión 16). **Siguiente paso: §14.8**, empezando por las preguntas al usuario.
- **Antes (22 oct, mañana):** el usuario está probando la app nueva en un **proyecto de Vercel nuevo** con el backend `prisma`, y ya funciona (login y catálogos contra `msp_app`). Para llegar ahí se resolvieron, en orden: pnpm fijado en 10.34.7, `.env` único, la guarda de Server Actions para staging (`MSP_STAGING_DEPLOY`) y la raíz TLS de Railway versionada. Luego se creó en la base la cuenta `engteam@primeiqlatam.com` (`app-engteam`) y se cambió el ETL para que no la borre. Bitácora completa, con cada error de Vercel y su causa: **§14.7**. Cómo correr y desplegar: §14.2 y §14.2.1.
- La app corre en local con `pnpm dev:staging` (recomendado) o `pnpm run dev`; el usuario la levanta él mismo, y al 22 oct tenía `pnpm run dev` corriendo en su terminal.
- Ramas: `feat/lib-domain` (subida hasta `f8c8ea6`) y `feat/data-facade` encima (subida hasta `0cb1d02` por el usuario), sin fusionar. Lo de `app-engteam`, el ETL y el `.env` único ya tiene commit; faltan el commit de las correcciones de documentos y decidir si sube la versión (§6).
- `msp_app` tiene la carga del snapshot `20261022-172111-full` (COMMIT del 22 oct, §14.7 punto 16) **con los campos de fórmula tal cual vienen de Strapi** (decisión del 21 oct, §12.1). Verificación de esa carga: 25/25 tablas, 19/19 relaciones, 1/1 agregados; 664 advertencias, las mismas tres categorías de la §12.5. Comprobado el 22 oct a las 12:10, en solo lectura: `msp_app.etl_run` registra ese COMMIT como la última carga, y `npm run app:ping` da proyectos 1,137, bloques 1,688, unidades 238,449 y 18 usuarios. Strapi, el warehouse y n8n no se tocaron.
- 21 oct: nuevo [`FORMULAS.md`](FORMULAS.md), el mapa de dónde vive cada fórmula (motor en `lib/domain/`, hoja de unidades, moneda local, n8n, warehouse, ETL). Respuesta corta para el usuario: las fórmulas no están en la base ni en Strapi; están en `lib/domain/units/formulas.ts` y corren en el navegador; los promedios del bloque los calcula n8n.
- 21 oct: nuevo `npm run warehouse:ping` en `etl/` para el warehouse MySQL. Todavía no se ha probado: falta `DATABASE_HOST_WAREHOUSE` en el `.env` (§13.3).
- No hay nada a medias en el código. Lo pendiente: empezar la §14.8, el commit de las correcciones de documentos y decidir si sube la versión (§6), los ajustes del proyecto de Vercel (§14.7, "Pendiente"), la revisión en el navegador (§14.6) y respuestas externas (§13.2 y la prueba de acceso de la §13.3).

### 13.2 La duda que queda abierta: ¿qué regla de Interior es la correcta?

La hoja (`lib/domain/units/formulas.ts`) y los datos legacy usan reglas distintas en dos puntos. `msp_app` guarda lo que trae Strapi (legacy en las unidades importadas del warehouse):

| Tema | Lo que trae Strapi (legacy) | Lo que usa la hoja | Dónde está la regla |
|---|---|---|---|
| Cuota de Interior (S1/S2), Guatemala | 8 % a 10 años, 90 % de préstamo | 7.5 % a 20 años, 90 % (la de GT; no distingue GAM de Interior) | `INSTALLMENT_BY_ISO` en `formulas.ts` |
| IVA de lotes de Interior 2024–2025 | ×0.916 | ÷1.12 (regla «Interior + Lote») | `getVatRate` en `formulas.ts` |

El riesgo: si la regla buena es la de los datos, la hoja del admin está mal; si es la de la hoja, ~91 mil cuotas legacy están mal en Strapi y en `msp_app`. El warehouse puede confirmar **cómo** calculaba el sistema viejo, pero no si era la regla del negocio o un error. Por eso la vía más directa es preguntarle al negocio (el usuario decide a quién):

1. ¿La cuota de Interior es al 8 % a 10 años o al 7.5 % a 20 años, igual que GAM?
2. ¿Los lotes de Interior llevan IVA 0.916 o 1.12?

Qué hacer con la respuesta:

- **Vale la hoja:** la regla no cambia. Anotarlo en la §12.8 y cerrar el punto 2 de la §8. Decidir con el usuario cuándo y dónde se recalculan las unidades legacy (en la app nueva o en una carga posterior; el código que aplicaba el recálculo en la carga, `applyFormulas()`, está en el historial de git, commit `05b0cdb`).
- **Vale lo de los datos:** cambiar la regla en `lib/domain/units/formulas.ts` (la cuota tendría que depender también del trimestre, no solo del ISO), con pruebas en `formulas.test.ts`, y volver a correr `npm run load:formulas -- --snapshot <nombre>` para ver cuántas diferencias quedan. **Ojo:** el mismo cambio altera la hoja del admin en producción (`admin.primeiqlatam.com`), así que fusionarlo y desplegarlo es una decisión aparte del usuario. Actualizar `CHANGELOG.md`, la versión y la §12.8.

### 13.3 Acceso al warehouse MySQL: listo en código, falta probarlo

No es imprescindible para la §13.2, pero sirve para confirmar la hipótesis de la §12.8 y lo va a necesitar la Fase 4 (paridad del push contra `dbo_stage`).

- **Dónde está:** MySQL en RDS us-east-2, bases `dbo_stage` (destino del push de n8n) y `dbo` (final, compartida con otros proyectos). Según el manual está en **otra instancia** de RDS (`prim….us-east-2`), no en la de `strapi` (`strapi.cfkk….us-east-2`). Hay una copia de `dbo` en un Postgres de producción en Railway, distinta del Postgres de staging de la §11.
- **Lo que dijo el usuario (21 oct):** "ya tenemos acceso al dbo", en la instancia `prim…`, con las mismas credenciales de `j_stage_admin`. No se ha comprobado.
- **Lo que ya está escrito** (commit `f8c8ea6`):
  - `etl/src/warehouse/connection.ts` arma la conexión:
    - Exige `DATABASE_HOST_WAREHOUSE`; el puerto opcional es `DATABASE_PORT_WAREHOUSE` (3306 por defecto).
    - Usa `DATABASE_USER_WAREHOUSE`/`DATABASE_PASSWORD_WAREHOUSE` si existen; si no, las de Strapi.
    - Sin base por defecto, pool ≤ 2 y SSL validado con `etl/certs/rds-global-bundle.pem`.
    - Rechaza el usuario de la app de Strapi (prefijo `adm`).
  - `etl/src/warehouse/ping.ts` (`npm run warehouse:ping`):
    - Primero revisa los permisos y se detiene si hay algo más que `SELECT`/`USAGE`/`SHOW VIEW`.
    - Luego lee una fila de `dbo_stage.housing_universe`.
    - Al final lista las bases visibles y la estimación de filas de las 11 tablas del push en `dbo_stage` y `dbo`.
  - Lista de tablas compartida en `etl/src/db/warehouse-tables.ts`.
- **Siguiente paso:**
  1. El usuario agrega `DATABASE_HOST_WAREHOUSE` al `.env` de la raíz. El agente no lee ni imprime valores del `.env`, y el revisor automático bloquea incluso buscar nombres de variables en él: preguntarle al usuario si ya la agregó.
  2. Correr `npm run warehouse:ping` desde `etl/`. Es una muestra, vale a cualquier hora.
  3. Si muestra algún permiso de escritura, detenerse y avisar.
  4. Si falla por permisos, pedir que un administrador (no el agente) ejecute en esa instancia `GRANT SELECT, SHOW VIEW ON dbo_stage.* TO 'j_stage_admin'@'%';` (y en `dbo` si se necesita).
  5. Con el ping en verde, corregir las menciones del warehouse en este README si la instancia resultó otra.
- **La consulta de la §12.8:**
  - Una muestra pequeña, a cualquier hora (no es carga completa), pool ≤ 2.
  - Unos 5 bloques de Interior 2026 y 3 de lotes de Interior 2024–2025, tomados de `formulas-<fecha>.csv`.
  - Unir por `housing_units.id = legacy_id` de la unidad, o por `housing_universe.cod_proyecto` = `legacy_id` del bloque.
  - Comparar `cuota`, `ingresos` y el precio sin IVA del warehouse contra las columnas `_stored` del CSV.
  - Escribir un script nuevo en `etl/src/warehouse/` con `warehousePoolConfig()`, y verificar permisos primero como hace `ping.ts`.
- **Resultado esperado** si la hipótesis es correcta: los valores del warehouse son iguales a los `_stored` de Strapi (8 % a 10 años; ×0.916 en lotes). Documentarlo en la §12.8, sea cual sea, y quitar el «Falta confirmarlo».

### 13.4 Ofrecido al usuario y sin respuesta

Preguntárselo antes de hacerlo; ninguno está autorizado todavía:

- ~~Refrescar la carga con un snapshot nuevo del RDS~~: el usuario lo pidió y se hizo el 22 oct (§14.7 puntos 15 y 16); `app-engteam` se conservó (`npm run app:ping`: 18 usuarios). Para el siguiente refresco, §8 punto 1.
- **Mensajes de error genéricos** hacia el navegador en las Server Actions (§10). Ahora es parte del paso 3 de la §14.8.
- ~~Siguiente módulo de la Fase 5~~: decidido el 22 oct, primero pulir el backend (§14.8).
- **Fallback automático a Strapi**: descartado (decisión 14). Si el usuario vuelve a pedirlo, recordarle los motivos y la reversa manual elegida.
- **Corregir la validación ISO** del formulario de países (§10), cuando el negocio confirme qué columna es cuál.
- **Quitar `@univerjs/*` y `luckysheet`** de `package.json` (sin uso desde v1.28.2).
- **Arreglar el respaldo de credenciales del warehouse** en `etl/src/warehouse/connection.ts`: sin `DATABASE_USER_WAREHOUSE` usa las de Strapi, aunque la §13.3 dice que el acceso es con las de `j_stage_admin`.

Cómo trabaja el usuario:

- Escribe en español, con pedidos cortos.
- Cuando hay que elegir, prefiere que se le den opciones concretas.
- Ya autorizó escribir en `msp_app` (cargas en espejo desde Strapi, y lo que se guarde desde la app en modo `prisma`).
- Cualquier otra escritura (`dbo_stage` de staging, producción) requiere preguntarle.
- Para correr la app pide un comando para levantarla él; si el agente la levanta, detenerla cuando lo pida.
- Si algo no se entiende, lo pregunta: explicarle en palabras simples qué es cada archivo o variable y por qué existe.
- Se preocupa por la seguridad ("¿no estás exponiendo ninguna variable?", "¿esto está bien subirlo a GitHub?"): ante esas preguntas, verificar de verdad (escanear el repo, el bundle `.next/static` y el historial de git) antes de responder, y nunca imprimir valores del `.env`.
- Hace él mismo los commits y el push, y despliega en Vercel él mismo; pega en el chat los errores que ve en Vercel.
- Alterna entre modo Ask (solo preguntas, sin cambios), Plan y Agent. En Ask y Plan no se edita ni se escribe en la base, aunque lo pida: se explica y se espera a que cambie de modo.
- **"No supongas nada"** (22 oct): ante algo que no se puede comprobar en el código (decisiones de negocio, infraestructura, permisos), preguntarle en vez de asumir. Si cancela un cuestionario, preguntarle lo mismo en texto, corto, sin seguir con el plan.

---

## 14. Fase 5: la app sobre `msp_app` (para retomar)

Estrategia completa en `ROADMAP.md` (fase 5 y §4). En corto: la UI habla con una fachada; detrás hay dos implementaciones (`strapi`, la de producción, y `prisma`, la nueva), elegidas con `NEXT_PUBLIC_DATA_BACKEND` para toda la app a la vez.

### 14.1 Qué está hecho

| Pieza | Archivos | Estado |
|---|---|---|
| Fachada | `lib/api/client.ts` (`dataClient`, tipo `DataClient` de 31 métodos), `lib/api/data-backend.ts` | 33 archivos de la UI la usan; fuera de `lib/api/` nadie importa `strapiClient`. Commit `9b39f51`. |
| Implementación `prisma` | `lib/api/prisma-client.ts` | Catálogos (5 métodos) y login/sesión (4) reales; los otros 22 métodos lanzan "todavía no está migrado". |
| Cliente Prisma de la app | generador `app` en `prisma/schema.prisma` → `lib/db/generated/` (ignorado); `lib/db/connection.ts`, `lib/db/client.ts` | Se genera en `postinstall` o con `pnpm db:generate`. Solo usa `DATABASE_URL_APP`, `search_path=msp_app`, pool de 2, raíz TLS de Railway (`DATABASE_CA_APP` o `etl/certs/dbo-stage-ca.pem`). |
| Catálogos | `lib/db/catalog-mapping.ts` (puro), `lib/db/catalogs.ts` (repositorio), `lib/db/catalog-actions.ts` (Server Actions) | Los 12 catálogos de `CATALOG_TYPES` menos `block-types` (no tiene tabla). Paginación, `sort` y búsqueda como Strapi; `documentId` = `publicId`; borrar algo en uso da "está en uso" (FK `Restrict`). |
| Login y sesión | `lib/auth/server.ts` (Better Auth), `lib/db/auth-actions.ts`, `lib/db/session.ts`, `lib/db/user-mapping.ts` (puro) | Desde el 22 oct (§14.9): Better Auth valida correo o usuario y clave con los hashes bcrypt de Strapi (decisión 13), guardados en la cuenta `credential` de `msp_app.account`. La sesión vive en `msp_app.session` con cookie httpOnly; ya no hay `localStorage` (`msp_dev_session`) ni cuenta `DEV_LOGIN_*` en el login. |
| Autorización | `lib/auth/permissions.ts` (puro), `lib/db/session.ts`, `proxy.ts` | Cada Server Action llama a `requireRole(permiso)` (matriz de Strapi, §14.9); `proxy.ts` manda a `/login` sin cookie, solo con el backend `prisma`. |
| Guarda | `lib/db/guard.ts` | Toda Server Action llama a `assertPrismaActionsAllowed()` (dentro de `requireUser`): solo responde con `NEXT_PUBLIC_DATA_BACKEND=prisma`, en `next dev` o en un despliegue de staging con `MSP_STAGING_DEPLOY=true` y sin credenciales de Strapi/sync (§14.2.1). Las acciones existen también en el build de producción (Next las publica); la guarda se mantiene además de la sesión. |
| Lanzador | `scripts/dev-staging.mjs`, `.env.staging.example` | Ver §14.2. |
| Pruebas | `lib/db/catalog-mapping.test.ts`, `lib/db/user-mapping.test.ts`, `lib/db/connection.test.ts`, `lib/auth/permissions.test.ts` | Entran en `npm test` de la raíz (96 en total al 22 oct, 14:06). |
| Cuentas propias de la app | `etl/src/app/local-user.ts` (`npm run app:local-user` en `etl/`), `localPrefix` / `mirroredRows` en `etl/src/load/specs.ts` | 22 oct, commit `2678ecf`. Ver §14.7. |

Dependencias nuevas en la raíz (mismas versiones que `etl/`): `@prisma/client`, `@prisma/adapter-pg`, `pg`, `bcryptjs`, y `prisma`/`@types/pg` como desarrollo. `npm run app:generate` en `etl/` genera solo su propio cliente (`--generator client`).

### 14.2 Cómo correr la app sin Strapi

```powershell
npm run dev:staging
```

Desde la raíz del repo. Abrir http://localhost:3000/login. Para detenerla, `Ctrl+C`.

- **Desde el 22 oct hay un solo `.env`** (pedido del usuario), pensado para el backend `prisma`. Las variables de Strapi y n8n de producción (`NEXT_PUBLIC_STRAPI_URL`, `STRAPI_USERNAME`, `STRAPI_PASSWORD`, `SYNC_API_URL`, `SYNC_API_KEY`, `market_scan_USERNAME`, `market_scan_PASSWORD`) se quitaron del `.env` (primero quedaron comentadas como referencia; el usuario pidió borrarlas del todo el mismo 22 oct): no volver a agregarlas. Siguen activas las del ETL (`DATABASE_*_STRAPI`, `DATABASE_URL_DBO_STAGE`), porque `etl/` lee el `.env` de la raíz. También se absorbió un `.env.local` (un `vercel env pull` del 13 oct con `STRAPI_ADMIN_TOKEN`, `STRAPI_PASSWORD`, `SYNC_API_KEY`, la URL de n8n del Copilot y metadatos de Vercel), que Next cargaba por encima del `.env`: sus claves de Strapi/n8n también se quitaron y los metadatos (`VERCEL_*`, `TURBO_*`, `VERCEL_OIDC_TOKEN`) se descartaron. No volver a crear `.env.local` con `vercel env pull` del proyecto de producción. El respaldo de los tres archivos originales quedó en `.env.respaldo-20261022.local` (ignorado por git; borrarlo cuando ya no haga falta).
- `scripts/dev-staging.mjs` lee solo el `.env` de la raíz (desde el 22 oct ya no busca `.env.staging.local`; pedido del usuario: todo programa que necesite credenciales lee ese único `.env`). Vacía cada clave de los otros `.env*` que no redefine, y marca `__NEXT_PROCESSED_ENV=true`: Next no aplica ningún `.env`, ni al recargar en caliente. Next igual muestra "Environments: .env.local, .env" en el arranque; es solo el listado de archivos, no los aplica.
- Fuerza `NEXT_PUBLIC_DATA_BACKEND=prisma` y `NEXT_PUBLIC_STRAPI_URL=""`. Sin URL, el código cae a `http://localhost:1337`: comprobado el 21 oct, el proxy `/api/strapi/*` da 503 "fetch failed" y no llega a producción.
- Se niega a arrancar si falta el archivo o `DATABASE_URL_APP`, o si tiene activas `STRAPI_USERNAME`, `STRAPI_PASSWORD`, `SYNC_API_KEY`, `SYNC_API_URL`, `NEXT_PUBLIC_STRAPI_URL` o `STRAPI_URL`.
- Con el `.env` único, `pnpm dev` también corre en modo `prisma` (ya no hay credenciales de producción activas). `dev:staging` sigue siendo lo recomendado por esos controles. `pnpm dev` expande los `$` del `.env` (§10); desde el 22 oct eso ya no afecta al login, que no lee `DEV_LOGIN_*`: las cuentas de `msp_app` (las 17 de Strapi y `app-engteam`) entran igual con los dos. Los dos necesitan `BETTER_AUTH_SECRET` en el `.env` (§14.9).
- Con el backend `prisma`, las URLs de n8n de producción que el código trae por defecto (Copilot, sesiones de chat, contadores de bloque) quedan vacías (`productionN8nDefault` en `lib/api/data-backend.ts`): `/copilots` responde error en vez de llamar al n8n real. La barra de tipo de cambio conserva su `GET` público.

### 14.2.1 Despliegue de staging en Vercel (22 oct)

Proyecto de Vercel **nuevo**, no el de `admin.primeiqlatam.com`. La guarda (`lib/db/guard.ts`) deja correr las Server Actions fuera de `next dev` solo con `MSP_STAGING_DEPLOY=true` y el backend `prisma`, y se niega si el entorno tiene `STRAPI_USERNAME`, `STRAPI_PASSWORD` o `SYNC_API_KEY`. Desde el 22 oct las acciones de datos piden sesión y rol (§14.9), pero el login sigue abierto a cualquiera que llegue a la URL y todavía no tiene límite de intentos (valida claves reales): el proyecto **debe** seguir detrás de la protección de despliegues de Vercel. Variables del proyecto:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_DATA_BACKEND` | `prisma` |
| `MSP_STAGING_DEPLOY` | `true` |
| `DATABASE_URL_APP` | La misma del `.env` |
| `BETTER_AUTH_SECRET` | Desde el 22 oct. Mínimo 32 caracteres (`openssl rand -base64 32`), **distinto** del del `.env` local. Sin ella la app no arranca la sesión. |
| `BETTER_AUTH_URL` | Desde el 22 oct: la URL pública del despliegue de staging (con `https://`). |
| `DATABASE_CA_APP` | **Opcional** desde el 22 oct: `etl/certs/dbo-stage-ca.pem` se versiona (excepción en `.gitignore`; es la raíz pública que el servidor entrega en el handshake TLS) y `outputFileTracingIncludes` de `next.config.mjs` la mete en cada función. Si Railway rota la raíz: `npm run stage:cert` en `etl/`, commit y deploy, o definir esta variable (PEM, PEM con `\n` o base64). |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`, para que Vercel use el pnpm fijado en `package.json` |

No poner en Vercel ninguna variable de Strapi, sync, n8n ni del ETL: **no importar el `.env` entero** al panel (trae `DATABASE_*_STRAPI` y `DATABASE_URL_DBO_STAGE`). `DEV_LOGIN_*` no va en Vercel: desde el 22 oct el login ya no la lee (§14.9). Después de cambiar variables en Vercel hay que hacer **redeploy**, y cada variable tiene que estar marcada para el entorno que se usa (Production y/o Preview).

Notas:

- pnpm está fijado en `package.json` (`"packageManager": "pnpm@10.34.7"`, 22 oct): el `pnpm` de corepack descarga y usa esa versión, así que `pnpm install` y `pnpm run <script>` funcionan. Antes corepack caía a su 9.15.4, que falla con el `allowBuilds` de `pnpm-workspace.yaml` ("packages field missing or empty"). `npm run <script>` también funciona.

### 14.3 Las claves de la app nueva (antes en `.env.staging.local`, desde el 22 oct al final del `.env`)

Son tres claves, creadas por el agente sin imprimir valores:

- `DATABASE_URL_APP`: copia de `DATABASE_URL_DBO_STAGE` del `.env` (usuario `j_stage_admin`, servidor de staging de Railway). Ver el riesgo en la §10.
- `DEV_LOGIN_EMAIL` y `DEV_LOGIN_PASSWORD_HASH`: cuenta de desarrollo `engteam@primeiqlatam.com`, pedida por el usuario el 21 oct. Esa cuenta **no existe** entre los 17 usuarios que vienen de Strapi (será del panel de administración de Strapi). Se guardó solo el hash bcrypt de la clave, generado desde `market_scan_USERNAME`/`market_scan_PASSWORD` del `.env` de entonces (esas dos variables ya no están en el `.env`, §6); por esta vía entra con rol `administrator`. El 21 oct se eligió esto en vez de insertarla en `msp_app.user` porque la carga del ETL (espejo de Strapi) la habría borrado; el 22 oct eso cambió (punto siguiente).
- **Desde el 22 oct la cuenta también está en la base** (pedido del usuario): fila `app-engteam` en `msp_app.user`, rol `super_administrator`, creada con `npm run app:local-user -- --apply` en `etl/`. Entra igual con `pnpm run dev`, `pnpm dev:staging` y en Vercel, sin variables de login (desde el 22 oct el login ya no prueba `DEV_LOGIN_*`; la clave la lee de su cuenta `credential` en `msp_app.account`, que el script también escribe, §14.9). El ETL ya no borra las cuentas con `public_id` `app-…` (`localPrefix` en `etl/src/load/specs.ts`; ver `etl/README.md`). `DEV_LOGIN_*` queda en el `.env` porque el script lee de ahí el correo y el hash. Desde el 22 oct, 14:26, la clave es **propia de la app nueva** (pedido del usuario), ya no la del panel de Strapi; para cambiarla: hash bcrypt nuevo en `DEV_LOGIN_PASSWORD_HASH` y otra vez `app:local-user -- --apply` (actualiza `user` y la cuenta `credential`). Ojo: `next dev` expande los `$` del hash aunque esté entre comillas simples, así que esa variable por sí sola solo funciona con `pnpm dev:staging` o en Vercel.

Los 17 usuarios reales de `msp_app` (los del panel de usuarios de Strapi, p. ej. `jnoriega@primelatam.com`) también pueden entrar con su clave de siempre, además de las cuentas propias `app-…` (hoy solo `app-engteam`).

### 14.4 Qué se puede probar hoy en modo `prisma`

- **Completo:** `/catalogs` (los 12 catálogos: listar, buscar, paginar, crear, editar, borrar, según el rol desde el 22 oct), login (correo o usuario) y logout.
- **Parcial:** `/projects/new` (los selectores de país, desarrolladora, tipo de seguridad, NSE, amenidades y servicios; **no guardar**, `createProject` no está migrado), `/blocks/new` (categoría, enfoque y estado; el selector de proyecto falla), `/settings` (muestra el usuario; guardar falla).
- **Falla al cargar (no migrado):** listas, vistas y edición de proyectos y bloques; `/units` y la hoja; perfiles de tipo de cambio; olvidé y restablecer contraseña.
- **No abrir:** `/sync` (desde el 22 oct sus 6 rutas de API responden 503 con el backend `prisma`). `/copilots` ya no llama a n8n de producción con el backend `prisma` (desde el 22 oct `productionN8nDefault` deja vacía la URL por defecto), pero tampoco funciona: da error. La barra de tipo de cambio puede hacer un `GET` al webhook público; es lectura y la skill lo permite.
- Lo mismo vale para el staging de Vercel (§14.2.1).
- Lo que se crea en los catálogos cae en `msp_app` y la próxima carga del ETL lo borra (espejo de Strapi). La excepción son los usuarios con `public_id` `app-…` (§14.7).

Totales esperados en `/catalogs` (carga del 16 oct; contados otra vez en `msp_app` el 22 oct a las 12:10, en sesión de solo lectura, con la carga del 22 oct: no cambiaron): desarrolladores 538, amenidades 85, servicios 18, NSE 15, enfoques de bloque 15, topografías 12, estados de bloque 10, tipos de seguridad 9, categorías de bloque 7, tipos de parqueo 5, países 2, usos de unidad 2.

### 14.5 Cómo agregar el siguiente módulo (receta seguida con catálogos)

1. `graphify query` sobre el módulo y leer su inventario en `ROADMAP.md` §4 (pantallas, métodos, "debe seguir funcionando").
2. Reglas puras en `lib/db/<modulo>-mapping.ts`: fila de Prisma → la misma forma que devuelve Strapi (`documentId` = `publicId`, relaciones anidadas, `{ data, meta }` en listas). Sin `@/` ni React, imports relativos con `.ts`, para que corran con `node --test`. Pruebas en `lib/db/<modulo>-mapping.test.ts`.
3. Repositorio en `lib/db/<modulo>.ts` que recibe el `PrismaClient` (así se puede probar con un cliente de solo lectura).
4. Server Actions en `lib/db/<modulo>-actions.ts` (`"use server"`): cada una llama a `requireRole(permiso)` (`lib/db/session.ts`, que incluye la guarda `assertPrismaActionsAllowed()`), valida su entrada con un esquema Zod en `lib/db/<modulo>-schemas.ts` (patrón de `catalog-schemas.ts` con `parseInput` de `lib/db/input.ts`) y devuelve `ActionResult` (`lib/db/action-result.ts`), nunca lanza. Los errores pensados para el usuario son `PublicError`; el resto llega al navegador como mensaje genérico.
5. En `lib/api/prisma-client.ts`, reemplazar los `notMigrated(...)` del módulo por llamadas a las acciones con `unwrap()`.
6. Prueba de humo contra `msp_app` en **sesión de solo lectura**: script temporal `scripts/tmp-*.mts` (extensión `.mts`, la raíz no es ESM) corrido con `etl\node_modules\.bin\tsx.cmd`, con `options: "-c search_path=msp_app -c default_transaction_read_only=on"` y `process.loadEnvFile(".env")` (`.env.staging.local` ya no existe desde el 22 oct). Borrarlo después. No imprimir hashes ni credenciales.
7. `npm test`, `npx tsc --noEmit` (la línea base es de **38 errores** previos; ninguno debe estar en archivos nuevos), y si se tocó el empaquetado, un `next build` aislado: `$env:__NEXT_PROCESSED_ENV="true"; $env:NEXT_PUBLIC_DATA_BACKEND="prisma"; npx next build` (no carga ningún `.env`; los avisos "Dynamic server usage" del i18n son previos).
8. `CHANGELOG.md` y versión, `CLAUDE.md` si cambia la arquitectura, casillas de `ROADMAP.md`, la fila de la §6 y esta §14; `graphify update .`.

### 14.6 Siguiente paso

1. El usuario recorre `/catalogs` (lista de `ROADMAP.md` §4.4), en local o en el staging de Vercel. Si algo falla en local, revisar la salida de `pnpm dev:staging` / `pnpm run dev` en su terminal; en Vercel, pedirle el mensaje que ve (los errores de la guarda y del certificado dicen qué ven y en qué entorno corren).
2. El trabajo de catálogos, login, `app-engteam` y el `.env` único **ya tiene commit y push** (el usuario, hasta `0cb1d02`). Faltan el commit de las correcciones de documentos y decidir si sube la versión (§6). Nunca `.env` ni `.env.respaldo-*.local`.
3. **Decidido el 22 oct: pulir el backend antes de otro módulo (§14.8).** La sesión y la autorización ya están hechas con Better Auth (§14.9). Las tres opciones que se le habían ofrecido, para cuando toque el siguiente módulo:
   - **Proyectos en solo lectura** (`getProjects`, `getProjectById`): habilita la lista con filtros avanzados, la vista y los selectores de proyecto en bloques y perfiles. Es el más pesado en relaciones (país, desarrolladora, NSE, amenidades, servicios, perfil, financiamiento).
   - **Perfiles de tipo de cambio** (5 métodos + `getProjects` para vincular): el más corto.
   - ~~**Auth con Auth.js**~~ (decisiones 12 y 13): hecho el 22 oct con Better Auth (§14.9).

### 14.7 Bitácora del 22 oct: staging en Vercel y cuenta `app-engteam`

Lo que pidió el usuario ese día, en orden, y cómo quedó. Sirve para no repetir diagnósticos.

1. **Análisis de este README "como senior dev"**: hecho, solo respuesta (riesgos y recomendaciones), sin cambios.
2. **`pnpm run build` fallaba con "packages field missing or empty"**: corepack usaba pnpm 9.15.4, que no entiende `allowBuilds`. Se fijó `"packageManager": "pnpm@10.34.7"` en `package.json`.
3. **"Deja un único `.env` y dime qué variables poner en Vercel"**. Respuestas del usuario: proyecto de Vercel **nuevo**, backend **prisma**, y "únelos, deja las variables de Strapi para referencia pero ya no lo usaremos". Resultado: `.env` único (§14.2), `.env.staging.local` y `.env.local` absorbidos y borrados, respaldo en `.env.respaldo-20261022.local`, tabla de variables en §14.2.1, plantilla en `.env.staging.example`.
4. **Errores de Vercel**, uno detrás de otro:

| Mensaje que vio el usuario | Causa | Arreglo |
|---|---|---|
| "El backend prisma todavía no tiene autenticación: solo se puede usar en desarrollo local." | `lib/api/prisma-client.ts` repetía en el navegador una comprobación de `NODE_ENV` (`assertDevSession`). | Se quitó; decide solo la guarda del servidor. |
| "Las acciones sobre la base nueva solo corren en desarrollo local o en un despliegue con MSP_STAGING_DEPLOY=true." | Primero, la guarda solo aceptaba `next dev`. Después, la variable no estaba en el entorno de Vercel que se usaba, o faltaba el redeploy. | `lib/db/guard.ts` acepta `MSP_STAGING_DEPLOY=true` (sin credenciales de Strapi/sync). El mensaje dice si la variable falta o qué valor tiene, y el `VERCEL_ENV`. |
| "Falta la raíz del certificado (/var/task/etl/certs/dbo-stage-ca.pem)…" | El `.pem` estaba ignorado por git (`*.pem`) y no llegaba a la función. | Excepción `!etl/certs/dbo-stage-ca.pem` en `.gitignore` y `outputFileTracingIncludes` en `next.config.mjs`. |
| "Falta la raíz del certificado: DATABASE_CA_APP no está definida en este despliegue (entorno de Vercel: production)…" | El archivo todavía no estaba commiteado y la variable no existía en Vercel. | Commit del `.pem` (usuario, `a9baab4`). `DATABASE_CA_APP` queda opcional y acepta PEM, PEM con `\n` o base64 (`normalizeCaPem`). |

5. **"¿No estás exponiendo ninguna variable de entorno?"**: se escanearon el bundle del navegador (`.next/static`), los 532 archivos versionados y el historial de git. No hay contraseñas, tokens, hashes ni URLs de base de datos; solo valores públicos (correo del equipo, usuario de MySQL y URL de Strapi en la documentación). Ningún `.env` en el historial. De ahí salió el hallazgo del `.env.local` (§10).
6. **"¿Qué es eso de certificación?" y "¿está bien subirlo a GitHub?"**: `etl/certs/dbo-stage-ca.pem` es la raíz **pública** con la que Railway firma su certificado TLS (sujeto `CN=root-ca`, autofirmada, **sin clave privada**, vence el **1 dic 2028**). El servidor la entrega a cualquiera en el handshake, y conocerla no da acceso. El secreto real es `DATABASE_URL_APP`, que nunca se commitea. Si el usuario prefiriera no versionarla: quitar la excepción del `.gitignore` y usar `DATABASE_CA_APP` en Vercel.
7. **No podía entrar con `engteam@primeiqlatam.com`** en `pnpm run dev`: el hash de `DEV_LOGIN_PASSWORD_HASH` llegaba roto por la expansión de `$` (§10). El usuario pidió meter la cuenta en la base y que el ETL no la borre. Hecho:

| Campo de `msp_app.user` | Valor |
|---|---|
| `public_id` | `app-engteam` |
| `username` / `email` | `engteam` / `engteam@primeiqlatam.com` |
| `role` | `super_administrator` |
| `provider`, `confirmed`, `blocked` | `local`, `true`, `false` |
| `password_hash` | el mismo de `DEV_LOGIN_PASSWORD_HASH`; hasta el 22 oct, 14:26, bcrypt de la clave del panel de Strapi; desde entonces, de una clave propia de la app nueva (§14.3) |

- **Cómo se creó**: `npm run app:local-user -- --apply` en `etl/` (`etl/src/app/local-user.ts`). Lee el correo y el hash de `DEV_LOGIN_*` (con `dotenv`, que no expande `$`), revisa que el correo y el usuario no los tenga otra fila, y hace upsert por `public_id`. Sin `--apply` solo simula. `--role` cambia el rol.
- **Por qué el ETL ya no la borra**: el prefijo `app-` marca las cuentas propias de la app nueva (un `documentId` de Strapi no tiene guiones; las filas sintéticas del ETL usan `etl-`). `TableSpec.localPrefix` y `mirroredRows()` en `etl/src/load/specs.ts` la excluyen en tres sitios:
  - el `prune` de la carga espejo (`write.ts`);
  - el renombrado provisional de únicos (`releaseUniques`), que si no le cambiaba el correo por `__etl_release__…`;
  - la verificación (`verify.ts`, tabla y "usuario → rol"), que si no la contaba como sobrante y hacía ROLLBACK de la carga completa.
- **Probado**: `npm test` del ETL 50/50 (dos pruebas nuevas) y lectura de la fila después de insertarla. **Sin probar**: una carga completa real, porque lee el MySQL de producción y va fuera de 7:00–19:00 (§8, punto 1).
- **Riesgo**: si Strapi llega a tener un usuario con el correo `engteam@primeiqlatam.com` o el usuario `engteam`, la carga falla por el índice único. Se resuelve a mano: borrar `app-engteam` o cambiarle el correo.

8. **Segundo análisis "como senior dev"** (10:20): solo respuesta. Lo que pesa para seguir quedó en la §14.8 (riesgos del backend) y en la §9 (credencial `j_stage_admin`). Se comprobó que la §6 estaba desactualizada (`2678ecf` ya tenía commit y push).
9. **"¿Por qué hay tantos `.env`?" y "solo quiero un `.env`"**: ya era uno solo con valores (`.env.staging.local` y `.env.local` se habían absorbido en la mañana). A pedido del usuario se **borraron del `.env` las variables de Strapi y n8n comentadas** (60 → 33 líneas) y los comentarios viejos que mandaban a `.env.staging.local` (→ 29 líneas). Se editó con un script que comprobaba el contenido de cada línea antes de escribir y sin imprimir valores (salvo el error de la §10). Quedan: `DATABASE_*_STRAPI`, `DATABASE_URL_DBO_STAGE`, `MSP_STAGING_DEPLOY`, `NEXT_PUBLIC_DATA_BACKEND`, `DATABASE_URL_APP` y `DEV_LOGIN_*`. Ojo: el editor del usuario tenía abierta una versión vieja del `.env`; si la guarda, vuelven las líneas borradas (comprobar con un conteo de líneas, sin imprimir valores).
10. **"Si un archivo necesita credenciales, que lea este `.env`"** (decisión 15): `scripts/dev-staging.mjs` ya no busca `.env.staging.local`; comentarios y un mensaje de error que nombraban otros archivos, corregidos; `CLAUDE.md`, `ROADMAP.md` y `.env.staging.example` actualizados. `npm test` 92/92.
11. **"¿Ya tenemos la base de Strapi en nuestra db y catálogos la usa?"**: sí, con matices (foto del 16 oct, 52 de 87 tablas reorganizadas en 25, catálogos solo con el backend `prisma`, lo creado en catálogos lo borra la próxima carga). **"Antes se usaba Prisma y React, ¿ahora cómo?"**: corrección importante para el usuario: producción nunca usó Prisma; React habla con Strapi por HTTP. Explicación del flujo nuevo en la §14.8.
12. **Fallback a Strapi** → descartado (decisión 14). **¿Respaldo o pulir el backend?** → pulir el backend (decisión 16). El usuario pidió un plan de reversa y luego dijo "no supongas nada" y canceló el cuestionario de alcance; quedó sin plan formal. Las preguntas que faltan están en la §14.8.
13. **Tercer análisis "como senior dev"** (10:50) y, a pedido del usuario, **corrección de contradicciones** en los documentos: la §6 (fila de catálogos: guarda con `MSP_STAGING_DEPLOY` y `.env` único; `app-engteam` ya con commit; siguiente paso de la fila "Fase 5 (inicio)"), la §12.2 (50 pruebas del ETL, comprobado con `npm test`), la §14.1 (`app-engteam` con commit), `ROADMAP.md` (fase 0, usuarios resuelto por la decisión 13; fase 5, guarda) y el comentario de `lib/db/auth-actions.ts`. Hallazgos nuevos del análisis, sin decisión: `j_stage_admin`, que usa la app en Vercel, es **dueño** de `msp_app` (puede borrar tablas) y tiene `TRUNCATE` sobre las `sec_*` (lo ideal es un rol que solo pueda leer y escribir datos en `msp_app`, creado por un administrador); y falta escribir en qué momento `msp_app` deja de ser espejo de Strapi (el ETL deja de borrar, entran los respaldos de la decisión 16 y `audit_log`). A pedido del usuario (11:11) se corrigió en la skill `proteger-produccion` la línea que pedía un `.env` aparte para la app nueva: ahora manda al `.env` único (decisión 15). Lo demás de la §10 sobre la skill sigue igual.
14. **"Strapi se queda en este proyecto como fallback; el de producción está en otro repo con otro dominio"** (11:12). Respuestas del usuario: el Strapi y la base MySQL `strapi` a los que apunta este repo **son los de producción**; el fallback **queda pendiente** (decisión 14 reabierta, §9); y no se puede modificar la base ni nada de Strapi porque afecta al otro repo. Anotado en la §2, la decisión 14, la §9 y la fase 0 de `ROADMAP.md`. La skill y la regla no se tocaron.
15. **Snapshot nuevo de Strapi** (11:21–11:36, autorizado por el usuario en horario laboral, con `--allow-business-hours`): `npm run load -- --dry-run --allow-business-hours` en `etl/`. Snapshot `20261022-172111-full` (238,449 unidades, 1,687 bloques, 1,136 proyectos, 17 usuarios). Validación: 664 advertencias, las mismas tres categorías de la §12.5 (42 `code` repetidos, 2 bloques sin proyecto, 620 unidades sin bloque), 0 bloqueantes. Carga de prueba contra `msp_app`: unidades +502 / ~1,444 / −279, bloques +5 / ~33 / −5, proyectos +2 / ~1, `user` sin cambios (**`app-engteam` no se borra**). Verificación 25/25, 19/19, 1/1 y **ROLLBACK**: `msp_app` sigue con la carga del 16 oct. Fórmulas: 122,612 unidades difieren del motor (mismo patrón de la §12.8). Para el COMMIT sin volver a leer el RDS: `npm run load -- --snapshot 20261022-172111-full`.
16. **"Guárdalo"** (11:55): `npm run load -- --snapshot 20261022-172111-full` en `etl/`, sin leer el RDS. **COMMIT**, con los mismos cambios de la prueba y verificación 25/25, 19/19, 1/1. Después, `npm run app:ping`: proyectos 1,137, bloques 1,688, unidades 238,449, **usuarios 18** (los 17 de Strapi más `app-engteam`, que `app:local-user` sin `--apply` sigue encontrando). Desde ahora `msp_app` refleja Strapi al 22 oct 11:21 (UTC-6).
17. **Cuarto análisis "como senior dev" y "corrige las contradicciones del readme, no supongas nada"** (12:07–12:10). Solo se corrigió lo que se pudo comprobar: git (`0cb1d02` ya tiene el `.env` único y los documentos, y está subido), `npm test` de la raíz (92/92), `npm run app:ping` y una lectura de `msp_app` en sesión de solo lectura (`etl_run`: última carga con COMMIT = `20261022-172111-full`; totales de catálogos iguales a los de la §14.4) y los nombres de las variables del `.env`, sin leer valores. Secciones corregidas: §6 (encabezado, commits, lo que queda sin commit, fila del `.env`, filas de las fases 2 y 3), §8 B, §11.2, §12.1, §12.2, §13.1, §13.4, §14.3, §14.4, §14.6 y los pendientes de esta sección. Lo que no se pudo comprobar quedó marcado como tal: la afirmación de la §10 sobre `j_stage_admin` y el `dbo` de producción (pregunta de la §9). La sección 0 no se tocó. Quedaron dos contradicciones fuera de este documento, corregidas en el punto 18.
18. **"Sí, corrígelo"** (12:15), sobre esas dos contradicciones. `ROADMAP.md`, fase 3: decía "falta refrescar con un snapshot nuevo leído de noche"; ahora registra el refresco del 22 oct, leído de día con autorización del usuario. `CHANGELOG.md`, entrada del 22 oct de v1.29.0: describía el `.env` con las variables de Strapi y n8n comentadas y un `dev-staging.mjs` que usaba `.env.staging.local`; se agregó que ese mismo día (decisión 15, `0cb1d02`) se borraron esas variables y el lanzador pasó a leer solo el `.env` de la raíz (comprobado en `scripts/dev-staging.mjs` y en el diff de `0cb1d02`). No se subió la versión: lo decide el usuario. La sección 0 de `ROADMAP.md` no se tocó.
19. **"Dame una lista de lo que falta del backend" y "crea un readme en la carpeta de docs"** (12:16–12:17). Lista comprobada contra el código en [`README_Backend_full.md`](README_Backend_full.md) (el usuario la movió a esta carpeta), con casillas: sesión (Auth.js), autorización por Server Action y Route Handler, endurecimiento, `audit_log`, calidad, tareas de una persona, decisiones pendientes y los 22 métodos sin migrar. Sin commit.

**Pendiente** de lo del 22 oct (ninguno lo hace el agente sin que el usuario lo pida):

- Commit de las correcciones de `README.md`, `ROADMAP.md` y `CHANGELOG.md` (puntos 17 y 18), y decidir si sube la versión (§6).
- En el proyecto de Vercel, dejar solo las variables de la §14.2.1. No se confirmó si el usuario importó el `.env` entero; si lo hizo, quitar `DATABASE_*_STRAPI`, `DATABASE_URL_DBO_STAGE` y todo lo de Strapi/n8n. `DEV_LOGIN_*` ya puede quitarse.
- Activar la protección de despliegues de Vercel en ese proyecto (no confirmado).
- Rotar la clave de `engteam@` en Strapi (la hace una persona; §10). Ya no hace falta tocar `app-engteam`: desde el 22 oct, 14:26, tiene clave propia.
- Borrar `.env.respaldo-20261022.local` cuando el usuario confirme que no le falta nada. Es el único archivo que todavía guarda las claves de Strapi y n8n de producción.
- Decidir si los errores de las Server Actions se vuelven genéricos (§10).
- Antes del 1 dic 2028, o si Railway rota la raíz: `npm run stage:cert` en `etl/`, commit y deploy.

### 14.8 Foco actual: terminar de pulir el backend (Next.js + Prisma)

Pedido del usuario (22 oct): seguir con el backend nuevo. Decisiones 12–16. Lo que sigue se comprobó en el código el 22 oct; lo que no se pudo comprobar está marcado como pregunta. **Lista de pendientes con casillas: [`README_Backend_full.md`](README_Backend_full.md)**; al cerrar un punto, marcarlo ahí. **Los pasos 1 y 2 se hicieron el 22 oct por la tarde con Better Auth (§14.9)**; la tabla "Estado del código" de abajo es la foto de mediodía, con lo que cambió marcado.

**Cómo funciona hoy** (así se le explicó al usuario):

```text
Pantallas React (sin cambios)
  └─ dataClient (lib/api/client.ts): NEXT_PUBLIC_DATA_BACKEND elige la implementación
       ├─ "strapi" (producción): lib/api/strapi.ts ─HTTP─► Strapi ─► MySQL strapi
       └─ "prisma" (local y staging de Vercel): lib/api/prisma-client.ts
             └─ Server Actions "use server" (lib/db/*-actions.ts), corren en el servidor de Next
                   └─ repositorios lib/db/*.ts ─Prisma─► Postgres msp_app
```

Producción nunca usó Prisma: el backend era Strapi. El backend nuevo no es un servidor aparte, es el propio Next. La implementación `prisma` devuelve la misma forma que Strapi (`documentId`, `{ data, meta }`) para que la UI no cambie.

**Estado del código (22 oct):**

| Pieza | Hoy | Problema |
|---|---|---|
| Sesión | *Resuelto el 22 oct (§14.9).* Antes: `prisma-client.ts` guardaba el usuario en `localStorage` (`msp_dev_session`) con un token fijo `dev-local`. | — |
| Autorización | *Resuelto el 22 oct (§14.9):* `requireRole` en cada Server Action. Antes, `assertPrismaActionsAllowed()` solo miraba el entorno. | — |
| Login | Better Auth (`loginAction` en `lib/db/auth-actions.ts`), con un hash ficticio cuando la cuenta no existe (tiempo constante, 22 oct). *Desde el 28 oct (§14.13, v1.31.0):* límite de intentos por cuenta y por IP en `msp_app.login_attempt` y entrada validada con Zod. | Migración aplicada y prueba de punta a punta 13/13 (28 oct, §14.13). Falta probarlo en el navegador. |
| Errores | *Resuelto el 28 oct (§14.12, `25871a7`):* `actionFailure` solo deja pasar el mensaje de un `PublicError` (sesión, permiso, `CatalogError`); lo demás va al log del servidor y el navegador recibe un texto genérico. Antes devolvía `error.message` tal cual. | — |
| Rutas | *Resuelto el 22 oct:* `proxy.ts` (reemplaza a `middleware.ts`, que no hacía nada) manda a `/login` sin cookie de sesión, solo con el backend `prisma`. | Solo mira que exista la cookie; la sesión la valida cada Server Action. |
| Auditoría | La tabla `audit_log` (modelo `AuditLog`: `userId`, `entity`, `entityId` Int, `action` create/update/delete, `before`/`after` Json) **ya existe** en `msp_app` desde la migración `init`. | Ningún código escribe en ella. `entityId` es el `id` numérico de `msp_app`; para reaplicar en Strapi (decisión 14) hace falta el `publicId` (= `documentId`): probablemente una columna nueva, con migración. |
| Dependencias | `package.json`: Next 16.4.3 y React 19.2.9 (desde el 27 oct, actualización de seguridad v1.30.1; antes Next 16.0.10 y React 19.2.0), Prisma 7.10.0, `bcryptjs`, `zod` 3.25.76 y, desde el 22 oct, `better-auth` 1.7.12 (trae su propio zod 4 para uso interno). Node 24.22.1 en `.nvmrc`, `engines` `24.x`. | — |
| Conexiones | Pool de 2 por instancia (`lib/db/connection.ts`) contra un rol de Railway con límite bajo. *Desde el 28 oct (§14.12, `25871a7`):* cierra las inactivas a los 5 s y, en Vercel, `attachDatabasePool` las suelta antes de congelar la función. | **Pasó el 28 oct:** el rol quedó saturado (§14.12). Falta liberar las conexiones en Railway, desplegar el staging y, si se decide, `idle_session_timeout` en el rol o un rol propio para la app. |

**Orden propuesto** (cada paso se puede probar solo):

1. ~~**Sesión real**~~: hecho el 22 oct con Better Auth en vez de Auth.js (decisión 12; §14.9). Variable nueva `BETTER_AUTH_SECRET` (en vez de `AUTH_SECRET`).
2. ~~**Autorización en cada Server Action**~~: hecho el 22 oct (`requireUser` / `requireRole` en `lib/db/session.ts`, `proxy.ts`; §14.9).
3. **Endurecer**: ~~errores genéricos al navegador y detalle solo en el log del servidor~~ (hecho el 28 oct, §14.12); ~~login en tiempo constante~~ (hecho el 22 oct); ~~límite de intentos y Zod~~ (código hecho el 28 oct, §14.13; falta aplicar la migración y probarlo).
4. **`audit_log` en cada escritura**, en la misma transacción que el cambio, con el usuario de la sesión. Si hace falta el `publicId`, migración nueva aplicada solo en `msp_app` con `npm run app:deploy` desde `etl/` y con confirmación del usuario (receta en `etl/README.md`).
5. Después, el siguiente módulo (proyectos o perfiles, §14.6) con la receta de la §14.5, ya con sesión y auditoría.

Criterio de "hecho" de los pasos 1–3: en el staging de Vercel, una Server Action llamada sin sesión responde "no autorizado"; con sesión de un rol sin permiso, "prohibido"; el login responde igual de rápido exista o no la cuenta; ningún error muestra datos de la conexión. `npm test` y `tsc` sin errores nuevos (línea base de 38).

**Preguntarle al usuario antes de implementar** (pidió "no supongas nada"):

- ~~¿Qué roles pueden hacer qué?~~ Respondido el 22 oct: la matriz de Strapi (§14.9).
- ~~¿Cuánto debe durar la sesión?~~ Respondido el 22 oct: 7 días renovados con el uso (§14.9).
- ¿Límite de intentos de login: cuántos y por cuánto tiempo? (sin Redis todavía; se puede guardar en `msp_app`, lo que implica una migración).
- ¿Recuperar contraseña por correo entra ahora? Necesita proveedor de correo (Resend o SES, `ROADMAP.md` §4.3); propuesta: después.
- ¿Se confirmó la protección de despliegues de Vercel y se rotó la clave de `engteam@`? (§14.7, pendientes).

Lo que **no** entra en este foco: respaldos (decisión 16: antes de que `msp_app` deje de ser espejo), workers, Fase 4 y la regla de Interior (§13.2).

### 14.9 Bitácora del 22 oct (tarde): sesión y autorización con Better Auth

Pasos 1 y 2 de la §14.8. Commit `75541cb` del usuario (v1.30.0, subido), que incluye el borrado de `middleware.ts`.

**Decisiones del usuario** (cuestionario del plan):

| Tema | Elegido |
|---|---|
| Librería | **Better Auth** en vez de Auth.js (reemplaza la decisión 12): sesión guardada en la base, revocable. |
| Permisos | La matriz de roles de Strapi: `authenticated` lee; `operator` lee, crea y edita (no borra); `supervisor` CRUD; `administrator` CRUD y administra usuarios; `super_administrator` todo. |
| Claves | El ETL llena la tabla `account` (cuenta `credential` con el hash bcrypt de Strapi) y respeta las cuentas `app-…`. |
| Login | Con correo o con usuario. |
| Sesión | 7 días (el valor por defecto), renovada con el uso. |
| `/sync` | Sus 6 rutas de API responden 503 con el backend `prisma`. |
| Registro | Deshabilitado. |

**Qué se hizo:**

- **Base**: migración `20261022183000_better_auth` (solo agrega: columnas `name` e `image` en `user`; tablas `session`, `account` y `verification`, con borrado en cascada desde `user`). Aplicada en `msp_app` con `npm run app:deploy` desde `etl/`, con confirmación del usuario.
- **ETL**: tabla `account` en `etl/src/load/specs.ts` (una cuenta `credential` por usuario local con clave, `credentialAccounts` en `transform/users.ts`). Las cuentas de usuarios `app-…` quedan fuera del espejo por su padre (`mirroredScope`, que usan el borrado de hijos de `write.ts` y `verify.ts`). `account_id` es una `ref` a `user` guardada como texto (`textRef`). `npm run app:local-user -- --apply` también escribe la cuenta de `app-engteam`. Carga real con `--snapshot 20261022-172111-full` (sin leer el RDS): solo cambió `account`, verificación 26/26 tablas, 19/19 relaciones, 1/1 agregados, COMMIT. Lectura de control: 18 usuarios, 18 cuentas, ninguno sin cuenta, ningún hash distinto.
- **App**:
  - `lib/auth/server.ts`: configuración de Better Auth. Adaptador de Prisma, ids numéricos (`generateId: "serial"`), bcrypt de costo 10, `emailVerified` → columna `confirmed`, plugin `username`, `nextCookies()` y un hook que no crea sesión para usuarios bloqueados.
  - `lib/auth/permissions.ts`: la matriz de permisos, con pruebas.
  - `lib/db/session.ts`: `requireUser()` / `requireRole()`.
  - `lib/db/auth-actions.ts`: `loginAction`, `logoutAction` y `getMeAction`.
  - `lib/db/catalog-actions.ts`: cada acción pide su permiso.
  - `lib/api/prisma-client.ts`: sin `localStorage`; el `jwt` que recibe la UI es el marcador fijo `cookie-session`, porque la sesión real va en la cookie httpOnly.
  - `proxy.ts`.
  - `app/api/exchange-rates/route.ts`: valida la sesión en modo `prisma`.
  - `lib/sync/prisma-unavailable.ts` y las 6 rutas de `app/api/sync/`.
  - `.env.staging.example`: `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL`.
- **Desvío del plan**: **no se montó la ruta `/api/auth/[...all]`** de Better Auth. Login, logout y sesión pasan por las Server Actions (`auth.api.*` en el servidor), así que esa ruta solo agregaba superficie pública (registro, cambio de clave, etc.). Si algún día hace falta (OAuth, recuperar clave por correo), se monta y se revisa qué expone.

**Trampas encontradas** (para no repetir el diagnóstico):

- **Better Auth exige `account.account_id` = id del usuario en texto**: el login por correo busca la cuenta `credential` con `accountId === user.id`. La primera versión guardaba el `public_id` y la prueba de punta a punta falló con "Invalid email or password" ("User not found" en el log aunque el usuario existía). Corregido en el ETL (`textRef`) y en `app:local-user`; las 18 cuentas se reescribieron con la carga del snapshot.
- El validador de usuario por defecto del plugin `username` rechazaba 1 de los 18 usuarios de Strapi: se usa `/^\S+$/`. El login por usuario igual exige de 3 a 30 caracteres y compara en minúsculas.
- `validateSchema` de Better Auth compara la configuración con el modelo de Prisma: los nombres de campo de `lib/auth/server.ts` tienen que coincidir con `prisma/schema.prisma`.
- Un script fuera de Next que importe `lib/auth/server.ts` o `lib/db/client.ts` falla con "Cannot find module 'server-only'" (Next lo resuelve por dentro; no está en `node_modules`): hace falta un módulo vacío en `NODE_PATH`.

**Comprobado** (22 oct, 14:06): `npm test` de la raíz 96/96; `npm test` del ETL 53/53; `tsc` del ETL limpio; `npx tsc --noEmit` de la raíz sin errores en los archivos tocados. Prueba de punta a punta contra `msp_app` con dos usuarios temporales `app-qa-operator` y `app-qa-blocked`, con una clave aleatoria que no se imprimió. Se borraron al terminar, junto con sus cuentas y sesiones en cascada. Pasaron 13 de 13 comprobaciones:

- login con correo y con usuario (en mayúsculas);
- clave incorrecta, usuario inexistente, usuario bloqueado y registro, todos rechazados;
- `getSession` devuelve el rol;
- matriz del operador;
- cookie alterada sin sesión;
- filas en `msp_app.session`;
- usuario bloqueado después del login: `requireUser` lo rechaza;
- logout invalida la sesión y borra solo esa fila.

**Después** (14:16–14:33): el usuario vio en el navegador "Falta BETTER_AUTH_SECRET en el .env" (lo lanza `lib/auth/server.ts`; `getMe` lo mostró al cargar `AuthProvider`). Agregó `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` al `.env`, cambió la clave de `app-engteam` (§14.10), corrió `pnpm run build` (código 0; los avisos "Dynamic server usage" del i18n son los de siempre, y la tabla de rutas muestra `ƒ Proxy (Middleware)`), subió la versión a v1.30.0 e hizo commit y push (`75541cb`, `3720200`).

**Para cerrar la sesión de alguien desde el servidor**: borrar sus filas de `msp_app.session` o marcarlo `blocked` (las Server Actions lo rechazan aunque tenga cookie).

### 14.10 Dónde quedó la conversación (22 oct, 14:41)

**Qué está haciendo el usuario:** pruebas de penetración sobre la sesión y los permisos nuevos, con el backend `prisma` (local con `pnpm run dev` y/o el staging de Vercel). Pidió este traspaso mientras las corre. **Lo primero al retomar: preguntarle qué encontró** y no suponer resultados.

**Estado comprobado a las 14:41:**

- **Git**: rama `feat/data-facade`, árbol limpio, al día con `origin` (último commit `3720200`). Nada fusionado a `main`. El agente no hace commit ni push.
- **Versión**: v1.30.0 (`package.json` y `CHANGELOG.md`).
- **`msp_app`**: migración `20261022183000_better_auth` aplicada; 18 usuarios y 18 cuentas `credential`, todas con `account_id` = id del usuario. La última carga del ETL es el snapshot `20261022-172111-full` (COMMIT a las ~14:00, solo cambió `account`).
- **`.env`** (solo nombres, 33 líneas): `DATABASE_*_STRAPI`, `MSP_STAGING_DEPLOY`, `DATABASE_URL_DBO_STAGE`, `NEXT_PUBLIC_DATA_BACKEND`, `DATABASE_URL_APP`, `# DATABASE_CA_FILE_APP` (comentada), `DEV_LOGIN_EMAIL`, `DEV_LOGIN_PASSWORD_HASH`, **`DEV_LOGIN_PASSWORD`** (nueva, línea 30) y `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`.
  - `DEV_LOGIN_PASSWORD` la agregó el usuario: es la clave de `app-engteam` **en texto plano**. Ningún código la lee (`app:local-user` usa el hash). Recomendarle quitarla; el `.env` está en `.gitignore`, pero no hace falta tenerla ahí. No imprimir su valor.

**Cuenta `app-engteam` con clave propia** (14:26, pedido del usuario): ya no usa la clave del panel de Strapi. Se generó el hash bcrypt (costo 10) de la clave nueva, se reemplazó solo la línea `DEV_LOGIN_PASSWORD_HASH` del `.env` (mismo formato, entre comillas simples) y se corrió `npm run app:local-user -- --apply`, que actualiza `user.password_hash` y la cuenta `credential`. Comprobado en solo lectura: la clave nueva coincide en las dos tablas. La clave quedó escrita en el chat: sirve para staging, pero conviene cambiarla si la cuenta va a tener más alcance. Rotar la clave de Strapi ya no afecta a la app nueva.

**Qué se le explicó al usuario sobre la superficie de ataque** (para contrastar con lo que encuentre la prueba):

| Superficie | Qué pasa con el backend `prisma` |
|---|---|
| Server Actions de datos (`lib/db/catalog-actions.ts`, `getMeAction`) | **La protección real.** Cada una llama a `requireRole` / `requireUser` (`lib/db/session.ts`): sesión en `msp_app.session`, firma con `BETTER_AUTH_SECRET`, vencimiento, usuario no bloqueado y permiso del rol. Una Server Action se puede invocar con `POST` a **cualquier** URL (también `/login`, que es pública), por eso la validación va dentro de la acción. |
| `loginAction` / `logoutAction` | Públicas por diseño. Tiempo constante (Better Auth calcula un hash cuando la cuenta no existe). **Sin límite de intentos.** |
| `proxy.ts` | Solo comprueba que **exista** la cookie de sesión. Con una cookie inventada se ve el esqueleto HTML de las páginas, sin datos. Una prueba puede reportarlo como "bypass del proxy"; no da acceso a datos. Su `matcher` **excluye `/api/*`**. |
| `/api/exchange-rates` | Pide sesión (`requireUser`). |
| `/api/sync/*` (6 rutas) | 503. |
| `/api/strapi/*` | Sin `NEXT_PUBLIC_STRAPI_URL` apunta a `localhost:1337`: 503. |
| `/api/blocks/generate-code`, `/api/units/generate-code` | **No validan a quien llama**; sin credenciales de Strapi responden 500 "Admin credentials not configured". |
| `/api/copilot/n8n-chat` | **No valida a quien llama**; sin URL de n8n responde 500. Si algún día se define esa variable en staging, queda abierta: protegerla antes. |
| Registro y `/api/auth/*` de Better Auth | No existen (registro deshabilitado, ruta no montada). |

**Lo que la prueba casi seguro va a encontrar** (punto 3 de `README_Backend_full.md`, pendiente):

1. Sin límite de intentos de login: la fuerza bruta no se frena.
2. Errores sin filtrar: `actionFailure` (`lib/db/action-result.ts`) devuelve `error.message` tal cual al navegador.
3. Sin validación con Zod ni límite de largo en los campos de catálogos.

Reglas que se le recordaron para la prueba: solo contra staging o local, **nunca** contra `admin.primeiqlatam.com` ni Strapi; lo que la prueba cree o borre en catálogos cae en `msp_app` (aceptable: la próxima carga del ETL lo restaura, salvo cuentas `app-…`); si desactiva la protección de despliegues de Vercel para probar, volver a activarla al terminar.

**Siguiente paso propuesto** (el usuario no lo aprobó todavía): con los hallazgos de la prueba, atacar el punto 3. Preguntas que hay que hacerle antes de implementar ("no supongas nada"):

- Límite de intentos: ¿cuántos y por cuánto tiempo, y por cuenta, por IP o ambos? Better Auth trae `rateLimit`, pero con almacenamiento en memoria no sirve en Vercel (cada instancia cuenta aparte); guardarlo en `msp_app` implica una migración nueva (receta en `etl/README.md`, aplicada con `npm run app:deploy` y su confirmación). Sin Redis todavía.
- Errores genéricos: ¿qué mensajes ve el usuario (p. ej. "no se pudo completar la acción") y dónde queda el detalle (log del servidor con `lib/server-logger.ts`)?
- ¿Proteger también las rutas `/api/*` que no validan a quien llama (las de `generate-code` y Copilot) con `requireUser` en modo `prisma`, o devolver 503 como en `/sync`?

Después del punto 3: `audit_log` (punto 4) y el siguiente módulo (proyectos o perfiles, §14.6).

**Pendientes de una persona** (no los hace el agente): variables `BETTER_AUTH_SECRET` (otro valor) y `BETTER_AUTH_URL` en el Vercel de staging y redeploy (§14.2.1); confirmar la protección de despliegues; quitar del Vercel cualquier variable de Strapi/n8n/ETL si se importó el `.env`; rotar la clave de `engteam@` en Strapi; aclarar el alcance de `j_stage_admin` (§9); borrar `.env.respaldo-20261022.local`.

**Para repetir la prueba de punta a punta de la §14.9** (si se cambia algo de auth): script temporal fuera del repo, pasado por stdin a `etl\node_modules\.bin\tsx.cmd -` desde la raíz, con `process.loadEnvFile(".env")`, un `BETTER_AUTH_SECRET` aleatorio en memoria y `NODE_PATH` apuntando a un módulo `server-only` vacío (el agente lo dejó en `%TEMP%\msp-shim\node_modules\server-only`; se puede borrar y recrear: `package.json` con `{"name":"server-only","main":"index.js"}` e `index.js` vacío). Crea usuarios `app-qa-…` con cuenta `credential` (`accountId: String(user.id)`), los borra en `finally` (cascada a cuentas y sesiones) y nunca imprime la clave. Esas escrituras de prueba en `msp_app` las autorizó el usuario el 22 oct.

### 14.11 Bitácora del 27–28 oct: actualización de seguridad y error de conexiones

**Preguntas que quedaron al empezar el 28 oct** (las vigentes están en la §14.12):

1. ~~¿Sigue el error `too many connections`? ¿Qué cambió en el `.env` el 27 oct?~~ Respondido el 28 oct: sigue, y el usuario cambió o codificó la clave de `DATABASE_URL_APP` / `DATABASE_URL_DBO_STAGE` (§14.12).
2. ¿Qué encontró en las pruebas de penetración de la §14.10? Nunca se respondió.
3. ¿Se desplegó `d154426` en algún proyecto de Vercel, y en cuál?

**Estado comprobado el 28 oct a las 8:46:**

- **Git**: rama `feat/data-facade`, árbol limpio. Último commit `d154426` (27 oct, 16:29, del usuario). Según la referencia local, está igual que `origin`. Nada fusionado a `main`.
- **Versiones**: v1.30.1, Next 16.4.3, React y React DOM 19.2.9, `.nvmrc` 24.22.1, `engines.node` `24.x`.
- **`.env`** (solo nombres): las mismas 33 líneas de la §14.10, con `DEV_LOGIN_PASSWORD` todavía en la línea 30. `.env.respaldo-20261022.local` ya no existe.

#### Actualización de seguridad (27 oct, v1.30.1)

El usuario pidió primero un análisis de solo lectura (versiones actuales y versión de destino), luego un plan y después que el agente lo implementara en `feat/data-facade`, sin commit ni push. El commit lo hizo él.

**Decisiones del usuario:**

- Next.js **16.4.3** con versión exacta, y React / React DOM **19.2.9** exactas.
- `.nvmrc` 24.22.1 y `engines.node` `24.x`.
- Versión 1.30.0 → 1.30.1, con entrada en `CHANGELOG.md`.
- Actualizar `CLAUDE.md` y la fila "Dependencias" de la §14.8.

**Por qué:** 16.0.10 tenía todos los avisos de Next publicados desde enero de 2026. Subir a 16.4 los corrige sin cambiar de versión mayor. Los que importan aquí:

- [GHSA-mq59](https://github.com/vercel/next.js/security/advisories/GHSA-mq59-m269-xvcx): `Origin: null` saltaba la protección CSRF de Server Actions.
- [GHSA-p3m5](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), [GHSA-673q](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) y [GHSA-2464](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw). Este último exige `sharp` ≥ 0.35.5.
- Los saltos de `proxy.ts` de mayo y las denegaciones de servicio de Server Components.
- React [GHSA-xqc2](https://github.com/facebook/react/security/advisories/GHSA-xqc2-xf4c-x3h3) y GHSA-h3gv, en `react-server-dom-*`.
- Node 24.14.1 no tenía los parches de seguridad de junio, julio y octubre de 2026 (Brotli, undici, TLS).

Lista completa en la entrada v1.30.1 de [`CHANGELOG.md`](../../CHANGELOG.md).

**Cómo se hizo:**

- `pnpm add -E next@16.4.3 react@19.2.9 react-dom@19.2.9`. Nunca `npm install` en la raíz: regeneraría el `package-lock.json` viejo.
- **`pnpm add` no corrió el `postinstall`.** Se corrió a mano con `pnpm run postinstall`, que aplicó el parche de `@n8n/chat` y regeneró `lib/db/generated`. Si se vuelven a cambiar dependencias, correrlo igual.
- pnpm avisa "Ignored build scripts" (`@parcel/watcher`, `@prisma/engines`, `@swc/core`, `prisma`, `vue-demi`). **Ya pasaba con 16.0.10**: se comprobó instalando una copia limpia de `HEAD` (con `git archive`) en `%TEMP%`, ya borrada. El usuario eligió no aprobar nada y no tocar `allowBuilds` en `pnpm-workspace.yaml`, que sigue con valores de relleno. La CLI de Prisma funciona igual.

**Verificado (27 oct), igual que antes de actualizar:**

- `npm test` 96/96.
- `npx tsc --noEmit` con los mismos 38 errores previos, ninguno nuevo.
- Build aislado (`$env:__NEXT_PROCESSED_ENV="true"; $env:NEXT_PUBLIC_DATA_BACKEND="prisma"; pnpm build`): código 0, con las mismas 42 rutas y `ƒ Proxy (Middleware)` que el build de 16.0.10 hecho con la copia limpia.
- Los 18 mensajes `Error loading i18n: Dynamic server usage … cookies` del build salen del `try/catch` de `app/layout.tsx` y son idénticos con 16.0.10.
- `Environments: .env` en el build solo lista el archivo. Comprobado en `@next/env` 16.4.3: con `__NEXT_PROCESSED_ENV` puesto no aplica nada.
- `sharp` 0.35.5.
- `pnpm audit --prod`: 0 avisos de `next`, `react` o `react-dom`. Quedan 36 en otras dependencias, fuera de alcance y sin tocar: `maplibre-gl` (crítico, hay que subir a ≥ 6.4.1), `@n8n/chat` y sus transitivas (`markdown-it`, `linkify-it`, `nanoid`, `postcss`…), `zod` 3.25.76 (hay que subir a ≥ 4.6.6), `jquery` vía `luckysheet`, `mysql2` y `deepmerge-ts` vía `@prisma/client`, `brace-expansion` vía Glide Data Grid y `browserslist` vía `autoprefixer`. Si el usuario quiere atacarlos, es otro plan.

**Pendientes de una persona** (no los hace el agente):

- Confirmar qué proyecto de Vercel es `market-scan-back-office` (al que apunta `.vercel/repo.json`) y si despliega `admin.primeiqlatam.com`.
- Revisar en el log de build de Vercel el Node real (debe ser 24.x).
- El commit `d154426` es de `joshuacprime <joshuac@primeiqlatam.com>`. Según `CLAUDE.md`, Vercel solo despliega commits de `Admin-PrimeIQ` con `engteam@primeiqlatam.com`. Confirmar si eso aplica al proyecto que se quiera desplegar.
- Revisar si el repo del backoffice de producción necesita la misma actualización.
- Probar en el navegador. Login y catálogos ya se usaron el 28 oct con `pnpm run dev` (ver el error de abajo). **La hoja de unidades no se puede probar en local**: con `prisma` el módulo no está migrado, y con `strapi` el `.env` no tiene `NEXT_PUBLIC_STRAPI_URL` (y no debe agregarse, decisión 15). Se verá cuando el cambio llegue al proyecto de producción, que despliega una persona.

#### Preguntas sobre claves (27 oct, 15:16–15:41)

El usuario preguntó cómo "encodear" contraseñas. Se le dieron dos comandos, y ninguno lo corrió el agente:

- **Hash bcrypt para `DEV_LOGIN_PASSWORD_HASH`** (costo 10, `bcryptjs`, igual que `lib/auth/server.ts`). Desde la raíz: `node --env-file=.env -e "console.log(require('bcryptjs').hashSync(process.env.DEV_LOGIN_PASSWORD, 10))"`. Luego, desde `etl/`, `npm run app:local-user` para simular y `-- --apply` para aplicar.
- **Clave dentro de una URL de Postgres** (`DATABASE_URL_APP`, `DATABASE_URL_DBO_STAGE`): `[uri]::EscapeDataString('CLAVE')`, con comillas simples. Se codifica la clave entera: las tres conexiones (`lib/db/connection.ts`, `etl/src/app/connection.ts` y `etl/src/stage/connection.ts`) leen la URL con `new URL()` y aplican `decodeURIComponent` a la clave. Esto es más que lo que pide la plantilla (solo `%` y `#`), y funciona igual.

El `.env` cambió a las 15:50 (fecha del archivo). Probablemente el usuario cambió una clave o URL, pero no se sabe cuál: hay que preguntarle.

#### Error abierto (28 oct, ~8:38): `too many connections for role "j_stage_admin"`

Visto en la terminal de `pnpm run dev` (backend `prisma`, Next 16.4.3). Prisma responde `P2037 TooManyConnections` de forma intermitente:

- en `requireUser` (`lib/db/session.ts:19`, la lectura de la sesión de Better Auth), llamado desde `/api/exchange-rates`;
- en `listCatalogAction` (`findMany` y `count` del repositorio de catálogos).

Otras peticiones del mismo rato funcionan: `engteam@primeiqlatam.com` tenía sesión, `/catalogs` cargó y `/api/exchange-rates` respondió 200 algunas veces.

**Efectos visibles:**

- `/api/exchange-rates` responde **401**: al fallar la lectura de la sesión, el usuario parece anónimo.
- Los catálogos muestran "Error al cargar items" con **el mensaje completo de Prisma en el navegador**, incluidos el nombre del rol y rutas de archivo. Confirma el hallazgo 2 de la §14.10: `actionFailure` (`lib/db/action-result.ts`) devuelve `error.message` tal cual.

**Lo que se sabe del código** (sin conectarse a la base):

- La app usa un solo `PrismaClient` por proceso, guardado en `globalThis` (`lib/db/client.ts`), con un pool de `max: APP_MAX_CONNECTIONS` (2) en `lib/db/connection.ts`.
- Better Auth usa ese mismo cliente (`prismaAdapter(getAppPrisma())` en `lib/auth/server.ts`).
- Así, un proceso de `next dev` no debería pasar de unas pocas conexiones.
- El límite es **del rol**: cuenta todas las conexiones de `j_stage_admin` en el servidor de Railway. Eso incluye `next dev` local, cada instancia del staging de Vercel (pool de 2 cada una), el ETL, cualquier cliente SQL abierto y conexiones colgadas. La §14.8 ya decía que ese rol tuvo un límite bajo.

**Hipótesis sin comprobar:**

- instancias del staging de Vercel con conexiones abiertas;
- otro cliente SQL o un proceso del ETL abierto;
- el límite del rol cambió;
- relación con el cambio del `.env` del 27 oct.

**Siguiente paso propuesto** (preguntarle antes): cuando haya un hueco libre, una lectura de solo lectura:

- `SELECT rolconnlimit FROM pg_roles WHERE rolname = 'j_stage_admin'`;
- `SELECT application_name, client_addr, state, count(*) FROM pg_stat_activity WHERE usename = 'j_stage_admin' GROUP BY 1, 2, 3`.

La app se identifica como `application_name = 'msp-app-next'`. **No** terminar conexiones (`pg_terminate_backend`) ni cambiar el rol (`ALTER ROLE … CONNECTION LIMIT`) sin permiso del usuario. Ese servidor también tiene el esquema `dbo`, que está en producción (sección 0, §11).

Después, con el usuario, decidir si se baja el pool, se cierra el staging o se pide más límite en Railway. Y adelantar los errores genéricos del punto 3 de la §14.8, porque este error ya muestra datos de la conexión en el navegador.

La continuación (diagnóstico, cambios de código y pendientes) está en la **§14.12**.

### 14.12 Dónde quedó la conversación (28 oct, 9:10)

Conversación del 28 oct, de 8:48 a 9:10 (UTC-6). El usuario le pidió al agente que actuara "como senior dev" y que usara el grafo de `graphify-out/` como contexto.

**Lo primero al retomar: preguntarle al usuario**, sin suponer:

1. ¿Alguien entró a Railway con el usuario administrador y corrió las dos consultas del diagnóstico (abajo)? ¿Qué salió: `rolconnlimit` y de dónde vienen las conexiones (`application_name`, `client_addr`, `state`)?
2. ¿Se pausó o se redesplegó el staging de Vercel? ¿Ese proyecto ya tiene el commit `25871a7`?
3. ¿Se decidió algo del lado del servidor: `idle_session_timeout` en el rol, subir su `CONNECTION LIMIT` o un rol propio para la app (abajo)?
4. ¿Sube la versión (sigue en v1.30.1) y se agrega la entrada de `CHANGELOG.md` para `25871a7`? Lo pide la convención de `CLAUDE.md`; el usuario hizo el commit sin eso.
5. `Agente.md`: el usuario pidió analizar `C:\Users\Joshua C\Desktop\marketscanprime\Agente.md`, pero **no existe** (ni en la raíz, ni en subcarpetas, ni en el historial de git). Se le pidió que lo guardara o diera la ruta; no respondió y pasó al error de conexiones. Preguntar si sigue pendiente.
6. Las preguntas que siguen abiertas de antes: pruebas de penetración (§14.10) y en qué proyecto de Vercel se desplegó `d154426` (§14.11).

#### El error: `too many connections for role "j_stage_admin"`

Síntomas en `pnpm run dev` (backend `prisma`): `P2037 TooManyConnections` intermitente en `requireUser` (`lib/db/session.ts`, sesión de Better Auth, llamado desde `/api/exchange-rates`, que entonces responde 401) y en `listCatalogAction` (`findMany`/`count`), con el mensaje completo de Prisma en el navegador. Contexto previo en la §14.11.

**Lo que dijo el usuario** (cuestionario, 8:52):

- Fuera de su `pnpm dev`, `j_stage_admin` lo usa **el staging de Vercel** (mismo `DATABASE_URL_APP`). No marcó ETL, clientes SQL ni otras personas.
- El cambio del `.env` del 27 oct, 15:50: **cambió o codificó la clave** de `DATABASE_URL_APP` / `DATABASE_URL_DBO_STAGE`.
- Autorizó **una** conexión de solo lectura para diagnosticar y pidió los errores genéricos; después pidió también el ajuste del pool (abajo).

**Lo que se comprobó** (sin leer valores del `.env`; solo nombres y host):

- `DATABASE_URL_APP` y `DATABASE_URL_DBO_STAGE` usan el mismo usuario `j_stage_admin` y el mismo host de Railway (`altaria.proxy.rlwy.net:18692`, base `railway`). En el `.env` local también está `MSP_STAGING_DEPLOY` con 4 caracteres (probablemente `true`; en `next dev` no cambia nada).
- El código no tiene fuga de conexiones: un solo `PrismaClient` por proceso en `globalThis` (`lib/db/client.ts`), compartido con Better Auth, y pool de máximo 2 (`lib/db/connection.ts`).
- Con `next dev` en reposo, la PC tenía **0** conexiones `ESTABLISHED` al puerto de Railway (`Get-NetTCPConnection -RemotePort 18692`).
- Aun así, **7 intentos** en ~1 minuto de una conexión de solo lectura (script temporal en `%TEMP%`, ya borrado; `application_name = msp-diag-readonly`, `default_transaction_read_only=on`) fallaron con `53300 too many connections for role "j_stage_admin"`. **El rol está saturado de forma continua por conexiones que no salen de esta PC.** No se pudo leer `rolconnlimit` ni `pg_stat_activity`.
- Sospechoso principal: el staging de Vercel. Cada instancia abre un pool de hasta 2 y, cuando Vercel congela la función, sus conexiones quedan abiertas del lado de Postgres. Sin descartar: conexiones colgadas de `next dev` o del ETL de días anteriores.
- En los logs, cada página de catálogos tarda 1–3 s y llama **dos veces** a `listCatalogAction` (posible doble efecto de React en desarrollo). No se investigó; revisarlo cuando la base responda, porque duplica las consultas.

**Lo que tiene que hacer una persona** (no el agente; cambia el servidor o el despliegue). Se le explicó al usuario a las 9:01:

1. **Diagnóstico**, desde Railway con el usuario administrador (tiene conexiones reservadas):
   ```sql
   SELECT rolconnlimit FROM pg_roles WHERE rolname = 'j_stage_admin';
   SELECT application_name, client_addr, state, count(*), min(state_change) AS inactiva_desde
   FROM pg_stat_activity WHERE usename = 'j_stage_admin' GROUP BY 1, 2, 3 ORDER BY 4 DESC;
   ```
   La app se identifica como `msp-app-next`.
2. **Liberar**: pausar o redeplegar el staging de Vercel. Si no alcanza, terminar solo las inactivas de la app:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE usename = 'j_stage_admin' AND application_name = 'msp-app-next'
     AND state = 'idle' AND state_change < now() - interval '5 minutes';
   ```
3. **Prevenir** (opciones, de menos a más trabajo): `ALTER ROLE j_stage_admin SET idle_session_timeout = '10min'` y `idle_in_transaction_session_timeout = '2min'` (Postgres 18; solo afecta sesiones nuevas e inactivas); subir el `CONNECTION LIMIT` del rol (parche); un **rol propio para la app**, solo con lectura y escritura de datos en `msp_app` y su propio límite (resuelve además el riesgo de la §10: hoy la app usa el dueño de `msp_app`); un pooler (PgBouncer) delante para el tráfico de Vercel.

Advertencia que se le dio: ese servidor también tiene el esquema `dbo`, y los documentos se contradicen sobre si es de producción (§9, §10). Los cambios de arriba son del rol, no del servidor, pero hay que confirmar que nada más dependa de `j_stage_admin`.

#### Cambios de código (commit `25871a7` del usuario, 28 oct 9:09, subido)

El agente no hizo commit ni push. El mensaje del commit solo menciona `@vercel/functions`, pero incluye todo lo de abajo y este documento.

- **Errores genéricos** (paso 3 de la §14.8): `lib/db/action-result.ts` define `PublicError`. `actionFailure` solo devuelve al navegador el `message` y los `details` de un `PublicError`. Cualquier otro error se registra con `console.error("[server-action] …")` y el navegador recibe el texto genérico, o `DB_BUSY` ("La base de datos está ocupada…") si el código es `P2037` o `53300`. `CatalogError` (`lib/db/catalog-mapping.ts`) hereda de `PublicError`, y `lib/db/session.ts` lanza `PublicError` para `NO_SESSION` y `FORBIDDEN`. Efecto secundario aceptado: los mensajes de la guarda (`lib/db/guard.ts`) y de configuración (`lib/db/connection.ts`) ya no llegan al navegador, solo a la terminal o a los logs de Vercel. Pruebas nuevas: `lib/db/action-result.test.ts` (3).
- **Pool**: `lib/db/connection.ts` agrega `APP_IDLE_TIMEOUT_MS = 5_000` como `idleTimeoutMillis` (antes regía el valor por defecto de `pg`, 10 s). `lib/db/client.ts` crea el `pg.Pool`, lo registra con `attachDatabasePool` de **`@vercel/functions` 3.10.4** (dependencia nueva, versión exacta) y lo pasa a `PrismaPg` con `onPoolError` (que solo registra). `attachDatabasePool` no hace nada fuera de Vercel (requiere `VERCEL_URL` y `VERCEL_REGION`); en Vercel mantiene viva la función hasta que el pool cierra las conexiones inactivas. Se comprobó en el código del adaptador (`@prisma/adapter-pg` 7.10.0) que con un pool externo se suscribe igual al evento `error` del pool, así que un cierre del lado del servidor no tumba el proceso.
- **Verificado**: `npm test` 99/99; `npx tsc --noEmit` con los mismos 38 errores previos, ninguno en `lib/db`; `next dev` recompiló sin errores. **No** se probó una consulta real: el rol seguía saturado.
- `pnpm add` avisó lo mismo que el 27 oct ("Ignored build scripts" y peers de React 16–18 de otra dependencia); no se tocó nada.
- `graphify update .` corrido a las 9:09 (3166 nodos). Avisos sin acción: falta `graphifyy[sql]` para los `.sql`, y `graphify label` renombraría las comunidades (usa un modelo de IA).

**Para confirmar que quedó resuelto** (cuando la persona libere las conexiones): reiniciar `pnpm dev` (el pool viejo vive en `globalThis` hasta reiniciar), abrir `/catalogs/projects/developers` varias veces y comprobar que no aparece `P2037`, que `/api/exchange-rates` responde 200 y que con `Get-NetTCPConnection -RemotePort 18692 -State Established` las conexiones bajan a 0 unos 5 s después de dejar de navegar. En Vercel, lo mismo desde la consulta de `pg_stat_activity`, después del despliegue.

**Siguiente paso** una vez resuelto: retomar la §14.8 (límite de intentos de login, Zod, `audit_log`) y la lista de [`README_Backend_full.md`](README_Backend_full.md). Hecho a continuación: §14.13.

### 14.13 Bitácora del 28 oct (9:15–): límite de intentos de login y Zod (v1.31.0)

A las 9:17 el usuario dijo que **el error de conexiones ya está arreglado**; el agente no lo comprobó contra la base. Pidió un plan para seguir y, a las 9:19, "ejecuta" sobre ese plan. Los valores del plan cuentan como aceptados: 5 intentos por cuenta y 20 por IP en 15 minutos, bloqueo de 15 minutos, tabla en `msp_app` y versión 1.31.0. El trabajo quedó **sin commit**.

**Qué se hizo:**

- **Límite de intentos** (paso 3 de la §14.8):
  - Reglas puras en `lib/auth/login-throttle.ts`: claves `acct:<identificador en minúsculas>` e `ip:<x-real-ip o primer x-forwarded-for>` y la decisión. Pruebas en `login-throttle.test.ts`.
  - Contadores en `lib/db/login-throttle.ts`:
    - cada intento suma **antes** de comprobar la clave, en un solo `INSERT … ON CONFLICT … RETURNING`, así que una ráfaga en paralelo no pasa del límite;
    - pasado el límite se fija `locked_until` y se rechaza sin llegar a bcrypt, exista o no la cuenta;
    - el login correcto borra la fila de la cuenta, le resta uno a la de la IP y limpia las filas sin uso en un día.
  - `loginAction` lo usa antes de `signInEmail`/`signInUsername`. Mensaje: "Demasiados intentos de inicio de sesión. Intenta de nuevo en N minutos."
  - No se usó el `rateLimit` de Better Auth: solo aplica a su ruta HTTP, que no está montada (§14.9).
  - Riesgo aceptado: el correo y el nombre de usuario de una misma persona cuentan por separado (como mucho, el doble de intentos).
- **Migración `20261028153000_login_attempt`**:
  - Generada con `migrate diff --from-config-datasource` contra `msp_app`, que es solo lectura. El diff trajo **solo** la tabla nueva, así que no hay desfase entre el esquema y la base.
  - SQL: `CREATE TABLE "login_attempt"` (`key` como llave primaria, `fail_count`, `window_start`, `locked_until`, `updated_at`) más un índice en `updated_at`. No menciona `dbo_stage` ni `dbo`.
  - El ETL no la carga ni la borra: no está en `etl/src/load/specs.ts`.
  - **Aplicada** el 28 oct con `npm run app:deploy` desde `etl/`, con confirmación del usuario ("1 t 2 si"). `npm run app:status`: 4 migraciones, "Database schema is up to date!".
- **Zod** en las Server Actions:
  - `lib/db/auth-schemas.ts` (login).
  - `lib/db/catalog-schemas.ts` (endpoint, id, parámetros de lista y cuerpo, con largos máximos; sin claves desconocidas; `null` vacía el campo).
  - `lib/db/input.ts` (`parseInput` y detalles en español).
  - En `catalog-actions.ts` la validación corre después de `requireRole`.
- **`/api/exchange-rates`**: 401 solo con `PublicError` (sin sesión o usuario bloqueado). Cualquier otro fallo al leer la sesión da 503 y el detalle va al log.
- **Documentación**:
  - La receta de la §14.5 ahora pide `requireRole` y un esquema Zod.
  - `CHANGELOG.md` v1.31.0, que también cubre `25871a7`.
  - Casillas de `README_Backend_full.md`.
  - `ROADMAP.md`, Fase 5.

**Verificado**:
- `npm test` de la raíz 110/110 (antes 99);
- `npx tsc --noEmit` con los mismos 38 errores previos, ninguno en archivos tocados;
- `prisma generate --generator app` regenerado.

**Prueba de punta a punta contra `msp_app`** (28 oct, 10:04, autorizada; receta de la §14.10): **13/13**. Script temporal en `%TEMP%`, ya borrado. Usó un usuario temporal `app-qa-throttle` (operator, clave aleatoria que no se imprimió) e IPs de documentación `203.0.113.x`. Reproduce el orden de `loginAction` (límite, `signInUsername` de Better Auth, limpieza del contador); no llama a la Server Action en sí, porque fuera de Next no hay `headers()`. Resultados:

- 5 claves malas llegan a bcrypt; el sexto intento se bloquea **aunque la clave sea la correcta**, y también desde otra IP;
- con la hora adelantada 16 minutos, el bloqueo ya venció;
- 3 malas y luego la buena: el login es correcto, borra la fila de la cuenta y le resta uno a la IP (4 → 3); después vuelven a caber 5 intentos y el sexto se bloquea;
- una cuenta inexistente: 5 inválidas y el sexto bloqueado (mismo trato);
- 12 intentos **en paralelo** a la misma cuenta: exactamente 5 inválidas y 7 bloqueadas;
- límite por IP: 20 cuentas distintas desde la misma IP pasan y la 21.ª se bloquea.

Limpieza en `finally`: 0 filas de prueba en `login_attempt` y 0 usuarios `app-qa-throttle` (la cuenta `credential` y las sesiones caen en cascada).

**Para cerrar este paso:**

1. ~~`npm run app:deploy`~~ y ~~prueba de punta a punta~~: hechos (arriba).
2. El commit lo hace el usuario.
3. El usuario prueba en el navegador con `pnpm dev:staging`: `/login` con clave mala seis veces y `/catalogs` (crear con un nombre de más de 255 caracteres → "name: máximo 255 caracteres").
4. Después: `audit_log` (paso 4 de la §14.8), que antes necesita decidir cuándo `msp_app` deja de ser espejo de Strapi.
