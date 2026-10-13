# units-migration-cli

CLI ESM autocontenido (oclif) para **migrar a la base de datos los campos derivados (fórmula) de las unidades**, bloque por bloque, de forma segura y reversible.

Vive aislado en `.migration/`, con su propio `package.json` y `node_modules` (gitignored). **No** importa nada del front/back del proyecto: **replica** (copia verbatim) las funciones de fórmula puras de `components/units/datasheet-units-table.tsx`. Esa copia está protegida por un test de paridad (`src/formulas.parity.test.mjs`): si la fuente y la réplica divergen, el test falla.

El objetivo de la migración es dejar persistido en Strapi exactamente lo que el admin recalcularía al abrir cada bloque, de modo que la grilla muestre **cero amarillo** (sin valores pendientes de reconciliación).

---

## 1. Setup

```bash
cd .migration && npm install
```

Luego copiá el ejemplo de entorno y completalo:

```bash
cp .env.example .env
```

Editá `.migration/.env`:

- **`STRAPI_URL`** (obligatorio) — host de Strapi destino, sin barra final. Apuntá a **staging** para el ensayo y a **producción** para la corrida real.
- **Autenticación** (una de las dos opciones):
  - **`STRAPI_API_TOKEN`** — *opción A, recomendada*. Token de API con permiso read+update sobre Unit (ver más abajo).
  - **`STRAPI_USERNAME` + `STRAPI_PASSWORD`** — *opción B, fallback*. Credenciales de un admin; se usa `/admin/login` + `/content-manager`.
- **`PUT_CONCURRENCY`** (opcional, default `8`) — cantidad de PUTs simultáneos por bloque. También se puede pasar por flag `--concurrency`.

Si falta `STRAPI_URL` o las credenciales, los comandos que tocan Strapi (`dry-run`, `run`, `rollback`) salen con un error claro que te recuerda copiar `.env.example` → `.env`. `status` no requiere credenciales (sólo lee artefactos locales).

---

## 2. Autenticación

### Opción A — API token (recomendada)

En el admin de Strapi:

1. **Settings → API Tokens → Create new API Token**.
2. **Token type: `Custom`**.
3. En **Permissions**, habilitá sobre las colecciones afectadas:
   - **Unit**: `find`, `findOne` y **`update`** (read + update).
   - **Block**: `find`, `findOne` (read) — necesario para listar bloques.
4. Guardá y copiá el token (sólo se muestra una vez) en `STRAPI_API_TOKEN`.

En este modo el CLI usa los endpoints REST públicos: `GET /api/blocks`, `GET /api/units`, `PUT /api/units/:documentId`.

### Opción B — admin fallback

Si no podés generar un token, dejá `STRAPI_API_TOKEN` vacío y completá `STRAPI_USERNAME` + `STRAPI_PASSWORD` con un usuario admin. El CLI hace `POST /admin/login`, cachea el JWT (re-login automático una vez ante un 401) y usa los endpoints de `/content-manager`. El resultado es equivalente.

> El CLI elige el modo automáticamente: si `STRAPI_API_TOKEN` está presente usa REST; si no, usa admin login.

---

## 3. Comandos

Invocá los comandos con `node ./bin/run.js <comando> [flags]` (o `npm run migrate -- <comando>`). Sin ningún argumento, `node ./bin/run.js` abre un **menú interactivo** (Dry-run / Migrar / Rollback / Estado).

### `dry-run` — recalcula y muestra el diff, **sin escribir nada**

```bash
node ./bin/run.js dry-run [--block <id>] [--from-block <N>] [--limit <N>]
```

| Flag | Descripción |
|------|-------------|
| `--block <id>` | Procesar sólo el bloque con ese `documentId`. |
| `--from-block <N>` | Saltar los primeros N bloques. |
| `--limit <N>` | Procesar como máximo N bloques. |

Genera todos los artefactos (`original`/`corrected`/`diff` por bloque) y un `manifest.json`, más un resumen final con el conteo de cambios por campo. **Nunca** escribe en Strapi.

### `run` — migración real, bloque a bloque

```bash
node ./bin/run.js run [--block <id>] [--from-block <N>] [--resume <ts>] [--concurrency <N>] [--yes]
```

| Flag | Descripción |
|------|-------------|
| `--block <id>` | Procesar sólo el bloque con ese `documentId`. |
| `--from-block <N>` | Saltar los primeros N bloques. |
| `--resume <ts>` | Reanudar la corrida con ese timestamp (reusa su `progress.json` y saltea los bloques ya hechos). |
| `--concurrency <N>` | Concurrencia de PUTs por bloque (default `PUT_CONCURRENCY` / `8`). |
| `--yes` | No preguntar: "sí a todo", no interactivo (la compuerta avanza sola). |

Cada bloque pasa por cinco fases con compuerta (ver §6). Tras cada bloque OK se persiste el checkpoint (`progress.json`) **antes** de pasar al siguiente, por lo que la corrida es reanudable.

### `rollback` — restaura los valores originales

```bash
node ./bin/run.js rollback --run <ts> [--block <id> | --all] [--yes]
```

| Flag | Descripción |
|------|-------------|
| `--run <ts>` | Timestamp de la corrida a revertir (si se omite, lo pregunta). |
| `--block <id>` | Revertir sólo ese bloque. |
| `--all` | Revertir todos los bloques de la corrida. |
| `--yes` | No preguntar: "sí a todo". |

