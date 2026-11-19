# Plan: calendario v3 (barra legible, selector de mes, filtros múltiples, otros meses, pulsación fluida y carga con hilo)

Seis peticiones de David sobre lo hecho en `docs/plan-cabeceras-calendario.md`. Se implementan en **4 pasos** (§8), cada
uno con `npm run typecheck`, `npm run lint` y `npm test` en verde. Revierte la decisión «un filtro a la vez».

---

## 1. Selector Mes|Semana sin texto en iPhone (diagnóstico y corrección)

### Causa (casi segura)

`components/onboarding/OpcionRadio.tsx`: el compacto aplica `[styles.segmento, styles.segmentoCompacto]`, o sea
`flex: 1` **y** `flexGrow: 0, flexShrink: 0, flexBasis: 'auto'`. En Yoga (nativo), `flexBasis: 'auto'` cuenta como
«no puesto» cuando hay `flex > 0`, y entonces la base se resuelve a **0** (`Node::resolveFlexBasis`: `auto` → si `flex > 0`,
0 sin *web defaults*). Con `flexGrow: 0` nadie la hace crecer: cada segmento mide solo su `paddingHorizontal` (20 px) y el
texto queda con ancho 0 (no se pinta). En web, react-native-web expande `flex: 1` a longhands CSS y el `flexBasis: auto`
posterior sí gana: por eso a 375 px en web se ve bien. Es el mismo síntoma que el `flex: 0` que ya hubo que corregir.

### Corrección

- `OpcionRadio.tsx`: quitar `flex: 1` de `styles.segmento` y moverlo a un estilo nuevo `segmentoRepartido: { flex: 1 }` que
  solo se aplica si **no** es compacto. `segmentoCompacto` = `{ minHeight: 32, minWidth: 52, paddingHorizontal: 12 }` (sin
  ninguna propiedad `flex*`: el ancho es el intrínseco del texto, que Yoga mide). Contenedor compacto: `flexShrink: 0`.
- Texto compacto: **14 px** (sube de 13), `numberOfLines={1}`, `maxFontSizeMultiplier={1.2}`; sin `adjustsFontSizeToFit`.
- Nueva prop `iconos?: Partial<Record<T, IoniconName>>` en `Segmentado`: si se pasa, el segmento pinta el icono (18 px,
  mismo color que el texto) en vez del texto, con `minWidth: 40` y `accessibilityLabel={o.etiqueta}`.
- Medidas a 375 pt (335 útiles): `[Mes 52 | Semana ~76] + 6` ≈ 134 · 8 · navegación · 8 · embudo 36 → la navegación tiene
  ~149 px: flechas 2 × 30 y **etiqueta ~89 px**.
- **Modo iconos en pantallas estrechas**: función pura `modoBarra(anchoVentana, fontScale): 'texto' | 'iconos'` en
  `lib/calendario/rejilla.ts` → `'iconos'` si `ancho < 370` o `fontScale >= 1.3`. Iconos: Mes `grid-outline`,
  Semana `list-outline`. A 320 pt (iPhone SE 1.ª gen. o «Zoom de pantalla» en un mini): segmentado 86 px → etiqueta ~82 px.
  `BarraPeriodo` lo lee con `useWindowDimensions()` (`width`, `fontScale`).

Alternativa: anchos fijos medidos («Mes» 52, «Semana» 76). Se descarta: con Dynamic Type o con la fuente aún sin cargar
recortan; el ancho intrínseco + `minWidth` es lo robusto una vez quitado el `flex`.

## 2. Selector de mes al pulsar el periodo

### Decisión

**Desplegable anclado** bajo la etiqueta, mismo mecanismo que el menú del embudo (`Modal` transparente + `measureInWindow`),
centrado en el botón. Es lo que pidió David y es coherente con el filtro; una rejilla de 12 meses cabe de sobra (≈300 × 310).
Alternativa: hoja inferior (más alcanzable con el pulgar), pero rompe la coherencia con el embudo y David pidió desplegable.

### Barra

