import {
  diaCorto,
  diaDeMes,
  diasEntre,
  etiquetaPeriodo,
  etiquetaSemana,
  inicioSemana,
  mismoPeriodo,
  mover,
  moverMes,
  moverSemana,
  rangoCorto,
  rangoVisible,
  semanaDe,
  semanasDelMes,
  tituloDia,
} from '@/lib/calendario/rejilla';

describe('semanas del mes (de lunes a domingo)', () => {
  it('noviembre de 2026 empieza el 26 de octubre y ocupa 6 semanas', () => {
    const s = semanasDelMes('2026-11-15');
    expect(s).toHaveLength(6);
    expect(s[0][0]).toBe('2026-10-26');
    expect(s[5][6]).toBe('2026-12-06');
    expect(s.every((w) => w.length === 7)).toBe(true);
  });
  it('febrero de 2027 son 4 semanas exactas', () => {
    const s = semanasDelMes('2027-02-10');
    expect(s).toHaveLength(4);
    expect(s[0][0]).toBe('2027-02-01');
    expect(s[3][6]).toBe('2027-02-28');
  });
  it('cada semana empieza en lunes y son días seguidos', () => {
    const s = semanasDelMes('2026-12-01').flat();
    for (let i = 1; i < s.length; i++) expect(diasEntre(s[i - 1], s[i])).toBe(1);
    expect(new Date(2026, 10, 30).getDay()).toBe(1);
    expect(s[0]).toBe('2026-11-30');
  });
  it('un mes cuya semana cruza el año', () => {
    expect(semanasDelMes('2027-01-20')[0][0]).toBe('2026-12-28');
  });
});

describe('semana de una fecha', () => {
  it('el domingo pertenece a la semana que empieza el lunes anterior', () => {
    expect(inicioSemana('2026-11-15')).toBe('2026-11-09');
    expect(inicioSemana('2026-11-09')).toBe('2026-11-09');
    expect(semanaDe('2026-11-15')[6]).toBe('2026-11-15');
  });
  it('rango visible: 42 días como mucho en mes, 7 en semana', () => {
    const m = rangoVisible('mes', '2026-11-15');
    expect(diasEntre(m.desde, m.hasta) + 1).toBe(42);
    expect(rangoVisible('semana', '2026-11-12')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
  });
});

describe('mover', () => {
  it('mes: conserva el día y, si no existe, usa el último', () => {
    expect(moverMes('2026-11-17', 1)).toBe('2026-12-17');
    expect(moverMes('2026-12-17', 1)).toBe('2027-01-17');
    expect(moverMes('2027-01-31', 1)).toBe('2027-02-28');
    expect(moverMes('2026-01-15', -1)).toBe('2025-12-15');
  });
  it('semana: 7 días', () => {
    expect(moverSemana('2026-12-28', 1)).toBe('2027-01-04');
    expect(mover('semana', '2026-11-12', -1)).toBe('2026-11-05');
    expect(mover('mes', '2026-11-12', -1)).toBe('2026-10-12');
  });
  it('mismo periodo', () => {
    expect(mismoPeriodo('mes', '2026-11-01', '2026-11-30')).toBe(true);
    expect(mismoPeriodo('mes', '2026-11-30', '2026-12-01')).toBe(false);
    expect(mismoPeriodo('semana', '2026-11-09', '2026-11-15')).toBe(true);
    expect(mismoPeriodo('semana', '2026-11-09', '2026-11-16')).toBe(false);
  });
});

describe('etiquetas', () => {
  it('mes y semana', () => {
    expect(etiquetaPeriodo('mes', '2026-11-12')).toBe('Noviembre 2026');
    expect(etiquetaPeriodo('semana', '2026-11-12')).toBe('9 – 15 nov');
  });
  it('semana que cruza el mes y el año', () => {
    expect(etiquetaSemana('2026-12-30')).toBe('28 dic – 3 ene');
    expect(etiquetaSemana('2026-12-30', 2026)).toBe('28 dic – 3 ene 2027');
    expect(etiquetaSemana('2026-11-12', 2026)).toBe('9 – 15 nov');
  });
  it('día', () => {
    expect(tituloDia('2026-11-14')).toBe('Sábado 14');
    expect(diaDeMes('2026-11-14')).toBe('14 de noviembre');
  });
});

describe('día corto y rango corto', () => {
  it('«vie 14»', () => {
    expect(diaCorto('2026-11-13')).toBe('vie 13');
    expect(diaCorto('2026-11-18')).toBe('mié 18');
    expect(diaCorto('2026-11-21')).toBe('sáb 21');
  });
  it('«14 – 18 nov» y, si cambia el mes, «28 oct – 3 nov»', () => {
    expect(rangoCorto('2026-11-14', '2026-11-18')).toBe('14 – 18 nov');
    expect(rangoCorto('2026-10-28', '2026-11-03')).toBe('28 oct – 3 nov');
  });
});
