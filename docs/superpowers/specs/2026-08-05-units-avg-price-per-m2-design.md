# Promedio de Precio por m² en la barra de estadísticas de la grilla de unidades

**Fecha:** 2026-08-05
**Sección:** `/units/list/[id]` — `components/units/datasheet-units-table.tsx`
**Estado:** diseño aprobado, pendiente de plan de implementación

---

## 1. Problema

La grilla muestra bajo la barra de herramientas una fila de píldoras con el conteo de unidades (Total / Disponibles / No disponibles / Desconocido). Se quiere una métrica equivalente para el **precio promedio por m²**, visible y correcta **en todo momento**: al cargar el bloque, al editar cualquier celda, al crear filas nuevas, al pegar, al borrar y al deshacer/rehacer.

El obstáculo no es el cálculo, sino cómo se mantiene actualizado. Hoy `availabilityStats` es estado sincronizado a mano desde cinco puntos:

| Línea | Momento | Condicionado |
|---|---|---|
| 1795 | carga / cambio de `units` | no |
| 2862 | agregar filas | no |
| 3625 | editar celda | **sí** — `if (field === "availability")` |
| 4595 | pegar | no |
| 6898 | borrar celdas | **sí** — `if (hadAvailability)` |

Ese patrón no sirve para el promedio por dos razones:

1. Dos de los cinco puntos solo disparan cuando la celda tocada es `availability`, que es justo el caso que no aplica a precios.
2. `pricePerM2USD` se mueve desde muchas más rutas que una edición directa: las cascadas lo recalculan al editar Precio Total, Precio sin IVA, o cualquier dimensión que altere la construcción habitable; también cambia en la reconciliación al cargar y al deshacer.

Además, el patrón actual **ya está roto** para los contadores existentes: `handleUndo` (línea 2801) y `handleRedo` (línea 2817) reemplazan `dataRef.current` sin recalcular, de modo que tras un undo los contadores quedan desincronizados hasta el siguiente recálculo.

---

## 2. Decisiones de producto

| Punto | Decisión |
|---|---|
| Campo | `pricePerM2USD` ("Precio por mts² (USD)"), no la renta ni el mantenimiento |
| Universo | **Todas las filas**, sin filtrar por disponibilidad |
| Valor ausente | Cuenta como **0** (nulo, `undefined`, no numérico → 0) |
| Denominador | `data.length` — total de filas de la grilla |
| Fila fantasma | El bloque sin unidades inserta una fila vacía (línea 1755). Cuenta igual: Total 1, promedio 0 |
| Moneda | **Sigue la moneda activa** del selector de la grilla |
| Etiqueta | "Precio prom. m²" / "Avg. price m²" |
| Persistencia | Ninguna. Métrica derivada, no viaja a Strapi |

---

## 3. Arquitectura

Se sustituye el estado sincronizado por un **valor derivado**.

La corrección no depende de acordarse de recalcular en cada mutación, sino del hecho de que **toda ruta que muta `dataRef.current` ya provoca un re-render** por otro motivo:

| Ruta | Señal de re-render |
|---|---|
| Editar celda | `addPendingChange` / `addPendingChangeMirrored` → `pendingChanges` |
| Pegar | `pendingChanges` + `refreshKey` |
| Borrar celdas | `pendingChanges` |
| Agregar filas (diálogo, 2859) | `setRowCount` |
| Agregar fila al final (`onRowAppended`, 2887) | `setRowCount` + `setRefreshKey` |
| Undo / redo | `setRefreshKey` + `setHistoryIndex` |
| Sincronizar (`performSync`, 3465 / 3489 / 3496) | `setRowCount` + `setRefreshKey` en las tres ramas |
| Cargar | cambia la prop `units` |
| Guardar | `clearAllPendingChanges` |

`performSync` es un segundo punto de desincronización existente: recarga `dataRef.current` desde la API y **nunca** recalcula `availabilityStats`. Al derivar, queda corregido junto con undo/redo.

El costo es una pasada O(n) sobre como máximo unos cientos de filas (`getUnitsAllPages` con `pageSize: 200`), despreciable frente a un repintado de la grilla.

### Forma

```ts
const gridStats = useMemo(() => {
  const data = dataRef.current
  const sumUsd = data.reduce(
    (acc, u) => acc + (Number(u.pricePerM2USD) || 0),
    0
  )
  return {
    total: data.length,
    available: data.filter((u) => u.availability === 'Available').length,
    notAvailable: data.filter((u) => u.availability === 'Not Available').length,
    unknown: data.filter((u) => !u.availability).length,
    avgPricePerM2Usd: data.length > 0 ? sumUsd / data.length : 0,
  }
}, [pendingChanges, rowCount, refreshKey, historyIndex, units])
```

`Number(x) || 0` cubre en una sola expresión los tres casos de valor ausente (`undefined`, `null`, `NaN`).

### Ubicación

