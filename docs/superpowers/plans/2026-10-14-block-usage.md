# Uso del bloque (`blockUsage`: Venta / Renta) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El bloque tiene un uso propio (`Venta` / `Renta`) en Strapi, se edita y se ve en el administrador, se lee desde MySQL y se escribe de vuelta, y un workflow manual de n8n importa de una vez el `uso` de los universos sin traer nada más.

**Architecture:** Un enum `blockUsage` en `block`, con el mismo recorrido que ya tiene `market`: enum en Strapi → `Select` en el formulario → `parseUsage` en el pull → columna `uso` en el writeback. Los valores se guardan en español, tal como están en MySQL, así que no hay traducción en ningún sentido. El llenado inicial es un módulo puro (`planUsageImport`) inyectado en un workflow manual de n8n, con el mismo patrón que `[Prime IQ] Sync Repair Names`.

**Tech Stack:** Strapi v5 (schema JSON + config-sync), Node ESM + `node:test` (`sync-database`), n8n (templates + `npm run n8n:build`), Next.js 15 / React 19 / next-intl (admin).

**Spec:** la conversación del 2026-10-14. Decisiones acordadas:
- Enum fijo, no relación a catálogo.
- El uso del bloque NO entra en fórmulas ni IVA: la tabla de unidades y `.migration` no cambian.
- No hay `cod_proyecto` repetido entre las tres tablas de universo.
- No hay webhook de Strapi al actualizar un bloque.

## Repos involucrados

| Repo | Ruta | Despliegue |
|---|---|---|
| Strapi | `/Users/kikerios/Projects/primeiq/strapi/backend` | push a `main` → App Runner |
| sync-database | `/Users/kikerios/Projects/primeiq/scripts/sync-database` | CLI local + workflows generados en `../../n8n-manager/` |
| n8n-manager | `/Users/kikerios/Projects/primeiq/n8n-manager` | `node scripts/n8n-sync.js push` |
| Admin | `/Users/kikerios/Projects/primeiq/vercel-apps/admin` | push a `main` con la cuenta `Admin-PrimeIQ` → Vercel |

## Global Constraints

- Nombre del campo: `blockUsage`. Valores exactos: `"Venta"`, `"Renta"`. Opcional, sin default.
- Un `uso` de MySQL que no sea venta o renta (sin importar mayúsculas ni espacios) se trata como **sin dato** (`null`). Nunca se inventa.
- **Sin dato nunca borra.** El pull no manda `blockUsage` si el `uso` no es válido. El writeback no nombra `uso` en el SET si el bloque no tiene `blockUsage`. El import no pisa un uso ya capturado (`soloVacios: true`).
- El emparejamiento MySQL ↔ Strapi es `dominio/cod_proyecto` ↔ `domain/legacyId`. Un `domain` vacío cuenta como `housing`, que es el default de Strapi.
- Los comentarios del código van en español, como el resto de los tres repos.
- Admin: actualizar `messages/es.json` y `messages/en.json` juntos. Subir `package.json` a `1.28.0` y agregar la entrada al `CHANGELOG.md`.
- Los JSON de `n8n-manager/` son artefactos: se generan con `npm run n8n:build` y no se editan a mano.

## Review Focus

1. **`uso` con otra forma** (`"venta "`, `"RENTA"`, `""`, `null`, un número): se normaliza o queda `null`. Test en Task 2 (`parseUsage`).
2. **Uso capturado a mano distinto al de MySQL**: el import no lo pisa y el pull no lo borra con un `uso` inválido. Tests en Task 2 (pull) y Task 4 (`planUsageImport`).
3. **Bloque sin `blockUsage` en el writeback**: no aparece `uso` en el SET ni un cambio falso en el diff de vivienda. Tests en Task 3.
4. **Bloque nacido en el admin** (sin `legacyId`) o con `domain` vacío: el import lo cuenta como `sinLegacyId` o lo empareja como `housing`. Tests en Task 4.
5. **INSERT de un bloque nuevo en cualquier dominio** (vivienda, oficinas, industrial): usa `blockUsage` si existe y "Venta" si no; la columna es NOT NULL en oficinas. Tests en Task 3.

---

### Task 1: Strapi — campo `blockUsage`

**Files:**
- Modify: `strapi/backend/src/api/block/content-types/block/schema.json` (después de `market`, ~línea 93)
- Modify (exportado, no a mano): `strapi/backend/config/sync/core-store.plugin_content_manager_configuration_content_types##api##block.block.json`
- Modify (regenerado): `strapi/backend/src/extensions/documentation/documentation/1.0.2/full_documentation.json`

**Interfaces:**
- Produces: `block.blockUsage: "Venta" | "Renta" | null` en REST (`GET /api/blocks` lo devuelve sin `fields[]` ni `populate`, como todo escalar).

- [ ] **Step 1: Agregar el atributo al schema**, justo después de `market`:

```json
    "blockUsage": {
      "type": "enumeration",
      "required": false,
      "enum": [
        "Venta",
        "Renta"
      ]
    },
```

- [ ] **Step 2: Levantar Strapi local y acomodar la vista.** Correr `npm run develop`. En Content-Type Builder → Block → Configure the view:
  - Edición: poner `blockUsage` en la fila de `blockStatus` (hoy `blockStatus` ocupa 12; dejar `blockStatus` 6 + `blockUsage` 6).
  - Metadata: label `Usage`, description `Cómo se comercializa el bloque: Venta o Renta. Se sincroniza con la columna uso del universo.`, placeholder `Select: Venta or Renta`.
  - Lista: agregar `blockUsage` después de `market`.

  Exportar con config-sync desde la UI (Settings → Config Sync → Export), como en el commit f311918. No escribir el JSON a mano.

- [ ] **Step 3: Verificar el export.** Correr `git diff config/sync/` y confirmar que el único cambio es `blockUsage` (metadata, una fila de edición y la columna de lista). La documentación se regenera sola al levantar (`autoGenerate`); confirmar con `git diff --stat src/extensions/documentation/` que cambió `full_documentation.json`.

