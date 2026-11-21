import type { Elemento } from '@/lib/calendario/agrupar';
import { textoSaldo } from '@/lib/gastos/textoSaldo';
import type { Gasto } from '@/lib/gastos/consultas';
import type { Pago } from '@/lib/gastos/saldar';
import type { Sitio } from '@/lib/mapa/tipos';
import {
  type Hechos,
  haceCuanto,
  lineaMultidia,
  mediaValoracion,
  movimientosRecientes,
  proximoPlanMultidia,
  proximosDeLaSemana,
  textoEnDias,
  textoMedia,
  ultimoLugarVisitado,
  estadoInicio,
  etiquetaPlan,
  fechaSaludo,
  progresoPasos,
  proximoPlan,
  textoCaducidad,
  textoPresupuesto,
} from '@/lib/inicio/inicio';

const el = (extra: Partial<Elemento>): Elemento =>
  ({ tipo: 'event', categoria: 'other', titulo: 'Plan', inicio: '2026-11-12', fecha: '2026-11-12', fin: '2026-11-12', hora: '21:30', ...extra }) as Elemento;
const HOY = '2026-11-12';
const ninguno: Hechos = { gasto: false, sitio: false, evento: false, recurrente: false };

describe('fechaSaludo', () => {
  it('día de la semana, número y mes', () => expect(fechaSaludo(HOY)).toBe('Jueves, 12 de noviembre'));
});

describe('proximoPlan', () => {
  it('descarta pagos, cumpleaños y lo ya pasado de hoy', () => {
    const lista = [
      el({ tipo: 'payment', titulo: 'Luz', hora: null }),
      el({ categoria: 'birthday', titulo: 'Cumple', hora: null }),
      el({ titulo: 'Desayuno', hora: '09:00' }),
      el({ titulo: 'Cena', hora: '21:30' }),
    ];
    expect(proximoPlan(lista, HOY, '12:00')?.titulo).toBe('Cena');
    expect(proximoPlan(lista, HOY, '22:00')).toBeNull();
  });
  it('ordena por día y hora y deja fuera los de varios días', () => {
    const lista = [
      el({ titulo: 'Mañana', inicio: '2026-11-13', fecha: '2026-11-13', fin: '2026-11-13' }),
      el({ titulo: 'Hoy tarde', hora: '23:00' }),
      el({ titulo: 'Viaje', inicio: '2026-11-10', fecha: '2026-11-10', fin: '2026-11-14', hora: null }),
    ];
    expect(proximoPlan(lista, HOY, '10:00')?.titulo).toBe('Hoy tarde');
  });
  it('sin eventos, null', () => expect(proximoPlan([], HOY, '10:00')).toBeNull());
});

describe('etiquetaPlan', () => {
  it('hoy, mañana y otro día', () => {
    expect(etiquetaPlan({ inicio: HOY, hora: '21:30' }, HOY)).toBe('HOY · 21:30');
    expect(etiquetaPlan({ inicio: '2026-11-13', hora: '10:00' }, HOY)).toBe('MAÑANA · 10:00');
    expect(etiquetaPlan({ inicio: '2026-11-14', hora: '20:00' }, HOY)).toBe('SÁB 14 · 20:00');
  });
  it('todo el día sin hora; viaje en curso, hoy', () => {
    expect(etiquetaPlan({ inicio: '2026-11-14', hora: null }, HOY)).toBe('SÁB 14');
    expect(etiquetaPlan({ inicio: '2026-11-10', hora: null }, HOY)).toBe('HOY');
  });
});

describe('textoPresupuesto', () => {
  it('sin decimales si es entero', () => {
    expect(textoPresupuesto(6000)).toBe('~60 €');
    expect(textoPresupuesto(6050)).toBe('~60,50 €');
  });
});

