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

- [x] Errores genéricos hacia el navegador (28 oct, `25871a7`): `actionFailure` (`lib/db/action-result.ts`) solo deja pasar el mensaje de un `PublicError` (sesión, permiso, `CatalogError`); el resto queda en el log del servidor. Si no hay conexiones libres, "La base de datos está ocupada…". Ver `README.md` §14.12.
- [x] Login en tiempo constante (22 oct): Better Auth calcula un hash bcrypt de costo 10 (el mismo de los hashes de Strapi) cuando la cuenta no existe, por correo y por usuario. Excepción menor: un usuario de menos de 3 o más de 30 caracteres se rechaza antes, sin hash.
- [x] Límite de intentos de login (28 oct, v1.31.0, sin commit): 5 por cuenta y 20 por IP en 15 minutos, bloqueo de 15 minutos, contadores en la tabla nueva `msp_app.login_attempt` (`lib/auth/login-throttle.ts`, `lib/db/login-throttle.ts`). Migración `20261028153000_login_attempt` aplicada el 28 oct y prueba de punta a punta contra `msp_app` 13/13. Falta probarlo en el navegador. Ver `README.md` §14.13.
- [x] Validación de entrada con Zod en `lib/db/` (28 oct, v1.31.0, sin commit): `auth-schemas.ts` (login) y `catalog-schemas.ts` (endpoint, id, parámetros y cuerpo, con largos máximos); `input.ts` arma los detalles en español.

## 4. Auditoría

- [x] Escribir en `audit_log` en cada escritura, en la misma transacción, con el usuario de la sesión (28 oct, v1.32.0, sin commit): catálogos, con `writeAudit` de `lib/db/audit.ts`. Decidido hacerlo con `msp_app` todavía como espejo (decisión 17). Prueba de punta a punta contra `msp_app` 15/15; falta el navegador. Ver `README.md` §14.14.
- [x] Guardar el `publicId` además del `entityId` numérico, para poder reaplicar cambios en Strapi (reversa manual, decisión 14) (28 oct, v1.32.0). Migración `20261028170000_audit_log_public_id` aplicada el 28 oct.

## 5. Calidad y operación

- [ ] Bajar la línea base de 38 errores de `npx tsc --noEmit` y quitar `typescript.ignoreBuildErrors` de `next.config.mjs`.
- [ ] Linter que funcione (`pnpm lint` falla: `eslint` no está instalado).
- [ ] Revisar el pool de conexiones: cada instancia de Vercel abre su propio pool de 2 (`lib/db/connection.ts`). *En la app, hecho el 28 oct (`25871a7`):* las conexiones inactivas se cierran a los 5 s y `attachDatabasePool` (`@vercel/functions`) las suelta antes de congelar la función. **Falta** (una persona): liberar el rol saturado en Railway, desplegar el staging y decidir `idle_session_timeout` / rol propio. Ver `README.md` §14.12.
- [ ] Escribir cuándo `msp_app` deja de ser espejo de Strapi. Hoy el ETL borra lo que se crea en la app, salvo las cuentas `app-…`. *El 28 oct el usuario decidió activar `audit_log` antes de esto (decisión 17); el corte sigue sin fecha y debe quedar decidido, con los respaldos (decisión 16), antes de que la app se use en serio.*

## 6. Fuera del código (lo hace una persona, no el agente)

- [ ] Activar la protección de despliegues en el proyecto de Vercel de staging.
- [ ] Aclarar qué abre la credencial `j_stage_admin` (pregunta de la §9 de `README.md`) y, si hace falta, que un administrador cree un rol que solo pueda leer y escribir datos en `msp_app`.
- [ ] Rotar la clave de `engteam@primeiqlatam.com` en Strapi. Ya no afecta a la app nueva: desde el 22 oct, 14:26, `app-engteam` tiene clave propia.

## 7. Decisiones pendientes del usuario

- [x] Qué puede hacer cada rol: la matriz de Strapi (punto 2; 22 oct).
- [x] Sesión guardada en la base (Better Auth, `msp_app.session`; 22 oct).
- [x] Duración de la sesión: 7 días renovados con el uso; no se cierra al cerrar el navegador (22 oct).
- [x] Límite de intentos de login: 5 por cuenta y 20 por IP en 15 minutos, bloqueo de 15 minutos, guardado en `msp_app` (valores del plan del 28 oct, aceptados por el usuario).
- [ ] Si recuperar contraseña por correo entra ahora (necesita proveedor de correo: Resend o SES).

## 8. Después del pulido: módulos sin migrar

En `lib/api/prisma-client.ts`, 16 métodos fallan con "todavía no está migrado" (eran 22 hasta la v1.33.0). Receta para migrar un módulo: §14.5 de `README.md` (ya con `requireRole` en cada acción); lista "debe seguir funcionando" de cada uno: `ROADMAP.md` §4.

- [ ] Cuenta (4): `forgotPassword`, `resetPassword`, `updateMe`, `changePassword`.
- [x] Perfiles de tipo de cambio (5): `getExchangeRateProfiles`, `getExchangeRateProfileById`, `createExchangeRateProfile`, `updateExchangeRateProfile`, `deleteExchangeRateProfile` (28 oct, v1.33.0, sin commit; prueba de punta a punta 8/8; falta el navegador). Ver `README.md` §14.16.
- [ ] Proyectos (4): `getProjects`, `getProjectById`, `createProject`, `updateProject`. *`getProjects` hecho el 28 oct (v1.33.0) con búsqueda, orden, paginación y filtros rápidos; los filtros avanzados y el de fase responden con un error claro.*
- [ ] Bloques (5): `getBlocks`, `getBlocksLite`, `getBlockById`, `createBlock`, `updateBlock`.
- [ ] Unidades (4): `getUnitsAllPages`, `updateUnit`, `updateUnitBatch`, `createUnit`.
