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

## Orquestación (subagentes)

La sesión principal es **orquestadora**: clasifica cada petición, la pasa al subagente que toca (`.claude/agents/`),
y resume el resultado al usuario. No programa ni investiga a fondo ella misma. La orquestadora corre con **Sonnet**
(si una sesión arranca con otro modelo, cambiarlo a Sonnet o avisar a David).

| Petición | Subagente | Modelo |
|---|---|---|
| Respuestas sencillas y dudas, buscar dónde está algo, resúmenes (solo lectura) | `explorador` | Haiku |
| Updates (dependencias, docs, Estado actual, "update repos") y cambios pequeños de pocas líneas | `ayudante` | Sonnet |
| Desarrollar funcionalidades y aplicar planes, soluciones y correcciones del arquitecto | `desarrollador` | Sonnet |
| Arquitectura, diseño, soluciones a bugs difíciles y revisión | `arquitecto` | Opus |
| Solo si David lo pide explícitamente ("con el artesano", "con Fable") | `artesano` | Fable |

- **Flujo para funcionalidades**: `arquitecto` planifica → `desarrollador` implementa → `arquitecto` revisa → `desarrollador` aplica
  las correcciones. Para cambios pequeños basta `ayudante`, sin revisión.
- **Excepción**: lo que se resuelve en una línea sin abrir archivos (un saludo, una confirmación, una pregunta sobre lo que ya
  está en la conversación) lo contesta la orquestadora directamente; lanzar un subagente para eso cuesta más de lo que ahorra.
- En la duda entre dos agentes, elegir el más capaz. Si un agente dice que la tarea le supera, pasarla al siguiente.
- Al encargar, dar al subagente todo el contexto que necesita (empieza sin ver la conversación): objetivo, archivos y decisiones.
- Decir al usuario en una línea a qué agente se ha pasado cada tarea.

## Estado actual
_Actualizado: 2026-11-17 (Mac)_

- **Hecho**: onboarding completo (incluye paso «Dinero»), emails con logo, **Gastos fases 1–4** (gastos, saldar y pedir borrar, bote común, **pagos recurrentes** con cobros variables y pausa) y **Ajustes** (perfil, pareja, dinero por propuesta que acepta la otra persona, privacidad, cambiar contraseña, salir del espacio, borrar cuenta, cerrar sesión). Cada fase revisada por el arquitecto.
- **Docs**: `docs/plan-gastos*.md` (fases 1–4), `docs/plan-ajustes.md`, `docs/plan-onboarding.md`, `docs/revision-diseno.md`.
- **Supabase**: las migraciones y la Edge Function `borrar-cuenta` se aplican a mano. Confirmar que `20261117010000_saldar_seguro.sql` está aplicada. Plantilla de email «Reauthentication» con el logo (en `supabase/plantillas-email/`).
- **Pendiente**: pestañas Calendario, Mapa y Planificador; avisos push (los avisos de los recurrentes y de Ajustes ya se guardan pero no se envían); «Borrar mi cuenta» sin espacio (Apple lo exige antes de publicar); probar la zona horaria de la pareja en un móvil real; filtrar en `pending_actions` los cobros variables de recurrentes en pausa.
- **Decisiones**: operaciones rápidas (aportar, saldar, confirmar, borrar, pausar, poner importe) en hoja inferior, no en página nueva. Un recurrente proporcional conserva el % del día en que se creó. Personal = lo paga y es solo de una persona; el resto es compartido. «Proporcional» se oculta si es 50/50 (idéntico a «A medias»). Como mucho un cobro por periodo en los recurrentes. `.env` nunca a git; `service_role` solo en servidor. Orquestación con subagentes (ver sección «Orquestación»), la sesión principal con Sonnet.
