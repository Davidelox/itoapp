# Estado del proyecto (detalle)

Detalle de lo hecho, pendientes, tareas manuales en Supabase y decisiones. El resumen corto está en `CLAUDE.md`
(sección «Estado actual»). Leer este archivo solo cuando la tarea lo necesite.

_Actualizado: 2026-11-21 (Mac)_

- **Inicio** (panel completo): próximo evento, esta semana, próximo plan (≥2 días), último lugar visitado con fecha real, últimos movimientos, «¿Quién pagó?» en línea, primeros pasos, hilo con los dos nombres y anillo de color en las fotos. Chip «Reservado» en eventos. Cabeceras de pestaña con Damion en granate oscuro con contorno (`TituloContorno`).
- **Visitas y reserva**: visitas de sitios con fecha (varias por sitio) y reserva de eventos (interruptor + nota).
- **Planificador F1–F5**: lista de Próximos, crear/editar plan, detalle con tareas, reservas asignadas y tareas sugeridas por tipo, presupuesto, gastos del plan, saldo y «Saldar solo esto», plan como fila en Saldar, pedir borrar plan, bandas de planes en el calendario con filtro «Planes» (tocar abre `/planificador/<id>`). F6 (itinerario): migración aplicada, SIN pantallas.
- **Limpieza de producción** (`supabase/seed/limpiar_todo.sql`, ensayo por defecto, ver `supabase/seed/LEEME.md`): borrado todo el contenido; conservados usuarios, perfiles, pareja, miembros y ajustes. Hay un tercer usuario fuera de la pareja sin identificar.
- **EAS**: `app.json` (bundle `com.davidelox.ito`), `expo-dev-client`, `eas.json` (development/preview/production), guía `docs/builds-eas.md`. David tiene Apple Developer y dos iPhone (sin Firebase). Ya no se usa Expo Go: hay que hacer build de desarrollo.
- **Hecho**: onboarding, emails con logo, Gastos fases 1–4, Ajustes, Calendario v1–v3 (pulido, «Poner importe» desde el calendario, editar evento vuelve al detalle, etiqueta «Cumpleaños de X»).
- **Avisos push**: servidor completo y aplicado en producción (migraciones avisos_base, avisos_programados, avisos_pareja; Edge Function `enviar-avisos`; cron `ito-avisos`; secretos Vault avisos_url/avisos_secret y AVISOS_SECRET). Cliente fase 2 hecho (`lib/avisos`, Ajustes → Avisos, rutas, registro de token; degrada en Expo Go; sin probar en móvil). No llegan push reales hasta tener Apple Developer: `eas init`, bundleIdentifier com.davidelox.ito, expo-dev-client, eas.json, `eas device:create`, build de desarrollo, EXPO_ACCESS_TOKEN en la función; si María usa Android, también Firebase/FCM.
- **Mapa** (plan en `docs/plan-mapa.md`): pestaña Mapa (Lista/Mapa, filtros, ubicación, ficha, guardar a mano o buscando, «Planear aquí», selector de sitio en eventos y gastos). Colecciones personalizadas completas: crear/editar con emoji, varias por sitio, principal con icono en el pin, filtro por colecciones, detalle con Lista/Mapa y añadir/quitar sitios, «Mis colecciones». Borrado de colecciones (migración `20261128000000_colecciones_borrado`, aplicada): solo pide permiso si la pareja añadió sitios; si no, se «deja» (la pareja la conserva como suya y privada y puede volver a compartirla); `preview_collection_deletion`; TW054 una compartida no vuelve a privada. Cartel de confirmación en todos los borrados (`HojaConfirmar`). Valoración con estrellas solo en «Hemos ido» (nota de texto en ambos estados).
- **Buscador**: Photon da 403 a los servidores de Supabase, así que la app llama a Photon directamente desde el móvil (`lib/mapa/photon.ts`; constante `PROVEEDOR_BUSQUEDA = 'directo' | 'funcion'` en `lib/mapa/consultas.ts`). La Edge Function `buscar-sitios` sigue desplegada sin uso (plan B con proveedor con clave: MapTiler/Geoapify). Orden por cercanía con distancia, búsqueda sobre el mapa con pines y carrusel, autocompletado, «Buscar en esta zona», zoom a resultado y deshacer, minimapa de la ficha lleva al mapa.
- **UI**: formularios con pie fijo que no sube con el teclado (evento, gasto, recurrente, colección, guardar sitio); emojis centrados con `EmojiIcono` (ajuste -2,5 % solo en pines dentro de `Marker`, `AJUSTE_EMOJI_MAPA` en `PinSitio.tsx`); contorno blanco fino en pines visitados.
- **Avisos**: `AVISOS_SECRET` y Vault `avisos_secret` rotados el 2026-11-20 con el mismo valor; vigilar que el primer aviso real no dé 401 (`supabase logs --remote --service function-edge`). Claude no puede leer Vault.
- **Método**: Claude aplica migraciones y despliegues con la CLI vinculada (`supabase db query --remote -f <archivo> --yes`, nunca `db push`) tras el sí de David; consultas en solo lectura con `--read-only`.
- **Docs**: `docs/plan-*.md` (gastos, ajustes, onboarding, calendario v1–v3, iconos, cabeceras, mapa), `revision-diseno.md`.

