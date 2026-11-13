# ito: revisión de diseño y UX de los mockups

> Fecha: 2026-11-13 · Alcance: los 25 mockups `.dc.html` del lienzo «ito – Mockups» frente a `docs/concepto.md`.
> Los nombres de pantalla son los de los archivos (`Main` = Inicio, `Dinero` = Gastos, `Agenda` = Calendario).

## Resumen

La base visual es sólida y coherente en paleta, tipografía, redacción en segunda persona y uso del color de cada persona en importes y avatares. Los problemas no están en la estética, sino en **cómo encajan las pantallas entre sí**, porque cada bloque lo diseñó una persona distinta. Los más importantes son estos:

1. **El dinero no cuadra entre pantallas**. Hay cuatro "saldos" distintos (global, viaje, evento y bote) y "Saldar" siempre liquida solo el global. El modelo del bote es ambiguo y hay situaciones que se muestran pero no se pueden registrar.
2. **Falta la pantalla de Ajustes / perfil de pareja**. El reparto por defecto (mixto) no se puede configurar en ningún sitio, y tampoco el porcentaje proporcional ni el color.
3. **La terminología choca**: "plan", "evento" y "pago" significan cosas distintas según la pantalla. El "Cumpleaños de Marta" existe dos veces, con dos pantallas de detalle.
4. **Muchos enlaces llevan a la pestaña en vez de al detalle**, o no llevan a ningún sitio (Inicio casi entero, "Editar" en todas las fichas, historial de pagos). Además hay tres formas incompatibles de crear un gasto recurrente.
5. **Los colores de persona (granate y azul) se reutilizan para estados** (pines del mapa, tareas hechas, botones secundarios), justo lo que la app enseña a leer como "David" y "María".

Cuando se resuelvan estos cinco puntos, el resto son ajustes de pulido y la unificación de componentes, que conviene hacer ya al montar el sistema de diseño en código.

---

## Hallazgos de prioridad alta

### A1. Cuatro saldos que no cuadran y un "Saldar" que solo conoce uno
- **Pantallas:** `Main`, `Dinero`, `Saldar`, `DetalleViaje` (pestaña Gastos), `DetalleProyecto`.
- **Qué pasa:** Inicio y Gastos dicen "María te debe 23,40 €". El viaje a Lisboa dice "María te debe 30,00 €" y el cumpleaños de Marta dice "Debes 17,50 € a María". Las tres pantallas tienen un botón "Saldar" que lleva a `Saldar`, donde el desglose (Taberna, Gasolina, Cine, Farmacia) no incluye ni los vuelos, ni la señal del hotel, ni el regalo.
- **Escenario que falla:** David salda 23,40 € desde el viaje creyendo que liquida Lisboa. Lisboa sigue mostrando 30 € pendientes y nadie sabe cuál es la deuda real.
- **Propuesta:** un **único libro de cuentas por pareja**, y el saldo global es el único que se salda. En viajes y eventos se muestra "Este viaje suma 30,00 € a lo que María te debe", sin botón "Saldar" propio (o con un botón que lleve al saldo global). El desglose de `Saldar` debe incluir todos los gastos pendientes, agrupados por contenedor si hace falta.

### A2. El bote común: modelo ambiguo y casos que no se pueden registrar
- **Pantallas:** `Main`, `Dinero`, `Bote`, `AnadirGasto`, `Saldar`.
- **Qué pasa:**
  - Inicio dice "Bote común 412,00 € este mes" (parece lo gastado), Gastos dice "Quedan 412 € de 1.000 €" y Bote dice "Quedan 412 € de 1.000 € aportados · Noviembre". No queda claro si el bote es una **cuenta con saldo** o un **presupuesto mensual que se reinicia**.
  - `Bote` muestra "El bote debe 54,30 € a María: pagó un súper del bote con su tarjeta", pero `AnadirGasto` no permite registrarlo: si eliges "Bote común" como pagador desaparece el reparto, y si eliges "María" no existe la opción "es un gasto del bote". Además, `Dinero` muestra esa misma compra de 54,30 € como "Pagado con el bote".
  - En `Saldar`, el método "Desde el bote" es incorrecto. Si María debe 23,40 € a David y se paga con el bote (aportado 60/40), David cobra dinero que en un 60 % ya era suyo: en la práctica María solo cubre 9,36 €.
  - "Devolver" (en `Bote`) no tiene flujo.
- **Propuesta:** bote = **cuenta con saldo acumulado** (aportaciones menos gastos, sin reinicio), con "este mes" como dato secundario. En `AnadirGasto`, separar "¿Quién pagó?" (Tú / María / Bote) de "¿De quién es el gasto?" (Del bote / Repartir / Es tuyo / Es de María). Así "pagó María + del bote" genera la deuda del bote con María. Quitar "Desde el bote" de `Saldar`. "Devolver" registra una transferencia del bote a María.