- [ ] **Step 4: Probar la API.** Con un token local:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:1337/api/blocks?pagination[pageSize]=1" | jq '.data[0].blockUsage'
# Esperado: null
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"data":{"blockUsage":"Renta"}}' "http://localhost:1337/api/blocks/<documentId>" | jq '.data.blockUsage'
# Esperado: "Renta"
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"data":{"blockUsage":"Alquiler"}}' "http://localhost:1337/api/blocks/<documentId>" | jq '.error.status'
# Esperado: 400
```

- [ ] **Step 5: Commit.**

```bash
git add src/api/block/content-types/block/schema.json config/sync/ src/extensions/documentation/
git commit -m "feat(block): campo blockUsage (Venta/Renta), el uso del universo"
```

Desplegar (push a `main`) **antes** de las Tasks 4 y 5: las dos escriben el campo en producción.

---

### Task 2: sync-database — leer `uso` desde MySQL (pull y prep)

**Files:**
- Modify: `scripts/strapi-prep/lib/universe-parse.js` (junto a `parseMarket`, línea 62)
- Create: `scripts/strapi-prep/lib/universe-parse.test.js`
- Modify: `scripts/sync/pull/lib/pull-block.js` (`buildBlockPayload`, ~línea 83)
- Modify: `scripts/sync/pull/lib/office-universe-payload.js` (`buildOfficeBlockPayload`, ~línea 138)
- Modify: `scripts/sync/pull/lib/industrial-universe-payload.js` (`buildIndustrialBlockPayload`, ~línea 116, y el comentario «TAMPOCO: `uso`…»)
- Modify: `scripts/strapi-prep/build-bundle.js` (payload del bloque, ~línea 154)
- Test: `scripts/sync/pull/lib/pull-block.test.js`, `office-universe-payload.test.js`, `industrial-universe-payload.test.js`

**Interfaces:**
- Produces: `parseUsage(uso: unknown): "Venta" | "Renta" | null`, exportada desde `scripts/strapi-prep/lib/universe-parse.js`. La usa también la Task 4.

- [ ] **Step 1: Test de `parseUsage`.** Crear `scripts/strapi-prep/lib/universe-parse.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUsage } from "./universe-parse.js";

test("parseUsage: los dos valores reales, con cualquier forma", () => {
  assert.equal(parseUsage("Venta"), "Venta");
  assert.equal(parseUsage("Renta"), "Renta");
  assert.equal(parseUsage(" venta "), "Venta");
  assert.equal(parseUsage("RENTA"), "Renta");
});

test("parseUsage: lo que no es venta ni renta es «sin dato», no un default", () => {
  // Hay filas corridas en el warehouse con un número en `uso`. Inventar
  // "Venta" ahí escribiría un dato que nadie capturó.
  for (const v of [null, undefined, "", "  ", "24531.85286", "Alquiler", 0]) {
    assert.equal(parseUsage(v), null, `«${v}» debe quedar sin dato`);
  }
});
```

Agregar el archivo al script `prep:test`. Ya lo cubre: es `scripts/strapi-prep/lib/*.test.js`.

- [ ] **Step 2: Correr y ver que falla.** `npm run prep:test`. Esperado: FAIL, `parseUsage` no está exportada.

- [ ] **Step 3: Implementar**, debajo de `parseMarket` en `universe-parse.js`:

```js
/**
 * `uso` del universo → `blockUsage` de Strapi. Los valores se guardan tal como
 * están en el warehouse ("Venta" / "Renta"), así que no hay traducción de ida
 * ni de vuelta. Cualquier otra cosa es «sin dato»: no hay default, porque un
 * uso inventado viajaría de vuelta a MySQL en el próximo writeback.
 */
export function parseUsage(uso) {
  if (uso == null) return null;
  const u = String(uso).toLowerCase().trim();
  if (u === "venta") return "Venta";
  if (u === "renta") return "Renta";
  return null;
}
```

- [ ] **Step 4: Correr.** `npm run prep:test`. Esperado: PASS.

- [ ] **Step 5: Tests del pull.** Agregar al final de `scripts/sync/pull/lib/pull-block.test.js`:

```js
test("el uso del universo llega al bloque", () => {
  assert.equal(buildBlockPayload(fila({ uso: "Renta" }), "p").blockUsage, "Renta");
});

test("un uso inválido o vacío NO viaja: no borra el capturado en el admin", () => {
  // Un PUT sólo pisa lo que nombra. Mandar `blockUsage: null` borraría un uso
  // que alguien capturó a mano porque el warehouse no lo tenía.
  for (const uso of [null, "", "24531.85286"]) {
    assert.ok(!("blockUsage" in buildBlockPayload(fila({ uso }), "p")), `«${uso}» no debe ir en el payload`);
  }
});
```

En `office-universe-payload.test.js` y en `industrial-universe-payload.test.js`, con su `fila` y su builder (`buildOfficeBlockPayload` / `buildIndustrialBlockPayload`):

```js
test("el uso del universo llega al bloque, y sin dato no viaja", () => {
  assert.equal(buildOfficeBlockPayload(fila({ uso: "Renta" }), "p").blockUsage, "Renta");
  assert.ok(!("blockUsage" in buildOfficeBlockPayload(fila({ uso: "" }), "p")));
});
```

En el de industrial, reemplazar `buildOfficeBlockPayload` por `buildIndustrialBlockPayload` y agregarlo a su import si hace falta.

- [ ] **Step 6: Correr y ver que fallan.** `npm run pull:test`. Esperado: FAIL en los tres archivos (`blockUsage` undefined).

- [ ] **Step 7: Implementar en los tres builders.** En cada uno, agregar `parseUsage` al import de `universe-parse.js` (en `office-universe-payload.js` e `industrial-universe-payload.js`, agregar el import si no está). Insertar justo antes del `return data;`:

```js
  // Sólo si hay dato: un PUT con `blockUsage: null` borraría el uso capturado
  // en el admin cuando el warehouse no lo tiene. Ver `parseUsage`.
  const uso = parseUsage(row.uso);
  if (uso) data.blockUsage = uso;
```

En `industrial-universe-payload.js`, sacar `uso` del comentario «TAMPOCO: …» (queda `compartido_exclusivo` y `cod_temporal`).

- [ ] **Step 8: Prep (migración inicial).** En `scripts/strapi-prep/build-bundle.js`, importar `parseUsage` desde `./lib/universe-parse.js` y agregar al objeto del bloque, después de `market,`:

```js
    // `universe-group` ya trae el `uso` crudo como `blockUsage`.
    blockUsage: parseUsage(block.blockUsage),
