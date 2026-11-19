/**
 * Deslizar la rejilla para cambiar de periodo (docs/plan-cabeceras-calendario.md §4): decide, al soltar el dedo, si
 * el gesto cuenta como «anterior», «siguiente» o «vuelve a su sitio». Es un worklet: corre en el hilo de UI.
 */

/** Cuántos px sale la rejilla al cambiar de periodo (y de dónde vuelve a entrar la nueva). */
export const DESPLAZAMIENTO_SALIDA = 56;

/** Distancia mínima (px) para cambiar sin velocidad: el 22 % del ancho, con un tope de 80. */
const DISTANCIA_MAXIMA = 80;
const FRACCION_ANCHO = 0.22;
/** Con un gesto rápido (*fling*) basta con esta distancia mínima… */
const DISTANCIA_FLING = 24;
/** …si la velocidad llega a esta (px/s). */
const VELOCIDAD_FLING = 500;
/** Por debajo de esta velocidad (px/s) un sentido contrario al soltar es ruido del dedo, no una vuelta atrás. */
const VELOCIDAD_CONTRARIA = 100;

/**
 * `dx`: lo que se ha arrastrado en horizontal (px, negativo hacia la izquierda); `vx`: velocidad al soltar (px/s);
 * `ancho`: ancho de la rejilla. Devuelve -1 (periodo anterior: se desliza hacia la derecha), 1 (siguiente: hacia la
 * izquierda) o 0 (no cambia). Cambia si se arrastra lo bastante o si es un *fling* (rápido y de al menos 24 px);
 * si al soltar el dedo va en sentido contrario al arrastre (se ha vuelto atrás), no cambia.
 */
export function decidirDeslizamiento(dx: number, vx: number, ancho: number): -1 | 0 | 1 {
  'worklet';
  const distancia = Math.abs(dx);
  const lejos = distancia >= Math.min(DISTANCIA_MAXIMA, ancho * FRACCION_ANCHO);
  const rapido = Math.abs(vx) >= VELOCIDAD_FLING && distancia >= DISTANCIA_FLING;
  if (!lejos && !rapido) return 0;
  if (dx * vx < 0 && Math.abs(vx) > VELOCIDAD_CONTRARIA) return 0;
  return dx < 0 ? 1 : -1;
}