### A3. No existe Ajustes / perfil de pareja, y el reparto por defecto no se puede configurar
- **Pantallas:** `Main` e `Inicio-vacio` (los avatares tienen `aria-label="Perfil de pareja"` y no llevan a nada), `Reparto` ("Lo podréis cambiar en cada gasto y en ajustes"), `Bote` ("Reparto proporcional · 60/40").
- **Qué pasa:** "Mixto" es el modelo recomendado y por defecto, pero ninguna pantalla define qué categorías van al bote y cuáles se reparten. Tampoco hay dónde fijar el 60/40, la aportación al bote, cambiar el color o el nombre, reenviar la invitación o cerrar sesión.
- **Por qué importa:** sin el mapa de categorías, el modo mixto no hace nada y `AnadirGasto` no puede preseleccionar el pagador. Esto también condiciona el modelo de datos.
- **Propuesta:** una pantalla **Ajustes de pareja** (se abre desde los avatares de la cabecera) con:
  - Perfil (nombre, foto, color, mostrando el color ocupado por la pareja).
  - Reparto por defecto, con porcentajes si es proporcional.
  - Categorías: bote o repartir (si es mixto).
  - Bote: aportación habitual de cada uno.
  - Avisos.
  - Pareja: estado, código, desvincular.
  - Cuenta: salir, borrar.

### A4. Tres formas de crear un recurrente, ninguna completa
- **Pantallas:** `AnadirGasto` (interruptor "Repetir cada mes"), `NuevoEvento` (tipo "Recordatorio de pago" + "Cada mes" + importe + "¿Quién paga?") y `Recurrentes` (botón "+" sin destino).
- **Qué pasa:** cada camino pide datos distintos. Ninguno recoge todo lo que pide el concepto: día de cobro, importe fijo o variable, aviso, y compartido o personal. En `NuevoEvento`, "¿Quién paga?" mezcla pagadores con un reparto ("Bote común / Tú / María / A medias").
- **Propuesta:** un único formulario **"Nuevo recurrente"** (nombre, importe fijo o aproximado, día, quién paga y reparto con el componente común, aviso, compartido o personal). Cada recurrente genera sus "pagos" en el calendario. El tipo "Pago" de `NuevoEvento` y el interruptor de `AnadirGasto` abren ese formulario precargado.

### A5. El bucle "plan → ¿quién pagó? → gasto" no está cerrado
- **Pantallas:** `DetalleEvento`, `Main`.
- **Qué pasa:** es la funcionalidad diferencial de la app y tiene estos fallos:
  - "¿Quién pagó?" aparece en una cena que todavía no ha pasado (hoy a las 21:30).
  - El importe (62,00 €) sale de la nada: no hay campo para escribirlo.
  - El reparto es siempre "a medias", aunque el modelo por defecto sea mixto o proporcional.
  - "Crear gasto" abre `AnadirGasto` desde cero, así que son dos pasos y no "un toque".
  - Nada avisa en Inicio de que hay planes pasados sin gasto.
- **Propuesta:** después de la hora del plan, el bloque muestra el campo de importe (precargado con el presupuesto), quién pagó y el reparto por defecto de la categoría, y "Crear gasto" lo guarda directamente con plan y sitio ya vinculados. Antes de esa hora solo se ve el presupuesto. En Inicio, una tarjeta "¿Quién pagó la cena de ayer?" y una notificación al día siguiente.

### A6. Terminología cruzada: plan, evento, proyecto, pago
- **Pantallas:** casi todas.
- **Qué pasa:**
  - **Plan** es un tipo del calendario (`NuevoEvento`), pero también un "plan grande" (`NuevoProyecto`: "Nuevo plan grande", "Crear plan"; `Planificador`: `aria-label="Nuevo plan"`, "Convertir en plan"). El itinerario llama "planes" a vuelos y check-ins.
  - **Evento** es un tipo del calendario (azul, cumpleaños) y a la vez un tipo del planificador (`NuevoProyecto`, `DetalleProyecto`). `DetalleEvento` es en realidad el detalle de un *plan*, y el "+" del calendario dice "Nuevo evento" aunque crea cualquier tipo.
  - **Pago** se llama "Cobro" en Inicio, "Pago" en Calendario y "Recordatorio de pago" en `NuevoEvento`.
  - El **Cumpleaños de Marta** es a la vez un evento del calendario (abre `DetalleEvento`, que muestra la cena del Olivo) y un "evento" del planificador con tareas (`DetalleProyecto`).
- **Propuesta (glosario):**
  - Calendario: **Plan · Evento · Pago · Viaje**.
  - Planificador: el contenedor se llama **Proyecto** ("Nuevo proyecto", "Crear proyecto"), con tipos **Viaje · Celebración · Otro**.
  - Lo recurrente es un **Recurrente**, que genera **Pagos**.
  - Un proyecto con fecha aparece en el calendario y, al tocarlo, abre el proyecto: no es una entidad aparte.
  - Alternativa seria: mantener "plan grande", con la contrapartida de que "plan" seguirá teniendo dos significados.

### A7. Enlaces que llevan a la pestaña en vez de al detalle, y callejones sin salida
- **Inicio (`Main`), casi entero inerte:**
  - La tarjeta "Hoy · Cena en Taberna El Olivo" no es un enlace.
  - Las filas de "Esta semana" no son enlaces.
  - "Saldar" es un `<button>` sin destino (en `Dinero` sí lleva a `Saldar`).
  - La tarjeta "Escapada a Lisboa" lleva a `Planificador`, no a `DetalleViaje`.