describe('textoSaldo', () => {
  it('te debe, debes, en paz y sin pareja', () => {
    expect(textoSaldo(3590, true)).toEqual({ tipo: 'teDebe', cents: 3590 });
    expect(textoSaldo(-1200, true)).toEqual({ tipo: 'debes', cents: 1200 });
    expect(textoSaldo(0, true).tipo).toBe('enPaz');
    expect(textoSaldo(0, false).tipo).toBe('sinPareja');
    expect(textoSaldo(500, false).tipo).toBe('teDebe');
  });
});

describe('progresoPasos', () => {
  it('cuenta los hechos', () => {
    expect(progresoPasos(ninguno)).toEqual({ hechos: 0, total: 4, completo: false });
    expect(progresoPasos({ ...ninguno, gasto: true, evento: true }).hechos).toBe(2);
    expect(progresoPasos({ gasto: true, sitio: true, evento: true, recurrente: true }).completo).toBe(true);
  });
});

describe('textoCaducidad', () => {
  const ahora = new Date('2026-11-12T10:00:00Z');
  it('días, hoy, caducado y sin código', () => {
    expect(textoCaducidad(new Date('2026-11-19T10:00:00Z'), ahora)).toBe('El código caduca en 7 días');
    expect(textoCaducidad(new Date('2026-11-12T20:00:00Z'), ahora)).toBe('El código caduca hoy');
    expect(textoCaducidad(new Date('2026-11-11T10:00:00Z'), ahora)).toBe('El código ha caducado');
    expect(textoCaducidad(null, ahora)).toBeNull();
  });
});

describe('estadoInicio', () => {
  const base = { unida: true, parejaBorrada: false, hayPlan: false, hechos: ninguno };
  it('pareja unida y con datos: saldo y pasos, sin bienvenida ni aviso', () => {
    expect(estadoInicio({ ...base, hechos: { ...ninguno, gasto: true } })).toEqual({ bienvenida: false, invitacion: false, saldo: true, primerosPasos: true });
  });
  it('sin pareja: aviso de invitación y bienvenida, sin saldo', () => {
    expect(estadoInicio({ ...base, unida: false })).toEqual({ bienvenida: true, invitacion: true, saldo: false, primerosPasos: true });
  });
  it('con pareja pero sin datos: bienvenida y pasos, sin aviso', () => {
    expect(estadoInicio(base)).toEqual({ bienvenida: true, invitacion: false, saldo: true, primerosPasos: true });
  });
  it('un plan próximo ya cuenta como dato; con los 4 pasos se ocultan; pareja borrada sin aviso', () => {
    expect(estadoInicio({ ...base, hayPlan: true }).bienvenida).toBe(false);
    expect(estadoInicio({ ...base, hechos: { gasto: true, sitio: true, evento: true, recurrente: true } }).primerosPasos).toBe(false);
    expect(estadoInicio({ ...base, unida: false, parejaBorrada: true }).invitacion).toBe(false);
  });
});