Ver §5.

### `status` — progreso de una corrida

```bash
node ./bin/run.js status [--run <ts>]
```

| Flag | Descripción |
|------|-------------|
| `--run <ts>` | Timestamp de la corrida a inspeccionar (si se omite, lo pregunta). |

Lee `manifest.json` + `progress.json` y muestra bloques hechos, unidades procesadas/cambiadas/escritas/fallidas, y la lista de bloques con PUTs fallidos (escaneando los `put-results.jsonl`). No requiere credenciales.

---

## 4. Workflow seguro (orden recomendado)

1. **Verificá la paridad de fórmulas.** Asegura que la réplica del CLI coincide con la fuente del admin:
   ```bash
   npm run test:parity     # → "parity OK"
   ```

2. **Dimensioná el cambio con un dry-run.** Primero en un bloque, después completo:
   ```bash
   node ./bin/run.js dry-run --block <id>   # un bloque
   node ./bin/run.js dry-run                # todos los bloques
   ```
   Revisá el resumen de "cambios por campo" para entender la magnitud de la migración. **No escribe nada.**

3. **Migrá UN solo bloque** y verificá en el admin:
   ```bash
   node ./bin/run.js run --block <id>
   ```
   Abrí ese bloque en el admin y confirmá **cero amarillo** (ningún valor marcado como pendiente). Esto valida de punta a punta que lo persistido coincide con lo que el admin recalcula.

4. **Corrida completa, en ventana de congelamiento.** Coordiná una ventana **sin ediciones concurrentes de usuarios** (para que el rollback sea consistente) y corré:
   ```bash
   node ./bin/run.js run
   ```
   Revisá el diff del **bloque 1** con la compuerta y, si está bien, respondé **"sí a todo"** (`a`) para que el resto avance sin pausas.

5. **Confirmá y reanudá si hace falta.**
   ```bash
   node ./bin/run.js status
   ```
   Si la corrida se interrumpió (compuerta = No, corte de red, etc.), reanudá con el timestamp de la corrida:
   ```bash
   node ./bin/run.js run --resume <ts>
   ```
   Los bloques ya hechos se saltean; sólo se procesan los pendientes.

> **Idempotencia:** una segunda corrida sobre los mismos bloques recalcula las fórmulas, encuentra que ya coinciden con la DB (diff vacío) y **no escribe nada**.

---

## 5. Rollback

```bash
node ./bin/run.js rollback --run <ts> [--block <id> | --all]
```

El rollback **re-sube los valores originales**. Por cada bloque objetivo lee dos artefactos de la corrida:

- `original.jsonl` — el **respaldo / fuente de verdad** del estado previo a la migración (snapshot crudo de cada unidad, tomado *antes* de aplicar fórmulas).
- `diff.jsonl` — qué unidades y qué campos cambiaron.

Para cada unidad con entrada en el diff, construye un `dataObj` con los valores **originales** de exactamente los campos que la migración tocó (intersectados con los campos persistidos) y hace `PUT`. Así revierte la migración campo por campo, sin tocar nada que no haya cambiado. Los resultados quedan en `rollback-results.jsonl` y `rollback.log` dentro del directorio de la corrida.

Como `original.jsonl` es el respaldo, **no borres el directorio `runs/<ts>/`** hasta estar seguro de que no vas a necesitar revertir.

---

## 6. Compuerta (gate): sí / no / sí-a-todo

En modo interactivo, cada fase termina preguntando `¿continuar?` con tres opciones de tecla única:

- **`s` — Sí (avanzar):** continúa a la siguiente fase / bloque.
- **`n` — No (interrumpir):** aborta la corrida de forma limpia. El checkpoint queda intacto; reanudás con `run --resume <ts>`.
- **`a` — Sí a todo (no preguntar más):** continúa y **deja de preguntar** por el resto de la corrida (útil tras revisar el primer bloque). Equivale a `--yes`.

Las cinco fases por bloque son: **Traer → Alinear → Fórmulas → Diff → Escribir (PUT)**. En `dry-run` la compuerta avanza sola (nunca escribe).

---

## 7. Artefactos

Cada corrida vive en `runs/<ts>/` (gitignored). Estructura:

```
runs/<ts>/
├── run.log            # log humano (mismas líneas que la consola)
├── run.ndjson         # log estructurado NDJSON (pino)
├── manifest.json      # totales y por-bloque (units, changed, written, failed)
├── progress.json      # checkpoint: lista de blockIds ya completados (para --resume)
└── blocks/<blockId>/
    ├── original.jsonl     # snapshot CRUDO de cada unidad ANTES de fórmulas (respaldo + fuente de rollback)
    ├── corrected.jsonl    # cada unidad DESPUÉS de recalcular fórmulas
    ├── diff.jsonl         # por unidad cambiada: { documentId, unitNumber, changes:[{field, before, after}] }
    └── put-results.jsonl  # resultado de cada PUT: { documentId, status, ok, ms, error }
```

(En un rollback se agregan `rollback-results.jsonl` y `rollback.log` a `runs/<ts>/`.)

Sólo se escriben en Strapi los **campos que efectivamente cambian** (no la unidad completa), tomados del diff. Campos de entrada que las fórmulas no tocan (p. ej. `totalPriceUSD`, `unitNumber`) nunca se envían.
