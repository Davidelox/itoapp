/**
 * Bote común (docs/plan-gastos-fase3.md): próxima aportación, reparto de la aportación y resumen del mes.
 * Mismas reglas que `private.run_daily_jobs` y `private.clamp_day` en la base de datos.
 */
import type { Categoria } from '@/lib/gastos/categorias';
import { aISO, ayerISO, deISO, hoyISO } from '@/lib/gastos/fechas';
import type { Hueco } from '@/lib/gastos/reparto';

export type AjustesBote = {
  activo: boolean;
  mensual: boolean;
  aportacionCents: number | null;
  dia: number | null;
  pctM1: number;
  /** `YYYY-MM-DD` desde el que hay aportación automática. */
  desde: string | null;
  /** Último mes (día 1, `YYYY-MM-DD`) que el job ya generó. */
  generadoHasta: string | null;
};

export type TipoMovimiento = 'contribution' | 'reimbursement' | 'adjustment';

export type Movimiento = {
  id: string;
  kind: TipoMovimiento;
  member_slot: Hueco | null;
  amount_cents: number;
  occurred_on: string;
  is_auto: boolean;
  created_by: string | null;
  created_at: string;
};

/** Día `dia` del mes, o el último si el mes es más corto (31 → 30 o 28/29), como `private.clamp_day`. */
export function diaDelMes(anio: number, mes0: number, dia: number): string {
  const ultimo = new Date(anio, mes0 + 1, 0).getDate();
  return aISO(new Date(anio, mes0, Math.min(dia, ultimo)));
}

/**
 * Fecha de la próxima aportación automática: el primer mes aún no generado cuyo día de cobro no es
 * anterior a `desde`. Si ya ha pasado (el job corre de madrugada), devuelve hoy.
 */
export function proximaAportacion(a: AjustesBote, hoy = new Date()): string | null {
  const cobro = siguienteCobro(a);
  if (!cobro) return null;
  const hoyIso = hoyISO(hoy);
  return cobro < hoyIso ? hoyIso : cobro;
}

/**
 * Día de cobro del primer mes aún no generado. Empieza en el mayor de «mes siguiente a lo generado» y
 * «mes de `desde`» (revisión M2): como mucho hace falta pasar al mes siguiente.
 */
function siguienteCobro(a: AjustesBote): string | null {
  if (!a.activo || !a.mensual || !a.dia || !a.desde) return null;
  const desde = deISO(a.desde);
  const mesDesde = new Date(desde.getFullYear(), desde.getMonth(), 1);
  const tras = a.generadoHasta ? new Date(deISO(a.generadoHasta).getFullYear(), deISO(a.generadoHasta).getMonth() + 1, 1) : mesDesde;
  let mes = tras > mesDesde ? tras : mesDesde;
  for (let i = 0; i < 3; i++) {
    const cobro = diaDelMes(mes.getFullYear(), mes.getMonth(), a.dia);
    if (cobro >= a.desde) return cobro;
    mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
  }
  return null;
}

/**
 * Si una aportación ya debía haberse generado hace más de un día y no está (el job no ha corrido, por
 * ejemplo sin pg_cron), devuelve su fecha para avisar (revisión M1). Si no, null.
 */
export function aportacionRetrasada(a: AjustesBote, hoy = new Date()): string | null {
  const cobro = siguienteCobro(a);
  if (!cobro) return null;
  const ayer = ayerISO(hoy);
  return cobro < ayer ? cobro : null;
}

/**
 * Con el bote desactivado, ¿queda algo por cuadrar? (revisión M6): deudas del bote o saldo en negativo.
 * Mientras tanto la tarjeta y la pantalla del bote siguen visibles para reembolsar o aportar. Un saldo
 * positivo no cuenta: se queda en el bote (se ve en Ajustes) hasta que lo volváis a activar.
 */
export const boteConPendiente = (s: { pot_balance_cents: number; pot_owes_me_cents: number; pot_owes_partner_cents: number }) =>
  s.pot_balance_cents < 0 || s.pot_owes_me_cents !== 0 || s.pot_owes_partner_cents !== 0;

/** Reparto de la aportación mensual, como el job: m1 = round(importe × % / 100), m2 = el resto. */
export function repartoAportacion(cents: number, pctM1: number) {
  const m1 = Math.round((cents * pctM1) / 100);
  return { m1, m2: cents - m1 };
}

/** Efecto de un movimiento en el saldo del bote: aportaciones y ajustes suman, reembolsos restan. */
export const efectoEnBote = (m: Pick<Movimiento, 'kind' | 'amount_cents'>) =>
  m.kind === 'reimbursement' ? -m.amount_cents : m.amount_cents;

export type GastoDelBote = { amount_cents: number; category: Categoria; paid_by: 'm1' | 'm2' | 'pot'; share_pot_cents: number };

/** Lo que un gasto es «del bote»: todo si lo pagó el bote; si lo pagó una persona, su parte del bote. */
const delBote = (g: GastoDelBote) => (g.paid_by === 'pot' ? g.amount_cents : g.share_pot_cents);

/**
 * Resumen del mes. `pagado`: lo que salió de la cuenta del bote (cuadra con el saldo). `categorias`: todo lo
 * que es del bote por categoría, también lo pagado con tarjeta propia (decisión 3 de David), de mayor a menor.
 */
export function resumenMes(movimientos: Movimiento[], gastos: GastoDelBote[]) {
  const porCategoria = new Map<Categoria, number>();
  for (const g of gastos) {
    const c = delBote(g);
    if (c > 0) porCategoria.set(g.category, (porCategoria.get(g.category) ?? 0) + c);
  }
  return {
    movimientos: movimientos.reduce((s, m) => s + efectoEnBote(m), 0),
    pagado: gastos.filter((g) => g.paid_by === 'pot').reduce((s, g) => s + g.amount_cents, 0),
    delBote: gastos.reduce((s, g) => s + delBote(g), 0),
    categorias: [...porCategoria.entries()].map(([categoria, cents]) => ({ categoria, cents })).sort((a, b) => b.cents - a.cents),
  };
}

/** «Aportación automática», «Aportación de Meri», «Tu aportación», «Reembolso a Meri», «Ajuste». */
export function nombreMovimiento(m: Movimiento, yo: Hueco, nombrePareja: string): string {
  if (m.kind === 'adjustment') return 'Ajuste';
  const mio = m.member_slot === yo;
  if (m.kind === 'reimbursement') return mio ? 'Reembolso para ti' : `Reembolso a ${nombrePareja}`;
  if (m.is_auto) return mio ? 'Tu aportación automática' : `Aportación automática de ${nombrePareja}`;
  return mio ? 'Tu aportación' : `Aportación de ${nombrePareja}`;
}

/** Primer y último día (`YYYY-MM-DD`) del mes que contiene `iso`. */
export function limitesMes(iso: string) {
  const d = deISO(iso);
  return { desde: aISO(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: aISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

/** Mismo día del mes anterior o siguiente (día 1, para navegar por meses). */
export function moverMes(iso: string, n: number) {
  const d = deISO(iso);
  return aISO(new Date(d.getFullYear(), d.getMonth() + n, 1));
}
