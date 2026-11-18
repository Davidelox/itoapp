# ito · Plan del Calendario v2

> Estado: **aprobado por David** (18 nov 2026: las 11 decisiones como se recomendaban, más el «Modo Semana» detallado de §2.6). Parte de `docs/plan-calendario.md` (fases A–C, ya implementadas y pendientes de commit).
> Alcance, las cinco peticiones de David:
> 1. **El + usa el día seleccionado** (y el filtro activo).
> 2. **Eventos de varios días**, dibujados como una **línea continua** que recorre los días.
> 3. **Colores por persona**: un evento de una sola persona en su color de perfil, el de los dos con **los dos colores**, los **pagos en naranja**.
> 4. **Categorías y filtros**: Viaje, Comer fuera, Ocio (y Otros).
> 5. **Cumpleaños** (el día que alguien cumple años): fucsia, con filtro propio y **rodeado del color de la persona de la que es** (la madre de Meri → anillo del color de Meri).
>
> **Fuera** (se dice para que no se cuele): hora de inicio/fin en eventos de varios días, editar «solo esta vez» de un repetido, filtros múltiples a la vez, categorías personalizadas, cumpleaños secretos, borrar «solo este año» de un cumpleaños, importar cumpleaños de los contactos, títulos dentro de las barras en la vista Mes, crear un rango arrastrando en la rejilla, degradados, avisos push (se siguen guardando) y **planes** (solo se les reserva color y filtro, §2.3).

---

## 1. Lo que ya hay y lo que falta

| Pieza | Hoy | Falta |
|---|---|---|
| **+ del calendario** (`app/(tabs)/calendario.tsx`, `nuevoEvento`) | Ya pasa `?fecha=` con el día seleccionado | `app/calendario/nuevo.tsx:21` lo **descarta si es pasado** y pone hoy (si David tocó un día pasado, parece que no funciona). No mira el filtro activo |
| **+ de Pago** dentro del formulario | `crearPago` pasa `dia: f.fecha` a `/gastos/recurrente/nuevo`; `FormularioRecurrente.tsx:91` lo usa | Nada |
| **`events.end_date`** | Existe desde el esquema inicial (CHECK `end_date >= start_date`). El trigger ya calcula `ends_at` = día siguiente al último a las 00:00 si es de todo el día | La app nunca lo envía; no hay límite de duración ni regla con la repetición |
| **`calendar_range`** | Ya devuelve `ends_on` (= `occurs_on` + duración) y ya expande desde `p_from - duración`, así que **un evento que empezó antes del rango sale** | Falta `category` y `birth_year`. El cliente ignora `ends_on`: `FilaRango` no lo tiene y `agrupar.ts` pinta cada evento solo en su primer día |
| **Repetición y excepciones** | `occurrence_dates` + `event_exceptions` por **fecha de inicio** de cada repetición | Con varios días, la excepción sigue siendo la fecha de inicio de esa repetición: el cliente tiene que mandar el **inicio**, no el día tocado (§4, riesgo 1) |
| **Colores** | `colors.eventDot` azul y `colors.paymentDot` ámbar; `personColors` (6 pastel con su `ink`) solo en avatares y nombres | Colores por asistente, naranja de pagos, fucsia de cumpleaños |
| **Categoría** | No existe en `events` | Columna nueva |

---

## 2. Pantallas

### 2.1 El + (petición 1)

- **Día seleccionado → ese día**, también si es pasado (decisión 1). Sin día seleccionado: hoy.
- **El filtro activo elige el tipo** al abrir: Viajes → categoría Viaje con «Varios días»; Comer fuera / Ocio → esa categoría; Cumpleaños → tipo Cumpleaños; Pagos → tipo Pago (el botón «Añadir evento» de la lista vacía con Pagos sigue sin salir). Parámetros: `/calendario/nuevo?fecha=YYYY-MM-DD&tipo=evento|cumple|pago&categoria=trip|eating_out|leisure`.
- En Cumpleaños, el día seleccionado precarga **día y mes**.

### 2.2 Calendario: Mes, Semana y lista

**Marcadores** (componente `Marcador`, con `react-native-svg`, que ya está instalado): la forma dice qué es y el color de quién es.

