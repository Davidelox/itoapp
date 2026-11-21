import type { Evento } from '@/lib/calendario/evento';
import type { ElementoItinerario } from '@/lib/planificador/itinerario';
import { chipReserva, cuandoElemento, elementosEnlazables, elementosPorDia, lineaReservaEnlazada, recargaTrasError, textoElementoEnlazado } from '@/lib/planificador/reservas';
import { etiquetaElemento } from '@/lib/planificador/itinerario';
import { etiquetaTarea } from '@/lib/planificador/tareas';
import type { Tarea } from '@/lib/planificador/tipos';

const el = (id: string, extra: Partial<ElementoItinerario> = {}): ElementoItinerario =>
  ({ id, title: id, start_date: '2026-12-05', start_time: null, all_day: false, time_slot: null, position: 0, plan_id: 'p1', reserved: false, category: 'eating_out', ...extra }) as unknown as ElementoItinerario & Evento;
const ta = (id: string, extra: Partial<Tarea> = {}): Tarea => ({
  id, plan_id: 'p1', kind: 'booking', title: 'Reservar cena', detail: null, assignee: null, status: 'pending', done_by: null, due_date: null, place_id: null, event_id: null, position: 0, version: 1, ...extra,
});
const YO = { slot: 'm1' as const, userId: 'u' };

describe('elementosEnlazables', () => {
  const todos = [el('a', { start_time: '21:30' }), el('b', { start_date: '2026-12-06' }), el('c', { plan_id: 'p2' })];
  it('solo los del plan, por día y hora', () => {
    expect(elementosEnlazables([todos[1], todos[0], todos[2]], [], 'p1').map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('quita los que ya tienen otra reserva y conserva el de la propia', () => {
    const tareas = [ta('t1', { event_id: 'a' }), ta('t2', { event_id: 'b' })];
    expect(elementosEnlazables(todos, tareas, 'p1').map((e) => e.id)).toEqual([]);
    expect(elementosEnlazables(todos, tareas, 'p1', 't1').map((e) => e.id)).toEqual(['a']);
  });
  it('una tarea normal con elemento no lo ocupa', () => {
    expect(elementosEnlazables(todos, [ta('t', { kind: 'task', event_id: 'a' })], 'p1').map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('agrupa por día', () => {
    expect(elementosPorDia(elementosEnlazables(todos, [], 'p1')).map((d) => [d.fecha, d.elementos.length])).toEqual([['2026-12-05', 1], ['2026-12-06', 1]]);
  });
});

describe('textos', () => {
  const cena = el('x', { title: 'Cena en El Olivo', start_time: '21:30:00' });
  it('cuándo y elemento enlazado', () => {
    expect(cuandoElemento(cena)).toBe('Sáb 5, 21:30');
    expect(cuandoElemento(el('y'))).toBe('Sáb 5');
    expect(textoElementoEnlazado(cena)).toBe('Cena en El Olivo · Sáb 5, 21:30');
  });
  it('línea de la reserva enlazada', () => {
    expect(lineaReservaEnlazada(ta('t', { event_id: 'x' }), [cena])).toBe('Reserva · Cena en El Olivo · Sáb 5, 21:30');
    expect(lineaReservaEnlazada(ta('t'), [cena])).toBeNull();
    expect(lineaReservaEnlazada(ta('t', { event_id: 'z' }), [cena])).toBeNull();
    expect(lineaReservaEnlazada(ta('t', { kind: 'task', event_id: 'x' }), [cena])).toBeNull();
  });
  it('etiquetas de accesibilidad', () => {
    expect(etiquetaTarea(ta('t', { event_id: 'x' }), YO, 'Meri', 'Cena en El Olivo · Sáb 5, 21:30')).toContain('enlazada a Cena en El Olivo · Sáb 5, 21:30');
    expect(etiquetaElemento(cena, true)).toContain('Falta reservar');
    expect(etiquetaElemento({ ...cena, reserved: true }, true)).toContain('Reservado');
  });
});

describe('chipReserva', () => {
  it('reservado manda; si no, falta reservar con una reserva pendiente enlazada', () => {
    expect(chipReserva({ id: 'a', reserved: true }, [])).toBe('Reservado');
    expect(chipReserva({ id: 'a', reserved: false }, [ta('t', { event_id: 'a' })])).toBe('Falta reservar');
    expect(chipReserva({ id: 'a', reserved: false }, [ta('t', { event_id: 'a', status: 'done' })])).toBeNull();
    expect(chipReserva({ id: 'a', reserved: false }, [ta('t', { event_id: 'a', kind: 'task' })])).toBeNull();
    expect(chipReserva({ id: 'a', reserved: false }, [ta('t', { event_id: 'b' })])).toBeNull();
  });
});

describe('recargaTrasError', () => {
  it('recarga con conflicto de versión, TW072, TW060 y 23505', () => {
    for (const c of ['version', 'TW072', 'TW060', '23505']) expect(recargaTrasError(c)).toBe(true);
    expect(recargaTrasError('TW064')).toBe(false);
    expect(recargaTrasError(undefined)).toBe(false);
  });
});
