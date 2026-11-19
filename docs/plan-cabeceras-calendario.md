# Plan: cabeceras fijas y barra única del calendario

Cuatro cambios pedidos por David: (A) títulos de pestaña fijos y mejorados, (B) Mes|Semana + periodo + filtro en una
sola línea con menú desplegable, (C) deslizar en horizontal para cambiar de periodo y (D) un toque sutil en la rejilla.
Se implementan en 4 pasos independientes (§6); A va primero porque B lo usa (botón «Hoy»).

---

## 1. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| A1 | **Cabecera propia** `CabeceraPestana`, fuera del `ScrollView`; `headerShown: false` se queda como está. | El header de `Tabs` (`@react-navigation/elements`) no colapsa como el título grande de iOS, pero animar su separación con el scroll obliga a pasar el estado a `options` (`setOptions` → re-render de navegación) y la ranura derecha con avatares es incómoda. Uno propio pinta igual en iOS, Android y web. Alternativa: header nativo con `headerTitleAlign: 'left'` y fuentes; se descarta por la separación animada. |
| A2 | La línea/sombra de separación sale con **Reanimated** (`useAnimatedScrollHandler`), no con `onScroll` + `setState`. | Ya está instalado (4.7.1) y se usa en `app/laboratorio/index.tsx`. Un `setState` re-renderizaría la pantalla del calendario entera (agrupar, rejilla) al cruzar el umbral; un `SharedValue` no re-renderiza. Sin efectos con `setState`: vale para React Compiler. |
| A3 | **Inicio conserva el título «Inicio»** con los avatares como acción. | Es la puerta a Ajustes (`docs/concepto.md`), y así las 5 pestañas son iguales. |
| A4 | En el Calendario, el botón **«Hoy»** pasa a la acción de la cabecera (solo si no se ve el periodo actual). | En la barra única no cabe, y arriba a la derecha siempre se ve. |
| B1 | Barra única: `[Mes|Semana] [‹ periodo ›] [embudo]`. Etiqueta **en dos líneas** (principal + año). | A 375 px quedan ~94 px para el texto; «Septiembre» cabe, «Septiembre 2026» no. Dos líneas evitan abreviar el mes. |
| B2 | Menú del filtro: **`Modal` transparente** + posición de `measureInWindow`. | Un `View` absoluto dentro del `ScrollView` se recorta y no puede tapar cabecera ni tab bar para «tocar fuera»; en Android el `zIndex` choca con `elevation`. `Modal` cubre todo, da `onRequestClose` (atrás en Android, Escape en web) y funciona en web (react-native-web). |
| B3 | Filtro activo: botón con tinte granate + punto, y **una píldora «Viajes ✕»** bajo la barra solo mientras hay filtro. | Sin ella no se sabe qué filtro oculta cosas sin abrir el menú, y quitarlo cuesta dos toques. **Decide David** (§8): si quiere estrictamente una línea, se quita la píldora y se quita el filtro con «Todos» en el menú. |
| C1 | Gesto con **react-native-gesture-handler 3.3** (`usePanGesture` + `GestureDetector`, ya instalado y en Expo Go) sobre la rejilla, con **deslizamiento corto + fundido** (no un paginador). | Un `ScrollView` horizontal paginado obliga a pintar 3 rejillas (×3 coste de render) y anida scrolls. `PanResponder` en iOS lo cancela el `UIScrollView` vertical. RNGH con `activeOffsetX`/`failOffsetY` es el patrón de las filas deslizables dentro de listas; funciona con ratón en web. |
| C2 | Al cambiar de periodo por gesto: **igual que las flechas** (`ir(n)`): se deselecciona el día y la lista vuelve a la del periodo. | Comportamiento único y ya probado; el filtro se mantiene. |
| D1 | **Fines de semana con tinte cálido** (columnas S y D, también en las iniciales). | Ancla la lectura de la semana sin tocar número ni esquinas (regalo y candado). |
| D2 | **Jerarquía de líneas**: horizontales (entre semanas) de 1 px `border`; verticales hairline `divider`. | Las celdas se leen por semanas. No se mueve el número: arriba a la izquierda chocaría con el regalo (`left: 2`, 17 px) y el «1 dic» no cabe entre regalo y candado en una celda de 46 px. |