describe('proximoPlanMultidia', () => {
  const viaje = (extra: Partial<Elemento> = {}) =>
    el({ titulo: 'Escapada', origenId: 'e1', inicio: '2026-12-05', fecha: '2026-12-05', fin: '2026-12-08', hora: null, importeCents: 90000, ...extra });
  const plan = { id: 'p1', name: 'Lisboa', icon: '✈️', start_date: '2026-12-01', end_date: '2026-12-04', budget_cents: null };
  const cumple = { id: 'c1', name: 'Cumple de Marta', icon: '🎂', start_date: '2026-11-20', end_date: '2026-11-20', budget_cents: null };
  it('sin plan ni evento de varios días, null; un día no cuenta', () => {
    expect(proximoPlanMultidia([], [el({})], HOY)).toBeNull();
    expect(proximoPlanMultidia([{ ...plan, end_date: plan.start_date }], [], HOY)).toBeNull();
  });
  it('usa el evento de varios días si no hay plan', () => {
    const r = proximoPlanMultidia([], [viaje()], HOY);
    expect(r).toMatchObject({ origen: 'evento', id: 'e1', titulo: 'Escapada', presupuestoCents: 90000 });
  });
  it('elige el que empieza antes; con empate, el plan', () => {
    expect(proximoPlanMultidia([plan], [viaje()], HOY)?.origen).toBe('plan');
    expect(proximoPlanMultidia([{ ...plan, start_date: '2026-12-05', end_date: '2026-12-08' }], [viaje()], HOY)?.origen).toBe('plan');
    expect(proximoPlanMultidia([{ ...plan, start_date: '2026-12-06', end_date: '2026-12-09' }], [viaje()], HOY)?.origen).toBe('evento');
  });
  it('un cumpleaños de un día anterior no esconde el viaje (mira todos los planes)', () => {
    expect(proximoPlanMultidia([cumple, plan], [], HOY)).toMatchObject({ origen: 'plan', id: 'p1' });
  });
  it('entre varios planes de varios días, el que empieza antes; uno en curso cuenta desde hoy', () => {
    const otro = { ...plan, id: 'p2', name: 'Roma', start_date: '2026-11-10', end_date: '2026-11-14' };
    expect(proximoPlanMultidia([plan, otro], [], HOY)?.id).toBe('p2');
    expect(proximoPlanMultidia([otro, { ...plan, id: 'p3', start_date: '2026-11-11', end_date: '2026-11-13' }], [], HOY)?.id).toBe('p2');
  });
  it('lleva lo gastado si se sabe', () => {
    expect(proximoPlanMultidia([{ ...plan, gastado_cents: 31200 }], [], HOY)?.gastadoCents).toBe(31200);
    expect(proximoPlanMultidia([plan], [], HOY)?.gastadoCents).toBeNull();
  });
  it('ignora los ya terminados', () => {
    expect(proximoPlanMultidia([{ ...plan, end_date: '2026-11-10' }], [], HOY)).toBeNull();
  });
});

describe('planes de un día (celebraciones) en Inicio', () => {
  const celeb = el({ tipo: 'plan', clave: 'plan:c1', origenId: 'c1', titulo: 'Cumple de Marta', hora: null, inicio: '2026-11-14', fecha: '2026-11-14', fin: '2026-11-14' });
  const cena = el({ clave: 'cena', titulo: 'Cena', inicio: '2026-11-15', fecha: '2026-11-15', fin: '2026-11-15' });
  it('es el próximo evento si es lo primero, y entonces no repite en «Esta semana»', () => {
    const lista = [cena, celeb];
    const proximo = proximoPlan(lista, HOY, '12:00');
    expect(proximo?.origenId).toBe('c1');
    expect(proximosDeLaSemana(lista, HOY, '12:00', [proximo?.clave ?? null]).map((e) => e.clave)).toEqual(['cena']);
  });
  it('si hay un evento antes, sale en «Esta semana»', () => {
    const antes = el({ clave: 'antes', titulo: 'Antes', inicio: '2026-11-13', fecha: '2026-11-13', fin: '2026-11-13' });
    const lista = [antes, celeb];
    expect(proximoPlan(lista, HOY, '12:00')?.clave).toBe('antes');
    expect(proximosDeLaSemana(lista, HOY, '12:00', ['antes']).map((e) => e.clave)).toEqual(['plan:c1']);
  });
  it('un plan de varios días nunca es el «próximo evento»', () => {
    expect(proximoPlan([el({ tipo: 'plan', inicio: '2026-11-14', fecha: '2026-11-14', fin: '2026-11-16' })], HOY, '12:00')).toBeNull();
  });
});

