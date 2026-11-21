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

- **En curso**: nada abierto; Planificador F1–F10, avisos push y EAS terminados, sin ver aún en pantalla.
- **Hecho**: onboarding, Gastos, Ajustes, Calendario, Mapa, Planificador, avisos push (probados en iPhone de David), dev build.
- **Próximo**: avisos del Planificador (`notify_plans`) y franja horaria del plan.
- **Pendiente de David**: probar todo en iPhone y con dos cuentas; build y avisos en el móvil de María; variables EAS `preview`/`production`.
- **Clave**: `.env` nunca a git; `service_role` solo en servidor; migraciones con CLI Supabase (`db query`, nunca `db push`) tras el sí de David.
