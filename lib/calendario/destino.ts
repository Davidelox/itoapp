/**
 * A dónde se vuelve tras guardar un evento o un pago nuevo, y cómo lo recibe el calendario:
 * `/calendario?dia=YYYY-MM-DD&evento=<id>` lleva el calendario a ese día, lo selecciona y resalta un momento
 * la fila de ese evento (o pago: en los pagos es el id del recurrente). Funciones puras.
 */
import { type Elemento, type Filtro, filtrar } from '@/lib/calendario/agrupar';
import { type Formulario, fechaCumple } from '@/lib/calendario/evento';
import { proximaRepeticion } from '@/lib/calendario/repeticion';
import { aISO, deISO } from '@/lib/gastos/fechas';

/** Desde dónde se abrió el formulario de un pago nuevo: decide a dónde se vuelve al guardar. */
export type Origen = 'calendario' | 'gastos';

/** Parámetro `origen` de la ruta; si falta o no se entiende, «gastos» (la lista de Pagos recurrentes). */
export function origenDe(valor: string | string[] | undefined): Origen {
  return (Array.isArray(valor) ? valor[0] : valor) === 'calendario' ? 'calendario' : 'gastos';
}

const esFechaISO = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && aISO(deISO(v)) === v;

/** Parámetros de `/calendario` para llevarlo a un día y resaltar un elemento; sin día válido, ninguno. */
export function paramsAlCalendario(dia: string | null | undefined, id?: string | null): { dia?: string; evento?: string } {
  if (!esFechaISO(dia ?? undefined)) return {};
  return id ? { dia: dia as string, evento: id } : { dia: dia as string };
}

/** Lo que pide la ruta del calendario: el día a enseñar y, si lo hay, el elemento a resaltar. */
export type Objetivo = { dia: string; evento: string | null };

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lee `dia` y `evento` de la ruta; null si no hay un día válido (un enlace roto no mueve nada). */
export function leerObjetivo(dia: string | string[] | undefined, evento: string | string[] | undefined): Objetivo | null {
  const d = primero(dia);
  if (!esFechaISO(d)) return null;
  const e = primero(evento);
  return { dia: d, evento: e ? e : null };
}

/** El filtro con el que se ve `elemento`: el actual si lo deja pasar, y si no «Todos». Sin elemento, el actual. */
export function filtroParaVer(filtro: Filtro, elemento: Elemento | undefined): Filtro {
  if (!elemento || filtro === 'todos') return filtro;
  return filtrar([elemento], filtro).length > 0 ? filtro : 'todos';
}

/**
 * Día en que se ve un evento recién creado: su fecha de inicio (la de la primera repetición, también en uno de
 * varios días). Un cumpleaños se guarda en un año ancla: se enseña en su próxima celebración.
 */
export function diaDelEventoNuevo(f: Pick<Formulario, 'fecha' | 'dia' | 'mes'>, esCumple: boolean, hoy: string): string {
  if (!esCumple) return f.fecha;
  return proximaRepeticion(fechaCumple(f.mes, f.dia), 'yearly', null, hoy) ?? hoy;
}

/** Destino tras guardar un pago nuevo. `primerCobro`: el día de su primer cobro (null si no lo hay). */
export type DestinoPago =
  | { destino: 'calendario'; params: { dia?: string; evento?: string } }
  | { destino: 'recurrentes' };

export function destinoTrasGuardarPago(origen: Origen, id: string, primerCobro: string | null): DestinoPago {
  return origen === 'calendario' ? { destino: 'calendario', params: paramsAlCalendario(primerCobro, id) } : { destino: 'recurrentes' };
}
