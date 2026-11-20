# Plan · Pestaña Mapa

> 2026-11-20 · Parte de `docs/concepto.md` (§Mapa) y `docs/modelo-datos.md` (§3, §8, §16): **el esquema ya existe**
> (`places`, `place_notes`, `collections`, `collection_places`, vista `place_stats`, borrado con aprobación de
> `place`, `events.place_id`, `expenses.place_id`). Este plan solo añade una migración pequeña de seguridad y la app.

## 1. Visión y alcance

**El Mapa es «vuestros sitios»**: los restaurantes, bares y escapadas que queréis probar o donde ya habéis estado,
con lo que opina cada uno y lo que habéis vivido allí (planes del calendario y gastos).

**Dentro (MVP)**
- Sitios guardados con estado **Quiero ir / Hemos ido**, categoría (`restaurant`, `bar`, `cafe`, `leisure`,
  `getaway`, `other`) y quién lo guardó.
- **Privado (solo tú)** al crearlo, para sorpresas, igual que los eventos secretos: se puede revelar, no volver a ocultar.
- Vista **Mapa** (pines) y vista **Lista**, con filtros por estado y categoría.
- Guardar: **buscar** (Photon/OpenStreetMap) o **a mano** (cruz en el centro del mapa o mantener pulsado).
- Ficha: estado, valoración y nota **de cada uno** (con su color de persona), «Cómo llegar» (Apple Maps, Google Maps,
  Waze), «Ver en Google Maps», editar y pedir borrar.
- Conexiones: sitio en eventos del calendario y en gastos; en la ficha, «Fuisteis N veces · X € · Próximo plan: vie 22»
  y **«Planear aquí»** (crea un evento con el sitio).

**Fuera** (se dice para que no se cuele): colecciones (el esquema ya las soporta; van con el Planificador), pegar
enlaces de Google Maps/Instagram/TikTok, «Compartir con ito» desde otras apps (exige build de desarrollo), importar
Google Takeout, fotos/horario/valoración de Google, agrupación de pines (clustering), rutas dentro de la app,
seguimiento de ubicación, avisos push del mapa (encaje en §9), filtro «Planes» y planes en granate suave (son del
Planificador/Calendario, no de esta pestaña), web (en web solo la Lista).

## 2. Librería de mapas

**Decisión: `react-native-maps` (`npx expo install react-native-maps`, ~1.29 en SDK 58) con el proveedor por defecto.**

| | `react-native-maps` | `expo-maps` |
|---|---|---|
| Expo Go | **Sí, incluida** | No: build de desarrollo |
| iOS | Apple Maps, **sin clave** | Apple Maps, sin clave, iOS 17+ (toques en marcadores, iOS 18+) |
| Android | Google Maps: en Expo Go sin clave propia; en build propia, clave «Maps SDK for Android» (uso gratuito) | Google Maps con clave |
| Marcadores | Vistas de React propias (pin con icono e insignias) | Solo imagen/SF Symbol/monograma |

- Google Maps en iOS (`PROVIDER_GOOGLE`) exige build de desarrollo y clave: no se usa.
- **No se añade su config plugin** a `app.json` mientras se use Expo Go (no hace falta en iOS).
- No soporta web: `components/mapa/MapaSitios.web.tsx` pinta la Lista.
- Alternativa: `expo-maps` cuando haya build de desarrollo; contrapartida: marcadores solo de imagen y iOS 17+.
- Más adelante, con Apple Developer y build de desarrollo, valorar MapLibre Native (tiles MapTiler/Protomaps) para un
  estilo propio; los datos no cambian.

## 3. Búsqueda de sitios

**Decisión: Edge Function `buscar-sitios` que consulta Photon** (geocodificador abierto de OpenStreetMap, sin clave ni
tarjeta). La función hace de proxy: se puede cambiar de proveedor sin tocar la app ni la base de datos y las búsquedas
no salen directamente del móvil.

- **Servidor público de uso razonable**: User-Agent genérico (sin datos del proyecto), límite de peticiones por usuario
  y caché corta de resultados.
- **Si la calidad se queda corta en bares y restaurantes**: cambiar a **MapTiler Geocoding** o Geoapify, con la clave
  guardada como secreto de Edge Function (nunca en el móvil).
- **Se guarda** en `places`: nombre, coordenadas, categoría y dirección. La app muestra la atribución
  «© OpenStreetMap» (en la pantalla de búsqueda y en la ficha).
