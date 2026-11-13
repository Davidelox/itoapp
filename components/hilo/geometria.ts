/**
 * Geometría del hilo físico: un recorrido se define dos veces con la misma estructura de curvas,
 * una con el hilo tenso y otra con el hilo flojo (con holgura). Las dos se muestrean en los mismos
 * puntos, de modo que en cada fotograma basta interpolar entre ambas para tensar o aflojar el hilo.
 */

export type Punto = readonly [number, number];
/** Curva de Bézier cúbica: inicio, dos puntos de control y final. */
export type Cubica = readonly [Punto, Punto, Punto, Punto];

export type Recorrido = {
  /** Puntos del hilo tenso, separados `paso` píxeles a lo largo del hilo. */
  tx: number[];
  ty: number[];
  /** Los mismos puntos con el hilo flojo. */
  lx: number[];
  ly: number[];
  /** Distancia entre puntos consecutivos, medida sobre el hilo tenso. */
  paso: number;
  longitud: number;
  /** Índice (con decimales) en el que termina cada curva del recorrido. */
  marcas: number[];
};

const SUBPASOS = 48;

function evaluar(c: Cubica, t: number): Punto {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return [
    a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0],
    a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1],
  ];
}

/**
 * Muestrea el recorrido a distancias iguales sobre el hilo tenso. `tenso` y `flojo` deben tener
 * el mismo número de curvas y cada curva empezar donde acaba la anterior.
 */
export function muestrearRecorrido(tenso: Cubica[], flojo: Cubica[], pasoDeseado: number): Recorrido {
  // Tabla de longitudes acumuladas del hilo tenso.
  const acumulada: number[] = [0];
  const finDeCurva: number[] = [];
  let total = 0;
  for (const curva of tenso) {
    let previo = curva[0];
    for (let s = 1; s <= SUBPASOS; s++) {
      const p = evaluar(curva, s / SUBPASOS);
      total += Math.hypot(p[0] - previo[0], p[1] - previo[1]);
      acumulada.push(total);
      previo = p;
    }
    finDeCurva.push(total);
  }

  const n = Math.max(2, Math.round(total / pasoDeseado));
  const recorrido: Recorrido = {
    tx: [],
    ty: [],
    lx: [],
    ly: [],
    paso: total / n,
    longitud: total,
    marcas: finDeCurva.map((l) => (l / total) * n),
  };

  let k = 0; // tramo de la tabla en el que cae el punto actual
  const ultimo = acumulada.length - 2;
  for (let i = 0; i <= n; i++) {
    const objetivo = (i / n) * total;
    while (k < ultimo && acumulada[k + 1] < objetivo) k++;
    const tramo = acumulada[k + 1] - acumulada[k];
    const resto = tramo > 0 ? Math.min(1, (objetivo - acumulada[k]) / tramo) : 0;
    const curva = Math.min(tenso.length - 1, Math.floor(k / SUBPASOS));
    const t = (k - curva * SUBPASOS + resto) / SUBPASOS;
    const pt = evaluar(tenso[curva], t);
    const pl = evaluar(flojo[curva], t);
    recorrido.tx.push(pt[0]);
    recorrido.ty.push(pt[1]);
    recorrido.lx.push(pl[0]);
    recorrido.ly.push(pl[1]);
  }
  return recorrido;
}

/** Atributo `d` de un tramo sin nada que dibujar (fuera de la vista). */
export const TRAZO_VACIO = 'M-99 -99';

/**
 * Atributo `d` del tramo del hilo entre los índices `desde` y `hasta` (admiten decimales).
 * `holgura`: 0 = tenso, 1 = flojo; valores algo fuera de ese rango dan el rebote de la tensión.
 * Los puntos se unen con curvas suaves, así que el hilo no muestra quiebros.
 */
export function trazoEntre(r: Recorrido, holgura: number, desde: number, hasta: number): string {
  'worklet';
  const n = r.tx.length - 1;
  const a = Math.min(Math.max(desde, 0), n);
  const b = Math.min(Math.max(hasta, 0), n);
  if (b - a < 0.01) return TRAZO_VACIO;

  const { tx, ty, lx, ly } = r;
  const px = (i: number) => tx[i] + (lx[i] - tx[i]) * holgura;
  const py = (i: number) => ty[i] + (ly[i] - ty[i]) * holgura;
  const fx = (v: number) => {
    const i = Math.min(Math.floor(v), n - 1);
    return px(i) + (px(i + 1) - px(i)) * (v - i);
  };
  const fy = (v: number) => {
    const i = Math.min(Math.floor(v), n - 1);
    return py(i) + (py(i + 1) - py(i)) * (v - i);
  };
  const r1 = (v: number) => Math.round(v * 10) / 10;

  let d = 'M' + r1(fx(a)) + ' ' + r1(fy(a));
  const primero = Math.floor(a) + 1;
  const ultimo = Math.ceil(b) - 1;
  for (let i = primero; i <= ultimo; i++) {
    const x = px(i);
    const y = py(i);
    // Cada punto hace de control y la curva termina a medio camino del siguiente.
    const finX = i < ultimo ? (x + px(i + 1)) / 2 : fx(b);
    const finY = i < ultimo ? (y + py(i + 1)) / 2 : fy(b);
    d += 'Q' + r1(x) + ' ' + r1(y) + ' ' + r1(finX) + ' ' + r1(finY);
  }
  if (ultimo < primero) d += 'L' + r1(fx(b)) + ' ' + r1(fy(b));
  return d;
}

/** Muelle amortiguado que va de 1 a 0 (con un ligero rebote si `amortiguacion` < 1). `t` en segundos. */
export function muelle(t: number, frecuencia: number, amortiguacion: number): number {
  'worklet';
  if (t <= 0) return 1;
  const w = frecuencia * Math.sqrt(1 - amortiguacion * amortiguacion);
  const caida = Math.exp(-amortiguacion * frecuencia * t);
  return caida * (Math.cos(w * t) + ((amortiguacion * frecuencia) / w) * Math.sin(w * t));
}

/** Interpolación de Hermite entre dos valores con velocidades de entrada y salida (en unidades por tramo). */
export function hermite(u: number, p0: number, p1: number, m0: number, m1: number): number {
  'worklet';
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

/** Suavizado 0-1 con arranque y llegada suaves. */
export function suave(u: number): number {
  'worklet';
  const x = Math.min(Math.max(u, 0), 1);
  return x * x * (3 - 2 * x);
}

/**
 * Atributo `d` de una curva suave que pasa junto a los puntos dados (mismas uniones que `trazoEntre`).
 * `n` es el número de puntos válidos de los arrays.
 */
export function trazoDePuntos(xs: number[], ys: number[], n: number): string {
  'worklet';
  if (n < 2) return TRAZO_VACIO;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  let d = 'M' + r1(xs[0]) + ' ' + r1(ys[0]);
  for (let i = 1; i < n - 1; i++) {
    const finX = i < n - 2 ? (xs[i] + xs[i + 1]) / 2 : xs[n - 1];
    const finY = i < n - 2 ? (ys[i] + ys[i + 1]) / 2 : ys[n - 1];
    d += 'Q' + r1(xs[i]) + ' ' + r1(ys[i]) + ' ' + r1(finX) + ' ' + r1(finY);
  }
  if (n === 2) d += 'L' + r1(xs[1]) + ' ' + r1(ys[1]);
  return d;
}