- **`Agenda`:**
  - "Escapada a Lisboa" (tipo viaje) abre `DetalleEvento`.
  - Todos los planes y eventos abren el mismo `DetalleEvento` de la cena.
  - Los pagos abren la lista `Recurrentes`, no el recurrente concreto.
- **`DetalleGasto`:** "Plan: Cena del sábado" lleva a `Agenda` y "Sitio: Taberna El Olivo" lleva a `Mapa`. Deberían llevar a `DetalleEvento` y `DetalleSitio`.
- **`DetalleProyecto`:** "En el calendario" lleva a `Agenda`, y "Elegir en el mapa" lleva a `Mapa` sin modo de selección.
- **`Saldar`:** "Ver historial de pagos" lleva a `Dinero`, y no existe una pantalla de historial.
- **`Planificador`:**
  - La tarjeta "Navidad con la familia" es un `<article>` sin enlace.
  - "Ver resumen" (Pasados) y "+ Idea" no hacen nada.
- **`Recurrentes`:** las filas no se pueden tocar, así que no se puede editar, pausar ni borrar.
- **`DetalleViaje`:** los elementos del itinerario no se pueden tocar y "Reservar" no hace nada.
- **"Editar"** en `DetalleGasto`, `DetalleEvento`, `DetalleViaje` y `DetalleProyecto`: no hay formulario de edición diseñado.
- **Propuesta:** toda fila que representa una entidad abre **su** detalle. Los formularios de creación se reutilizan como formularios de edición (mismo componente, con título "Editar…"). Faltan por crear el historial de gastos y pagos y el detalle de recurrente.

### A8. El onboarding de quien se une está mal ordenado
- **Pantallas:** `Perfil`, `Pareja`, `Unirse`, `Reparto`, `Invitar`, `Inicio-vacio`.
- **Qué pasa:**
  - María pasa por `Perfil` (elige color) *antes* de unirse, así que puede elegir granate, el mismo color que David, y la regla "no podréis repetir" no se puede aplicar.
  - `Unirse` dice "Después elegirás tu nombre, foto y color", lo que contradice el orden anterior.
  - `Unirse` lleva a `Reparto`, de modo que María vuelve a elegir el modelo de reparto que ya eligió David y lo sobrescribe.
  - "Continuar sin esperar" (`Invitar`) lleva a `Inicio-vacio`, que dice "¡Ya estáis los dos!" y muestra el avatar de María, aunque ella aún no exista.
- **Propuesta:**
  - Para quien crea: Bienvenida → Perfil → Pareja → Reparto → Invitar → Inicio.
  - Para quien se une: Bienvenida → Pareja → Unirse → Perfil (con el color de la pareja deshabilitado) → Inicio, con un aviso: "David eligió reparto mixto; puedes verlo en Ajustes".
  - Inicio necesita un estado "Tu pareja aún no se ha unido · Reenviar código".

### A9. Los colores de persona se usan también para estados
- **Pantallas:** `Mapa`, `GuardarSitio`, `CompartirSitio`, `DetalleViaje`, `DetalleProyecto`, `Main`, `DetalleEvento`.
- **Qué pasa:** `Perfil` dice que el color "te identificará en gastos, planes y el calendario". Sin embargo:
  - "Hemos ido" y "Reservado" son granate (el color de David).
  - "Quiero ir" es azul `#5B8DB8`, un azul fuera de la paleta y casi igual al de María.
  - Las tareas y reservas hechas usan un check azul.
  - Los botones secundarios son azules: "Saldar" en Inicio, "Cómo llegar" en `DetalleEvento`, "Elegir en el mapa".
  - En el mapa compartido, un pin granate se lee como "lo guardó David".
  - Si María elige verde, todo lo azul deja de tener sentido.
- **Propuesta:** los colores de persona se reservan **solo para personas** (avatares, quién pagó, importes, "guardado por"). Los estados usan forma y tonos neutros: "Hemos ido" con pin oscuro `#2A2627` relleno, "Quiero ir" con contorno, "Reservado" con un icono. "Hecho" se marca con un check oscuro. Los botones secundarios son de contorno neutro. El tipo "evento" del calendario se queda azul (está decidido), pero con su azul pastel de etiqueta, nunca con el azul de persona como botón.

### A10. Sin historial de gastos, con filtros que no filtran y categorías distintas en cada pantalla
- **Pantallas:** `Dinero`, `AnadirGasto`, `Bote`.
- **Qué pasa:**
  - `Dinero` solo muestra 3 "Últimos gastos", sin "Ver todos" ni búsqueda.
  - Los chips "Todos / Hogar / Cenas y ocio / Recurrentes" son estáticos, y "Recurrentes" no es una categoría.
  - Las categorías no coinciden:
    - `AnadirGasto`: Hogar, Súper, Cenas y ocio, Transporte, Suscripciones, Otros.
    - La lista de `Dinero`: "Hogar" para la compra del súper y "Cenas".
    - `Bote`: Súper, Hogar, Suscripciones, Otros.
  - Faltan categorías para Viajes y Regalos, aunque ya hay gastos de ese tipo.