```

Acá sí puede ir `null`: el prep crea bloques nuevos, no hay nada que preservar.

- [ ] **Step 9: Correr todo y regenerar los workflows.**

```bash
npm run prep:test && npm run pull:test && npm run n8n:test && npm run n8n:pull-worker-harness
npm run n8n:build
```

Esperado: todo PASS. `n8n:build` reescribe `[Prime IQ] Sync Pull Block Worker.json` y `[Prime IQ] Sync Resolve Targets.json` en `n8n-manager/` porque `MAPPERS` inyecta estos módulos.

- [ ] **Step 10: Commit.** En sync-database:

```bash
git add scripts/strapi-prep/lib/universe-parse.js scripts/strapi-prep/lib/universe-parse.test.js \
  scripts/sync/pull/lib/ scripts/strapi-prep/build-bundle.js
git commit -m "feat(pull): el uso del universo llega al bloque como blockUsage"
```

En n8n-manager: `git add . && git commit -m "build: workflows del pull con blockUsage"`.

---

### Task 3: sync-database — escribir `uso` de vuelta a MySQL (writeback)

**Files:**
- Modify: `scripts/sync/writeback/lib/writeback-field-mapper.js` (`mapBlockToUniverse` ~línea 147, y su comentario de la línea 145)
- Modify: `scripts/sync/writeback/lib/writeback-diff.js` (`UNIVERSE_FIELDS` ~línea 9, el loop ~línea 100, el comentario de la línea 6)
- Modify: `scripts/sync/writeback/lib/office-writeback-mapper.js` (`mapOfficeBlockToUniverse`, `buildOfficeUniverseInsertRow`, comentarios de las líneas 41-60)
- Modify: `scripts/sync/writeback/lib/industrial-writeback-mapper.js` (`mapIndustrialBlockToUniverse`, `buildIndustrialUniverseInsertRow`, comentarios de las líneas 26 y 130)
- Modify: `scripts/n8n/block-worker-harness.test.js:1154` (solo el comentario)
- Test: `writeback-field-mapper.test.js`, `writeback-diff.test.js`, `office-writeback-mapper.test.js`, `industrial-writeback-mapper.test.js`

**Interfaces:**
- Consumes: `block.blockUsage` de Strapi (Task 1). Los fetch ya lo traen: `writeback-strapi-fetch.js` y el `Fetch block` del Block Worker no limitan los campos raíz.
- Produces: la columna `uso` en el SET solo cuando `blockUsage` tiene valor.

- [ ] **Step 1: Tests de vivienda.** En `writeback-field-mapper.test.js`, usando el fixture de bloque del archivo (reemplazar `bloque()` por el nombre local si es otro):

```js
test("uso: va en el SET sólo si el bloque lo tiene", () => {
  assert.equal(mapBlockToUniverse({ ...bloque(), blockUsage: "Renta" }).uso, "Renta");
  // Sin dato, la columna no se nombra: el UPDATE conserva lo del warehouse.
  assert.ok(!("uso" in mapBlockToUniverse({ ...bloque(), blockUsage: null })));
  assert.ok(!("uso" in mapBlockToUniverse(bloque())));
});
```

En `writeback-diff.test.js`, con los helpers del archivo para armar `strapiData` y `mysqlSnapshot`:

```js
test("uso: se compara cuando el bloque lo tiene, y sin dato no es un cambio", () => {
  const conUso = computeWritebackDiff(
    strapiDataCon({ ...bloque(), blockUsage: "Renta" }),
    snapshotCon({ uso: "Venta" }),
  );
  assert.deepEqual(conUso.blockDiffs[0].universeChanges.uso, { from: "Venta", to: "Renta" });

  const sinUso = computeWritebackDiff(strapiDataCon(bloque()), snapshotCon({ uso: "Venta" }));
  assert.ok(!("uso" in sinUso.blockDiffs[0].universeChanges), "sin dato no es un cambio");
});
```

Si el archivo no tiene `strapiDataCon` / `snapshotCon`, crearlos arriba del test:

```js
const strapiDataCon = (block) => ({ entries: [{ block: { legacyId: "C1", ...block }, units: [] }] });
const snapshotCon = (fila) => ({ universe: [{ cod_proyecto: "C1", ...fila }], units: [] });
```

- [ ] **Step 2: Tests de oficinas e industrial.** En `office-writeback-mapper.test.js`:
  - En el test «el UPDATE no nombra las columnas sin origen en Strapi», sacar `"uso"` de la lista y cambiar el comentario: `uso` ahora tiene origen (`blockUsage`).
  - Agregar:

```js
test("uso: el SET lo lleva sólo con dato; el INSERT usa el del bloque o Venta", () => {
  assert.equal(mapOfficeBlockToUniverse({ ...bloque(), blockUsage: "Renta" }).uso, "Renta");
  assert.ok(!("uso" in mapOfficeBlockToUniverse(bloque())), "office_universe.uso es NOT NULL: sin dato no se nombra");
  assert.equal(buildOfficeUniverseInsertRow({ ...bloque(), blockUsage: "Renta" }, "OFF-TEST").uso, "Renta");
  assert.equal(buildOfficeUniverseInsertRow(bloque(), "OFF-TEST").uso, "Venta");
});
```

En `industrial-writeback-mapper.test.js`, sacar `"uso"` de la lista de «el SET del UPDATE omite lo que no puede reponer» y agregar:

```js
test("uso: el SET lo lleva sólo con dato; el INSERT usa el del bloque o Venta", () => {
  assert.equal(mapIndustrialBlockToUniverse({ ...bloque, blockUsage: "Renta" }).uso, "Renta");
  assert.ok(!("uso" in mapIndustrialBlockToUniverse(bloque)));
  assert.equal(buildIndustrialUniverseInsertRow({ ...bloque, blockUsage: "Renta" }, "DEMOIN9").uso, "Renta");
  assert.equal(buildIndustrialUniverseInsertRow(bloque, "DEMOIN9").uso, "Venta");
});
```

- [ ] **Step 3: Correr y ver que fallan.** `npm run writeback:test`. Esperado: FAIL en los cuatro archivos.

- [ ] **Step 4: Implementar el mapper de vivienda.** En `writeback-field-mapper.js`, cambiar el comentario de `mapBlockToUniverse` a «No incluye clasificacion_tamano (no está en Strapi). `uso` va sólo si el bloque tiene `blockUsage`». Pasar el objeto que hoy se retorna a una constante `row`, y terminar con:

```js
  // `uso` sólo con dato. Un UPDATE pisa lo que nombra, y un bloque sin
  // `blockUsage` (nacido en el admin o todavía sin importar) borraría el uso
  // real del warehouse. Ver el import manual en n8n.
  if (block.blockUsage) row.uso = block.blockUsage;
  return row;
