import { agruparPorPlan, claveFila, mapaResumenes } from '@/lib/gastos/agrupar';

type G = { id: string; spent_on: string; amount_cents: number; plan_id: string | null; plan?: { id: string; name: string; icon: string } | null; plan_name_snapshot?: string | null };
const lisboa = { id: 'p1', name: 'Escapada a Lisboa', icon: '✈️' };
const g = (id: string, spent_on: string, plan: typeof lisboa | null = null, extra: Partial<G> = {}): G => ({
  id,
  spent_on,
  amount_cents: 1000,
  plan_id: plan?.id ?? null,
  plan,
  ...extra,
});
const resumenes = mapaResumenes([{ plan_id: 'p1', spent_cents: '31200', expense_count: 7 }]);

describe('mapaResumenes', () => {
  it('normaliza bigint/texto a enteros', () => {
    expect(resumenes.get('p1')).toEqual({ gastadoCents: 31200, cuantos: 7 });
  });
});

describe('agruparPorPlan', () => {
  it('una fila por plan en el sitio de su gasto más reciente, con el total de TODO el plan', () => {
    const lista = [g('a', '2026-11-20'), g('b', '2026-11-19', lisboa), g('c', '2026-11-18'), g('d', '2026-11-17', lisboa)];
    const filas = agruparPorPlan(lista, resumenes);
    expect(filas.map(claveFila)).toEqual(['a', 'plan-p1', 'c']);
    const plan = filas[1];
    expect(plan.tipo === 'plan' && plan.resumen).toEqual({ gastadoCents: 31200, cuantos: 7 });
    expect(plan.tipo === 'plan' && plan.fecha).toBe('2026-11-19');
    expect(plan.tipo === 'plan' && plan.gastos.map((x) => x.id)).toEqual(['b', 'd']);
  });

  it('el total no depende de lo cargado: un solo gasto cargado enseña el total del plan', () => {
    const filas = agruparPorPlan([g('b', '2026-11-19', lisboa)], resumenes);
    expect(filas).toHaveLength(1);
    expect(filas[0].tipo === 'plan' && filas[0].resumen.gastadoCents).toBe(31200);
  });

  it('sin resumen (vista caída o null) no se agrupa ni se inventa un total', () => {
    const lista = [g('b', '2026-11-19', lisboa), g('d', '2026-11-17', lisboa)];
    expect(agruparPorPlan(lista, null).map((f) => f.tipo)).toEqual(['gasto', 'gasto']);
    expect(agruparPorPlan(lista, new Map()).map((f) => f.tipo)).toEqual(['gasto', 'gasto']);
  });

  it('un plan ya borrado (solo snapshot) queda como gasto suelto', () => {
    const borrado = g('x', '2026-11-19', null, { plan_id: null, plan_name_snapshot: 'Viejo' });
    expect(agruparPorPlan([borrado], resumenes).map((f) => f.tipo)).toEqual(['gasto']);
  });

  it('páginas sucesivas: añadir gastos más antiguos del mismo plan no duplica ni mueve la fila', () => {
    const pagina1 = [g('a', '2026-11-20'), g('b', '2026-11-19', lisboa)];
    const pagina2 = [g('d', '2026-10-02', lisboa), g('e', '2026-10-01')];
    const antes = agruparPorPlan(pagina1, resumenes).map(claveFila);
    const despues = agruparPorPlan([...pagina1, ...pagina2], resumenes).map(claveFila);
    expect(antes).toEqual(['a', 'plan-p1']);
    expect(despues).toEqual(['a', 'plan-p1', 'e']);
  });

  it('el orden cronológico se conserva y el número de filas nunca supera al de gastos', () => {
    const lista = [g('1', '2026-11-20', lisboa), g('2', '2026-11-19'), g('3', '2026-11-18', lisboa), g('4', '2026-11-17')];
    const filas = agruparPorPlan(lista, resumenes);
    expect(filas.map(claveFila)).toEqual(['plan-p1', '2', '4']);
    expect(filas.length).toBeLessThanOrEqual(lista.length);
  });

  it('con filtros el llamante pasa null y todo queda suelto: los totales cuadran con la suma de filas', () => {
    const lista = [g('b', '2026-11-19', lisboa), g('d', '2026-11-17', lisboa)];
    const filas = agruparPorPlan(lista, null);
    const suma = filas.reduce((s, f) => s + (f.tipo === 'gasto' ? f.gasto.amount_cents : 0), 0);
    expect(suma).toBe(lista.reduce((s, x) => s + x.amount_cents, 0));
  });
});