| Qué | Forma | Color |
|---|---|---|
| Evento de una persona | círculo 6 px | `ink` del color de perfil de esa persona |
| Evento de los dos | círculo **partido en vertical**: mitad izquierda m1, derecha m2 | los dos `ink` |
| Pago | **cuadrado** redondeado 6 px | naranja `#D2691E` |
| Cumpleaños | círculo fucsia 7 px con **anillo** (1,5 px, separado 1 px en blanco) | relleno fucsia `#C2185B`; anillo del `ink` de la persona; si es de los dos, anillo mitad y mitad |
| Plan (reservado) | barra/banda | granate suave `accentSoft` con borde `accent` |

- Orden fijo **m1 a la izquierda, m2 a la derecha** (no «yo primero»), para que los dos móviles se vean igual cuando lo comparan.
- Persona sin color elegido (o pareja aún sin unir) → el azul actual `eventDot` en su mitad.
- Se usa el `ink` (oscuro, ≥ 3:1 sobre blanco) y no el `bg` pastel, que sobre blanco no se ve (~1,3:1).

**Mes** (`RejillaMes`): cada fila de semana es número + **carriles de barras** + puntos.
- Los eventos de **varios días no llevan punto**: se dibujan como una **barra de 6 px** que recorre sus días. Persona: su `ink`. Los dos: **cinta bicolor** (3 px arriba m1, 3 px abajo m2), coherente con el punto partido.
- La barra **se parte al cambiar de fila**: un segmento por semana. Extremos redondeados donde empieza y termina el evento; rectos (y sin margen, pegados al borde) donde continúa en otra fila o fuera de la rejilla.
- **Carriles**: como mucho **2 barras por semana**; una tercera que se solape no se dibuja y cuenta en el «+» de sus días. Los carriles se calculan por semana (una barra puede cambiar de carril de una fila a otra, como en Google Calendar).
- Altura: 46 px como hoy; +8 px por carril en las semanas que tienen barras. Barras con `pointerEvents="none"`: se toca la celda.
- Puntos: como hoy, máximo 3 y «+». Candado si hay un secreto.

**Semana**: deja de ser una tira compacta; pasa a la vista detallada de **§2.6**.

**Lista** (`FilaCalendario`):
- A la izquierda del título, el **mismo marcador a 10 px** (o 12 px el cumpleaños).
- Etiqueta de la derecha = **categoría** con su icono: «Viaje», «Comer fuera», «Ocio», «Evento» (Otros) en gris neutro (`surface` + `text`); «Pago» en chip naranja; «Cumpleaños» en chip fucsia; «Secreto · solo tú» como ahora.
- Varios días:
  - **Día seleccionado** (y las filas de la Semana, §2.6): sale en cada día que dura, con «Día 2 de 5 · hasta el dom 16».
  - **Próximos / mes**: una sola vez, en su primer día dentro del mes, con «14 – 18 nov» (o «Hasta el 3 nov» si empezó el mes anterior). Sale mientras **no haya terminado** (`fin >= hoy`), aunque haya empezado antes.
- Cumpleaños: título «Cumple de Carmen», línea «Cumple 60 · de parte de Meri» (sin año: «De parte de Meri»).
- Accesibilidad (no depender del color): la línea ya dice «Solo va Meri»; se añade «Vais los dos» en la etiqueta de accesibilidad. La de la celda: «14 de noviembre: Viaje a Roma, día 2 de 5; 1 cumpleaños; 2 eventos; 1 pago».

**Filtros** (`FiltrosTipo`): fila de chips con **scroll horizontal**, uno a la vez (como ahora):
**Todos · Eventos · Viajes · Comer fuera · Ocio · Cumpleaños · Pagos**. Viajes, Comer fuera, Ocio, Cumpleaños y Pagos llevan su icono (`airplane-outline`, `restaurant-outline`, `ticket-outline`, `gift-outline`, `card-outline`). «Eventos» = todos los eventos menos los cumpleaños. «Otros» no tiene chip (está en Eventos). Los filtros afectan a puntos, barras y lista.

### 2.3 Colores de la app

| Token nuevo (`constants/theme.ts`) | Valor | Contraste |
|---|---|---|
| `pagoMarca` | `#D2691E` | 3,6:1 sobre blanco (gráfico ≥ 3) |
| `pagoChip` / `pagoChipTexto` | `#FBE3D0` / `#7A3A0E` | ~7:1 |
| `cumpleMarca` | `#C2185B` | 5,9:1 sobre blanco |
| `cumpleChip` / `cumpleChipTexto` | `#FADCE9` / `#8E1446` | ≥ 6:1 |
| Planes (reservado) | `accentSoft` + borde `accent` | — |