```

En `buildUniverseInsertRow`, agregar el default al INSERT (decisión del 2026-10-14: igual que oficinas e industrial). Arriba del mapper:

```js
/** Uso de un bloque nuevo sin `blockUsage`. Domina los datos reales. Sólo se usa al INSERTAR. */
const USO_POR_DEFECTO_VIVIENDA = "Venta";
```

y en el objeto que retorna, después del spread: `uso: block.blockUsage || USO_POR_DEFECTO_VIVIENDA,`. Agregar al test del Step 1:

```js
  assert.equal(buildUniverseInsertRow({ ...bloque(), blockUsage: "Renta" }, "C9").uso, "Renta");
  assert.equal(buildUniverseInsertRow(bloque(), "C9").uso, "Venta");
```

- [ ] **Step 5: Implementar el diff.** En `writeback-diff.js`, agregar `"uso"` al final de `UNIVERSE_FIELDS` y cambiar el comentario de la línea 6 a «Se excluyen: cod_proyecto (llave), clasificacion_tamano (no se toca), created_at (MySQL managed). `uso` se compara sólo cuando el mapper lo nombra.». Dentro del loop `for (const field of UNIVERSE_FIELDS)`, como primera línea:

```js
      // Lo que el mapper no nombra no se escribe, así que tampoco es un cambio.
      if (!(field in mappedUniverse)) continue;
```

- [ ] **Step 6: Implementar oficinas.**
  - En `office-writeback-mapper.js`, reemplazar el bloque de comentario de `USO_POR_DEFECTO` (líneas 41-50) por:

```js
/**
 * `uso` del bloque: viene de `blockUsage`. `office_universe.uso` es NOT NULL,
 * así que el UPDATE sólo lo nombra cuando el bloque tiene dato y, si no, la
 * columna conserva lo que el warehouse ya tenía.
 *
 * Al INSERTAR un bloque sin uso se usa el que domina los datos reales: 20 de
 * 23 proyectos son de venta.
 */
```

  - En el comentario de `mapOfficeBlockToUniverse`, sacar `uso` de la lista «sin origen en Strapi».
  - Pasar el objeto que hoy se retorna a `const row = { … }` y cerrar con:

```js
  if (block.blockUsage) row.uso = block.blockUsage;
  return row;
```

  - En `buildOfficeUniverseInsertRow`, cambiar `uso: USO_POR_DEFECTO,` por `uso: block.blockUsage || USO_POR_DEFECTO,`.

- [ ] **Step 7: Implementar industrial.**
  - En `industrial-writeback-mapper.js`, sacar `uso` del comentario de la línea 26 («`uso` y `compartido_exclusivo` Se preservan…» pasa a hablar solo de `compartido_exclusivo`) y de la lista de la línea 130.
  - Hacer lo mismo de `const row` + `if (block.blockUsage) row.uso = block.blockUsage;` en `mapIndustrialBlockToUniverse`.
  - En `buildIndustrialUniverseInsertRow`, cambiar a `uso: block.blockUsage || USO_POR_DEFECTO_INDUSTRIAL,`. Cambiar el comentario de la constante a «Sólo se usa al INSERTAR un bloque sin `blockUsage`».

- [ ] **Step 8: Harness.** En `scripts/n8n/block-worker-harness.test.js:1154`, el fixture no tiene `blockUsage`, así que la aserción sigue valiendo. Cambiar solo el comentario a: `// Y \`uso\` NO va en el SET cuando el bloque no tiene blockUsage: el UPDATE lo preserva.`

- [ ] **Step 9: Correr todo y regenerar.**

```bash
npm run writeback:test && npm run n8n:harness && npm run n8n:api-harness && npm run n8n:test
npm run n8n:build && npm run n8n:check
```

Esperado: todo PASS. `n8n:build` reescribe `[Prime IQ] Sync Block Worker.json` (bundle `blockWorker`).

- [ ] **Step 10: Commit.** En sync-database:

```bash
git add scripts/sync/writeback/lib/ scripts/n8n/block-worker-harness.test.js
git commit -m "feat(writeback): el uso del bloque vuelve a MySQL, sólo cuando hay dato"
```

En n8n-manager: `git add . && git commit -m "build: Block Worker con uso del bloque"`.

**No publicar estos workflows en n8n hasta haber corrido la Task 4 en producción** (ver Task 6).

---

### Task 4: sync-database — workflow manual «Import Block Usage»

**Files:**
- Create: `scripts/sync/repair/lib/usage-import.js`
- Create: `scripts/sync/repair/lib/usage-import.test.js`
- Modify: `scripts/n8n/lib/bundles.js` (agregar el bundle `usageImport` después de `nameRepair`, ~línea 125)
- Create: `scripts/n8n/templates/[Prime IQ] Sync Import Block Usage.json`
- Generated: `n8n-manager/[Prime IQ] Sync Import Block Usage.json`

**Interfaces:**
- Consumes: `parseUsage` (Task 2).
- Produces: `planUsageImport({ universes, blocks, soloVacios = true, maxOps = Infinity })`, que devuelve `{ ops, resumen, sinPareja, usoInvalido }`.
  - `universes`: `{ dominio: "housing"|"office"|"industrial", cod_proyecto, uso }[]`
  - `blocks`: `{ documentId, name, legacyId, domain, blockUsage }[]`
  - `ops`: `{ documentId, name, llave, antes, despues }[]`
  - `resumen`: `{ leidos, actualizar, sinCambio, yaCapturado, usoInvalido, sinPareja, sinLegacyId, restantes }`

