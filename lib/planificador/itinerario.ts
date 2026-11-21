/**
 * Itinerario de un plan (F6): sus elementos son eventos con `plan_id`. Todo puro, sin red ni React: agrupar por día,
 * ordenar, lo que cae fuera de las fechas, mover el plan y los parámetros de ruta del formulario.
 */
import { type Evento, COLUMNAS_EVENTO } from '@/lib/calendario/evento';
import { abreviaturaDia, diaMesCorto, diasEntre, sumarDias, tituloDia } from '@/lib/calendario/rejilla';
import { aISO, deISO } from '@/lib/gastos/fechas';
import { sitioDeParametro } from '@/lib/mapa/conexiones';
import type { FilaPlan } from '@/lib/planificador/tipos';

export type Franja = 'morning' | 'afternoon' | 'evening';

/** Un elemento del itinerario: el evento con su franja (mañana/tarde/noche) y su orden dentro del día. */
export type ElementoItinerario = Evento & { time_slot: Franja | null; position: number };

export const COLUMNAS_ITINERARIO = `${COLUMNAS_EVENTO}, time_slot, position`;

const TEXTO_FRANJA: Record<Franja, string> = { morning: 'Mañana', afternoon: 'Tarde', evening: 'Noche' };
const ORDEN_FRANJA: Record<Franja, number> = { morning: 0, afternoon: 1, evening: 2 };

/** Todos los días del plan, del primero al último. */
export const diasDelPlan = (inicio: string, fin: string): string[] =>
  Array.from({ length: diasEntre(inicio, fin) + 1 }, (_, i) => sumarDias(inicio, i));

/** Todo el día (o sin hora) → franja → hora. */
const grupo = (e: ElementoItinerario) => (e.start_time ? 2 : e.time_slot ? 1 : 0);

/** Orden dentro de un día: todo el día → franja → hora → `position` → título. */
export function ordenarElementos(a: ElementoItinerario, b: ElementoItinerario): number {
  const ga = grupo(a);
  const gb = grupo(b);
  if (ga !== gb) return ga - gb;
  if (ga === 1 && a.time_slot && b.time_slot && a.time_slot !== b.time_slot) return ORDEN_FRANJA[a.time_slot] - ORDEN_FRANJA[b.time_slot];
  if (ga === 2 && a.start_time !== b.start_time) return (a.start_time ?? '').localeCompare(b.start_time ?? '');
  return a.position - b.position || a.title.localeCompare(b.title, 'es') || a.id.localeCompare(b.id);
}

/** ¿Cabe el elemento (su inicio y su fin, si dura varios días) en [inicio, fin]? */
export const estaDentro = (e: Pick<Evento, 'start_date' | 'end_date'>, inicio: string, fin: string): boolean =>
  e.start_date >= inicio && e.start_date <= fin && (e.end_date ?? e.start_date) <= fin;

export type DiaItinerario = { fecha: string; numero: number; elementos: ElementoItinerario[] };
export type Itinerario = { dias: DiaItinerario[]; fuera: ElementoItinerario[] };

/**
 * Elementos de UN plan agrupados por día: todos los días del plan salen aunque estén vacíos, y lo que cae fuera de sus
 * fechas (porque se movió el plan sin su itinerario) va aparte, por fecha.
 */
export function agruparItinerario(elementos: ElementoItinerario[], inicio: string, fin: string): Itinerario {
  const dias = diasDelPlan(inicio, fin).map((fecha, i) => ({ fecha, numero: i + 1, elementos: [] as ElementoItinerario[] }));
  const fuera: ElementoItinerario[] = [];
  for (const e of elementos) {
    const dia = estaDentro(e, inicio, fin) ? dias.find((d) => d.fecha === e.start_date) : undefined;
    if (dia) dia.elementos.push(e);
    else fuera.push(e);
  }
  for (const d of dias) d.elementos.sort(ordenarElementos);
  fuera.sort((a, b) => a.start_date.localeCompare(b.start_date) || ordenarElementos(a, b));
  return { dias, fuera };
}

/** Cabecera de un día: «Día 2 · Dom 6 dic», o «Ese día» en un plan de un solo día. */
export const textoDia = (d: DiaItinerario, total: number): string =>
  total === 1 ? 'Ese día' : `Día ${d.numero} · ${abreviaturaDia(d.fecha)} ${diaMesCorto(d.fecha)}`;