- **Propuesta:** una lista completa de gastos agrupada por mes, con búsqueda y chips que filtran, usando **una sola lista de categorías** (Hogar, Súper, Cenas y ocio, Transporte, Viajes, Regalos, Suscripciones, Otros) compartida por gastos, bote, filtros y Ajustes. En `Dinero`, "Ver todos" lleva a esa lista.

---

## Hallazgos de prioridad media

### M1. Volver y cerrar: dos estilos y destinos fijos
- **Pantallas:** `Saldar`, `Bote` y `Recurrentes` usan un chevrón suelto de 48 px. El resto usa un círculo blanco de 44 px con borde. Las etiquetas varían entre "Atrás", "Volver" y "Cerrar".
- **Destinos fijos que fallan:** si entras en `NuevoEvento` desde "Planear" (Mapa), la X te deja en Calendario. `DetalleSitio` siempre vuelve a Mapa, aunque vengas de un viaje.
- **Propuesta:** pantallas apiladas con chevrón en círculo ("Volver"), modales de creación con X en círculo ("Cerrar") y CTA fijo abajo. En código, usar siempre `router.back()`.

### M2. El botón de crear está en cuatro sitios distintos
- **Dónde está:**
  - FAB abajo a la derecha en `Dinero` y en la vista lista de `Mapa`.
  - FAB flotando sobre la ficha en la vista mapa.
  - "+" arriba a la derecha en `Agenda`, `Planificador` y `Recurrentes`.
  - Ninguno en Inicio.
- **Por qué importa:** la acción principal de Calendario y Planificador queda fuera del alcance del pulgar, y añadir un gasto desde Inicio cuesta dos toques.
- **Propuesta:** FAB abajo a la derecha en las cinco pestañas. En Inicio abre un menú corto: Gasto · Plan · Sitio.

### M3. Cinco tarjetas de balance distintas, y sin estados "debes tú" ni "a cero"
- **Pantallas:** `Main` (blanca, botón azul), `Dinero` (granate, botón rosa), `Saldar` (centrada), `DetalleViaje` y `DetalleProyecto` (fila rosa con enlace).
- **Qué falta:** el estado en el que David debe dinero ("Debes 12 € a María") y el estado "Estáis en paz".
- **Propuesta:** un único componente `BalanceCard` con tres estados (te deben / debes / a cero) y dos tamaños (destacado y compacto).

### M4. El detalle de un gasto parece el saldo global
- **Pantalla:** `DetalleGasto`.
- **Qué pasa:** el bloque "María te debe 31,00 €" tiene el mismo aspecto que el saldo global (23,40 €). Parece una contradicción.
- **Propuesta:** "Este gasto: María te debe 31,00 €" o "Suma 31,00 € a tu favor". Si el gasto ya está saldado, indicarlo.

### M5. Saldar: falta la dirección contraria, el pago parcial y la confirmación
- **Pantalla:** `Saldar`.
- **Qué falta:**
  - El caso "Debes 12 € a María".
  - Saldar una parte.
  - Decidir quién puede marcar como saldado: si lo marca María, ¿David se entera?
  - Deshacer.
- **Propuesta:**
  - Cualquiera de los dos puede marcar el pago, y el otro recibe un aviso.
  - Campo de importe precargado con el total y editable.
  - "Deshacer" durante unos segundos.
  - El historial de liquidaciones va en la lista de gastos (filtro "Pagos").

### M6. El calendario no responde
- **Pantalla:** `Agenda`.
- **Qué pasa:**
  - Tocar un día no hace nada.
  - Las flechas no cambian de mes.
  - La vista "Semana" solo agranda las celdas, sin mostrar contenido.
  - "Próximos" se corta en 4 elementos sin "Ver más": con "Todos", el viaje a Lisboa no aparece.
- **Propuesta:**
  - Tocar un día filtra la lista de abajo ("Sábado 14").
  - La vista semana es una lista de 7 días con sus elementos.
  - "Próximos" hace scroll y llega hasta fin de mes.

### M7. Solo existe el detalle de un "plan"
- **Pantalla:** `DetalleEvento`.
- **Faltan dos variantes:**
  - **Evento** (cumpleaños): sin "¿Quién pagó?", con "Se repite cada año", y con enlace al proyecto si lo tiene.
  - **Pago**: abre el recurrente.
- Al eliminar un elemento que se repite, hay que preguntar "¿Solo este o todos?".

### M8. Los vínculos solo funcionan en una dirección
- **Pantallas:** `NuevoEvento`, `GuardarSitio`, `AnadirGasto`, `DetalleViaje`.
- **Qué pasa:**
  - `NuevoEvento` no permite elegir un proyecto, así que "+ Añadir al itinerario" crea un plan suelto.
  - `GuardarSitio` no se asocia al viaje ("+ Guardar sitio en Lisboa").
  - En `AnadirGasto`, "+ Añadir" no especifica qué se vincula, y "Añadir gasto al viaje" no llega precargado.
