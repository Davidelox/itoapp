/**
 * El nudo simple del hilo, compartido por el botón que se anuda y por el hilo de saldar cuentas.
 */
import { type Punto, type Recorrido, trazoEntre } from './geometria';

/*
 * Nudo simple visto de frente, con el hilo flojo. Coordenadas en píxeles respecto al centro del
 * nudo. El hilo llega por la izquierda, sube y da la vuelta por arriba, baja cruzando su propia
 * entrada, pasa por debajo y sale por dentro del bucle hacia la derecha. Se cruza tres veces
 * (X1, X2 y X3), y por cada cruce pasa dos veces: una por encima y otra por debajo, alternando.
 */
const X1: Punto = [-9, 2];
const X2: Punto = [2, 2];
const X3: Punto = [12, -6];
export const NUDO_FLOJO: Punto[] = [
  [-24, 1.5],
  X1, // por encima
  X2, // por debajo
  [10, 0],
  X3, // por encima
  [6, -12],
  [-4, -12],
  [-11, -6],
  X1, // por debajo
  [-4, 8],
  X2, // por encima
  [7, -3],
  X3, // por debajo
  [22, -5],
  [34, -1],
];

/**
 * Índices que parten el recorrido en seis tramos, cortados entre cruce y cruce: los tramos pares
 * (0, 2, 4) pasan por encima y los impares por debajo. `antes` es el número de puntos del recorrido
 * que preceden a los de NUDO_FLOJO, y `marcas` las del recorrido muestreado con una curva por punto.
 */
export function cortesDelNudo(marcas: number[], antes: number, ultimo: number): number[] {
  const m = (punto: number) => marcas[antes + punto - 1]; // índice al llegar al punto dado del nudo
  return [0, (m(1) + m(2)) / 2, m(3), m(6), m(9), m(11), ultimo];
}

/** Índices del recorrido en los que el hilo entra en el nudo (primer cruce) y sale de él (último cruce). */
export function extremosDelNudo(marcas: number[], antes: number): [number, number] {
  return [marcas[antes], marcas[antes + 11]];
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
