import {
  PRIMERA_FECHA_VISITA,
  type Visita,
  errorFechaVisita,
  fechaSugerida,
  fechaVisita,
  gastoDelDia,
  notaDeVisita,
  ordenarVisitas,
  pedirFechaAlMarcar,
  textoContadorVisitas,
  textoUltimaVisita,
} from '@/lib/mapa/visitas';

const HOY = '2026-11-20';
const v = (id: string, visited_on: string): Visita => ({ id, visited_on, note: null, created_by: null, version: 1 });

describe('ordenarVisitas', () => {
  it('la más reciente primero, sin tocar la lista original', () => {
    const lista = [v('a', '2026-10-18'), v('b', '2026-11-07'), v('c', '2026-09-01')];
    expect(ordenarVisitas(lista).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(lista[0].id).toBe('a');
  });
  it('a igual día, orden estable por id', () => {
    expect(ordenarVisitas([v('b', '2026-11-07'), v('a', '2026-11-07')]).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('fechaVisita', () => {
  it('«sáb 7 nov», con año si no es el actual', () => {
    expect(fechaVisita('2026-11-07', HOY)).toBe('sáb 7 nov');
    expect(fechaVisita('2025-11-07', HOY)).toBe('vie 7 nov 2025');
  });
});

describe('textoContadorVisitas y textoUltimaVisita', () => {
  it('singular y plural', () => {
    expect(textoContadorVisitas(1)).toBe('1 visita');
    expect(textoContadorVisitas(3)).toBe('3 visitas');
  });
  it('con visitas: la última', () => {
    expect(textoUltimaVisita('been', { visit_count: 3, last_visit_on: '2026-11-07' }, HOY)).toBe('Última visita: sáb 7 nov');
  });
  it('«Hemos ido» sin visitas: «Sin fecha»; «Quiero ir» sin visitas: nada', () => {
    expect(textoUltimaVisita('been', { visit_count: 0, last_visit_on: null }, HOY)).toBe('Sin fecha');
    expect(textoUltimaVisita('been', null, HOY)).toBe('Sin fecha');
    expect(textoUltimaVisita('want_to_go', { visit_count: 0, last_visit_on: null }, HOY)).toBeNull();
  });
});

describe('errorFechaVisita', () => {
  it('hoy y el pasado valen', () => {
    expect(errorFechaVisita(HOY, HOY)).toBeNull();
    expect(errorFechaVisita('2026-11-07', HOY)).toBeNull();
    expect(errorFechaVisita(PRIMERA_FECHA_VISITA, HOY)).toBeNull();
  });
  it('futura, anterior a 1950 o no real: error', () => {
    expect(errorFechaVisita('2026-11-21', HOY)).toMatch(/futura/);
    expect(errorFechaVisita('1949-12-31', HOY)).toMatch(/antigua/);
    expect(errorFechaVisita('2026-02-30', HOY)).toBe('Elige una fecha.');
    expect(errorFechaVisita('', HOY)).toBe('Elige una fecha.');
  });
});

describe('notaDeVisita', () => {
  it('recorta, limita a 200 y vacía es null', () => {
    expect(notaDeVisita('  rica  ')).toBe('rica');
    expect(notaDeVisita('   ')).toBeNull();
    expect(notaDeVisita('x'.repeat(250))).toHaveLength(200);
  });
});

describe('fechaSugerida y pedirFechaAlMarcar', () => {
  it('la fecha sugerida o null', () => {
    expect(fechaSugerida({ suggested_visit_on: '2026-11-14' })).toBe('2026-11-14');
    expect(fechaSugerida({ suggested_visit_on: null })).toBeNull();
    expect(fechaSugerida(undefined)).toBeNull();
  });
  it('solo se pide la fecha si no hay visitas', () => {
    expect(pedirFechaAlMarcar({ visit_count: 0 })).toBe(true);
    expect(pedirFechaAlMarcar(null)).toBe(true);
    expect(pedirFechaAlMarcar({ visit_count: 2 })).toBe(false);
  });
});

describe('gastoDelDia', () => {
  const planes = [
    { tipo: 'gasto' as const, id: '1', titulo: 'Cena', fecha: '2026-11-07', importe_cents: 6200 },
    { tipo: 'gasto' as const, id: '2', titulo: 'Copas', fecha: '2026-11-07', importe_cents: 1000 },
    { tipo: 'evento' as const, id: '3', titulo: 'Plan', fecha: '2026-11-07', importe_cents: null },
    { tipo: 'gasto' as const, id: '4', titulo: 'Otro día', fecha: '2026-10-18', importe_cents: 4800 },
  ];
  it('suma los gastos de ese día; sin gasto, null', () => {
    expect(gastoDelDia(planes, '2026-11-07')).toBe(7200);
    expect(gastoDelDia(planes, '2026-10-18')).toBe(4800);
    expect(gastoDelDia(planes, '2026-01-01')).toBeNull();
    expect(gastoDelDia(undefined, '2026-11-07')).toBeNull();
  });
});