- **Propuesta:** un único componente **Vincular** (Plan · Sitio · Proyecto), presente en los tres formularios y precargado según desde dónde se abre.

### M9. Dos botones para elegir el sitio de la cena
- **Pantalla:** `DetalleProyecto`.
- **Qué pasa:** "Elegir sitio" (en la tarea) lleva a `GuardarSitio`, y "Elegir en el mapa" (en "Plan de la cena") lleva a `Mapa`. Son dos botones para lo mismo, con destinos distintos. Además, el bloque "Plan de la cena" repite la tarea "Reservar cena".
- **Propuesta:** un solo "Elegir sitio" que abre un **selector**: primero los sitios guardados y después la búsqueda en Google. Quitar el bloque duplicado y dejar el plan vinculado a la tarea.

### M10. Detalle de viaje: duplicados y estados nuevos
- **Pantalla:** `DetalleViaje`.
- **Qué pasa:**
  - "Próximos pasos" repite las reservas pendientes (Sintra, seguro).
  - "Reservar" no explica qué hace.
  - Aparece un tercer estado de sitio, "Reservado", que no existe en el Mapa.
  - En el itinerario, unos elementos están "En el calendario" y otros no, sin explicar por qué.
  - Los vuelos se cuentan como "planes".
- **Propuesta:**
  - Quitar "Próximos pasos", o dejar ahí solo lo que no está en Reservas.
  - "Reservar" marca la reserva como hecha y pide importe (crea un gasto) o enlace.
  - Todo elemento del itinerario con hora es un plan del calendario. "Mañana/Tarde" se trata como franja horaria.

### M11. Recurrentes: el interruptor engaña
- **Pantalla:** `Recurrentes`.
- **Qué pasa:** el interruptor de cada fila es el *aviso*, pero se lee como "activo / pausado".
- **Propuesta:** un icono de campana que se activa y desactiva. La fila abre el detalle (editar, pausar, borrar). El aviso global se configura en Ajustes.

### M12. "Nota" significa dos cosas
- **Pantallas:** `Mapa`, `DetalleSitio`, `GuardarSitio`.
- **Qué pasa:**
  - "Tu nota: 4,5" es una valoración, mientras que "Nota (opcional)" es un texto.
  - Las estrellas de `GuardarSitio` solo admiten enteros, pero el mapa muestra 4,5.
  - En `DetalleSitio`, el texto «Pedir las croquetas» no tiene autor.
- **Propuesta:** "Valoración" para las estrellas (con o sin medias, pero igual en todas las pantallas) y "Notas" para el texto, una por persona y con su avatar.

### M13. Estados vacíos y primeros pasos
- **Pantallas:** `Inicio-vacio` y las cinco pestañas.
- **Qué pasa:**
  - La checklist lleva a las pestañas, no a los formularios. "Suscripciones" lleva a `Dinero` en vez de al formulario de recurrente.
  - "Apunta un evento" contradice al concepto, que habla de "primer plan".
  - El Planificador no aparece en la checklist.
  - Ninguna pestaña tiene su estado vacío.
- **Propuesta:** cada paso abre su formulario directamente, se marca al completarse y la tarjeta desaparece al llegar a 4/4. Diseñar un estado vacío (ilustración, frase y CTA) para Gastos, Calendario, Mapa y Planificador.

### M14. Mapa: buscador ambiguo y acciones repetidas
- **Pantallas:** `Mapa`, `DetalleSitio`, `DetalleEvento`.
- **Qué pasa:**
  - "Busca un sitio" no aclara si busca entre los guardados o en Google.
  - Los filtros no tienen estado.
  - La ficha inferior siempre está abierta y tapa el 40 % del mapa.
  - En `DetalleSitio`, "Abrir en Google Maps" duplica "Cómo llegar".
  - "Ver en el mapa" (`DetalleEvento`) abre la ficha, no el mapa.
- **Propuesta:**
  - El buscador muestra primero los guardados y al final "Buscar «x» en Google" (que abre `GuardarSitio`).
  - Sin selección, la ficha se pliega.
  - Quitar "Abrir en Google Maps", porque "Cómo llegar" ya ofrece elegir la app.
  - Renombrar el botón a "Ver sitio".

### M15. Dos listas de deseos solapadas: Ideas y "Quiero ir"
- **Pantallas:** `Planificador` (Ideas), `Mapa`.
- **Qué pasa:**
  - "+ Idea" no tiene formulario.
  - "Convertir en plan" siempre abre `NuevoProyecto`, incluso para "Clase de cerámica", que es un plan pequeño.
  - Los sitios "Quiero ir" son, en la práctica, también ideas.
- **Propuesta:**
  - Una idea es algo sin fecha, con sitio opcional. Si tiene sitio, aparece también en el Mapa como "Quiero ir".
  - "Convertir" pregunta: ¿plan del calendario o proyecto?
  - "+ Idea" abre una hoja con título, tipo y sitio.

