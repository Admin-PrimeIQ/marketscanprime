export interface ChangelogSection {
  title: string
  items: string[]
}

export interface ChangelogEntry {
  version: string
  date: string
  summary: string
  sections: ChangelogSection[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.27.3",
    date: "30 septiembre 2026",
    summary: "Los nombres de bloques y unidades ya no repiten «Fase Fase», «Torre Torre» ni el nombre del bloque.",
    sections: [
      {
        title: "Corrección",
        items: [
          "Si la fase, el sector o la torre ya incluían su etiqueta (por ejemplo «Fase 3»), el nombre del bloque salía como «Fase Fase 3». Ahora la etiqueta aparece una sola vez.",
          "Algunos nombres de unidad crecían con cada sincronización y repetían el nombre del bloque («… - Torre A - - … - Torre A - A2-2»). Ahora se arman siempre como nombre del bloque más número de unidad.",
          "Esto evita que el problema vuelva a aparecer. Los nombres que ya estaban mal se corregirán aparte, bloque por bloque.",
        ],
      },
    ],
  },
  {
    version: "1.27.2",
    date: "30 septiembre 2026",
    summary: "El mantenimiento llega a los tableros igual que se ve en el admin.",
    sections: [
      {
        title: "Corrección",
        items: [
          "El mantenimiento capturado en el admin llegaba a los tableros con el IVA descontado dos veces: el total y el precio por m² aparecían un 10.7% por debajo, y los promedios con ellos.",
          "Desde ahora el admin es la referencia. El total y el precio por m² viajan a los tableros tal cual se ven acá, y vuelven igual.",
          "En el admin no cambia ningún número. En los tableros el mantenimiento se corrige cuando se vuelve a enviar cada bloque.",
          "Con esto queda cerrado el pendiente de mantenimiento que se anunció en la versión 1.25.0.",
        ],
      },
    ],
  },
  {
    version: "1.27.1",
    date: "14 septiembre 2026",
    summary: "Corregido: algunas respuestas del copiloto mostraban texto suelto en vez de notas y botones.",
    sections: [
      {
        title: "Corrección",
        items: [
          "En algunas respuestas aparecía texto como note{title=...} o buttons en pantalla, en lugar de la nota o los botones. Ya se dibujan correctamente.",
          "Se conserva el título de la nota y la etiqueta, el enlace y el estilo de cada botón.",
        ],
      },
    ],
  },
  {
    version: "1.27.0",
    date: "14 septiembre 2026",
    summary: "En el copiloto ya se pueden archivar o desarchivar varias conversaciones a la vez.",
    sections: [
      {
        title: "Seleccionar varias conversaciones",
        items: [
          "En la barra lateral del copiloto hay un botón Seleccionar, junto al buscador. Al activarlo cada conversación muestra una casilla y se pueden marcar varias.",
          "Abajo aparece Archivar o Desarchivar con la cantidad marcada. Si se mezclan activas y archivadas aparecen las dos opciones, cada una con su número.",
          "Seleccionar todo marca únicamente lo que se está viendo: respeta la búsqueda y no toca las archivadas si esa sección está cerrada.",
          "Archivar no borra nada: la conversación sale de la lista y su historial queda completo. Se restablece al cerrar la pestaña.",
        ],
      },
    ],
  },
  {
    version: "1.26.0",
    date: "13 septiembre 2026",
    summary: "El Tour Guiado queda desactivado hasta nuevo aviso.",
    sections: [
      {
        title: "Tour Guiado",
        items: [
          "El recorrido que arrancaba solo al entrar a Proyectos, Bloques, Unidades o Catálogos ya no aparece, y tampoco se puede iniciar desde Ajustes.",
          "La opción sigue estando en Ajustes, atenuada y con la nota de que está desactivada, para que nadie la busque creyendo que se perdió. No se borró nada: cuando se reactive, vuelve tal como estaba.",
          "A quien ya lo había completado no se le va a repetir cuando vuelva a encenderse.",
        ],
      },
    ],
  },
  {
    version: "1.25.0",
    date: "13 septiembre 2026",
    summary: "En Industrial el tamaño de la unidad se calcula solo, y la venta y la renta usan cada una su IVA.",
    sections: [
      {
        title: "Industrial: las medidas se calculan solas",
        items: [
          "El tamaño de la unidad es bodega + oficina + mezzanine, y en los bloques de categoría Terrenos es el terreno. Antes venía precalculado y editar el tamaño de bodega no recalculaba nada.",
          "Al cambiar cualquiera de esas piezas se recalculan la construcción habitable, el tamaño total, los tres precios por m² y la absorción. Agregar una oficina de 100 m² a una bodega de 1.054 mueve el precio por m² de 590 a 538.87.",
          "El tamaño de unidad ya no se escribe a mano: es un valor calculado. Se edita cambiando sus partes.",
        ],
      },
      {
        title: "IVA: cada operación con su tasa",
        items: [
          "La venta usa su tasa y la renta la suya, aunque la unidad tenga las dos. Antes había una sola tasa por unidad, elegida por su uso, y se aplicaba también a la otra operación.",
          "El mantenimiento sigue usando la tasa del uso de la unidad, como hasta ahora.",
          "El parqueo no entra en ningún precio por m², en ninguno de los tres tipos de inmueble.",
        ],
      },
      {
        title: "Pendiente conocido",
        items: [
          "Creemos que el mantenimiento total que se muestra viene 12% por encima de lo que cobra el condominio. Si tienen a mano un proyecto donde sepan la cuota real, compárenla con la que aparece acá y avísennos: con un caso concreto lo confirmamos y lo corregimos. El precio de mantenimiento por m² no está afectado.",
        ],
      },
    ],
  },
  {
    version: "1.24.1",
    date: "11 septiembre 2026",
    summary: "Corregido: guardar un bloque de vivienda con financiamiento daba error.",
    sections: [
      {
        title: "Corrección",
        items: [
          "Guardar un bloque de vivienda que tuviera financiamiento devolvía un error y no guardaba nada, aunque no se hubiera tocado ningún campo. Ya se puede guardar con normalidad.",
          "No se perdió información de nadie: el error ocurría antes de escribir, así que los bloques quedaron como estaban.",
        ],
      },
    ],
  },
  {
    version: "1.24.0",
    date: "11 septiembre 2026",
    summary: "Los bloques de vivienda ya guardan su financiamiento: enganche, plazos y la tasa de cada banco.",
    sections: [
      {
        title: "Financiamiento en el bloque",
        items: [
          "En el formulario del bloque hay una sección nueva de financiamiento, y en la vista del bloque una tarjeta que lo muestra. Se enciende con un interruptor: un bloque sin financiamiento se deja apagado.",
          "Los bancos se agregan de una lista y sólo aparecen los que el bloque usa. Quitar un banco lo borra del bloque; dejarlo con la tasa en blanco lo conserva sin tasa, que no es lo mismo.",
          "Los plazos son tres y son de grupo: uno para FHA, uno para el financiamiento propio y uno que comparten los dieciséis bancos comerciales. Junto a cada banco se ve cuál le toca, pero se escribe una sola vez arriba.",
          "Sólo aplica a Vivienda. En Oficinas e Industrial la sección no aparece, porque la tabla que la respalda no existe para esos dos.",
        ],
      },
      {
        title: "La información ya está cargada",
        items: [
          "482 bloques de vivienda ya traen su financiamiento del warehouse. No hace falta correr un Pull para verlo.",
          "Se cargó sin tocar nada más: no se movió ninguna unidad, ningún otro campo del bloque y no se perdió trabajo de nadie. Se comprobó campo por campo contra la base, antes y después.",
          "Pull y Push de Vivienda ya lo incluyen: traer un bloque trae su financiamiento y enviarlo lo devuelve al warehouse.",
        ],
      },
      {
        title: "Pendiente conocido",
        items: [
          "53 bloques quedaron sin financiamiento porque su fila en el warehouse está entera en cero. Si en esos casos el cero significa algo —de contado, por ejemplo— avisen y se cargan.",
          "Cuatro bancos aparecen con siglas sin confirmar: BI, CHN, GTC y Banco INV. Si alguno se llama distinto, es cambiar el nombre visible; no se mueve ningún dato.",
        ],
      },
    ],
  },
  {
    version: "1.23.0",
    date: "10 septiembre 2026",
    summary: "Los tres tipos de inmueble ya se traen y se envían: vivienda, oficinas e industrial.",
    sections: [
      {
        title: "Migraciones completas",
        items: [
          "Vivienda, Oficinas e Industrial corren Pull y Push. Al elegir cualquiera de los tres, las dos acciones están disponibles.",
          "Industrial cierra el grupo: 119 bloques y 2.210 unidades de 67 proyectos, verificados contra la base de datos unidad por unidad y campo por campo.",
        ],
      },
      {
        title: "Cómo se comprobó",
        items: [
          "Antes de cada envío se toma una huella de todos los bloques del warehouse y se compara después: los enviados tienen que haber cambiado y el resto tiene que estar idéntico. Un conteo de filas no detectaría que se borró una unidad y se insertó otra.",
          "Las cifras que trae cada corrida no se dan por buenas: el contador de la pantalla no incluye unidades, así que la comprobación se hace contra la base.",
        ],
      },
      {
        title: "Pendiente conocido",
        items: [
          "766 unidades de Oficinas traen valores calculados con fórmulas anteriores a las últimas correcciones, entre ellas 99 con el precio por m² viejo. Son bloques que no se han vuelto a traer; un Pull completo de Oficinas los pone al día.",
        ],
      },
    ],
  },
  {
    version: "1.21.0",
    date: "10 septiembre 2026",
    summary: "Industrial ya se puede traer del warehouse y filtrar en todo el admin.",
    sections: [
      {
        title: "Ya pueden trabajar con Industrial",
        items: [
          "En Operaciones de datos, Industrial se elige y corre Pull. Están cargados 119 bloques y 2.210 unidades de 67 proyectos.",
          "Industrial corre Pull pero no Push: se puede traer del warehouse, no devolverle cambios. Al elegirlo, la tarjeta de Push aparece apagada con su razón. Vivienda y Oficinas siguen corriendo en las dos direcciones.",
          "La unidad industrial trae sus propios campos: clasificación de calidad, bodega de almacenamiento, oficina, mezzanine, área de carga, ancho, fondos, altura libre y precio por parqueo adicional.",
        ],
      },
      {
        title: "Filtros por tipo de inmueble",
        items: [
          "Industrial aparece ya en los filtros rápidos de Bloques y de Unidades, junto a Vivienda y Oficinas.",
          "Proyectos gana el filtro por tipo, que antes no tenía. Va primero, antes de región y país, porque acota más.",
          "En Tipo de cambio, el selector de proyectos del formulario también se puede filtrar por tipo.",
        ],
      },
      {
        title: "Correcciones",
        items: [
          "Los bloques industriales mostraban \"Bodegas, Desconocido\" en el grid de unidades. Ahora dicen \"Bodegas, Horizontal\": el cálculo siempre fue el horizontal — sin sumar balcón ni parqueo —, era la etiqueta la que no lo reflejaba.",
          "Las unidades que compartían nombre con otra de un bloque homónimo no llegaban a guardarse y la corrida igual salía sin errores. Ya entran todas.",
        ],
      },
    ],
  },
  {
    version: "1.6.0",
    date: "8 junio 2026",
    summary: "Nueva fórmula de Tamaño Total y aviso de sincronización al cargar.",
    sections: [
      {
        title: "Datasheet de unidades",
        items: [
          "Tamaño Total ahora se calcula como Construcción Habitable + parqueo en bloques verticales, y solo Construcción Habitable en horizontales y lotes (en lotes, Tamaño Unidad = Terreno = Tamaño Total).",
          "Editar el Balcón / Terraza, el Parqueo o el Terreno recalcula correctamente el Tamaño Total y los precios por m² en cascada.",
          "Al abrir un bloque, los valores guardados que no coinciden con las fórmulas actuales se marcan en amarillo (incluyendo sus columnas en varas² y otras monedas) y aparece un aviso para que los revises y presiones Guardar.",
        ],
      },
    ],
  },
  {
    version: "1.5.0",
    date: "5 junio 2026",
    summary: "Asignación automática de código disponible al guardar unidades y mejor reporte de errores.",
    sections: [
      {
        title: "Datasheet de unidades",
        items: [
          "Al guardar una unidad cuyo código ya está en uso (por ejemplo, al renombrar una unidad para que coincida con otra), el sistema asigna automáticamente el siguiente código disponible (con sufijo -1, -2, …) y reintenta el guardado, sin intervención. Solo cambia el código; el nombre se conserva.",
          "Si una unidad falla al guardar, ahora se muestra una notificación con el detalle de la fila (número de unidad y modelo) y el mensaje exacto del sistema, en lugar de solo marcar la fila en rojo.",
        ],
      },
    ],
  },
  {
    version: "1.4.2",
    date: "21 mayo 2026",
    summary: "Corrección de conversión varas, reorganización del datasheet y sidebar persistente.",
    sections: [
      {
        title: "Correcciones",
        items: [
          "Los campos de Frente y Profundidad ahora convierten correctamente a varas usando el factor lineal (1.19) en lugar del factor de área (1.431).",
        ],
      },
      {
        title: "Datasheet de unidades",
        items: [
          "Nuevo orden de columnas: Tamaño Unidad primero, luego los campos de tipo de unidad (Balcón/Terraza, Habitaciones), y después Baños, Parqueo y Precios.",
          "El campo Balcón / Terraza aparece antes que Habitaciones dentro del grupo de tipo de unidad.",
        ],
      },
      {
        title: "Navegación",
        items: [
          "El estado del menú lateral (expandido/colapsado) ahora se guarda y se recuerda al recargar la página.",
        ],
      },
    ],
  },
  {
    version: "1.4.1",
    date: "21 mayo 2026",
    summary: "Mejoras de experiencia en el datasheet de unidades.",
    sections: [
      {
        title: "Datasheet de unidades",
        items: [
          "Las columnas Nombre, Número de Unidad y Disponibilidad ahora están fijas al inicio del datasheet y no se mueven al hacer scroll horizontal.",
          "Se removió la opción de deshacer y rehacer cambios para evitar confusiones al editar.",
          "Al ingresar al sistema, ya no parpadea el formulario de login mientras se verifica la sesión activa.",
          "Los logs del servidor ahora muestran el correo del usuario en lugar del ID numérico.",
        ],
      },
    ],
  },
  {
    version: "1.4.0",
    date: "21 mayo 2026",
    summary: "Corrección al crear unidades nuevas en proyectos nuevos.",
    sections: [
      {
        title: "Correcciones",
        items: [
          "Al agregar unidades nuevas en un proyecto desde cero, ya no ocurre un error al guardar si la unidad tiene configurado el campo de Balcón / Terraza.",
        ],
      },
    ],
  },
  {
    version: "1.3.0",
    date: "20 mayo 2026",
    summary: "Corrección crítica en el datasheet: al ordenar columnas, los cambios ahora se guardan en la unidad correcta y el indicador azul aparece en la fila correcta.",
    sections: [
      {
        title: "Correcciones",
        items: [
          "Al ordenar el datasheet y luego editar una unidad, el cambio ahora se guarda correctamente en la base de datos — antes se perdía silenciosamente si los datos habían sido recargados.",
          "El indicador azul de 'guardando' ahora aparece en la fila que se está editando, no en otra fila de la tabla.",
          "Corregido el seguimiento de celdas eliminadas al ordenar, evitando que el sistema saltara guardados de forma incorrecta.",
        ],
      },
    ],
  },
  {
    version: "1.2.0",
    date: "20 mayo 2026",
    summary: "Aviso de versión al ingresar y correcciones de deployment.",
    sections: [
      {
        title: "Novedades al ingresar",
        items: [
          "Al entrar al sistema por primera vez en una versión nueva, aparece un aviso central informando la versión instalada.",
          "Si el sistema fue actualizado desde una versión anterior, el aviso indica desde qué versión se actualizó.",
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    date: "20 mayo 2026",
    summary: "Inteligencia de precios y medidas: notificaciones en tiempo real al editar, fórmulas inversas, nueva organización del datasheet y correcciones de sincronización con el servidor.",
    sections: [
      {
        title: "Notificaciones de cambios en tiempo real",
        items: [
          "Al modificar un precio o una medida, aparece una notificación que muestra exactamente qué otros campos cambiaron como consecuencia y cuáles son sus nuevos valores.",
          "La notificación indica la fila y el nombre de la unidad para que siempre sepás qué estás editando.",
          "Las notificaciones se muestran en la moneda activa (USD, GTQ, etc.) o en la unidad activa (mts², varas²) según lo que tenés seleccionado en ese momento.",
          "Si intentás editar un precio por mts² sin tener área habitable definida, el sistema te avisa con un mensaje de error antes de permitir el ingreso.",
        ],
      },
      {
        title: "Precios con fórmulas inteligentes",
        items: [
          "Precio por mts², Renta por mts² y Mantenimiento por mts² son ahora editables — al cambiar uno, se recalculan automáticamente el precio total, sin IVA y sus equivalentes en otras monedas.",
          "Editar cualquier campo del grupo (Total, Sin IVA o Por mts²) actualiza todos los relacionados de forma encadenada.",
          "Al cambiar el tamaño de una unidad, los precios por mts² se actualizan automáticamente.",
          "Al modificar el terreno de un lote, el área habitable y los precios por mts² se recalculan.",
          "Al cambiar el balcón o terraza de una unidad vertical, el área habitable y los precios por mts² se recalculan.",
          "Los espacios de parqueo actualizan automáticamente el tamaño de parqueo y el área total.",
          "Cambiar el Tamaño de Unidad en un lote solo actualiza el área total — los precios por mts² no cambian, ya que en lotes el área habitable la determina el terreno.",
        ],
      },
      {
        title: "Nueva organización del datasheet",
        items: [
          "Nuevo grupo 'Campos Principales' al inicio del datasheet con los 9 campos más editados: tamaño, baños, espacios de parqueo y precios de venta y mantenimiento.",
          "Al cambiar de moneda (USD → GTQ, etc.) o de unidad (mts² → varas²), los 'Campos Principales' se adaptan — todo queda en el mismo lugar sin necesidad de buscar otras columnas.",
          "Los grupos de Tipo de Unidad (Vivienda, Oficinas, Industrial) aparecen justo después de 'Campos Principales' para tenerlos cerca al editar.",
          "Las filas con cambios pendientes de guardar muestran el número de fila en ámbar para identificarlas fácilmente.",
          "Los íconos en los encabezados de columna indican qué campos son solo visualización y no se guardan en el servidor (varas², monedas extranjeras).",
          "Las columnas ajustan su ancho automáticamente al contenido al cargar el datasheet.",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "5 abril 2026",
    summary: "Gran actualización: Copilot con IA, mapa interactivo en proyectos, filtros por región y departamento, IVA dinámico y mejoras en el datasheet de unidades.",
    sections: [
      {
        title: "Copilot — nuevo asistente IA",
        items: [
          "Nuevo asistente integrado con IA para consultas sobre proyectos y unidades.",
          "Las respuestas se muestran con formato enriquecido: tablas, listas y código con resaltado de sintaxis.",
          "Soporte para adjuntar archivos en la conversación.",
          "Podés archivar o reiniciar conversaciones desde el panel.",
          "Indicador de versión beta visible para identificar que la funcionalidad está en desarrollo.",
        ],
      },
      {
        title: "Proyectos y bloques",
        items: [
          "Mapa interactivo en proyectos: arrastrar el marcador para definir la ubicación exacta.",
          "Filtro por región y departamento en la lista de proyectos y bloques.",
          "Selección de departamento y municipio con búsqueda en el formulario de ubicación.",
          "La columna de categoría de bloque ahora aparece en la tabla de bloques.",
          "El código del bloque se puede generar automáticamente desde el nombre con un solo clic.",
          "Nuevas opciones de semestre en el formulario de bloque.",
          "La información del departamento del bloque se muestra en la vista de unidades.",
        ],
      },
      {
        title: "Datasheet de unidades",
        items: [
          "El IVA se calcula dinámicamente según el trimestre y la categoría del bloque — ya no es un valor fijo.",
          "El tipo de unidad (vertical, lote, horizontal) afecta correctamente los cálculos de área habitable y precios.",
          "Se puede mostrar u ocultar columnas individualmente desde el panel de columnas.",
          "Las estadísticas de disponibilidad (disponible, vendido, reservado) se actualizan en tiempo real al pegar datos o agregar filas.",
          "Al pegar datos desde Excel o CSV, los valores de Sí/No se interpretan correctamente como booleanos.",
        ],
      },
      {
        title: "Configuración",
        items: [
          "Tarjeta de endpoint de API visible solo para administradores — muestra la URL del servidor Strapi conectado.",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "5 abril 2026",
    summary: "Soporte completo para múltiples monedas: el datasheet ahora muestra precios en GTQ, MXN y otras monedas configuradas en el perfil de tasas de cambio.",
    sections: [
      {
        title: "Tasas de cambio y monedas",
        items: [
          "Nuevo módulo de Perfiles de Tasa de Cambio: creá y administrá las tasas de conversión que se usan en todo el sistema.",
          "El datasheet de unidades muestra columnas en cada moneda activa (USD, GTQ, MXN, etc.) junto a las columnas en USD.",
          "Los proyectos se vinculan a un perfil de tasa de cambio para calcular automáticamente los precios en cada moneda.",
          "Las columnas de moneda extranjera son de solo lectura y se distinguen visualmente de las editables.",
        ],
      },
    ],
  },
  {
    version: "0.1.5",
    date: "26 febrero 2026",
    summary: "Cálculos automáticos de precios, mantenimiento, cuota, ingreso y absorción en el datasheet de unidades.",
    sections: [
      {
        title: "Cálculos automáticos",
        items: [
          "Precio de renta con y sin IVA, y precio de renta por mts² calculados automáticamente.",
          "Mantenimiento total, sin IVA y por mts² calculados según área habitable.",
          "Cuota mensual estimada (PMT a 20 años, 7.5% anual) calculada desde el precio sin IVA.",
          "Ingreso proyectado calculado desde la cuota.",
          "Absorción por mts² calculada según velocidad de venta y área habitable.",
          "Construcción habitable calculada según tipo de unidad: vertical (tamaño + balcón), horizontal (tamaño), lote (terreno).",
          "Parqueo condicional: los campos de tipo de parqueo y espacios se bloquean si la unidad no tiene parqueo.",
        ],
      },
    ],
  },
  {
    version: "0.1.4",
    date: "26 febrero 2026",
    summary: "Mejoras en el flujo de guardado y la experiencia de edición en el datasheet.",
    sections: [
      {
        title: "Guardado y edición",
        items: [
          "Diálogo de confirmación al guardar múltiples cambios: mostrá cuántas unidades y campos se van a actualizar antes de confirmar.",
          "Leyenda de estados de filas: indicadores visuales para filas nuevas, modificadas, con error y guardadas.",
          "Validación mejorada al escribir en celdas numéricas y de texto.",
          "El código del bloque se genera automáticamente al escribir el nombre.",
        ],
      },
    ],
  },
  {
    version: "0.1.3",
    date: "16 enero 2026",
    summary: "Tour guiado para nuevos usuarios.",
    sections: [
      {
        title: "Incorporación",
        items: [
          "Tour interactivo paso a paso en las páginas principales: proyectos, bloques y datasheet de unidades.",
          "Se puede relanzar el tour en cualquier momento desde Configuración.",
        ],
      },
    ],
  },
  {
    version: "0.1.2",
    date: "13 enero 2026",
    summary: "Rediseño visual y mejoras de estabilidad en el datasheet.",
    sections: [
      {
        title: "Diseño y experiencia",
        items: [
          "Diseño renovado con estética limpia y minimalista (inspirado en Notion).",
          "Indicadores de guardado por celda: cada celda muestra su estado (guardando, guardado, error) de forma individual.",
          "Al ocurrir un error al guardar una celda, el valor vuelve al estado anterior automáticamente.",
          "Paginación mejorada con campo de salto directo a número de página.",
          "La versión del sistema ya es visible en la página de Configuración.",
        ],
      },
    ],
  },
  {
    version: "0.1.1",
    date: "12 enero 2026",
    summary: "Recuperación de contraseña, selector de idioma y mejoras de accesibilidad.",
    sections: [
      {
        title: "Acceso y configuración",
        items: [
          "Flujo de recuperación y restablecimiento de contraseña por correo electrónico.",
          "Selector de idioma: podés cambiar entre Español e Inglés desde Configuración.",
          "Detección automática de dispositivo móvil con mensaje de alerta para usar el sistema en escritorio.",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "diciembre 2025",
    summary: "Lanzamiento inicial del sistema Prime IQ Back Office.",
    sections: [
      {
        title: "Funcionalidades iniciales",
        items: [
          "Módulo de proyectos: crear, ver y editar proyectos con información general, ubicación, amenidades y servicios.",
          "Módulo de bloques: gestión de bloques vinculados a proyectos con formularios completos.",
          "Datasheet de unidades: tabla de edición masiva con auto-guardado celda a celda, dropdowns, copiado, pegado y patrones de relleno.",
          "Autenticación con inicio y cierre de sesión.",
          "Soporte de idiomas Español e Inglés.",
          "Modo claro y modo oscuro.",
        ],
      },
    ],
  },
]
