# ito

## Sincronización entre equipos (Windows ↔ Mac)

Este proyecto se trabaja alternando entre un PC con Windows y un Mac, sincronizado por GitHub.
Repos sincronizados: **ito** (GitHub: `Davidelox/itoapp`), **god-breaker** (God Breaker) y **claude-skills** (skills globales de Claude Code).

- **"update repos"**: cuando el usuario diga exactamente esta frase, en los TRES repos (ito, god-breaker y claude-skills):
  `git add -A`, commit con un mensaje descriptivo en español de lo hecho, y `git push`.
  Si un repo no tiene cambios, decirlo y seguir con el otro. Nunca subir `.env`.
- **"Estado actual"**: en cada "update repos", ANTES del commit, actualizar en cada proyecto que haya tenido trabajo:
  la sección `## Estado actual
_Actualizado: 2026-11-21 (Mac)_. Detalle (pendientes, decisiones, Supabase) en `docs/estado.md`: leerlo solo si la tarea lo necesita.

- **En curso**: Planificador F6 (migración del itinerario aplicada, pantallas sin hacer); todo lo reciente sin probar en iPhone.
- **Hecho**: Inicio como panel, cabeceras Damion, visitas y reserva, Planificador F1–F5, limpieza de datos de prueba, config EAS y dev client.
- **Próximo**: F6 pantallas del itinerario, F7 sitios del plan, F8 ideas, F9 reservas, F10 Pasados; avisos de planes.
- **Pendiente de David**: pasos de `docs/builds-eas.md` (build de desarrollo, ya no Expo Go), `EXPO_ACCESS_TOKEN`, probar en iPhone con dos cuentas, identificar al tercer usuario.
- **Clave**: `.env` nunca a git; `service_role` solo en servidor; migraciones con CLI Supabase (`db query`, nunca `db push`) tras el sí de David.
