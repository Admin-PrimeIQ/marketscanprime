/**
 * El parser del markdown enriquecido del copiloto.
 *
 * Los casos salen de salidas REALES del modelo que se renderizaron mal en
 * pantalla. El prompt le prohíbe escribir un bloque sin sus `:::`, y aun así
 * ocurre; cuando ocurre, lo que ve el investigador es la línea cruda
 * —"note{title=..." — que es peor que no tener el bloque.
 *
 *   npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { parseMarkdownToBlocks } from "./ui-blocks-engine.ts"

const tipos = (md: string) => parseMarkdownToBlocks(md).map((b) => b.type)
/** El primer bloque de un tipo, ya afinado al que el caso necesita leer. */
const primero = <T>(md: string, tipo: string) =>
  parseMarkdownToBlocks(md).find((b) => b.type === tipo) as (T & { type: string }) | undefined

// ── El caso reportado, textual ───────────────────────────────────────────────

const SALIDA_REAL = `## Resultado rápido

:::table
headers: Proyecto | Departamento | Municipio | Desarrollador | DocumentId | Sitio oficial
rows:
- Acacia | Quetzaltenango | Quetzaltenango | Grupo GDL | njpta3i0xcq5udbz8zai9xbv | https://viveacacia.com.gt/
:::

Encontré el sitio oficial del proyecto **Acacia (Xela / Quetzaltenango)**: **https://viveacacia.com.gt/**.

note{title="Origen de los datos"}
- La fila del proyecto proviene de la búsqueda interna de Prime IQ (documentId: **njpta3i0xcq5udbz8zai9xbv**).
- La URL oficial fue verificada en la web (sitio del proyecto — **viveacacia.com.gt**).


buttons
- label: Abrir sitio oficial | action:url:https://viveacacia.com.gt/ | variant:primary


¿Quieres que extraiga el contacto, el brochure (PDF) o las tipologías del sitio?`

test("la salida real del copiloto ya no imprime las directivas como texto", () => {
  const md = parseMarkdownToBlocks(SALIDA_REAL)
    .filter((b) => b.type === "text")
    .map((b) => (b as { content: string }).content)
    .join("\n")
  assert.ok(!md.includes("note{title"), `quedó la directiva cruda:\n${md}`)
  assert.ok(!/^buttons$/m.test(md), `quedó "buttons" como texto:\n${md}`)
})

test("la tabla, la nota y los botones se reconocen los tres", () => {
  const t = tipos(SALIDA_REAL)
  assert.ok(t.includes("table"), `falta la tabla: ${t.join(", ")}`)
  assert.ok(t.includes("note"), `falta la nota: ${t.join(", ")}`)
  assert.ok(t.includes("buttons"), `faltan los botones: ${t.join(", ")}`)
})

test("la nota suelta conserva su título y su contenido", () => {
  const n = primero<{ title?: string; content: string; level: string }>(SALIDA_REAL, "note")
  assert.equal(n?.title, "Origen de los datos", "el título vivía en {title=…} y se perdía")
  assert.ok(n?.content.includes("búsqueda interna de Prime IQ"))
  assert.equal(n?.level, "info")
})

test("el botón suelto conserva etiqueta, acción y variante", () => {
  const b = primero<{ items: Array<{ label: string; action: string; variant?: string }> }>(SALIDA_REAL, "buttons")
  assert.equal(b?.items.length, 1)
  assert.equal(b?.items[0].label, "Abrir sitio oficial")
  // El parser normaliza `action:url:` a `url:`; el renderizador acepta las dos
  // formas. Lo que importa es que quede como enlace a esa dirección.
  assert.match(b!.items[0].action, /^(action:)?url:https:\/\/viveacacia\.com\.gt\/$/)
  assert.equal(b?.items[0].variant, "primary")
})

// ── Las formas bien escritas siguen funcionando ─────────────────────────────

test("la forma correcta con ::: no se rompió", () => {
  const md = `:::success{title="Listo"}
Todo bien.
:::

:::buttons
- label: Ver | action:url:https://ejemplo.com | variant:primary
:::`
  const t = tipos(md)
  assert.ok(t.includes("note"))
  assert.ok(t.includes("buttons"))
  const n = primero<{ title?: string; level: string }>(md, "note")
  assert.equal(n?.title, "Listo")
  assert.equal(n?.level, "success")
})

// ── Lo que NO debe convertirse en bloque ────────────────────────────────────

test("una palabra suelta sin viñetas detrás sigue siendo texto", () => {
  // Si alguien escribe "buttons" en medio de una frase, no hay nada que armar.
  const blocks = parseMarkdownToBlocks("buttons\n\nUn párrafo cualquiera.")
  assert.equal(blocks.filter((b) => b.type === "buttons").length, 0)
})

test("una lista normal no se convierte en botones por estar tras un título", () => {
  const md = `Opciones\n- primera\n- segunda`
  assert.equal(parseMarkdownToBlocks(md).filter((b) => b.type === "buttons").length, 0)
})

test("otros niveles de nota sueltos también se reconocen", () => {
  for (const nivel of ["warning", "error", "tip", "success"]) {
    const md = `${nivel}{title="T"}\n- contenido`
    const n = primero<{ level: string; title?: string }>(md, "note")
    assert.equal(n?.level, nivel, `${nivel} suelto`)
    assert.equal(n?.title, "T")
  }
})