---

## 2. A. Cabecera fija de pestaña

### Archivo nuevo `components/CabeceraPestana.tsx`

```ts
/** 0 = arriba del todo; 1 = con 12 px o más de scroll. Para pasar a la cabecera. */
export function useScrollCabecera(): {
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  sombra: SharedValue<number>;
};
export function CabeceraPestana(props: {
  titulo: string;
  accion?: ReactNode;          // ranura derecha (avatares, «Hoy»…)
  sombra?: SharedValue<number>; // sin ella, separación siempre oculta
}): JSX.Element;
```

- Hook: `const sombra = useSharedValue(0)`; `useAnimatedScrollHandler({ onScroll: (e) => { sombra.set(Math.min(1, Math.max(0, e.contentOffset.y / 12))); } })`. Usar `.get()/.set()` (Reanimated 4 + React Compiler), no `.value =`. El rebote negativo de iOS da 0.
- Estructura: `View` con `paddingTop: insets.top`, `backgroundColor: colors.background` (opaco), `zIndex: 1`; dentro, fila `minHeight: 56`, `paddingHorizontal: 20`, `flexDirection: 'row'`, `alignItems: 'center'`, `justifyContent: 'space-between'`, `gap: 12`.
- Título: `Text accessibilityRole="header"`, `fontFamily: fonts.title` (Fraunces 600), **28 px**, `lineHeight: 34`, `letterSpacing: -0.3`, `color: colors.text`, `numberOfLines={1}`, `maxFontSizeMultiplier={1.3}`. Baja de 30 a 28 porque ahora ocupa sitio siempre.
- Acción: `View` con `minHeight: 44`, `alignItems: 'center'`, `justifyContent: 'center'`.
- Separación (`Animated.View` absoluta abajo, `left: 0`, `right: 0`, `height: 1`, `backgroundColor: colors.border`) con `opacity = sombra`. Además, en el contenedor: iOS/web `shadowColor: '#7A3419'`, `shadowOffset {0, 2}`, `shadowRadius: 6`, `shadowOpacity = 0.07 * sombra`; Android `elevation = 2 * sombra` (Reanimated anima `elevation`). Todo en un `useAnimatedStyle`.

### Pantallas

- `app/(tabs)/gastos.tsx`: `raiz` = `<CabeceraPestana titulo="Gastos" sombra={sombra} />` + `Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}`. Quitar el `Text` del título (línea ~80) y `styles.titulo`; `paddingTop` del contenido: `insets.top + spacing.lg` → `spacing.sm`.
- `app/(tabs)/calendario.tsx`: igual. `scrollRef` pasa a `useAnimatedRef<Animated.ScrollView>()` (sigue teniendo `scrollTo`). La acción es el «Hoy» (§3). Quitar `styles.titulo` y el `View styles.periodo` (sustituido por `BarraPeriodo`).
- `components/placeholder-screen.tsx` (Inicio, Mapa, Planificador): cabecera + `Animated.ScrollView` (`contentContainerStyle: { paddingHorizontal: 20, paddingTop: spacing.sm, paddingBottom: 100 }`), `accion` a la cabecera. Unifica el margen lateral a 20 (hoy 24). Nueva prop `proximamente?: boolean` (por defecto `true`); **Inicio pasa `false`**: hoy pinta «Próximamente» encima de sus tarjetas y además no hace scroll (con varias tarjetas pendientes se corta).

---

## 3. B. Barra única del calendario

### Reparto a 375 px (ancho útil 335 = 375 − 2×20)

```
[ Mes | Semana ]  8  [‹]  Noviembre  [›]  8  [⏷]
     125 px          30     ~94 px    30      36
```

