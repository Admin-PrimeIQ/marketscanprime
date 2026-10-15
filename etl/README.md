# etl — migración Strapi → dbo_stage

Paquete aislado (npm propio, fuera del build de Next.js) que lee la base MySQL de Strapi con Prisma 7 para cargarla después en `dbo_stage`. Contexto completo de la migración: [`docs/migration/README.md`](../docs/migration/README.md).

## Reglas

- La base `strapi` es **solo lectura**: conectarse con un usuario MySQL que solo tenga `SELECT`.
- Nunca correr `prisma migrate`, `prisma db push` ni `prisma migrate reset` contra `strapi`, `dbo_stage` ni `dbo`.
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
| `STRAPI_DATABASE_URL` | `mysql://usuario:clave@host:3306/strapi` — RDS us-east-2, usuario de solo lectura. |

## Scripts

| Script | Qué hace | Conexión |
|---|---|---|
| `strapi:validate` | Valida la sintaxis del esquema. | No |
| `strapi:generate` | Genera el cliente tipado. | No |
| `strapi:pull:print` | Imprime el esquema introspectado de la base real, sin escribir archivos. | Sí |
| `strapi:check` | Conteo y lectura de una fila por modelo, comparados con el inventario del manual; `document_id` repetidos. | Sí |
| `typecheck` | `tsc --noEmit`. | No |

## Estructura

```
etl/
├── prisma.strapi.config.ts       # config Prisma 7 (esquema + URL para db pull)
├── prisma/strapi/schema.prisma   # 52 modelos, nombres idénticos a tablas/columnas
├── generated/strapi/             # cliente generado (no se commitea)
└── src/strapi/
    ├── client.ts                 # createStrapiClient() con @prisma/adapter-mariadb
    └── check.ts                  # verificación de solo lectura
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