- **Parámetros**: idioma `es` y sesgo hacia el **centro del mapa** redondeado a 2 decimales (no la ubicación GPS: no
  hace falta permiso).
- **Privacidad**: al proveedor solo llegan el texto y ese centro aproximado; ningún id, email ni token del usuario. La
  función no registra el texto buscado.
- **«Ver en Google Maps»** en la ficha: abre `https://www.google.com/maps/search/?api=1&query=<nombre+dirección o lat,lng>`
  (sin clave ni facturación). Se resuelve por nombre/dirección y no por `place_id`: con nombres repetidos puede abrir
  otro sitio; por eso se usa la dirección completa o las coordenadas.
- **Siempre se puede colocar un pin a mano y ponerle nombre**: OSM puede no tener locales pequeños o nuevos.

## 4. Modelo de datos

Se usa lo que hay. Lectura: `places` (RLS: mi pareja y visible o mío), `place_notes` (si veo el sitio; escribo solo
mi fila), `place_stats` (`security_invoker`). Borrar: `request_deletion(id, 'place', …)` (privado → al momento;
compartido → aprobación). Tiempo real: `places` y `place_notes` ya están en la publicación.

### Migración `supabase/migrations/20261126000000_mapa.sql` (revisa el arquitecto)

Parte A (cambios, en transacción) y parte B (pruebas que acaban en `ROLLBACK`), como las anteriores.

1. **Duplicados con sitios privados** (`modelo-datos.md` §16): hoy `places_provider_uidx (couple_id, provider_place_id)`
   hace fallar a María si David guardó ese sitio en privado, y le revela que existe.
   - `drop index places_provider_uidx;`
   - `create unique index places_google_compartido_uidx on public.places (couple_id, provider_place_id) where provider_place_id is not null and visible_to_partner;`
   - `create unique index places_google_privado_uidx on public.places (couple_id, created_by, provider_place_id) where provider_place_id is not null and not visible_to_partner;`
   - Revelar un privado que ya existe compartido da `23505`: la app dice «Ya está en vuestro mapa» y abre el compartido.
2. **Un sitio compartido no se vuelve privado** (`TW053`, como `TW051` en eventos): la pareja lo tiene en caché, Realtime
   no le avisaría y sus eventos/gastos perderían el sitio. Trigger `before update` en `places` (o ampliar
   `guard_owned_row` solo para `places`): si `private.is_client_write()` y `old.visible_to_partner` y no
   `new.visible_to_partner` → `raise … errcode 'TW053'`.
3. **Solo se enlaza un sitio que ves** (`TW064`): en `private.expenses_before_write` (`esquema_inicial.sql:891`, mismo
   patrón que `event_id`) y en `private.events_before_write` (partir de su **última** definición: `grep -n
   "events_before_write" supabase/migrations/*.sql`): si `place_id` se pone o cambia y
   `not exists (select 1 from public.places p where p.id = new.place_id)` → `TW064`. Las dos funciones son
   `security invoker`, así que el `exists` aplica la RLS de quien escribe.
4. **Etiqueta al borrar sin filtrar lo privado**: en `private.snapshot_before_delete`, rama `places`:
   `where place_id = old.id and (old.visible_to_partner or not visible_to_partner)` (como ya hace con los secretos).
5. **Pruebas (parte B)**: duplicado privado de David + compartido de María coexisten; dos compartidos chocan; ocultar un
   compartido → `TW053`; revelar un privado con compartido igual → `23505`; María enlaza un gasto/evento al sitio
   privado de David → `TW064`; borrar un sitio privado no copia su nombre en un gasto compartido; `request_deletion`
   de un sitio compartido → `pending`, de uno privado → `deleted`.

Sin columnas nuevas. Errores nuevos en la app: `TW053` → «Un sitio compartido no puede volver a ser privado»;
`TW064` → «Ese sitio ya no existe o no lo puedes ver». (`TW052` y `TW060` ya estaban usados.)

## 5. UI

### 5.1 Pestaña (`app/(tabs)/mapa.tsx`)

- `CabeceraPestana` «Mapa» con «+» (Guardar sitio), como Calendario.
- Barra: `Segmentado` compacto **[Mapa | Lista]** + **embudo** (menú anclado, igual que `MenuFiltros`; David lo
  prefiere así) con dos grupos de filtros múltiples: Estado (Quiero ir, Hemos ido) y Categoría (Restaurantes, Bares,
  Cafés, Ocio, Escapadas, Otros). Dentro de un grupo, «o»; entre grupos, «y». Píldoras activas debajo
  (reutilizar `FiltrosActivos`). Filtros en memoria de la pantalla.