describe('textoEnDias y lineaMultidia', () => {
  it('cuenta atrás', () => {
    expect(textoEnDias('2026-12-05', HOY)).toBe('en 23 días');
    expect(textoEnDias('2026-11-13', HOY)).toBe('mañana');
    expect(textoEnDias(HOY, HOY)).toBe('empieza hoy');
    expect(textoEnDias('2026-11-10', HOY)).toBe('en curso');
  });
  it('fechas, duración y presupuesto', () => {
    expect(lineaMultidia({ inicio: '2026-12-05', fin: '2026-12-08', presupuestoCents: 90000 })).toBe('5 – 8 dic · 4 días · ~900 €');
    expect(lineaMultidia({ inicio: '2026-12-05', fin: '2026-12-08', presupuestoCents: null })).toBe('5 – 8 dic · 4 días');
    expect(lineaMultidia({ inicio: '2026-12-05', fin: '2026-12-08', presupuestoCents: 90000, gastadoCents: 31200 })).toBe('5 – 8 dic · 4 días · 312 € de 900 €');
    expect(lineaMultidia({ inicio: '2026-12-05', fin: '2026-12-08', presupuestoCents: null, gastadoCents: 31250 })).toBe('5 – 8 dic · 4 días · 312,50 € gastados');
    expect(lineaMultidia({ inicio: '2026-12-05', fin: '2026-12-08', presupuestoCents: 90000, gastadoCents: 0 })).toBe('5 – 8 dic · 4 días · ~900 €');
  });
});

describe('proximosDeLaSemana', () => {
  it('solo 7 días, sin lo excluido ni lo ya pasado, ordenado', () => {
    const lista = [
      el({ clave: 'a', titulo: 'A', inicio: '2026-11-14', fecha: '2026-11-14', fin: '2026-11-14' }),
      el({ clave: 'b', titulo: 'B', inicio: '2026-11-13', fecha: '2026-11-13', fin: '2026-11-13' }),
      el({ clave: 'c', titulo: 'C', inicio: '2026-11-30', fecha: '2026-11-30', fin: '2026-11-30' }),
      el({ clave: 'd', titulo: 'D', hora: '08:00' }),
      el({ clave: 'x', titulo: 'X' }),
    ];
    expect(proximosDeLaSemana(lista, HOY, '12:00', ['x']).map((e) => e.clave)).toEqual(['b', 'a']);
  });
});

const sitio = (extra: Partial<Sitio>): Sitio =>
  ({ id: 's', name: 'Sitio', status: 'been', created_at: '2026-11-01T10:00:00Z', place_notes: [], ...extra }) as Sitio;

describe('ultimoLugarVisitado y mediaValoracion', () => {
  const lista = [sitio({ id: 'a', created_at: '2026-11-01T10:00:00Z' }), sitio({ id: 'b', created_at: '2026-11-05T10:00:00Z' }), sitio({ id: 'c', status: 'want_to_go', created_at: '2026-11-09T10:00:00Z' })];
  it('con visita: el sitio de la última visita y su fecha', () => {
    expect(ultimoLugarVisitado(lista, { place_id: 'a', visited_on: '2026-11-07' })).toEqual({ sitio: lista[0], fecha: '2026-11-07' });
  });
  it('sin visita (o su sitio no se ve): el «Hemos ido» más reciente, sin fecha', () => {
    expect(ultimoLugarVisitado(lista)).toEqual({ sitio: lista[1], fecha: null });
    expect(ultimoLugarVisitado(lista, { place_id: 'oculto', visited_on: '2026-11-07' })).toEqual({ sitio: lista[1], fecha: null });
    expect(ultimoLugarVisitado([sitio({ status: 'want_to_go' })])).toBeNull();
  });
  it('media de las valoraciones puestas', () => {
    expect(mediaValoracion(sitio({ place_notes: [{ user_id: 'u1', rating: 4, note: null }, { user_id: 'u2', rating: 5, note: null }, { user_id: 'u3', rating: null, note: 'x' }] }))).toBe(4.5);
    expect(mediaValoracion(sitio({}))).toBeNull();
    expect(textoMedia(4.5)).toBe('4,5');
    expect(textoMedia(4)).toBe('4');
  });
});

