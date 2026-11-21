# Plan · Pestaña Planificador

> 2026-11-20 · Parte de `docs/concepto.md` (§Planificador), `docs/especificacion-correcciones.md` (§1 Planificador y §2,
> **manda**) y `docs/modelo-datos.md` (§3, §4, §6, §7, §8). Mockups: Planificador, NuevoProyecto, DetalleProyecto y
> DetalleViaje (ronda 2). **Casi todo el esquema ya existe**: este plan añade cuatro migraciones pequeñas (M1–M4) y la app.
> Terminología (espec. §2): todo lo del Planificador es un **plan** (Viaje, Celebración, Otro); nunca «proyecto».

## 1. Visión y alcance

**Un plan es un contenedor con fechas** (escapada, cumpleaños, Navidad, mudanza) que agrupa tareas y reservas,
presupuesto, gastos, itinerario por días y sitios. En Gastos cuenta como **un gasto agrupado**; en el calendario es una
**banda** con su icono; en el mapa, una **colección** con su icono.

**MVP (F1–F5)**
- Lista con **Próximos** (en curso y futuros, con cuenta atrás, tipo, presupuesto y chips de tareas).
- Crear y editar: tipo, icono (emoji), nombre, destino (solo viajes), fechas, quién va, presupuesto opcional, «¿Cómo
  se paga?» (reparto por defecto de sus gastos) y plantilla de tareas/reservas al crear.
- Detalle: cabecera, tareas y reservas asignadas, presupuesto con barra, notas, **gastos del plan**, saldo del plan
  con **«Saldar solo esto»**, «Añadir gasto al plan» y **pedir borrar** (aprobación de la pareja).
- Calendario: bandas de los planes, filtro «Planes»; Inicio: «Próximo plan» enlaza al detalle.

**Después (F6–F10)**: itinerario por días (eventos con `plan_id`), sitios del plan, ideas y «Convertir en plan»,
reservas enlazadas al itinerario, Pasados con «Ver resumen».

**Fuera** (que no se cuele): planes privados o sorpresa (decisión 1), color de portada (se guarda `granate`; el
selector no se pinta), «Saldo del plan» separado del global (no existe: un plan es parte del saldo global), listas de
equipaje, plantillas editables, reordenar tareas arrastrando, compartir un plan fuera de la pareja, varias monedas,
avisos push (encaje en §6, se hacen con Apple Developer).

## 2. Qué existe ya en la base de datos

| Objeto | Estado |
|---|---|
| `plans` | Completa: `type`, `name` (1–80), `icon` (1–16), `cover`, `destination`, `start_date`/`end_date` (obligatorias), `attendees`, `budget_cents` (> 0 o null), `default_split_mode` (`half`/`proportional`/`custom`/`pot`) + `default_split_pct_m1`, `notes`, `version`. RLS: select/insert/update de la pareja; **sin DELETE** (solo `request_deletion`). Realtime: sí |
| Colección automática | Trigger `plans_sync_collection`: al crear el plan crea su colección (visible, mismo icono, nombre a 60) y la sincroniza al editar. `TW061` impide borrarla sola. Al borrar el plan queda como colección normal |
| `plan_tasks` | Completa: `kind` (`task`/`booking`), `title`, `detail`, `assignee` (`m1`/`m2`/null), `status` (`pending`/`done`; `done_at`/`done_by` por trigger), `due_date`, `estimated_cents`, `place_id`, `event_id`, `expense_id`, `position`. RLS `for all` de la pareja (borrado directo). Realtime: sí |
| `ideas` | Completa: `title`, `icon`, `type`, `place_id`, `notes`. RLS `for all`. Realtime: sí |
| `events.plan_id` | Itinerario = eventos con `plan_id` (cascada al borrar el plan), `time_slot` (mañana/tarde/noche), `position`; un secreto no puede ir en un plan (CHECK). `reserved` + `reservation_note` en `20261129000000_visitas_y_reserva.sql` |
| `expenses.plan_id` | FK `on delete set null` + `plan_name_snapshot`/`plan_icon_snapshot` (trigger al borrar). Un gasto de un evento del plan hereda `plan_id` (trigger) |
| `plan_summaries` | Vista `security_invoker`: `expense_count`, `spent_cents`, `open_m2_owes_m1_cents`, `pending_estimate_cents` |
| `calendar_range` | Devuelve `kind = 'plan'` (banda con `icon`) y, desde `20261203000000_calendario_itinerario.sql`, también los eventos con `plan_id` (`kind = 'event'`; antes los excluía) |
| Borrar | `request_deletion(id, 'plan', …)`: siempre con aprobación (salvo pareja sin unir); etiqueta «✈️ Escapada a Lisboa». Borra itinerario y tareas; conserva gastos (snapshot) y sitios |
| Saldar | `create_settlement(id, expense_ids[], method, expected)` ya admite cualquier lista: «Saldar solo esto» = los gastos abiertos del plan. Neto 0 → confirmada sola |