- **Segmentado compacto**: nueva prop `compacto?: boolean` en `Segmentado` (`components/onboarding/OpcionRadio.tsx:58`): segmento sin `flex: 1`, `minHeight: 32`, `paddingHorizontal: 10`, texto 13 px; contenedor `padding: 3`; `hitSlop={{ top: 6, bottom: 6 }}` para llegar a 44. ≈125 px.
- **Navegación** (`flex: 1`, centrada): flechas de 30 × 44 (`chevron-back/forward`, 18 px, `colors.textSecondary`, `hitSlop` 6 a los lados). Etiqueta en dos líneas centradas: principal `fonts.bodyBold` 15 px (Mes) / 14 px (Semana), `colors.text`; secundaria (el año) `fonts.bodyMedium` 11 px, `colors.textSecondary`, `lineHeight: 13`. `numberOfLines={1}` + `adjustsFontSizeToFit` + `minimumFontScale={0.85}` en la principal (en web no existe: ahí, 13 px en Semana con `Platform.OS === 'web'`). `maxFontSizeMultiplier={1.2}` en ambas. `accessibilityLiveRegion="polite"` y `accessibilityLabel` con el texto largo.
- A 360 px quedan ~79 px de etiqueta: «Septiembre» (~82 px a 15) se ajusta con `adjustsFontSizeToFit`; en web cabe a 375 (lo que prueba David).
- **Botón embudo**: círculo de 36 px (`hitSlop` 4 → 44), sin filtro: `funnel-outline` 18 px `colors.icon`, borde 1 px `colors.border`, fondo `colors.white`. Con filtro: fondo `colors.accentSoft`, borde 1.5 px `colors.accent`, `funnel` relleno `colors.accent`, y punto de 8 px `colors.accent` arriba a la derecha (`top: 1, right: 1`, borde 2 px `colors.background`). `accessibilityRole="button"`, `accessibilityLabel={`Filtrar${activo ? `: ${etiqueta}` : ''}`}`, `accessibilityState={{ expanded: abierto }}`.

### Etiqueta corta (lógica pura) — `lib/calendario/rejilla.ts`

```ts
export type EtiquetaCorta = { principal: string; secundaria: string; accesible: string };
export function etiquetaPeriodoCorta(vista: Vista, iso: string): EtiquetaCorta;
```
- Mes: `{ principal: 'Noviembre', secundaria: '2026', accesible: 'Noviembre 2026' }`.
- Semana mismo mes: `'23–29 nov'` / `'2026'`. Cruza mes: `'28 dic–3 ene'` (guion largo sin espacios) / `'2026–27'` si cruza año, si no el año. `accesible`: «del 28 de diciembre al 3 de enero de 2027». Mes de `sept` se queda como está en `MESES_CORTOS`.
- `etiquetaPeriodo` sigue existiendo (otros usos); no se toca.

### Filtros — archivo nuevo `lib/calendario/filtros.ts`

```ts
export type OpcionFiltro = { valor: Filtro; etiqueta: string; icono: IconoFiltro };
export type IconoFiltro = IconoMarcador | 'apps' | 'pago';  // 'pago' = monedas del Marcador
export const OPCIONES_FILTRO: readonly OpcionFiltro[];      // Todos, Eventos, Viajes, Comer fuera, Ocio, Cumpleaños, Pagos
export const etiquetaFiltro: (f: Filtro) => string;
export type Rect = { x: number; y: number; width: number; height: number };
/** Esquina superior izquierda del menú: bajo el botón, alineado a su borde derecho; arriba si no cabe; dentro de la ventana con 8 px de margen. */
export function posicionMenu(boton: Rect, ventana: { width: number; height: number }, menu: { ancho: number; alto: number }, margen?: number): { top: number; left: number };
```
- Iconos: los de la rejilla (`ICONO_CATEGORIA` de `lib/calendario/colores.ts`): Eventos `calendar`, Viajes `airplane`, Comer fuera `restaurant`, Ocio `ticket`, Cumpleaños `gift`, Pagos = monedas (`Marcador` con `forma: 'pago'`), Todos `apps`. Nota: no existe filtro «Otros»; «Eventos» = todos menos cumpleaños (como hoy).
- Se pintan con `Marcador` a 22 px y paleta neutra (`relleno: colors.surface`, `borde: colors.icon`, `tinta: colors.icon`); el activo, `relleno: colors.accentSoft`, `borde/tinta: colors.accent`. Helper `marcadorFiltro(op, activo): MarcadorSpec` en `colores.ts`.
- `components/calendario/FiltrosTipo.tsx` se **borra** (su lista pasa a `OPCIONES_FILTRO`).