- **Mapa**: a pantalla completa bajo la barra. iOS `mapType="mutedStandard"` y `showsPointsOfInterest={false}` para que
  se vean los pines. Encuadre inicial: todos los sitios filtrados (`encuadre()`); sin sitios, España (40,4 / −3,7, delta 6).
  `mapPadding` inferior = alto de la tarjeta + barra de pestañas. **Mantener pulsado** → `/mapa/nuevo?lat=&lng=`.
- **Toque en un pin** → **tarjeta flotante** abajo (no `Hoja`: no tapa el mapa ni lo bloquea): nombre, categoría,
  estado, las dos valoraciones en pequeño, «Cómo llegar» y «Ver ficha». Toque en el mapa la cierra.
- **Lista**: `Quiero ir` y luego `Hemos ido`; dentro, el más reciente primero. Fila: pin de 28 px, nombre, «Restaurante ·
  Calle Mayor 12», tus estrellas, avatar pequeño de quien lo guardó y candado si es privado.

### 5.2 Pin (`components/mapa/PinSitio.tsx`), lenguaje de `docs/plan-calendario-iconos.md`

- Insignia circular de 32 px con pico, **icono de categoría** (Ionicons: `restaurant`, `beer`, `cafe`, `ticket`,
  `airplane` como Viaje en el calendario, `location`).
- **Estado por forma, no solo por color**: Quiero ir = relleno blanco, borde 2 px `accent`, icono `accent`;
  Hemos ido = relleno `accent`, icono blanco. Sin tokens nuevos.
- Insignias en esquina como en la celda del Mes: **candado** (privado) arriba a la derecha; **puntito de calendario**
  arriba a la izquierda si tiene un plan próximo (F7).
- **Los colores de persona no van en el pin** (un sitio es de los dos y la regla prohíbe usarlos para estados).
  Van donde ya se usan: avatar de quien lo guardó y fila de valoración de cada uno (relleno `bg` + contorno `ink`).
- `<Marker tracksViewChanges={false}>` tras el primer pintado (y al cambiar estado/filtro se vuelve a montar con `key`).

### 5.3 Pantallas y hojas

| Qué | Dónde |
|---|---|
| Guardar sitio (buscar, a mano) | Página `app/mapa/nuevo.tsx` (teclado y lista de resultados: no cabe en hoja) |
| Ficha | Página `app/mapa/sitio/[id].tsx`: minimapa fijo de 160 px, dirección, **[Quiero ir \| Hemos ido]** (cambia al momento), «Lo guardó María», valoraciones, conexiones, botones |
| Editar (nombre, categoría, revelar si es privado y tuyo) | `Hoja` desplazable |
| Tu valoración y nota | `Hoja` |
| Cómo llegar | `Hoja` con Apple Maps / Google Maps / Waze (y «Ver en Google Maps» en la ficha) (URLs `https`, sin `LSApplicationQueriesSchemes`) |
| Pedir borrar | `Hoja` de confirmación, como `BorrarGasto`; «Pendiente de borrar» en la ficha si hay solicitud |
| Elegir sitio (formularios de evento y gasto) | `Hoja` con buscador sobre los sitios guardados |

Guardar sitio: campo de búsqueda (desde 3 letras, espera de 300 ms) → resultados → al elegir, vista previa con
nombre editable, categoría propuesta (`primaryType` → categoría), estado, **Visible para tu pareja** (por defecto
`couple_members.share_places`) y tu valoración opcional. Enlace «Añadir a mano»: mapa con cruz fija en el centro y
nombre. `id` generado en el cliente; insert de `places` y después `place_notes`. `23505` → «Ya está en vuestro mapa» y
abre la ficha existente (búsqueda por `provider_place_id`). Ediciones con `.eq('version', v)` (0 filas → recargar y avisar).

### 5.4 Accesibilidad

- Cada `Marker`: `accessibilityLabel` «Taberna El Olivo, restaurante, hemos ido, privado» (función pura).
- Con lector de pantalla activo (`AccessibilityInfo.isScreenReaderEnabled`), la pestaña abre en **Lista**.
- Al abrir la tarjeta flotante, el foco va a su título (`setAccessibilityFocus`).
- Estrellas: `accessibilityRole="adjustable"` con incrementar/decrementar de 0,5; «Tu valoración: 4 y medio de 5».
- Textos con Dynamic Type en Lista, ficha y tarjeta; el segmentado sigue `modoBarra` del Calendario.

