import { type Recurrente, esPersonal, importeRecurrente, lineaRecurrente, proximoCobro, textoFrecuencia, totales } from '@/lib/gastos/recurrentes';

const base: Recurrente = {
  id: 'r1',
  name: 'Netflix',
  category: 'subscriptions',
  amount_cents: 1299,
  is_variable: false,
  frequency: 'monthly',
  day_of_month: 16,
  month_of_year: null,
  start_date: '2026-01-01',
  end_date: null,
  paused: false,
  paid_by: 'pot',
  split_mode: 'pot',
  split_pct_m1: null,
  reminder_days: 1,
  visible_to_partner: true,
  show_in_calendar: true,
  created_by: 'u1',
  version: 1,
};

describe('proximoCobro', () => {
  it('este mes si aún no ha llegado el día', () => {
    expect(proximoCobro(base, '2026-11-10')).toBe('2026-11-16');
  });
  it('hoy cuenta', () => {
    expect(proximoCobro(base, '2026-11-16')).toBe('2026-11-16');
  });
  it('el mes siguiente si ya pasó', () => {
    expect(proximoCobro(base, '2026-11-17')).toBe('2026-12-16');
  });
  it('día 31 en febrero → último día', () => {
    expect(proximoCobro({ ...base, day_of_month: 31 }, '2027-02-01')).toBe('2027-02-28');
    expect(proximoCobro({ ...base, day_of_month: 31 }, '2028-02-01')).toBe('2028-02-29');
  });
  it('día 31 de diciembre pasado → enero del año siguiente', () => {
    expect(proximoCobro({ ...base, day_of_month: 5 }, '2026-12-20')).toBe('2027-01-05');
  });
  it('anual: 29 feb en año no bisiesto', () => {
    const anual = { ...base, frequency: 'yearly' as const, day_of_month: 29, month_of_year: 2 };
    expect(proximoCobro(anual, '2026-11-17')).toBe('2027-02-28');
    expect(proximoCobro(anual, '2027-03-01')).toBe('2028-02-29');
  });
  it('no antes de start_date', () => {
    expect(proximoCobro({ ...base, start_date: '2027-03-01' }, '2026-11-17')).toBe('2027-03-16');
  });
  it('puntual ya pasado → null', () => {
    const una = { ...base, frequency: 'once' as const, start_date: '2026-11-01' };
    expect(proximoCobro(una, '2026-11-17')).toBeNull();
    expect(proximoCobro({ ...una, start_date: '2026-12-01' }, '2026-11-17')).toBe('2026-12-01');
  });
  it('pausado o terminado → null', () => {
    expect(proximoCobro({ ...base, paused: true }, '2026-11-10')).toBeNull();
    expect(proximoCobro({ ...base, end_date: '2026-11-15' }, '2026-11-10')).toBeNull();
  });
});

describe('totales y tipos', () => {
  it('mensuales y anuales por separado, sin pausados ni puntuales', () => {
    expect(
      totales([
        { ...base, amount_cents: 1000 },
        { ...base, amount_cents: 500, paused: true },
        { ...base, amount_cents: 12000, frequency: 'yearly' },
        { ...base, amount_cents: 3000, frequency: 'once' },
      ]),
    ).toEqual({ mes: 1000, anio: 12000 });
  });
  it('personal = lo paga y es solo de una persona', () => {
    expect(esPersonal({ split_mode: 'only_m2', paid_by: 'm2' })).toBe(true);
    expect(esPersonal({ split_mode: 'only_m2', paid_by: 'm1' })).toBe(false);
    expect(esPersonal({ split_mode: 'half', paid_by: 'm1' })).toBe(false);
  });
});

describe('textos', () => {
  it('línea de la lista', () => {
    expect(lineaRecurrente(base, 'm1', 'Meri')).toBe('Día 16 · Bote común');
    expect(lineaRecurrente({ ...base, paid_by: 'm1', split_mode: 'half', split_pct_m1: 50, is_variable: true }, 'm1', 'Meri')).toBe(
      'Día 16 · A medias · importe variable',
    );
    expect(lineaRecurrente({ ...base, paid_by: 'm2', split_mode: 'only_m2' }, 'm2', 'David')).toBe('Día 16 · Solo tuyo');
  });
  it('frecuencia', () => {
    expect(textoFrecuencia('monthly', 16, 1, '2026-11-17')).toBe('El día 16 de cada mes');
    expect(textoFrecuencia('yearly', 3, 3, '2026-11-17')).toBe('Cada 3 de marzo');
    expect(textoFrecuencia('once', 1, 1, '2026-12-12')).toBe('El 12 de diciembre de 2026');
  });
});

describe('uno por periodo (como el job)', () => {
  it('si ya se cobró este mes, el próximo es el mes siguiente aunque cambie el día', () => {
    const r = { ...base, day_of_month: 20, active_from: '2026-01-01', ultimo_cobro: '2026-11-16' };
    expect(proximoCobro(r, '2026-11-17')).toBe('2026-12-20');
  });
  it('sin cobro este mes, cobra este mes', () => {
    const r = { ...base, day_of_month: 20, active_from: '2026-01-01', ultimo_cobro: '2026-10-16' };
    expect(proximoCobro(r, '2026-11-17')).toBe('2026-11-20');
  });
  it('no antes de active_from', () => {
    expect(proximoCobro({ ...base, active_from: '2026-11-20' }, '2026-11-10')).toBe('2026-12-16');
  });
  it('puntual ya cobrado → null', () => {
    const una = { ...base, frequency: 'once' as const, start_date: '2026-12-01', ultimo_cobro: '2026-12-01' };
    expect(proximoCobro(una, '2026-11-17')).toBeNull();
  });
});

describe('variables con factura real', () => {
  const luz = { ...base, name: 'Luz', is_variable: true, amount_cents: 4800, paid_by: 'm1' as const, split_mode: 'half' as const, split_pct_m1: 50 };
  it('sin facturas: aproximado', () => {
    expect(importeRecurrente(luz).replace(/ /g, ' ')).toBe('~48,00 €');
    expect(lineaRecurrente(luz, 'm1', 'Meri')).toBe('Día 16 · A medias · importe variable');
  });
  it('con factura: el importe real', () => {
    const conFactura = { ...luz, ultima_factura: { fecha: '2026-11-16', cents: 5230 } };
    expect(importeRecurrente(conFactura).replace(/ /g, ' ')).toBe('52,30 €');
    expect(lineaRecurrente(conFactura, 'm1', 'Meri')).toMatch(/· factura del 16 nov$/);
    expect(totales([conFactura])).toEqual({ mes: 5230, anio: 0 });
  });
  it('esperando el importe', () => {
    expect(lineaRecurrente({ ...luz, falta_importe: true }, 'm1', 'Meri')).toBe('Día 16 · A medias · falta el importe');
  });
});