**Lo que falta en la app**: todo (la pestaña es `PlaceholderScreen`). Gastos no lee `plan_id`; `lib/calendario/agrupar.ts:161`
descarta los planes; `BORRABLES_EN_TARJETA` (Inicio) no incluye `plan`; `lib/inicio/consultas.ts:6` lee solo el
primer plan y `proximoPlanMultidia` lo descarta si es de un día (con un cumpleaños antes de un viaje, **el viaje no
sale nunca**: se corrige en F5).

**Huecos de seguridad y dinero** (los cierra F1):
1. **Totales distintos para cada uno**: `plan_summaries` es `security_invoker`; un gasto **privado** con `plan_id` lo
   suma solo su dueño (`spent_cents`, `expense_count`). Y el trigger de gastos copia `plan_id` de un evento del plan
   también a gastos privados.
2. `plan_tasks.place_id` e `ideas.place_id` sin `TW064` (pendiente en `docs/estado.md`): se puede enlazar el sitio
   privado de la pareja conociendo su id.
3. `plan_tasks.event_id`/`expense_id` sin comprobar: se puede enlazar un evento secreto o un gasto privado de la
   pareja, o uno de otro plan.
4. `plans` admite `custom` sin porcentaje y `pot` con el bote desactivado (el gasto fallaría después con `TW012`), y
   no limita la duración.

## 3. Modelo de datos: migraciones

Formato de siempre: parte A en transacción e idempotente, parte B de pruebas que acaba en `ROLLBACK`. Cada función se
reescribe **partiendo de su última definición** (`grep -n "function private.expenses_before_write" supabase/migrations/*.sql`
→ `20261126000000_mapa.sql`; `request_deletion` → `20261128000000_colecciones_borrado.sql`) y comparándola antes con
`pg_get_functiondef` de producción. **Requiere `20261129000000_visitas_y_reserva.sql` aplicada** (la app ya lee
`reserved` en `COLUMNAS_EVENTO`).

### M1 · `20261130000000_planificador_base.sql` (F1, revisa el arquitecto)

0. Requisito: `to_regclass('public.place_visits')` no null. Comprobaciones previas (deben dar 0; si no, parar):
   `select count(*) from expenses where plan_id is not null and not visible_to_partner;`
   `select count(*) from plans where end_date - start_date > 59 or (default_split_mode = 'custom' and default_split_pct_m1 is null);`
1. **Gastos de un plan, siempre compartidos** (decisión 4):
   - `alter table expenses add constraint expenses_plan_compartido check (plan_id is null or visible_to_partner);`
   - `private.expenses_before_write`: si `plan_id` no es null y `not visible_to_partner` → `TW066` «Un gasto de un
     plan lo veis los dos» (antes del CHECK, para dar un código traducible). La herencia de `plan_id` desde el evento
     solo se hace si el gasto es visible (un gasto privado de un evento del plan se queda fuera del plan; si después se hace visible, entra).
   - Con esto `plan_summaries` da **el mismo número a los dos** sin tocar la vista.
2. **`plans`**: `check (end_date - start_date <= 59)` (constraint `plans_duracion`: 60 días contando los dos extremos, como `duracionPlan` en la app); `check (default_split_mode <> 'custom'
   or default_split_pct_m1 is not null)`; trigger `b_rules` → `private.plans_before_write()` (invoker): `half` →
   `pct = 50`; `pot` al crearlo o cambiarlo exige `pot_enabled` (`TW012`, como `recurring_before_write`).
3. **`private.plan_tasks_before_write`** (sigue invoker, así el `exists` aplica la RLS de quien escribe), solo si
   `private.is_client_write()` y el campo se pone o cambia:
   - `place_id`: el sitio se ve (`TW064`).
   - `event_id`: existe, se ve y `e.plan_id = new.plan_id` (`TW060`).
   - `expense_id`: existe, se ve y `x.plan_id = new.plan_id` (`TW060`).
   - En `UPDATE`, `plan_id` no cambia (`new.plan_id := old.plan_id`).
4. **`ideas`**: trigger `b_rules` → `private.ideas_before_write()` con la misma regla de `place_id` (`TW064`).
5. `revoke all … from public, anon, authenticated` de las funciones nuevas (como `20261126000000_mapa.sql:229`).
6. **Pruebas (parte B)**: gasto privado con `plan_id` → `TW066`; gasto privado de un evento del plan → sin `plan_id`;
   gasto compartido de un evento del plan → hereda `plan_id`; David y María ven el mismo `spent_cents`; plan de 61
   días → `23514`; `custom` sin % → `23514`; `pot` con bote apagado → `TW012`; tarea con sitio privado de la pareja →
   `TW064`; tarea con evento de otro plan o secreto → `TW060`; tarea con gasto privado de la pareja → `TW060`; idea
   con sitio privado de la pareja → `TW064`; `request_deletion` de un plan → `pending`; aprobarlo borra eventos y
   tareas, deja gastos con `plan_name_snapshot` y la colección con `plan_id` null.