- La etiqueta (`styles.etiqueta`) pasa de `View` a `Pressable` (ref para medir), `accessibilityRole="button"`,
  `accessibilityLabel="{accesible}. Elegir mes"` (o «Elegir semana»), `accessibilityState={{ expanded }}`,
  `accessibilityHint` no. Se mantiene el anuncio del periodo (`announceForAccessibility`) y se quita `accessibilityRole="header"`.
- Pista visual: un `chevron-down` de 11 px `colors.textSecondary` **en la segunda línea**, junto al año («2026 ▾»), para no
  quitar ancho al nombre del mes. Pulsado: fondo `colors.pressed`, `borderRadius: 10`.
- Un solo estado en `BarraPeriodo`: `const [menu, setMenu] = useState<'filtros' | 'periodo' | null>(null)` y
  `const [rect, setRect] = useState<Rect | null>(null)`. Abrir uno sustituye al otro: **nunca hay dos abiertos** (además el
  `Modal` tapa la barra).

### Lógica pura — archivo nuevo `lib/calendario/selectorMes.ts`

```ts
export const ANIO_MIN = 2000;
export const ANIO_MAX = 2100;
export const limitarAnio = (a: number): number;                 // clamp a [ANIO_MIN, ANIO_MAX]
export const dentroDeLimites = (iso: string): boolean;          // año del iso en el rango
/** Ancla al elegir un mes (mes 1–12): hoy si es el mes actual; si no, el día 1. Año limitado. */
export function anclaDeMes(anio: number, mes: number, hoy: string): string;
export type CeldaMes = { mes: number; etiqueta: string; accesible: string; visible: boolean; actual: boolean };
/** Los 12 meses de `anio` («Ene»…«Dic», accesible «Enero de 2027»), marcando el visible (`ancla`) y el de hoy. */
export function mesesDelAnio(anio: number, ancla: string, hoy: string): CeldaMes[];
export type OpcionSemana = { ancla: string; etiqueta: string; accesible: string; visible: boolean; actual: boolean };
/** Semanas (4–6) que tocan ese mes (`semanasDelMes`), etiqueta corta «28 dic–3 ene»; ancla = lunes, u hoy si es la actual. */
export function semanasParaElegir(anio: number, mes: number, ancla: string, hoy: string): OpcionSemana[];
/** Hacia dónde entra la rejilla al saltar: -1, 0 (mismo periodo) o 1. */
export function direccionSalto(vista: Vista, desde: string, hasta: string): -1 | 0 | 1;
```

- Ancla = hoy en el mes actual para que «Próximos», el botón «Hoy» (`mismoPeriodo`) y la semana de hoy salgan como siempre.
- `calendar_range` (≤ 100 días) y la caché `['calendario', coupleId, userId, desde, hasta]` no se tocan: el rango sigue
  siendo la rejilla visible (≤ 42 días); saltar lejos solo crea otra entrada de caché y `keepPreviousData` evita el parpadeo.
- `posicionMenu` (`lib/calendario/filtros.ts`): nuevo parámetro `alineacion: 'derecha' | 'centro' = 'derecha'`; con
  `'centro'`, `left = boton.x + boton.width / 2 − menu.ancho / 2`, con el mismo *clamp* a `margen`.

### Componente nuevo `components/calendario/SelectorPeriodo.tsx`

```ts
export function SelectorPeriodo(p: { visible: boolean; boton: Rect | null; vista: Vista; ancla: string; hoy: string;
  onElegir: (ancla: string) => void; onCerrar: () => void }): JSX.Element | null;
```

- `Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCerrar}`, fondo
  igual que `MenuFiltros` (`accessibilityLabel="Cerrar"`). Tarjeta con los estilos de `MenuFiltros.menu`;
  ancho `Math.min(296, ventana.width − 16)`, alto fijo **312** (para `posicionMenu`).
- Estado local: `anio` (inicial: año del `ancla`) y `paso: 'meses' | 'semanas'` + `mesElegido`. Se reinicia al abrir:
  el componente se monta con `key` distinto en cada apertura (`key={abiertoN}` en `BarraPeriodo`), sin efectos.