### M16. Las pantallas de detalle no tienen cabecera común
- **Pantallas:** las cinco de detalle.
- **Qué pasa:**
  - `DetalleGasto`: Editar arriba y Eliminar abajo.
  - `DetalleEvento`: Editar arriba y "Eliminar del calendario" en el pie.
  - `DetalleSitio`: "Más" arriba y Eliminar al final.
  - `DetalleViaje`: Editar y Más.
  - `DetalleProyecto`: Editar, sin forma de eliminar.
- **Propuesta:** en la cabecera, Volver a la izquierda y, a la derecha, "Editar" más un menú "⋯" con Eliminar (con confirmación). Al borrar algo con vínculos hay que decir qué pasa con lo vinculado (ver decisiones).

### M17. La misma etiqueta con significados distintos en los selectores de persona
- **Pantallas:** `AnadirGasto`, `NuevoEvento`, `NuevoProyecto`, `DetalleEvento`, `Bote`.
- **Qué pasa:**
  - En `AnadirGasto`, "Solo tú" significa "el gasto es todo tuyo". En `NuevoEvento` y `NuevoProyecto`, "Solo tú" significa "solo vas tú".
  - Además, cada formulario ofrece otro juego de opciones de pago y reparto:
    - `AnadirGasto`: pagador + 50/50, Proporcional, Solo tú, Solo María.
    - `NuevoEvento`: Bote, Tú, María, A medias.
    - `DetalleEvento`: Tú, María, Bote, con reparto fijo.
    - `NuevoProyecto`: Bote, A medias, Proporcional.
- **Propuesta:** dos componentes comunes, `QuienPago` y `Reparto` (ver "Patrones a unificar"), y renombrar las opciones a "Es tuyo" y "Es de María".

### M18. Onboarding: progreso, email y errores
- **Pantallas:** `Perfil`, `Pareja`, `Invitar`, `Unirse`, `Reparto`, `Bienvenida`.
- **Qué pasa:**
  - El indicador dice "1 de 3", pero hay 4 o 5 pantallas, y `Invitar` y `Unirse` no tienen barra.
  - El botón Atrás de `Reparto` salta `Invitar`.
  - "Usar mi email" lleva directamente a Perfil, sin pantalla de email ni de código.
  - `Unirse` muestra "Código válido" con el campo vacío, y no hay estado de código erróneo o caducado.
- **Propuesta:** recalcular los pasos según el nuevo orden (A8). Añadir la pantalla de email con código de un solo uso y los estados de error del código.

### M19. El archivo `Mapa.dc.html` está duplicado
- El archivo contiene dos documentos concatenados (líneas 1–173 y 174–298).
- La segunda copia es antigua: no tiene lógica de estado ni el botón "+" en la vista lista.
- Según cómo lo resuelva el visor, puede verse la versión vieja.
- **Propuesta:** quitar la segunda copia antes de enseñar los mockups.

### M20. Añadir gasto: después de guardar y con el reparto mixto
- **Pantalla:** `AnadirGasto`.
- **Qué pasa:**
  - "Guardar gasto" lleva al detalle. Lo esperable es volver al origen con una confirmación breve.
  - Con el reparto mixto, elegir la categoría debería preseleccionar el pagador o reparto (Súper lleva a Bote).
  - Las filas Fecha, Hora y Aviso no parecen tocables, aquí ni en `NuevoEvento` y `NuevoProyecto`: les falta el chevrón.
- **Propuesta:** volver al origen y resaltar el gasto nuevo. Preseleccionar según el mapa de categorías de Ajustes. Usar una fila de campo con chevrón.

---

## Hallazgos de prioridad baja

### B1. Datos de ejemplo que no cuadran
- **`AnadirGasto`:** la fecha es "Hoy" (jueves 12) y el gasto está vinculado a "Plan: Cena del sábado". `DetalleGasto` dice "Sábado 7 nov".
- **`DetalleEvento`:** la cena de hoy en el Olivo propone exactamente 62,00 €, el mismo importe que la del sábado 7.
- **`Bote`:**
  - "Suscripciones 30,98 €" es Netflix más Spotify, que se cobran el 16 y el 19 de noviembre, es decir, en el futuro.
  - Excluye Internet (35 €, día 1, del bote).
- **La compra del súper de 54,30 €:** "pagada con el bote" en `Dinero` y "pagada con la tarjeta de María" en `Bote`.
- **El reparto proporcional (60/40)** aparece en `Bote`, mientras que el onboarding elige mixto y `AnadirGasto`, `DetalleViaje` y `DetalleProyecto` usan 50/50.
- **El saldo global de 23,40 €** no incluye Lisboa (+30) ni el regalo (−17,50). Ver A1.
- **La tarjeta de Lisboa** dice "4 planes", pero el itinerario tiene 9 elementos.

### B2. Las etiquetas de tipo no coinciden
- Inicio dice "Cobro" (texto `#6B5410`) y Calendario dice "Pago" (`#5C4A12`).
- La etiqueta "Viaje" es granate sólido en `Agenda` y granate suave en `Planificador`. El concepto dice granate suave.