### Componentes nuevos

- `components/calendario/BarraPeriodo.tsx`
  ```ts
  export function BarraPeriodo(p: { vista: Vista; ancla: string; filtro: Filtro;
    onVista: (v: Vista) => void; onMover: (n: -1 | 1) => void; onFiltro: (f: Filtro) => void }): JSX.Element;
  ```
  Pinta la fila, el botón y, si `filtro !== 'todos'`, la píldora (`Chip` de `components/gastos/Controles` con icono `close`, `accessibilityLabel="Quitar filtro Viajes"`) debajo, alineada a la derecha.
- `components/calendario/MenuFiltros.tsx`
  ```ts
  export function MenuFiltros(p: { visible: boolean; boton: Rect | null; valor: Filtro;
    onElegir: (f: Filtro) => void; onCerrar: () => void }): JSX.Element | null;
  ```
  - Al pulsar el embudo: `ref.current?.measureInWindow((x, y, width, height) => setBoton({ x, y, width, height }))` y abrir (en el manejador, no en un efecto).
  - `<Modal transparent visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCerrar}>` (los dos `Translucent` hacen que el origen del `Modal` coincida con el de `measureInWindow` en Android edge-to-edge).
  - Fondo: `Pressable` a pantalla completa, `rgba(42, 38, 39, 0.08)`, `accessibilityLabel="Cerrar filtros"`.
  - Tarjeta en `posicionMenu(...)`, ancho **224**, filas de **44** (7 × 44 + 12 = 320 alto), `backgroundColor: colors.white`, `borderRadius: radius.lg`, borde 1 px `colors.border`, sombra como la del `+`. `accessibilityViewIsModal`, `accessibilityRole="radiogroup"`, `accessibilityLabel="Filtrar por tipo"`.
  - Fila: icono 22 + 12 + etiqueta 15 px `bodyMedium`; activa: fondo `colors.accentSoft`, texto `bodyBold` `colors.accent`, `checkmark` 18 px a la derecha. `accessibilityRole="radio"`, `accessibilityState={{ checked }}`. Pulsado: `colors.pressed`.
  - «Cascada»: cada fila con `entering={FadeInDown.delay(i * 18).duration(140)}` (Reanimated, barato). Si da problemas en web, sin ella.
  - Elegir → `onElegir(f)` y `onCerrar()`. Cerrar también con el fondo, atrás (Android) y Escape (web, vía `onRequestClose`).

### En `app/(tabs)/calendario.tsx`

- Sustituir `View styles.periodo` + `Segmentado` + `FiltrosTipo` por `<BarraPeriodo …/>`. `onMover = ir`.
- Cabecera: `accion={enPeriodoActual ? null : <BotonHoy onPress={irAHoy} etiqueta={…} />}`: píldora con borde granate (estilos actuales `hoy`/`hoyTexto`, `minHeight: 36` + `hitSlop` 4).

---

## 4. C. Deslizar para cambiar de periodo

### Lógica pura — archivo nuevo `lib/calendario/deslizar.ts`

```ts
export const DESPLAZAMIENTO_SALIDA = 56; // px que sale la rejilla
/** -1 = periodo anterior, 1 = siguiente, 0 = vuelve a su sitio. Es un worklet ('worklet' en la primera línea). */
export function decidirDeslizamiento(dx: number, vx: number, ancho: number): -1 | 0 | 1;
```
- Cambia si `|dx| ≥ min(80, ancho × 0.22)` o (`|vx| ≥ 500` y `|dx| ≥ 24`). Dirección: `dx < 0` → `1` (siguiente), `dx > 0` → `-1`. Si velocidad y distancia van en sentidos opuestos (vuelta atrás al soltar), `0`.

