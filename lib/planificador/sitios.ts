/**
 * Sitios de un plan (F7): los de su colección automática (`collections.plan_id`), cuáles están ya en el itinerario
 * y a qué plan se puede añadir un sitio. Todo puro, sin red ni React.
 */
import { diasEntre } from '@/lib/calendario/rejilla';
import { sitiosDeColeccion } from '@/lib/mapa/colecciones';
import type { Coleccion, Pertenencia, Sitio } from '@/lib/mapa/tipos';
import { type ElementoItinerario, estaDentro } from '@/lib/planificador/itinerario';
import { proximos } from '@/lib/planificador/plan';
import type { Plan } from '@/lib/planificador/tipos';

/** La colección automática del plan (null si esta persona no la ve o aún no existe). */
export const coleccionDelPlan = <T extends Pick<Coleccion, 'plan_id'>>(planId: string, colecciones: T[]): T | null => colecciones.find((c) => c.plan_id === planId) ?? null;

export type SitioDelPlan = {
  sitio: Sitio;
  /** Quién lo metió en la colección del plan (`collection_places.added_by`). */
  anadidoPor: string | null;
  /** Días del plan (1, 2…) en los que algún elemento del itinerario tiene este sitio. */
  dias: number[];
};

/** Días del plan con algún elemento en ese sitio, sin repetir y en orden. Lo que está fuera de las fechas del plan no cuenta. */
export function diasEnItinerario(sitioId: string, elementos: ElementoItinerario[], plan: Pick<Plan, 'id' | 'start_date' | 'end_date'>): number[] {
  const dias = elementos
    .filter((e) => e.plan_id === plan.id && e.place_id === sitioId && estaDentro(e, plan.start_date, plan.end_date))
    .map((e) => diasEntre(plan.start_date, e.start_date) + 1);
  return [...new Set(dias)].sort((a, b) => a - b);
}

/** Los sitios de la colección del plan en el orden de la Lista, con quién los añadió y su día en el itinerario. */
export function sitiosDelPlan(
  coleccionId: string,
  plan: Pick<Plan, 'id' | 'start_date' | 'end_date'>,
  sitios: Sitio[],
  pertenencias: Pertenencia[],
  elementos: ElementoItinerario[],
): SitioDelPlan[] {
  const autor = new Map(pertenencias.filter((p) => p.collection_id === coleccionId).map((p) => [p.place_id, p.added_by ?? null]));
  return sitiosDeColeccion(coleccionId, sitios, pertenencias).map((sitio) => ({ sitio, anadidoPor: autor.get(sitio.id) ?? null, dias: diasEnItinerario(sitio.id, elementos, plan) }));
}

/** «En el itinerario · Día 2», «… · Días 1 y 3», «… · Días 1, 2 y 4»; «En el itinerario» a secas en un plan de un día; null si no está. */
export function textoEnItinerario(dias: number[], totalDias: number): string | null {
  if (dias.length === 0) return null;
  if (totalDias === 1) return 'En el itinerario';
  if (dias.length === 1) return `En el itinerario · Día ${dias[0]}`;
  return `En el itinerario · Días ${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
}

/** «Lo añadiste tú» / «Lo añadió María»; null si no se sabe quién (sitios antiguos o borrado su perfil). */
export function textoAnadidoPor(anadidoPor: string | null, userId: string | undefined, nombrePareja: string): string | null {
  if (!anadidoPor) return null;
  return anadidoPor === userId ? 'Lo añadiste tú' : `Lo añadió ${nombrePareja}`;
}

/** Planes a los que la ficha de un sitio ofrece «Añadir al itinerario»: en curso y próximos, nunca los pasados. */
export const planesParaItinerario = <T extends Pick<Plan, 'start_date' | 'end_date' | 'name'>>(planes: T[], hoy: string): T[] => proximos(planes, hoy);
