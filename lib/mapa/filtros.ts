/** Filtros de la pestaña Mapa (docs/plan-mapa.md §5.1): grupos, «o» dentro de un grupo, «y» entre grupos. Sin React. */
import { CATEGORIAS_SITIO, INFO_CATEGORIA_SITIO } from '@/lib/mapa/categorias';
import { ETIQUETA_ESTADO, type FiltrosSitios, filtrarSitios } from '@/lib/mapa/lista';
import type { CategoriaSitio, Coleccion, EstadoSitio, Pertenencia, Sitio } from '@/lib/mapa/tipos';

export type Autor = 'mio' | 'pareja';
export type Visibilidad = 'compartido' | 'privado';
/** `colecciones`: ids de las colecciones elegidas (grupo dinámico: sus opciones salen de los datos). */
export type FiltrosMapa = FiltrosSitios & { autores: Autor[]; visibilidad: Visibilidad[]; colecciones: string[] };
export const SIN_FILTROS_MAPA: FiltrosMapa = { estados: [], categorias: [], autores: [], visibilidad: [], colecciones: [] };

export type GrupoFijo = 'estados' | 'categorias' | 'autores' | 'visibilidad';
export type Grupo = GrupoFijo | 'colecciones';
/** `emoji`: las opciones de colección lo llevan en lugar de un icono de Ionicons. */
export type OpcionMapa = { grupo: Grupo; valor: string; etiqueta: string; icono: string; emoji?: string };

export const TITULO_GRUPO: Record<Grupo, string> = { estados: 'Estado', categorias: 'Categoría', autores: 'De quién', visibilidad: 'Visibilidad', colecciones: 'Colecciones' };

/** Opciones por grupo, en el orden del menú. */
export const OPCIONES_MAPA: Record<GrupoFijo, readonly OpcionMapa[]> = {
  estados: (['want_to_go', 'been'] as EstadoSitio[]).map((v) => ({
    grupo: 'estados' as const,
    valor: v,
    etiqueta: ETIQUETA_ESTADO[v],
    icono: v === 'been' ? 'checkmark-circle-outline' : 'bookmark-outline',
  })),
  categorias: CATEGORIAS_SITIO.map((v: CategoriaSitio) => ({
    grupo: 'categorias' as const,
    valor: v,
    etiqueta: INFO_CATEGORIA_SITIO[v].plural,
    icono: INFO_CATEGORIA_SITIO[v].icono,
  })),
  autores: [
    { grupo: 'autores', valor: 'mio', etiqueta: 'Míos', icono: 'person-outline' },
    { grupo: 'autores', valor: 'pareja', etiqueta: 'De mi pareja', icono: 'heart-outline' },
  ],
  visibilidad: [
    { grupo: 'visibilidad', valor: 'compartido', etiqueta: 'Compartidos', icono: 'people-outline' },
    { grupo: 'visibilidad', valor: 'privado', etiqueta: 'Privados', icono: 'lock-closed-outline' },
  ],
};

export const GRUPOS: readonly GrupoFijo[] = ['estados', 'categorias', 'autores', 'visibilidad'];

/** Opciones del grupo «Colecciones»: una por colección, con su emoji. */
export const opcionesColecciones = (colecciones: Pick<Coleccion, 'id' | 'name' | 'icon'>[]): OpcionMapa[] =>
  colecciones.map((c) => ({ grupo: 'colecciones' as const, valor: c.id, etiqueta: c.name, icono: 'albums-outline', emoji: c.icon }));

/** Todas las opciones marcadas, en el orden del menú (las colecciones, las últimas; solo las que existen). */
export function opcionesActivas(f: FiltrosMapa, colecciones: Pick<Coleccion, 'id' | 'name' | 'icon'>[] = []): OpcionMapa[] {
  return [
    ...GRUPOS.flatMap((g) => OPCIONES_MAPA[g].filter((o) => (f[g] as string[]).includes(o.valor))),
    ...opcionesColecciones(colecciones).filter((o) => f.colecciones.includes(o.valor)),
  ];
}

export const contarFiltros = (f: FiltrosMapa): number => GRUPOS.reduce((n, g) => n + f[g].length, 0) + f.colecciones.length;

/** Quita del filtro las colecciones que ya no existen (borradas o que la pareja ha vuelto privadas). */
export function depurarFiltros(f: FiltrosMapa, colecciones: Pick<Coleccion, 'id'>[]): FiltrosMapa {
  const ids = new Set(colecciones.map((c) => c.id));
  return f.colecciones.every((id) => ids.has(id)) ? f : { ...f, colecciones: f.colecciones.filter((id) => ids.has(id)) };
}

/** Marca la opción si no estaba y la quita si estaba; el grupo queda siempre en el orden del menú. */
export function alternarFiltroMapa(f: FiltrosMapa, grupo: Grupo, valor: string): FiltrosMapa {
  const actuales = f[grupo] as string[];
  const nuevos = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
  if (grupo === 'colecciones') return { ...f, colecciones: nuevos };
  const ordenados = OPCIONES_MAPA[grupo].map((o) => o.valor).filter((v) => nuevos.includes(v));
  return { ...f, [grupo]: ordenados } as FiltrosMapa;
}

/** «Restaurantes», «Quiero ir y Privados»; sin ninguno, «sin filtros». */
export function resumenFiltrosMapa(f: FiltrosMapa, colecciones: Pick<Coleccion, 'id' | 'name' | 'icon'>[] = []): string {
  const nombres = opcionesActivas(f, colecciones).map((o) => o.etiqueta);
  if (nombres.length === 0) return 'sin filtros';
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/** Aplica los grupos. `userId` es el de quien usa la app («Míos» = guardados por esa persona). `pertenencias`: para el grupo «Colecciones». */
export function filtrarMapa(sitios: Sitio[], f: FiltrosMapa, userId: string | null | undefined, pertenencias: Pertenencia[] = []): Sitio[] {
  const enColecciones = new Set(f.colecciones.length > 0 ? pertenencias.filter((p) => f.colecciones.includes(p.collection_id)).map((p) => p.place_id) : []);
  return filtrarSitios(sitios, f).filter((s) => {
    if (f.colecciones.length > 0 && !enColecciones.has(s.id)) return false;
    if (f.autores.length > 0) {
      const mio = !!userId && s.created_by === userId;
      const pareja = !!s.created_by && s.created_by !== userId;
      if (!((f.autores.includes('mio') && mio) || (f.autores.includes('pareja') && pareja))) return false;
    }
    if (f.visibilidad.length > 0) {
      if (!f.visibilidad.includes(s.visible_to_partner ? 'compartido' : 'privado')) return false;
    }
    return true;
  });
}