### Gesto y animación (en `calendario.tsx`, envolviendo solo `RejillaMes` / `SemanaDetallada`)

- `app/_layout.tsx`: envolver todo en `<GestureHandlerRootView style={{ flex: 1 }}>` (hoy no está y RNGH lo necesita).
- `const x = useSharedValue(0)`; `const ancho = useSharedValue(375)` (de `onLayout` del contenedor).
- `usePanGesture({ activeOffsetX: [-16, 16], failOffsetY: [-12, 12], onUpdate: (e) => x.set(e.translationX * 0.35), onDeactivate: (e) => { … } })` (importar de `react-native-gesture-handler`; los callbacks corren en el hilo de UI):
  - `d = decidirDeslizamiento(e.translationX, e.velocityX, ancho.get())`.
  - `d === 0` → `x.set(withTiming(0, { duration: 160 }))`.
  - si no → `x.set(withTiming(-d * DESPLAZAMIENTO_SALIDA, { duration: 110 }, (fin) => { if (fin) scheduleOnRN(cambiarPorGesto, d); }))` (`scheduleOnRN` de `react-native-worklets`, como en `SplashHilo.tsx`).
- `cambiarPorGesto(d)` (JS): `entrada.current = d; ultimoArrastre.current = Date.now(); ir(d)`.
- Entrada: `useLayoutEffect(() => { const d = entrada.current; if (!d) return; entrada.current = 0; x.set(d * DESPLAZAMIENTO_SALIDA); x.set(withTiming(0, { duration: 180 })); }, [vista, ancla])`. Va en `useLayoutEffect` para que el valor cambie **después** de pintar el periodo nuevo (sin un fotograma del viejo entrando). Escribe un `SharedValue`, no estado: válido con React Compiler.
- Flechas: `ir(n)` también pone `entrada.current = n` → entran deslizando igual.
- Estilo animado del `Animated.View`: `transform: [{ translateX: x }]`, `opacity: interpolate(|x|, [0, 56], [1, 0.25], 'clamp')`. En web, `userSelect: 'none'` en ese contenedor (que arrastrar con ratón no seleccione texto).
- Toque tras arrastre: `tocarDia` y `abrirLinea` ignoran toques si `Date.now() - ultimoArrastre.current < 250` (en web el `click` puede llegar al soltar).
- Datos: ya se precargan el periodo anterior y el siguiente (`useCalendario(rango, vecinos)`, ≤42 días cada uno) y `keepPreviousData` evita el parpadeo. No hay que tocar `useCalendario`.

---

## 5. D. Rejilla más legible

- Token nuevo en `constants/theme.ts`: `finde: '#FAF6EE'` (crema muy leve sobre el blanco de la caja; contraste 1.08 con blanco: se nota sin pesar).
- `components/calendario/RejillaMes.tsx`: en la fila de iniciales y en cada semana, **primer hijo** (debajo de las celdas) un `View` absoluto `{ top: 0, bottom: 0, left: '71.4286%', right: 0, backgroundColor: colors.finde }` (5/7). Las celdas son transparentes; seleccionada (`accentSoft`) y pulsada siguen encima.
- Líneas: `lineaH` → `height: 1`, `backgroundColor: colors.border`; `lineaV` → `width: StyleSheet.hairlineWidth`, `backgroundColor: colors.divider`.
- Opcional coherente: en `SemanaDetallada`, sábado y domingo con fondo `colors.finde` cuando no estén elegidos.
- Contrastes comprobados sobre `#FAF6EE`: texto 13.9:1, `textSecondary` 6.1:1, `ATENUADO #77706C` **4.51:1** (justo AA). Para tener margen, oscurecer `ATENUADO` en `CeldaDia.tsx:11` a `#736C68` (≈4.8:1 sobre `finde`).