- **Paso meses**: cabecera de 44 px `‹  2026  ›` (flechas 44 × 44, `accessibilityLabel` «Año anterior/siguiente»,
  `disabled` + opacidad 0.3 en `ANIO_MIN`/`ANIO_MAX`; el año `fonts.bodyBold` 16). Rejilla **3 columnas × 4 filas**,
  celdas de 44 alto, `gap: 6`, texto 15 `bodyMedium`. Visible: fondo `colors.accent`, texto blanco `bodyBold`.
  Actual (si no es el visible): borde 1.5 `colors.accent`, texto `colors.accent`. Resto: `colors.text`, pulsado `colors.pressed`.
  `accessibilityRole="button"`, `accessibilityState={{ selected: visible }}`, label «Marzo de 2027» (+ «, mes actual»).
  Pie de 44 px con «Hoy» (botón texto granate) solo si el periodo visible no es el actual → `onElegir(hoy)`.
- Vista **Mes**: tocar un mes → `onElegir(anclaDeMes(anio, mes, hoy))` y cerrar.
- Vista **Semana**: tocar un mes → `paso = 'semanas'`: cabecera «‹ Noviembre 2026» (volver a meses) y una fila de 44 px por
  semana de `semanasParaElegir` (visible y actual marcadas igual que los meses). Tocar → `onElegir(op.ancla)` y cerrar.
  Es la opción más simple que permite llegar a una semana concreta en 2 toques sin un calendario dentro del calendario.
- Cascada `FadeInDown` solo si va bien en web (como en `MenuFiltros`).

### En `app/(tabs)/calendario.tsx`

- `const saltarA = (nueva: string) => { entrada.current = direccionSalto(vista, ancla, nueva); setAncla(nueva); setSeleccionado(null); }`
  y `BarraPeriodo onSaltar={saltarA} hoy={hoy}`. Reutiliza la entrada deslizada del `useLayoutEffect` existente.
- `ir(n)`: si `!dentroDeLimites(mover(vista, ancla, n))`, no hace nada (flechas y gesto se paran en 2000–2100).

## 3. Filtros múltiples

### Modelo (decisión)

Opciones **sin solapamientos**, que juntas lo cubren todo: **Viajes · Comer fuera · Ocio · Otros · Cumpleaños · Pagos**.
«Eventos» desaparece y su hueco lo ocupa «Otros» (categoría `other`, icono `calendar`). Con multi-selección, «Eventos»
(que incluía viajes, ocio…) haría que «Eventos + Viajes» = «Eventos» y la píldora «Viajes» no quitaría nada: confuso. Para ver todos los eventos sin
pagos se marcan las cinco categorías; es raro y aceptable. **Decide David** (§9).

```ts
// lib/calendario/agrupar.ts
export type Filtro = 'trip' | 'eating_out' | 'leisure' | 'other' | 'birthday' | 'payment';
/** Filtros activos en el orden de OPCIONES_FILTRO; vacío = todo. Semántica O entre los elegidos. */
export type Filtros = readonly Filtro[];
/** A qué opción pertenece un elemento: pago → 'payment'; evento → su categoría (desconocida o null → 'other'). */
export function claveFiltro(e: Pick<Elemento, 'tipo' | 'categoria'>): Filtro;
export function filtrar(lista: Elemento[], filtros: Filtros): Elemento[]; // vacío → lista tal cual
// construirLista: `filtro: Filtro` → `filtros: Filtros`; «Aún no hay nada…» si filtros.length === 0.
```

```ts
// lib/calendario/filtros.ts
export const OPCIONES_FILTRO: readonly OpcionFiltro[];                  // las 6, sin «Todos»
export const etiquetaFiltro: (f: Filtro) => string;
export function alternarFiltro(filtros: Filtros, f: Filtro): Filtros;   // añade o quita, devuelve en orden canónico
export function quitarFiltro(filtros: Filtros, f: Filtro): Filtros;
/** Para lectores y el botón: «Viajes», «Viajes y Ocio», «Viajes, Ocio y Pagos»; vacío → «sin filtros». */
export function resumenFiltros(filtros: Filtros): string;
/** Tipo sugerido para «Añadir evento»: solo con UN filtro activo. */
export function sugerenciaNuevo(filtros: Filtros): { tipo?: 'cumple' | 'pago'; categoria?: 'trip' | 'eating_out' | 'leisure' };
```