- [ ] **Step 1: Tests.** Crear `scripts/sync/repair/lib/usage-import.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { planUsageImport } from "./usage-import.js";

const u = (dominio, cod_proyecto, uso) => ({ dominio, cod_proyecto, uso });
const b = (o) => ({ documentId: "d1", name: "Bloque", legacyId: "C1", domain: "housing", blockUsage: null, ...o });

test("empareja por dominio + cod_proyecto y normaliza el uso", () => {
  const { ops, resumen } = planUsageImport({
    universes: [u("housing", "C1", " renta ")],
    blocks: [b()],
  });
  assert.deepEqual(ops, [{ documentId: "d1", name: "Bloque", llave: "housing/C1", antes: null, despues: "Renta" }]);
  assert.equal(resumen.actualizar, 1);
});

test("el mismo cod_proyecto en otro dominio NO empareja", () => {
  const { ops, resumen } = planUsageImport({
    universes: [u("office", "C1", "Renta")],
    blocks: [b({ domain: "housing" })],
  });
  assert.equal(ops.length, 0);
  assert.equal(resumen.sinPareja, 1);
});

test("un domain vacío cuenta como housing, el default de Strapi", () => {
  const { ops } = planUsageImport({ universes: [u("housing", "C1", "Venta")], blocks: [b({ domain: null })] });
  assert.equal(ops[0].despues, "Venta");
});

test("no pisa un uso ya capturado, salvo que se pida", () => {
  const args = { universes: [u("housing", "C1", "Venta")], blocks: [b({ blockUsage: "Renta" })] };
  const conservador = planUsageImport(args);
  assert.equal(conservador.ops.length, 0);
  assert.equal(conservador.resumen.yaCapturado, 1);
  const forzado = planUsageImport({ ...args, soloVacios: false });
  assert.deepEqual(forzado.ops.map((o) => [o.antes, o.despues]), [["Renta", "Venta"]]);
});

test("igual que el warehouse: no hay nada que escribir", () => {
  const { ops, resumen } = planUsageImport({ universes: [u("housing", "C1", "Venta")], blocks: [b({ blockUsage: "Venta" })] });
  assert.equal(ops.length, 0);
  assert.equal(resumen.sinCambio, 1);
});

test("sin legacyId (nació en el admin) o con uso inválido: se reporta, no se escribe", () => {
  const { ops, resumen, usoInvalido } = planUsageImport({
    universes: [u("housing", "C2", "24531.85286")],
    blocks: [b({ legacyId: null }), b({ documentId: "d2", legacyId: "C2" })],
  });
  assert.equal(ops.length, 0);
  assert.equal(resumen.sinLegacyId, 1);
  assert.equal(resumen.usoInvalido, 1);
  assert.equal(usoInvalido[0].uso, "24531.85286");
});

test("maxOps corta el plan y cuenta lo que queda", () => {
  const { ops, resumen } = planUsageImport({
    universes: [u("housing", "C1", "Venta"), u("housing", "C2", "Renta")],
    blocks: [b(), b({ documentId: "d2", legacyId: "C2" })],
    maxOps: 1,
  });
  assert.equal(ops.length, 1);
  assert.equal(resumen.restantes, 1);
});
```

- [ ] **Step 2: Correr y ver que falla.** `npm run repair:test`. Esperado: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar** `scripts/sync/repair/lib/usage-import.js`:

```js
/**
 * Importación del `uso` del universo al `blockUsage` de cada bloque.
 *
 * Es el llenado inicial del campo, sin pasar por un pull completo: se lee una
 * sola columna de cada universo y se escribe un solo campo en Strapi. Lo
 * ejecuta a mano el workflow `[Prime IQ] Sync Import Block Usage`.
 *
 * Módulo puro, sin I/O.
 */

import { parseUsage } from "../../../strapi-prep/lib/universe-parse.js";

/**
 * @param {{
 *   universes: { dominio: string, cod_proyecto: string, uso: unknown }[],
 *   blocks: { documentId: string, name?: string, legacyId?: string|null, domain?: string|null, blockUsage?: string|null }[],
 *   soloVacios?: boolean,
 *   maxOps?: number,
 * }} args
 */
export function planUsageImport({ universes = [], blocks = [], soloVacios = true, maxOps = Infinity }) {
  // La llave lleva el dominio: `legacyId` sólo es único dentro de su universo.
  const usoPorLlave = new Map();
  for (const r of universes) {
    const cod = String(r?.cod_proyecto ?? "").trim();
    if (cod) usoPorLlave.set(`${r.dominio}/${cod}`, r.uso);
  }

  const ops = [];
  const sinPareja = [];
  const usoInvalido = [];
  const resumen = {
    leidos: blocks.length, actualizar: 0, sinCambio: 0, yaCapturado: 0,
    usoInvalido: 0, sinPareja: 0, sinLegacyId: 0, restantes: 0,
  };

  for (const b of blocks) {
    const cod = String(b?.legacyId ?? "").trim();
    // Nació en el admin: no tiene fila en el warehouse de la cual leer.
    if (!cod) { resumen.sinLegacyId++; continue; }

    // `domain` vacío = housing, que es el default del schema.
    const llave = `${b.domain || "housing"}/${cod}`;
    if (!usoPorLlave.has(llave)) {
      resumen.sinPareja++;
      sinPareja.push({ documentId: b.documentId, name: b.name, llave });
      continue;
    }

    const crudo = usoPorLlave.get(llave);
    const uso = parseUsage(crudo);
    if (!uso) {
      resumen.usoInvalido++;
      usoInvalido.push({ documentId: b.documentId, name: b.name, llave, uso: crudo });
      continue;
    }

    const actual = b.blockUsage ?? null;
    if (actual === uso) { resumen.sinCambio++; continue; }
    // Un uso capturado a mano gana sobre el warehouse, salvo que se pida.
    if (actual && soloVacios) { resumen.yaCapturado++; continue; }
    if (ops.length >= maxOps) { resumen.restantes++; continue; }

    ops.push({ documentId: b.documentId, name: b.name, llave, antes: actual, despues: uso });
  }

  resumen.actualizar = ops.length;
  return { ops, resumen, sinPareja, usoInvalido };
}
```

