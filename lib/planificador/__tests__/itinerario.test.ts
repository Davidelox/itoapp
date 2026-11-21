import { aDatosPlan, formularioNuevo } from '@/lib/calendario/evento';
import {
  type ElementoItinerario,
  agruparItinerario,
  avisoHanQuedadoFuera,
  avisoQuedaranFuera,
  desplazamiento,
  diasDelPlan,
  estaDentro,
  etiquetaElemento,
  fechaInicialEnPlan,
  fechasAlMover,
  horaElemento,
  ordenarElementos,
  planDeParametro,
  quedanFuera,
  resultadoMover,
  separarFechas,
  textoDia,
  textoMoverTodo,
} from '@/lib/planificador/itinerario';

const el = (id: string, parcial: Partial<ElementoItinerario> = {}): ElementoItinerario => ({
  id,
  title: id,
  start_date: '2026-12-05',
  start_time: null,
  all_day: false,
  recurrence: 'none',
  end_date: null,
  attendees: 'both',
  budget_cents: null,
  ask_who_paid: false,
  who_paid_resolved_at: null,
  reminder_minutes: null,
  notes: null,
  is_secret: false,
  category: 'other',
  birth_year: null,
  place_id: null,
  reserved: false,
  reservation_note: null,
  plan_id: 'p1',
  created_by: null,
  version: 1,
  starts_at: '',
  ends_at: '',
  time_slot: null,
  position: 0,
  ...parcial,
});

const INI = '2026-12-05';
const FIN = '2026-12-08';

describe('agruparItinerario', () => {
  it('saca todos los días del plan, también los vacíos', () => {
    const r = agruparItinerario([el('a', { start_date: '2026-12-06', start_time: '10:00' })], INI, FIN);
    expect(r.dias.map((d) => d.fecha)).toEqual(['2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08']);
    expect(r.dias.map((d) => d.elementos.length)).toEqual([0, 1, 0, 0]);
    expect(r.dias.map((d) => d.numero)).toEqual([1, 2, 3, 4]);
    expect(r.fuera).toEqual([]);
  });

  it('un plan de un día tiene un solo día', () => {
    expect(agruparItinerario([], INI, INI).dias).toHaveLength(1);
  });

  it('lo que cae fuera de las fechas va aparte, por fecha (antes, después y si el fin se pasa)', () => {
    const r = agruparItinerario(
      [
        el('despues', { start_date: '2026-12-10' }),
        el('antes', { start_date: '2026-12-01' }),
        el('largo', { start_date: '2026-12-07', end_date: '2026-12-09' }),
        el('dentro', { start_date: '2026-12-08' }),
      ],
      INI,
      FIN,
    );
    expect(r.fuera.map((e) => e.id)).toEqual(['antes', 'largo', 'despues']);
    expect(r.dias[3].elementos.map((e) => e.id)).toEqual(['dentro']);
  });
});

describe('ordenarElementos', () => {
  it('todo el día, franja, hora y después position y título', () => {
    const lista = [
      el('cena', { start_time: '21:30:00' }),
      el('desayuno', { start_time: '09:00:00' }),
      el('tarde', { time_slot: 'afternoon' }),
      el('manana', { time_slot: 'morning' }),
      el('todo', { all_day: true }),
      el('b', { all_day: true, position: 1 }),
      el('a', { all_day: true, position: 1, title: 'A' }),
    ];
    const orden = lista.sort(ordenarElementos).map((e) => e.id);
    expect(orden).toEqual(['todo', 'a', 'b', 'manana', 'tarde', 'desayuno', 'cena']);
  });
});

describe('textos', () => {
  it('hora y etiqueta accesible de una fila', () => {
    const e = el('x', { title: 'Cena en El Olivo', start_time: '21:30:00', reserved: true });
    expect(horaElemento(e)).toBe('21:30');
    expect(etiquetaElemento(e)).toBe('Sábado 5, 21:30, Cena en El Olivo, Reservado');
    expect(horaElemento(el('y', { all_day: true }))).toBe('Todo el día');
    expect(horaElemento(el('z', { time_slot: 'evening' }))).toBe('Noche');
    expect(etiquetaElemento(el('t', { title: 'Sintra', all_day: true }))).toBe('Sábado 5, todo el día, Sintra');
  });

  it('cabecera de cada día', () => {
    const { dias } = agruparItinerario([], INI, FIN);
    expect(textoDia(dias[1], 4)).toBe('Día 2 · Dom 6 dic');
    expect(textoDia(agruparItinerario([], INI, INI).dias[0], 1)).toBe('Ese día');
  });

  it('textos de mover', () => {
    expect(textoMoverTodo(3)).toBe('Mover todo (3 elementos)');
    expect(textoMoverTodo(1)).toBe('Mover todo (1 elemento)');
    expect(avisoQuedaranFuera(2)).toBe('2 elementos quedarán fuera de las fechas del plan.');
    expect(avisoHanQuedadoFuera(1)).toBe('1 elemento ha quedado fuera de las fechas del plan.');
  });
});