**Importante:** el arreglo de dependencias se evalúa en el momento de la declaración, así que `gridStats` debe declararse **después** de todas sus dependencias o se produce un `ReferenceError` por temporal dead zone. La última es `pendingChanges` (línea 1282).

- **Eliminar** `computeAvailabilityStats` y el `useState` de `availabilityStats` (líneas 1135-1141).
- **Insertar** `gridStats` justo después de `clearAllPendingChanges` (línea 1316).
- **Eliminar** las cinco llamadas a `setAvailabilityStats`, con este matiz en las dos condicionadas:
  - **1795, 2862, 4595** — eliminar solo la línea.
  - **3625** — eliminar solo la línea. El `if (field === "availability")` que la envuelve **se conserva**, porque también contiene los dos `addPendingChange` de `unitAbsorption` y `absorptionPerM2`.
  - **6898** — eliminar la línea completa y además el cálculo de `hadAvailability` (6894-6897), que queda muerto al ser su único consumidor.
- **Renombrar** las lecturas `availabilityStats.*` → `gridStats.*` en el bloque de píldoras (7217-7232).

El resultado tiene menos código que el actual.

---

## 4. Presentación

Quinta píldora en la fila existente (línea 7217), con el mismo estilo neutro que "Total": `border-border bg-card`, texto `text-xs text-muted-foreground`, valor en `font-semibold text-foreground`.

**Conversión de moneda.** El promedio se calcula en USD y se convierte en el render:

```
valorMostrado = gridStats.avgPricePerM2Usd * getBuyRate(editingCurrency)
```

`getBuyRate` (línea 1459) devuelve 1 para USD y las unidades de moneda local por 1 USD para el resto. El símbolo sale de `activeCurrencies.find(c => c.code === editingCurrency)?.symbol`, con `$` como valor por defecto para USD.

**Formato numérico.** El mismo que usan las celdas de precio de la grilla:

```ts
valor.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
```

**Visibilidad.** La fila completa de píldoras ya está condicionada a `total > 0`; la nueva píldora hereda esa condición sin lógica adicional.

---

## 5. Internacionalización

Las cuatro píldoras actuales tienen el texto hardcoded en español. Agregar una quinta traducida dejaría la fila a medias en inglés, así que las cinco pasan al diccionario. La grilla usa el namespace `common`, disponible como `t` (línea 1045).

Claves nuevas en `messages/es.json` y `messages/en.json`, bajo `common`:

| Clave | es | en |
|---|---|---|
| `statsTotal` | Total | Total |
| `statsAvailable` | Disponibles | Available |
| `statsNotAvailable` | No disponibles | Not available |
| `statsUnknown` | Desconocido | Unknown |
| `statsAvgPricePerM2` | Precio prom. m² | Avg. price m² |

No se reutilizan `totalUnits` / `availableUnits` ("Unidades Totales" / "Unidades Disponibles"): son demasiado largas para el formato de píldora.

---

## 6. Fuera de alcance

- Promedios de renta (`rentalPricePerM2WithoutVATUSD`) o mantenimiento (`maintenancePricePerM2USD`).
- Otras métricas agregadas (mediana, mínimo/máximo, precio total promedio).
- Persistir el promedio en el bloque o sincronizarlo con `averagePricePerM2USD` de Strapi.
- Traducir el resto de textos hardcoded de la grilla (diálogo de pegado, `formulaSyncAlert`).
- Reparar la duplicación de la lógica de carga entre el `useEffect` y `onRefresh` de la página.

---

## 7. Verificación

Sobre un bloque con unidades reales, comprobar que la píldora reacciona **sin recargar**:

1. **Carga** — el promedio aparece y coincide con `Σ(pricePerM2USD) / total` calculado a mano sobre la columna.
2. **Edición directa** — editar "Precio por mts²" de una fila mueve el promedio.
3. **Edición por cascada** — editar "Precio Total" de una fila (que recalcula el precio por m² vía cascada) mueve el promedio.
4. **Fila nueva** — agregar una fila vacía sube el Total y **baja** el promedio (cuenta como 0).
5. **Pegar y borrar** — pegar un rango de precios y luego borrarlo mueve el promedio en ambos sentidos.
6. **Undo/redo** — deshacer devuelve el promedio a su valor previo; verificar además que los cuatro contadores de disponibilidad ahora también se corrigen (regresión que este cambio repara).
7. **Sincronizar** — el botón de sincronizar recarga desde la API y deja promedio y contadores coherentes con los datos traídos (segunda regresión reparada).
8. **Moneda** — cambiar el selector a GTQ multiplica el valor por la tasa del perfil y cambia el símbolo; volver a USD lo restaura.
9. **Bloque vacío** — un bloque sin unidades muestra Total 1 y promedio 0, sin errores.
10. **Idioma** — cambiar a inglés traduce las cinco píldoras.

No hay suite de pruebas automatizadas en la app, así que la verificación es manual. `npx tsc --noEmit` debe seguir sin errores nuevos en el archivo tocado (la línea base es ruidosa).
