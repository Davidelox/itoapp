/**
 * Reservas enlazadas al itinerario (F9): una reserva (`kind = 'booking'`) puede apuntar a un elemento del itinerario de
 * su plan (`event_id`). La sincronización «reserva hecha ⇔ elemento reservado» es del servidor (migración M3); aquí solo
 * se decide qué se ofrece, cómo se lee y qué chip lleva el elemento. Sin red ni React.
 */
import { abreviaturaDia, numeroDia } from '@/lib/calendario/rejilla';
import { type ElementoItinerario, horaElemento, ordenarElementos } from '@/lib/planificador/itinerario';
import type { Tarea } from '@/lib/planificador/tipos';

type ParaEnlace = Pick<Tarea, 'id' | 'kind' | 'event_id'>;

/**
 * Elementos del plan que se pueden enlazar a la reserva `tareaId` (o a una nueva): los de ese plan sin otra reserva
 * enlazada (el servidor admite una por elemento: TW072). El que ya tiene ESTA reserva se conserva. Orden del itinerario.
 */
export function elementosEnlazables(elementos: ElementoItinerario[], tareas: ParaEnlace[], planId: string, tareaId?: string): ElementoItinerario[] {
  const ocupados = new Set(tareas.filter((t) => t.kind === 'booking' && t.event_id && t.id !== tareaId).map((t) => t.event_id));
  return elementos
    .filter((e) => e.plan_id === planId && !ocupados.has(e.id))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || ordenarElementos(a, b));
}

/** Elementos agrupados por su día (ya ordenados), para el selector. */
export function elementosPorDia(elementos: ElementoItinerario[]): { fecha: string; elementos: ElementoItinerario[] }[] {
  const dias: { fecha: string; elementos: ElementoItinerario[] }[] = [];
  for (const e of elementos) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === e.start_date) ultimo.elementos.push(e);
    else dias.push({ fecha: e.start_date, elementos: [e] });
  }
  return dias;
}

/** «Sáb 5, 21:30» (sin hora, «Sáb 5»; todo el día o franja, su texto). */
export function cuandoElemento(e: Pick<ElementoItinerario, 'start_date' | 'start_time' | 'time_slot' | 'all_day'>): string {
  const dia = `${abreviaturaDia(e.start_date)} ${numeroDia(e.start_date)}`;
  const hora = horaElemento(e);
  return hora ? `${dia}, ${hora}` : dia;
}

/** «Cena en El Olivo · Sáb 5, 21:30». */
export const textoElementoEnlazado = (e: Pick<ElementoItinerario, 'title' | 'start_date' | 'start_time' | 'time_slot' | 'all_day'>): string =>
  `${e.title} · ${cuandoElemento(e)}`;

/** Línea de la fila de una reserva enlazada: «Reserva · Cena en El Olivo · Sáb 5, 21:30»; null si no está enlazada o su elemento no se conoce. */
export function lineaReservaEnlazada(t: Pick<Tarea, 'kind' | 'event_id'>, elementos: ElementoItinerario[]): string | null {
  if (t.kind !== 'booking' || !t.event_id) return null;
  const e = elementos.find((x) => x.id === t.event_id);
  return e ? `Reserva · ${textoElementoEnlazado(e)}` : null;
}

/** Chip de un elemento del itinerario: «Reservado», «Falta reservar» (tiene una reserva enlazada pendiente) o ninguno. */
export function chipReserva(e: Pick<ElementoItinerario, 'id' | 'reserved'>, tareas: Pick<Tarea, 'kind' | 'event_id' | 'status'>[]): 'Reservado' | 'Falta reservar' | null {
  if (e.reserved) return 'Reservado';
  return tareas.some((t) => t.kind === 'booking' && t.event_id === e.id && t.status === 'pending') ? 'Falta reservar' : null;
}

/** Errores tras los que hay que recargar para ver el estado real (elemento ya reservado por otra, o carrera entre dos). */
export const recargaTrasError = (codigo: string | undefined): boolean => codigo === 'version' || codigo === 'TW072' || codigo === '23505' || codigo === 'TW060';
