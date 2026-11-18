# ito · Plan del Calendario

> Estado: **borrador para revisar con David** (17 nov 2026).
> Alcance, en tres fases:
> - **A · Ver**: pestaña Calendario con vista **Mes / Semana**, filtros **Todos / Eventos / Pagos**, día seleccionado, lista **Próximos** y pagos recurrentes (abren su recurrente o su gasto).
> - **B · Eventos**: **crear, editar y borrar** eventos (borrar con aprobación; en los repetidos, «solo este día» o «toda la serie»), **repetición**, todo el día u hora, **quién va**, **eventos secretos**, presupuesto, aviso (se guarda) y notas. Detalle del evento.
> - **C · «¿Quién pagó?»**: el bucle evento → gasto (revisión A5): hoja que crea el gasto enlazado al evento, tarjeta en Inicio y Gastos, y enlace gasto → evento.
>
> **Fuera**: avisos push (se guardan; llegarán con las notificaciones), **planes** del Planificador (filtro «Planes», «Añadir a un plan», bandas de viaje) y **sitio** del Mapa («Cómo llegar», «Ver sitio»): llegan con sus pestañas. También «editar solo este día» de un evento repetido, hora de fin, eventos de varios días, «repetir hasta», el resumen de la semana en Inicio y sincronizar con el calendario del móvil.
> Mockups: `Agenda`, `DetalleEvento` y `NuevoEvento` en [ito – Mockups](https://claude.ai/artifact/Ld49n1bZM5JJwyw6o4BbJU). Revisión: A5, A7, M6 y M7 de `docs/revision-diseno.md`.

---

## 1. Lo que ya hace la base de datos

| Pieza | Qué hace |
|---|---|
| `events` | `title`, `start_date` + `start_time` (null = todo el día), `all_day`, `recurrence` (`none` / `weekly` / `monthly` / `yearly`), `attendees` (`both` / `m1` / `m2`), `budget_cents`, `ask_who_paid` + `who_paid_resolved_at`, `reminder_minutes`, `notes`, `is_secret`, `place_id`, `plan_id`, `version`. CHECK: «¿Quién pagó?» solo en eventos que no se repiten; un secreto no va en un plan |
| `private.events_before_write` | Calcula `starts_at` / `ends_at` con `time_zone` (sin hora de fin: **+90 min**; todo el día: hasta las 24:00). Impide volver secreto un evento compartido (`TW051`) |
| `event_exceptions` | Fechas anuladas de un evento repetido (las crea un borrado aprobado de «solo este día») |
| `calendar_range(p_from, p_to)` | Une eventos (repeticiones expandidas, sin las fechas anuladas, sin los del itinerario de un plan), cobros de recurrentes (`scheduled` / `pending` / `paid`, «~» si es variable sin importe) y bandas de planes. `security invoker`: **la RLS oculta los secretos y los recurrentes privados de la pareja** |
| RLS de `events` | Los dos ven y editan los compartidos; un secreto solo lo ve y edita quien lo creó. Sin DELETE: se borra con `request_deletion('event', id, fecha?)` (el secreto, al momento) |
| `pending_actions` · `who_paid` | Eventos con `ask_who_paid`, sin resolver y ya terminados (`ends_at <= now()`) → tarjeta |
| `expenses.event_id` | Solo se enlaza un evento que ves (`TW060`). Al crear el gasto se marca `who_paid_resolved_at`. Si se borra el evento, el gasto guarda el título (no en gastos compartidos de un secreto) |
| Tiempo real | `events`, `event_exceptions` y `plans` ya están en la publicación; la RLS filtra por suscriptor |
| `leave_couple` | Borra los eventos secretos de quien sale |

**Lo que falta o falla en el servidor** (§5): los pagos del calendario no cuadran con el job, la zona horaria del evento la elige el cliente, cualquiera puede anular una fecha sin aprobación y `calendar_range` no devuelve lo que la pantalla necesita.

---

## 2. Pantallas

### Calendario (mockup `Agenda`) · fase A

1. **Cabecera**: «Calendario», periodo («Noviembre 2026» / «9 – 15 nov») con ‹ ›, **Hoy** (solo si no estás en el periodo actual) y el botón de añadir en el mismo sitio que en Gastos.
2. **Mes / Semana** (segmentado).
   - **Mes**: rejilla **de lunes a domingo**, con las semanas que hagan falta (4 a 6). Los días de otro mes salen atenuados y al tocarlos se cambia de mes. **Hoy** en granate, calculado en la **zona de la pareja** (`hoyISO`). Puntos por día: azul (evento), ámbar (pago); como mucho 3 y un «+». Candado pequeño si hay un secreto tuyo.
   - **Semana**: tira de 7 días y debajo **la lista de los 7 días** con sus elementos (los días vacíos, «Nada»), como propone M6.
   - Deslizar a los lados cambia de periodo (además de las flechas).
3. **Filtros**: Todos / Eventos / Pagos. Afectan a los puntos y a la lista. «Planes» no sale hasta que exista el Planificador (decisión 1).
4. **Tocar un día** lo selecciona y la lista pasa a ser **ese día** («Sábado 14»), con «Añadir evento» si está vacío. Tocarlo otra vez vuelve a **Próximos** (decisión 3).
5. **Próximos**: del mes visible, desde hoy hasta fin de mes si es el actual («Próximos»), el mes entero si es otro («En diciembre»). Sin corte a 4: hace scroll.
6. **Fila**: día de la semana y número, título, línea («21:30», «Todo el día · cada año», «12,99 € · bote común», «~48 € · a medias», «Solo va Meri») y etiqueta **Evento** / **Pago** / **Secreto · solo tú**. Si hay una solicitud de borrado: «Pendiente de borrar».
7. **Estado vacío** (sin nada en el mes): «Aún no hay nada en el calendario» + **Añadir evento**.
8. Al tocar:
   - **evento** → su detalle, con la fecha de esa repetición (`?fecha=`);
   - **pago pagado** → su gasto; **previsto o pendiente** → el recurrente (fase 4). Un variable pendiente ofrece también «Poner importe» (la hoja de la fase 4).

### Detalle de evento (mockup `DetalleEvento`) · fases B y C

1. Cabecera con volver y **Editar**. Si hay solicitud de borrado: banda «Pendiente de borrar · esperando a Meri» con **Retirar** (o, si la pidió Meri, **Aprobar / Rechazar**).
2. Título, «Hoy, jueves 12 · 21:30» / «Domingo 15 mar · todo el día», «Se repite cada año», quién va con avatares («Vais los dos», «Solo vas tú», «Solo va Meri»), «Secreto · solo lo ves tú».
3. **Sitio**: no sale hasta que exista el Mapa.
4. **«¿Quién pagó?»** (fase C, solo si el evento lo pregunta):
   - antes de terminar: «Presupuesto ~60 €. A partir de las 23:00 os preguntaremos quién pagó.» y **Ya hemos pagado**;
   - después: **¿Quién pagó?** y **No hubo gasto**;
   - resuelto: «Gasto guardado · Meri te debe 30,00 €» y **Ver gasto** (o «Sin gasto»).
   - Los eventos que no lo preguntan muestran sus gastos enlazados, si los hay, y **Añadir gasto**.
5. **Notas** (texto tal cual, sin formato: B11).
6. **Aviso**: «Aviso 1 hora antes · llegará cuando ito tenga notificaciones».
7. Secreto: **Revelar a Meri** → hoja «Meri lo verá. No se puede volver a ocultar.»
8. Pie: **Pedir borrar** (o **Borrar** si es secreto o estás solo) → hoja. En un evento repetido, primero «¿Qué quieres borrar?»: **Solo el 15 mar 2027** / **Toda la serie** (decisión 4). Texto: «Meri tendrá que aprobarlo. Si no responde en 7 días, el evento se queda. Los gastos se conservan.»

### Nuevo / editar evento (mockup `NuevoEvento`) · fase B

Página completa (modal a pantalla entera, como «Añadir gasto»). Al editar, el mismo formulario con «Editar evento».

- **Tipo**: Evento / Pago. **Pago** muestra «Los pagos se crean en Pagos recurrentes» y **Crear pago**, que abre el formulario de la fase 4 con el día elegido.
- **Título** (≤ 120).
- **Evento secreto** (solo al crear): «Solo lo verás tú. Ideal para sorpresas». Al activarlo, «Quién va» pasa a «Solo tú» (se puede cambiar).
- **Fecha** (el selector de fecha de Gastos, con fechas futuras: Hoy / Mañana / Otro día…), **Hora** o **Todo el día**. La hora se elige en una **hoja** (horas y minutos de 5 en 5), sin librerías nativas nuevas.
- **Repetir**: Nunca / Cada semana / Cada mes / Cada año. Texto debajo: «Cada año, el 15 de marzo»; el 31 → «o el último día del mes».
- **¿Quién va?**: Los dos / Solo tú / Solo {Pareja} (sin pareja unida, no sale).
- **Presupuesto (opcional)** y el interruptor **Preguntar «¿Quién pagó?» al terminar**, que se activa solo al poner presupuesto (decisión 5). No sale si se repite.
- **Aviso**: con hora → Sin aviso / A la hora / 1 hora antes / 1 día antes; todo el día → Sin aviso / El día antes (9:00) / Una semana antes (9:00). Nota: «Los avisos llegarán cuando ito tenga notificaciones» (decisión 7).
- **Notas**.
- **Guardar**. Al editar, control de versión como en los gastos: «Meri lo ha cambiado mientras tanto».
- Editar un evento repetido **cambia toda la serie** (decisión 4).

### «¿Quién pagó?» (hoja) · fase C

Una sola **hoja inferior** que se abre desde el detalle y desde la tarjeta de Inicio:

- **Importe**, precargado con el presupuesto.
- **Categoría** (chips, por defecto **Comer fuera**).
- **¿Quién pagó?** Tú / {Pareja} / Bote; **¿De quién es?** con los valores por defecto de la categoría (mixto, proporcional…) y el % personalizado; **resultado** («Meri te deberá 30,00 €»). Los mismos controles que «Añadir gasto» (§4).
- Concepto = título del evento; fecha = la del evento (o hoy, si aún no ha llegado).
- **Evento secreto**: por defecto «Pagaste tú · Solo tú · No visible para Meri». Si lo compartes: «Meri verá el gasto y su concepto, no el evento» (decisión 6).
- **Guardar gasto** → gasto con `event_id`; el servidor cierra la pregunta.
- **No hubo gasto** → `who_paid_resolved_at = now()`.
- Si los dos responden a la vez: el gasto usa **el id del evento** como id, así que el segundo recibe «Meri ya lo ha apuntado» en vez de crear un gasto doble.

### Inicio y Gastos · fase C

- Tarjeta «**¿Quién pagó Cena en Taberna El Olivo?** · ayer · ~60 €» → **Apuntar** (abre la hoja) / **No hubo gasto**. Sale en Inicio y en Gastos (`TarjetasPendientes`), solo a quien va (§5.5).
- Tarjeta de borrado de eventos: «Meri quiere borrar «Cumpleaños de Marta · 15/03/2027»» → Aprobar / Rechazar.
- **Arreglo de la fase 4**: la tarjeta de aprobar el borrado de un **pago recurrente** no sale en Inicio (`leerPendientes` solo admite gastos y movimientos del bote). Se añade junto con la de eventos (decisión 10).
- **Detalle de gasto**: «Evento: Cena en Taberna El Olivo», que abre el evento. Si ya no existe o es un secreto que no ves, el título guardado como texto, sin enlace.

---

## 3. Reglas que la app tiene que respetar

- **Fechas**: `start_date` y `start_time` son la hora de pared de la pareja. «Hoy», «ha pasado» y «a partir de las 23:00» se calculan con `couples.time_zone` (`fechaEnZona`) y con `ends_at` del servidor, nunca con la zona del móvil.
- **Secretos**: nunca en cachés compartidas ni en textos que vea la pareja. El tiempo real ya lo filtra la RLS; al revelarlo, a la pareja le llega como alta y recarga.
- **Tiempo real**: los DELETE no se pueden filtrar por pareja en Supabase y no llegan. No hace falta: los borrados compartidos pasan por `deletion_requests`, que sí llega; los secretos solo los borra quien los ve.
- La tarjeta «¿Quién pagó?» aparece por el paso del tiempo, sin ningún cambio en la base de datos: las pendientes se recargan al volver a la app (ya lo hace `focusManager`) y cada 5 minutos con Inicio abierto.
- `calendar_range` se pide por rejilla visible (≤ 42 días) y se precargan el periodo anterior y el siguiente.

---

## 4. Código

| Archivo | Qué |
|---|---|
| `lib/calendario/rejilla.ts` | **Con pruebas.** Semanas del mes empezando en lunes, semana de una fecha, mover mes/semana, etiquetas («Noviembre 2026», «28 dic – 3 ene») |
| `lib/calendario/agrupar.ts` | **Con pruebas.** Filas de `calendar_range` → por día; puntos (máx. 3 + «+»); filtros; «Próximos» (desde hoy hasta fin de mes); orden igual que el servidor (todo el día primero, luego hora y título); línea de cada fila |
| `lib/calendario/repeticion.ts` | **Con pruebas.** Copia de `private.occurrence_dates` (próxima fecha en el detalle cuando se abre sin `?fecha=`, p. ej. desde un gasto) y textos («Cada año, el 15 de marzo») |
| `lib/calendario/evento.ts` | **Con pruebas.** Formulario ↔ fila (todo el día limpia la hora; secreto → sin plan; repetición → sin «¿Quién pagó?»), opciones de aviso → `reminder_minutes`, fase del bloque «Después» (antes / después / resuelto), textos («Vais los dos», «Te avisaremos a las 20:30») |
| `lib/calendario/quienPago.ts` | **Con pruebas.** Valores iniciales del gasto desde un evento (importe, categoría, fecha = mín(evento, hoy), privado si es secreto) |
| `lib/calendario/consultas.ts` | `leerRango`, `leerEvento`, `gastosDelEvento`, `crearEvento` (id de la app, idempotente), `editarEvento` (versión y solo lo que cambia), `revelar`, `descartarQuienPago`, `pedirBorrarEvento(id, evento, fecha?)` |
| `lib/calendario/useCalendario.ts` | Hooks con clave `['calendario', coupleId, userId, …]` |
| `lib/gastos/useGastos.ts` | El canal escucha también `events`, `event_exceptions` y `plans`, y cualquier cambio invalida gastos **y** calendario |
| `lib/gastos/consultas.ts`, `lib/gastos/pendientes.ts` | Pendientes `who_paid` y borrados de `event` y `recurring_payment`; `COLUMNAS` con `event_id` y `event_title_snapshot`; `TipoBorrable` con `'event'` y `p_occurrence_date`; `leerSolicitudBorrado` distingue la serie de una fecha |
| `lib/gastos/fechas.ts` | `horaEnZona(instante)` («23:00» en la zona de la pareja) |
| `app/(tabs)/calendario.tsx` | Pantalla (sustituye al `PlaceholderScreen`) |
| `app/calendario/evento/[id].tsx`, `nuevo.tsx`, `editar/[id].tsx` | Detalle, nuevo y editar; registrados en `app/_layout.tsx` (nuevo y editar como modal a pantalla entera) |
| `components/calendario/` | `RejillaMes`, `TiraSemana`, `FiltrosTipo`, `FilaCalendario`, `ListaDias`, `FormularioEvento`, `SelectorHora` (hoja), `HojaQuienPago`, `HojaRevelar` |
| `components/gastos/ControlesReparto.tsx` | Quién pagó / de quién es / % / resultado / visible, sacado de `FormularioGasto` para usarlo también en `HojaQuienPago` |
| `components/gastos/BorrarGasto.tsx` | Tipo `'event'` con el paso «solo este día / toda la serie» |
| `components/gastos/SelectorFecha.tsx` | Opción `futuras` (Hoy / Mañana / Otro día) y la rejilla de `lib/calendario/rejilla.ts` |
| `components/inicio/TarjetasPendientes.tsx` | Tarjetas «¿Quién pagó?» y borrado de evento y de recurrente |
| `app/gastos/[id].tsx`, `components/gastos/FormularioRecurrente.tsx` | Enlace al evento; día precargado al venir de «Crear pago» |

---

## 5. Agujeros del servidor y migración `20261120000000_calendario.sql`

1. **Los pagos del calendario no cuadran con lo que cobra el job** (fase 4). `calendar_range` calcula las fechas con la configuración actual, así que:
   - si pausas Netflix, **desaparecen también sus cobros ya pagados**;
   - si cambias el día del 16 al 20 tras cobrar el 16, el 16 pagado desaparece y el 20 sale «previsto», aunque el job no volverá a cobrar ese mes;
   - al reanudar, los días de la pausa salen como «previstos» en el pasado.
   **Propuesta**: lo pasado sale de `recurring_occurrences` (lo que de verdad se cobró, menos los saltados, aunque el pago esté en pausa); lo futuro se calcula desde `greatest(p_from, hoy, active_from)`, solo si no está en pausa y sin repetir un periodo que ya tiene cobro. Se añade `occurrence_id` a la salida.
2. **`calendar_range` no devuelve lo que la pantalla necesita**: faltan `recurrence`, `attendees`, `is_secret` y `occurrence_id`. Cambiar las columnas obliga a `drop` + `create` (mismo `grant`). Además, **sin límite de rango**: con `2000-01-01 … 2100-01-01` expande miles de repeticiones por evento. Propuesta: `p_from <= p_to` y **como mucho 100 días** (nuevo `TW052`).
3. **La zona horaria del evento la pone el cliente** (`time_zone` por defecto `Europe/Madrid`). Escenario: una pareja en Canarias, o David de viaje con el móvil en otra zona → `starts_at` desplazado una o varias horas → «¿Quién pagó?» y los avisos a destiempo. Propuesta: `events_before_write` fija `time_zone` a la de la pareja al crear e ignora lo que mande el cliente; al editar se mantiene.
4. **Cualquiera puede anular una fecha sin aprobación**: `event_exceptions_all` deja insertar desde la API, así que se borra «el aniversario de este año» saltándose la aprobación. Con la decisión 4 (editar = toda la serie) el cliente no necesita escribir excepciones. Propuesta: solo lectura desde el cliente; las crea `execute_deletion` (`security definer`).
5. **`request_deletion` acepta cualquier `p_occurrence_date`**. Escenario: un evento que no se repite con fecha → se crea una excepción, el evento desaparece del calendario pero sigue existiendo (tarjeta «¿Quién pagó?», gastos enlazados) y nadie lo ha aprobado como borrado. Propuesta: con fecha, solo si el evento se repite y esa fecha es una de sus repeticiones (`TW060`). Mismo cuerpo que `20261117010000` salvo esa comprobación.
6. **«¿Quién pagó?» le llega a quien no fue**: `pending_actions` no mira `attendees`. Escenario: «Cena de Meri con amigas · Solo va Meri» → David recibe «¿Quién pagó?». Propuesta: `who_paid` solo si `attendees` es `both` o el hueco de quien mira.
7. **Comprobado, sin cambio**: RLS de eventos y secretos; `calendar_range` y `pending_actions` como `security invoker`; `TW060` impide enlazar el secreto de la pareja; el título del secreto no se copia en gastos compartidos. **No poner nunca `REPLICA IDENTITY FULL` en `events`**: los DELETE (que no pasan la RLS) llevarían el título de un secreto a la pareja.

---

## 6. Orden y comprobación

| Paso | Fase | Qué | Cómo se comprueba |
|---|---|---|---|
| 1 | A | `rejilla.ts`, `agrupar.ts`, `repeticion.ts` con pruebas | Nov 2026 empieza el 26 oct (6 semanas); feb 2027 son 4 semanas exactas; semana «28 dic – 3 ene»; mensual del 31 → 28/29 feb y 31 mar; anual del 29 feb → 28 feb; orden igual al del servidor |
| 2 | A | Migración (§5) | Pausar un recurrente ya cobrado → su cobro sigue en el calendario; rango de 200 días → `TW052`; insertar en `event_exceptions` desde la API → rechazado; `request_deletion` con fecha en un evento único → `TW060`; evento con `time_zone` falso → se guarda el de la pareja |
| 3 | A | Pantalla Calendario (mes, semana, filtros, día, Próximos) | Con los recurrentes de la fase 4 y un evento creado en SQL: puntos y lista correctos en las dos cuentas; «hoy» correcto a las 00:30 con el móvil en otra zona |
| 4 | B | `evento.ts` con pruebas; formulario, detalle y editar | David crea «Cumpleaños de Marta · 15 mar · todo el día · cada año» → Meri lo ve sin recargar, también en 2027. Editar la hora desde las dos cuentas a la vez → «Meri lo ha cambiado mientras tanto» |
| 5 | B | Borrar | Borrar «solo el 15 mar 2027» → Meri aprueba → desaparece ese año y sigue en 2028. «Toda la serie» → Meri rechaza → se queda |
| 6 | B | Secretos | David crea un secreto → Meri no lo ve en el calendario, ni en Próximos, ni en tiempo real. Revelarlo → le aparece. Volver a hacerlo secreto → no se puede |
| 7 | C | `quienPago.ts` con pruebas; hoja, tarjetas y enlace del gasto | Cena hoy a hora pasada con presupuesto 60 € → tarjeta en las dos cuentas → Meri apunta 62 € «pagué yo, a medias» → saldo +31 € y la tarjeta desaparece en las dos. Los dos a la vez → un solo gasto. «Solo va Meri» → David no ve la tarjeta. «No hubo gasto» → desaparece |
| 8 | C | Secreto + gasto | Gasto privado de un secreto → Meri no ve nada; compartido → Meri ve el gasto y su efecto en el saldo, pero el detalle no enlaza al evento |
| 9 | — | Revisión del arquitecto | RLS, secretos, zona horaria, rango, pagos |

Para probar los pagos sin esperar: `select private.run_daily_jobs();` en el SQL Editor.

---

## 7. Decisiones que solo puede tomar David

1. **Planes y sitios, fuera hasta que existan Planificador y Mapa**: sin filtro «Planes», sin «Añadir a un plan» y sin fila «Sitio» (no se deja nada desactivado a medias). Solo Eventos y Pagos. (Recomendado: sí.)
2. **Las tres fases (A, B y C) en esta ronda**, en ese orden, con «¿Quién pagó?» incluida: es lo que diferencia a ito. (Recomendado: sí.)
3. **Tocar un día** filtra la lista a ese día y tocarlo otra vez vuelve a «Próximos»; la **semana** es una lista de 7 días. (Recomendado: sí, como propone M6.)
4. **Repetidos**: editar cambia **toda la serie**; borrar pregunta «solo este día» o «toda la serie», con aprobación. (Recomendado: sí. La alternativa, «editar solo este día», necesita crear un evento suelto y una excepción a la vez; mejor más adelante.)
5. **«¿Quién pagó?»**: interruptor en el formulario que se activa solo al poner presupuesto; se responde en una **hoja inferior** (desde el detalle y desde Inicio) con «No hubo gasto» para descartar, y solo se pregunta a quien va. (Recomendado: sí.)
6. **Gasto de un evento secreto**: privado por defecto («Pagaste tú · Solo tú»); si lo compartes, aviso de que Meri verá el concepto. (Recomendado: sí.)
7. **Avisos**: guardarlos ya con la nota «Llegarán cuando ito tenga notificaciones». Con hora: a la hora, 1 hora o 1 día antes; todo el día: el día antes o una semana antes, a las 9:00. (Recomendado: sí, como en la fase 4.)
8. **Pagos en el calendario**: los pasados, solo lo que de verdad se cobró; los futuros, previstos. Un pago **pagado** abre su gasto y uno **previsto** abre el recurrente. (Recomendado: sí.)
9. **Migración** `20261120000000_calendario.sql` con los puntos 1–6 de §5. (Recomendado: sí.)
10. **Arreglar de paso** la tarjeta de Inicio para aprobar el borrado de un pago recurrente, que ahora no sale. (Recomendado: sí.)
11. **Revisión del arquitecto** al terminar. (Recomendado: sí.)