describe('haceCuanto', () => {
  const ahora = new Date('2026-11-12T15:00:00Z');
  it('minutos, horas, ayer, días y fecha', () => {
    expect(haceCuanto('2026-11-12T14:59:50Z', ahora)).toBe('ahora mismo');
    expect(haceCuanto('2026-11-12T14:30:00Z', ahora)).toBe('hace 30 min');
    expect(haceCuanto('2026-11-12T13:00:00Z', ahora)).toBe('hace 2 h');
    expect(haceCuanto('2026-11-11T12:00:00Z', ahora)).toBe('ayer');
    expect(haceCuanto('2026-11-09T12:00:00Z', ahora)).toBe('hace 3 días');
    expect(haceCuanto('2026-10-01T12:00:00Z', ahora)).toBe('1 oct');
  });
});

describe('movimientosRecientes', () => {
  const gasto = { id: 'g1', concept: 'Cena', amount_cents: 2400, created_by: 'yo', created_at: '2026-11-12T10:00:00Z' } as unknown as Gasto;
  const pago = { id: 'p1', amount_cents: 1200, from_slot: 'm2', to_slot: 'm1', created_by: 'ella', created_at: '2026-11-12T12:00:00Z' } as unknown as Pago;
  const base = { gastos: [gasto], pagos: [pago], sitios: [sitio({ id: 's1', name: 'Bar', created_by: 'ella', created_at: '2026-11-11T10:00:00Z' })], eventos: [{ id: 'e1', title: 'Cine', created_by: 'yo', created_at: '2026-11-10T10:00:00Z' }], yoId: 'yo', yo: 'm1' as const, nombrePareja: 'María' };
  it('mezcla, ordena por fecha y dice quién', () => {
    const r = movimientosRecientes(base);
    expect(r.map((m) => m.clave)).toEqual(['pago:p1', 'gasto:g1', 'sitio:s1', 'evento:e1']);
    expect(r[0].texto).toContain('María te pagó');
    expect(r[1].texto).toMatch(/^Añadiste «Cena» · /);
    expect(r[2].texto).toBe('María guardó «Bar»');
    expect(r[3].texto).toBe('Apuntaste «Cine»');
  });
  it('recorta al máximo', () => expect(movimientosRecientes(base, 2)).toHaveLength(2));
});

describe('elementos del itinerario de un plan en Inicio', () => {
  const dePlan = (titulo: string, planId: string, extra: Partial<Elemento> = {}) => el({ titulo, planId, origenId: titulo, clave: `event:${titulo}`, ...extra });
  it('el próximo evento no es un elemento del plan que ya sale como «Próximo plan»', () => {
    const lista = [dePlan('Cena', 'p1', { hora: '20:00' }), dePlan('Museo', 'p2', { hora: '22:00' })];
    expect(proximoPlan(lista, HOY, '12:00')?.titulo).toBe('Cena');
    expect(proximoPlan(lista, HOY, '12:00', ['p1'])?.titulo).toBe('Museo');
    expect(proximoPlan(lista, HOY, '12:00', ['p1', 'p2'])).toBeNull();
  });
  it('«Esta semana» no repite los elementos de los planes ya mostrados, pero sí los de otros', () => {
    const lista = [dePlan('Cena', 'p1', { hora: '20:00' }), dePlan('Museo', 'p2', { hora: '22:00' }), el({ titulo: 'Cine', hora: '21:00' })];
    expect(proximosDeLaSemana(lista, HOY, '12:00', [], 4, ['p1']).map((e) => e.titulo)).toEqual(['Cine', 'Museo']);
    expect(proximosDeLaSemana(lista, HOY, '12:00', []).map((e) => e.titulo)).toEqual(['Cena', 'Cine', 'Museo']);
  });
});

describe('lineaMultidia con presupuestos apagados', () => {
  const base = { inicio: '2026-12-05', fin: '2026-12-08', presupuestoCents: 90000 };
  it('nunca dice el presupuesto; solo lo gastado si lo hay', () => {
    expect(lineaMultidia(base, false)).toBe('5 – 8 dic · 4 días');
    expect(lineaMultidia({ ...base, gastadoCents: 31200 }, false)).toBe('5 – 8 dic · 4 días · 312 € gastados');
  });
});
