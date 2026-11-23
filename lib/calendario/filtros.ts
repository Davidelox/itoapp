/**
 * Filtros del calendario (menú del embudo, docs/plan-cabeceras-calendario.md §3): las opciones, sus etiquetas y dónde
 * se pone el menú. Funciones puras.
 */
import type { Filtro, Filtros } from '@/lib/calendario/agrupar';
import type { CategoriaEvento } from '@/lib/calendario/evento';
import type { IconoFiltro } from '@/lib/calendario/colores';

export type { IconoFiltro };

export type OpcionFiltro = { valor: Filtro; etiqueta: string; icono: IconoFiltro };

/**
 * Viajes · Comer fuera · Ocio · Otros · Cumpleaños · Pagos · Planes: opciones que no se solapan y que juntas lo cubren
 * todo; se pueden marcar varias (O entre ellas). «Otros» son los eventos sin categoría propia; «Planes», los del Planificador.
 */
export const OPCIONES_FILTRO: readonly OpcionFiltro[] = [
  { valor: 'trip', etiqueta: 'Viajes', icono: 'airplane' },
  { valor: 'eating_out', etiqueta: 'Comer fuera', icono: 'restaurant' },
  { valor: 'leisure', etiqueta: 'Ocio', icono: 'ticket' },
  { valor: 'sports', etiqueta: 'Deportivo', icono: 'football' },
  { valor: 'home_night', etiqueta: 'Velada en casa', icono: 'home' },
  { valor: 'culture', etiqueta: 'Cultura', icono: 'film' },
  { valor: 'social', etiqueta: 'Quedada', icono: 'people' },
  { valor: 'health', etiqueta: 'Salud', icono: 'heart' },
  { valor: 'other', etiqueta: 'Otros', icono: 'calendar' },
  { valor: 'birthday', etiqueta: 'Cumpleaños', icono: 'gift' },
  { valor: 'payment', etiqueta: 'Pagos', icono: 'pago' },
  { valor: 'plan', etiqueta: 'Planes', icono: 'briefcase' },
];

/** Nombre de un filtro («Viajes»). */
export const etiquetaFiltro = (f: Filtro): string => OPCIONES_FILTRO.find((o) => o.valor === f)?.etiqueta ?? f;

/** Los filtros dados, sin repetir y en el orden del menú. */
const enOrden = (filtros: Filtros): Filtros => OPCIONES_FILTRO.map((o) => o.valor).filter((v) => filtros.includes(v));

/** Marca el filtro si no estaba y lo quita si estaba; devuelve siempre el orden del menú. */
export function alternarFiltro(filtros: Filtros, f: Filtro): Filtros {
  return enOrden(filtros.includes(f) ? filtros.filter((x) => x !== f) : [...filtros, f]);
}

/** Quita un filtro (si no estaba, queda igual). */
export const quitarFiltro = (filtros: Filtros, f: Filtro): Filtros => enOrden(filtros.filter((x) => x !== f));

/** Añade un filtro si no estaba (en orden del menú). */
export const anadirFiltro = (filtros: Filtros, f: Filtro): Filtros => enOrden([...filtros, f]);

/** Para lectores y el botón: «Viajes», «Viajes y Ocio», «Viajes, Ocio y Pagos»; sin ninguno, «sin filtros». */
export function resumenFiltros(filtros: Filtros): string {
  const nombres = enOrden(filtros).map(etiquetaFiltro);
  if (nombres.length === 0) return 'sin filtros';
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/** Tipo sugerido para «Añadir evento»: solo con UN filtro activo (y «Otros» no sugiere nada). */
export function sugerenciaNuevo(filtros: Filtros): { tipo?: 'cumple' | 'pago'; categoria?: CategoriaEvento } {
  if (filtros.length !== 1) return {};
  const f = filtros[0];
  if (f === 'birthday') return { tipo: 'cumple' };
  if (f === 'payment') return { tipo: 'pago' };
  if (f !== 'other' && f !== 'plan') return { categoria: f };
  return {};
}

export type Rect = { x: number; y: number; width: number; height: number };

/** Separación entre el botón y el menú. */
export const SEPARACION_MENU = 6;

/**
 * Esquina superior izquierda del menú: debajo del botón y alineado a su borde derecho (o centrado en él con
 * `alineacion: 'centro'`); arriba si abajo no cabe; y siempre dentro de la ventana, a `margen` px de los bordes (si la
 * ventana es más pequeña que el menú, a `margen` del borde de arriba).
 */
export function posicionMenu(
  boton: Rect,
  ventana: { width: number; height: number },
  menu: { ancho: number; alto: number },
  margen = 8,
  alineacion: 'derecha' | 'centro' = 'derecha',
): { top: number; left: number } {
  const izquierda = alineacion === 'centro' ? boton.x + boton.width / 2 - menu.ancho / 2 : boton.x + boton.width - menu.ancho;
  const left = Math.max(margen, Math.min(izquierda, ventana.width - menu.ancho - margen));
  const debajo = boton.y + boton.height + SEPARACION_MENU;
  const cabeDebajo = debajo + menu.alto + margen <= ventana.height;
  const top = cabeDebajo ? debajo : boton.y - SEPARACION_MENU - menu.alto;
  return { top: Math.max(margen, Math.min(top, ventana.height - menu.alto - margen)), left };
}
