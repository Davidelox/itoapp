# ito

## Sincronización entre equipos (Windows ↔ Mac)

Este proyecto se trabaja alternando entre un PC con Windows y un Mac, sincronizado por GitHub.
Repos sincronizados: **ito** (GitHub: `Davidelox/itoapp`), **god-breaker** (God Breaker) y **claude-skills** (skills globales de Claude Code).

- **"update repos"**: cuando el usuario diga exactamente esta frase, en los TRES repos (ito, god-breaker y claude-skills):
  `git add -A`, commit con un mensaje descriptivo en español de lo hecho, y `git push`.
  Si un repo no tiene cambios, decirlo y seguir con el otro. Nunca subir `.env`.
- **"Estado actual"**: en cada "update repos", ANTES del commit, actualizar la sección `## Estado actual` de este archivo
  en cada proyecto que haya tenido trabajo: en qué se está, qué falta y decisiones/preferencias nuevas del usuario.
  Pocas líneas, siempre sustituyendo lo obsoleto (no es un diario). Al empezar en cualquier equipo, leerla primero.
  - Windows: `E:\Claude Code\ito`, `E:\Claude Code\God Breaker` y `C:\Users\Saek\.claude\skills`
  - Mac: `~/Developer/Claude Code/ito`, `~/Developer/Claude Code/God Breaker` y `~/.claude/skills`
- **Pull automático**: un hook `SessionStart` (`.claude/settings.json`) hace `git pull --ff-only` del proyecto y de `~/.claude/skills` al abrir sesión.
  Si el pull falla (cambios locales sin subir o conflicto), avisar al usuario antes de tocar nada.
- **Detección de cambios del otro equipo**: un hook `UserPromptSubmit` (`.claude/hooks/check-remote.sh`) hace `git fetch` del proyecto y de `~/.claude/skills`
  antes de cada mensaje. Si hay commits nuevos en GitHub, avisar al usuario de que se van a bajar los cambios del otro equipo,
  hacer `git pull --ff-only` y solo entonces continuar con la petición. Si el pull falla, parar y preguntar.

## Estado actual
_Actualizado: 2026-11-17 (Mac)_

- **Hecho**: onboarding completo (paso «Dinero» con bote/reparto; «Salir/Eliminar el espacio» en Inicio para retestear),
  emails con logo (`supabase/plantillas-email/`), y **Gastos fases 1–3**: alta/edición/historial/totales, saldar y pedir borrar
  con tarjetas en Inicio, bote común (aportar, «Los dos», reembolsar, movimientos del mes). Cada fase revisada por el arquitecto.
- **Docs**: `docs/plan-gastos.md`, `plan-gastos-fase2.md`, `plan-gastos-fase3.md` (§8: notas I4/M3/M6/M8 para Ajustes).
- **Migraciones**: se aplican a mano en el SQL Editor. Confirmar que `20261117010000_saldar_seguro.sql` está aplicada.
- **Pendiente**: fase 4 (pagos recurrentes) y pantalla de Ajustes (propuestas de cambio, incluir notas de §8 fase 3).
- **Decisiones**: operaciones rápidas (aportar, saldar, confirmar, borrar) en hoja inferior (`components/gastos/Hoja.tsx`), no en
  página nueva. `.env` nunca a git; `service_role` solo en servidor. Vista previa de desarrollo con `EXPO_PUBLIC_VISTA_PREVIA` en `.env.local`.
