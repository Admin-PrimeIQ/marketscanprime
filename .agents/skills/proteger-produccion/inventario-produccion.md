# Inventario de producción

Todo lo de esta lista es 🔴 **producción**: no se escribe, configura, reinicia ni despliega desde este repo. Fuente: `docs/manual-del-sistema.md` y el código del backoffice.

## Servicios

| Sistema | Dónde | Lo usan | Riesgo si se toca |
|---|---|---|---|
| Strapi 5.30 (CRM) | AWS App Runner; URL en `NEXT_PUBLIC_STRAPI_URL` | Backoffice, n8n, Copilot | Se cae la edición de proyectos, bloques y unidades. |
| MySQL `strapi` | RDS us-east-2 | Strapi (única app con conexión directa) | Pérdida o bloqueo de los datos fuente. |
| n8n | `https://n8n.primeiqlatam.com`, Docker en EC2 (us-east-1) | Backoffice, cron | Se detienen sync, contadores, tipo de cambio y Copilot. |
| Coolify | `coolify.primeiqlatam.com` | Despliega n8n y Redis | Reiniciar = cortar n8n. |
| Redis | Red privada de Docker en el EC2 de Coolify | n8n (colas, candados, progreso) | Corridas de sync trabadas. |
| MySQL `dbo_stage` | Warehouse (staging) | Push de n8n | Datos que luego se promueven a `dbo`. |
| MySQL `dbo` | Warehouse final | **Otros proyectos** y tableros | Rompe sistemas ajenos a Market Scan. |
| Postgres `dbo` | Railway | **Otros proyectos** | Ídem. No confundir con el Postgres nuevo de la app. |
| Supabase | Postgres administrado | Bitácora de sync, `chat_sessions`, memoria del Copilot | Se pierde historial de corridas y conversaciones. |
| S3 `n8n-primeiqlatam` | AWS | Respaldos de cada push, histórico del tipo de cambio | Se pierden respaldos de los que depende la reversa. |
| Vercel (backoffice) | `https://admin.primeiqlatam.com` | Usuarios finales | Caída del backoffice. Solo despliega desde la cuenta `Admin-PrimeIQ`. |

## Workflows de n8n

| Workflow | ID | Disparador |
|---|---|---|
| Sync Writeback API | `ULurOzOGSpgNlRyY` | 7 webhooks `primeiq/sync/*` (header `X-Sync-Key`) |
| Sync Resolve Targets | `bpLA8t0B6vr7Qq7f` | Sub-workflow |
| Sync Drainer | `nnG8jsmOmPkBks7c` | Cron cada 20 s |
| Sync Block Worker (push) | `yBuM3XVk36DwRgbs` | Sub-workflow |
| Sync Pull Block Worker | `t2Sqx3pvDRuhBAdF` | Sub-workflow (borra unidades en Strapi) |
| Block Edit Queue | no exportado | `POST /webhook/block-counter-update` (público) |
| Banguat Exchange Rate | `Vr3vL5F0x9B04wEt` | Cron cada 6 h · `GET primeiq/exchange-rates` |
| Chat Sessions API | no exportado | `primeiq-chat-session-*` (público) |
| Copilot (Orchestrator 2.2) | `xZlg5fXcX82Da7Yo` | Chat Trigger `…/chat` |

## URLs de producción fijas en el código

Son el valor por defecto si falta la variable de entorno; correr la app sin sobreescribirlas apunta a producción.

| Archivo | URL | Variable que la reemplaza |
|---|---|---|
| `components/units/datasheet-units-table.tsx` | `…/webhook/block-counter-update` | `NEXT_PUBLIC_BLOCK_COUNTER_WEBHOOK_URL` |
| `lib/exchange-rates.ts` | `…/webhook/primeiq/exchange-rates` | `EXCHANGE_RATES_WEBHOOK_URL` |
| `lib/copilot/constants.ts` | `…/webhook/<id>/chat` | `NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL`, `N8N_CHAT_WEBHOOK_UPSTREAM_URL` |
| `lib/copilot/primeiq-chat-session-api.ts` | `…/webhook` (sesiones de chat) | — |

## Variables del `.env` local

| Variable | Apunta a | Uso permitido para el agente |
|---|---|---|
| `NEXT_PUBLIC_STRAPI_URL` | Strapi de producción | Ninguno en scripts. |
| `STRAPI_USERNAME` / `STRAPI_PASSWORD` | Administrador de Strapi | **Nunca.** |
| `SYNC_API_URL` / `SYNC_API_KEY` | Writeback API de n8n | **Nunca.** |
| `STRAPI_DATABASE_URL` | MySQL `strapi` (usuario de solo lectura) | Solo `etl/`, con los límites de lectura. |

## Repos relacionados

| Repo | Qué hace | Regla |
|---|---|---|
| `Admin-PrimeIQ/n8n-manager` | JSON de workflows y `scripts/n8n-sync.js` (push/pull/activate contra n8n) | Leer JSON. No correr `push` ni `activate`. |
| `scripts/sync-database` | CLI que escribe en Strapi y en el warehouse MySQL | Solo leer el código. |
| `.migration/` (en este repo) | CLI que recalcula fórmulas y escribe en Strapi | Solo `npm run test:parity`. |
