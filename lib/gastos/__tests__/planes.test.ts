import {
  agruparSaldables,
  alternarGrupo,
  cuentaGastos,
  estadoGrupo,
  fraseSaldoPlan,
  idDePlanValido,
  leyendaPlan,
  lineaPlan,
  pendienteDeConfirmarDelPlan,
  planDe,
  planesElegibles,
  repartoInicialDePlan,
  saldablesDelPlan,
  saldoDelPlan,
  totalGastadoDelPlan,
} from '@/lib/gastos/planes';
import { type GastoSaldable, saldables, totalDe } from '@/lib/gastos/saldar';

const n = (s: string) => s.replace(/\s/g, ' ');
type G = GastoSaldable & { plan_id: string | null; liquidacion: { status: string } | null; amount_cents: number };
const g = (id: string, plan_id: string | null, paid_by: G['paid_by'], m1: number, m2: number, pot = 0, extra: Partial<G> = {}): G => ({
  id,
  plan_id,
  paid_by,
  share_m1_cents: m1,
  share_m2_cents: m2,
  share_pot_cents: pot,
  visible_to_partner: true,
  settlement_id: null,
  liquidacion: null,
  amount_cents: m1 + m2 + pot,
  ...extra,
});

describe('saldo del plan', () => {
  // Dos gastos a medias del plan P: David paga 40 € (M debe 20) y María paga 20 € (D debe 10).
  const datos = [g('a', 'P', 'm1', 2000, 2000), g('b', 'P', 'm2', 1000, 1000), g('otro', 'Q', 'm1', 5000, 5000)];
  it('suma el efecto de los gastos del plan, nada más: +10,00 € para David y −10,00 € para María', () => {
    expect(saldoDelPlan('m1', 'P', datos, new Set())).toBe(1000);
    expect(saldoDelPlan('m2', 'P', datos, new Set())).toBe(-1000);
  });
  it('ejemplo del mockup: 35,00 € pagados por María a medias = David debe 17,50 €', () => {
    expect(saldoDelPlan('m1', 'P', [g('r', 'P', 'm2', 1750, 1750)], new Set())).toBe(-1750);
  });
  it('un impar se reparte como el servidor: m1 redondea hacia arriba, m2 el resto (0,01 € no se pierde)', () => {
    // 10,01 € pagados por m2 a medias: m1 = 5,01 €, m2 = 5,00 €.
    expect(saldoDelPlan('m1', 'P', [g('x', 'P', 'm2', 501, 500)], new Set())).toBe(-501);
    expect(saldoDelPlan('m2', 'P', [g('x', 'P', 'm2', 501, 500)], new Set())).toBe(501);
  });
  it('suma y resta cancelan: es lo mismo que el saldo global de esos gastos', () => {
    expect(saldoDelPlan('m1', 'P', datos, new Set())).toBe(totalDe('m1', saldables('m1', datos.filter((x) => x.plan_id === 'P'), new Set())));
    expect(saldoDelPlan('m1', 'P', datos, new Set()) + saldoDelPlan('m2', 'P', datos, new Set())).toBe(0);
  });
  it('el bote, lo solo tuyo y lo privado no cuentan', () => {
    const extra = [g('bote', 'P', 'pot', 0, 0, 3000), g('solo', 'P', 'm1', 1500, 0), g('priv', 'P', 'm1', 500, 500, 0, { visible_to_partner: false })];
    expect(saldoDelPlan('m1', 'P', [...datos, ...extra], new Set())).toBe(1000);
  });
  it('un gasto en un pago (pendiente o confirmado) queda fuera del saldo y el pendiente se enseña aparte', () => {
    const enPago = g('c', 'P', 'm1', 3000, 3000, 0, { settlement_id: 's1', liquidacion: { status: 'pending' } });
    const hecho = g('d', 'P', 'm2', 700, 700, 0, { settlement_id: 's0', liquidacion: { status: 'confirmed' } });
    expect(saldoDelPlan('m1', 'P', [...datos, enPago, hecho], new Set())).toBe(1000);
    expect(pendienteDeConfirmarDelPlan('m1', 'P', [...datos, enPago, hecho])).toBe(3000);
    expect(pendienteDeConfirmarDelPlan('m2', 'P', [...datos, enPago, hecho])).toBe(-3000);
  });
  it('un gasto pendiente de borrar queda fuera (no se puede saldar)', () => {
    expect(saldoDelPlan('m1', 'P', datos, new Set(['a']))).toBe(-1000);
    expect(saldablesDelPlan('m1', 'P', datos, new Set(['a'])).map((x) => x.id)).toEqual(['b']);
  });
  it('plan sin gastos: 0', () => {
    expect(saldoDelPlan('m1', 'Z', datos, new Set())).toBe(0);
  });
  it('el total gastado suma los importes enteros', () => {
    expect(totalGastadoDelPlan(datos.filter((x) => x.plan_id === 'P'))).toBe(6000);
    expect(n(leyendaPlan(3500))).toBe('Este plan cuenta como un único gasto de 35,00 € en Gastos');
  });
});

