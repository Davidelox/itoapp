import type { Elemento } from '@/lib/calendario/agrupar';
import {
  destinoTrasGuardarPago,
  diaDelEventoNuevo,
  filtroParaVer,
  leerObjetivo,
  origenDe,
  paramsAlCalendario,
} from '@/lib/calendario/destino';

const base: Elemento = {
  clave: 'event:e1:2026-12-05',
  tipo: 'event',
  origenId: 'e1',
  fecha: '2026-12-05',
  inicio: '2026-12-05',
  fin: '2026-12-05',
  diaN: null,
  titulo: 'Cena',
  hora: null,
  todoElDia: true,
  importeCents: null,
  estimado: false,
  estado: null,
  repeticion: 'none',
  asistentes: 'both',
  secreto: false,
  cobroId: null,
  categoria: 'eating_out',
  anioNacimiento: null,
  frecuencia: null,
};

describe('origenDe', () => {
  it('reconoce el calendario y trata todo lo demás como gastos', () => {
    expect(origenDe('calendario')).toBe('calendario');
    expect(origenDe(['calendario', 'x'])).toBe('calendario');
    expect(origenDe('gastos')).toBe('gastos');
    expect(origenDe(undefined)).toBe('gastos');
    expect(origenDe('otra-cosa')).toBe('gastos');
  });
});

describe('paramsAlCalendario', () => {
  it('lleva el día y el elemento', () => {
    expect(paramsAlCalendario('2026-12-05', 'e1')).toEqual({ dia: '2026-12-05', evento: 'e1' });
  });
  it('sin id, solo el día', () => {
    expect(paramsAlCalendario('2026-12-05')).toEqual({ dia: '2026-12-05' });
  });
  it('sin día válido no pasa nada (ni el id)', () => {
    expect(paramsAlCalendario(null, 'e1')).toEqual({});
    expect(paramsAlCalendario('2026-02-31', 'e1')).toEqual({});
    expect(paramsAlCalendario('mañana', 'e1')).toEqual({});
  });
});

describe('leerObjetivo', () => {
  it('lee el día y el evento', () => {
    expect(leerObjetivo('2026-12-05', 'e1')).toEqual({ dia: '2026-12-05', evento: 'e1' });
    expect(leerObjetivo(['2026-12-05'], undefined)).toEqual({ dia: '2026-12-05', evento: null });
  });
  it('ignora un día roto o ausente', () => {
    expect(leerObjetivo(undefined, 'e1')).toBeNull();
    expect(leerObjetivo('2026-13-01', 'e1')).toBeNull();
    expect(leerObjetivo('basura', undefined)).toBeNull();
  });
});

describe('filtroParaVer', () => {
  it('mantiene el filtro si deja pasar el elemento', () => {
    expect(filtroParaVer('todos', base)).toBe('todos');
    expect(filtroParaVer('eating_out', base)).toBe('eating_out');
    expect(filtroParaVer('event', base)).toBe('event');
  });
  it('cambia a «Todos» si el filtro lo oculta', () => {
    expect(filtroParaVer('payment', base)).toBe('todos');
    expect(filtroParaVer('trip', base)).toBe('todos');
    expect(filtroParaVer('birthday', base)).toBe('todos');
    expect(filtroParaVer('event', { ...base, categoria: 'birthday' })).toBe('todos');
    expect(filtroParaVer('event', { ...base, tipo: 'payment', categoria: null })).toBe('todos');
  });
  it('un pago pasa el filtro «Pagos»', () => {
    expect(filtroParaVer('payment', { ...base, tipo: 'payment', categoria: null })).toBe('payment');
  });
  it('sin elemento no toca el filtro', () => {
    expect(filtroParaVer('payment', undefined)).toBe('payment');
  });
});

describe('diaDelEventoNuevo', () => {
  it('un evento: su fecha de inicio', () => {
    expect(diaDelEventoNuevo({ fecha: '2026-12-05', dia: 1, mes: 1 }, false, '2026-11-18')).toBe('2026-12-05');
  });
  it('un cumpleaños: la próxima celebración', () => {
    expect(diaDelEventoNuevo({ fecha: '2026-11-18', dia: 3, mes: 3 }, true, '2026-11-18')).toBe('2027-03-03');
    expect(diaDelEventoNuevo({ fecha: '2026-11-18', dia: 20, mes: 11 }, true, '2026-11-18')).toBe('2026-11-20');
    expect(diaDelEventoNuevo({ fecha: '2026-11-18', dia: 18, mes: 11 }, true, '2026-11-18')).toBe('2026-11-18');
  });
});

describe('destinoTrasGuardarPago', () => {
  it('desde el calendario vuelve a él con el día del primer cobro y el pago', () => {
    expect(destinoTrasGuardarPago('calendario', 'p1', '2026-12-10')).toEqual({
      destino: 'calendario',
      params: { dia: '2026-12-10', evento: 'p1' },
    });
  });
  it('desde el calendario sin primer cobro vuelve sin parámetros', () => {
    expect(destinoTrasGuardarPago('calendario', 'p1', null)).toEqual({ destino: 'calendario', params: {} });
  });
  it('desde gastos va a la lista de pagos recurrentes', () => {
    expect(destinoTrasGuardarPago('gastos', 'p1', '2026-12-10')).toEqual({ destino: 'recurrentes' });
  });
});