- **Choques con los colores de perfil**:
  - el naranja con **Melocotón** (`ink #8A4325`, marrón rojizo);
  - el fucsia con **Malva** (`ink #74306F`, ciruela).

  No se quita ningún color de la paleta: **la forma los separa** (el pago es cuadrado, el cumpleaños lleva anillo; el evento es un círculo liso) y los tonos son distintos en claridad (el naranja es mucho más claro que el `ink` de Melocotón). Con Malva, el anillo ciruela queda separado del relleno fucsia por 1 px blanco.
- `colors.paymentDot/paymentChip` **no se tocan**: `app/ajustes/index.tsx:443` usa `paymentChip` para otra cosa. El calendario pasa a los tokens nuevos; `eventDot` queda como color de reserva (persona sin color).
- Los colores de persona siguen sin usarse para estados ni botones (`docs/concepto.md`): aquí dicen **de quién es**, que es su uso.

### 2.4 Nuevo / editar evento (página completa)

- **Tipo** (solo al crear): **Evento · Cumpleaños · Pago** (el segmentado de hoy, con una opción más).
- **Evento**, como hoy más:
  - **Categoría**: chips **Viaje · Comer fuera · Ocio · Otros** (por defecto Otros). Elegir Viaje activa «Varios días» si no se ha tocado.
  - **Fechas**: interruptor **«Varios días»** bajo la fecha. Al activarlo:
    - la fecha pasa a **Desde** y aparece **Hasta**: un botón con la fecha («Dom 16 nov · 3 días») que abre la misma hoja-calendario de `SelectorFecha`, con los días anteriores a «Desde» bloqueados y el rango resaltado. Por defecto: Desde + 1;
    - desaparece «Hora» (varios días = **todo el día**) y los avisos pasan a los de todo el día;
    - error si pasa de **31 días**: «Como mucho 31 días.»
    - Repetir: «Cada semana» solo si dura ≤ 7 días, «Cada mes» ≤ 28 (si no, el chip sale desactivado con «Dura demasiado para repetirse cada semana»). Así una repetición nunca se pisa con la siguiente.
  - «¿Quién pagó?» se permite con varios días (pregunta al acabar el último día).
- **Cumpleaños**, formulario corto:
  - **¿Quién cumple?** (nombre, ≤ 120; placeholder «Carmen, la madre de Meri…»).
  - **Día y mes**: botón que abre una **hoja** con los 12 meses en chips y la rejilla de días de ese mes (con el 29 de febrero).
  - **Año de nacimiento (opcional)**, 4 cifras → ayuda en vivo «Cumplirá 60 el 15 mar 2027». Validación: 1900 – año actual; si el año no es bisiesto y es 29 feb: «Ese año no tuvo 29 de febrero».
  - **¿De parte de quién?**: Tuya · De {Pareja} · De los dos (por defecto: Tuya). Sin pareja unida, no sale.
  - **Aviso**: Sin aviso · El día antes (9:00) · Una semana antes (9:00); por defecto **el día antes**.
  - **Notas** (placeholder «Ideas de regalo, talla…»).
  - Nada de secreto, hora, repetición (siempre cada año), presupuesto ni «¿Quién pagó?».
- **Fechas pasadas** (decisión 1): `SelectorFecha` gana el modo `todas` (Hoy / Mañana / Otro día…, sin días bloqueados). Se quita el error «Elige hoy o un día futuro».

### 2.5 Detalle

- **Varios días**: «Del vie 14 al dom 16 nov · 3 días» (en vez de la hora). Si está en curso: «Hasta el domingo 16 · día 2 de 3».
- **Categoría**: chip con icono bajo el título.
- Marcador junto a «Vais los dos» / «Solo va Meri».
- **Cumpleaños**: título «Cumpleaños de Carmen», «Domingo 15 mar · cumple 60», «Cada año», «De parte de Meri» con el marcador fucsia de anillo, aviso, notas. Sin bloque «Después» ni «Revelar».
- **Borrar**:
  - en un repetido de varios días: «**Solo esta vez (14 – 16 mar)**» / «Toda la serie»;
  - en un cumpleaños, **solo «Borrar cumpleaños»** (toda la serie), con la aprobación de la pareja que ya existe («Meri tendrá que aprobarlo»).

### 2.6 Modo Semana (petición de David: «más detallado y con celdas más grandes»)

