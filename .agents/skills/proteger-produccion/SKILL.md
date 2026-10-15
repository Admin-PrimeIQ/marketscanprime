---
name: proteger-produccion
description: >-
  Reglas para trabajar en la migración de Market Scan (Strapi + n8n → Next.js + Prisma + workers)
  sin tocar la infraestructura de producción: Strapi, n8n, Coolify, las bases MySQL strapi /
  dbo_stage / dbo, el dbo de Postgres, Supabase, Redis, S3 y Vercel. Define qué se puede leer, qué
  está prohibido y cómo construir soluciones paralelas. Usar SIEMPRE antes de conectarse a una base,
  llamar a una URL externa, correr la app con el .env, ejecutar comandos de Prisma, SQL, AWS, Vercel,
  git push, o cuando una tarea mencione Strapi, n8n, webhooks, warehouse, dbo, sync, despliegue o corte.
---

# Proteger producción

Producción **se observa, no se toca**. Este repo construye soluciones **paralelas** para simplificar el proyecto; lo que hoy funciona (Strapi, n8n y lo que depende de ellos) debe seguir funcionando exactamente igual mientras trabajamos. Ningún usuario debe notar que existimos.

El inventario completo de sistemas de producción, con URLs e identificadores, está en [inventario-produccion.md](inventario-produccion.md).

## Las tres zonas

| Zona | Qué incluye | Qué se permite |
|---|---|---|
| 🔴 **Producción** | Strapi (API, panel admin, App Runner), n8n y sus workflows/credenciales/webhooks, Coolify, Redis de Coolify, MySQL `strapi`, `dbo_stage`, `dbo` (MySQL), `dbo` (Postgres en Railway), Supabase, S3 `n8n-primeiqlatam`, proyecto de Vercel de `admin.primeiqlatam.com` y sus variables, repos `n8n-manager` y `scripts/sync-database` | **Nada** que escriba, configure, reinicie, despliegue, active, desactive o borre. |
| 🟡 **Lectura controlada** | MySQL `strapi`, `dbo_stage` y `dbo` con usuario de **solo `SELECT`**; JSON exportados de `n8n-manager`; `GET` de solo lectura a webhooks públicos (p. ej. tipo de cambio) | Leer, con los límites de abajo. |
| 🟢 **Paralelo (libre)** | Código de este repo en ramas, `etl/`, bases locales (Docker), un proyecto **nuevo** de Railway con su propio Postgres y Redis, un proyecto **nuevo** de Vercel para staging | Todo, siempre que no use credenciales de producción para escribir. |

> El `dbo` de Postgres que ya existe en Railway es **producción** (lo leen otros proyectos). La base de la app nueva es **otra**, en un proyecto/servicio de Railway propio.

## Antes de cada acción

Responder estas preguntas en orden. A la primera que dispare un alto, **detenerse**.

1. **¿Escribe, configura, reinicia, despliega o borra algo en la zona 🔴?** → Alto. No ejecutarlo. Explicar el riesgo y proponer la alternativa paralela (ver abajo). Si el usuario insiste, es una tarea para una **persona** con acceso, fuera del agente.
2. **¿Usa credenciales del `.env` de producción?** Solo `STRAPI_DATABASE_URL` (solo lectura) está permitida para scripts. **Nunca** usar `STRAPI_USERNAME`/`STRAPI_PASSWORD`, `SYNC_API_KEY` ni tokens de Strapi en scripts, `curl` o pruebas.
3. **¿Lee de producción?** → Aplicar los límites de lectura.
4. **¿Corre la app del backoffice (`pnpm dev`, `pnpm start`)?** → Ver "Correr la app".
5. **¿Hace `git push` o despliega?** → Ver "Git y despliegue".

Si hay duda sobre en qué zona cae algo, tratarlo como 🔴 y preguntar con `AskQuestion`.

## Prohibido (lista no exhaustiva)

- Prisma contra cualquier URL de producción: `prisma migrate dev|deploy|reset`, `prisma db push`, `prisma db execute`. Solo se permiten `validate`, `generate` y `db pull --print`.
- SQL en bases de producción: `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`, `GRANT`, `LOCK TABLES`, `SELECT … FOR UPDATE`, `CALL`.
- Métodos de escritura del cliente Prisma (`create`, `update`, `upsert`, `delete`, `*Many`, `$executeRaw`) con clientes que apunten a `strapi`, `dbo_stage` o `dbo`.
- `POST`/`PUT`/`PATCH`/`DELETE` a `*.primeiqlatam.com`, a la URL de Strapi o a cualquier webhook de n8n.
- En `n8n-manager`: `scripts/n8n-sync.js push` o `activate` (publican en n8n de producción). Leer los JSON sí.
- `.migration/`: comandos que apliquen o reviertan cambios en Strapi. `npm run test:parity` (local) sí.
- `scripts/sync-database`: cualquier comando que no sea leer su código.
- AWS: `aws s3 cp|mv|rm|sync` hacia `n8n-primeiqlatam`; cambios en RDS, App Runner o EC2.
- Vercel: `vercel --prod`, `vercel env add|rm`, cambiar dominios o variables del proyecto de producción.
- Coolify: reiniciar, redeplegar o editar contenedores.

