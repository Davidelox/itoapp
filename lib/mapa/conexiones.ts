/** Conexiones del Mapa con el Calendario y los Gastos (docs/plan-mapa.md F7). Sin red ni React. */
import { CATEGORIA_CALENDARIO } from '@/lib/mapa/categorias';
import type { Sitio } from '@/lib/mapa/tipos';

/** Texto sin mayúsculas ni tildes, para buscar «cafe» y encontrar «Café». */
const plano = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Búsqueda local en el selector: por nombre o dirección; sin texto, todos. Orden alfabético. */
export function buscarEnSitios(sitios: Sitio[], texto: string): Sitio[] {
  const q = plano(texto);
  return sitios
    .filter((s) => q === '' || plano(s.name).includes(q) || plano(s.address ?? '').includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Nombre del sitio enlazado, o null si no se ve (sin sitio, borrado o privado de la pareja). */
export const nombreDeSitio = (sitios: Sitio[] | undefined, id: string | null): string | null =>
  (id && sitios?.find((s) => s.id === id)?.name) || null;

/** Parámetros de `/calendario/nuevo` para «Planear aquí»: hoy, categoría equivalente y el sitio ya elegido. */
export function paramsPlanearAqui(sitio: Pick<Sitio, 'id' | 'category'>, hoy: string): { fecha: string; categoria: string; sitio: string } {
  return { fecha: hoy, categoria: CATEGORIA_CALENDARIO[sitio.category], sitio: sitio.id };
}

/** El sitio llegado por parámetro de ruta: solo un uuid, nunca texto cualquiera. */
export const sitioDeParametro = (v: string | undefined): string | null =>
  v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : null;

/** Evento o gasto enlazado a un sitio, para la lista de la ficha. */
export type PlanEnSitio = { tipo: 'evento' | 'gasto'; id: string; titulo: string; fecha: string; importe_cents: number | null };

/** Filas de `events` y `expenses` → una lista, lo más reciente primero. */
export function juntarPlanes(
  eventos: { id: string; title: string; start_date: string }[],
  gastos: { id: string; concept: string; spent_on: string; amount_cents: number }[],
): PlanEnSitio[] {
  return [
    ...eventos.map((e) => ({ tipo: 'evento' as const, id: e.id, titulo: e.title, fecha: e.start_date, importe_cents: null })),
    ...gastos.map((g) => ({ tipo: 'gasto' as const, id: g.id, titulo: g.concept, fecha: g.spent_on, importe_cents: g.amount_cents })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.titulo.localeCompare(b.titulo, 'es'));
}

/** Estado del sitio enlazado desde un evento o gasto: sin sitio, cargando, visible (con datos) o no disponible. */
export type SitioEnlazado = { tipo: 'ninguno' | 'cargando' | 'no_disponible' } | { tipo: 'visible'; sitio: Sitio };

export function sitioEnlazado(sitios: Sitio[] | undefined, id: string | null): SitioEnlazado {
  if (!id) return { tipo: 'ninguno' };
  if (!sitios) return { tipo: 'cargando' };
  const sitio = sitios.find((s) => s.id === id);
  return sitio ? { tipo: 'visible', sitio } : { tipo: 'no_disponible' };
}

/**
 * Aviso «Tu pareja no verá este sitio»: el sitio enlazado es privado (los privados que ves son tuyos: la RLS oculta
 * los de tu pareja) y el evento o gasto lo ve la pareja. Sin pareja unida no hay a quién avisar.
 */
export const avisarSitioPrivado = (sitio: Pick<Sitio, 'visible_to_partner'> | null | undefined, compartido: boolean, hayPareja: boolean): boolean =>
  !!sitio && !sitio.visible_to_partner && compartido && hayPareja;
