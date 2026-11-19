/**
 * Selector de mes (y de semana) del desplegable de la barra (docs/plan-calendario-v3.md §2): qué se enseña, qué ancla
 * deja cada elección y hacia dónde entra la rejilla al saltar. Funciones puras.
 */
import { MESES } from '@/lib/gastos/fechas';
import { type Vista, etiquetaPeriodoCorta, inicioSemana, mismoPeriodo, semanasDelMes } from '@/lib/calendario/rejilla';

export const ANIO_MIN = 2000;
export const ANIO_MAX = 2100;

const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const dos = (n: number) => String(n).padStart(2, '0');

/** Año dentro de [ANIO_MIN, ANIO_MAX]. */
export const limitarAnio = (a: number): number => Math.max(ANIO_MIN, Math.min(ANIO_MAX, a));

/** ¿El año de la fecha está en el rango que se puede visitar? */
export const dentroDeLimites = (iso: string): boolean => {
  const a = Number(iso.slice(0, 4));
  return a >= ANIO_MIN && a <= ANIO_MAX;
};

/** Ancla al elegir un mes (1–12): hoy si es el mes actual; si no, el día 1. El año se limita al rango. */
export function anclaDeMes(anio: number, mes: number, hoy: string): string {
  const prefijo = `${limitarAnio(anio)}-${dos(mes)}`;
  return hoy.slice(0, 7) === prefijo ? hoy : `${prefijo}-01`;
}

export type CeldaMes = { mes: number; etiqueta: string; accesible: string; visible: boolean; actual: boolean };

/** Los 12 meses de `anio` («Ene»…«Dic», accesible «Enero de 2027»), marcando el visible (`ancla`) y el de hoy. */
export function mesesDelAnio(anio: number, ancla: string, hoy: string): CeldaMes[] {
  return MESES.map((nombre, i) => {
    const prefijo = `${anio}-${dos(i + 1)}`;
    return {
      mes: i + 1,
      etiqueta: MESES_ABREV[i],
      accesible: `${nombre} de ${anio}`,
      visible: ancla.slice(0, 7) === prefijo,
      actual: hoy.slice(0, 7) === prefijo,
    };
  });
}

export type OpcionSemana = { ancla: string; etiqueta: string; accesible: string; visible: boolean; actual: boolean };

/** Semanas (4–6) que tocan ese mes, etiqueta corta «28 dic–3 ene»; el ancla es el lunes, u hoy si es la semana actual. */
export function semanasParaElegir(anio: number, mes: number, ancla: string, hoy: string): OpcionSemana[] {
  const lunesAncla = inicioSemana(ancla);
  const lunesHoy = inicioSemana(hoy);
  return semanasDelMes(`${anio}-${dos(mes)}-01`).map((semana) => {
    const lunes = semana[0];
    const actual = lunes === lunesHoy;
    const etiqueta = etiquetaPeriodoCorta('semana', lunes);
    // El lunes de la primera semana de enero de 2000 es de 1999 (fuera de los límites): ahí el ancla es el 1 de enero.
    const anclaSemana = actual ? hoy : lunes < `${ANIO_MIN}-01-01` ? `${ANIO_MIN}-01-01` : lunes;
    return { ancla: anclaSemana, etiqueta: etiqueta.principal, accesible: etiqueta.accesible, visible: lunes === lunesAncla, actual };
  });
}

/** Hacia dónde entra la rejilla al saltar de `desde` a `hasta`: -1 (viene del pasado), 1 (del futuro) o 0 (mismo periodo). */
export function direccionSalto(vista: Vista, desde: string, hasta: string): -1 | 0 | 1 {
  if (mismoPeriodo(vista, desde, hasta)) return 0;
  return hasta > desde ? 1 : -1;
}
