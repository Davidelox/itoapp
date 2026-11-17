import {
  type AjustesBote,
  aportacionRetrasada,
  diaDelMes,
  limitesMes,
  moverMes,
  nombreMovimiento,
  proximaAportacion,
  repartoAportacion,
  resumenMes,
} from '@/lib/gastos/bote';

const base: AjustesBote = {
  activo: true,
  mensual: true,
  aportacionCents: 100000,
  dia: 1,
  pctM1: 60,
  desde: '2026-11-17',
  generadoHasta: null,
};
const hoy = new Date(2026, 10, 17); // 17 nov 2026

describe('próxima aportación (como run_daily_jobs)', () => {
  it('empezando el 17 nov con día 1 → 1 dic', () => {
    expect(proximaAportacion(base, hoy)).toBe('2026-12-01');
  });
  it('día 20 → 20 nov (aún no ha pasado)', () => {
    expect(proximaAportacion({ ...base, dia: 20 }, hoy)).toBe('2026-11-20');
  });
  it('noviembre ya generado → el mes siguiente', () => {
    expect(proximaAportacion({ ...base, dia: 20, generadoHasta: '2026-11-01' }, hoy)).toBe('2026-12-20');
  });
  it('día 31 en febrero → 28', () => {
    expect(proximaAportacion({ ...base, dia: 31, desde: '2027-02-01', generadoHasta: '2027-01-01' }, new Date(2027, 1, 1))).toBe(
      '2027-02-28',
    );
  });
  it('si el día ya ha pasado y el job aún no ha corrido → hoy', () => {
    expect(proximaAportacion({ ...base, dia: 10, desde: '2026-11-01' }, hoy)).toBe('2026-11-17');
  });
  it('empieza el 17 con día 10 → 10 del mes siguiente (M9)', () => {
    expect(proximaAportacion({ ...base, dia: 10, desde: '2026-11-17' }, hoy)).toBe('2026-12-10');
  });
  it('generado hace mucho y desde muy posterior: no devuelve null (M2)', () => {
    expect(proximaAportacion({ ...base, dia: 5, desde: '2029-03-02', generadoHasta: '2026-01-01' }, hoy)).toBe('2029-03-05');
  });
  it('mes saltado con lo generado puesto (M9)', () => {
    expect(proximaAportacion({ ...base, dia: 15, desde: '2026-09-20', generadoHasta: '2026-09-01' }, new Date(2026, 9, 1))).toBe(
      '2026-10-15',
    );
  });
  it('aportación retrasada: más de un día sin generarse (M1)', () => {
    expect(aportacionRetrasada({ ...base, dia: 1, desde: '2026-10-20', generadoHasta: '2026-10-01' }, hoy)).toBe('2026-11-01');
    expect(aportacionRetrasada({ ...base, dia: 16, desde: '2026-11-01' }, hoy)).toBeNull();
    expect(aportacionRetrasada(base, hoy)).toBeNull();
  });
  it('a mano o sin bote → null', () => {
    expect(proximaAportacion({ ...base, mensual: false }, hoy)).toBeNull();
    expect(proximaAportacion({ ...base, activo: false }, hoy)).toBeNull();
  });
  it('diaDelMes con años bisiestos', () => {
    expect(diaDelMes(2028, 1, 31)).toBe('2028-02-29');
    expect(diaDelMes(2026, 3, 31)).toBe('2026-04-30');
  });
});

describe('reparto de la aportación', () => {
  it('1.000 € al 60 % → 600 / 400', () => {
    expect(repartoAportacion(100000, 60)).toEqual({ m1: 60000, m2: 40000 });
  });
  it('333,33 € al 50 % → 166,67 / 166,66 (m1 se lleva el céntimo)', () => {
    expect(repartoAportacion(33333, 50)).toEqual({ m1: 16667, m2: 16666 });
  });
});

describe('resumen del mes', () => {
  const mov = (kind: 'contribution' | 'reimbursement' | 'adjustment', amount_cents: number) => ({
    id: kind,
    kind,
    member_slot: 'm1' as const,
    amount_cents,
    occurred_on: '2026-11-01',
    is_auto: false,
    created_by: null,
    created_at: '',
  });
  it('aportaciones suman, reembolsos restan, ajustes con su signo', () => {
    const r = resumenMes([mov('contribution', 100000), mov('reimbursement', 5430), mov('adjustment', -100)], [
      { amount_cents: 21430, category: 'groceries', paid_by: 'pot', share_pot_cents: 21430 },
      { amount_cents: 18372, category: 'home', paid_by: 'pot', share_pot_cents: 18372 },
      // Súper del bote pagado con tarjeta propia: cuenta en las barras, no en lo pagado desde el bote.
      { amount_cents: 1000, category: 'groceries', paid_by: 'm1', share_pot_cents: 1000 },
      // Pagado por el bote pero repartido entre los dos: sale del bote igualmente.
      { amount_cents: 500, category: 'leisure', paid_by: 'pot', share_pot_cents: 0 },
    ]);
    expect(r.movimientos).toBe(100000 - 5430 - 100);
    expect(r.pagado).toBe(21430 + 18372 + 500);
    expect(r.delBote).toBe(21430 + 18372 + 1000 + 500);
    expect(r.categorias).toEqual([
      { categoria: 'groceries', cents: 22430 },
      { categoria: 'home', cents: 18372 },
      { categoria: 'leisure', cents: 500 },
    ]);
  });
  it('nombres desde los dos lados', () => {
    const m = { ...mov('contribution', 1), member_slot: 'm2' as const };
    expect(nombreMovimiento(m, 'm1', 'Meri')).toBe('Aportación de Meri');
    expect(nombreMovimiento(m, 'm2', 'David')).toBe('Tu aportación');
    expect(nombreMovimiento({ ...m, is_auto: true }, 'm1', 'Meri')).toBe('Aportación automática de Meri');
    expect(nombreMovimiento({ ...m, kind: 'reimbursement' }, 'm2', 'David')).toBe('Reembolso para ti');
  });
  it('meses', () => {
    expect(limitesMes('2026-02-14')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(moverMes('2026-01-15', -1)).toBe('2025-12-01');
  });
});