## Migraciones aplicadas en producción
| Archivo | Fecha | Qué hace |
|---|---|---|
| 20261120000000 / 20261121000000 | 2026-11-20 | Calendario (eventos, categorías) |
| 20261122000000_borrar_cumple_etiqueta | 2026-11-20 | Etiqueta de cumpleaños en borrados |
| 20261123000000_avisos_base | 2026-11-20 | Base de avisos push |
| 20261124000000_avisos_programados | 2026-11-20 | Avisos programados |
| 20261125000000_avisos_pareja | 2026-11-20 | Avisos de la pareja |
| 20261126000000_mapa | 2026-11-20 | Tablas del Mapa |
| 20261127000000_places_osm | 2026-11-20 | Enum place_provider con 'osm' |
| 20261128000000_colecciones_borrado | 2026-11-20 | Reglas de borrado/«dejar» colecciones, `preview_collection_deletion` |
| 20261129000000_visitas_y_reserva | 2026-11-21 | `place_visits`, `place_stats` con `last_visit_on`/`suggested_visit_on`, `events.reserved`/`reservation_note`; TW065 |
| 20261130000000_planificador_base | 2026-11-21 | Gastos de un plan siempre compartidos (TW066), TW064 en tareas/ideas, CHECKs de planes ≤60 días, TW012 |
| 20261201000000_itinerario | 2026-11-21 | TW067 fechas, TW068 versión, TW069 evento no cambia de plan; `move_plan`; `y_plan_collection`; borrar elemento del itinerario sin aprobación |

- **Supabase pendiente de David**: prueba del token falso de `supabase/functions/enviar-avisos/LEEME.md`; `EXPO_ACCESS_TOKEN` (dárselo a Claude para guardarlo como secreto de `enviar-avisos`); datos de ejemplo opcionales `supabase/seed/ejemplos_mapa.sql`.
- **Pendiente de David**: pasos de `docs/builds-eas.md` (`eas login`, `eas init` y commitear el `projectId`, variables públicas de Supabase en EAS, `eas device:create` con los dos iPhone, `eas build --profile development --platform ios`, instalar, modo desarrollador, `npx expo start --dev-client`); probar en iPhone y con dos cuentas (Mapa, Avisos, Inicio, Planificador; todo se hizo sin verlo en pantalla); identificar al tercer usuario.
- **Próximo**: F6 pantallas (itinerario por días, mover plan con `move_plan`, añadir al itinerario desde la ficha del sitio), F7 sitios del plan, F8 ideas y «Convertir en plan», F9 reservas enlazadas al itinerario, F10 Pasados y resumen; avisos de planes.
- **Pendientes menores**: sitio en pagos recurrentes (migración); icono «Reservado» en la fila del calendario (ampliar `calendar_range`); `npx expo install --check`; `Alert` en vez de toast tras borrar colección; carreras raras de bloqueo mutuo (error genérico, sin pérdida); VoiceOver/TalkBack; «Borrar mi cuenta» (Apple); zona horaria en móvil real; filtrar cobros variables en pausa en `pending_actions`; refrescar «hoy» tras medianoche.
- **Decisiones**: operaciones rápidas en hoja inferior; embudo y mes son menús anclados. Recurrente proporcional conserva el % de creación. Personal = lo paga y es solo de una persona. Un cobro por periodo en recurrentes. `.env` nunca a git; `service_role` solo en servidor. Calendario: varios días máx. 31; cumpleaños = eventos `birthday` (año ancla 2000), borrar = serie entera con aprobación; filtros múltiples; cabecera de pestaña fija propia. Orquestación con subagentes, sesión principal Sonnet.