- Marcar los 6 no se normaliza a vacío (el menú mostraría las casillas desmarcadas de golpe); se ven 6 píldoras y equivale a todo.
- `destino.ts`: `filtroParaVer(filtros: Filtros, e?: Elemento): Filtros` → si vacío o lo deja pasar, igual; si no,
  **añade** `claveFiltro(e)` (no sustituye: respeta lo que tenía y el evento recién guardado se ve, con su píldora).
- `calendario.tsx`: `useState<Filtros>([])`; `nuevoEvento` usa `sugerenciaNuevo`; `onNuevo` se oculta solo si
  `filtros` es exactamente `['payment']`. Semana y lista usan `elementos` ya filtrados: sin cambios.
- `colores.ts`: `marcadorFiltro` igual; quitar `'apps'` de `IconoInsignia` si ya no lo usa nadie.

### Menú del embudo (`components/calendario/MenuFiltros.tsx`)

- Props: `valor: Filtros; onCambiar: (f: Filtros) => void` (en vez de `onElegir`). **No se cierra al marcar**; se cierra
  con el fondo, Atrás, Escape o «Listo».
- Fila (44 px): `Marcador` 22 + etiqueta 15 + casilla 20 × 20 a la derecha (`borderRadius: 6`; sin marcar: borde 1.5
  `colors.inputBorder`; marcada: fondo `colors.accent` + `checkmark` 14 blanco). Marcada también con fondo `accentSoft`.
  `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`. Contenedor: `accessibilityLabel="Filtrar por tipo"`
  (sin `radiogroup`).
- Pie (44 px, separador `divider` arriba): «Limpiar» a la izquierda (`disabled` y gris si no hay filtros) y «Listo» a la
  derecha (`bodyBold`, `colors.accent`). Alto: `6 × 44 + 1 + 44 + 12 = 321`.

### Bajo la barra — componente nuevo `components/calendario/FiltrosActivos.tsx`

```ts
export function FiltrosActivos(p: { filtros: Filtros; onQuitar: (f: Filtro) => void; onLimpiar: () => void }): JSX.Element | null;
```
- Solo si `filtros.length > 0`. Fila: `ScrollView horizontal` (`flex: 1`, sin indicador, `gap: 8`) con las píldoras y, **fija a
  la derecha fuera del scroll**, el botón «quitar todos» (así siempre se ve aunque haya 6 píldoras).
- Píldora: `Marcador` 16 + texto 13 `bodyBold` `colors.accent` + `close` 14; `minHeight: 32`, fondo `accentSoft`, borde
  1.5 `accent`, `hitSlop {top: 6, bottom: 6}`, label «Quitar filtro Viajes».
- Quitar todos: píldora blanca, borde 1 `colors.border`, `funnel` 14 `colors.icon` + `close` 14, `minHeight: 32`,
  `paddingHorizontal: 10`, label «Quitar todos los filtros».
- Entra con `FadeIn.duration(140)` (sin `layout` animado en la rejilla: evita pelearse con el gesto).
- Sustituye a la píldora única de `BarraPeriodo`.

### Botón del embudo

Con filtros: tinte actual + **contador** en vez del punto: insignia `minWidth: 16, height: 16`, `borderRadius: 8`,
`top: -4, right: -4`, fondo `accent`, borde 2 `colors.background`, número 10 `bodyBold` blanco,
`maxFontSizeMultiplier={1}`. Label «Filtrar: Viajes y Ocio».

## 4. Fondo gris en los días de otros meses

- Token en `constants/theme.ts`: `fueraDeMes: '#F2F0EC'` (gris cálido; 1,14:1 con el blanco, se distingue del `finde`
  `#FAF6EE`). Y oscurecer `diaAtenuado` a **`#6B6460`**: 5,1:1 sobre `fueraDeMes` y 5,8:1 sobre blanco (con `#736C68` quedaría
  en 4,53: demasiado justo). Texto normal sobre gris: 13,1:1.