### M2 · `supabase/migrations/20261201000000_itinerario.sql` (F6, revisa el arquitecto; escrita, sin aplicar)

El «Contrato para la app» completo está en la cabecera de la migración.

1. `events`: CHECK `events_plan_sin_repetir` (`plan_id is null or recurrence = 'none'`). Previa en el paso 0 (= 0).
2. **Elemento dentro de las fechas del plan** (`TW067`, en `events_before_write`, bloque `[Planificador F6]`): solo
   desde la app y al crearlo o al cambiarle `start_date` o `end_date`. **`plan_id` solo se fija al crear** (`TW069`
   desde la app: un evento no entra en un plan, no sale ni pasa a otro; mandar el mismo `plan_id` no da error), para
   que el borrado sin aprobación del punto 5 no sirva para borrar un evento suelto compartido metiéndolo en un plan. Editar otra cosa de un elemento que
   ya está fuera (plan movido sin su itinerario) funciona; «Mover» a un día del plan, también; a otro día fuera, no.
3. **Mover el plan de fechas** sin aprobación: `public.move_plan(p_plan_id, p_start, p_end, p_version, p_shift)
   returns jsonb {version, moved, outside}` (**security definer**, comprueba la pareja; `grant` a `authenticated`).
   Versión distinta → `TW068`; no existe → `TW060`; fechas no válidas → `23514`. Con `p_shift` desplaza TODOS los
   elementos (también los que ya estaban fuera) `p_start - inicio anterior` días; la hora local, la franja y «todo el
   día» se conservan (zona del evento, cambio de hora incluido). Si el plan se acorta, lo que cae después del fin queda
   fuera (`outside`; la pestaña Días lo enseña en «Fuera de las fechas del plan»). Por eso es definer y no invoker:
   como invoker, el `TW067` del punto 2 impediría acortar un plan con elementos al final. Los gastos no se mueven.
   Las fechas de un plan, solo por `move_plan` cuando cambian (un update directo equivale a `p_shift = false`).
4. **Sitios del plan a su colección**: trigger `y_plan_collection` (after insert / update of `place_id`[, `plan_id`])
   en `events` con `plan_id` y en `plan_tasks` → `private.plan_place_to_collection()` (invoker: la RLS de
   `collection_places` decide; `added_by` = quien escribe). Solo si el sitio o el plan cambian (no vuelve a meter un
   sitio quitado a mano); un sitio que quien escribe no ve no entra y no da error. **Nunca saca** un sitio de la
   colección (ni al quitarlo del elemento, ni al borrarlo, ni al mover el plan): la colección también tiene sitios
   añadidos a mano que no se distinguen y es la lista de la pestaña Sitios y del resumen (F10). Relleno de lo existente.
5. **Borrar un elemento del itinerario sin aprobación** (decisión 2): `request_deletion`, rama `event`:
   `v_free := e.is_secret or e.plan_id is not null` (copia de producción, una línea). Su gasto se queda en el plan con
   `event_title_snapshot`. Suelto compartido y plan entero siguen pidiendo aprobación.
6. Pruebas (parte B, «PRUEBAS DE ITINERARIO (F6): todas correctas»): fechas dentro/fuera (`TW067`), cambiar de
   plan, sacarlo o meter un suelto (también Beto con el de Ana) → `TW069`, editar título, día y sitio sí; repetido →
   `23514`, colección (una vez, quitado a mano no vuelve, sitio privado de la pareja sin error, `TW064`), `move_plan`
   con y sin itinerario, acortando, versión vieja, sin pareja, cruzando el cambio de hora; borrar elemento → `deleted`,
   suelto → `pending`, plan → `pending`. Cadena completa en PGlite: todas las partes B anteriores siguen en verde y la
   migración se puede ejecutar dos veces.

### M3 · `supabase/migrations/20261202000000_reservas_plan.sql` (F9, revisa el arquitecto; escrita, sin aplicar)

El «Contrato para la app» completo está en la cabecera de la migración.

1. **Una reserva por elemento**: índice único parcial `plan_tasks_una_reserva_por_evento` (`event_id` where
   `kind = 'booking'`) y, desde la app, `TW072` en `plan_tasks_before_write` (bloque `[Planificador F9]`).
2. **Sincronización en los dos sentidos** (cambia lo previsto: antes era solo tarea → evento): reserva hecha ⇔
   elemento reservado. Triggers `y_booking_event` (after insert/update of `status, event_id, kind` en `plan_tasks`) y
   `y_booking_tasks` (after update of `reserved` en `events`, solo si cambia), invoker; cada lado escribe solo si el
   otro es distinto, así el rebote da 0 filas (sin bucles). Desmarcar desde la reserva pone `reservation_note = null`
   (regla de la app); marcar no toca la nota. Así «Marcar como reservado» del detalle y el formulario del evento
   siguen sirviendo y no hace falta ocultar «Reservado».