### B3. La tarjeta de Lisboa en Inicio es amarilla
- El amarillo es el color de los pagos. Debería ser granate suave, como los viajes.

### B4. Títulos de sección con dos estilos
- Inicio usa Fraunces 20 px ("Esta semana") y el resto usa versalitas de 12 px.
- **Propuesta:** Fraunces solo para el título de pantalla y versalitas para las secciones.

### B5. Objetivos táctiles pequeños
- "Ver todos" en `Dinero` mide 28 px de alto.
- Los chips de filtro miden 36 px, frente a los 40 px de los formularios.
- Las celdas del mes miden 38 px de alto.
- **Propuesta:** subir todo a 44 px como mínimo, o ampliar el área táctil.

### B6. Textos de `Bienvenida` y `Pareja`
- Los enlaces de términos y privacidad apuntan a la propia pantalla.
- "Soy el primero" tiene género: mejor "Empiezo yo, invitaré a mi pareja".

### B7. Colores de los iconos en `Recurrentes`
- Netflix usa granate suave y Spotify amarillo, colores que en la paleta ya tienen significado.
- **Propuesta:** iconos neutros o el logotipo del servicio.

### B8. Detalles de `NuevoProyecto`
- La plantilla de reservas usa interruptores cuando deberían ser casillas.
- El color de portada ofrece granate y azul, que son colores de persona.
- El destino es texto libre, cuando podría usar Places.

### B9. Tres diseños de tarjeta en la misma lista
- En "Próximos" del `Planificador`, Lisboa, Marta y Navidad tienen tres diseños distintos.
- **Propuesta:** una sola tarjeta de proyecto, con o sin presupuesto.

### B10. Detalles de `Dinero`
- Se muestra la tarjeta del bote aunque el reparto sea 50/50 sin bote: debería ocultarse según el modelo.
- "Aportar" navega a `Bote` en vez de abrir directamente la hoja de aportación.

### B11. Notas de `DetalleEvento`
- "Reservado a nombre de **David**" resalta en granate un texto escrito por el usuario, como si fuera del sistema.
- **Propuesta:** no dar formato al contenido escrito por el usuario.

### B12. Fuente sin cargar
- Se usa la fuente DM Mono para el código de invitación, pero no se carga en `<helmet>`.
- **Propuesta:** cargarla o usar DM Sans con números tabulares.

---

## Funcionalidad que falta

### Imprescindible para el MVP
1. **Ajustes de pareja** (A3): perfil, color, reparto por defecto, porcentaje proporcional, mapa de categorías del modo mixto, aportación al bote, avisos, invitación, salir y borrar cuenta.
2. **Historial completo de gastos** con búsqueda, filtro por categoría y mes, y liquidaciones (A10, M5).
3. **Formularios de edición** (reutilizando los de creación) y **eliminar con confirmación** en gastos, planes, sitios, proyectos y recurrentes.
4. **Formulario y detalle de recurrente** (A4, M11).
5. **Estados de balance**: debes tú, estáis en paz, pareja aún no unida (M3, A8).
6. **Estados vacíos** de las cinco pestañas (M13).
7. **Bucle plan → gasto** con importe en línea, una tarjeta en Inicio y una notificación (A5).
8. **Notificaciones push mínimas**: cobro mañana, "¿quién pagó?" tras un plan y pareja unida.
9. **Selector de sitio guardado** para vincular desde formularios y proyectos (M9).
10. **Detalle de evento y de pago** (M7).
11. **Login con email** (código de un solo uso) y **errores del código de invitación** (M18).
12. **Compartir sin sitio detectado**: si `CompartirSitio` no reconoce el lugar, buscarlo a mano.
13. **Crear ideas** y **resumen de proyecto pasado** (M15, A7).
14. **Sin conexión, como mínimo**: mostrar los datos en caché en solo lectura, avisar con un banner "Sin conexión" y desactivar Guardar con un mensaje claro.

### Puede esperar
- Cola de escritura sin conexión (sobre todo para "Añadir gasto" en un restaurante sin cobertura).
- Búsqueda global entre secciones.
- Sunday check-in (el resumen semanal).
- Estadísticas y presupuestos mensuales por categoría.
- Listas: súper, equipaje y regalos.
- Importación desde Google Takeout.
- Feed de actividad ("María añadió un gasto") y notificaciones de cada cambio de la pareja.
- Reparto por importes exactos o porcentajes libres por gasto.
- Adjuntar reservas (PDF o enlace) a un viaje.
- Varias monedas.
- Widgets.
- Deshacer más allá de unos segundos.

---

## Patrones a unificar

Al montar el sistema de diseño en código, estos componentes deberían ser **uno solo**:

