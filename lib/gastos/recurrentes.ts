/**
 * Pagos recurrentes (docs/plan-gastos-fase4.md): próximo cobro con el mismo cálculo que
 * `private.payment_due_dates` (día 29–31 → último día del mes), totales y textos de la lista.
 */
import { formatearImporte } from '@/lib/dinero/importe';
import { diaDelMes } from '@/lib/gastos/bote';
import type { Categoria } from '@/lib/gastos/categorias';
import { MESES, deISO, hoyISO } from '@/lib/gastos/fechas';
import { type Hueco, type Party, type SplitMode, etiquetaReparto } from '@/lib/gastos/reparto';

export type Frecuencia = 'once' | 'monthly' | 'yearly';
export type EstadoCobro = 'pending' | 'paid' | 'skipped';

export type Recurrente = {
  id: string;
  name: string;
  category: Categoria;
  amount_cents: number;
  is_variable: boolean;
  frequency: Frecuencia;
  day_of_month: number | null;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  paused: boolean;
  paid_by: Party;
  split_mode: SplitMode;
  split_pct_m1: number | null;
  reminder_days: number | null;
  visible_to_partner: boolean;
  show_in_calendar: boolean;
  created_by: string | null;
  version: number;
  /** Desde cuándo cobra el job (lo pone el servidor al crear, reanudar o cambiar la frecuencia). */
  active_from?: string;
  /** Fecha del último cobro desde `active_from` (lo calcula la app al leer): el job cobra uno por periodo. */
  ultimo_cobro?: string | null;
  /** Solo variables: importe real del último cobro ya apuntado (lo calcula la app al leer). */
  ultima_factura?: { fecha: string; cents: number } | null;
  /** Solo variables: el último cobro está esperando el importe real. */
  falta_importe?: boolean;
};

/** Importe que cuenta: en los variables, el de la última factura si ya hay alguna; si no, el aproximado. */
export const importeActual = (r: Pick<Recurrente, 'amount_cents' | 'is_variable' | 'ultima_factura'>) =>
  r.is_variable && r.ultima_factura ? r.ultima_factura.cents : r.amount_cents;

export type Cobro = { id: string; due_date: string; status: EstadoCobro; amount_cents: number | null };

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/**
 * Próximo cobro a partir de `desde` (incluido), o null si ya no habrá más (pausado, puntual ya pasado,
 * terminado). Mismo criterio que `payment_due_dates`: nunca antes de `start_date` ni después de `end_date`.
 */
export function proximoCobro(
  r: Pick<Recurrente, 'frequency' | 'day_of_month' | 'month_of_year' | 'start_date' | 'end_date' | 'paused'> &
    Pick<Recurrente, 'active_from' | 'ultimo_cobro'>,
  desde: string = hoyISO(),
): string | null {
  if (r.paused) return null;
  const ultimo = r.ultimo_cobro ?? null;
  const minimo = [desde, r.start_date, r.active_from ?? ''].reduce((a, b) => (b > a ? b : a));
  // Como el job: como mucho un cobro por mes (mensual), por año (anual) o uno en total (puntual).
  const mismoPeriodo = (c: string) =>
    !!ultimo && (r.frequency === 'monthly' ? c.slice(0, 7) === ultimo.slice(0, 7) : c.slice(0, 4) === ultimo.slice(0, 4));
  let cobro: string | null = null;
  if (r.frequency === 'once') {
    cobro = r.start_date >= minimo && !ultimo ? r.start_date : null;
  } else if (r.frequency === 'monthly' && r.day_of_month) {
    const d = deISO(minimo);
    for (let i = 0; i < 3 && !cobro; i++) {
      const c = diaDelMes(d.getFullYear(), d.getMonth() + i, r.day_of_month);
      if (c >= minimo && !mismoPeriodo(c)) cobro = c;
    }
  } else if (r.frequency === 'yearly' && r.day_of_month && r.month_of_year) {
    const anio = deISO(minimo).getFullYear();
    for (let i = 0; i < 3 && !cobro; i++) {
      const c = diaDelMes(anio + i, r.month_of_year - 1, r.day_of_month);
      if (c >= minimo && !mismoPeriodo(c)) cobro = c;
    }
  }
  if (cobro && r.end_date && cobro > r.end_date) return null;
  return cobro;
}

