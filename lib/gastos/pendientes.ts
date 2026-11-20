import { formatearImporte } from '@/lib/dinero/importe';
import { nombreMovimiento } from '@/lib/gastos/bote';
import type { Pendiente } from '@/lib/gastos/consultas';

type Hueco = Parameters<typeof nombreMovimiento>[1];

const COSA_BORRADA = {
  expense: 'el gasto',
  pot_movement: 'el movimiento',
  event: 'el evento',
  recurring_payment: 'el pago',
  place: 'el sitio',
  collection: 'la colección',
} as const;

/** «el evento», «el pago»…: lo que se queda si no se responde a la solicitud de borrado. */
export const cosaBorrada = (p: Extract<Pendiente, { tipo: 'borrado' }>): string => COSA_BORRADA[p.objetivo] ?? 'el gasto';

/**
 * «cena · 20,00 €»: lo que se pide borrar. Un evento o un pago recurrente salen con la etiqueta que guardó el
 * servidor (el título del evento, con la fecha si es solo una; en un cumpleaños «Cumpleaños de <nombre>», desde 20261122000000).
 */
export function descripcionBorrado(p: Extract<Pendiente, { tipo: 'borrado' }>, yo: Hueco, nombrePareja: string): string {
  if (p.gasto) return `${p.gasto.concept} · ${formatearImporte(p.gasto.amount_cents)}`;
  if (p.movimiento) return `${nombreMovimiento(p.movimiento, yo, nombrePareja)} · ${formatearImporte(p.movimiento.amount_cents)}`;
  return p.etiqueta;
}

/** Frase corta de un aviso, para la línea resumen del recuadro plegado. */
export function textoCortoPendiente(p: Pendiente, yo: Hueco, nombrePareja: string): string {
  switch (p.tipo) {
    case 'pago':
      return `${nombrePareja} dice que te ha pagado ${formatearImporte(p.pago.amount_cents)}`;
    case 'cobro':
      return `Ha llegado ${p.recurrente.name}`;
    case 'propuesta':
      return `${nombrePareja} propone cambiar los ajustes`;
    case 'quienPago':
      return `¿Quién pagó ${p.evento.title}?`;
    case 'borrado':
      return `${nombrePareja} quiere borrar «${descripcionBorrado(p, yo, nombrePareja)}»`;
  }
}

/** Une los primeros textos con « · »; el recorte visual lo hace `numberOfLines`. */
export function resumenPendientes(textos: string[], max = 3): string {
  return textos.slice(0, max).join(' · ');
}

export function tituloPendientes(n: number): string {
  return `${n} cosas pendientes`;
}

/** Cuántos avisos siguen pendientes de verdad: los ya respondidos (que se quedan un momento en pantalla) no cuentan. */
export function contarPendientes(pendientes: Pendiente[], resueltas: ReadonlySet<string>): number {
  return pendientes.filter((p) => !resueltas.has(p.id)).length;
}