**Decisión: una fila por día, no 7 columnas.** En 375 px, quitando márgenes, cada columna tendría ~46 px: no cabe ni «21:30». En filas, cada día tiene ~250 px de ancho para hora, título e importe. La rejilla del Mes sigue igual.

**Qué sustituye**: la tira (`TiraSemana`) **y** la lista de 7 días de debajo. Ahora es una sola pieza, `SemanaDetallada`: los 7 días ya muestran sus elementos. Debajo solo aparece la lista del **día seleccionado**, si lo hay.

**Anatomía de una fila** (de izquierda a derecha, dentro de la caja blanca de siempre):

| Zona | Ancho | Contenido |
|---|---|---|
| Día | 48 px | «LUN» (11 px) y «14» (18 px, negrita). **Hoy**: número en círculo granate con texto blanco, como en el Mes |
| Carriles | 3 × 6 px + 4 px de separación ≈ 26 px | Barras **verticales** de los eventos de varios días |
| Elementos | el resto (~250 px) | Hasta **3 líneas**, y «+N más» si hay más |

- **Altura**: mínimo 56 px (día vacío); cada línea mide **32 px**, así que con 3 líneas la fila mide unos 104 px. Las filas tienen separador fino. La semana entera mide unos 450–700 px y la pantalla hace scroll, como ahora.
- **Una línea** (`numberOfLines={1}`, se recorta el título con «…»): marcador de 10 px, luego hora en negrita («21:30»; nada si es de todo el día), icono de categoría de 14 px (avión, cubiertos, entrada; ninguno en Otros) y título. Según el tipo:
  - **Evento**: marcador del color de la persona, o partido si vais los dos.
  - **Pago**: cuadrado naranja, título e **importe a la derecha** en negrita («12,99 €», «~48 €»). El importe nunca se recorta: se recorta el título.
  - **Cumpleaños**: punto fucsia con anillo y «Cumple de Carmen · 60» (sin año: «Cumple de Carmen»).
  - **Secreto**: candado de 11 px antes del título.
  - **Pendiente de borrar**: título tachado y atenuado. La etiqueta de accesibilidad lo dice.
- **Orden**: igual que el servidor (todo el día primero, luego por hora y título). Los eventos de varios días van antes que los de todo el día.
- **Varios días**:
  - **Barra vertical continua** en la zona de carriles, desde la fila de su primer día hasta la del último. No se corta entre filas: es la «línea que recorre los días» de la petición 2.
  - Hay **3 carriles** en la Semana (el Mes tiene 2). Colores como en el Mes: la persona con su `ink`; los dos, una cinta partida a lo largo (mitad izquierda m1, mitad derecha m2).
  - Extremos redondeados donde empieza y termina; rectos si sigue en otra semana.
  - El título sale **una vez**, como línea en la fila de su primer día visible: «Roma · hasta el vie 18», o «Roma · desde el jue 10» si empezó la semana anterior. Ocupa una de las 3 líneas. Los días siguientes no repiten la línea: lo dice la barra.
  - Si no cabe en 3 carriles, no hay barra: sale como línea **en cada día** («Roma · día 2 de 5»).
- **«+N más»**: cuarta línea, en gris, si quedan elementos («+2 más»). Al tocarla se selecciona el día.
- **Día vacío**: la zona de elementos queda en blanco (sin «Nada», para no llenar la semana de ruido).
- **Seleccionado**: la fila entera con fondo `accentSoft` y un borde izquierdo granate de 3 px (no depende solo del fondo). `accessibilityState.selected`.
- **Tocar**:
  - **la zona del día** (número) o un hueco de la fila → selecciona el día. Debajo aparece la lista de ese día («Lunes 14») y la pantalla **baja hasta ella** (`scrollTo` con la posición que da `onLayout` de la lista). Tocarlo otra vez lo quita, como ahora;
  - **una línea** → abre el detalle: evento o cumpleaños, con `?fecha=` = `inicio` de la repetición; pago, a su gasto o a su recurrente, como ahora.
- **Sin día seleccionado** no hay lista debajo: la semana ya lo enseña todo. Si la semana está vacía (con el filtro aplicado): «Nada esta semana» + **Añadir evento**.
- **Accesibilidad**:
  - cada línea es un botón con su etiqueta completa, por ejemplo «21:30, Cena en El Olivo, comer fuera, vais los dos» o «Pago, Netflix, 12,99 euros, a medias»;
  - la zona del día: «Lunes 14 de diciembre, hoy, 3 eventos y 1 pago; Viaje a Roma, día 2 de 5. Toca para ver el día»;
  - barras y marcadores van ocultos al lector de pantalla: lo que dicen está en las etiquetas;
  - zona tocable: líneas de 32 px con `hitSlop` vertical de 6 px (44 px efectivos); la zona del día ocupa toda la altura de la fila.
