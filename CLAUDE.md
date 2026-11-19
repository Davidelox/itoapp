# ito

## Sincronización entre equipos (Windows ↔ Mac)

Este proyecto se trabaja alternando entre un PC con Windows y un Mac, sincronizado por GitHub.
Repos sincronizados: **ito** (GitHub: `Davidelox/itoapp`), **god-breaker** (God Breaker) y **claude-skills** (skills globales de Claude Code).

- **"update repos"**: cuando el usuario diga exactamente esta frase, en los TRES repos (ito, god-breaker y claude-skills):
  `git add -A`, commit con un mensaje descriptivo en español de lo hecho, y `git push`.
  Si un repo no tiene cambios, decirlo y seguir con el otro. Nunca subir `.env`.
- **"Estado actual"**: en cada "update repos", ANTES del commit, actualizar en cada proyecto que haya tenido trabajo:
  la sección `## Estado actual` de este archivo (**máximo 6 líneas cortas**: en curso, hecho, próximo, pendiente de David, clave)
  y el detalle en `docs/estado.md` (pendientes, decisiones, tareas de Supabase). Sustituir lo obsoleto, no es un diario.
  Este archivo se carga en cada mensaje y en cada subagente: todo lo que no haga falta siempre va en `docs/estado.md`.
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

- **Flujo para funcionalidades**: `arquitecto` planifica → `desarrollador` implementa → `desarrollador` aplica las correcciones
  si hay revisión. Para cambios pequeños basta `ayudante`, sin revisión.
- **Revisión con el arquitecto (Opus) solo si el cambio toca** auth, RLS, migraciones, Edge Functions, dinero/balances/repartos
  o borrado de datos, o si David la pide. El resto (UI, estilos, textos, navegación) no se revisa: basta typecheck, lint y tests.
  Al encargarla, pasar el rango del diff (`git diff <base>`), no la lista de archivos.
- **Excepción**: lo que se resuelve en una línea sin abrir archivos (un saludo, una confirmación, una pregunta sobre lo que ya
  está en la conversación) lo contesta la orquestadora directamente; lanzar un subagente para eso cuesta más de lo que ahorra.
- En la duda entre dos agentes, elegir el más capaz. Si un agente dice que la tarea le supera, pasarla al siguiente.
- Al encargar, dar al subagente todo el contexto que necesita (empieza sin ver la conversación): objetivo, archivos y decisiones.
- Decir al usuario en una línea a qué agente se ha pasado cada tarea.
- Al encargar, pedir el informe corto (ver «Estilo de respuesta») y no reenviar al subagente lo que ya está en archivos: darle la ruta.

## Estilo de respuesta (todas las sesiones y subagentes)

- Directo y corto. Sin repetir la pregunta, sin introducciones, sin «resumen final» que repita lo dicho.
- Respuesta a David: qué se ha hecho, resultado real (tests, typecheck) y lo que falta o necesita su decisión. Nada más.
- No contar el proceso («primero he leído…, luego…»): solo el resultado.
- Una recomendación, no un catálogo de opciones. Preguntar solo si de verdad bloquea.
- Cambio mínimo que resuelve la tarea: sin abstracciones, opciones ni refactors que nadie ha pedido.
- Leer solo lo necesario: buscar con `grep`/`glob` antes de abrir archivos enteros; no releer lo que ya se ha leído.

## Estado actual
_Actualizado: 2026-11-19 (Mac)_. Detalle (pendientes, decisiones, Supabase) en `docs/estado.md`: leerlo solo si la tarea lo necesita.

- **En curso**: Calendario v3 / pulido terminado (typecheck y 443 tests en verde); falta probarlo en iPhone real.
- **Hecho**: onboarding, Gastos fases 1–4, Ajustes, Calendario v1–v3.
- **Próximo**: pruebas en móvil real y con dos cuentas; pestañas Mapa y Planificador; avisos push.
- **Pendiente de David**: «Minimum password length» a 8 en Supabase; confirmar `20261117010000_saldar_seguro.sql` aplicada.
- **Clave**: `.env` nunca a git; `service_role` solo en servidor; migraciones a mano en el SQL Editor.
