# Plan: modo oscuro

## 1. Veredicto sobre «invertir la paleta»

Funciona **con dos ajustes**; la inversión literal, no:

- **Fondo: granate casi negro, no granate.** `#5E1A26` de fondo da 11,9:1 con texto crema, pero a pantalla completa vibra y cansa, y deja sin contraste a los colores de estado: fucsia de cumpleaños 2,2:1, naranja de pago 3,5:1, y los errores (hoy granate) desaparecen. Con `#1C1012` se sigue viendo granate y todo pasa AA.
- **Acento: crema mantequilla (`#F2D48A`), distinto del texto (`#F1E8DA`).** Si el acento fuera el mismo crema que el texto, enlaces, pestaña activa y botones dejarían de distinguirse del texto normal. El granate se queda en las superficies, en lo seleccionado (`accentSoft`) y en el contorno del título.
- Las superficies se separan **por luminosidad** (cuanto más elevada, más clara), no por sombra: en oscuro las sombras actuales (`#7A3419`) no se ven.

## 2. Paleta oscura (tokens)

Contrastes medidos sobre `background`; sobre `card` bajan un 8 % y siguen pasando AA.

| Token | Claro | Oscuro | Notas |
|---|---|---|---|
| background | `#FBF7E9` | `#1C1012` | |
| card (nuevo, hoy `white` como fondo) | `#FFFFFF` | `#261518` | tarjetas, hojas, barra de pestañas |
| surface | `#EFEBE3` | `#331F24` | campos, rellenos |
| segmented | `#ECE7DD` | `#3A242A` | |
| text | `#2A2627` | `#F1E8DA` | 15,3:1 |
| textSecondary | `#625C5A` | `#BFAFA6` | 8,7:1 |
| icon | `#4F4946` | `#CDBEB4` | 10,3:1 |
| accent | `#7B2433` | `#F2D48A` | 12,9:1 |
| accentDark | `#5E1A26` | `#F8E7BC` | énfasis = más claro |
| accentSoft | `#F1E1E3` | `#4A2830` | acento encima: 8,9:1 |
| onAccent (nuevo, hoy `white` como tinta) | `#FFFFFF` | `#3A0F18` | texto de botones: 11,5:1 |
| error (nuevo, hoy usa `accent`) | `#7B2433` | `#FF8A80` | 8,1:1 |
| border / divider | `#E6E1D6` / `#EEEAE1` | `#3F2A2F` / `#332125` | decorativos |
| inputBorder | `#DED8CC` | `#7A5C62` | 3:1 |
| casilla (nuevo, hoy `#B9B2A4`) | `#B9B2A4` | `#8A7076` | |
| switchOff (nuevo, hoy `#CFC8BB`) | `#CFC8BB` | `#5A4449` | |
| pressed | `rgba(123,36,51,.14)` | `rgba(242,212,138,.12)` | |
| velo / veloSuave (nuevo) | `rgba(42,38,39,.45)` / `.08` | `rgba(0,0,0,.6)` / `.3` | fondos de hojas y menús |
| sombra (nuevo, hoy `#7A3419`) | `#7A3419` | `#000000` | en oscuro, + borde fino `border` |
| finde / fueraDeMes / diaAtenuado | actuales | `#211316` / `#170D0F` / `#A8968E` | 6,5:1 |
| eventDot / eventChip / eventChipText | actuales | `#86B4DC` / `#1F3446` / `#BFD9EE` | |
| paymentDot / paymentChip / paymentChipText | actuales | `#E2BE52` / `#3D3214` / `#F0DC9A` | |
| pagoMarca / pagoChip / pagoChipTexto | actuales | `#F0954E` / `#46281A` / `#F6C6A0` | |
| cumpleMarca / cumpleChip / cumpleChipTexto | actuales | `#F27AAE` / `#4A1A2E` / `#F7B3D0` | |
| onMarca (nuevo, tinta sobre pago o cumple rellenos) | `#FFFFFF` | `#1C1012` | 7,2:1 |
| tituloRelleno / tituloContorno | `accentDark` / `accent` | `#F2D48A` / `#7B2433` | la inversión de marca: Damion crema con halo granate |

**Colores de persona**, en oscuro: `ink` pasa a ser el pastel actual y `bg` un tinte oscuro (todos entre 8,6:1 y 9,1:1):
menta `#1F3D31`, lavanda `#2F2850`, melocotón `#4A2A1C`, aguamarina `#1C3D3E`, pistacho `#333D16`, malva `#432442`.

**Afinado**: los hex se fijan en código; después David los ajusta en el iPhone de noche, con brillo bajo (lo más probable: `background` ±1 paso y la calidez del acento). Un test automatizado (amplía `lib/calendario/__tests__/colores.test.ts`) comprueba AA en cada par texto/fondo de las dos paletas, así que se puede afinar sin miedo.

