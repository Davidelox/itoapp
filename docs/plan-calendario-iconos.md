# Calendario · Ronda 3: iconos y color de persona

Continúa `docs/plan-calendario-v2.md` (§2.2, §2.3 y §2.6). Dos peticiones de David:

- A) «Los colores que representan a cada persona en los textos o iconos no coinciden con el elegido en el perfil / Ajustes».
- B) «El símbolo de eventos, pagos y cumpleaños podría ser el icono de cada hito: regalo en un cumple, € en un pago; los de varios días, línea».

## A. Diagnóstico: el color de persona

**No hay fallo de datos.** El color se lee bien de punta a punta:

- se guarda en `couple_members.color` (onboarding `app/(onboarding)/perfil.tsx:60`, Ajustes `components/ajustes/HojasCuenta.tsx:61`);
- se carga en `lib/pareja/EstadoProvider.tsx:116,135` y se refresca por tiempo real (`:262`);
- se asigna al hueco correcto en `lib/calendario/colores.ts:38-43` (`coloresDeHuecos`, por `slot`, sin invertir «yo/pareja»);
- onboarding y Ajustes usan el mismo `SelectorColor` y la misma paleta (`constants/theme.ts:43-50`).

**La causa es de diseño: el calendario pinta un tono distinto del que se elige.**

- Al elegir, David ve el **pastel** (`bg`): el círculo grande de `components/onboarding/SelectorColor.tsx:35` y el fondo del avatar (`components/onboarding/AvatarPersona.tsx:31`).
- El calendario pinta solo el **`ink`**: `lib/calendario/colores.ts:46` (`tintaDe`), usado en puntos, mitades, anillos y barras (`:50-51`).
- Gastos hace lo mismo para los nombres (`lib/gastos/personas.ts:11-12`). Ahí es correcto, porque es texto.
- Los `ink` están pensados para texto sobre pastel: son casi negros (7,2–8,8:1 sobre blanco). En un punto de 6 px no se reconocen como el color elegido:
  - Melocotón sale marrón (`#8A4325`) y Pistacho, verde oliva (`#4A5E14`);
  - **Menta y Aguamarina salen iguales**: `#23604A` frente a `#1F5E60`, contraste 1,01:1. Si la pareja elige esos dos, no se distinguen.
- Detalle menor, aparte: `components/hilo/HiloSaldar.tsx:266-270` fija D = menta y M = lavanda en vez de leer la pareja. Ahora solo sale en `app/laboratorio`, pero hay que corregirlo antes de usarlo en Gastos.

**Arreglo: pintar como el avatar (relleno pastel y contorno `ink`).**

- La forma se rellena con el `bg` que se eligió y lleva un **contorno de 1 px en `ink`**. Es exactamente el aspecto del selector cuando el color está elegido y del avatar.
- Contraste: el contorno da ≥ 7:1 sobre blanco (marca gráfica, WCAG 1.4.11). El pastel solo, sin contorno, se queda en ~1,3–1,5:1 y no basta.
- El `ink` queda **solo para texto y contornos**. Los nombres de Gastos no cambian.
- Cambios en `lib/calendario/colores.ts`:
  - `tintaDe` (`:46`) pasa a devolver `{ relleno: bg, borde: ink }`;
  - la reserva, para una persona sin color, es `eventChip` / `eventDot`;
  - `coloresDe` (`:49-56`), `marcador` y `colorBarra` devuelven relleno y borde por mitad;
  - «no partir si son iguales» compara el relleno.
- Tamaños:
  - **punto del Mes**: de 6 a **8 px** (1 px de contorno y 6 px de pastel visible);
  - **barra del Mes**: de 6 a **8 px**, con `ALTO_CARRIL` de 8 a 10 (`components/calendario/CeldaDia.tsx:15`) y borde de 1 px;
  - **barra de la Semana**: `ANCHO_BARRA` de 6 a 8 (`components/calendario/SemanaDetallada.tsx:13`);
  - **de los dos**: cada mitad lleva su pastel y el `ink` de su persona en el borde exterior.
- Alternativa descartada: un tercer tono intermedio por color, ≥ 3:1 sobre blanco. Se parece más al pastel, pero el de Melocotón sale naranja y choca con los pagos (`#D2691E`), además de añadir 6 tokens que mantener.

