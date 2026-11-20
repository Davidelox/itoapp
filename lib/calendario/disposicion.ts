/**
 * Disposición de los glifos de un día en la celda del Mes (docs/plan-calendario-iconos.md): como mucho 2 glifos
 * (en una fila) y, si hay más cosas, un «+N» pequeño: a la derecha si solo hay un glifo, debajo si hay dos. Los
 * glifos NUNCA se tocan: entre dos queda al menos `HUECO` px. Para cada caso se busca el MAYOR tamaño (en px
 * enteros) que cabe en la zona libre de la celda. Pura y sin React para poder probarla; `CeldaDia` solo pinta lo
 * que sale de aquí. Medidas en px con el eje y hacia abajo.
 */

/** Un glifo: esquina superior izquierda y lado exterior. */
export type HuecoGlifo = { x: number; y: number; tamano: number };

export type Disposicion = {
  /** Caja que ocupa todo el bloque (glifos y «+N»); se centra en la zona libre de la celda. */
  ancho: number;
  alto: number;
  huecos: HuecoGlifo[];
  /** Caja del «+N» (el texto va centrado en ella), o null si no hay. */
  mas: { x: number; y: number; ancho: number; alto: number } | null;
};

/** Zona libre de la celda (bajo el número y las barras) donde se centra el bloque de glifos. */
export type Zona = { ancho: number; alto: number };

/** Separación mínima entre dos glifos (y entre los glifos y el «+N»). */
export const HUECO = 3;
/** Margen mínimo del bloque a los bordes de la zona (las líneas de la cuadrícula y el número del día). */
export const MARGEN = 2;
/** Con un solo glifo, el máximo: más grande que esto ya no gana nada y compite con el número. */
export const TAMANO_MAXIMO = 24;
/** Ancho del «+N» a la derecha de un glifo (cabe «+9»; «+10» o más se sale un poco). */
export const ANCHO_MAS = 11;
/** Alto del «+N» (debajo de dos glifos, o solo en la celda). */
export const ALTO_MAS = 10;

/** Esquina redondeada del pago respecto a su lado (la insignia es un círculo, que cabe dentro de esta forma). */
export const RADIO_CUADRADO = 0.28;

/** Zona de una celda de móvil estrecho (360 px de pantalla): 44 px de ancho. Alto: 54 − 22 del número − 1 de las barras. */
export const ZONA_MINIMA: Zona = { ancho: 44, alto: 31 };

/** Tamaño mínimo de los glifos; si ni a este tamaño caben, se usa igualmente (apretados) en vez de dejar la celda sin huecos. */
const TAMANO_MINIMO = 8;

type Bloque = Disposicion;

/** El bloque de `n` (1 o 2) glifos de lado `s`, con su «+N» si `hayMas`. */
function bloque(n: 1 | 2, s: number, hayMas: boolean): Bloque {
  const huecos: HuecoGlifo[] = n === 1 ? [{ x: 0, y: 0, tamano: s }] : [{ x: 0, y: 0, tamano: s }, { x: s + HUECO, y: 0, tamano: s }];
  const ancho = n * s + (n - 1) * HUECO;
  if (!hayMas) return { ancho, alto: s, huecos, mas: null };
  if (n === 1) return { ancho: ancho + HUECO + ANCHO_MAS, alto: s, huecos, mas: { x: s + HUECO, y: 0, ancho: ANCHO_MAS, alto: s } };
  return { ancho, alto: s + 1 + ALTO_MAS, huecos, mas: { x: 0, y: s + 1, ancho, alto: ALTO_MAS } };
}

/**
 * `n`: glifos que se dibujan (0 a 2). `hayMas`: hay «+N». `zona`: el sitio libre de la celda (por defecto, el de un
 * móvil estrecho); el bloque deja `MARGEN` por cada lado y queda dentro de ella.
 */
export function disposicionGlifos(n: number, hayMas: boolean, zona: Zona = ZONA_MINIMA): Disposicion {
  const cuantos = Math.max(0, Math.min(2, Math.floor(n))) as 0 | 1 | 2;
  if (cuantos === 0) {
    return hayMas ? { ancho: ANCHO_MAS, alto: ALTO_MAS, huecos: [], mas: { x: 0, y: 0, ancho: ANCHO_MAS, alto: ALTO_MAS } } : { ancho: 0, alto: 0, huecos: [], mas: null };
  }
  const aw = zona.ancho - 2 * MARGEN;
  const ah = zona.alto - 2 * MARGEN;
  for (let s = TAMANO_MAXIMO; s > TAMANO_MINIMO; s--) {
    const b = bloque(cuantos, s, hayMas);
    if (b.ancho <= aw && b.alto <= ah) return b;
  }
  // Ni al tamaño mínimo caben (celda aún sin medir o pantalla muy estrecha): apretados, pero siempre hay un hueco por glifo.
  return bloque(cuantos, TAMANO_MINIMO, hayMas);
}
