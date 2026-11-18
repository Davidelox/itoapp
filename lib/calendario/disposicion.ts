/**
 * Disposición de los glifos de un día en la celda del Mes (docs/plan-calendario-iconos.md): cuántos hay y cuánto
 * sitio hay decide su tamaño y dónde van. Los glifos NUNCA se tocan: entre dos cualesquiera queda al menos
 * `HUECO` px (se mide con la forma real, un cuadrado de esquinas redondeadas, que es lo más ancho que se dibuja:
 * la insignia es un círculo y cabe dentro). Para cada caso se busca el MAYOR tamaño (en px enteros) que cabe en la
 * zona libre de la celda sin tocarse y sin pegarse a los bordes. Pura y sin React para poder probarla; `CeldaDia`
 * solo pinta lo que sale de aquí. Medidas en px con el eje y hacia abajo.
 */

/** Un glifo: esquina superior izquierda y lado exterior. */
export type HuecoGlifo = { x: number; y: number; tamano: number };

export type Disposicion = {
  /** Caja que ocupa todo el bloque (glifos y «+N»); se centra en la zona libre de la celda. */
  ancho: number;
  alto: number;
  huecos: HuecoGlifo[];
  /** El «+N» pequeño a la derecha de los glifos (a todo el alto del bloque, centrado), o null si no hay. */
  mas: { x: number; ancho: number } | null;
};

/** Zona libre de la celda (bajo el número y las barras) donde se centra el bloque de glifos. */
export type Zona = { ancho: number; alto: number };

/** Separación mínima entre dos glifos. */
export const HUECO = 3;
/** Margen mínimo del bloque a los bordes de la zona (las líneas de la cuadrícula y el número del día). */
export const MARGEN = 2;
/** Con un solo glifo, el máximo: más grande que esto ya no gana nada y compite con el número. */
export const TAMANO_MAXIMO = 30;
/** Hueco del «+N» (cabe «+9»; «+10» o más se sale un poco por la derecha). */
export const ANCHO_MAS = 11;
/** Alto del «+N» cuando es lo único que hay en la celda. */
const ALTO_MAS = 12;
/** Esquina redondeada del pago respecto a su lado (la insignia es un círculo, que cabe dentro de esta forma). */
export const RADIO_CUADRADO = 0.28;

/** Zona de una celda de móvil estrecho (360 px de pantalla): 44 px de ancho. Alto: 84 − 30 del número − 1 de las barras. */
export const ZONA_MINIMA: Zona = { ancho: 44, alto: 53 };

/**
 * Distancia (en px) entre dos glifos: la que hay entre sus cuadrados de esquinas redondeadas. Es la distancia
 * entre los rectángulos interiores (el cuadrado sin las esquinas) menos los dos radios. Negativa si se tocan.
 */
export function separacion(a: HuecoGlifo, b: HuecoGlifo): number {
  const ra = a.tamano * RADIO_CUADRADO;
  const rb = b.tamano * RADIO_CUADRADO;
  // Rectángulos interiores [x + r, x + tamano − r]: el hueco entre ellos en cada eje (0 si se cruzan).
  const gx = Math.max(0, Math.max(a.x + ra, b.x + rb) - Math.min(a.x + a.tamano - ra, b.x + b.tamano - rb));
  const gy = Math.max(0, Math.max(a.y + ra, b.y + rb) - Math.min(a.y + a.tamano - ra, b.y + b.tamano - rb));
  return Math.hypot(gx, gy) - ra - rb;
}

type Bloque = { ancho: number; alto: number; huecos: HuecoGlifo[] };

