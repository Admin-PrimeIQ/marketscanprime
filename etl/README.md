# etl — migración Strapi → msp_app

Paquete aislado (npm propio, fuera del build de Next.js) que lee la base MySQL de Strapi con Prisma 7 y la carga en el esquema de la app nueva (`msp_app`, ver [Carga Strapi → msp_app](#carga-strapi--msp_app)). Contexto completo de la migración: [`docs/migration/README.md`](../docs/migration/README.md).

## Reglas

- La base `strapi` es **solo lectura**: conectarse con un usuario MySQL que solo tenga `SELECT`.
- Nunca correr `prisma migrate`, `prisma db push` ni `prisma migrate reset` contra `strapi`, `dbo_stage` ni `dbo`. Las migraciones solo se aplican al esquema `msp_app`, con `npm run app:deploy`.
- `prisma db pull` **sin** `--print` sobrescribe `prisma/strapi/schema.prisma` y borra los comentarios y relaciones escritos a mano. Usar siempre `npm run strapi:pull:print` y comparar.
- Las credenciales van en el `.env` de la **raíz** del repo (ignorado por git), no en `etl/`.

## Instalación

```bash
cd etl
npm install
npm run strapi:generate   # genera el cliente en etl/generated/strapi (gitignored)
```

npm 11 bloquea los scripts de instalación hasta aprobarlos; `package.json` → `allowScripts` ya autoriza `prisma`, `@prisma/engines` y `esbuild`.

## Variables (`../.env`)

| Variable | Uso |
|---|---|
| `DATABASE_HOST_STRAPI` | Endpoint de RDS us-east-2 (`strapi.….us-east-2.rds.amazonaws.com`). |
| `DATABASE_PORT_STRAPI` | `3306` (por defecto). |
| `DATABASE_NAME_STRAPI` | `strapi`. |
| `DATABASE_USER_STRAPI` / `DATABASE_PASSWORD_STRAPI` | Usuario con **solo `SELECT`**. El cliente rechaza usuarios que empiecen con `adm` (el de Strapi). Si la contraseña tiene `#`, va entre comillas dobles. |

| `DATABASE_URL_DBO_STAGE` | Postgres de staging en Railway (`postgresql://…/railway`). El esquema `dbo_stage` se abre **solo en lectura** (`default_transaction_read_only=on`). |
| `DATABASE_URL_APP` | Opcional. Postgres de la app (esquema `msp_app`). Si falta, se usan las credenciales de `DATABASE_URL_DBO_STAGE`: es el mismo servidor. |

La conexión a Strapi usa SSL validando el certificado con `certs/rds-global-bundle.pem` (bundle público de AWS), un pool de 2 conexiones como máximo y una extensión que bloquea toda escritura de Prisma.

Railway firma el certificado del Postgres con una raíz propia y lo emite para `localhost`. `npm run stage:cert` guarda esa raíz en `certs/dbo-stage-ca.pem` (solo hace la negociación TLS, sin credenciales), y las conexiones validan la cadena contra ella. El CLI de Prisma exige que el nombre coincida, así que `npm run app:*` lo corre a través de un proxy TCP en `localhost` (`src/app/prisma-cli.ts`). El TLS sigue siendo de punta a punta, y el proxy bloquea `migrate reset` y `db push`.

## Scripts

| Script | Qué hace | Conexión |
|---|---|---|
| `strapi:validate` | Valida la sintaxis del esquema. | No |
| `strapi:generate` | Genera el cliente tipado. | No |
| `strapi:pull:print` | Imprime el esquema introspectado de la base real, sin escribir archivos. | Sí |
| `strapi:ping` | Prueba de conexión: usuario, SSL y permisos. Se detiene si el usuario tiene algo más que `SELECT`. | Sí |
| `strapi:check` | Conteo y lectura de una fila por modelo, comparados con el inventario del manual; `document_id` repetidos. | Sí |
| `stage:cert` | Guarda la raíz del certificado de Railway en `certs/dbo-stage-ca.pem`. | Solo TLS |
| `stage:ping` | Permisos del usuario por esquema en el Postgres de staging (solo lectura). | Sí |
| `stage:describe` | Columnas, identity, llaves, índices y actividad (filas vivas, inserts) de un esquema del Postgres de staging, desde `pg_catalog` (ve la estructura aunque no haya permiso de lectura). `-- --schema dbo` cambia de esquema (por defecto `dbo_stage`); `-- --values` agrega los valores más frecuentes de `dbo_stage.sec_*` (solo lectura). | Sí |
| `app:validate` / `app:generate` | Valida el esquema de la app (`../prisma/schema.prisma`) / genera su cliente en `generated/app`. | No |
| `app:status` | Migraciones aplicadas y pendientes en `msp_app`. | Sí |
| `app:deploy` | Aplica las migraciones pendientes de `../prisma/migrations` en `msp_app`. | Sí, **escribe** |
| `app:pull:print` | Esquema introspectado de `msp_app`, sin escribir archivos. | Sí |
| `app:ping` | Esquema de la sesión y conteos de `msp_app`. | Sí |
| `load:validate` | Extrae Strapi a un snapshot (o reusa uno), valida relaciones y transforma. No escribe en `msp_app`. | Strapi (lectura) |
| `load` | Carga a `msp_app` en una sola transacción, verifica y hace COMMIT; si algo falla, ROLLBACK. | Strapi (lectura) + `msp_app`, **escribe** |
| `load:verify` | Compara `msp_app` con un snapshot, en una transacción de solo lectura. | `msp_app` (lectura) |
| `test` | Pruebas de validación y transformación con un snapshot sintético. | No |
| `typecheck` | `tsc --noEmit`. | No |

Para crear una migración nueva sin base "shadow" (el usuario no puede crear bases):

```bash
npx tsx src/app/prisma-cli.ts migrate diff --from-config-datasource --to-schema ../prisma/schema.prisma --script --output ../prisma/migrations/<fecha>_<nombre>/migration.sql
```

Revisa el SQL antes de `app:deploy`: no debe mencionar `dbo_stage` ni crear esquemas.

## Estructura

```
etl/
├── prisma.strapi.config.ts       # config Prisma 7 (esquema + URL para db pull)
├── prisma/strapi/schema.prisma   # 52 modelos, nombres idénticos a tablas/columnas
├── generated/strapi/             # cliente generado (no se commitea)
├── prisma.app.config.ts          # config Prisma 7 del esquema de la app (../prisma)
├── generated/app/                # cliente de msp_app (no se commitea)
└── src/
    ├── strapi/
    │   ├── client.ts             # createStrapiClient() con @prisma/adapter-mariadb
    │   ├── check.ts              # verificación de solo lectura
    │   └── distinct-values.ts    # valores de las columnas que pasan a enum
    ├── stage/                    # Postgres de staging: conexión de solo lectura, CA, ping
    ├── app/
    │   ├── client.ts             # createAppClient() con @prisma/adapter-pg, fijo a msp_app
    │   ├── connection.ts         # pool (search_path=msp_app) y URL del CLI
    │   └── prisma-cli.ts         # CLI de Prisma por el proxy local
    └── load/                     # ETL Strapi → msp_app
        ├── index.ts              # CLI: validate | run | verify
        ├── extract.ts            # lectura por lotes a snapshot (todas las filas, también borradores)
        ├── snapshot.ts           # NDJSON en etl/.snapshots/ (gitignored)
        ├── validate.ts           # fila publicada, relaciones, únicos, enums, componentes; --allow
        ├── model.ts              # enums, componentes y categorías de incidencia (con su porqué)
        ├── transform/            # funciones puras: snapshot validado → filas de msp_app
        ├── specs.ts              # tablas destino, llaves y columnas (escritura y verificación)
        ├── write.ts              # upsert por llave natural, hijas obsoletas, espejo
        ├── verify.ts             # filas, relaciones desde el snapshot crudo y agregados
        ├── report.ts             # consola, etl/reports/*.json y msp_app.etl_run
        └── load.test.ts          # pruebas (fixtures.ts: snapshot sintético)
```

## El esquema

- Escrito a mano desde el inventario de `docs/manual-del-sistema.md` («Tablas de la base strapi»). Incluye las 52 tablas de negocio; quedan fuera las 35 de sistema de Strapi (`admin_*`, `strapi_*`, `files*`, `upload_folders*`, `i18n_locale`, `up_permissions*`).
- Modelos y campos con el mismo nombre que la tabla/columna (snake_case): `prisma.blocks_cmps.findMany()`.
- Relaciones de Strapi v5: tablas `*_lnk` (FK reales hacia ambos lados) y pivotes `*_cmps` (`entity_id` → dueño; `cmp_id` es polimórfico según `component_type`, sin relación declarada).
- `created_by_id` / `updated_by_id` quedan como enteros sueltos: apuntan a `admin_users`, que está excluida.
- Con draft & publish, un documento publicado tiene dos filas con el mismo `document_id` (una con `published_at` nulo). El ETL debe leer solo las publicadas.

## Uso

```ts
import { createStrapiClient } from "./src/strapi/client"

const strapi = createStrapiClient()
const blocks = await strapi.blocks.findMany({
  where: { published_at: { not: null } },
  include: { project_lnk: { include: { project: true } }, units_lnk: true },
  take: 10,
})
await strapi.$disconnect()
```

## Carga Strapi → msp_app

```bash
npm run load:validate                                  # 1. ver incidencias reales (no escribe)
npm run load:validate -- --snapshot <nombre>           #    repetir sobre el mismo snapshot, sin leer el RDS
npm run load -- --snapshot <nombre> --dry-run          # 2. carga completa y ROLLBACK al final
npm run load -- --snapshot <nombre>                    # 3. carga real
npm run load:verify -- --snapshot <nombre>             #    revisar después, en solo lectura
npm run load -- --sample <docBloque1>,<docBloque2>     # prueba con pocos bloques (siempre --dry-run)
```

Cómo funciona:

1. **Extracción.** Lee las 52 tablas en lotes de 2,000 por cursor de `id`, con pausa entre lotes y pool ≤ 2, y guarda un snapshot en `etl/.snapshots/<fecha>-full|sample/`. La lectura completa del RDS se rechaza entre 7:00 y 19:00 (hora de Guatemala), salvo con `--allow-business-hours`: la decisión es del usuario y la lectura va más lenta (500 ms entre lotes). Con `--snapshot` no se toca el RDS y se puede correr a cualquier hora.
2. **Validación.** Elige la única fila publicada de cada `document_id` y revisa cada relación (`_lnk`) y componente (`_cmps`). Cada incidencia tiene categoría y explicación (`model.ts` → `CATEGORIES`). Si hay alguna fatal, **no se escribe nada** y el reporte dice qué filas y por qué. `--allow cat1,cat2` acepta esas categorías: excluye la fila y, en cascada, lo que depende de ella (país → proyectos → bloques → unidades). Las advertencias (`model.ts` → `WARNING_CATEGORIES`) no bloquean y quedan en el reporte:
   - `unidad-sin-bloque` y `bloque-sin-proyecto`: la relación es obligatoria en el esquema nuevo, así que el hijo se carga en un padre «No definido» que crea el ETL: el proyecto `etl-no-definido` y un bloque `etl-no-definido-<domain>` por tipo de unidad (sin `unitType` → `housing`). Solo se crean si hay huérfanos, y se buscan por su `public_id` para reasignar.
   - `codigo-duplicado`: todas las copias del `code` repetido se cargan con `code` vacío (NULL) para corregirlas después.
   - `tipo-unidad-distinto-al-bloque`, `componente-compartido`.
3. **Transformación.** Funciones puras. Las relaciones se resuelven por `document_id`, que en `msp_app` es `public_id`. Los campos de fórmula se copian tal cual, sin recalcular.
4. **Escritura.** Todo en **una transacción** con candado (`pg_try_advisory_xact_lock`, una carga a la vez). Hace upsert por llave natural, así que los `id` se conservan entre corridas y una fila idéntica no se reescribe. En las tablas hijas se borra lo que ya no está en Strapi. En modo completo, `msp_app` queda como **espejo** de lo publicado: lo que ya no existe en Strapi se borra. En modo muestra no se borra nada fuera de la muestra.
5. **Verificación, antes del COMMIT.** Compara cada tabla columna por columna contra la transformación. Compara cada relación contra los pares sacados directo de las tablas `_lnk`/`_cmps` del snapshot crudo, sin pasar por la validación. Compara unidades y suma de `total_price_usd` por bloque. Si algo no cuadra, ROLLBACK: `msp_app` queda como estaba.
6. **Reporte.** Resumen en consola y `etl/reports/<fecha>-<id>.json` (gitignored), con todas las incidencias y exclusiones. Cada `run` queda en `msp_app.etl_run` por una conexión aparte, incluso si terminó en ROLLBACK (requiere la migración `20261016120000_etl_run`).

Cada corrida es completa: vuelve a leer todo y escribe solo las diferencias. No hay modo incremental por `updated_at`, porque la validación necesita ver el grafo entero para saber si una relación quedó rota.

Snapshots y reportes contienen datos reales (incluidos hashes de contraseñas): nunca se commitean.