- **Se pinta por fila, no por celda** (las celdas tienen `borderRadius: 10` y dejarían esquinas): función pura en
  `lib/calendario/rejilla.ts`
  ```ts
  /** Columnas (0–6) contiguas de días de otro mes en una semana, o null. Siempre al principio o al final. */
  export function tramoFueraDeMes(semana: string[], mes: string): { desde: number; hasta: number } | null;
  ```
- `RejillaMes.tsx`: tras el `View` del `finde` (para quedar **encima** del tinte de fin de semana y debajo de las celdas),
  un `View` absoluto con `left: desde/7 %`, `width: (hasta−desde+1)/7 %`, `backgroundColor: colors.fueraDeMes`; si toca un
  borde, se extiende hasta el de la tarjeta como el `finde` (`left: -6` si `desde === 0`, `right: -6` si `hasta === 6`,
  `bottom: -8` en la última fila). **Un sábado de otro mes se ve gris** (gana el gris: la semana de otro mes no se lee).
- Hoy en otro mes: círculo granate igual. Seleccionado: el `accentSoft` de la celda va encima del gris (casi no ocurre:
  tocar un día de otro mes cambia de mes). Pulsado: tinte rgba encima, se ve igual.
- Iconos atenuados (`Marcador atenuado` = opacidad 0,55): sobre gris pierden algo; son redundantes con la etiqueta
  accesible. Si David los ve muy flojos, subir a 0,65 (una línea en `Marcador.tsx:33`).

## 5. Pulsación fluida en celdas y filas

### Mecanismo

Reanimated 4.7.1: **un `SharedValue` y dos `useAnimatedStyle` por celda** (42 celdas: barato) para la pulsación, y
**transición CSS de Reanimated 4** (`transitionProperty: 'opacity'`, `transitionDuration: 180`) para el fondo de
seleccionado, que ya cambia con un re-render. Sin `setState` al pulsar (hoy `CeldaDia` re-renderiza por el `pressed` del
render-prop y `FilaDelDia` con `useState`): eso se quita.

Hook nuevo `components/calendario/usePulsacion.ts`:
```ts
export function usePulsacion(p: { arrastre: SharedValue<number>; reducida: boolean; escala: number }): {
  handlers: { onPressIn: () => void; onPressOut: () => void; pulsoAlTocar: () => void };
  estiloTinte: AnimatedStyle;    // opacity
  estiloEscala: AnimatedStyle;   // transform scale
};
```
- `p = useSharedValue(0)`. `onPressIn`: `p.set(withDelay(50, withTiming(1, { duration: 90 })))` (el retraso evita el
  destello al empezar un scroll vertical). `onPressOut`: `p.set(withSpring(0, { damping: 14, stiffness: 260 }))`.
  `pulsoAlTocar` (se llama al principio de `onPress`): si `p.get() < 0.5`, `p.set(withSequence(withTiming(1, { duration: 70 }), withSpring(0, …)))`
  → un toque rapidísimo también se nota, y un scroll cancelado (que no llama a `onPress`) no.
- `estiloTinte`: `opacity: arrastre.get() ? 0 : clamp(p.get(), 0, 1)`. `estiloEscala`: `scale: reducida || arrastre.get() ? 1 : 1 − (1 − escala) × p.get()`
  (el resorte pasa un poco de 1 al soltar: rebote leve).
- `.get()/.set()` siempre (React Compiler).

### Gesto vs pulsación

En `calendario.tsx`: `const arrastre = useSharedValue(0)`; en el `usePanGesture` existente, `onActivate` → `arrastre.set(1)`,
`onDeactivate` → `arrastre.set(0)` (ya son worklets). Se pasa como prop `arrastre` a `RejillaMes` → `CeldaDia` y a
`SemanaDetallada` → `FilaDelDia`. Al activarse el pan (±16 px) el feedback desaparece al instante aunque el `Pressable`
no reciba `onPressOut` a tiempo. Se mantiene `arrastrando()` para ignorar el `onPress`. `reducida = useReducedMotion()` se
lee **una vez** en `RejillaMes`/`SemanaDetallada` y baja como prop.

