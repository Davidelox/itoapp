import { ANIO_MAX, ANIO_MIN, anclaDeMes, dentroDeLimites, direccionSalto, limitarAnio, mesesDelAnio, semanasParaElegir } from '@/lib/calendario/selectorMes';

const HOY = '2026-11-18';

describe('limitarAnio y dentroDeLimites', () => {
  it('limita al rango 2000–2100', () => {
    expect(limitarAnio(1999)).toBe(ANIO_MIN);
    expect(limitarAnio(2101)).toBe(ANIO_MAX);
    expect(limitarAnio(2026)).toBe(2026);
  });
  it('dentroDeLimites mira el año de la fecha', () => {
    expect(dentroDeLimites('2000-01-01')).toBe(true);
    expect(dentroDeLimites('2100-12-31')).toBe(true);
    expect(dentroDeLimites('1999-12-31')).toBe(false);
    expect(dentroDeLimites('2101-01-01')).toBe(false);
  });
});

describe('anclaDeMes', () => {
  it('el mes actual deja hoy', () => {
    expect(anclaDeMes(2026, 11, HOY)).toBe(HOY);
  });
  it('otro mes deja el día 1', () => {
    expect(anclaDeMes(2026, 12, HOY)).toBe('2026-12-01');
    expect(anclaDeMes(2027, 2, HOY)).toBe('2027-02-01');
    expect(anclaDeMes(2025, 11, HOY)).toBe('2025-11-01');
  });
  it('limita el año', () => {
    expect(anclaDeMes(1999, 3, HOY)).toBe('2000-03-01');
    expect(anclaDeMes(2101, 3, HOY)).toBe('2100-03-01');
  });
});

describe('mesesDelAnio', () => {
  it('da los 12 meses con etiqueta y texto accesible', () => {
    const m = mesesDelAnio(2027, '2027-03-10', HOY);
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ mes: 1, etiqueta: 'Ene', accesible: 'Enero de 2027' });
    expect(m[11]).toMatchObject({ mes: 12, etiqueta: 'Dic', accesible: 'Diciembre de 2027' });
  });
  it('marca el visible y el de hoy', () => {
    const m = mesesDelAnio(2026, '2026-03-10', HOY);
    expect(m.filter((c) => c.visible).map((c) => c.mes)).toEqual([3]);
    expect(m.filter((c) => c.actual).map((c) => c.mes)).toEqual([11]);
  });
  it('en otro año no hay mes actual, y el visible solo en su año', () => {
    const m = mesesDelAnio(2027, '2026-03-10', HOY);
    expect(m.some((c) => c.actual)).toBe(false);
    expect(m.some((c) => c.visible)).toBe(false);
  });
});

describe('semanasParaElegir', () => {
  it('noviembre de 2026 tiene 6 semanas', () => {
    const s = semanasParaElegir(2026, 11, '2026-11-10', HOY);
    expect(s).toHaveLength(6);
    expect(s[0].etiqueta).toBe('26 oct–1 nov');
    expect(s[1].etiqueta).toBe('2–8 nov');
  });
  it('febrero de 2027 empieza en lunes: 4 semanas', () => {
    const s = semanasParaElegir(2027, 2, '2027-02-10', HOY);
    expect(s).toHaveLength(4);
    expect(s[0].ancla).toBe('2027-02-01');
    expect(s[3].etiqueta).toBe('22–28 feb');
  });
  it('una semana que cruza el año', () => {
    const s = semanasParaElegir(2026, 12, '2026-12-01', HOY);
    const cruce = s.find((o) => o.ancla === '2026-12-28');
    expect(cruce?.etiqueta).toBe('28 dic–3 ene');
    expect(cruce?.accesible).toContain('2027');
  });
  it('la de hoy tiene como ancla hoy y está marcada como actual', () => {
    const s = semanasParaElegir(2026, 11, '2026-11-02', HOY);
    const actual = s.filter((o) => o.actual);
    expect(actual).toHaveLength(1);
    expect(actual[0].ancla).toBe(HOY);
  });
  it('enero de 2000: la primera semana no pasa de los límites (ancla el 1 de enero)', () => {
    const s = semanasParaElegir(2000, 1, '2000-01-10', HOY);
    expect(s[0].etiqueta).toBe('27 dic–2 ene');
    expect(s[0].ancla).toBe('2000-01-01');
    expect(dentroDeLimites(s[0].ancla)).toBe(true);
    expect(s[1].ancla).toBe('2000-01-03');
  });
  it('marca la visible y las demás tienen el lunes por ancla', () => {
    const s = semanasParaElegir(2026, 11, '2026-11-10', HOY);
    expect(s.filter((o) => o.visible).map((o) => o.ancla)).toEqual(['2026-11-09']);
    expect(s[2].ancla).toBe('2026-11-09');
  });
});

describe('direccionSalto', () => {
  it('en Mes: atrás, adelante e igual', () => {
    expect(direccionSalto('mes', '2026-11-18', '2026-05-01')).toBe(-1);
    expect(direccionSalto('mes', '2026-11-18', '2027-01-01')).toBe(1);
    expect(direccionSalto('mes', '2026-11-18', '2026-11-30')).toBe(0);
  });
  it('en Semana: atrás, adelante e igual', () => {
    expect(direccionSalto('semana', '2026-11-18', '2026-11-09')).toBe(-1);
    expect(direccionSalto('semana', '2026-11-18', '2026-11-23')).toBe(1);
    expect(direccionSalto('semana', '2026-11-18', '2026-11-22')).toBe(0);
  });
});
