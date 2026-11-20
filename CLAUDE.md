# ito

## Sincronización entre equipos (Windows ↔ Mac)

Este proyecto se trabaja alternando entre un PC con Windows y un Mac, sincronizado por GitHub.
Repos sincronizados: **ito** (GitHub: `Davidelox/itoapp`), **god-breaker** (God Breaker) y **claude-skills** (skills globales de Claude Code).

- **"update repos"**: cuando el usuario diga exactamente esta frase, en los TRES repos (ito, god-breaker y claude-skills):
  `git add -A`, commit con un mensaje descriptivo en español de lo hecho, y `git push`.
  Si un repo no tiene cambios, decirlo y seguir con el otro. Nunca subir `.env`.
- **"Estado actual"**: en cada "update repos", ANTES del commit, actualizar en cada proyecto que haya tenido trabajo:
  la sección `## Estado actual
_Actualizado: 2026-11-20 (Mac)_. Detalle (pendientes, decisiones, Supabase) en `docs/estado.md`: leerlo solo si la tarea lo necesita.

- **En curso**: Avisos push (servidor aplicado, cliente hecho) y Mapa F1–F8 hechos; falta probar en iPhone.
- **Hecho**: onboarding, Gastos, Ajustes, Calendario v1–v3, Avisos push, Mapa.
- **Próximo**: pestaña Planificador; cuenta Apple Developer para push reales y TestFlight.
- **Pendiente de David**: probar en iPhone; «Minimum password length» a 8; confirmar `20261117010000_saldar_seguro.sql`.
- **Clave**: `.env` nunca a git; `service_role` solo en servidor; migraciones con CLI Supabase (`db query`, nunca `db push`) tras el sí de David.
