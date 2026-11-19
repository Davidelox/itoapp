/**
 * Geometría del indicador de carga con el hilo (docs/plan-calendario-v3.md §6): un hilo horizontal por el que corre una
 * onda, con los extremos quietos. Pura y marcada como worklet: se evalúa en el hilo de UI en cada fotograma.
 */

/** Ondas completas que caben en el hilo. */
const ONDAS = 1.5;

/**
 * `n` puntos (25 por defecto) de x = `grosor` a `ancho − grosor`; y = alto/2 + A·sin(πs)·sin(2π·1,5·s − fase), con
 * A = alto/2 − grosor: así el trazo (con su grosor) nunca se sale del lienzo y `sin(πs)` deja quietos los extremos.
 * `fase` crece para que la onda fluya de izquierda a derecha; 2π es un periodo exacto.
 */
export function puntosOndaCarga(ancho: number, alto: number, grosor: number, fase: number, n = 25): { xs: number[]; ys: number[] } {
  'worklet';
  const xs: number[] = [];
  const ys: number[] = [];
  const medio = alto / 2;
  const amplitud = medio - grosor;
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    xs.push(grosor + (ancho - 2 * grosor) * s);
    ys.push(medio + amplitud * Math.sin(Math.PI * s) * Math.sin(2 * Math.PI * ONDAS * s - fase));
  }
  return { xs, ys };
}