### `CeldaDia.tsx`

- `Pressable` sin render-prop y sin fondo; dentro, en este orden:
  1. `Animated.View` absoluto, `borderRadius: 10`, `backgroundColor: colors.accentSoft`, `opacity: seleccionado ? 1 : 0`
     + `transitionProperty: 'opacity'`, `transitionDuration: reducida ? 0 : 180` (fundido al seleccionar/deseleccionar).
  2. `Animated.View` absoluto del tinte (`colors.pressed`, `estiloTinte`).
  3. `Animated.View` de contenido (`flex: 1, alignSelf: 'stretch', alignItems: 'center', paddingTop: 3, gap: 1`) con
     `estiloEscala` (escala **0.94**): número, espacio de barras, zona de glifos, regalo y candado.
- **Rebote del número** al seleccionar: `rebote = useSharedValue(1)`; en `onPress`, si `!seleccionado && !reducida`,
  `rebote.set(withSequence(withTiming(1.14, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 300 })))`; se
  aplica al `View` del número (círculo de hoy incluido). En el manejador, no en un efecto.
- Las barras de varios días las pinta la fila: no escalan (0,94 durante ~150 ms no se nota el desfase).
- `accessibilityState={{ selected }}` y la etiqueta, igual.

### `SemanaDetallada.tsx` (`FilaDelDia`)

- Quitar `useState(pulsado)`; `usePulsacion({ escala: 0.985 })` (una fila ancha a 0,94 marea). Los dos `Pressable`
  (día y elementos) comparten los mismos `handlers`. Tinte = `Animated.View` con `estiloTinte`; escala sobre un
  `Animated.View` que envuelve el contenido. Fondo elegido con la misma transición CSS (capa `accentSoft` con opacidad).
- `LineaSemana.tsx`: se queda con su `opacity: 0.6` al pulsar (es un enlace dentro de la fila).

### Lista inferior

En `calendario.tsx`, dentro del `View` que mide `onLayout` (no en él), `ListaDias` va en
`<Animated.View key={seleccionado ?? 'periodo'} entering={reducida ? undefined : FadeIn.duration(180)}>`: al elegir otro
día la lista entra con fundido. La `key` cambia también al cambiar de periodo (vuelve a `'periodo'`… si ya lo era no
re-anima: correcto, ya entra deslizando la rejilla).

## 6. Indicador de carga con el hilo

### Componente nuevo `components/hilo/CargandoHilo.tsx` (misma API que `ActivityIndicator`)

```ts
export function CargandoHilo(p: {
  size?: 'small' | 'large' | number;   // small 28×14, large 52×22; número = ancho (alto = round(ancho × 0,45))
  color?: string;                      // por defecto colors.accent
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;         // por defecto «Cargando»
}): JSX.Element;
```
- Dibujo: un hilo horizontal que ondula con una onda que **fluye** de izquierda a derecha, con los extremos quietos (como
  el hilo de `TabBarHilo`: `sujeto = sin(πs)`). Un solo `Svg` + un `AnimatedPath` (`fill="none"`, `strokeLinecap/Join="round"`,
  `stroke={color}`, `strokeWidth = max(1.5, ancho / 18)` → 2 en small, ~2,9 en large).
- Geometría pura (worklet) en `components/hilo/ondaCarga.ts`:
  ```ts
  /** 25 puntos: x de grosor a ancho−grosor; y = alto/2 + A·sin(πs)·sin(2π·1,5·s − fase), A = alto/2 − grosor. */
  export function puntosOndaCarga(ancho: number, alto: number, grosor: number, fase: number, n?: number): { xs: number[]; ys: number[] };
  ```
  y `d = useDerivedValue(() => { const { xs, ys } = puntosOndaCarga(…, fase.get()); return trazoDePuntos(xs, ys, xs.length); })`
  (`trazoDePuntos` de `geometria.ts`, ya es worklet). `animatedProps = useAnimatedProps(() => ({ d: d.get() }))`.
