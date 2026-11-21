/** Fechas de visita de un sitio (docs/plan-mapa.md §12): lógica pura, sin red ni React. */
import { diaCorto, diaMesCorto } from '@/lib/calendario/rejilla';
import { aISO, deISO } from '@/lib/gastos/fechas';
import type { PlanEnSitio } from '@/lib/mapa/conexiones';
import type { EstadisticasSitio, EstadoSitio } from '@/lib/mapa/tipos';

export const MAX_NOTA_VISITA = 200;
/** Primera fecha que admite la base de datos (CHECK de `place_visits`). */
export const PRIMERA_FECHA_VISITA = '1950-01-01';

/** Fila de `place_visits` que lee la ficha. */
export type Visita = { id: string; visited_on: string; note: string | null; created_by: string | null; version: number };

/** «sáb 7 nov» (con el año si no es el de `hoy`). */
export function fechaVisita(iso: string, hoy: string): string {
  const base = `${diaCorto(iso)} ${diaMesCorto(iso).split(' ')[1]}`;
  return iso.slice(0, 4) === hoy.slice(0, 4) ? base : `${base} ${iso.slice(0, 4)}`;
}

/** Más reciente primero (a igual día, por id, para que el orden sea estable). */
export const ordenarVisitas = (visitas: Visita[]): Visita[] =>
  [...visitas].sort((a, b) => b.visited_on.localeCompare(a.visited_on) || a.id.localeCompare(b.id));

/** Error de la fecha elegida, o null si vale: con fecha real, desde 1950 y no futura (la app es más estricta que el servidor). */
export function errorFechaVisita(fecha: string, hoy: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || aISO(deISO(fecha)) !== fecha) return 'Elige una fecha.';
  if (fecha > hoy) return 'La fecha de la visita no puede ser futura.';
  if (fecha < PRIMERA_FECHA_VISITA) return 'Esa fecha es demasiado antigua.';
  return null;
}

/** Nota recortada y limitada a 200; vacía = null. */
export const notaDeVisita = (nota: string): string | null => nota.trim().slice(0, MAX_NOTA_VISITA) || null;

/** «1 visita», «3 visitas». */
export const textoContadorVisitas = (n: number): string => `${n} ${n === 1 ? 'visita' : 'visitas'}`;

/** «Última visita: sáb 7 nov»; «Sin fecha» si está en «Hemos ido» sin ninguna visita; null si no hay nada que decir. */
export function textoUltimaVisita(estado: EstadoSitio, stats: Pick<EstadisticasSitio, 'visit_count' | 'last_visit_on'> | null | undefined, hoy: string): string | null {
  if (stats?.last_visit_on) return `Última visita: ${fechaVisita(stats.last_visit_on, hoy)}`;
  return estado === 'been' && (stats?.visit_count ?? 0) === 0 ? 'Sin fecha' : null;
}

/** «¿Fuisteis el vie 14?»: la fecha sugerida (un evento o gasto del sitio sin visita apuntada), o null. */
export const fechaSugerida = (stats: Pick<EstadisticasSitio, 'suggested_visit_on'> | null | undefined): string | null => stats?.suggested_visit_on ?? null;

/** Importe gastado en el sitio ese día (suma de los gastos enlazados con esa fecha), o null si no hay. */
export function gastoDelDia(planes: PlanEnSitio[] | undefined, fecha: string): number | null {
  const gastos = (planes ?? []).filter((x) => x.tipo === 'gasto' && x.fecha === fecha && x.importe_cents !== null);
  return gastos.length ? gastos.reduce((s, x) => s + (x.importe_cents as number), 0) : null;
}

/**
 * ¿Hay que pedir la fecha al pasar a «Hemos ido»? Solo si el sitio aún no tiene visitas (con visitas, el estado
 * cambia sin más; «+ Añadir visita» sirve para apuntar otra).
 */
export const pedirFechaAlMarcar = (stats: Pick<EstadisticasSitio, 'visit_count'> | null | undefined): boolean => (stats?.visit_count ?? 0) === 0;
