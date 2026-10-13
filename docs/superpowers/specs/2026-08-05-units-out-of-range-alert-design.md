# Alerta de valores fuera de rango en la grilla de unidades

**Fecha:** 2026-08-05
**Sección:** `/units/list/[id]` — `components/units/datasheet-units-table.tsx`
**Estado:** diseño aprobado (versión 1)

---

## 1. Problema

Al capturar unidades el usuario tabula entre celdas y puede agregar u omitir un dígito. Un dígito de más es un error de exactamente **10×**; una transposición (12→21) es 1,75×. Nada en la grilla avisa: el valor errado se guarda y contamina los promedios, los reportes y las decisiones que se toman sobre ellos.

Se quiere una alerta que marque los valores implausibles de **Precio por m²** y **Mantenimiento por m²** sin impedir guardarlos, porque un valor extremo también puede ser legítimo (un penthouse, una unidad sin mantenimiento).

---

## 2. Por qué no alcanza con "8× el promedio mostrado"

La formulación intuitiva —marcar si el valor supera N veces el promedio mostrado— falla por dos motivos, y conviene dejarlos escritos porque no son evidentes.

### 2.1 El promedio se contamina con el propio error

El valor sospechoso está **dentro** del promedio contra el que se compara, así que sube su propio umbral. Con `n` filas, un factor `F`, un error `X` y un valor típico `m` en las demás:

```
X > F · promedio
X > F · ((n−1)·m + X) / n
X · (n−F) > F · (n−1) · m
```

Cuando `n ≤ F` el lado izquierdo es negativo o cero: **la condición no puede cumplirse nunca**. Y para `n` mayores el umbral real es bastante más alto que `F`. Con el factor 8 que usa la implementación:

| Filas con dato | Error necesario para disparar |
|---|---|
| ≤ 8 | nunca dispara |
| 9 | 64× |
| 10 | 36× |
| 20 | 12,7× |
| 44 | 9,6× |
| 100 | 8,6× |

La regla sería más débil justo en los bloques chicos, donde el error es más visible. Y como un error de un dígito es 10×, en un bloque de 20 unidades ni siquiera se detectaría.

**Solución:** comparar contra el promedio de **las demás** filas (`(suma − xᵢ) / (n − 1)`). El umbral vuelve a ser 8× real sin importar el tamaño del bloque, y sale del mismo par suma/conteo, así que cuesta O(1) por fila.

### 2.2 El denominador del promedio mostrado incluye filas vacías

La píldora AVG cuenta como 0 las unidades sin valor — decisión deliberada para describir el bloque. Para alertar produce disparates:

> Bloque nuevo de 44 filas. Se carga el primer precio: 2.000. Promedio mostrado = 2000/44 = 45. Umbral = 364. Como 2000 > 364, **el primer dato legítimo queda marcado como fuera de rango.**

Con el bloque a medio llenar el efecto es menor pero sigue: el umbral efectivo cae a la mitad del nominal.

**Solución:** el promedio de la alerta se calcula **solo sobre filas con valor > 0**. Es un número distinto del que muestra la píldora, y está bien que lo sea: uno describe el bloque, el otro vigila la captura.

---

## 3. Regla

Se evalúan por separado dos campos: `pricePerM2USD` y `maintenancePricePerM2USD`.

| Aspecto | Definición |
|---|---|
| Universo | Filas con valor > 0 en esa columna |
| Activación | Al menos **5 filas con valor**. Con menos, el promedio es demasiado frágil |
| Referencia | Promedio de **las demás** filas con valor: `(suma − xᵢ) / (n − 1)` |
| Fuera de rango | `xᵢ > 8 × referencia` **o** `xᵢ < referencia / 8` |

El umbral es **simétrico**: omitir un dígito es tan probable como agregarlo, y hacia abajo hoy no lo detecta nada.

El factor **8** deja pasar bastante variación legítima y sigue atrapando el error de un dígito, que es exactamente 10×. El margen entre ambos es angosto a propósito: subirlo más volvería la alerta ciega a ese caso. La contrapartida conocida es que un bloque con **dos** valores errados puede escapar — el primero infla el promedio contra el que se mide el segundo, y con 20 filas eso basta para bajar la razón de 10× a ~6,8×, por debajo del umbral.

---

## 4. Manifestación

### 4.1 Marca en la celda

La celda se pinta mientras el valor esté fuera de rango. Es un valor derivado —sin estado que mantener y siempre veraz— calculado en la misma pasada que `gridStats`.

Alcanza también a la columna equivalente en moneda extranjera (`pricePerM2GTQ`, etc.): se resuelve la base USD con el `currencyToUsdMap` que ya existe.

**Color:** naranja con texto `#9a3412`, en dos intensidades:

| Estado de la celda | Fondo | Por qué |
|---|---|---|
| Fuera de rango y **sin guardar** | `#fed7aa` | Es el momento de atrapar el tipeo: máxima visibilidad |
| Fuera de rango y **ya persistido** | `#ffedd5` | El usuario ya confirmó que el valor va así. Sigue siendo auditable, pero deja de gritar |

