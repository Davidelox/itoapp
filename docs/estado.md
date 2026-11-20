# Estado del proyecto (detalle)

Detalle de lo hecho, pendientes, tareas manuales en Supabase y decisiones. El resumen corto está en `CLAUDE.md`
(sección «Estado actual»). Leer este archivo solo cuando la tarea lo necesite.

_Actualizado: 2026-11-20 (Mac)_

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

- **Supabase pendiente de David**: «Minimum password length» a 8; confirmar `20261117010000_saldar_seguro.sql` aplicada; prueba del token falso de `supabase/functions/enviar-avisos/LEEME.md`; datos de ejemplo opcionales `supabase/seed/ejemplos_mapa.sql`.
- **Pendiente**: probar en iPhone todo el Mapa nuevo (buscador, colecciones, detalle, pines con emoji, teclado en formularios) y Ajustes → Avisos; pruebas con dos cuentas (dejar una colección y que la otra la vea suya, borrar con aprobación, sitio privado vs compartido, viaje de los dos, «solo esta vez», cumpleaños 29 feb, evento secreto); cuenta Apple Developer (99 USD/año) para push y TestFlight; Planificador sin hacer (planes en granate suave, filtro «Planes»; añadir TW064 a ideas.place_id y plan_tasks.place_id); sitio en pagos recurrentes (`recurring_payments` sin place_id: migración); carrera rara de bloqueo mutuo al dejar una colección justo cuando la pareja aprueba un borrado (error genérico, sin pérdida de datos); `Alert` en vez de toast tras borrar una colección; VoiceOver/TalkBack; «Borrar mi cuenta» sin espacio (Apple); zona horaria en móvil real; filtrar cobros variables en pausa en `pending_actions`; viaje en curso en «Próximos»; refrescar «hoy» tras medianoche; actualizar expo a 58.0.26 (`npx expo install --check`); Android: `softwareKeyboardLayoutMode: "pan"` en app.json si el pie no debe subir con el teclado.
- **Decisiones**: operaciones rápidas en hoja inferior; embudo y mes son menús anclados. Recurrente proporcional conserva el % de creación. Personal = lo paga y es solo de una persona. Un cobro por periodo en recurrentes. `.env` nunca a git; `service_role` solo en servidor. Calendario: varios días máx. 31; cumpleaños = eventos `birthday` (año ancla 2000), borrar = serie entera con aprobación; filtros múltiples; cabecera de pestaña fija propia. Orquestación con subagentes, sesión principal Sonnet.
