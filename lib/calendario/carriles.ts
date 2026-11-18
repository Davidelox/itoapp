/**
 * Carriles de las barras de los eventos de varios días (docs/plan-calendario-v2.md §2.2 y §2.6).
 *
 * Una semana (7 columnas, de lunes a domingo) recibe los eventos de varios días y devuelve un segmento por
 * cada uno que la toca: la barra se parte al cambiar de semana, y cada semana reparte sus carriles por su
 * cuenta (una barra puede cambiar de carril de una fila a otra, como en Google Calendar). Las barras que no
 * caben en `maxCarriles` no se dibujan: salen en `ocultos` y se cuentan en `ocultosPorDia` (el «+» de la rejilla
 * del Mes; en la Semana pasan a ser una línea en cada día). La Semana usa 3 carriles; el Mes, 2.
 */
import { type Elemento, esVariosDias } from '@/lib/calendario/agrupar';
import { diasEntre } from '@/lib/calendario/rejilla';

export type SegmentoBarra = {
  /** Única por semana y evento. */
  clave: string;
  elemento: Elemento;
  /** Columnas (0 = lunes, 6 = domingo) en que empieza y acaba el segmento dentro de esta semana. */
  colInicio: number;
  colFin: number;
  /** 0 = el de arriba. */
  carril: number;
  /** El evento empieza en esta semana (extremo izquierdo redondeado); si no, viene de la anterior. */
  empieza: boolean;
  /** El evento acaba en esta semana (extremo derecho redondeado); si no, sigue en la siguiente. */
  termina: boolean;
};

export type CarrilesSemana = {
  segmentos: SegmentoBarra[];
  /** Los que no caben en `maxCarriles`, sin carril. */
  ocultos: Omit<SegmentoBarra, 'carril'>[];
  /** Cuántas barras ocultas pasan por cada día de la semana (solo los días con alguna). */
  ocultosPorDia: Record<string, number>;
};

/** Cuántos carriles ocupa lo dibujado (el más bajo usado + 1): 0 si no hay barras. */
export const carrilesUsados = (segmentos: Pick<SegmentoBarra, 'carril'>[]): number =>
  segmentos.reduce((max, s) => Math.max(max, s.carril + 1), 0);

/**
 * Reparte en carriles los eventos de varios días de una semana. `elementos`: uno por repetición (sin repartir
 * por días); los de un día se ignoran. Orden de reparto: el que empieza antes, el más largo primero, el título;
 * cada uno al primer carril libre.
 */
export function segmentosSemana(semana: string[], elementos: Elemento[], maxCarriles: number): CarrilesSemana {
  const lunes = semana[0];
  const domingo = semana[6];
  const candidatos = elementos
    .filter((e) => esVariosDias(e) && e.inicio <= domingo && e.fin >= lunes)
    .map((e) => ({
      clave: `${e.clave}@${lunes}`,
      elemento: e,
      colInicio: Math.max(0, diasEntre(lunes, e.inicio)),
      colFin: Math.min(6, diasEntre(lunes, e.fin)),
      empieza: e.inicio >= lunes,
      termina: e.fin <= domingo,
    }))
    .sort(
      (a, b) =>
        a.colInicio - b.colInicio ||
        b.colFin - b.colInicio - (a.colFin - a.colInicio) ||
        a.elemento.titulo.localeCompare(b.elemento.titulo, 'es') ||
        a.clave.localeCompare(b.clave),
    );

  // ocupados[carril] = columnas ya cogidas en ese carril.
  const ocupados: boolean[][] = Array.from({ length: Math.max(0, maxCarriles) }, () => Array(7).fill(false));
  const segmentos: SegmentoBarra[] = [];
  const ocultos: Omit<SegmentoBarra, 'carril'>[] = [];
  const ocultosPorDia: Record<string, number> = {};
  for (const c of candidatos) {
    const carril = ocupados.findIndex((cols) => cols.slice(c.colInicio, c.colFin + 1).every((x) => !x));
    if (carril === -1) {
      ocultos.push(c);
      for (let col = c.colInicio; col <= c.colFin; col++) ocultosPorDia[semana[col]] = (ocultosPorDia[semana[col]] ?? 0) + 1;
      continue;
    }
    for (let col = c.colInicio; col <= c.colFin; col++) ocupados[carril][col] = true;
    segmentos.push({ ...c, carril });
  }
  return { segmentos, ocultos, ocultosPorDia };
}
