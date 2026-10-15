# etl — migración Strapi → dbo_stage

Paquete aislado (npm propio, fuera del build de Next.js) que lee la base MySQL de Strapi con Prisma 7 para cargarla después en `dbo_stage`. Contexto completo de la migración: [`docs/migration/README.md`](../docs/migration/README.md).

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
    └── app/
        ├── client.ts             # createAppClient() con @prisma/adapter-pg, fijo a msp_app
        ├── connection.ts         # pool (search_path=msp_app) y URL del CLI
        └── prisma-cli.ts         # CLI de Prisma por el proxy local
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