- **Fuera**: arrastrar para mover un evento, una vista de horas (de 8:00 a 24:00) y el texto dentro de las barras.

---

## 3. Base de datos · migración `20261121000000_calendario_v2.sql`

**Requisito**: `20261120000000_calendario.sql` aplicada antes (ahora o justo antes). La nueva empieza comprobándolo (existe el trigger `y_cancel_date_requests` en `events`) y, si no, para con «Aplica antes 20261120000000_calendario.sql». Idempotente: `add column if not exists`, `drop constraint if exists` + `add constraint`, `drop function if exists` + `create`.

1. **`events.category`**: `text not null default 'other'`, CHECK `in ('trip','eating_out','leisure','birthday','other')`. El `default` rellena los eventos que ya existen con `'other'` (no hay `null` que tratar).
   - Texto + CHECK, no enum: añadir una categoría luego es cambiar un CHECK, sin `alter type … add value`.
   - **Los cumpleaños son una categoría más**: una sola columna y una sola dimensión de filtro.
2. **`events.birth_year`**: `smallint`, CHECK `birth_year is null or (category = 'birthday' and birth_year between 1900 and 2100)`. El «no en el futuro» lo valida la app.
3. **CHECK `events_varios_dias`** (los eventos de un plan quedan fuera, para no atar al Planificador):
   `plan_id is not null or end_date is null or (all_day and end_date > start_date and end_date - start_date <= 30 and (recurrence <> 'weekly' or end_date - start_date <= 6) and (recurrence <> 'monthly' or end_date - start_date <= 27))`.
   - Un día = `end_date null` (la app nunca manda `end_date = start_date`).
   - Mensual ≤ 27 días de diferencia: el 31 ene → 28 feb no se pisa.
4. **CHECK `events_cumple`**: `category <> 'birthday' or (recurrence = 'yearly' and recurrence_until is null and all_day and start_time is null and end_date is null and budget_cents is null and not ask_who_paid and not is_secret and plan_id is null and extract(year from start_date) = 2000)`.
   - **Año ancla 2000** (bisiesto): `start_date = 2000-MM-DD` guarda día y mes; así el 29 de febrero se puede guardar y `occurrence_dates` lo pone el **28 de febrero** los años no bisiestos (lo mismo que ya hacen los anuales).
   - El año real va en `birth_year`; la edad la calcula la app (año de la repetición − `birth_year`).
   - `attendees` significa en un cumpleaños «de parte de quién» (m1, m2, los dos).
5. **`calendar_range`**: `drop` + `create` con el mismo cuerpo que en `20261120000000` y dos columnas al final, `category text` (null en pagos y planes) y `birth_year smallint`. Mismo `revoke`/`grant`, `security invoker`, límite de 100 días.
6. `notify pgrst, 'reload schema';`
7. **Sin cambios** (comprobado):
   - `events_before_write` ya calcula `ends_at` de varios días;
   - `request_deletion` y `execute_deletion` trabajan con la fecha de inicio de cada repetición;
   - `pending_actions` (los cumpleaños no tienen «¿Quién pagó?» por CHECK);
   - RLS y tiempo real (columnas nuevas de la misma tabla);
   - `leave_couple` (los cumpleaños son compartidos y se quedan).

   **Fuera**: impedir en el servidor `request_deletion` de «solo este año» en un cumpleaños. Si alguien lo forzara, solo ocultaría ese año, con la aprobación de la pareja; no merece reescribir la función otra vez.
8. **Comprobaciones comentadas**:
   - antes de aplicar: `select count(*) from events where end_date is not null and plan_id is null` (esperado 0);
   - después:
     - insertar un cumpleaños secreto → viola `events_cumple`;
     - insertar un evento de 40 días → viola `events_varios_dias`;
     - un semanal de 8 días → idem;
     - un cumpleaños `2000-02-29` → `calendar_range('2027-02-01','2027-03-05')` lo devuelve el 28 feb;
     - un viaje del 28 oct al 3 nov → `calendar_range('2026-11-01', …)` lo devuelve con `occurs_on = 2026-10-28` y `ends_on = 2026-11-03`.

