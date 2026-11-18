import { edad, esBisiesto, fechasRepeticion, proximaRepeticion, textoCorto, textoRepeticion } from '@/lib/calendario/repeticion';

describe('fechasRepeticion', () => {
  it('sin repetición: solo la fecha, si cae en el rango', () => {
    expect(fechasRepeticion('2026-11-15', 'none', null, '2026-11-01', '2026-11-30')).toEqual(['2026-11-15']);
    expect(fechasRepeticion('2026-11-15', 'none', null, '2026-12-01', '2026-12-31')).toEqual([]);
  });
  it('semanal: cada 7 días desde la fecha original, nunca antes', () => {
    expect(fechasRepeticion('2026-11-02', 'weekly', null, '2026-11-09', '2026-11-30')).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
    expect(fechasRepeticion('2026-11-20', 'weekly', null, '2026-11-01', '2026-11-30')).toEqual(['2026-11-20', '2026-11-27']);
  });
  it('mensual del 31: febrero cae el último día y marzo vuelve al 31, sin deriva', () => {
    expect(fechasRepeticion('2027-01-31', 'monthly', null, '2027-02-01', '2027-04-30')).toEqual(['2027-02-28', '2027-03-31', '2027-04-30']);
    expect(fechasRepeticion('2027-12-31', 'monthly', null, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });
  it('anual del 29 de febrero: el 28 los años no bisiestos y el 29 al volver a serlo', () => {
    expect(fechasRepeticion('2028-02-29', 'yearly', null, '2029-01-01', '2029-12-31')).toEqual(['2029-02-28']);
    expect(fechasRepeticion('2028-02-29', 'yearly', null, '2032-01-01', '2032-12-31')).toEqual(['2032-02-29']);
  });
  it('anual: el cumpleaños sale en 2027 y 2028', () => {
    expect(fechasRepeticion('2026-03-15', 'yearly', null, '2027-03-01', '2028-03-31')).toEqual(['2027-03-15', '2028-03-15']);
  });
  it('respeta «repetir hasta»', () => {
    expect(fechasRepeticion('2026-11-02', 'weekly', '2026-11-16', '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
  });
});

describe('proximaRepeticion', () => {
  it('sin repetición', () => {
    expect(proximaRepeticion('2026-12-01', 'none', null, '2026-11-17')).toBe('2026-12-01');
    expect(proximaRepeticion('2026-11-01', 'none', null, '2026-11-17')).toBeNull();
  });
  it('la de hoy cuenta; la anual pasa al año siguiente', () => {
    expect(proximaRepeticion('2026-03-15', 'yearly', null, '2026-11-17')).toBe('2027-03-15');
    expect(proximaRepeticion('2026-11-17', 'yearly', null, '2026-11-17')).toBe('2026-11-17');
  });
  it('semanal y mensual', () => {
    expect(proximaRepeticion('2026-11-02', 'weekly', null, '2026-11-17')).toBe('2026-11-23');
    expect(proximaRepeticion('2026-01-31', 'monthly', null, '2026-02-01')).toBe('2026-02-28');
  });
  it('una serie terminada no tiene próxima', () => {
    expect(proximaRepeticion('2026-01-05', 'weekly', '2026-02-02', '2026-11-17')).toBeNull();
  });
  it('un evento que aún no ha empezado: la fecha de inicio', () => {
    expect(proximaRepeticion('2027-05-10', 'monthly', null, '2026-11-17')).toBe('2027-05-10');
  });
});

describe('proximaRepeticion con varios días', () => {
  it('un viaje en curso abre su repetición actual, no la siguiente', () => {
    // 14–18 (dura 4 días más) y hoy es el 16: sigue en curso.
    expect(proximaRepeticion('2026-11-14', 'none', null, '2026-11-16', 4)).toBe('2026-11-14');
    expect(proximaRepeticion('2026-11-14', 'none', null, '2026-11-19', 4)).toBeNull();
  });
  it('anual de 3 días (duran 2 más): el segundo día es la repetición de este año', () => {
    expect(proximaRepeticion('2026-03-14', 'yearly', null, '2027-03-15', 2)).toBe('2027-03-14');
    expect(proximaRepeticion('2026-03-14', 'yearly', null, '2027-03-17', 2)).toBe('2028-03-14');
  });
  it('semanal de 3 días: el domingo cuenta aún la repetición del viernes', () => {
    expect(proximaRepeticion('2026-11-13', 'weekly', null, '2026-11-15', 2)).toBe('2026-11-13');
  });
});

describe('cumpleaños: 29 de febrero y edad', () => {
  it('el ancla 2000-02-29 cae el 28 los años no bisiestos y el 29 al volver a serlo', () => {
    expect(fechasRepeticion('2000-02-29', 'yearly', null, '2027-02-01', '2027-03-05')).toEqual(['2027-02-28']);
    expect(fechasRepeticion('2000-02-29', 'yearly', null, '2028-02-01', '2028-03-05')).toEqual(['2028-02-29']);
    expect(proximaRepeticion('2000-02-29', 'yearly', null, '2026-11-18')).toBe('2027-02-28');
  });
  it('un cumpleaños normal con ancla 2000 sale cada año', () => {
    expect(fechasRepeticion('2000-03-15', 'yearly', null, '2026-03-01', '2027-03-31')).toEqual(['2026-03-15', '2027-03-15']);
  });
  it('esBisiesto', () => {
    expect([2000, 2024, 2028].every(esBisiesto)).toBe(true);
    expect([1900, 2026, 2100].some(esBisiesto)).toBe(false);
  });
  it('edad: año de la repetición menos el de nacimiento; sin año o aún sin nacer, null', () => {
    expect(edad(1966, '2026-03-15')).toBe(60);
    expect(edad(1966, '2027-03-15')).toBe(61);
    expect(edad(null, '2027-03-15')).toBeNull();
    expect(edad(undefined, '2027-03-15')).toBeNull();
    expect(edad(2026, '2026-03-15')).toBeNull();
    expect(edad(2026, '2025-03-15')).toBeNull();
  });
});

describe('textos', () => {
  it('corto', () => {
    expect(textoCorto('yearly')).toBe('cada año');
    expect(textoCorto('weekly')).toBe('cada semana');
    expect(textoCorto('monthly')).toBe('cada mes');
    expect(textoCorto('none')).toBeNull();
    expect(textoCorto(null)).toBeNull();
  });
  it('largo', () => {
    expect(textoRepeticion('yearly', '2026-03-15')).toBe('Cada año, el 15 de marzo');
    expect(textoRepeticion('monthly', '2026-11-15')).toBe('Cada mes, el día 15');
    expect(textoRepeticion('monthly', '2026-01-31')).toBe('Cada mes, el día 31 o el último del mes');
    expect(textoRepeticion('weekly', '2026-11-09')).toBe('Cada semana, los lunes');
    expect(textoRepeticion('weekly', '2026-11-14')).toBe('Cada semana, los sábados');
    expect(textoRepeticion('yearly', '2028-02-29')).toBe('Cada año, el 29 de febrero (el 28 si no es bisiesto)');
    expect(textoRepeticion('none', '2026-11-09')).toBe('No se repite');
  });
});
