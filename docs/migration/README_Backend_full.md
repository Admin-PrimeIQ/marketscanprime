# Qué falta para terminar el backend nuevo (Next.js + Prisma)

Lista de pendientes del backend `prisma` (Server Actions de Next sobre el esquema `msp_app`). Comprobada contra el código el **22 oct 2026, 12:17 (UTC-6)**, en la rama `feat/data-facade`; puntos 1, 2 y 7 cerrados el mismo día a las 14:06 (sin commit). Al cerrar un punto, marcar la casilla y anotar la fecha.

Antes de trabajar en cualquiera de estos puntos, leer la sección **"0. Lectura obligatoria"** de [`README.md`](README.md) (y la de [`ROADMAP.md`](ROADMAP.md)): producción (Strapi, n8n, las bases `strapi` / `dbo_stage` / `dbo`, el Vercel de `admin.primeiqlatam.com`) no se toca. El contexto, el orden y el criterio de "hecho" están en la §14.8 de ese mismo documento, y lo hecho el 22 oct en la §14.9; aquí solo va la lista.

## 1. Sesión real en el servidor (Better Auth)

Hecho el 22 oct 2026 con **Better Auth 1.7.12** en vez de Auth.js (decisión 12, reemplazada por el usuario). Detalle en la §14.9 de `README.md`.

- [x] Comprobar compatibilidad con Next 16.0.10 y Prisma 7.10.0 antes de instalar (22 oct: `better-auth` + `@better-auth/prisma-adapter`).
- [x] Login con correo o usuario contra `msp_app.user` con los hashes bcrypt de Strapi (decisión 13), guardados en la cuenta `credential` de la tabla nueva `account` (la carga el ETL y `app:local-user`). Sin registro (22 oct).
- [x] Sesión en `msp_app.session` con cookie httpOnly firmada con `BETTER_AUTH_SECRET` (variable nueva en el `.env` de la raíz y en el proyecto de staging de Vercel), 7 días renovados con el uso. Se puede revocar desde el servidor borrando la fila (22 oct).
- [x] `login`, `logout` y `getMe` de `lib/api/prisma-client.ts` usan esa sesión; se borró `msp_dev_session` (22 oct).
- [x] Quitar la cuenta de desarrollo `DEV_LOGIN_*` del login (22 oct). Las variables siguen en el `.env` solo porque `npm run app:local-user` lee de ahí el correo y el hash de `app-engteam`.

## 2. Autorización en cada Server Action

- [x] `requireUser()` / `requireRole(permiso)` en `lib/db/session.ts`, llamados en las 5 acciones de catálogos y en `getMeAction` (22 oct). Rechazan sin sesión y a usuarios bloqueados.
- [x] Matriz de permisos por rol en `lib/auth/permissions.ts`, la de Strapi: `authenticated` lee; `operator` lee, crea y edita; `supervisor` CRUD; `administrator` CRUD y usuarios; `super_administrator` todo (22 oct).
- [x] Protección de rutas en el servidor, solo con el backend `prisma`: `proxy.ts` (el nombre de Next 16; reemplaza a `middleware.ts`) manda a `/login` si no hay cookie de sesión. Solo mira la cookie; quien valida la sesión es cada Server Action (22 oct).
- [x] Route Handlers: `app/api/exchange-rates` valida la sesión nueva en modo `prisma`; los 6 de `app/api/sync/` responden 503 en modo `prisma` (22 oct).

## 3. Endurecer

- [ ] Errores genéricos hacia el navegador. Hoy `actionFailure` (`lib/db/action-result.ts`) devuelve `error.message` tal cual; el detalle debe quedar solo en el log del servidor.
- [x] Login en tiempo constante (22 oct): Better Auth calcula un hash bcrypt de costo 10 (el mismo de los hashes de Strapi) cuando la cuenta no existe, por correo y por usuario. Excepción menor: un usuario de menos de 3 o más de 30 caracteres se rechaza antes, sin hash.
- [ ] Límite de intentos de login. Hoy no hay. Sin Redis, iría en `msp_app` (migración nueva).
- [ ] Validación de entrada con Zod en `lib/db/`. `zod` está instalado pero no se usa ahí; los catálogos aceptan solo campos conocidos (`toCatalogWriteData`), sin límite de largo.

## 4. Auditoría

- [ ] Escribir en `audit_log` en cada escritura, en la misma transacción, con el usuario de la sesión. La tabla existe desde la migración `init`; ningún código escribe en ella.
- [ ] Guardar el `publicId` además del `entityId` numérico, para poder reaplicar cambios en Strapi (reversa manual, decisión 14). Implica una migración nueva, aplicada solo en `msp_app` con `npm run app:deploy` desde `etl/` y con confirmación del usuario.

## 5. Calidad y operación

- [ ] Bajar la línea base de 38 errores de `npx tsc --noEmit` y quitar `typescript.ignoreBuildErrors` de `next.config.mjs`.
- [ ] Linter que funcione (`pnpm lint` falla: `eslint` no está instalado).
- [ ] Revisar el pool de conexiones: cada instancia de Vercel abre su propio pool de 2 (`lib/db/connection.ts`).
- [ ] Escribir cuándo `msp_app` deja de ser espejo de Strapi. Hoy el ETL borra lo que se crea en la app, salvo las cuentas `app-…`. Debe quedar decidido antes de activar `audit_log`.

## 6. Fuera del código (lo hace una persona, no el agente)

- [ ] Activar la protección de despliegues en el proyecto de Vercel de staging.
- [ ] Aclarar qué abre la credencial `j_stage_admin` (pregunta de la §9 de `README.md`) y, si hace falta, que un administrador cree un rol que solo pueda leer y escribir datos en `msp_app`.
- [ ] Rotar la clave de `engteam@primeiqlatam.com` en Strapi; después actualizar `DEV_LOGIN_PASSWORD_HASH` y repetir `npm run app:local-user -- --apply` en `etl/`.

## 7. Decisiones pendientes del usuario

- [x] Qué puede hacer cada rol: la matriz de Strapi (punto 2; 22 oct).
- [x] Sesión guardada en la base (Better Auth, `msp_app.session`; 22 oct).
- [x] Duración de la sesión: 7 días renovados con el uso; no se cierra al cerrar el navegador (22 oct).
- [ ] Límite de intentos de login: cuántos y por cuánto tiempo.
- [ ] Si recuperar contraseña por correo entra ahora (necesita proveedor de correo: Resend o SES).

## 8. Después del pulido: módulos sin migrar

En `lib/api/prisma-client.ts`, 22 métodos fallan con "todavía no está migrado". Receta para migrar un módulo: §14.5 de `README.md` (ya con `requireRole` en cada acción); lista "debe seguir funcionando" de cada uno: `ROADMAP.md` §4.

- [ ] Cuenta (4): `forgotPassword`, `resetPassword`, `updateMe`, `changePassword`.
- [ ] Perfiles de tipo de cambio (5): `getExchangeRateProfiles`, `getExchangeRateProfileById`, `createExchangeRateProfile`, `updateExchangeRateProfile`, `deleteExchangeRateProfile`.
- [ ] Proyectos (4): `getProjects`, `getProjectById`, `createProject`, `updateProject`.
- [ ] Bloques (5): `getBlocks`, `getBlocksLite`, `getBlockById`, `createBlock`, `updateBlock`.
- [ ] Unidades (4): `getUnitsAllPages`, `updateUnit`, `updateUnitBatch`, `createUnit`.