## 3. Coste real

- 147 archivos usan `colors.`; 132 tienen `StyleSheet.create` estático con colores; 1617 referencias en total (unas 245 en línea en JSX).
- `colors.white` tiene dos significados (164 usos como fondo y 56 como tinta sobre el acento): **hay que separarlo** en `card` y `onAccent` antes de nada.
- Hay 27 colores literales fuera de `theme.ts` (sombras, velos, interruptor, casillas, contorno blanco del emoji).
- Código fuera de componentes que fija colores al cargar el módulo: `lib/calendario/colores.ts`, `lib/gastos/personas.ts` y `TONOS` en `components/hilo/HiloFisico.tsx`. Pasan a recibir la paleta como parámetro.
- `app.json` tiene `"userInterfaceStyle": "light"`: así iOS siempre dice «claro». Cambiarlo a `automatic` **requiere un build nativo nuevo**: no llega por EAS Update.

## 4. Mecanismo

- `constants/theme.ts`: `paletas = { claro, oscuro }` con las mismas claves; lo que no depende del color (`radius`, `spacing`, `fonts`, `fontSizes`) no cambia.
- **Preferencia**: Ajustes → «Tema: Sistema / Claro / Oscuro», guardada en `expo-secure-store` (ya instalado; clave `ito.tema`). Al arrancar, antes de ocultar el splash, se lee y se llama a `Appearance.setColorScheme('light' | 'dark' | 'unspecified')`. Así **la única fuente es `useColorScheme()`**: no hace falta un contexto con estado ni un `setState` en un effect (compatible con React Compiler), y los selectores nativos, las alertas y el teclado siguen la misma preferencia. Ajustes guarda el valor y llama a `setColorScheme` en el `onPress`.
- `lib/tema.ts`:
  - `useColores()` devuelve `paletas[esquema]`.
  - `crearEstilos((c) => ({...}))` devuelve un hook `useStyles()` con **dos `StyleSheet` cacheados en el módulo** (claro y oscuro, creados la primera vez que se usan). No cuesta nada en cada render y es una función pura.
- **Migración de cada archivo con un codemod**: `const styles = StyleSheet.create({` pasa a `const useStyles = crearEstilos((colors) => ({`, y en el componente `const colors = useColores(); const styles = useStyles();`. Se mantiene el nombre `colors`, así que el diff se reduce a la cabecera y al cierre de cada archivo.
- Al terminar, `no-restricted-imports` prohíbe importar `colors` de `@/constants/theme`, para que no se cuele ningún uso estático nuevo.

## 5. Casos especiales

- **Barra de estado** (`app/_layout.tsx:78`): `style` según el esquema (`light` en oscuro). Los fondos de `Stack` y `Tabs` (`contentStyle`, `sceneStyle`) se toman de `useColores()`.
- **Splash nativo**: `expo-splash-screen` con `dark: { backgroundColor: '#1C1012', image: <logo crema> }`; hace falta un PNG del logo en crema. `SplashHilo` (el de JS) usa los tokens. El icono de la app no cambia (el granate ya se ve bien en oscuro); el icono oscuro de iOS es opcional y va aparte.
- **Título** (`components/TituloContorno.tsx`): solo cambian los tokens `tituloRelleno` y `tituloContorno`; la técnica de las 8 copias se queda igual.
- **Hilo** (`HiloFisico`, `TabBarHilo`, `TirarDelHilo`, `CargandoHilo`): en oscuro el hilo granate no se ve (1,6:1). Los tonos pasan a ser semánticos: `sobreFondo` (granate en claro, mantequilla en oscuro) y `sobreAcento` (crema en claro, granate en oscuro).
- **Mapa** (`MapaSitios.tsx`, `MiniMapa.tsx`, `SelectorUbicacion.tsx`):
  - iOS: `userInterfaceStyle={esquema}` en `MapView`.
  - Android: `customMapStyle` con un JSON oscuro.
  - Los pines se convierten en imagen (`tracksViewChanges` se apaga tras el primer pintado): hay que poner `key` con el esquema en los `Marker` para que se repinten al cambiar de tema.
  - **Los pines no cambian de color** (relleno claro y borde granate, contorno blanco del emoji): sobre el mapa oscuro se leen mejor así. Sus colores pasan a constantes `pin*` fijas, fuera de la paleta.
  - La atribución `rgba(255,255,255,.85)` y la sombra de `BuscadorMapa` pasan a `card` y `sombra`.