- [ ] **Step 4: Correr.** `npm run repair:test`. Esperado: PASS.

- [ ] **Step 5: Registrar el bundle.** En `scripts/n8n/lib/bundles.js`, después de `nameRepair`:

```js
  // La importación del uso del universo: la regla de normalización y el plan.
  usageImport: [
    "scripts/strapi-prep/lib/universe-parse.js",
    "scripts/sync/repair/lib/usage-import.js",
  ],
```

Correr `npm run n8n:test`. Esperado: PASS. Si `bundles.test.js` enumera los bundles, agregar `usageImport` donde lo pida.

- [ ] **Step 6: Template del workflow.** Copiar `scripts/n8n/templates/[Prime IQ] Sync Repair Names.json` a `[Prime IQ] Sync Import Block Usage.json`. Cambiar `name` a `[Prime IQ] Sync Import Block Usage` y regenerar los `id` de los nodos (UUID nuevos). Dejar estos nodos y borrar `Fetch damaged units`, `¿Reintentar sin code?`, `Split reintentos`, `Strapi PUT sólo nombre`, `Revisar reintentos` y `Lote sin reintentos`:

  | Nodo | Tipo | Contenido |
  |---|---|---|
  | `Ejecutar` | manualTrigger | igual |
  | `Parámetros` | code | ver abajo |
  | `MySQL usos` | mySql 2.4, credencial `PLACEHOLDER_MYSQL_WAREHOUSE_CREDENTIAL_ID` / `MySQL Warehouse`, `executeQuery` | ver abajo |
  | `Fetch blocks` | el `Fetch damaged blocks` renombrado | ver abajo |
  | `Plan` | code | ver abajo |
  | `S3 put plan` | igual | `fileName`: `=sync-runs/usage-import/{{ $execution.id }}/plan-{{ $('Parámetros').first().json.modo }}.json` |
  | `Respaldo falló` | igual | igual |
  | `¿Aplicar?` | igual | igual |
  | `Resultado del ensayo` | code | ver abajo |
  | `Split ops` | code | ver abajo |
  | `Lotes` | splitInBatches, 250 | igual |
  | `Strapi PUT` | igual (batching 5 / 200 ms, `neverError`) | `url`: `=https://gep8aekqnp.us-east-1.awsapprunner.com/api/blocks/{{ $json.documentId }}?fields[0]=documentId` |
  | `Revisar lote` | code | ver abajo |
  | `Resumen` | code | ver abajo |

  Conexiones: `Ejecutar → Parámetros → MySQL usos → Fetch blocks → Plan → S3 put plan` (salida de error → `Respaldo falló`) `→ ¿Aplicar?` (true → `Split ops → Lotes`; false → `Resultado del ensayo`). `Lotes` loop → `Strapi PUT → Revisar lote → Lotes`; `Lotes` done → `Resumen`.

  **`Parámetros`:**

```js
// ─── EDITAR ACÁ ──────────────────────────────────────────────────────────────
// modo: 'ensayo'  → calcula y respalda el plan en S3, NO escribe.
//       'aplicar' → además escribe `blockUsage` en Strapi.
// soloVacios: true → no pisa un uso que alguien ya capturó en el admin.
// maxOps: cuántos bloques escribe como máximo en esta corrida. Lo ya escrito
//         sale como «sin cambio» en la siguiente, así que se puede volver a correr.
return [{ json: { modo: 'ensayo', soloVacios: true, maxOps: 20000 } }];
```

  **`MySQL usos`** (`query`):

```sql
-- Sólo la llave y el uso: el import no necesita nada más del universo.
-- Con varios periodos para el mismo cod_proyecto gana el último (el más reciente), porque el plan se queda con la última fila por llave.
-- `periodo` va en el SELECT porque el ORDER BY de un UNION sólo ve las columnas de salida.
SELECT 'housing' AS dominio, cod_proyecto, periodo, uso FROM housing_universe
UNION ALL
SELECT 'office' AS dominio, cod_proyecto, periodo, uso FROM office_universe
UNION ALL
SELECT 'industrial' AS dominio, cod_proyecto, periodo, uso FROM industrial_universe
ORDER BY cod_proyecto, periodo;
```

  **Enmienda:** `periodo` se selecciona y la unión termina en `ORDER BY cod_proyecto, periodo`, para que gane el periodo más reciente. Salvedad: la consulta «MySQL block row» del pull worker (`SELECT * … WHERE cod_proyecto = $1 LIMIT 1`, sin ORDER BY, ya existía) puede reemplazar después ese valor por el `uso` de otro periodo, así que «gana el último» sólo está garantizado para el import inicial. Arreglar el orden del pull es un cambio aparte porque afecta a todos los campos.

  En el nodo, activar `alwaysOutputData: false` y `executeOnce: true`, porque el siguiente HTTP debe correr una sola vez.

  **`Fetch blocks`**: mismo nodo HTTP con la misma paginación (`updateAParameterInEachRequest`), `executeOnce: true`, y estos `queryParameters`:

  | name | value |
  |---|---|
  | `fields[0]` | `name` |
  | `fields[1]` | `legacyId` |
  | `fields[2]` | `domain` |
  | `fields[3]` | `blockUsage` |
  | `pagination[pageSize]` | `250` |

  **`Plan`:**

```js
{{INLINE:usageImport}}

// ─── lógica del nodo ─────────────────────────────────────────────
const { modo, soloVacios, maxOps } = $('Parámetros').first().json;
const universes = $('MySQL usos').all().map((i) => i.json);
const blocks = $('Fetch blocks').all().flatMap((i) => i.json?.data ?? []);

const plan = planUsageImport({ universes, blocks, soloVacios, maxOps });

// El plan completo va a S3 ANTES de escribir: `antes` de cada bloque es el
// material para revertir.
const respaldo = {
  data: await this.helpers.prepareBinaryData(
    Buffer.from(JSON.stringify({ modo, soloVacios, maxOps, leidos: { universos: universes.length, bloques: blocks.length }, ...plan }, null, 1), 'utf8'),
    'plan.json',
    'application/json',
  ),
};

return [{
  json: {
    modo,
    leidos: { universos: universes.length, bloques: blocks.length },
    resumen: plan.resumen,
    ejemplos: plan.ops.slice(0, 10).map((o) => `${o.name} [${o.llave}]  ${o.antes ?? '—'} ⟶ ${o.despues}`),
    sinPareja: plan.sinPareja.slice(0, 20),
    usoInvalido: plan.usoInvalido.slice(0, 20),
    ops: plan.ops,
  },
  binary: respaldo,
}];
```

  **`Resultado del ensayo`:**