/** La hora que se ve en la fila: «21:30», «Todo el día», «Mañana» o nada. */
export function horaElemento(e: Pick<ElementoItinerario, 'start_time' | 'time_slot' | 'all_day'>): string {
  if (e.start_time) return e.start_time.slice(0, 5);
  if (e.all_day) return 'Todo el día';
  return e.time_slot ? TEXTO_FRANJA[e.time_slot] : '';
}

/** Etiqueta de accesibilidad: «Sábado 5, 21:30, Cena en El Olivo, Reservado» (o «falta reservar» si tiene una reserva pendiente). */
export const etiquetaElemento = (e: ElementoItinerario, faltaReservar = false): string =>
  [tituloDia(e.start_date), horaElemento(e).toLowerCase(), e.title, e.reserved ? 'Reservado' : faltaReservar ? 'Falta reservar' : ''].filter(Boolean).join(', ');

/** Fechas de un elemento fuera del plan al llevarlo a `dia`: si dura varios días, conserva la duración sin pasarse del fin. */
export function fechasAlMover(e: Pick<Evento, 'start_date' | 'end_date'>, dia: string, finPlan: string): { start_date: string; end_date: string | null } {
  if (!e.end_date) return { start_date: dia, end_date: null };
  const fin = sumarDias(dia, diasEntre(e.start_date, e.end_date));
  const recortado = fin > finPlan ? finPlan : fin;
  return { start_date: dia, end_date: recortado > dia ? recortado : null };
}

/** Días que se mueve el inicio de un plan (negativo si se adelanta). */
export const desplazamiento = (inicioActual: string, inicioNuevo: string): number => diasEntre(inicioActual, inicioNuevo);

/**
 * Cuántos elementos quedarían fuera de [inicio, fin] tras mover el plan: con `dias` ≠ 0 se desplazan antes
 * (`move_plan` con `p_shift`); con 0, se quedan donde están. Es la previsión de la hoja; la cifra real la da `move_plan`.
 */
export function quedanFuera(elementos: Pick<Evento, 'start_date' | 'end_date'>[], inicio: string, fin: string, dias: number): number {
  return elementos.filter((e) => !estaDentro({ start_date: sumarDias(e.start_date, dias), end_date: e.end_date ? sumarDias(e.end_date, dias) : null }, inicio, fin)).length;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
export const textoElementos = (n: number) => plural(n, 'elemento', 'elementos');
export const textoMoverTodo = (n: number) => `Mover todo (${textoElementos(n)})`;
export const avisoQuedaranFuera = (n: number) =>
  n === 1 ? '1 elemento quedará fuera de las fechas del plan.' : `${n} elementos quedarán fuera de las fechas del plan.`;
export const avisoHanQuedadoFuera = (n: number) =>
  n === 1 ? '1 elemento ha quedado fuera de las fechas del plan.' : `${n} elementos han quedado fuera de las fechas del plan.`;

/** Separa los cambios de fechas (van por `move_plan`) del resto (update normal con `version`). */
export function separarFechas(cambios: Partial<FilaPlan>): { cambianFechas: boolean; resto: Partial<FilaPlan> } {
  const { start_date, end_date, ...resto } = cambios;
  return { cambianFechas: start_date !== undefined || end_date !== undefined, resto };
}

/** Respuesta de `move_plan`; null si no tiene la forma esperada. */
export function resultadoMover(data: unknown): { version: number; moved: number; outside: number } | null {
  const d = data as { version?: unknown; moved?: unknown; outside?: unknown } | null;
  return d && typeof d.version === 'number' && typeof d.moved === 'number' && typeof d.outside === 'number'
    ? { version: d.version, moved: d.moved, outside: d.outside }
    : null;
}

const esFecha = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && aISO(deISO(s)) === s;

/** `?plan=<uuid>` de `/calendario/nuevo`: solo un uuid, nunca texto cualquiera. */
export const planDeParametro = (v: string | undefined): string | null => sitioDeParametro(v);

/** `?fecha=` de un elemento nuevo del plan: la pedida si cae dentro de sus fechas; si no, el primer día. */
export const fechaInicialEnPlan = (fecha: string | undefined, inicio: string, fin: string): string =>
  esFecha(fecha) && fecha >= inicio && fecha <= fin ? fecha : inicio;
