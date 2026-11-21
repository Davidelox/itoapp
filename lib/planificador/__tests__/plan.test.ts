import {
  type FormularioPlan,
  cambiosPlan,
  conInicio,
  conTipo,
  cuentaAtras,
  duracionPlan,
  etiquetaPlan,
  filaDePlan,
  formularioDePlan,
  formularioNuevo,
  hayErroresPlan,
  porcentajeGastado,
  textoGastadoPlan,
  proximos,
  rangoPlan,
  seccionDe,
  textoDuracion,
  textoFechas,
  validarPlan,
  vistaPresupuesto,
} from '@/lib/planificador/plan';
import type { Plan } from '@/lib/planificador/tipos';

const HOY = '2026-11-20';
const sp = (s: string) => s.replace(/\s/g, ' ');

const base: FormularioPlan = {
  tipo: 'trip',
  nombre: 'Escapada a Lisboa',
  icono: '✈️',
  destino: ' Lisboa ',
  inicio: '2026-12-05',
  fin: '2026-12-08',
  presupuesto: '900',
  division: 'half',
  pctYo: 50,
  notas: '',
};

const plan = (o: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  type: 'trip',
  name: 'Escapada a Lisboa',
  icon: '✈️',
  destination: null,
  start_date: '2026-12-05',
  end_date: '2026-12-08',
  budget_cents: 90000,
  default_split_mode: 'half',
  default_split_pct_m1: 50,
  notes: null,
  created_by: null,
  version: 1,
  ...o,
});

describe('fechas', () => {
  it('cuenta los dos extremos', () => {
    expect(duracionPlan('2026-12-05', '2026-12-08')).toBe(4);
    expect(duracionPlan('2026-12-05', '2026-12-05')).toBe(1);
    expect(textoDuracion(1)).toBe('1 día');
    expect(textoDuracion(4)).toBe('4 días');
  });

  it('escribe el rango en un mes, entre meses, de un día y con otro año', () => {
    expect(rangoPlan('2026-12-05', '2026-12-08')).toBe('Sáb 5 – mar 8 de diciembre');
    expect(rangoPlan('2026-11-28', '2026-12-01')).toBe('Sáb 28 nov – mar 1 dic');
    expect(rangoPlan('2026-11-22', '2026-11-22')).toBe('Dom 22 de noviembre');
    expect(rangoPlan('2027-01-02', '2027-01-04', '2026-12-20')).toBe('Sáb 2 – lun 4 de enero de 2027');
  });

  it('añade la duración solo si dura más de un día', () => {
    expect(textoFechas('2026-12-05', '2026-12-08')).toBe('Sáb 5 – mar 8 de diciembre · 4 días');
    expect(textoFechas('2026-11-22', '2026-11-22')).toBe('Dom 22 de noviembre');
  });
});