| Componente | Variantes que hay hoy | Propuesta |
|---|---|---|
| **Cabecera de pantalla apilada** | Círculo de 44 px con borde (`DetalleGasto`, `DetalleEvento`…) frente a chevrón suelto de 48 px (`Saldar`, `Bote`, `Recurrentes`); acciones a la derecha distintas en cada pantalla | `ScreenHeader`: Volver en círculo, título y acciones (Editar + "⋯") |
| **Cabecera de modal de creación** | Consistente en `AnadirGasto`, `NuevoEvento`, `GuardarSitio` y `NuevoProyecto`; CTAs "Guardar gasto / Guardar / Guardar en el mapa / Crear plan" | `ModalHeader` con X y un CTA fijo abajo, con texto "Guardar" |
| **Botón de crear** | FAB abajo, FAB sobre la ficha, "+" arriba | `Fab`, abajo a la derecha, en las cinco pestañas |
| **Tarjeta de balance** | Cinco variantes (A1, M3) | `BalanceCard` (te deben / debes / a cero; destacada / compacta) |
| **Resultado del reparto** ("María te deberá…") | `AnadirGasto`, `DetalleEvento`, `DetalleGasto`, `DetalleProyecto` con alturas y tonos parecidos pero no iguales | `DebtPill`, siempre con el color de quien debe |
| **Quién pagó** | Fichas de 68 px con avatar (`AnadirGasto`), fichas de 48 px sin avatar (`DetalleEvento`), chips (`NuevoEvento`), fichas rosas (`Bote`) | `PayerPicker`: Tú / Pareja / Bote, con avatar |
| **Cómo se reparte** | Cuatro juegos de opciones (M17) | `SplitPicker`, con las opciones que admita el modelo de Ajustes |
| **Quién va** | Chips en `NuevoEvento` y `NuevoProyecto` | `AttendeesPicker`: Los dos / Tú / Pareja |
| **Control segmentado** | Mes/Semana (34 px), Compartidos/Personales (40 px), Próximos/Ideas/Pasados (en rejilla, 40 px), pestañas del viaje, Mapa/Lista (iconos) | `Segmented`, de 40 px, con o sin iconos |
| **Chips de filtro y selección** | 36 px en filtros y 40 px en formularios; algunos con punto de color | `Chip` de 40 px; seleccionado en `#2A2627` |
| **Etiqueta de tipo** | "Cobro" frente a "Pago"; viaje sólido frente a suave | `TypeTag`, con una sola tabla de tipos, colores y textos |
| **Fila con fecha** (día + título + etiqueta) | "Esta semana" en `Main` y "Próximos" en `Agenda` | `DatedRow` |
| **Fila de gasto** | `Dinero`, `Saldar`, `DetalleSitio` (historial), `DetalleViaje`, `DetalleProyecto` | `ExpenseRow`: icono de categoría, concepto, quién pagó y reparto, importe |
| **Estado de sitio** | Quiero ir / Hemos ido / Reservado, con colores de persona | `PlaceStatus` con colores neutros (A9) |
| **Barra de progreso** | 8, 10 y 12 px; radio 4 o 999 (bote, viaje, proyecto, Navidad, onboarding) | `ProgressBar` (8 px, radio completo) |
| **Interruptor** | 52×32 y 46×26 (`Recurrentes`) | `Switch` 52×32 |
| **Fila de campo** (Fecha, Hora, Aviso) | Sin chevrón y sin aspecto de poder tocarse | `FieldRow` con valor y chevrón |
| **Vincular** | Chips en `AnadirGasto`; un campo de sitio suelto en `NuevoEvento`; nada en `GuardarSitio` | `LinkPicker`: Plan · Sitio · Proyecto (M8) |
| **"Cómo llegar"** | Granate principal (Mapa, `DetalleSitio`) o azul (`DetalleEvento`) | Un solo botón que abre el selector de app |
| **Hoja inferior** | Asa de 4 o 5 px; cerrar con X o tocando fuera | `BottomSheet` |
| **Avatar y pareja de avatares** | Tamaños de 20, 24, 28, 32, 36, 38, 44, 46 y 48 px | `Avatar` en 3 tamaños; el color sale del perfil, nunca escrito a mano como `#3F7099` |
| **Eliminar** | Texto granate al pie o en un menú | Dentro de "⋯", con confirmación |

---

## Decisiones para David y María

1. **Un único saldo** para todo, con los viajes y eventos como vistas filtradas (recomendado). La alternativa es saldar cada viaje por separado, lo que obliga a llevar varios libros de cuentas y a explicarlos (A1).
2. **El bote**: ¿cuenta con saldo acumulado (recomendado) o presupuesto mensual que vuelve a cero cada mes? (A2).
3. **Nombres**: aceptar "Proyecto" (con los tipos Viaje / Celebración / Otro) para el Planificador, y "Pago" como único nombre de los cobros (A6).
4. **Colores**: los colores de persona solo para personas (A9). Además, ¿se mantiene el granate entre los colores elegibles, siendo también el color de la marca? Quien lo elija "posee" los botones principales.
5. **Recurrentes personales** (el gimnasio): ¿los ve la pareja?
6. **Saldar**: ¿puede marcarlo cualquiera de los dos, avisando al otro (recomendado), o solo quien cobra?
7. **Al borrar** un sitio, plan o proyecto con gastos vinculados: los gastos se conservan y se desvinculan (recomendado), o se bloquea el borrado.
8. **Sin conexión en el MVP**: solo lectura con aviso (recomendado), o cola de gastos desde el primer día.