---

## 4. Código

| Archivo | Qué |
|---|---|
| `lib/calendario/colores.ts` (**nuevo, con pruebas**) | `marcador(elemento, colorM1, colorM2)` → `{ forma: 'circulo' \| 'mitades' \| 'cuadrado' \| 'anillo', relleno, anillo? }`; color de reserva si no hay color; **prueba de contraste**: `ink` de los 6 colores, naranja y fucsia ≥ 3:1 sobre blanco y textos de chips ≥ 4,5:1 |
| `lib/calendario/carriles.ts` (**nuevo, con pruebas**) | `segmentosSemana(semana, elementos)` → `{ clave, colInicio, colFin, carril, empieza, termina }[]` y `ocultosPorDia`. Orden: inicio, más largo primero, título; primer carril libre. `maxCarriles` como parámetro: 2 en el Mes, 3 en la Semana |
| `lib/calendario/semana.ts` (**nuevo, con pruebas**) | `filasSemana(dias, elementos, { maxLineas: 3, maxCarriles: 3 })` → por día `{ lineas, mas, etiqueta }` y los segmentos verticales. Decide qué evento de varios días lleva barra y cuál pasa a línea, y en qué fila sale su título (primer día visible). `lineaSemana(e, ctx)` → `{ hora, icono, titulo, derecha, tachado }`: qué partes lleva la línea y cuál se recorta (siempre el título; nunca la hora ni el importe) |
| `lib/calendario/agrupar.ts` | `FilaRango` con `ends_on`, `category`, `birth_year`. `Elemento` con `inicio` (inicio de la repetición), `fin`, `diaN`/`totalDias`, `categoria`, `anioNacimiento`. Los de varios días se **expanden** a cada día para la lista del día y de la semana; «Próximos» los pone una vez. `Filtro` con las 7 opciones. `puntosDelDia` sin los de varios días. `lineaElemento` («Día 2 de 5 · hasta el dom 16», «Cumple 60 · de parte de Meri»). `etiquetaDia` con cumpleaños y barras |
| `lib/calendario/evento.ts` | `Formulario` con `categoria`, `variosDias`, `fechaFin`, y para cumpleaños `dia`/`mes`/`anioNacimiento`. `aDatos`: varios días → `all_day`, sin hora, `end_date`; un día → `end_date: null`; cumpleaños → `start_date 2000-MM-DD`, `recurrence 'yearly'`, sin presupuesto. Validación: duración ≤ 31, repetición compatible, año de nacimiento, 29 feb. `repeticionesPermitidas(duracion)`. Textos «Del vie 14 al dom 16 nov · 3 días», «Cumple 60», «De parte de Meri». `COLUMNAS_EVENTO` con `end_date, category, birth_year` |
| `lib/calendario/repeticion.ts` | `proximaRepeticion` mira desde `hoy − duración` (para que un viaje en curso abra su repetición actual, no la siguiente). `edad(anioNacimiento, fecha)` |
| `lib/calendario/quienPago.ts` | Categoría del gasto según la del evento: comer fuera → `eating_out`, ocio y viaje → `leisure`, otros → `eating_out` (lo de hoy) |
| `components/calendario/Marcador.tsx` (**nuevo**) | Pinta el marcador con `react-native-svg`; oculto a lectores de pantalla |
| `components/calendario/RejillaMes.tsx`, `CeldaDia.tsx` | Carriles de barras por fila (posición en %, sin `onLayout`), altura según carriles, marcadores en vez de puntos de color fijo |
| `components/calendario/SemanaDetallada.tsx` (**nuevo**) y `LineaSemana.tsx` (**nuevo**) | Vista de §2.6: filas por día, carriles verticales (posición por `onLayout` de cada fila, porque las filas no miden lo mismo), líneas tocables. **Sustituye a `TiraSemana.tsx`, que se borra** |
| `components/calendario/FilaCalendario.tsx`, `ListaDias.tsx` | Marcador a la izquierda, etiqueta de categoría con icono, chips naranja/fucsia |
| `components/calendario/FiltrosTipo.tsx` | `ScrollView` horizontal con 7 chips e iconos |
| `components/calendario/FormularioEvento.tsx` | Tipo de 3 opciones, categoría, «Varios días» + Hasta, variante Cumpleaños |
| `components/calendario/HojaDiaMes.tsx` (**nuevo**) | Hoja de día y mes para cumpleaños |
| `components/gastos/SelectorFecha.tsx` | Modo `todas` (sin bloqueo) y props `minimo` + `rangoDesde` para «Hasta» |
| `app/calendario/nuevo.tsx` | Acepta `fecha` pasada (decisión 1), `tipo` y `categoria` |
| `app/(tabs)/calendario.tsx` | `nuevoEvento` pasa filtro → tipo/categoría; `abrirEvento` pasa **`e.inicio`** como `?fecha=`. En Semana: `SemanaDetallada` en vez de tira y lista; al seleccionar un día, `scrollTo` hasta su lista (`ref` del `ScrollView` + `onLayout`) |
| `lib/calendario/agrupar.ts` (`construirLista`) | En Semana sin día seleccionado ya no hay lista de 7 días: devuelve vacío (o «Nada esta semana» si no hay nada) |
| `app/calendario/evento/[id].tsx` | Textos de varios días y cumpleaños; borrar «solo esta vez» con el **inicio**; sin «solo este año» en cumpleaños |
| `components/gastos/BorrarGasto.tsx` | Texto «Solo esta vez (14 – 16 mar)» para varios días |
| `constants/theme.ts` | Tokens de §2.3 |