3. **Al enlazar gana «hecho»**: elemento ya reservado → la reserva nace hecha; reserva hecha → el elemento queda
   reservado. Desenlazar, borrar la reserva o pasarla a tarea no desmarca el elemento.
4. Pruebas (parte B, «PRUEBAS DE RESERVAS DEL PLAN (F9): todas correctas»): los dos sentidos, nota, versión del
   evento (+1 por cambio, formulario viejo → 0 filas), enlazar, `TW072`, `TW060`, tarea normal sin sincronizar,
   desenlazar, borrar reserva y elemento, sin pareja, escritura del servidor.

### M4 · `supabase/migrations/20261203000000_calendario_itinerario.sql` (revisa el arquitecto; escrita, sin aplicar)

- `calendar_range` (create or replace, misma firma, columnas, orden y permisos): solo quita `and e.plan_id is null`.
  Ya devolvía `plan_id`: sin columnas nuevas. Pruebas: elementos una vez (también si empiezan antes del rango), banda,
  repetidos con fecha anulada, cumpleaños, varios días, secreto, pagos previstos = `planned_payment_dates`, la pareja
  los ve, otra pareja y alguien sin pareja no.

### Dinero: cómo cuenta un plan (sin cambiar `get_balance` ni `create_settlement`)

- **Saldo global**: ya incluye los gastos del plan (son gastos normales). No hay saldo por plan guardado.
- **Saldo del plan** (cliente, `lib/gastos/planes.ts`): suma de `efectoDe(yo, g)` de los gastos del plan con
  `settlement_id = null`; los que están en una liquidación pendiente se muestran aparte («Pendiente de confirmar»).
  Misma función que `HojaSaldar` (no se usa `open_m2_owes_m1_cents`, que mezcla los pendientes de confirmar).
- **«Saldar solo esto»** = `HojaSaldar` con `plan` como filtro y todos sus saldables marcados; envía los ids y el
  `p_expected_cents` de siempre (si la pareja añade un gasto entretanto, `TW020` y se recarga).
- **Presupuesto**: `spent_cents` de `plan_summaries` (incluye lo pagado por el bote). Barra = `min(100, gastado/presupuesto)`;
  pasado de presupuesto → barra llena en `accentDark` y «Os habéis pasado 40 €».
- **Reparto por defecto** al añadir un gasto desde el plan: `default_split_mode` (+ `pct`; proporcional sin `pct` usa el
  de la pareja); `pot` solo si el bote sigue activo (si no, a medias). Quién pagó: tú.

## 4. Conexiones

**Calendario** (F5, sin migración)
- `aElementos` deja de descartar `kind = 'plan'`: tipo de elemento `plan` con `emoji`, `inicio`, `fin`.
- Mes y Semana: banda **granate suave `accentSoft` con borde `accent`** (`docs/plan-calendario-v2.md` §2.2, decisión 10)
  y el emoji al inicio, en los mismos carriles que las barras de varios días; un plan de un día, chip con su emoji.
- Lista y día seleccionado: fila «✈️ Escapada a Lisboa · Día 2 de 4» con etiqueta «Plan»; toque →
  `/planificador/<id>` (con `?dia=<fecha>` cuando exista el itinerario).
- Filtro «Planes» en `lib/calendario/filtros.ts`. **Cambio (David, 21 nov)**: los elementos del itinerario también
  salen en el calendario como eventos normales (hora, icono por categoría, sitio) además de la banda: M4
  (`20261203000000_calendario_itinerario.sql`). Fila `kind = 'event'` con `plan_id` no null; `FilaRango` debe declarar
  `plan_id`; la franja (`time_slot`) y `reserved` no vienen en `calendar_range` (leerlos de `events` por id si hacen falta).
- **Crear eventos desde el plan** (F6): `/calendario/nuevo?plan=<id>&fecha=<d>` → `FormularioEvento` en modo plan:
  envía `plan_id`; fecha limitada a las del plan; sin secreto, sin repetir, sin cumpleaños; «Cuándo» = hora, franja
  (Mañana/Tarde/Noche → `time_slot`) o todo el día; quién va precargado del plan; sitio y reserva como siempre.

**Gastos** (F4)
- `COLUMNAS` de `lib/gastos/consultas.ts` añade `plan_id, plan_name_snapshot, plan_icon_snapshot`.
- `FormularioGasto`: fila **«Plan»** (`components/planificador/CampoPlan.tsx`: hoja con planes en curso, próximos y de
  los últimos 60 días) y parámetro `?plan=<id>` («Añadir gasto al plan»). Con plan, desaparece «Visible para…».
- Detalle de gasto: fila «Plan: ✈️ Escapada a Lisboa» que abre el plan (o el snapshot en gris si se borró).
- **Agrupación** (decisión 3): en `HojaSaldar` los gastos de un plan son **una fila** («✈️ Escapada a Lisboa · 2
  gastos · +30,00 €») con una casilla que marca o desmarca todos; en Últimos e Historial siguen siendo filas sueltas
  con la línea «✈️ Escapada a Lisboa» (la paginación por fecha y los totales por categoría no se pueden agrupar sin
  descuadrarse).