```js
const p = $('Plan').first().json;
return [{ json: {
  modo: p.modo,
  leidos: p.leidos,
  resumen: p.resumen,
  ejemplos: p.ejemplos,
  sinPareja: p.sinPareja,
  usoInvalido: p.usoInvalido,
  siguiente: p.ops.length > 0
    ? "Revisar y correr con modo: 'aplicar'."
    : 'Nada que escribir.',
  respaldo: `s3://n8n-primeiqlatam/sync-runs/usage-import/${$execution.id}/plan-ensayo.json`,
} }];
```

  **`Split ops`:**

```js
return $('Plan').first().json.ops.map((o) => ({
  json: { documentId: o.documentId, data: { blockUsage: o.despues } },
}));
```

  **`Revisar lote`:**

```js
// El lote actual, en el mismo orden que las respuestas del PUT.
const ops = $('Lotes').all();
const respuestas = $input.all();
let ok = 0;
const fallidas = [];
respuestas.forEach((r, i) => {
  const op = ops[r.pairedItem?.item ?? i]?.json;
  // Éxito es SÓLO una respuesta de Strapi con el registro. Un corte del
  // balanceador de App Runner llega como texto o vacío, sin `error`.
  if (r.json?.data?.documentId) { ok++; return; }
  const error = r.json?.error ?? { message: typeof r.json?.data === 'string' && r.json.data ? r.json.data : 'respuesta vacía o inesperada' };
  fallidas.push({ documentId: op?.documentId, motivo: String(error.message ?? JSON.stringify(error)).slice(0, 200) });
});

// FRENO: si falla más de la mitad del lote, Strapi está saturado. Lo escrito
// queda escrito y la próxima corrida retoma desde ahí.
if (respuestas.length > 0 && fallidas.length > respuestas.length / 2) {
  throw new Error(
    `Strapi no está respondiendo (${fallidas.length} de ${respuestas.length} fallaron en este lote, p. ej. «${fallidas[0].motivo}»). ` +
    'Esperar unos minutos y volver a correr: lo ya escrito sale como «sin cambio».'
  );
}
return [{ json: { ok, fallidas } }];
```

  **`Resumen`:**

```js
const p = $('Plan').first().json;
const lotes = $input.all().map((i) => i.json);
const escritos = lotes.reduce((s, l) => s + (l.ok ?? 0), 0);
const fallidas = lotes.flatMap((l) => l.fallidas ?? []);
return [{ json: {
  modo: p.modo,
  lotes: lotes.length,
  escritos,
  fallidos: fallidas.length,
  fallidas: fallidas.slice(0, 50),
  restantes: p.resumen.restantes,
  sinPareja: p.resumen.sinPareja,
  usoInvalido: p.resumen.usoInvalido,
  sinLegacyId: p.resumen.sinLegacyId,
  siguiente: (p.resumen.restantes > 0 || fallidas.length > 0)
    ? 'Volver a correr: la próxima corrida retoma lo que quedó.'
    : 'Listo.',
  respaldo: `s3://n8n-primeiqlatam/sync-runs/usage-import/${$execution.id}/plan-aplicar.json`,
} }];
```

- [ ] **Step 7: Generar y verificar.**

```bash
npm run n8n:build && npm run n8n:check
grep -c "planUsageImport" "../../n8n-manager/[Prime IQ] Sync Import Block Usage.json"   # Esperado: ≥ 2
grep -c "PLACEHOLDER_" "../../n8n-manager/[Prime IQ] Sync Import Block Usage.json"      # Esperado: 0
```

- [ ] **Step 8: Commit.** En sync-database:

```bash
git add scripts/sync/repair/lib/usage-import.js scripts/sync/repair/lib/usage-import.test.js \
  scripts/n8n/lib/bundles.js "scripts/n8n/templates/[Prime IQ] Sync Import Block Usage.json"
git commit -m "feat(repair): workflow manual que importa el uso del universo al bloque"
```

En n8n-manager: `git add . && git commit -m "build: Sync Import Block Usage"`.

---

### Task 5: Admin — editar y ver el uso del bloque

**Files:**
- Modify: `lib/api/strapi.ts:520` (`StrapiBlock`)
- Modify: `components/blocks/block-form.tsx:196` (estado inicial), `:515` (payload), `:1089-1103` (Select nuevo después del de `market`)
- Modify: `app/(main)/blocks/view/[id]/page.tsx:379-382` (tarjeta Clasificación)
- Modify: `messages/es.json`, `messages/en.json` (`common.blockForm`)
- Modify: `package.json` (`1.27.3` → `1.28.0`), `CHANGELOG.md`, `CLAUDE.md` (sección «Sibling repo»)

**Interfaces:**
- Consumes: `block.blockUsage` de Strapi (Task 1).

- [ ] **Step 1: Tipo.** En `lib/api/strapi.ts`, debajo de `market?: 'Primary' | 'Secondary'`:

```ts
  /** Cómo se comercializa el bloque. Es la columna `uso` del universo en MySQL. */
  blockUsage?: 'Venta' | 'Renta' | null
```

- [ ] **Step 2: i18n.** En `messages/es.json` → `common.blockForm`, junto a las claves `domain*`:

```json
    "usageLabel": "Uso",
    "usagePlaceholder": "Selecciona el uso",
    "usageSale": "Venta",
    "usageRent": "Renta",
```

En `messages/en.json` → `common.blockForm`:

```json
    "usageLabel": "Usage",
    "usagePlaceholder": "Select usage",
    "usageSale": "Sale",
    "usageRent": "Rent",
