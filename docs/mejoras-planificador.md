# Mejoras del Planificador (antes de cobrar el premium)

> 2026-11-25 · Arquitecto. Parte de `docs/plan-planificador.md` (F1–F10 hechas) y `docs/estado.md` §Publicación.
> Objetivo: que el Planificador justifique 2,99 €/mes por pareja.

## Valoración

Lo que hay está completo en datos (tareas, reservas enlazadas, itinerario, sitios, gastos, saldo, resumen), pero en uso
real **sirve para preparar y no para viajar**:

- **Detalle = un scroll infinito** (`app/planificador/[id]/index.tsx`): tareas, itinerario de TODOS los días (hasta 60,
  con «Nada planeado este día» en cada uno), sitios, presupuesto y gastos seguidos. El concepto pedía pestañas
  (Resumen · Días · Gastos · Sitios); el plan F6 también. En un viaje de 7 días, encontrar «hoy» cuesta.
- **Durante el viaje no hay modo «hoy»**: nada te abre el día en curso ni lo siguiente que toca.
- **Sin conexión no se ve nada**: no hay caché persistida de React Query y `EstadoProvider` manda a `/sin-conexion`. En
  el extranjero sin datos, el itinerario y las reservas desaparecen justo cuando hacen falta.
- **Añadir al itinerario es caro**: cada «Añadir al itinerario» abre el formulario completo de evento; no hay franja
  (mañana/tarde/noche) aunque `events.time_slot` existe; elegir un sitio de la colección del plan no es directo.
- **Reservas sin datos útiles**: una reserva es título + nota; no hay localizador, hora ni enlace que copiar en el mostrador.
- **Destino es texto libre**: buscar sitios para Lisboa desde Madrid ordena por cercanía a Madrid (`lib/mapa/photon.ts`
  usa tu ubicación); el mapa de la colección no sabe dónde centrarse.
- **«Quién va» no se puede elegir** (`plans.attendees` existe, el formulario no lo pinta): los avisos lo necesitan.
- **Sobra/confunde**: en el calendario cada elemento sale además de la banda (ruido en mes); una salida pequeña (cena +
  cine) obliga a crear un plan entero, y una idea solo se puede convertir en plan, no en un evento.

## Mejoras (por valor/esfuerzo)

| # | Mejora | Tamaño | Toca | Antes de cobrar |
|---|---|---|---|---|
| 1 | **Franja horaria + hoja rápida «Añadir a este día»**: título, Mañana/Tarde/Noche/hora, sitio elegido de la colección del plan (o buscar); «Más opciones» abre el formulario completo. En Sitios del plan, «Añadir al día…» | M | UI (`Itinerario.tsx`, `FormularioEvento` modo plan, `SitiosDelPlan.tsx`); sin migración | Sí |
| 2 | **Detalle por pestañas [Resumen · Días · Gastos · Sitios]**; Días con tira de días y uno visible; si el plan está en curso abre en **Hoy** («Ahora / Después», reservas de hoy con localizador). Resumen: cuenta atrás, próximas tareas, «Falta reservar», presupuesto | M | UI (`[id]/index.tsx`, `Itinerario.tsx`, `lib/planificador/itinerario.ts`) | Sí |
| 3 | **«Quién va»** en el formulario (los dos / tú / pareja) | S | UI (`FormularioPlan.tsx`, `plan.ts`) | Sí (lo usan los avisos) |
| 4 | **Datos de la reserva**: localizador, hora/check-in y enlace, con «Copiar» y «Abrir»; visibles en la fila del itinerario y en Hoy | S–M | Migración (`plan_tasks.confirmation_code`, `url`, límites de longitud) + `HojaTarea.tsx`, `FilaTarea.tsx` | Sí |
| 5 | **Avisos del Planificador** (`notify_plans`): víspera del plan, tarea que vence, te han asignado algo, «faltan reservas a 7 días» (tabla de `plan-planificador.md` §6) | M | Migración (preferencia, `enqueue_scheduled`, trigger de asignación) + Ajustes → Avisos + `lib/avisos/rutas.ts` | Sí |
| 6 | **Plan legible sin conexión**: persistir en el móvil las consultas del Planificador (planes, itinerario, tareas, sitios) y no bloquear con `/sin-conexion` si hay caché; escribir sigue pidiendo red | M | Infra (`@tanstack/query-async-storage-persister`, JS puro), `EstadoProvider`; borrar caché al cerrar sesión | Sí |
| 7 | **Destino en el mapa**: el destino se elige con el buscador (guarda coordenadas); búsquedas del plan y su mapa se centran ahí | M | Migración (`plans.destination_lat/lng`) + `FormularioPlan`, `photon.ts` (centro opcional), `SitiosDelPlan` | No (muy recomendable) |
| 8 | **Calendario limpio**: icono «Reservado» en la fila y, en Mes, solo la banda (los elementos del plan al abrir el día) | S–M | Migración (`calendar_range` con `reserved`) + `lib/calendario/agrupar.ts` | No |
| 9 | **Ideas → «Ponerle fecha»** como evento suelto (con su sitio) además de «Convertir en plan», para salidas de una tarde | S | UI (`ListaIdeas.tsx`, `/calendario/nuevo` con precarga) | No |
| 10 | **Lista de equipaje/compras del plan** (casillas sin asignar, «Copiar del último viaje») | M | Migración (`plan_tasks.kind` + `'item'`) + UI | No (decisión de David: `concepto.md` deja Listas fuera) |

Adjuntos (PDF/foto del billete en la reserva): L, Storage + RLS; hacerlo junto con «fotos en recuerdos» (fase 2), no antes.

## Paquete mínimo antes de cobrar

**1 + 2 + 3 + 4 + 5 + 6**, en este orden: 3 y franja de 1 (S, sin migración) → 2 → 4 (migración) → 5 (migración,
revisa el arquitecto) → 6. Con esto el Planificador pasa de «lista de cosas» a «el viaje en el bolsillo»: Hoy, reservas
con localizador, avisos y funciona sin datos. 7 justo después.

## Decisiones de David

1. **Qué queda gratis del Planificador.** Recomendado: **1 plan próximo/en curso a la vez, completo**; más planes y
   Pasados con resumen, premium. *Alternativa*: Planificador entero premium (más claro, pero nadie lo prueba antes de pagar).
2. Lista de equipaje (10): ¿entra ahora como parte del premium o sigue fuera con Listas?