describe('secciones y cuenta atrás', () => {
  it('separa pasado, en curso y próximo', () => {
    expect(seccionDe({ start_date: '2026-11-10', end_date: '2026-11-19' }, HOY)).toBe('pasado');
    expect(seccionDe({ start_date: '2026-11-20', end_date: '2026-11-20' }, HOY)).toBe('curso');
    expect(seccionDe({ start_date: '2026-11-18', end_date: '2026-11-25' }, HOY)).toBe('curso');
    expect(seccionDe({ start_date: '2026-11-21', end_date: '2026-11-21' }, HOY)).toBe('proximo');
  });

  it('cambia de mes y de año', () => {
    expect(cuentaAtras({ start_date: '2026-12-13', end_date: '2026-12-14' }, HOY)).toBe('En 23 días');
    expect(cuentaAtras({ start_date: '2027-01-02', end_date: '2027-01-04' }, HOY)).toBe('En 43 días');
  });

  it('dice Mañana, Hoy, En curso y Terminado', () => {
    expect(cuentaAtras({ start_date: '2026-11-21', end_date: '2026-11-21' }, HOY)).toBe('Mañana');
    expect(cuentaAtras({ start_date: '2026-11-20', end_date: '2026-11-20' }, HOY)).toBe('Hoy');
    expect(cuentaAtras({ start_date: '2026-11-19', end_date: '2026-11-22' }, HOY)).toBe('En curso');
    expect(cuentaAtras({ start_date: '2026-11-01', end_date: '2026-11-02' }, HOY)).toBe('Terminado');
  });

  it('ordena los próximos por inicio y deja fuera los pasados', () => {
    const lista = [
      { name: 'c', start_date: '2027-01-02', end_date: '2027-01-03' },
      { name: 'pasado', start_date: '2026-10-01', end_date: '2026-10-03' },
      { name: 'a', start_date: '2026-11-18', end_date: '2026-11-25' },
      { name: 'b', start_date: '2026-12-05', end_date: '2026-12-08' },
    ];
    expect(proximos(lista, HOY).map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('presupuesto', () => {
  it('muestra gastado, lo que queda y la barra', () => {
    const v = vistaPresupuesto(90000, 31200);
    expect(v.tipo).toBe('barra');
    if (v.tipo !== 'barra') return;
    expect(sp(v.texto)).toBe('312 € de 900 €');
    expect(sp(v.detalle)).toBe('Quedan 588 €');
    expect(v.pct).toBe(35);
    expect(v.pasado).toBe(false);
  });

  it('con 0 gastado la barra está vacía', () => {
    const v = vistaPresupuesto(90000, 0);
    expect(v.tipo === 'barra' && v.pct).toBe(0);
  });

  it('pasado de presupuesto: barra llena y aviso', () => {
    const v = vistaPresupuesto(10000, 14000);
    expect(v.tipo === 'barra' && v.pct).toBe(100);
    expect(v.tipo === 'barra' && v.pasado).toBe(true);
    expect(sp(v.tipo === 'barra' ? v.detalle : '')).toBe('Os habéis pasado 40 €');
  });

  it('sin presupuesto, o sin saber lo gastado, no inventa nada', () => {
    expect(vistaPresupuesto(null, 500)).toEqual({ tipo: 'ninguno', texto: 'Sin presupuesto' });
    const v = vistaPresupuesto(90000, null);
    expect(v.tipo).toBe('solo');
    expect(sp(v.texto)).toBe('Presupuesto de 900 €');
  });

  it('porcentaje acotado', () => {
    expect(porcentajeGastado(500, 0)).toBe(0);
    expect(porcentajeGastado(-5, 100)).toBe(0);
    expect(porcentajeGastado(999, 100)).toBe(100);
  });
});

describe('etiqueta accesible', () => {
  it('une nombre, tipo, fechas, cuenta atrás y dinero', () => {
    const e = sp(etiquetaPlan({ ...plan(), gastado_cents: 31200 }, HOY));
    expect(e).toBe('Escapada a Lisboa, viaje, del 5 al 8 de diciembre, en 15 días, 312 de 900 euros gastados');
  });

  it('un plan de un día sin presupuesto', () => {
    const e = etiquetaPlan(plan({ type: 'celebration', name: 'Cumple', start_date: '2026-11-21', end_date: '2026-11-21', budget_cents: null }), HOY);
    expect(e).toBe('Cumple, celebración, el 21 de noviembre, mañana, sin presupuesto');
  });

  it('añade las tareas pendientes', () => {
    expect(sp(etiquetaPlan({ ...plan(), gastado_cents: 31200 }, HOY, 2))).toMatch(/gastados, 2 tareas pendientes$/);
    expect(etiquetaPlan(plan(), HOY, 1)).toMatch(/1 tarea pendiente$/);
    expect(etiquetaPlan(plan(), HOY, 0)).not.toMatch(/tarea/);
  });
});

describe('formulario', () => {
  it('es válido con datos correctos', () => {
    expect(hayErroresPlan(validarPlan(base))).toBe(false);
  });

  it('exige nombre de 1 a 80 letras', () => {
    expect(validarPlan({ ...base, nombre: '   ' }).nombre).not.toBeNull();
    expect(validarPlan({ ...base, nombre: 'a'.repeat(81) }).nombre).not.toBeNull();
    expect(validarPlan({ ...base, nombre: 'a'.repeat(80) }).nombre).toBeNull();
  });

  it('exige un emoji de icono', () => {
    expect(validarPlan({ ...base, icono: 'a' }).icono).not.toBeNull();
    expect(validarPlan({ ...base, icono: '' }).icono).not.toBeNull();
  });

  it('el fin no puede ser antes del inicio y dura 60 días como mucho', () => {
    expect(validarPlan({ ...base, fin: '2026-12-04' }).fechas).not.toBeNull();
    expect(validarPlan({ ...base, inicio: '2026-12-01', fin: '2026-01-30' }).fechas).not.toBeNull();
    expect(validarPlan({ ...base, inicio: '2026-12-01', fin: '2027-01-29' }).fechas).toBeNull(); // 60 días
    expect(validarPlan({ ...base, inicio: '2026-12-01', fin: '2027-01-30' }).fechas).not.toBeNull(); // 61
  });

  it('una celebración ignora el fin', () => {
    expect(validarPlan({ ...base, tipo: 'celebration', fin: '2030-01-01' }).fechas).toBeNull();
  });

  it('el presupuesto es opcional pero debe ser un importe positivo', () => {
    expect(validarPlan({ ...base, presupuesto: '' }).presupuesto).toBeNull();
    expect(validarPlan({ ...base, presupuesto: '0' }).presupuesto).not.toBeNull();
    expect(validarPlan({ ...base, presupuesto: '1.250,50' }).presupuesto).toBeNull();
  });

  it('prepara la fila: destino solo en viajes, importe en céntimos y a medias = 50', () => {
    expect(filaDePlan(base, 'm1')).toEqual({
      type: 'trip',
      name: 'Escapada a Lisboa',
      icon: '✈️',
      destination: 'Lisboa',
      start_date: '2026-12-05',
      end_date: '2026-12-08',
      budget_cents: 90000,
      default_split_mode: 'half',
      default_split_pct_m1: 50,
      notes: null,
    });
    const c = filaDePlan({ ...base, tipo: 'celebration', presupuesto: '1.250,50', notas: ' hola ' }, 'm1');
    expect(c).toMatchObject({ destination: null, end_date: '2026-12-05', budget_cents: 125050, notes: 'hola' });
    expect(filaDePlan({ ...base, presupuesto: '' }, 'm1').budget_cents).toBeNull();
  });

  it('el % personalizado se guarda como el de m1', () => {
    expect(filaDePlan({ ...base, division: 'custom', pctYo: 30 }, 'm2').default_split_pct_m1).toBe(70);
    expect(filaDePlan({ ...base, division: 'custom', pctYo: 30 }, 'm1').default_split_pct_m1).toBe(30);
    expect(filaDePlan({ ...base, division: 'proportional' }, 'm1').default_split_pct_m1).toBeNull();
    expect(filaDePlan({ ...base, division: 'pot' }, 'm1').default_split_pct_m1).toBeNull();
  });

  it('el formulario de un plan existente vuelve a dar la misma fila', () => {
    const p = plan({ default_split_mode: 'custom', default_split_pct_m1: 70, budget_cents: 125050, destination: 'Lisboa', notes: 'n' });
    const f = formularioDePlan(p, 'm2');
    expect(f.pctYo).toBe(30);
    expect(f.presupuesto).toBe('1250,50');
    expect(filaDePlan(f, 'm2')).toMatchObject({ default_split_mode: 'custom', default_split_pct_m1: 70, budget_cents: 125050, destination: 'Lisboa', notes: 'n' });
    expect(formularioDePlan(plan({ budget_cents: null }), 'm1').presupuesto).toBe('');
    expect(formularioDePlan(plan(), 'm1').presupuesto).toBe('900');
  });

  it('un plan nuevo es un viaje de 3 días desde hoy', () => {
    const f = formularioNuevo(HOY);
    expect(f).toMatchObject({ tipo: 'trip', inicio: '2026-11-20', fin: '2026-11-22', icono: '✈️', division: 'half' });
    expect(hayErroresPlan(validarPlan({ ...f, nombre: 'x' }))).toBe(false);
  });

  it('solo se envía lo que ha cambiado', () => {
    const antes = filaDePlan(base, 'm1');
    const despues = filaDePlan({ ...base, nombre: 'Lisboa 2', presupuesto: '' }, 'm1');
    expect(cambiosPlan(antes, despues)).toEqual({ name: 'Lisboa 2', budget_cents: null });
    expect(cambiosPlan(antes, antes)).toEqual({});
  });
});

describe('cambios de tipo y de inicio', () => {
  it('el icono acompaña al tipo mientras no se haya elegido otro', () => {
    expect(conTipo(base, 'celebration').icono).toBe('🎂');
    expect(conTipo({ ...base, icono: '🏔️' }, 'celebration').icono).toBe('🏔️');
  });

  it('una celebración dura un día', () => {
    expect(conTipo(base, 'celebration').fin).toBe('2026-12-05');
  });

  it('mover el inicio arrastra el fin si hace falta', () => {
    expect(conInicio(base, '2026-12-06').fin).toBe('2026-12-08');
    expect(conInicio(base, '2026-12-10').fin).toBe('2026-12-10');
    expect(conInicio({ ...base, tipo: 'celebration' }, '2026-12-10').fin).toBe('2026-12-10');
  });
});

describe('sin presupuestos (preferencia apagada)', () => {
  it('textoGastadoPlan: solo con gasto', () => {
    expect(sp(textoGastadoPlan(31200) ?? '')).toBe('312 € gastados');
    expect(textoGastadoPlan(0)).toBeNull();
    expect(textoGastadoPlan(null)).toBeNull();
  });
  it('etiquetaPlan no menciona el presupuesto', () => {
    expect(sp(etiquetaPlan({ ...plan(), gastado_cents: 31200 }, HOY, 0, false))).toMatch(/312 euros gastados$/);
    expect(etiquetaPlan({ ...plan(), gastado_cents: 0 }, HOY, 0, false)).not.toMatch(/presupuesto/);
  });
});