## 6. Ubicación

Mínima y opcional (F8): botón «Mi ubicación» en el mapa. Pide permiso **solo al pulsarlo** (`expo-location`,
`requestForegroundPermissionsAsync`, «cuando se usa»); denegado → aviso con «Abrir Ajustes». Se usa para centrar el mapa
y, en «Añadir a mano», para poner la cruz donde estás. **No se guarda ni se envía** a ningún servidor. Plugin de
`expo-location` en `app.json` con el texto del permiso (solo cuenta en la build propia; Expo Go trae el suyo).

## 7. Fases

Cada fase: `npm run typecheck`, `npm run lint` y `npm test` en verde. Tests en `lib/mapa/__tests__/*.test.ts` (lógica
pura; los componentes de mapa no se prueban en Jest).

**F1 · Migración** — `supabase/migrations/20261126000000_mapa.sql` (§4).
- Entrega: SQL con parte B de pruebas. **Revisa el arquitecto.** David la aplica.
- En paralelo con F2 (F2 solo lee; F3 necesita F1 aplicada).

**F2 · Ver (Expo Go)**
- F2a — Datos, Lista y ficha de solo lectura.
  - `lib/mapa/tipos.ts`, `consultas.ts` (`places` con `place_notes` incrustadas; `place_stats` por id en la ficha),
    `useSitios.ts` (React Query `['mapa', coupleId]`) y `useTiempoRealMapa` (`places`, `place_notes`,
    `deletion_requests`) montado en `app/(tabs)/_layout.tsx` junto a `useTiempoRealGastos`.
  - `lib/mapa/categorias.ts` (etiquetas, iconos, `primaryType` → categoría, categoría → categoría del calendario:
    restaurant/bar/cafe → `eating_out`, leisure → `leisure`, getaway → `trip`, other → `other`).
  - `app/(tabs)/mapa.tsx` con la Lista; `app/mapa/sitio/[id].tsx`; `components/mapa/FilaSitio.tsx`, `PinSitio.tsx`.
  - Datos de ejemplo: 6–8 sitios en `supabase/seed/limpiar_y_ejemplos.sql` (uno privado de cada uno).
  - Tests: `categorias`, orden de la Lista, `etiquetaAccesible`.
- F2b — Mapa.
  - `react-native-maps`; `components/mapa/MapaSitios.tsx` (+ `.web.tsx`), `TarjetaSitio.tsx`; [Mapa | Lista].
  - `lib/mapa/encuadre.ts` (0, 1 y n sitios, margen, delta mínimo 0,01).
  - Tests: `encuadre`.

**F3 · Guardar a mano, editar y borrar** (necesita F1 aplicada)
- `app/mapa/nuevo.tsx` en modo manual (cruz central, `?lat=&lng=` desde mantener pulsado); hojas Editar, Cómo llegar
  y Pedir borrar; estado en la ficha; errores `TW053`, `TW064`, `23505` en `lib/mapa/error.ts`.
- `lib/mapa/sitio.ts`: validación (nombre 1–120, lat/lng), fila a insertar (`manual` ⇒ `provider_place_id` null),
  URLs de «Cómo llegar» (codificadas), quién puede revelar.
- Tests: `sitio`, `error`, URLs.

**F4 · Buscar con Photon** (puede hacerse ya, sin cuentas externas)
- `supabase/functions/buscar-sitios/index.ts`: `POST {accion: 'buscar', texto, centro?}`. JWT obligatorio; comprueba con
  el cliente del usuario (RLS) que es miembro activo de una pareja (si no, 403). Valida: `texto` 2–100, `centro` en
  rango. Consulta Photon con User-Agent genérico, límite de peticiones por usuario y caché corta. Máximo 5 resultados.
  Respuesta reducida `{id, nombre, direccion, lat, lng, tipo}`. Proveedor caído o límite → 503 con código `cuota`
  («La búsqueda no está disponible ahora. Añádelo a mano»). Sin logs del texto. Proveedor intercambiable (MapTiler o
  Geoapify con secreto de Edge Function) sin cambiar el formato de respuesta.
- `lib/mapa/busqueda.ts` (mínimo de letras, mapeo de respuestas y de tipo OSM → categoría) y modo búsqueda en
  `nuevo.tsx`, con «© OpenStreetMap» visible; «Ver en Google Maps» en la ficha (URL en `lib/mapa/sitio.ts`).