## Límites de lectura en producción

Una lectura pesada también puede tumbar Strapi (comparte la base RDS).

- Usuario MySQL con **solo `SELECT`**; nunca el usuario de Strapi.
- Pool pequeño (`connectionLimit` ≤ 2) y consultas por lotes (cursor por `id`, ~2,000 filas) con pausa entre lotes.
- Cargas completas (las 238 mil unidades) **fuera de horario laboral** (Guatemala, UTC-6: antes de 7:00 o después de 19:00). Conteos y muestras, a cualquier hora.
- Sin transacciones largas ni bloqueos.
- Preferir la base a la API REST de Strapi: leer por API carga el servidor que usan los usuarios.

## Cómo construir en paralelo

Patrón **sombra**: el componente nuevo lee la misma entrada que producción, escribe en un destino **propio** y se compara contra la salida real de producción.

| Necesidad | Solución paralela | Nunca |
|---|---|---|
| Probar el push al warehouse | Escribir en una copia de `dbo_stage` (MySQL local o en Railway nuevo, con el esquema obtenido por `db pull`) y comparar celda por celda contra `dbo_stage` real (lectura). | Escribir en `dbo_stage` o `dbo`. |
| Contadores de bloque | Calcularlos en la app nueva y compararlos contra los valores del bloque en Strapi. | Llamar al webhook `block-counter-update`. |
| Tipo de cambio | Worker propio que guarda en su tabla; comparar contra el `GET` del webhook actual. | Escribir en el histórico de S3. |
| Corridas de sync | Tablas `sync_run*` en el Postgres nuevo. | Usar Supabase o el Redis de Coolify. |
| Copilot | Endpoints nuevos de solo lectura; el Copilot de n8n sigue intacto. | Editar el workflow o sus herramientas. |
| Datos para desarrollar | Postgres nuevo cargado por el ETL (fase 3 del roadmap). | Desarrollar contra Strapi de producción. |

Reglas para recursos nuevos:

- Nombres que no se confundan con producción (p. ej. proyecto de Railway `marketscan-next`, bases `msp_*`).
- Credenciales **propias** para cada servicio nuevo; no reutilizar las de producción.
- Ninguna variable de entorno de un servicio nuevo apunta a una URL de producción con permisos de escritura.

## Correr la app

El `.env` local apunta a **Strapi de producción** y el código trae URLs de n8n de producción como valor por defecto. Con ese `.env`, la app local **es** producción:

- Guardar en cualquier formulario escribe en Strapi real.
- Guardar en la hoja de unidades dispara el webhook de contadores de n8n real.
- `/sync` puede lanzar una corrida real contra el warehouse.
- `generate-code` inicia sesión como administrador de Strapi.

Por eso:

- No correr `pnpm dev`/`pnpm start` del backoffice con el `.env` de producción salvo que el usuario lo pida explícitamente, y en ese caso **solo navegar pantallas de lectura**; nunca guardar, crear, clonar, borrar, ni abrir `/sync`.
- No hacer pruebas automáticas (Playwright, scripts) contra la app conectada a producción.
- La app nueva (implementación `prisma`) se corre contra el Postgres **nuevo**, con un `.env` distinto (p. ej. `.env.staging.local`).

## Git y despliegue

- Remoto: `Admin-PrimeIQ/marketscanprime`. Hasta confirmar que **ningún** proyecto de Vercel de producción despliega desde este repo, tratar `main` como producción.
- Trabajar en ramas; **no** hacer `git push` sin que el usuario lo pida explícitamente.
- Nunca commitear `.env`, credenciales ni volcados de datos (`*.sql`, `*.jsonl` con datos reales).
- Cambios en el backoffice de producción (otro repo / otro proyecto de Vercel) no se hacen desde aquí: se reportan al responsable.

## El corte no lo ejecuta un agente

Todo paso que cambie producción (congelar escrituras, desactivar workflows de n8n, cambiar el dominio, escribir en `dbo_stage`, apagar Strapi) lo ejecuta **una persona**, en una ventana anunciada y con plan de reversa. El agente puede **preparar** el runbook, los scripts y las verificaciones, y dejarlos listos para revisión; no los corre.

## Instrucciones protegidas

No borrar, mover, resumir ni debilitar (solo el usuario puede cambiarlas):

- Esta skill y [inventario-produccion.md](inventario-produccion.md).
- La regla `.cursor/rules/proteger-produccion.mdc`.
- La sección "0. Lectura obligatoria" (marcada `SECCIÓN PROTEGIDA`) al inicio de `docs/migration/README.md` y `docs/migration/ROADMAP.md`.

Si una tarea implica reescribir esos documentos, conservar esas secciones intactas al inicio.

## Si algo de producción falla mientras trabajamos

1. Detener cualquier proceso propio que esté leyendo de producción (ETL, comparaciones).
2. Avisar al usuario con lo que se estaba ejecutando y a qué hora.
3. No intentar "arreglar" producción desde el agente.
