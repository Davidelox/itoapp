/** Planes pasados y resumen de un plan (docs/plan-planificador.md §F10). Solo lectura: no recalcula saldos. Sin red ni React. */
import { formatearEuros } from '@/lib/dinero/importe';
import { MESES } from '@/lib/gastos/fechas';
import { sitiosDeColeccion } from '@/lib/mapa/colecciones';
import type { Pertenencia, Sitio } from '@/lib/mapa/tipos';
import { type ElementoItinerario, agruparItinerario, textoDia } from '@/lib/planificador/itinerario';
import { etiquetaTipo, seccionDe } from '@/lib/planificador/plan';
import type { Plan, PlanLista } from '@/lib/planificador/tipos';

/** Planes terminados (fin antes de hoy), el que acabó más tarde primero. */
export function pasados<T extends Pick<Plan, 'start_date' | 'end_date' | 'name'>>(planes: T[], hoy: string): T[] {
  return planes
    .filter((p) => seccionDe(p, hoy) === 'pasado')
    .sort((a, b) => b.end_date.localeCompare(a.end_date) || b.start_date.localeCompare(a.start_date) || a.name.localeCompare(b.name, 'es'));
}

/** «Septiembre 2026»: el mes en que terminó. */
export const mesYAnio = (iso: string): string => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** «Gastado 640 €»; `null` si se desconoce (no se inventa) y «Sin gastos» si el plan no tuvo ninguno. */
export const textoGastado = (cents: number | null): string | null => (cents === null ? null : cents === 0 ? 'Sin gastos' : `Gastado ${formatearEuros(cents)}`);

export const etiquetaPasado = (p: Pick<PlanLista, 'name' | 'type' | 'end_date' | 'gastado_cents'>): string =>
  [p.name, etiquetaTipo(p.type).toLowerCase(), `terminó en ${mesYAnio(p.end_date).toLowerCase()}`, textoGastado(p.gastado_cents)?.toLowerCase()].filter(Boolean).join(', ');

export type PuestoPor = { yo: number; pareja: number; bote: number };

/** Cuánto puso cada uno: suma de lo que pagó cada quién en los gastos del plan (`paid_by`), sin tocar saldos ni repartos. */
export function puestoPor(gastos: { amount_cents: number; paid_by: 'm1' | 'm2' | 'pot' }[], yo: 'm1' | 'm2'): PuestoPor {
  const r: PuestoPor = { yo: 0, pareja: 0, bote: 0 };
  for (const g of gastos) {
    if (g.paid_by === 'pot') r.bote += g.amount_cents;
    else if (g.paid_by === yo) r.yo += g.amount_cents;
    else r.pareja += g.amount_cents;
  }
  return r;
}

/** Sitios de la colección del plan en «Hemos ido». */
export const sitiosVisitados = (coleccionId: string | null, sitios: Sitio[], pertenencias: Pertenencia[]): Sitio[] =>
  coleccionId ? sitiosDeColeccion(coleccionId, sitios, pertenencias).filter((s) => s.status === 'been') : [];

export type LineaDia = { fecha: string; titulo: string; detalle: string };

/** Itinerario resumido: un renglón por día con algo («Día 2 · Dom 6 dic» → «Cena, Museo y 2 más»); lo de fuera de fechas, contado. */
export function itinerarioResumido(elementos: ElementoItinerario[], inicio: string, fin: string): { lineas: LineaDia[]; fuera: number } {
  const { dias, fuera } = agruparItinerario(elementos, inicio, fin);
  const lineas = dias
    .filter((d) => d.elementos.length > 0)
    .map((d) => {
      const titulos = d.elementos.map((e) => e.title);
      const resto = titulos.length - 3;
      return { fecha: d.fecha, titulo: textoDia(d, dias.length), detalle: resto > 0 ? `${titulos.slice(0, 3).join(', ')} y ${resto} más` : titulos.join(', ') };
    });
  return { lineas, fuera: fuera.length };
}