describe('mover el plan', () => {
  it('días de desplazamiento del inicio', () => {
    expect(desplazamiento('2026-12-05', '2026-12-08')).toBe(3);
    expect(desplazamiento('2026-12-05', '2026-12-01')).toBe(-4);
  });

  it('con desplazamiento todo cabe; sin él, queda fuera lo que no cabe', () => {
    const lista = [el('a', { start_date: '2026-12-05' }), el('b', { start_date: '2026-12-08' })];
    // El plan pasa del 5–8 al 8–11.
    expect(quedanFuera(lista, '2026-12-08', '2026-12-11', 3)).toBe(0);
    expect(quedanFuera(lista, '2026-12-08', '2026-12-11', 0)).toBe(1);
  });

  it('acortar el plan deja fuera lo del final aunque se desplace', () => {
    const lista = [el('a', { start_date: '2026-12-05' }), el('b', { start_date: '2026-12-08' })];
    expect(quedanFuera(lista, '2026-12-05', '2026-12-06', 0)).toBe(1);
  });

  it('un elemento de varios días también cuenta por su fin', () => {
    expect(estaDentro({ start_date: '2026-12-07', end_date: '2026-12-09' }, INI, FIN)).toBe(false);
    expect(quedanFuera([{ start_date: '2026-12-07', end_date: '2026-12-08' }], INI, FIN, 0)).toBe(0);
    expect(quedanFuera([{ start_date: '2026-12-07', end_date: '2026-12-08' }], INI, FIN, 1)).toBe(1);
  });

  it('mover un elemento a un día del plan conserva la duración sin pasarse del fin', () => {
    expect(fechasAlMover({ start_date: '2026-12-01', end_date: null }, '2026-12-06', FIN)).toEqual({ start_date: '2026-12-06', end_date: null });
    expect(fechasAlMover({ start_date: '2026-12-01', end_date: '2026-12-02' }, '2026-12-06', FIN)).toEqual({ start_date: '2026-12-06', end_date: '2026-12-07' });
    expect(fechasAlMover({ start_date: '2026-12-01', end_date: '2026-12-05' }, '2026-12-06', FIN)).toEqual({ start_date: '2026-12-06', end_date: FIN });
    expect(fechasAlMover({ start_date: '2026-12-01', end_date: '2026-12-05' }, FIN, FIN)).toEqual({ start_date: FIN, end_date: null });
  });

  it('separa las fechas (move_plan) del resto de cambios', () => {
    expect(separarFechas({ name: 'X', end_date: '2026-12-09' })).toEqual({ cambianFechas: true, resto: { name: 'X' } });
    expect(separarFechas({ name: 'X' })).toEqual({ cambianFechas: false, resto: { name: 'X' } });
  });

  it('lee la respuesta de move_plan', () => {
    expect(resultadoMover({ version: 4, moved: 3, outside: 1 })).toEqual({ version: 4, moved: 3, outside: 1 });
    expect(resultadoMover(null)).toBeNull();
    expect(resultadoMover({ version: '4' })).toBeNull();
  });
});

describe('parámetros de ruta', () => {
  it('plan: solo un uuid', () => {
    expect(planDeParametro('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(planDeParametro('no-es-un-uuid')).toBeNull();
    expect(planDeParametro(undefined)).toBeNull();
  });

  it('fecha: la pedida si cabe en el plan, si no el primer día', () => {
    expect(fechaInicialEnPlan('2026-12-07', INI, FIN)).toBe('2026-12-07');
    expect(fechaInicialEnPlan('2026-12-20', INI, FIN)).toBe(INI);
    expect(fechaInicialEnPlan('2026-02-30', INI, FIN)).toBe(INI);
    expect(fechaInicialEnPlan('hola', INI, FIN)).toBe(INI);
    expect(fechaInicialEnPlan(undefined, INI, FIN)).toBe(INI);
  });

  it('diasDelPlan', () => {
    expect(diasDelPlan('2026-12-30', '2027-01-01')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });
});

describe('modo plan del formulario', () => {
  it('envía plan_id, nunca secreto ni repetición', () => {
    const f = { ...formularioNuevo('2026-12-06'), titulo: 'Cena', secreto: true, repeticion: 'weekly' as const };
    const d = aDatosPlan(f, 'm1', 'p1');
    expect(d.plan_id).toBe('p1');
    expect(d.is_secret).toBe(false);
    expect(d.recurrence).toBe('none');
    expect(d.start_date).toBe('2026-12-06');
  });
});