La marca **no se limpia al confirmar**: se deriva del valor, no de un estado de "ya revisado". Si se borrara al aceptar, un error genuino aceptado por descuido quedaría invisible para siempre, y quien abriera el bloque mañana no tendría forma de notarlo.

Los tres tonos ya ocupados son amarillo `#fef3c7` (pendiente/nueva), azul `#dbeafe` (guardando) y rojo `#fee2e2` (error). El naranja es el hueco semántico natural, con el riesgo asumido de quedar cerca del amarillo — y son estados que coinciden seguido, porque una celda recién editada está pendiente *y* fuera de rango a la vez.

**Prioridad** en la cadena de temas de `getCellContent`:

```
cellSaving > cellError > errorRow > savingRow > outOfRange > newRow > modifiedRow
```

Va por encima de pendiente/nueva —el punto es que el error se vea en el momento de escribirlo— pero por debajo de los estados transitorios de guardado, que no pueden quedar ocultos.

Se agrega la entrada correspondiente a la leyenda de estados de fila, para que la marca se pueda descifrar.

### 4.2 Confirmación al guardar

Un diálogo lista las filas afectadas y pide confirmar. **Nunca bloquea**: el botón permite continuar.

**Solo se listan las filas que se están guardando** —con ediciones pendientes o nuevas—, no todo lo que esté fuera de rango en el bloque. Se está confirmando lo que se va a persistir, no auditando datos viejos.

**Se encadena, no se fusiona,** con la confirmación de volumen que ya existe para más de 5 filas:

```
handleSaveClick
  ├─ ¿hay filas fuera de rango entre las que se guardan? → diálogo fuera de rango
  │                                                          └─ continuar ↓
  ├─ ¿más de 5 filas? → diálogo de volumen + reto matemático
  └─ handleSave()
```

Fusionarlos mezclaría dos preguntas distintas en un mismo cuadro.

---

## 5. Constantes

```ts
const OUT_OF_RANGE_FIELDS = ["pricePerM2USD", "maintenancePricePerM2USD"] as const
const OUT_OF_RANGE_FACTOR = 8
const OUT_OF_RANGE_MIN_SAMPLE = 5
```

El resultado se expone como `gridStats.outOfRange`, un `Set<string>` con claves `${rowKey}::${field}`. `rowKey` sale de `getUnitRowKey` (documentId, id o clientTempId), estable frente a orden y filtros.

Las etiquetas de los campos para el diálogo se reutilizan de `RECONCILE_FIELD_LABELS`, que ya define "Precio por m²" y "Mantenimiento por m²".

---

## 6. Internacionalización

Claves nuevas en `common`, ambos idiomas:

| Clave | es | en |
|---|---|---|
| `outOfRangeTitle` | Valores fuera de rango | Out-of-range values |
| `outOfRangeMessage` | Estos valores se apartan mucho del promedio del bloque. Revisá que no falte o sobre un dígito. | These values differ sharply from the block average. Check for a missing or extra digit. |
| `outOfRangeSaveAnyway` | Guardar de todos modos | Save anyway |
| `rowStatusOutOfRange` | Valor fuera de rango | Out-of-range value |

---

## 7. Fuera de alcance

- Vigilar otras columnas (precio total, renta, cuota, dimensiones).
- Umbral configurable por bloque o por usuario.
- Detección estadística más fina (mediana, desviación estándar, MAD). El promedio sin la propia fila cubre el caso de uso —un dígito de más o de menos— con una regla que el usuario puede explicarse solo.
- Alertar al cargar el bloque sobre datos preexistentes. La marca en la celda ya los deja visibles sin repetir un diálogo en cada visita.

---

## 8. Verificación

Con un bloque real de al menos 5 unidades con precio:

1. **Alto** — escribir en una fila 10× el valor típico: la celda se pinta y al guardar aparece el diálogo.
2. **Bajo** — escribir un décimo del valor típico: mismo comportamiento.
3. **Zona segura** — escribir 6× el valor típico: no se marca nada.
4. **Auto-enmascaramiento** — en un bloque de 9 unidades, un error de 10× debe marcarse. Comparando contra un promedio que incluye la propia fila habrían hecho falta 64×.
5. **Mínimo de muestra** — en un bloque con 4 unidades con precio, ningún valor se marca por extremo que sea.
6. **Filas vacías** — cargar el primer precio en un bloque vacío no marca nada (no se llega al mínimo de 5).
7. **Moneda** — con el selector en GTQ, la columna equivalente muestra la misma marca.
8. **Encadenado** — con más de 5 filas pendientes y una fuera de rango, sale primero el diálogo de rango y después el de volumen.
9. **No bloquea** — confirmar guarda el valor tal cual.
10. **Ámbito del diálogo** — una fila fuera de rango que no se está editando no aparece listada.
11. **Atenuación** — tras confirmar y guardar, la celda pasa de naranja pleno a naranja pálido y se mantiene así. Durante el guardado se pone azul como el resto de la fila, porque el estado transitorio tiene prioridad.

No hay suite automatizada en la app; la verificación es manual. `npx tsc --noEmit` no debe sumar errores en los archivos tocados.