**Mapa** (F7)
- Pestaña «Sitios» del plan: sitios de su colección (`collections.plan_id = id`) con `FilaSitio`; «Ver en el mapa» →
  `/mapa/coleccion/<id>` (ya existe, con Lista/Mapa); «+ Guardar sitio en <destino>» → `HojaAnadirSitios` de esa
  colección o `/mapa/nuevo` con la colección preseleccionada (nuevo parámetro `coleccion`).
- Ficha de sitio: si el sitio está en la colección de un plan que no ha terminado, «Planear aquí» ofrece también
  «Añadir al itinerario de ✈️ Lisboa» (→ formulario en modo plan con el sitio).

**Inicio** (F5): «Próximo plan» = el siguiente plan del Planificador **de cualquier duración** (si no hay, el primer
evento de varios días, como hoy); enlaza a `/planificador/<id>`. Tarjeta de borrado pendiente de un plan (añadir
`'plan'` a `BORRABLES_EN_TARJETA` y su enlace).

## 5. UI

### 5.1 Pantallas

| Qué | Dónde |
|---|---|
| Lista (Próximos / Ideas / Pasados) | `app/(tabs)/planificador.tsx`: `CabeceraPestana` «Planificador» con «+» (Nuevo plan; en Ideas, «+ Idea»); segmentado de `OpcionRadio` |
| Nuevo / editar plan | `app/planificador/nuevo.tsx` y `app/planificador/[id]/editar.tsx` (`fullScreenModal`, pie fijo «Crear plan» / «Guardar») con `components/planificador/FormularioPlan.tsx`; `?idea=<id>` precarga desde una idea |
| Detalle | `app/planificador/[id]/index.tsx`. MVP: una sola columna (Resumen + Gastos). Desde F6: segmentado **[Resumen · Días · Gastos · Sitios]**; «Días» solo si dura 2+ días (en un plan de un día, sus elementos salen en Resumen como «Ese día») |
| Resumen de un pasado | `app/planificador/[id]/resumen.tsx` (F10) |
| Tarea / reserva (crear, editar) | `Hoja`: título, tarea o reserva, asignada (Tú / pareja / sin asignar, chips con color de persona), fecha opcional, estimado (reservas), sitio (`CampoSitio`), nota |
| Idea (crear, editar) | `Hoja`: icono, título, tipo, sitio, notas |
| Mover elemento del itinerario de día | `Hoja` con los días del plan («Mover a») |
| Pedir borrar plan, borrar tarea/idea | `HojaConfirmar` (texto del mockup: «Se borrará el plan y su itinerario; sus gastos y sitios se conservarán. {pareja} tendrá que aprobarlo. Si no responde en 7 días, el plan se queda.») |
| Saldar solo esto | `HojaSaldar` con prop `plan` |

Registrar las rutas en `app/_layout.tsx` como las de `mapa/*`. Navegar siempre al detalle del elemento (espec. §4).

### 5.2 Componentes (`components/planificador/`)

- `TarjetaPlan`: `EmojiIcono` en baldosa, nombre, fechas («Sáb 5 – mar 8 de diciembre · 4 días»), cuenta atrás
  («En 23 días», «Mañana», «Hoy», «Día 2 de 4»), chip de tipo en gris neutro, `BarraPresupuesto` o «Sin presupuesto»,
  hasta 2 chips de tareas (hechas con check granate; la siguiente pendiente tuya «Reservar cena — Tú» con tu tinta) y,
  desde F7, «6 sitios». Toda la tarjeta abre el detalle.
- `BarraPresupuesto`: «312 € de 900 €», «Quedan 588 €», barra `accent` sobre `surface`.
- `ListaTareas` + `FilaTarea`: casilla circular 26 px (hecha: relleno `accent`, título tachado `textSecondary`),
  «Asignada · María» / «Hecho por ti» con el nombre en su tinta, «1 de 3 hechas» en la cabecera, «+ Añadir tarea».
  Reservas: botón «Reservar» → marca hecha (F9: pide la nota de reserva).
- `CampoPlan` (formularios de gasto y evento), `SaldoPlan` (avatar + frase + importe + «Saldar solo esto»: extender
  `TarjetaSaldo` con una prop `importe` en vez de duplicarla, espec. §4 «mismo componente»).
- Selector de icono: **extraer** el de `components/mapa/FormularioColeccion.tsx` a `components/mapa/SelectorIcono.tsx`
  (12 sugeridos + «Otro…» con el teclado) y usarlo en los dos; sugeridos por tipo (✈️ 🏖️ 🏔️ 🎂 🎄 🎉 💍 🍷 🏠 📦 🎭 ⭐).
- Reutilizar: `Hoja`, `HojaConfirmar`, `SelectorFecha`, `ControlesReparto` (¿Cómo se paga?), `CampoSitio`, `FilaGasto`,
  `FilaSitio`, `OpcionRadio`, `CargandoHilo`, colores de persona de `lib/gastos/personas.ts`.