- Animación: `fase = useSharedValue(0)`; `useEffect` que **solo escribe el valor compartido** (válido con React Compiler):
  si `!reducida`, `fase.set(withRepeat(withTiming(2π, { duration: 1000, easing: Easing.linear }), -1, false))`; limpieza
  `cancelAnimation(fase)`. 2π es periodo exacto: el salto al repetir no se ve. Todo en el hilo de UI, sin timers JS.
- Reduce motion (`useReducedMotion`): se queda quieto con la onda a fase π/2 (se sigue viendo «hilo»).
- Accesibilidad: `View accessible accessibilityRole="progressbar" accessibilityLabel accessibilityState={{ busy: true }}`.
- Funciona en web: `TabBarHilo` ya anima `d` de un `Path` con `useAnimatedProps` allí.

### Sustitución (cambiar import y etiqueta; mismas props)

| Contexto | Archivos | Tamaño |
|---|---|---|
| Pantalla completa / centrado | `app/cargando.tsx:9`, `app/auth/callback.tsx:52`, `app/calendario/nuevo.tsx:23`, `app/calendario/editar/[id].tsx:31`, `app/calendario/evento/[id].tsx:85`, `app/gastos/nuevo.tsx:14`, `app/gastos/editar/[id].tsx:31`, `app/gastos/[id].tsx:57`, `app/gastos/bote.tsx:56`, `app/gastos/movimiento/[id].tsx:51`, `app/gastos/recurrentes.tsx:55`, `app/gastos/pago/[id].tsx:47`, `app/gastos/recurrente/[id].tsx:44`, `app/gastos/recurrente/nuevo.tsx:18` | `size="large"` |
| Dentro de una sección o lista | `app/(tabs)/calendario.tsx:294,326`, `app/(tabs)/gastos.tsx:85`, `app/ajustes/index.tsx:161`, `app/gastos/historial.tsx:156,180`, `app/gastos/bote.tsx:201`, `components/calendario/HojaQuienPago.tsx:61`, `components/gastos/HojaSaldar.tsx:67`, `components/onboarding/TarjetaEleccion.tsx:38`, `components/onboarding/PantallaInvitar.tsx:129` (conserva su `accessibilityLabel`) | por defecto (small) |
| Botón y avatar (blanco) | `components/onboarding/Botones.tsx:30` (`size={22}`), `components/onboarding/AvatarPersona.tsx:45` | 22 / small |
| **Se quedan nativos** | Los `RefreshControl` (no son `ActivityIndicator`) | — |

En `Botones.tsx` el botón ya anuncia `busy` y su texto: el indicador no debe leerse otra vez. Prop opcional
`oculto?: boolean` en `CargandoHilo` → `accessible={false}`, `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`.

## 7. Tests (`__tests__/*.test.ts`)

- `lib/calendario/__tests__/rejilla.test.ts`: `modoBarra` (375/1 → texto; 320/1 → iconos; 390/1,35 → iconos);
  `tramoFueraDeMes` (nov-2026: la primera semana, 26 oct–1 nov → `{desde: 0, hasta: 5}`; una semana entera del mes → null; la última,
  30 nov–6 dic → `{desde: 1, hasta: 6}`; febrero de 2027, que empieza en lunes → null en la primera).
- `selectorMes.test.ts` (nuevo): `anclaDeMes` (mes actual → hoy; otro → día 1; febrero; año 1999 → 2000, 2101 → 2100);
  `mesesDelAnio` (12, una visible, una actual, otra año sin actual); `semanasParaElegir` (4–6 semanas, febrero de 2027
  empieza lunes, semana que cruza año con etiqueta «28 dic–3 ene», la de hoy con ancla = hoy); `direccionSalto`
  (atrás/adelante/igual, también en Semana); `dentroDeLimites`.