**Riesgos a vigilar al implementar**:
1. **La fecha de la repetición**. Al expandir un viaje a sus días, `Elemento.fecha` pasa a ser el día pintado. Todo lo que identifica la repetición tiene que usar `inicio`:
   - `abrirEvento` (`?fecha=`);
   - `pendienteDeBorrar` / `claveBorrado`;
   - el borrado de «solo esta vez».

   Si no: «El evento no ocurre el 15/03» (`TW060`), o la fila no dice «Pendiente de borrar».
2. **Claves únicas**: la clave de la fila incluye el día pintado (`event:id:inicio:fecha`), si no React repite claves.
3. **«Próximos» de un viaje que empezó el mes anterior**: no filtrar por `fecha.slice(0,7)`, sino por solape con el mes.
4. **Editar un evento de 1 a varios días** cambia `end_date`, pero no la serie (`start_date`, `recurrence`): las solicitudes de «solo este día» pendientes siguen valiendo. Correcto, no tocar `y_cancel_date_requests`.

---

## 5. Orden y comprobación

| Paso | Qué | Cómo se comprueba |
|---|---|---|
| 1 | Migración v2 (§3) | Las comprobaciones de §3.8 en el SQL Editor. Un evento existente sale con `category = 'other'` |
| 2 | `colores.ts`, `carriles.ts` y cambios de `agrupar.ts`, `evento.ts`, `repeticion.ts`, `quienPago.ts`, con pruebas | Viaje jue–mar se parte en 2 segmentos (jue–dom con `termina=false`, lun–mar con `empieza=false`); 3 viajes solapados → 2 carriles y el tercero en el «+»; viaje que empieza antes de la rejilla; cumple 29 feb → 28 feb 2027 y 29 feb 2028; «Cumple 60»; semanal de 8 días no permitido; contraste de tokens. Siguen pasando las 204 pruebas; `tsc` y `eslint` limpios |
| 3 | `Marcador`, rejilla, tira, lista, filtros | En las dos cuentas: «Cena · solo David» en su color, «Cine · los dos» punto partido, Netflix cuadrado naranja. VoiceOver lee «Vais los dos». Con David en Melocotón, el pago y su evento se distinguen |
| 4 | Formulario: tipo, categoría, varios días, cumpleaños, el + | Seleccionar el 3 dic y + → formulario con el 3 dic. Filtro Cumpleaños + → tipo Cumpleaños con 3 dic. «Roma 14–18 dic · Viaje · los dos» → cinta bicolor del 14 al 18, partida en dos filas. Cumple «Mamá de Meri · 15 mar · 1966 · de Meri» → fucsia con anillo del color de Meri, «Cumple 61» en 2027 |
| 4b | `semana.ts` con pruebas; `SemanaDetallada` y `LineaSemana` | Pruebas: 5 elementos en un día → 3 líneas y «+2 más»; un viaje cuenta como línea solo en su primer día visible; uno que empezó la semana anterior lleva «desde el jue 10» en el lunes; 4 viajes solapados → 3 barras y el cuarto como línea cada día; orden (varios días, todo el día, hora); `lineaSemana` de un pago lleva el importe en `derecha` y el «~» si es estimado; cumpleaños «Cumple de Carmen · 60»; secreto con candado; pendiente de borrar → `tachado`. En el móvil (375 px): título largo recortado con «…» sin tapar el importe; tocar «LUN 14» selecciona y baja a la lista; tocar una línea abre su detalle; VoiceOver lee cada línea entera |
| 5 | Detalle y borrar | Repetido anual de 3 días → «Solo esta vez» → Meri aprueba → desaparece ese año entero (las 3 barras) y sigue el siguiente. Cumpleaños → solo «Borrar cumpleaños», con aprobación |
| 6 | Revisión del arquitecto | Carriles, fecha de repetición (riesgo 1), CHECKs, contraste, accesibilidad |