---

## 6. Pasos para el desarrollador (cada uno se prueba por separado)

1. **Cabecera (A)**: `CabeceraPestana.tsx` + hook; Gastos, Calendario (de momento con el «Hoy» movido a la acción), `PlaceholderScreen` con scroll y `proximamente`; Inicio con `proximamente={false}`.
2. **Barra única (B)**: `etiquetaPeriodoCorta`, `lib/calendario/filtros.ts`, `marcadorFiltro`, `Segmentado compacto`, `BarraPeriodo`, `MenuFiltros`; borrar `FiltrosTipo.tsx`.
3. **Deslizar (C)**: `GestureHandlerRootView` en `app/_layout.tsx`, `lib/calendario/deslizar.ts`, gesto y animación en `calendario.tsx`.
4. **Rejilla (D)**: token `finde`, tinte y líneas en `RejillaMes.tsx`, `ATENUADO`.

`npm run typecheck`, `npm run lint` y `npm test` tras cada paso.

## 7. Tests (`lib/calendario/__tests__/`)

- `rejilla.test.ts` → `etiquetaPeriodoCorta`: mes («Noviembre»/«2026»), semana del mismo mes («23–29 nov»), cruzando mes («28 oct–3 nov»), cruzando año («28 dic–3 ene» / «2026–27»), y `accesible`.
- `filtros.test.ts` (nuevo): orden y valores de `OPCIONES_FILTRO` (cubre todo `Filtro`, sin repetidos), `etiquetaFiltro`; `posicionMenu`: debajo y alineado a la derecha del botón; no se sale por la izquierda con un botón cerca del borde; se abre hacia arriba si abajo no cabe; ventana más pequeña que el menú → `top = margen`.
- `deslizar.test.ts` (nuevo): bajo umbral → 0; distancia → ±1 con el signo correcto; *fling* corto rápido → ±1; *fling* de < 24 px → 0; velocidad contraria a la distancia → 0; ancho estrecho (umbral 22 %).
- `colores.test.ts` → `marcadorFiltro`: Pagos da `forma: 'pago'`, el activo usa `accent`.

## 8. Para David

- **Píldora del filtro activo bajo la barra** (B3): recomendada; si la quieres fuera para tener una sola línea siempre, se quita el filtro desde el menú («Todos»).
- ¿También fija la barra `[Mes|Semana] [periodo] [filtro]` (con `stickyHeaderIndices`)? Recomiendo **no**: en un iPhone pequeño la cabecera + barra quitarían ~100 px al mes. Se puede añadir luego en una línea.
- Inicio deja de mostrar «Próximamente» (lo pinta hoy sobre las tarjetas).

## 9. Riesgos y lo que no se verifica sin móvil real

- **Gesto vs scroll vertical y toques** (iOS/Android): los umbrales `activeOffsetX ±16` / `failOffsetY ±12` hay que afinarlos con el dedo. Si un scroll vertical en diagonal cambia de mes, subir `activeOffsetX` a 20.
- **Pull-to-refresh** con el gesto encima: comprobar que bajar desde la rejilla sigue refrescando.
- **Menú en Android edge-to-edge**: el desfase vertical de `measureInWindow` vs `Modal` (por eso los `Translucent`); David no tiene Android: queda sin probar.
- **Web**: arrastrar con ratón (RNGH web) y el `click` fantasma al soltar (mitigado con `ultimoArrastre`); `adjustsFontSizeToFit` no existe, de ahí los 13 px en Semana.
- **Dynamic Type grande** en iPhone: la barra puede no caber con `maxFontSizeMultiplier` > 1.2; está limitado a propósito.
- **Notch / Dynamic Island**: cabecera con `insets.top`; comprobar en Expo Go que el título no queda pegado ni tapado.
- `FadeInDown` dentro de un `Modal` en web: si no anima o parpadea, quitar la cascada (no afecta a la función).