## B. Iconos por tipo

| Tipo | Glifo | Color de persona |
|---|---|---|
| Evento de un día (todas las categorías) | **punto** (como hoy, con el arreglo A) | pastel con contorno `ink`; partido m1 a la izquierda y m2 a la derecha si es de los dos |
| Cumpleaños | **regalo** fucsia (`Ionicons gift`, relleno) dentro de un círculo | el círculo es el pastel de la persona con contorno `ink`, como un avatar con un regalo en vez de la inicial; de los dos, círculo partido |
| Pago | **«€»** naranja `pagoMarca`, en negrita | ninguno: el pago no es de una persona |
| Varios días | **barra** (como hoy, con el arreglo A) | pastel con contorno; cinta bicolor si es de los dos |

- **Eventos: punto y no icono de categoría.**
  - Con 8–10 px, un avión, unos cubiertos o una entrada no se reconocen.
  - Partir un glifo de fuente en dos colores obliga a apilar dos capas recortadas.
  - Los viajes casi siempre son barra, así que el icono apenas se vería.
  - La categoría ya sale con icono en la línea de la Semana (`components/calendario/LineaSemana.tsx:41`), en el chip de la lista y en el detalle.
  - Así cada glifo dice una sola cosa: regalo = cumpleaños, € = pago, punto = evento.
  - Alternativa: icono de categoría en el color de la persona. Se lee peor a ese tamaño y pierde «mitad y mitad».
- **Contraste**: fucsia sobre los 6 pasteles da 3,9–4,6:1 y el naranja sobre blanco 3,6:1, los dos ≥ 3:1.
- **«€»**: `Text` con `allowFontScaling={false}` y `fonts.bodyBold`, porque Ionicons no tiene un € neutro (`logo-euro` es un logotipo). El regalo es `Ionicons gift` centrado sobre el círculo SVG de `Marcador`, que reutiliza los semicírculos de `Anillo`.
- **Tamaños** (lado exterior):

  | Dónde | Punto | Regalo | € |
  |---|---|---|---|
  | Celda del Mes | 8 | 12 (regalo de 8) | 11 |
  | Semana y lista | 10 | 14 | 13 |
  | Detalle | 12 | 18 | — |

  El hueco del marcador pasa de 12 a 14 px en `LineaSemana.tsx:69` y `FilaCalendario.tsx:107`.
- **Mes, celda de unos 46 px**: caben 3 glifos (3 × 12 + 2 × 3 = 42 px).
  - Si hay más, se ven **2 glifos y «+N»**: `puntosDelDia` en `lib/calendario/agrupar.ts:213` devuelve `restantes`.
  - El candado sale de la fila y pasa a la esquina superior derecha de la celda, para no desbordar.
- **Accesibilidad**: los marcadores siguen ocultos al lector de pantalla y las etiquetas no cambian (ya dicen «Pago», «Cumpleaños», «Vais los dos»). No se depende del color: el glifo dice qué es y la etiqueta dice de quién.

## Archivos

- **Lógica**: `lib/calendario/colores.ts`, con un `MarcadorSpec` nuevo:
  - formas `punto | mitades | regalo | euro`;
  - campos `relleno`, `borde`, `relleno2`, `borde2`;
  - `colorBarra` devuelve también los bordes.
- **Recuento del Mes**: `lib/calendario/agrupar.ts`, con «2 + N».
- **Componentes**:
  - `components/calendario/Marcador.tsx`;
  - `CeldaDia.tsx` (tamaños, «+N», candado y `ALTO_CARRIL`);
  - `RejillaMes.tsx` y `SemanaDetallada.tsx` (barras con borde de 8 px);
  - `LineaSemana.tsx`, `FilaCalendario.tsx` y `app/calendario/evento/[id].tsx` (tamaños).
- **Gastos**: `components/hilo/HiloSaldar.tsx` lee los colores de la pareja.
- **Pruebas**:
  - `lib/calendario/__tests__/colores.test.ts`: relleno `bg` y borde `ink`, formas nuevas, reserva, mitades iguales sin partir, contraste del fucsia sobre los 6 `bg` ≥ 3;
  - pruebas de `agrupar`: 3 glifos, o 2 + «+N» con 4 o más.