describe('frase del saldo del plan', () => {
  it('te debe, debes y en paz', () => {
    expect(n(fraseSaldoPlan(1750, 'María'))).toBe('María te debe 17,50 €');
    expect(n(fraseSaldoPlan(-1750, 'María'))).toBe('Debes 17,50 € a María');
    expect(fraseSaldoPlan(0, 'María')).toBe('En paz');
  });
});

describe('agrupar en Saldar', () => {
  const lista = [g('a', 'P', 'm1', 1000, 1000), g('s1', null, 'm1', 200, 200), g('b', 'P', 'm2', 500, 500), g('c', 'Q', 'm1', 100, 100), g('s2', null, 'm2', 300, 300)];
  it('un plan es una fila en el sitio de su primer gasto; los sueltos se quedan', () => {
    const filas = agruparSaldables(lista);
    expect(filas.map((f) => (f.tipo === 'gasto' ? f.gasto.id : `plan:${f.planId}:${f.gastos.map((x) => x.id).join('+')}`))).toEqual(['plan:P:a+b', 's1', 'plan:Q:c', 's2']);
  });
  it('agrupar no pierde ni duplica gastos ni importe', () => {
    const filas = agruparSaldables(lista);
    const ids = filas.flatMap((f) => (f.tipo === 'gasto' ? [f.gasto.id] : f.gastos.map((x) => x.id)));
    expect(ids.sort()).toEqual(lista.map((x) => x.id).sort());
    const total = filas.reduce((s, f) => s + totalDe('m1', f.tipo === 'gasto' ? [f.gasto] : f.gastos), 0);
    expect(total).toBe(totalDe('m1', lista));
  });
  it('un plan con un solo gasto también sale como fila de plan; sin gastos, nada', () => {
    expect(agruparSaldables([g('a', 'P', 'm1', 1, 1)])[0].tipo).toBe('plan');
    expect(agruparSaldables([])).toEqual([]);
  });
  it('estado de la casilla de grupo: todos, ninguno, algunos', () => {
    expect(estadoGrupo(['a', 'b'], new Set(['a', 'b', 'x']))).toBe('todos');
    expect(estadoGrupo(['a', 'b'], new Set(['x']))).toBe('ninguno');
    expect(estadoGrupo(['a', 'b'], new Set(['a']))).toBe('algunos');
    expect(estadoGrupo(['a', 'b'], null)).toBe('ninguno');
    expect(estadoGrupo([], new Set(['a']))).toBe('ninguno');
  });
  it('pulsar el grupo: todos → quita solo los suyos; algunos o ninguno → marca todos; no toca el resto', () => {
    expect([...alternarGrupo(new Set(['a', 'b', 's1']), ['a', 'b'])].sort()).toEqual(['s1']);
    expect([...alternarGrupo(new Set(['a', 's1']), ['a', 'b'])].sort()).toEqual(['a', 'b', 's1']);
    expect([...alternarGrupo(new Set(), ['a', 'b'])].sort()).toEqual(['a', 'b']);
    expect([...alternarGrupo(null, ['a'])]).toEqual(['a']);
  });
  it('no muta el conjunto de entrada', () => {
    const m = new Set(['a']);
    alternarGrupo(m, ['a', 'b']);
    expect([...m]).toEqual(['a']);
  });
  it('un grupo marcado a medias suma solo lo marcado (lo que se envía a create_settlement)', () => {
    const marcados = alternarGrupo(new Set(['s1']), ['a']);
    const elegidos = lista.filter((x) => marcados.has(x.id));
    expect(totalDe('m1', elegidos)).toBe(1200); // a y s1 los paga m1 a medias: +1000 +200
  });
});