```

- [ ] **Step 3: Formulario.** En `components/blocks/block-form.tsx`:
  - Estado inicial (después de `market: initialData?.market,`, línea 196): `blockUsage: initialData?.blockUsage ?? undefined,`
  - Payload (después de `market: formData.market,`, línea 515): `blockUsage: formData.blockUsage ?? undefined,`
  - Después del `<div>` del Select de `market` (cierra en ~1103), dentro del mismo grid:

```tsx
            <div className="space-y-2">
              <Label htmlFor="blockUsage">{tForm('usageLabel')}</Label>
              <Select
                value={formData.blockUsage ?? ""}
                onValueChange={(value) => setFormData({ ...formData, blockUsage: (value || undefined) as 'Venta' | 'Renta' | undefined })}
              >
                <SelectTrigger id="blockUsage" className="w-full">
                  <SelectValue placeholder={tForm('usagePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Venta">{tForm('usageSale')}</SelectItem>
                  <SelectItem value="Renta">{tForm('usageRent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
```

Clonar lo hereda solo, porque usa el mismo `initialData`.

- [ ] **Step 4: Vista.** En `app/(main)/blocks/view/[id]/page.tsx`, después del `<div>` de `market` (línea 382):

```tsx
            <div>
              <p className="text-sm text-muted-foreground">{tForm('usageLabel')}</p>
              <p className="font-medium">
                {block.blockUsage ? tForm(block.blockUsage === 'Venta' ? 'usageSale' : 'usageRent') : '-'}
              </p>
            </div>
```

- [ ] **Step 5: Tipos.** Correr `npx tsc --noEmit 2>&1 | grep -E "block-form|blocks/view|lib/api/strapi"`. Esperado: ningún error nuevo en esas líneas (la línea base es ruidosa; comparar contra `git stash` si hay dudas).

- [ ] **Step 6: Probar en el navegador** con `pnpm dev`, apuntando a un Strapi que ya tenga la Task 1:
  1. Editar un bloque, elegir «Renta», guardar.
  2. La vista muestra «Renta» y el formulario la trae al reabrir.
  3. En inglés (cookie `locale=en`) se ve «Rent».
  4. Clonar ese bloque: el clon arranca con «Renta».
  5. Un bloque sin uso muestra «-» y guarda sin error.

- [ ] **Step 7: Versión, CHANGELOG y CLAUDE.md.**
  - `package.json`: `"version": "1.28.0"`.
  - `CHANGELOG.md`: entrada arriba, con el formato de las existentes:

```markdown
## El bloque tiene uso: Venta o Renta (v1.28.0)

_2026-10-14_

- **Campo nuevo `blockUsage`** en el bloque, editable en el [formulario](components/blocks/block-form.tsx) y visible en la [vista](app/(main)/blocks/view/[id]/page.tsx). Es la columna `uso` del universo en MySQL, con los mismos dos valores.
- **No cambia ninguna fórmula**: el IVA y la tabla de unidades siguen usando el uso de cada unidad.
- **Dependencia de datos**: requiere el campo `blockUsage` en Strapi. El llenado inicial lo hace el workflow manual `[Prime IQ] Sync Import Block Usage` de n8n, y el sync lo lee y lo escribe de vuelta a MySQL solo cuando tiene dato.
```

  - `CLAUDE.md`, sección «Sibling repo — `../../scripts/sync-database`», agregar un tercer punto a los contratos:

```markdown
- **Uso del bloque**: `blockUsage` (`Venta`/`Renta`) es la columna `uso` del universo, 1:1 y sin traducción. Sin dato nunca borra: el pull no lo manda si el `uso` no es válido, y el writeback no nombra `uso` si el bloque no lo tiene. El llenado inicial es el workflow manual `[Prime IQ] Sync Import Block Usage`.
```

- [ ] **Step 8: Commit.**

```bash
git add lib/api/strapi.ts components/blocks/block-form.tsx "app/(main)/blocks/view/[id]/page.tsx" \
  messages/es.json messages/en.json package.json CHANGELOG.md CLAUDE.md
git commit -m "feat(blocks): v1.28.0 — el bloque tiene uso (Venta/Renta)"
```

---

### Task 6: Puesta en producción (manual, en orden)

Esta tarea es operativa, no tiene código. Cada paso depende del anterior.

- [ ] **Step 1: Strapi.** Push de la Task 1 a `main`. Esperar el despliegue de App Runner y verificar `GET /api/blocks?pagination[pageSize]=1` → `blockUsage: null`. Aplicar el config-sync en producción (Settings → Config Sync → Import) para que aparezca la vista.
- [ ] **Step 2: Import.**
  1. Publicar en n8n solo `[Prime IQ] Sync Import Block Usage` (`node scripts/n8n-sync.js push` en n8n-manager, o importarlo a mano) y asignarle las credenciales `MySQL Warehouse`, `Strapi API` y `AWS Account`.
  2. Correr con `modo: 'ensayo'` y revisar `resumen`, `sinPareja` y `usoInvalido`. Esperado: `actualizar` ≈ cantidad de bloques con `legacyId`, y `usoInvalido` pocos (las filas con un número en `uso`).
  3. Cambiar a `modo: 'aplicar'` y correr. Volver a correr en `ensayo`: esperado `actualizar: 0`.
- [ ] **Step 3: Pull.** Publicar `[Prime IQ] Sync Pull Block Worker` y `[Prime IQ] Sync Resolve Targets` regenerados (Task 2).
- [ ] **Step 4: Admin.** Push de la Task 5 a `main` con la cuenta `Admin-PrimeIQ` (email `engteam@primeiqlatam.com`).
- [ ] **Step 5: Writeback, al final.** Publicar `[Prime IQ] Sync Block Worker` (Task 3). Probar housing con `writeback:diff`, que muestra `uso` solo cuando el bloque y el universo difieren (`writeback:diff` es solo housing). Para office e industrial, correr el Block Worker con un bloque de cada uno y revisar que el SQL/snapshot generado incluya `uso` solo cuando el bloque tiene `blockUsage`.
- [ ] **Step 6: Documentar en sync-database.** En su `CLAUDE.md`, agregar el contrato de `uso` junto a los de mantenimiento y varas (mismo texto que el punto de la Task 5, Step 7). Commit: `docs: contrato del uso del bloque`.

**Revertir el import:** con `soloVacios: true`, todas las ops del plan tienen `antes: null`. Para revertir, leer `ops[].documentId` del `plan-aplicar.json` en S3 y hacer `PUT /api/blocks/:documentId` con `{ "data": { "blockUsage": null } }`.