/** Las formas posibles de colocar `n` glifos de lado `s` en un área de `aw` × `ah`, de la que se prefiere antes (empate) a la que se prefiere después. */
function candidatos(n: number, s: number, aw: number, ah: number): Bloque[] {
  const paso = s + HUECO;
  const hueco = (x: number, y: number): HuecoGlifo => ({ x, y, tamano: s });
  if (n === 1) return [{ ancho: s, alto: s, huecos: [hueco(0, 0)] }];
  if (n === 2) {
    return [
      { ancho: 2 * s + HUECO, alto: s, huecos: [hueco(0, 0), hueco(paso, 0)] },
      { ancho: s, alto: 2 * s + HUECO, huecos: [hueco(0, 0), hueco(0, paso)] },
      // Diagonal abierta a todo el área: arriba a la izquierda y abajo a la derecha.
      { ancho: aw, alto: ah, huecos: [hueco(0, 0), hueco(aw - s, ah - s)] },
    ];
  }
  if (n === 3) {
    return [
      // Dos arriba y uno centrado debajo.
      { ancho: 2 * s + HUECO, alto: 2 * s + HUECO, huecos: [hueco(0, 0), hueco(paso, 0), hueco(paso / 2, paso)] },
      // En zigzag: izquierda arriba, derecha en medio, izquierda abajo.
      { ancho: aw, alto: ah, huecos: [hueco(0, 0), hueco(aw - s, (ah - s) / 2), hueco(0, ah - s)] },
    ];
  }
  return [{ ancho: 2 * s + HUECO, alto: 2 * s + HUECO, huecos: [hueco(0, 0), hueco(paso, 0), hueco(0, paso), hueco(paso, paso)] }];
}

const sinTocarse = (huecos: HuecoGlifo[]) =>
  huecos.every((a, i) => huecos.slice(i + 1).every((b) => separacion(a, b) >= HUECO - 1e-9));

/** Ningún glifo con esquina negativa (las diagonales de un área de ancho o alto negativo colocarían glifos fuera). */
const dentro = (huecos: HuecoGlifo[]) => huecos.every((h) => h.x >= -1e-9 && h.y >= -1e-9);

/** Tamaño mínimo de los glifos; si ni a este tamaño caben, se usa igualmente (apretados) en vez de dejar la celda sin huecos. */
const TAMANO_MINIMO = 8;

/** Mayor disposición de `n` glifos (1 a 4) que cabe en `aw` × `ah` sin tocarse; null si ni a `TAMANO_MINIMO` px caben. */
function mejorBloque(n: number, aw: number, ah: number): Bloque | null {
  for (let s = TAMANO_MAXIMO; s >= TAMANO_MINIMO; s--) {
    const valido = candidatos(n, s, aw, ah).find((b) => b.ancho <= aw + 1e-9 && b.alto <= ah + 1e-9 && dentro(b.huecos) && sinTocarse(b.huecos));
    if (valido) return valido;
  }
  return null;
}

/**
 * `n`: glifos que se dibujan (0 a 4). `hayMas`: hay «+N» (más de 4 glifos o barras ocultas); entonces los glifos
 * se reducen y el «+N» va a la derecha, centrado en el alto. `zona`: el sitio libre de la celda (por defecto, el de
 * un móvil estrecho); el bloque deja `MARGEN` por cada lado y queda dentro de ella.
 */
export function disposicionGlifos(n: number, hayMas: boolean, zona: Zona = ZONA_MINIMA): Disposicion {
  const cuantos = Math.max(0, Math.min(4, Math.floor(n)));
  const aw = zona.ancho - 2 * MARGEN;
  const ah = zona.alto - 2 * MARGEN;
  if (cuantos === 0) {
    return hayMas ? { ancho: ANCHO_MAS, alto: ALTO_MAS, huecos: [], mas: { x: 0, ancho: ANCHO_MAS } } : { ancho: 0, alto: 0, huecos: [], mas: null };
  }
  // Con «+N» los glifos tienen menos ancho: el del «+N» y su separación.
  const reservado = hayMas ? ANCHO_MAS + HUECO : 0;
  // Si ni al tamaño mínimo caben sin tocarse (celda aún sin medir o pantalla muy estrecha), se usa igualmente el
  // diseño compacto a ese tamaño: queda apretado o desborda un poco, pero siempre hay un hueco por glifo.
  const b = mejorBloque(cuantos, aw - reservado, ah) ?? candidatos(cuantos, TAMANO_MINIMO, aw - reservado, ah)[0];
  if (!hayMas) return { ...b, mas: null };
  return { ancho: b.ancho + reservado, alto: b.alto, huecos: b.huecos, mas: { x: b.ancho + HUECO, ancho: ANCHO_MAS } };
}