/**
 * Personales: los paga una persona y son solo suyos (no generan deuda). El resto, compartidos: a medias,
 * proporcional, personalizado, del bote, o «pago yo y es solo de mi pareja» (eso sí genera deuda).
 */
export const esPersonal = (r: Pick<Recurrente, 'split_mode' | 'paid_by'>) =>
  (r.split_mode === 'only_m1' && r.paid_by === 'm1') || (r.split_mode === 'only_m2' && r.paid_by === 'm2');

/** Total al mes (solo los mensuales) y al año (solo los anuales), sin pausados ni puntuales. */
export function totales(lista: Pick<Recurrente, 'frequency' | 'paused' | 'amount_cents' | 'is_variable' | 'ultima_factura'>[]) {
  let mes = 0;
  let anio = 0;
  for (const r of lista) {
    if (r.paused) continue;
    if (r.frequency === 'monthly') mes += importeActual(r);
    else if (r.frequency === 'yearly') anio += importeActual(r);
  }
  return { mes, anio };
}

/** «16 dic», con el año si no es el actual. */
export function fechaCobro(iso: string, hoy: string = hoyISO()): string {
  const d = deISO(iso);
  const base = `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  return d.getFullYear() === deISO(hoy).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** «Día 16», «Cada 3 mar», «12 dic». */
export function textoCuando(r: Pick<Recurrente, 'frequency' | 'day_of_month' | 'month_of_year' | 'start_date'>): string {
  if (r.frequency === 'monthly') return `Día ${r.day_of_month}`;
  if (r.frequency === 'yearly') return `Cada ${r.day_of_month} ${MESES_CORTOS[(r.month_of_year ?? 1) - 1]}`;
  return `El ${fechaCobro(r.start_date)}`;
}

/** «Bote común», «A medias», «Solo tú», «Proporcional 60/40». */
export function textoQuien(r: Pick<Recurrente, 'paid_by' | 'split_mode' | 'split_pct_m1'>, yo: Hueco, nombrePareja: string): string {
  if (r.paid_by === 'pot' || r.split_mode === 'pot') return 'Bote común';
  const t = etiquetaReparto(r.split_mode, yo, r.split_pct_m1, nombrePareja);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Línea de la lista: «Día 25 · A medias · importe variable». */
export function lineaRecurrente(r: Recurrente, yo: Hueco, nombrePareja: string): string {
  const variable = !r.is_variable
    ? null
    : r.falta_importe
      ? 'falta el importe'
      : r.ultima_factura
        ? `factura del ${fechaCobro(r.ultima_factura.fecha)}`
        : 'importe variable';
  return [textoCuando(r), textoQuien(r, yo, nombrePareja), variable].filter(Boolean).join(' · ');
}

/** Importe de la lista: el real de la última factura en los variables, o el aproximado con «~». */
export const importeRecurrente = (r: Pick<Recurrente, 'amount_cents' | 'is_variable' | 'ultima_factura'>) =>
  r.is_variable && r.ultima_factura ? formatearImporte(r.ultima_factura.cents) : `${r.is_variable ? '~' : ''}${formatearImporte(r.amount_cents)}`;

/** «El día 16 de cada mes», «Cada 3 de marzo», «El 12 de diciembre». */
export function textoFrecuencia(frecuencia: Frecuencia, dia: number, mes: number, fecha: string): string {
  if (frecuencia === 'monthly') return `El día ${dia} de cada mes${dia >= 29 ? ' (o el último, si el mes es más corto)' : ''}`;
  if (frecuencia === 'yearly') return `Cada ${dia} de ${MESES[mes - 1].toLowerCase()}`;
  const d = deISO(fecha);
  return `El ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
}

export const ESTADO_COBRO: Record<EstadoCobro, string> = {
  pending: 'Falta el importe',
  paid: 'Apuntado',
  skipped: 'Saltado',
};
