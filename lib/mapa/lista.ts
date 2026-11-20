/** Lógica pura de la Lista y los pines del Mapa (docs/plan-mapa.md §5.1 y §5.4). Sin red ni React. */
import { INFO_CATEGORIA_SITIO } from '@/lib/mapa/categorias';
import type { CategoriaSitio, EstadoSitio, Sitio } from '@/lib/mapa/tipos';

export type FiltrosSitios = { estados: EstadoSitio[]; categorias: CategoriaSitio[] };
export const SIN_FILTROS: FiltrosSitios = { estados: [], categorias: [] };

export const ETIQUETA_ESTADO: Record<EstadoSitio, string> = { want_to_go: 'Quiero ir', been: 'Hemos ido' };

/** «O» dentro de un grupo, «y» entre grupos; un grupo vacío no filtra. */
export function filtrarSitios(sitios: Sitio[], f: FiltrosSitios): Sitio[] {
  return sitios.filter(
    (s) => (f.estados.length === 0 || f.estados.includes(s.status)) && (f.categorias.length === 0 || f.categorias.includes(s.category)),
  );
}

/** Más reciente primero (desempate por nombre, para que el orden sea estable). */
const masReciente = (a: Sitio, b: Sitio) => b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name, 'es');

export type GrupoLista = { estado: EstadoSitio; titulo: string; sitios: Sitio[] };

/** La Lista: «Quiero ir» y luego «Hemos ido»; dentro, el más reciente primero. Los grupos vacíos no salen. */
export function agruparLista(sitios: Sitio[]): GrupoLista[] {
  return (['want_to_go', 'been'] as const)
    .map((estado) => ({ estado, titulo: ETIQUETA_ESTADO[estado], sitios: sitios.filter((s) => s.status === estado).sort(masReciente) }))
    .filter((g) => g.sitios.length > 0);
}

/** «Restaurante · Calle Mayor 12» (sin dirección, solo la categoría). */
export function textoSecundario(s: Pick<Sitio, 'category' | 'address'>): string {
  const cat = INFO_CATEGORIA_SITIO[s.category].etiqueta;
  const dir = s.address?.trim();
  return dir ? `${cat} · ${dir}` : cat;
}

/** Lo que lee el lector de pantalla: «Taberna El Olivo, restaurante, hemos ido, privado». */
export function etiquetaAccesible(s: Pick<Sitio, 'name' | 'category' | 'status' | 'visible_to_partner'>): string {
  const partes = [s.name, INFO_CATEGORIA_SITIO[s.category].etiqueta.toLowerCase(), ETIQUETA_ESTADO[s.status].toLowerCase()];
  if (!s.visible_to_partner) partes.push('privado');
  return partes.join(', ');
}

/** Valoración de una persona, o null si no ha puntuado. */
export function valoracionDe(s: Pick<Sitio, 'place_notes'>, userId: string | null | undefined): number | null {
  if (!userId) return null;
  return s.place_notes.find((n) => n.user_id === userId)?.rating ?? null;
}

/** «4», «4,5» (coma decimal). */
export const textoEstrellas = (v: number): string => String(v).replace('.', ',');

/** Dicho en voz alta: «4 y medio de 5». */
export function textoValoracionHablado(v: number): string {
  const entero = Math.floor(v);
  return `${entero}${v % 1 ? ' y medio' : ''} de 5`;
}

/** Quién guardó el sitio: «yo», «otra» (la pareja) o null (cuenta borrada). */
export function quienGuardo(s: Pick<Sitio, 'created_by'>, userId: string | null | undefined, otraId: string | null | undefined): 'yo' | 'otra' | null {
  if (!s.created_by) return null;
  if (s.created_by === userId) return 'yo';
  return s.created_by === otraId ? 'otra' : null;
}