- `filtros.test.ts`: `OPCIONES_FILTRO` = las 6 sin repetir; `alternarFiltro` (añade en orden canónico, quita, idempotencia
  doble); `quitarFiltro`; `resumenFiltros` (0, 1, 2, 3); `sugerenciaNuevo` (uno de cada, dos → vacío, `other` → vacío);
  `posicionMenu` con `'centro'` (centrado y *clamp* en ambos bordes).
- `agrupar.test.ts`: `claveFiltro` (categoría null/desconocida → `other`); `filtrar` con `[]`, `['payment']`,
  `['trip','birthday']` (unión), `['other']` (ya no incluye viajes: actualizar los tests que usaban `'event'`);
  `construirLista` con `filtros: []` / `['payment']` (textos de vacío).
- `destino.test.ts`: `filtroParaVer` (vacío → vacío; lo deja pasar → igual; no → se **añade** su clave, en orden).
- `colores.test.ts`: quitar los casos de `'apps'` si se elimina; `other` → `calendar`.
- `components/hilo/__tests__/ondaCarga.test.ts` (nuevo): 25 puntos; extremos en `alto/2`; todo dentro de
  `[grosor, alto − grosor]`; `fase` y `fase + 2π` dan lo mismo; x crecientes.

## 8. Pasos para el desarrollador

1. **Barra y selector de mes** (§1, §2): fix de `Segmentado` + prop `iconos`, `modoBarra`, `selectorMes.ts`,
   `posicionMenu(…, 'centro')`, `SelectorPeriodo.tsx`, estado `menu` en `BarraPeriodo`, `saltarA` y límites en `ir`.
2. **Filtros múltiples** (§3): tipos y `filtrar`/`construirLista`, `filtros.ts`, `destino.ts`, `MenuFiltros` con casillas,
   `FiltrosActivos.tsx`, contador del embudo, `calendario.tsx` (`Filtros`, `sugerenciaNuevo`).
3. **Otros meses y pulsación** (§4, §5): tokens, `tramoFueraDeMes`, capa gris en `RejillaMes`, `usePulsacion`,
   `CeldaDia`, `SemanaDetallada`, `arrastre` en el gesto, fundido de la lista.
4. **CargandoHilo** (§6): `ondaCarga.ts`, `CargandoHilo.tsx`, sustitución archivo a archivo.

## 9. Para David

- **«Eventos» pasa a «Otros»** en el filtro (opciones que no se pisan). Si prefieres conservar «Eventos» (= todo menos
  cumpleaños), se puede, pero entonces «Eventos + Viajes» se ve igual que «Eventos».
- El gris de otros meses **tapa el crema** del fin de semana en esos días.
- En pantallas de menos de 370 pt (o letra muy grande) el selector Mes|Semana muestra **iconos** en vez de texto.
- En Semana, el desplegable va en dos toques: mes → semana.

## 10. Riesgos y lo que solo se ve en un móvil real

- **El fix del segmentado** se basa en el comportamiento de Yoga con `flex` + `flexBasis: 'auto'`; comprobar en Expo Go
  que «Mes» y «Semana» se leen a 14 px y con Dynamic Type al máximo (tope 1,2).
- **Retraso de 50 ms** en el tinte: afinar con el dedo (si en scroll vertical aún destella, 80 ms).
- **Transiciones CSS de Reanimated 4** (`transitionProperty`) en Expo Go y web: si alguna no anima, cambiar a
  `useAnimatedStyle` + `withTiming` con un `SharedValue` derivado de la prop (sin efecto de estado).
- **Rendimiento**: 42 celdas con 3 estilos animados cada una; probar el gesto de deslizar en un iPhone antiguo. Si va
  justo, quitar el rebote del número (1 `SharedValue` menos por celda).
- **Píldoras en scroll horizontal** dentro del `ScrollView` vertical: en iOS bien; en web, scroll con rueda poco natural (aceptable).
- **Modal anclado** en Android edge-to-edge: sin probar (David no tiene Android), igual que el menú del embudo.
- **CargandoHilo**: nitidez del trazo de 2 px a 28 px de ancho en pantalla @3x y que no «tiemble» en web (si lo hace,
  subir `n` a 33 puntos).