---

## 6. Decisiones que solo puede tomar David

1. **Fechas pasadas**: el + con un día pasado lo respeta y se pueden crear eventos en fechas pasadas (un viaje que ya empezó, apuntar algo que pasó). (Recomendado: sí. La contrapartida: «¿Quién pagó?» de un evento ya pasado sale en seguida, que es lo esperable. Alternativa: solo si el evento acaba hoy o después.)
2. **El + respeta el filtro activo** (Cumpleaños → crea un cumpleaños; Viajes → un viaje de varios días). (Recomendado: sí.)
3. **Varios días = siempre todo el día**, como mucho **31 días**; se pueden repetir si no se pisan (cada semana ≤ 7 días, cada mes ≤ 28, cada año siempre). (Recomendado: sí. Hora de salida/llegada, más adelante.)
4. **Dibujo de varios días** (aprobado; en la Semana se dibuja como en §2.6): línea de 6 px que se parte por semana, como mucho 2 por semana (el resto en el «+»), sin texto dentro en la vista Mes. En la lista del día sale cada día («Día 2 de 5»); en «Próximos», una vez. (Recomendado: sí.)
5. **«La mezcla» de los dos colores = mitad y mitad**: punto partido en vertical y barra bicolor (arriba m1, abajo m2), siempre en el mismo orden en los dos móviles. Se usa el tono oscuro de cada color, porque el pastel no se ve sobre blanco. (Recomendado: sí. Un degradado entre dos colores en 6 px queda como un tercer color turbio y no se lee como «los dos».)
6. **Pagos en naranja y cuadrados**; el choque con Melocotón se resuelve con la forma, sin quitar colores de la paleta. (Recomendado: sí. Alternativa: quitar Melocotón de la paleta; obliga a cambiar a quien lo tenga.)
7. **Categorías: Viaje, Comer fuera, Ocio y Otros** (por defecto Otros; los eventos de ahora quedan en Otros). Filtros, uno a la vez: Todos · Eventos · Viajes · Comer fuera · Ocio · Cumpleaños · Pagos. (Recomendado: sí. Si echas en falta alguna, «Familia» o «Salud» se añaden cambiando un CHECK.)
8. **Cumpleaños como un evento de categoría «cumpleaños»**, no como tabla aparte. Así reutiliza repetición, borrado con aprobación, tiempo real y detalle. Datos:
   - nombre, día y mes, año opcional (para «cumple 60»), de parte de quién (tú, tu pareja o los dos);
   - cada año, todo el día, aviso por defecto el día antes a las 9:00;
   - nunca secreto, sin «¿Quién pagó?»;
   - el 29 de febrero sale el 28 los años no bisiestos;
   - borrar = todos los años, con aprobación.

   (Recomendado: sí. Una tabla aparte duplicaría RLS, borrados, tiempo real y la consulta del calendario.)
9. **Fucsia rodeado del color de la persona**: punto fucsia con anillo del color de quien es (mitad y mitad si es de los dos), chip «Cumpleaños» fucsia en la lista. (Recomendado: sí.)
10. **Planes reservados en granate suave** con filtro «Planes» cuando llegue el Planificador: no se usa ese color para nada más. (Recomendado: sí. Un viaje del Planificador se verá como banda granate; un evento «Viaje» suelto, como barra de colores de persona.)
11. **Migración `20261121000000_calendario_v2.sql`** después de `20261120000000_calendario.sql`, y **revisión del arquitecto** al terminar. (Recomendado: sí.)
12. **Modo Semana detallado** (§2.6): una fila por día con hasta 3 líneas (hora, icono, título, importe), barras verticales con 3 carriles, «+N más», y lista del día debajo solo al seleccionarlo. (Pedido por David; diseño pendiente de su visto bueno. Alternativa: 7 columnas altas; con ~46 px por columna no cabe el texto.)