### 5.3 Estados

- **Vacío**: Próximos «Aún no tenéis planes» + «Crear un plan» (y «Ver ideas» si hay); Ideas «Apuntad lo que os
  apetezca hacer algún día» + «+ Idea»; Pasados «Cuando termine un plan aparecerá aquí con lo que gastasteis».
- **Carga**: `CargandoHilo`. **Error**: frase + «Reintentar» (como Mapa); errores de escritura en la hoja/formulario.
- **Pendiente de borrar**: banda en el detalle («Pendiente de borrar · esperando a María» + «Retirar solicitud» si es
  tuya; si es de la pareja, «Aprobar / Rechazar» como en Inicio); el plan sigue editable.
- **Conflicto** (`version`): 0 filas → recargar y avisar «{pareja} lo ha cambiado». Marcar tareas: sin `version`
  (última escritura gana; es una casilla).

### 5.4 Accesibilidad

- Tarjeta: una etiqueta «Escapada a Lisboa, viaje, del 5 al 8 de diciembre, en 23 días, 312 de 900 euros gastados,
  2 tareas pendientes» (función pura en `lib/planificador/plan.ts`); el emoji, oculto al lector.
- Barra: `accessibilityRole="progressbar"` con `accessibilityValue {min:0,max:100,now}`.
- Tarea: `accessibilityRole="checkbox"` y `accessibilityState={{ checked }}`; «Reservar cena, asignada a ti, pendiente».
- Segmentados con `tablist`/`tab` y `selected`; objetivos ≥ 44 px; Dynamic Type en lista y detalle.

## 6. Avisos push (encaje; no se implementan ahora)

Nueva preferencia `couple_members.notify_plans` («Planes» en Ajustes → Avisos) y en `enqueue_scheduled` /
triggers, con las reglas de `docs/plan-avisos-push.md` §4:

| Aviso | Cuándo · a quién | Clave | URL |
|---|---|---|---|
| «Mañana empieza ✈️ Escapada a Lisboa» | Víspera 9:00 · `attendees` | `plan_start:<id>:<start_date>` | `/planificador/<id>` |
| «Hoy: Reservar cena (🎂 Cumpleaños de Marta)» | `due_date` 9:00 · asignada (sin asignar: los dos) | `task_due:<id>:<due_date>` | ídem |
| «María te ha asignado Comprar tarta» | Al asignar (trigger) · la persona asignada, si no es quien asigna | `task_assigned:<id>:<assignee>` | ídem |
| «Falta reservar Seguro de viaje · Lisboa en 7 días» | 7 días antes del plan 9:00, si hay reservas pendientes · `attendees` | `plan_bookings:<id>:<start_date>` | ídem |

- Los elementos del itinerario ya avisan como eventos (`reminder_minutes`). Pedir borrar un plan ya avisa por
  `notify_requests`. Añadir `/planificador/<id>` a `lib/avisos/rutas.ts`. Todo lo del plan es compartido: no hay
  secretos que filtrar (decisión 1).

## 7. Fases

Cada fase: `npm run typecheck`, `npm run lint` y `npm test` en verde. Tests de lógica pura en
`lib/planificador/__tests__/` (y `lib/gastos/__tests__/`, `lib/calendario/__tests__/`, `lib/inicio/__tests__/`).
Todo funciona en **Expo Go** (sin dependencias nativas nuevas).

**F1 · Migración M1** (§3) — Entrega: SQL con parte B. **Revisa el arquitecto** (dinero, RLS). David da el sí y se
aplica. En paralelo con F2 y F3 (no la necesitan); F4 y F8 sí.

**F2 · Lista y crear/editar (MVP, sin dinero)**
- `lib/planificador/tipos.ts`, `plan.ts` (tipos con etiqueta/emoji/ayuda, validación: nombre 1–80, icono con
  `primerEmoji`, fin ≥ inicio, ≤ 60 días, presupuesto > 0; fila a insertar/editar; sección próximo/en curso/pasado con
  el «hoy» local; textos de fechas y cuenta atrás; presupuesto; etiqueta accesible), `consultas.ts` (`plans` +
  `plan_summaries` en dos consultas y unión en cliente; insert con `id` del cliente; update con `.eq('version')`),
  `usePlanificador.ts` (React Query `['planificador', coupleId, …]`), `error.ts`.
- `useTiempoRealPlanificador` (`plan_tasks`, `ideas`) montado en `app/(tabs)/_layout.tsx`; los cambios de `plans` y
  `events` que ya escucha `useGastos` invalidan también `['planificador']`.
- Pantallas: lista (solo Próximos con contenido; Ideas y Pasados vacíos hasta F8/F10), nuevo, editar, detalle mínimo
  (cabecera con «Editar», fechas, quién va, presupuesto, notas). `SelectorIcono` extraído; `TarjetaPlan`, `BarraPresupuesto`.