describe('plan de un gasto', () => {
  it('el vivo, o el guardado si se borró, o nada', () => {
    expect(planDe({ plan_id: 'P', plan: { id: 'P', name: 'Cumpleaños de Marta', icon: '🎂' } })).toEqual({ id: 'P', nombre: 'Cumpleaños de Marta', icono: '🎂' });
    expect(planDe({ plan_id: null, plan: null, plan_name_snapshot: 'Lisboa', plan_icon_snapshot: '✈️' })).toEqual({ id: null, nombre: 'Lisboa', icono: '✈️' });
    expect(planDe({ plan_id: null, plan: null, plan_name_snapshot: 'Lisboa', plan_icon_snapshot: null })?.icono).toBe('⭐');
    expect(planDe({ plan_id: null })).toBeNull();
  });
  it('línea secundaria: emoji y nombre', () => {
    expect(lineaPlan({ id: 'P', nombre: 'Lisboa', icono: '✈️' })).toBe('✈️ Lisboa');
    expect(cuentaGastos(1)).toBe('1 gasto');
    expect(cuentaGastos(2)).toBe('2 gastos');
  });
});

describe('reparto inicial desde el plan', () => {
  const plan = (modo: 'half' | 'proportional' | 'custom' | 'pot', pct: number | null) => ({ default_split_mode: modo, default_split_pct_m1: pct });
  it('a medias y proporcional', () => {
    expect(repartoInicialDePlan(plan('half', 50), 'm1', true)).toEqual({ pagador: 'yo', reparto: 'medias', pctYo: 50 });
    expect(repartoInicialDePlan(plan('proportional', null), 'm2', false).reparto).toBe('proporcional');
  });
  it('personalizado: el % se ve desde quien mira (60/40 de m1 = 40 para m2)', () => {
    expect(repartoInicialDePlan(plan('custom', 60), 'm1', true)).toEqual({ pagador: 'yo', reparto: 'personalizado', pctYo: 60 });
    expect(repartoInicialDePlan(plan('custom', 60), 'm2', true)).toEqual({ pagador: 'yo', reparto: 'personalizado', pctYo: 40 });
  });
  it('personalizado sin % (no debería existir): a medias', () => {
    expect(repartoInicialDePlan(plan('custom', null), 'm1', true).reparto).toBe('medias');
  });
  it('bote: solo si sigue activo; si no, a medias pagando tú', () => {
    expect(repartoInicialDePlan(plan('pot', null), 'm1', true)).toEqual({ pagador: 'bote', reparto: 'bote', pctYo: 50 });
    expect(repartoInicialDePlan(plan('pot', null), 'm1', false)).toEqual({ pagador: 'yo', reparto: 'medias', pctYo: 50 });
  });
});

describe('planes que se ofrecen y parámetro de ruta', () => {
  const p = (id: string, start_date: string, end_date: string) => ({ id, name: id, start_date, end_date });
  const planes = [p('futuro', '2026-12-10', '2026-12-12'), p('pasado', '2026-10-01', '2026-10-03'), p('curso', '2026-11-20', '2026-11-25')];
  it('en curso y próximos por fecha; los pasados fuera', () => {
    expect(planesElegibles(planes, '2026-11-21', null).map((x) => x.id)).toEqual(['curso', 'futuro']);
  });
  it('el plan que ya tiene el gasto sigue ofreciéndose aunque haya terminado (primero)', () => {
    expect(planesElegibles(planes, '2026-11-21', 'pasado').map((x) => x.id)).toEqual(['pasado', 'curso', 'futuro']);
    expect(planesElegibles(planes, '2026-11-21', 'curso').map((x) => x.id)).toEqual(['curso', 'futuro']);
  });
  it('solo un uuid bien formado', () => {
    expect(idDePlanValido('123E4567-E89B-12D3-A456-426614174000')).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(idDePlanValido('nope')).toBeNull();
    expect(idDePlanValido("x'; drop table plans;--")).toBeNull();
    expect(idDePlanValido(['123e4567-e89b-12d3-a456-426614174000'])).toBeNull();
    expect(idDePlanValido(undefined)).toBeNull();
  });
});