- Tests: `busqueda` (mapeo, mínimos), URL de Google Maps. **Revisa el arquitecto** (Edge Function: auth, validación).
- En paralelo con F5 y F6.

**F5 · Valoraciones y notas** — `components/mapa/Estrellas.tsx`, `HojaValoracion.tsx`; ficha con la de cada uno y su
color; `upsert` de `place_notes` (borrar la nota = `delete` de mi fila). `lib/mapa/valoracion.ts` (pasos de 0,5, texto
hablado). Tests: `valoracion`. Sin migración.

**F6 · Filtros y accesibilidad** — `lib/mapa/filtros.ts` (grupos, «o»/«y», resumen), `components/mapa/MenuFiltrosMapa.tsx`
(o generalizar `MenuFiltros` si sale sin tocar el Calendario), Lista por defecto con lector de pantalla, foco en la
tarjeta. Tests: `filtros`.

**F7 · Conexiones** (después de F3)
- Formularios de evento y de gasto: fila «Sitio» → hoja Elegir sitio. Quitar la nota de `lib/calendario/evento.ts:6` y
  enviar `place_id`. Un sitio privado en un evento compartido: aviso «Tu pareja no verá el sitio. ¿Hacerlo visible?».
- Detalle de evento: sitio con «Cómo llegar» y «Ver en el mapa». Filas del calendario: «· Taberna El Olivo» en la línea
  secundaria (nombre desde la caché de `useSitios`; sin acceso, nada).
- Ficha: `place_stats` («Fuisteis 3 veces · 142 € · Próximo plan: vie 22»), **«Planear aquí»** →
  `/calendario/nuevo?fecha=hoy&categoria=<mapeo>&sitio=<id>`, y si `visit_count > 0` y Quiero ir: «¿Ya habéis ido?
  Marcar Hemos ido». Pin con puntito de calendario si `next_event_on`.
- Tests: mapeo de categoría, texto de estadísticas, aviso de sitio privado. Sin migración (los guardas están en F1).

**F8 · Mi ubicación (opcional)** — §6. `npx expo install expo-location`. Sin tests nuevos más allá del texto del aviso.

| Paralelo | |
|---|---|
| F1 ∥ F2a ∥ F2b | F2 no escribe |
| F4 ∥ F5 ∥ F6 | Tocan archivos distintos (`nuevo.tsx`+función / ficha / pestaña) |
| F7 | Al final: toca Calendario y Gastos |

## 8. Lo que hace David a mano

1. **F1**: aplicar `20261126000000_mapa.sql` en el SQL Editor (antes de probar F3).
2. **F4**: desplegar `buscar-sitios` (sin claves ni cuentas nuevas).
3. Probar en el iPhone con Expo Go y con las dos cuentas: pines, tarjeta, mantener pulsado, privado que la pareja no
   ve, pedir borrar y aprobar, tiempo real.

## 9. Encaje con los avisos push (después)

- Nueva preferencia `couple_members.notify_partner_places` (por defecto `true`) y trigger `after insert` en `places`
  visibles → `private.enqueue_push(pareja, …, 'partner_place', 'place:<id>:<uid>', 'María ha guardado un sitio',
  '<nombre>', '/mapa/sitio/<id>', 'notify_partner_places')`. Nunca para privados.
- Las solicitudes de borrar un sitio ya avisan por `notify_requests`; su `url` debe abrir `/mapa/sitio/<id>`.

## 10. Riesgos

- **Marcadores con vistas propias en Apple Maps con la nueva arquitectura**: parpadeo, consumo o cierres. Mitigación:
  `tracksViewChanges={false}`, pines simples sin animación. Plan B: 12 PNG (6 categorías × 2 estados) con `image`.
- **Muchos sitios**: sin clustering; por encima de ~200 pines, valorar agrupación.
- **Photon**: servidor público sin garantías y menos cobertura de locales nuevos; mitigación: límite y caché, pin a mano
  siempre disponible y cambio de proveedor en la Edge Function.
- **«Ver en Google Maps»**: busca por nombre/dirección, no por `place_id`; con nombres repetidos puede abrir otro sitio.
- **Web**: `react-native-maps` no funciona; el `.web.tsx` evita romper el bundle.
- **Android en build propia**: necesitará clave «Maps SDK for Android» en `app.json` (en Expo Go no).
- **Sitio privado en algo compartido**: la pareja ve el evento o el gasto sin sitio; se avisa al enlazarlo (F7).
