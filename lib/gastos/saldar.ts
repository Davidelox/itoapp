/**
 * Saldar cuentas (docs/plan-gastos-fase2.md §2): qué gastos se pueden saldar, total con signo desde quien
 * mira y textos. La dirección y el importe que se guardan los calcula `create_settlement`; esto es lo que
 * se enseña antes, con la misma convención que `expense_effects`.
 */
import { formatearImporte } from '@/lib/dinero/importe';
import { type Hueco, type Party, efecto } from '@/lib/gastos/reparto';

/** Lo mínimo de un gasto para saldarlo (sin importar Supabase: así se puede probar). */
export type GastoSaldable = {
  id: string;
  paid_by: Party;
  share_m1_cents: number;
  share_m2_cents: number;
  share_pot_cents: number;
  visible_to_partner: boolean;
  settlement_id: string | null;
};

export type Pago = {
  id: string;
  from_slot: Hueco;
  to_slot: Hueco;
  amount_cents: number;
  method: MetodoPago;
  status: 'pending' | 'confirmed' | 'rejected';
  created_by: string | null;
  created_at: string;
  responded_by: string | null;
  responded_at: string | null;
};

export const METODOS = ['bizum', 'transfer', 'cash', 'other'] as const;
export type MetodoPago = (typeof METODOS)[number];
export const NOMBRE_METODO: Record<MetodoPago, string> = {
  bizum: 'Bizum',
  transfer: 'Transferencia',
  cash: 'Efectivo',
  other: 'Otro',
};
/** «por Bizum», «en efectivo»… */
export const COMO_METODO: Record<MetodoPago, string> = {
  bizum: 'por Bizum',
  transfer: 'por transferencia',
  cash: 'en efectivo',
  other: '',
};

/** Efecto de un gasto en la deuda entre los dos, visto por quien mira (> 0: te deben). */
export const efectoDe = (yo: Hueco, g: GastoSaldable) =>
  efecto(yo, g.paid_by, { m1: g.share_m1_cents, m2: g.share_m2_cents, pot: g.share_pot_cents }).parejaMeDebe;

/**
 * Lo que `create_settlement` aceptaría: visible, sin saldar, con deuda entre los dos y sin una solicitud
 * de borrado pendiente. Lo del bote y lo «solo tuyo» pagado por ti no generan deuda y no aparecen.
 */
export function saldables<G extends GastoSaldable>(yo: Hueco, gastos: G[], pendientesDeBorrar: Set<string>): G[] {
  return gastos.filter(
    (g) => g.visible_to_partner && g.settlement_id === null && efectoDe(yo, g) !== 0 && !pendientesDeBorrar.has(g.id),
  );
}

export const totalDe = (yo: Hueco, gastos: GastoSaldable[]) => gastos.reduce((s, g) => s + efectoDe(yo, g), 0);

/** «+31,00 €» / «−9,00 €». */
export const conSigno = (cents: number) => `${cents >= 0 ? '+' : '−'}${formatearImporte(Math.abs(cents))}`;

/** Texto del botón según el total seleccionado. */
export function textoBoton(total: number, cuantos: number): string {
  if (cuantos === 0) return 'Elige qué quieres saldar';
  if (total > 0) return `He recibido ${formatearImporte(total)}`;
  if (total < 0) return `He pagado ${formatearImporte(-total)}`;
  return 'Marcar como saldado';
}

/** Pantalla final tras saldar. `resto`: lo que queda pendiente fuera de la selección (> 0: te deben). */
export function resultadoFinal(pago: Pago, yo: Hueco, resto: number, nombrePareja: string) {
  const recibo = pago.to_slot === yo;
  const como = COMO_METODO[pago.method];
  const importe = formatearImporte(pago.amount_cents);
  const quedaTexto =
    resto > 0
      ? `${nombrePareja} aún te debe ${formatearImporte(resto)}`
      : resto < 0
        ? `Aún debes ${formatearImporte(-resto)} a ${nombrePareja}`
        : null;
  if (pago.status === 'pending') {
    return {
      titulo: `Falta que ${nombrePareja} lo confirme`,
      texto: `Has marcado que pagaste ${importe}${como ? ` ${como}` : ''}. ${nombrePareja} lo confirmará en su app.`,
      queda: quedaTexto,
    };
  }
  return {
    titulo: resto === 0 ? '¡Cuentas a cero!' : `Saldado en parte · queda ${formatearImporte(Math.abs(resto))}`,
    texto:
      pago.amount_cents === 0
        ? 'Los gastos elegidos se compensaban: quedan saldados.'
        : recibo
          ? `${nombrePareja} te ha pagado ${importe}${como ? ` ${como}` : ''}.`
          : `Has pagado ${importe} a ${nombrePareja}${como ? ` ${como}` : ''}.`,
    queda: quedaTexto,
  };
}

export const MINUTOS_DESHACER = 10;

/**
 * Igual que `undo_settlement` (migración 20261117010000): quien lo registró, mientras esté pendiente; o si
 * lo confirmó él mismo («He recibido»), en sus primeros 10 minutos. Lo que confirmó o rechazó la otra
 * persona ya no se deshace.
 */
export function sePuedeDeshacer(pago: Pago, userId: string | null, ahora = Date.now()): boolean {
  if (!userId || pago.created_by !== userId) return false;
  if (pago.status === 'pending') return true;
  if (pago.status !== 'confirmed' || pago.responded_by !== pago.created_by) return false;
  return ahora - new Date(pago.created_at).getTime() < MINUTOS_DESHACER * 60_000;
}

/** «Meri te pagó 40,00 €» / «Pagaste 12,00 € a Meri», visto por quien mira. */
export function textoPago(pago: Pago, yo: Hueco, nombrePareja: string) {
  if (pago.amount_cents === 0) return 'Gastos compensados';
  const importe = formatearImporte(pago.amount_cents);
  return pago.from_slot === yo ? `Pagaste ${importe} a ${nombrePareja}` : `${nombrePareja} te pagó ${importe}`;
}

export const ESTADO_PAGO: Record<Pago['status'], string> = {
  pending: 'Pendiente de confirmar',
  confirmed: 'Confirmado',
  rejected: 'Rechazado',
};