- **Hojas inferiores y menús**: `velo` y `card`. En oscuro, una sombra no separa la hoja del fondo: la separa que `card` sea más claro que el fondo.
- **Sombras**: en oscuro, `sombra` negra con el doble de opacidad, y un borde `border` de 1 px en tarjetas y cabecera al desplazarse.
- **SVG** (13 archivos con `react-native-svg`): los `fill` y `stroke` toman los tokens del hook; no hay gráficos de otra librería.
- **Selectores de fecha y hora y `Switch`**: siguen el tema gracias a `Appearance.setColorScheme`; `trackColor` false pasa a `switchOff`.
- **Emojis**: no cambian. El único contorno blanco es el de los pines, que se queda fijo.
- **Avatares** (`onboarding/AvatarPersona.tsx`, velo `.35`): pasan a `velo`.

## 6. Fases

Cada fase se publica sola y deja la app funcionando. El selector de tema solo aparece en Ajustes al terminar la fase 2.

| # | Fase | Archivos principales | Tamaño |
|---|---|---|---|
| 0 | **Tokens semánticos en claro, sin cambio visual**: separar `white` en `card` y `onAccent`; pasar los 27 literales a tokens; crear `error`, `onMarca`, `titulo*` y `velo*`; parametrizar `lib/calendario/colores.ts`, `lib/gastos/personas.ts` y `TONOS`. Se comprueba con capturas antes/después. | ~80 archivos, casi todo con buscar y reemplazar | M |
| 1 | **Infraestructura**: `paletas.oscuro`, `lib/tema.ts` (`useColores`, `crearEstilos`), preferencia y `Appearance` en `app/_layout.tsx`, `userInterfaceStyle: automatic`, splash oscuro, barra de estado, fondos de `Stack` y `Tabs`, test AA de las dos paletas. **Build nativo nuevo.** | `constants/theme.ts`, `lib/tema.ts`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app.json`, test | S |
| 2a | Comunes: `CabeceraPestana`, `TituloContorno`, `hilo/*`, `gastos/Hoja.tsx`, `Controles`, `SelectorFecha`, `SelectorIcono`, `TextoLargo`, avisos | ~25 | M |
| 2b | Inicio y Gastos (`app/(tabs)/index.tsx`, `gastos.tsx`, `app/gastos/*`, `components/gastos/*`, `components/inicio/*`) | ~30 | M |
| 2c | Calendario (`app/calendario/*`, `components/calendario/*`) | ~30 | M |
| 2d | Mapa: tokens, `userInterfaceStyle` y estilo Android, `key` de los pines, pines con colores fijos | ~28 | M |
| 2e | Planificador, Ajustes (con el selector de tema), auth, onboarding, pareja, pantallas sueltas; regla de lint | ~25 | M |
| 3 | Afinado en el iPhone de noche y en el móvil de María | `constants/theme.ts` | S |

Total: **L**, unos 147 archivos. El riesgo está en la fase 0, que cambia el significado de `white`; el resto es mecánico.

## 7. Decisiones de David

1. **Acento crema mantequilla (`#F2D48A`) sobre granate casi negro (`#1C1012`)**, en lugar de la inversión literal (fondo granate `#5E1A26`). Es la recomendación.
2. Hace falta un **build nativo nuevo** (fase 1) y un **PNG del logo en crema** para el splash oscuro.
3. **Pines del mapa sin cambio de color** en oscuro. Es la recomendación.

## 8. Implementado (hex finales y estado)

Decisión de David: acento **pastel**. Hex finales de la paleta oscura (`constants/theme.ts`, test AA en `lib/__tests__/paletas.test.ts`):

| Token | Oscuro | Contraste sobre `background` / `card` |
|---|---|---|
| accent | `#FBF7E9` (el crema del fondo claro) | 17,3 / 16,3 |
| accentDark (énfasis) | `#FFFDF4` | 18,2 / 17,1 |
| text | `#DCD3CB` (crema neutro, distinto del acento) | 12,6 / 11,8 |
| textSecondary / icon | `#B3A49B` / `#C4B6AD` | 7,7 / 9,4 |
| onAccent (texto de botones) | `#3A0F18` | 15,5 sobre accent |
| inputBorder | `#8C6D73` (subido desde `#7A5C62` para llegar a 3:1) | |

El resto, como en la tabla de la sección 2. Mecanismo: `lib/tema.ts` (`useColores`, `crearEstilos`, preferencia `ito.tema` en SecureStore, `Appearance.setColorScheme`); `constants/theme.ts` ya no exporta `colors`, sino `paletas.claro|oscuro` (y `personas` dentro de cada una).
Pines del mapa fijos en la paleta clara (`PinSitio`, `PinResultado`); mapa oscuro: `userInterfaceStyle` (iOS) y `lib/mapa/estiloOscuro.ts` (Android). Splash oscuro: `assets/brand/ito-splash-crema-1024.png` sobre `#1C1012`.
Pendiente: afinado en el iPhone (fase 3); sombras en oscuro sin el borde fino extra; icono oscuro de iOS (opcional). Requiere build nativa nueva (`userInterfaceStyle: automatic`, versión 1.1.0).