- Tests: `plan.ts` (validación, secciones con cambio de mes/año, cuenta atrás, textos de fechas, presupuesto
  0/parcial/pasado, etiqueta accesible). Sin revisión.

**F3 · Tareas y reservas** — `lib/planificador/tareas.ts` (orden: pendientes por fecha y `position`, luego hechas;
«1 de 3 hechas»; chips de la tarjeta; plantillas por tipo del mockup: viaje → reservas Vuelos/Alojamiento/Coche/Seguro/
Actividades, celebración → Regalo/Reserva/Invitaciones, otro → ninguna), `ListaTareas`, `FilaTarea`, hoja de tarea,
plantilla en `FormularioPlan` (inserta las tareas tras el plan, `upsert` con ids del cliente), borrar con
`HojaConfirmar`. Sitio de una tarea solo tras F1 aplicada (si no, se oculta la fila). Tests: `tareas`. Sin revisión.
En paralelo con F4 y F5.

**F4 · Gastos del plan, saldar y borrar** (necesita F1 aplicada) — `lib/gastos/planes.ts` (agrupar saldables por
plan, saldo del plan, estado de la casilla de grupo todos/ninguno/algunos, reparto inicial desde el plan),
`CampoPlan`, `?plan=` en `app/gastos/nuevo.tsx`, `COLUMNAS`, fila «Plan» en detalle de gasto y en `FilaGasto`,
sección «Gastos del plan» + `SaldoPlan` + «Este plan cuenta como un único gasto de X en Gastos», `HojaSaldar` con
`plan` y agrupación, pedir borrar el plan + banda pendiente + tarjeta de Inicio. Errores `TW066`, `TW012`.
Tests: `planes` (dos gastos del ejemplo → +30,00 € para David y −30,00 € para María; bote → 0; gasto en liquidación
pendiente fuera; gasto pendiente de borrar fuera; grupo mixto), reparto inicial. **Revisa el arquitecto** (dinero y borrado).

**F5 · Calendario e Inicio** (sin migración) — `lib/calendario/agrupar.ts` (elemento `plan`), carriles/rejilla/
semana/lista/filtros, color del plan en `lib/calendario/colores.ts`, toque → detalle; `lib/inicio/consultas.ts`
(siguiente plan sin filtrar duración) y `inicio.ts`; enlace de la tarjeta a `/planificador/<id>`. Tests: agrupar
(banda de 4 días que cruza semana y mes, plan de un día), filtro «Planes», próximo plan con un cumpleaños antes de un
viaje. Revisar que «Esta semana» de Inicio no cuente el plan dos veces. En paralelo con F3/F4 (archivos distintos).

**F6 · Itinerario por días** — M2 (**revisa el arquitecto**). `lib/planificador/itinerario.ts` (días del plan;
elementos por día ordenados todo el día → franja → hora → `position`; «Fuera de las fechas del plan»; texto de mover),
`COLUMNAS_ITINERARIO` (las de evento + `plan_id, time_slot, position`), pestaña Días (tira de días, lista, «+ Añadir a
este día», hoja Mover), `FormularioEvento` en modo plan (§4), editar fechas del plan → `move_plan` con «¿Mover también
el itinerario (N elementos)?» (`rpc('move_plan')`; si además cambian otros campos, primero el update con `version`
y después `move_plan` con la versión que devuelve; tras mover, si `outside > 0`, avisar «N elementos han quedado fuera
de las fechas»). Errores `TW067` y `TW069` (`lib/gastos/consultas.ts` y `lib/planificador/error.ts`) y `TW068`
(`lib/planificador/error.ts`). Borrar un elemento: `request_deletion` → siempre `deleted` (`HojaConfirmar` sin «tendrá
que aprobarlo»). Tests: `itinerario`, modo plan del formulario (sin secreto/repetición, franja).

**F7 · Sitios del plan** (sin migración) — pestaña Sitios, parámetro `coleccion` en `app/mapa/nuevo.tsx`, «Añadir al
itinerario» en la ficha. Tests: qué plan ofrece la ficha (en curso/próximo, no pasado). En paralelo con F8.

**F8 · Ideas** (necesita F1 aplicada) — `lib/planificador/ideas.ts` (validación, texto «Viaje · sin fecha»,
precarga del formulario de plan), pestaña Ideas, hoja de idea, «Convertir en plan» → `nuevo?idea=`: insert del plan
(id fijo durante el formulario, `upsert` ignorando duplicados) → sitio de la idea a la colección del plan
(`on conflict` ignorado) → borrar la idea; un fallo a mitad se reintenta sin duplicar. Tests: `ideas`.