## Riesgos

- **Barras de 8 px**: alargan las semanas con viajes 2 px por carril. Hay que revisar `INICIO_CARRILES` y el alto de las filas.
- **Regalo de 8 px**: en un móvil real puede quedar como una mancha. Si es así, en el Mes se dibuja el círculo pastel con un punto fucsia, y el regalo solo desde 14 px.
- **«€» con `Text`**: la línea base puede descuadrar el glifo en la fila de 12 px. Hay que fijar `lineHeight` y `includeFontPadding: false`.

## Decisiones de David

1. Pastel con contorno oscuro en el calendario. Recomendado: sí.
2. Eventos con punto y sin icono de categoría. Recomendado: sí.
3. ¿Se permite elegir Menta y Aguamarina a la vez? Con pastel se distinguen por el tono, pero poco. Recomendado: permitirlo y probarlo en el móvil.

## Ronda 3 implementada: cambios respecto a lo anterior (decididos por David)

- **Eventos de un día con el icono de su categoría** (no punto): viaje = avión, comer fuera = cubiertos, ocio = entrada, otros = calendario, cumpleaños = regalo fucsia. Van en una insignia circular como el avatar: relleno pastel, contorno de 1 px en el tono oscuro y partida en dos mitades si es de los dos. El icono lleva el tono oscuro de la persona (texto normal si va partida). El pago es un cuadrado naranja con «€» blanco. Varios días: barras de 8 px con relleno pastel y contorno oscuro (`components/calendario/Cinta.tsx`).
- **Celda del Mes de 70 px** (`ALTO_CELDA`), glifos de 18 px en cuadrícula de 2 × 2: hasta 3 glifos y el «+N» en el cuarto hueco (`N` = glifos que no caben + barras ocultas). `ALTO_CARRIL` = 10 (barra de 8 px + 2). El candado pasa a la esquina de la celda.
- Semana y lista: marcador de 20–22 px; en la línea de la Semana se quita el icono de categoría suelto, que repetiría el del marcador.

## Ronda 4 (decidida por David): iconos separados, regalos en la esquina y pagos único/recurrente

- **Mes: glifos separados y lo más grandes posible** (`lib/calendario/disposicion.ts`). Se acabó el solape: entre dos glifos quedan ≥ 3 px (medidos con la forma real, un cuadrado de esquinas redondeadas) y 2 px de margen a los bordes de la zona. `disposicionGlifos(n, hayMas, zona)` busca para cada caso el mayor tamaño entero que cabe; `RejillaMes` mide el ancho real de la celda y lo pasa a `CeldaDia`. `ALTO_CELDA` 78 → 84 (zona libre de 53 px). Con 1 glifo, máximo 30 px; con 2, en columna o en diagonal; con 3, en triángulo o zigzag; con 4, 2 × 2; con 5 o más, los 4 y un «+N» pequeño a la derecha.
- **Cumpleaños en la esquina**: un regalito fucsia de 11 px arriba a la izquierda (como el candado, a la derecha), con un «+» pequeño si hay más de uno. Ya no son glifos del centro ni cuentan en el «+N» (`puntosDelDia` devuelve `cumples`).
- **Lista del día**: eventos y pagos primero y, al final, un bloque de info extra («Cumpleaños», «Secreto», «Cumpleaños y secreto») con los cumpleaños y los secretos, en filas más discretas (`separarExtras`, `Seccion.extra`). Siguen siendo tocables.
- **Pagos**: único = monedas amontonadas (FontAwesome5 `coins`, blancas sobre el cuadrado naranja), recurrente = las mismas monedas con una insignia de bucle (círculo blanco con flecha circular naranja, SVG, ~46 % del lado, abajo a la derecha; a ≤ 14 px sin punta de flecha). `calendar_range` NO devuelve la frecuencia de los pagos (`recurrence` es null), así que sale de la lista de recurrentes del cliente (`aElementos(filas, frecuencias)`); sin dato se pinta como recurrente. Etiquetas habladas: «Pago único» / «Pago recurrente».
