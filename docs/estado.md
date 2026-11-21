# Estado del proyecto (detalle)

Detalle de lo hecho, pendientes, tareas manuales en Supabase y decisiones. El resumen corto está en `CLAUDE.md`
(sección «Estado actual»). Leer este archivo solo cuando la tarea lo necesite.

_Actualizado: 2026-11-21 (Mac)_

- **Inicio** (panel completo): próximo evento, esta semana, próximo plan (≥2 días), último lugar visitado con fecha real, últimos movimientos, «¿Quién pagó?» en línea, primeros pasos, hilo con los dos nombres y anillo de color en las fotos. Chip «Reservado» en eventos. Cabeceras de pestaña con Damion en granate oscuro con contorno (`TituloContorno`).
- **Visitas y reserva**: visitas de sitios con fecha (varias por sitio) y reserva de eventos (interruptor + nota).
- **Planificador F1–F10 completo**: lista Próximos/Ideas/Pasados, crear/editar plan, tareas y reservas asignadas con plantillas, presupuesto, gastos del plan, saldo, «Saldar solo esto», plan como fila en Saldar, pedir borrar plan con aprobación, itinerario por días, mover plan con su itinerario (`move_plan`), sitios del plan y «Añadir al itinerario» desde la ficha del sitio, ideas y «Convertir en plan», Pasados con resumen y duplicar plan, reservas enlazadas al itinerario sincronizadas con «Reservado» (bidireccional, TW072), bandas de planes en el calendario con filtro «Planes» y elementos del itinerario como eventos «Plan: …». Diseño en `docs/plan-planificador.md`.
- **Limpieza de producción** hecha (`supabase/seed/limpiar_todo.sql`, ver `supabase/seed/LEEME.md`): conservados usuarios, perfiles, pareja, miembros y ajustes; el espacio está vacío. Hay un tercer usuario fuera de la pareja sin identificar.
- **EAS**: proyecto `@davidelodax/ito`, `projectId` en `app.json` (bundle `com.davidelox.ito`), `expo-dev-client`, `eas.json`, guía `docs/builds-eas.md`. Development build instalada en el iPhone de David (la de María pendiente). Variables públicas de Supabase en EAS solo para `development` (faltan `preview` y `production`). Servidor: `npx expo start --dev-client`. Ya no se usa Expo Go.
- **Hecho**: onboarding, emails con logo, Gastos fases 1–4, Ajustes, Calendario v1–v3 (pulido, «Poner importe» desde el calendario, editar evento vuelve al detalle, etiqueta «Cumpleaños de X»).
- **Avisos push**: funcionan de punta a punta en el iPhone de David («Probar aviso»: registro, cola, cron, `enviar-avisos`, Expo y APNs). Servidor: migraciones avisos_base/programados/pareja, Edge Function `enviar-avisos`, cron `ito-avisos`, Vault avisos_url/avisos_secret, `EXPO_ACCESS_TOKEN` como secreto de la función. Arreglado el cuelgue al aceptar el permiso (plazos por paso y diagnóstico en Ajustes → Avisos). Si María usa Android haría falta Firebase/FCM.
- **Mapa** (plan en `docs/plan-mapa.md`): pestaña Mapa (Lista/Mapa, filtros, ubicación, ficha, guardar a mano o buscando, «Planear aquí», selector de sitio en eventos y gastos). Colecciones personalizadas completas: crear/editar con emoji, varias por sitio, principal con icono en el pin, filtro por colecciones, detalle con Lista/Mapa y añadir/quitar sitios, «Mis colecciones». Borrado de colecciones (migración `20261128000000_colecciones_borrado`, aplicada): solo pide permiso si la pareja añadió sitios; si no, se «deja» (la pareja la conserva como suya y privada y puede volver a compartirla); `preview_collection_deletion`; TW054 una compartida no vuelve a privada. Cartel de confirmación en todos los borrados (`HojaConfirmar`). Valoración con estrellas solo en «Hemos ido» (nota de texto en ambos estados).
- **Buscador**: Photon da 403 a los servidores de Supabase, así que la app llama a Photon directamente desde el móvil (`lib/mapa/photon.ts`; constante `PROVEEDOR_BUSQUEDA = 'directo' | 'funcion'` en `lib/mapa/consultas.ts`). La Edge Function `buscar-sitios` sigue desplegada sin uso (plan B con proveedor con clave: MapTiler/Geoapify). Orden por cercanía con distancia, búsqueda sobre el mapa con pines y carrusel, autocompletado, «Buscar en esta zona», zoom a resultado y deshacer, minimapa de la ficha lleva al mapa.
- **UI**: formularios con pie fijo que no sube con el teclado (evento, gasto, recurrente, colección, guardar sitio); emojis centrados con `EmojiIcono` (ajuste -2,5 % solo en pines dentro de `Marker`, `AJUSTE_EMOJI_MAPA` en `PinSitio.tsx`); contorno blanco fino en pines visitados.
- **Secretos de avisos**: `AVISOS_SECRET` y Vault `avisos_secret` rotados el 2026-11-20 con el mismo valor; claude no puede leer Vault. Logs: `supabase logs --remote --service function-edge`.
- **Método**: Claude aplica migraciones y despliegues con la CLI vinculada (`supabase db query --remote -f <archivo> --yes`, nunca `db push`) tras el sí de David; las sensibles pasan por revisión independiente del arquitecto y se prueban en Postgres local (arnés PGlite en el scratchpad, no está en el repo); consultas en solo lectura con `--read-only`.
- **Docs**: `docs/plan-*.md` (gastos, ajustes, onboarding, calendario v1–v3, iconos, cabeceras, mapa, planificador), `revision-diseno.md`.

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
| 20261202000000_reservas_plan | 2026-11-21 | Reservas del plan enlazadas al itinerario y sincronizadas con «Reservado»; TW072 |
| 20261203000000_calendario_itinerario | 2026-11-21 | El calendario incluye los elementos del itinerario como eventos «Plan: …» |