**F9 · Reservas enlazadas** — M3 (**revisa el arquitecto**). Reserva con «elemento del itinerario» (`event_id`; el
selector solo ofrece elementos del plan sin reserva) y «gasto» (`expense_id`, «Hecho y apuntar gasto» →
`/gastos/nuevo?plan=&tarea=`); «Pendiente de reservar» en el itinerario; «Estimado pendiente ~489 €»
(`pending_estimate_cents`) en el presupuesto. Marcar se hace por cualquiera de los dos lados (sincronización en el
servidor); con nota, `update events set reserved, reservation_note` con `version`. Error `TW072`. Invalidar tareas y
eventos al llegar el Realtime del otro lado. Tests: textos y estados de reserva.

**F10 · Pasados y resumen** — pestaña Pasados («Gastado 640 €», «Ver resumen»), `lib/planificador/resumen.ts`
(gastado total, por categoría, quién pagó cuánto, presupuesto vs real, sitios de la colección con visita en las
fechas del plan y «¿Fuisteis? Añadir visita» para los que no), pantalla de resumen. Tests: `resumen`.

| Paralelo | |
|---|---|
| F1 ∥ F2 ∥ F3 | F2 y F3 no necesitan la migración |
| F3 ∥ F4 ∥ F5 | Tareas / Gastos / Calendario e Inicio: archivos distintos (F4 y F5 tocan `app/(tabs)/index.tsx` solo en líneas distintas: hacerlas en serie si coinciden) |
| F7 ∥ F8 | Mapa / Ideas |
| F6 → F9 | F9 enlaza reservas con el itinerario |
| F10 | Al final |

Revisión del arquitecto solo en F1, F4, F6 (M2), F9 (M3) y M4; el resto, typecheck, lint y tests.

## 8. Lo que hace David a mano

1. Confirmar que `20261129000000_visitas_y_reserva.sql` está aplicada (no figura en `docs/estado.md`); si no, darle el sí.
2. Dar el sí para aplicar M1 (F1), M2 (F6), M3 (F9) y M4 (calendario con itinerario) con la CLI (`supabase db query --remote -f … --yes`, como siempre). M4, junto con el cambio de la app en el calendario.
3. Probar en el iPhone con las dos cuentas: crear un viaje y una celebración, tareas asignadas, gasto desde el plan y
   «Saldar solo esto» (cada uno ve el mismo total), pedir borrar y aprobar (gastos y sitios se quedan), banda en el
   calendario, «Próximo plan» en Inicio, tiempo real de tareas.

## 9. Riesgos

- **Dinero**: el CHECK nuevo en `expenses` falla si hay gastos privados con plan (hoy no hay planes: comprobación previa
  en M1). `expenses_before_write` y `request_deletion` se reescriben enteras: copiar de la última migración, comparar
  con producción y repetir las pruebas de Gastos y Colecciones de las migraciones anteriores.
- **`HojaSaldar` agrupada**: la casilla de grupo y la lista congelada (`congelada`, `conocidos`) trabajan por ids; un
  fallo marcaría gastos de más. Tests de `planes.ts` y revisión en F4.
- **Calendario e Inicio**: meter `plan` en `aElementos` cambia conteos de celdas, «+N» y «Esta semana»; los 443 tests
  actuales deben seguir verdes y se añaden casos.
- **Mover un plan sin mover el itinerario**, o acortarlo moviéndolo, deja elementos fuera de fechas: se muestran en
  «Fuera de las fechas» con «Mover» (`move_plan` devuelve cuántos en `outside`).
- **Carreras**: dos personas editando el plan (`version`); añadir un gasto mientras la otra salda el plan (`TW020`,
  ya cubierto); aprobar el borrado mientras la otra añade una tarea (la tarea se va en cascada: aceptado).
- **Colección del plan**: nombre recortado a 60; un sitio privado añadido al plan no lo ve la pareja (como en colecciones).
- **Zona horaria**: «hoy» y la cuenta atrás con la fecha local del móvil (como el resto de la app; pendiente general).

## 10. Decisiones para David (con la recomendada; ninguna bloquea F1–F3)

1. **Planes privados o sorpresa: no.** Todo plan lo ven los dos; para una sorpresa, evento secreto suelto (como ya
   decidiste en `modelo-datos.md` §15.5). *Alternativa*: plan secreto, con la contrapartida de esconder también sus
   gastos, colección e itinerario (migración grande en RLS, calendario y saldo).
2. **Borrar un elemento del itinerario sin aprobación**, como las tareas (moverlo ya no la pide); borrar el plan entero
   sí la pide. *Alternativa*: aprobación también aquí (sin migración, pero cada «Tranvía 28» borrado espera a la pareja).
3. **El plan como una fila agrupada en Saldar** (y en la tarjeta del plan); en Últimos e Historial, gastos sueltos con
   la línea «✈️ Escapada a Lisboa». *Alternativa*: agrupar también ahí, con la contrapartida de que la paginación por
   fecha y los totales por categoría no cuadran.
4. **Los gastos de un plan siempre los veis los dos** (un gasto privado no puede ir en un plan). Así los dos veis el
   mismo «312 € de 900 €». *Alternativa*: permitirlos y excluirlos del total, con la contrapartida de que quien lo
   apuntó lo ve en la lista y no en el total.
