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
_Actualizado: 2026-11-19 (Mac)_

- **Hecho**: onboarding completo, emails con logo, **Gastos fases 1–4** (gastos, saldar, pedir borrar, bote común, pagos recurrentes con cobros variables y pausa), **Ajustes**, avisos pendientes agrupados en Gastos, y **Calendario** completo (v1 Mes/Semana con eventos, repetición, asistentes, secretos, «¿Quién pagó?», borrado con aprobación; v2 categorías y filtros; pulido de iconos por tipo y navegación tras guardar). **Calendario v3 / pulido (esta ronda)**: iconos compartidos con RAYADO (insignia con 4 franjas diagonales m1/m2 alternas; barras de varios días también rayadas); pago recurrente en solitario con el color de su persona (naranja el resto); contraseña mínima de 8 caracteres (texto y validación); logo de bienvenida con `paddingHorizontal` 16; cabecera fija `CabeceraPestana` en las pestañas (título quieto, línea al hacer scroll); barra única [Mes|Semana] [periodo] [embudo] con selector de mes desplegable (en Semana: mes y luego semana; límites 2000–2100); filtros MÚLTIPLES (Viajes, Comer fuera, Ocio, Otros, Cumpleaños, Pagos; píldoras activas y botón embudo+✕ para quitar todos; `filtroParaVer` añade en vez de sustituir); deslizar la rejilla para cambiar de mes/semana (gesture-handler, `touchAction pan-y`); tinte de fin de semana y gris `fueraDeMes` en días de otros meses; animación de pulsación (`usePulsacion`: tinte con fundido, escala con resorte, rebote del número; `unstable_pressDelay` 80); indicador de carga `CargandoHilo` (hilo ondulante) en vez de ActivityIndicator; datos de ejemplo `supabase/seed/limpiar_y_ejemplos.sql` (+ `LEEME.md`), ya ejecutado por David. Typecheck y 443 tests en verde.
- **Docs**: `docs/plan-gastos*.md`, `plan-ajustes.md`, `plan-onboarding.md`, `revision-diseno.md`, `plan-calendario.md`, `plan-calendario-v2.md`, `plan-calendario-iconos.md`, `plan-cabeceras-calendario.md`, `plan-calendario-v3.md` (ojo: v3 aún menciona `pulsoAlTocar`, ya eliminado).
- **Supabase (a mano)**: migraciones de calendario (`20261120000000`, `20261121000000`) aplicadas. Confirmar que `20261117010000_saldar_seguro.sql` está aplicada. Edge Function `borrar-cuenta` y plantilla Reauthentication hechas. **PENDIENTE de David**: bajar «Minimum password length» a 8 en Supabase → Authentication → Providers → Email.
- **Pendiente**: probar TODO lo nuevo en iPhone real con Expo Go (`npx expo start`, puerto 8082 si el 8081 está ocupado): selector Mes|Semana legible (también con letra grande); gesto de deslizar sin pelearse con el scroll vertical/pull-to-refresh (si pasa, subir `activeOffsetX` de 16 a 20); destello del tinte al hacer scroll sobre celdas (afinar el retraso de 80 ms); cabecera bajo la Dynamic Island; etiqueta del periodo («Septiembre»); nitidez del hilo de carga pequeño; menús anclados en Android; logo de bienvenida no cortado (si lo está, `paddingHorizontal` 24). Siguen vigentes: pruebas con dos cuentas (viaje de los dos, «solo esta vez» en viaje semanal, cumpleaños 29 feb, evento secreto, Melocotón y Malva); cierre de modales apilados (dismissTo); guardado de pagos/eventos en móvil; «+N» con 5+ (¿3 iconos + «+N»?); editar un evento debería volver a su detalle; pestañas Mapa y Planificador (planes = granate suave, filtro «Planes»); avisos push (recurrentes, Ajustes y calendario se guardan pero no se envían; calcular desde `occurrence_dates`); «Borrar mi cuenta» sin espacio (Apple); zona horaria de la pareja en móvil real; filtrar en `pending_actions` cobros variables en pausa; etiqueta «Cumpleaños de X» en `request_deletion`; viaje en curso en «Próximos»; «Poner importe» desde el calendario; refrescar «hoy» tras medianoche; VoiceOver/TalkBack.
- **Decisiones**: operaciones rápidas en hoja inferior; excepción: el desplegable del embudo y el de mes son menús anclados bajo el botón (David lo pidió). Recurrente proporcional conserva el % de creación. Personal = lo paga y es solo de una persona; el resto compartido. «Proporcional» se oculta si es 50/50. Un cobro por periodo en recurrentes. `.env` nunca a git; `service_role` solo en servidor. Calendario: varios días máx. 31 y repetición solo si no se pisa; cumpleaños = eventos `birthday` (año ancla 2000), no secretos, borrar = serie entera con aprobación; **filtros múltiples** (revierte «un filtro a la vez»); Semana = una fila por día; iconos separados sin superponer; cumpleaños en la esquina; pago único = monedas, recurrente = monedas + bucle; tras guardar se vuelve al origen (`origen=calendario|gastos`) o al calendario con día y evento resaltados; **cabecera de pestaña fija propia** (no la nativa); gris `fueraDeMes` sobre el crema de fin de semana. Orquestación con subagentes (ver sección «Orquestación»), sesión principal con Sonnet.