- **Supabase pendiente de David**: prueba del token falso de `supabase/functions/enviar-avisos/LEEME.md`; datos de ejemplo opcionales `supabase/seed/ejemplos_mapa.sql`.
- **Pendiente de David**: ver todo en el iPhone (Inicio, Planificador, Mapa, calendario: nada reciente visto en pantalla); móvil de María (build de desarrollo, registro de avisos, «Probar aviso»); pruebas con dos cuentas (dejar colección, aprobar borrados, saldar, plan con gastos, reserva marcada desde el otro móvil); variables públicas de EAS para `preview`/`production`; identificar al tercer usuario; TestFlight cuando quiera usarla sin el Mac (build `production` + `eas submit`).
- **Próximo**: avisos del Planificador (`notify_plans`: víspera del plan, tarea con fecha, tarea asignada, reservas pendientes a 7 días; ver `docs/plan-planificador.md` §6); franja horaria (mañana/tarde/noche) en el formulario del plan.
- **Pendientes menores**: icono «Reservado» en la fila del calendario (ampliar `calendar_range`); sitio en pagos recurrentes (migración); `npx expo install --check`; `Alert` en vez de toast tras borrar colección; carreras raras de bloqueo mutuo (error genérico, sin pérdida); VoiceOver/TalkBack; «Borrar mi cuenta» sin espacio (Apple); zona horaria en móvil real; filtrar cobros variables en pausa en `pending_actions`; refrescar «hoy» tras medianoche.
- **Decisiones**: operaciones rápidas en hoja inferior; embudo y mes son menús anclados. Recurrente proporcional conserva el % de creación. Personal = lo paga y es solo de una persona. Un cobro por periodo en recurrentes. `.env` nunca a git; `service_role` solo en servidor. Calendario: varios días máx. 31; cumpleaños = eventos `birthday` (año ancla 2000), borrar = serie entera con aprobación; filtros múltiples; cabecera de pestaña fija propia. Orquestación con subagentes, sesión principal Sonnet.
