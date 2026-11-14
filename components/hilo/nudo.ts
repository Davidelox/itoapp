/**
 * El nudo simple del hilo, compartido por el botón que se anuda y por el hilo de saldar cuentas.
 */
import { type Punto, type Recorrido, trazoEntre } from './geometria';

/*
 * Nudo simple visto de frente, con el hilo flojo. Coordenadas en píxeles respecto al centro del
 * nudo. El hilo llega por la izquierda, da la vuelta por arriba en un lazo redondo, baja cruzando
 * su propia entrada, hace una U por debajo y sale por dentro del lazo hacia la derecha. Se cruza
 * tres veces (X1, X2 y X3), y por cada cruce pasa dos veces: una por encima y otra por debajo.
 * Los puntos CORTE_* caen entre cruce y cruce: ahí se parte el hilo en tramos (ver cortesDelNudo).
 */
const X1: Punto = [-9, 2];
const X2: Punto = [4, 2];
const X3: Punto = [13, -6];
const CORTE_B: Punto = [11.5, -0.5];
const CORTE_C: Punto = [0, -15.5];
const CORTE_D: Punto = [-2.5, 11];
const CORTE_E: Punto = [8.5, -2.5];
export const NUDO_FLOJO: Punto[] = [
  [-24, 1.5],
  X1, // por encima
  X2, // por debajo
  CORTE_B,
  X3, // por encima
  [9.5, -12.5],
  CORTE_C,
  [-9.5, -12.5],
  [-13, -6],
  X1, // por debajo
  [-8, 8],
  CORTE_D,
  [3.5, 8],
  X2, // por encima
  CORTE_E,
  X3, // por debajo
  [23, -6.5],
  [35, -1],
];

const PRIMER_CRUCE = NUDO_FLOJO.indexOf(X1);
const SEGUNDO_CRUCE = NUDO_FLOJO.indexOf(X2);
const ULTIMO_CRUCE = NUDO_FLOJO.lastIndexOf(X3);
const CORTES = [CORTE_B, CORTE_C, CORTE_D, CORTE_E].map((p) => NUDO_FLOJO.indexOf(p));

/**
 * Índices que parten el recorrido en seis tramos, cortados entre cruce y cruce: los tramos pares
 * (0, 2, 4) pasan por encima y los impares por debajo. `antes` es el número de puntos del recorrido
 * que preceden a los de NUDO_FLOJO, y `marcas` las del recorrido muestreado con una curva por punto.
 */
export function cortesDelNudo(marcas: number[], antes: number, ultimo: number): number[] {
  // marcas[k] es el índice en el que el hilo llega al punto k + 1 del recorrido.
  const en = (punto: number) => marcas[antes + punto - 1];
  return [0, (en(PRIMER_CRUCE) + en(SEGUNDO_CRUCE)) / 2, ...CORTES.map(en), ultimo];
}

/** Índices del recorrido en los que el hilo entra en el nudo (primer cruce) y sale de él (último cruce). */
export function extremosDelNudo(marcas: number[], antes: number): [number, number] {
  return [marcas[antes + PRIMER_CRUCE - 1], marcas[antes + ULTIMO_CRUCE - 1]];
}

/** Atributo `d` con los tramos visibles de una capa: paridad 0 = los que pasan por encima; 1 = por debajo. */
export function tramosVisibles(
  recorrido: Recorrido,
  cortes: number[],
  holgura: number,
  cola: number,
  cabeza: number,
  paridad: number,
): string {
  'worklet';
  let d = '';
  for (let k = paridad; k < cortes.length - 1; k += 2) {
    d += trazoEntre(recorrido, holgura, Math.max(cortes[k], cola), Math.min(cortes[k + 1], cabeza));
  }
  return d;
}
