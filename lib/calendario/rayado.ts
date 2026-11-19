/**
 * Geometría del RAYADO de lo que es de los dos (docs/plan-calendario-iconos.md): franjas que alternan el color de
 * m1 y el de m2 (m1, m2, m1, m2…, siempre empezando por m1 para que los dos móviles se vean igual). Pura y sin
 * React para poder probarla; `Marcador` y `Cinta` solo pintan lo que sale de aquí. Cada franja lleva el índice de
 * color (0 = m1, 1 = m2) y, para el contorno de 1 px por tramos, los trozos de borde que le tocan (así el contorno
 * de cada tramo es el tono oscuro de SU persona).
 */

/** Franjas de la insignia (par y fijo: a 15 px cada una mide ~4 px y se leen). */
export const FRANJAS_INSIGNIA = 4;

/** Una franja de la insignia: su relleno (ya recortado al círculo) y los dos arcos de borde que le tocan. */
export type FranjaInsignia = { color: 0 | 1; area: string; arcos: [string, string] };

const f = (n: number) => n.toFixed(2);

/**
 * Franjas de una insignia circular de lado exterior `tamano` (el contorno de 1 px queda dentro). Van a 45°
 * (como «/»), la primera (m1) arriba a la izquierda. Cada franja es la parte del círculo entre dos rectas
 * paralelas, así que el recorte al círculo sale en el propio trazado (dos arcos y dos rectas) sin `ClipPath`.
 */
export function franjasInsignia(tamano: number, n: number = FRANJAS_INSIGNIA): FranjaInsignia[] {
  const c = tamano / 2;
  const r = c - 0.5;
  const cos = Math.SQRT1_2;
  const sen = Math.SQRT1_2;
  // (u, v) = coordenadas con las franjas verticales; se giran 45° alrededor del centro.
  const P = (u: number, v: number) => `${f(c + u * cos - v * sen)} ${f(c + u * sen + v * cos)}`;
  const h = (u: number) => Math.sqrt(Math.max(0, r * r - u * u));
  const ancho = (2 * r) / n;
  return Array.from({ length: n }, (_, i) => {
    const u0 = -r + i * ancho;
    const u1 = i === n - 1 ? r : u0 + ancho;
    const arriba = `M${P(u0, -h(u0))} A${f(r)} ${f(r)} 0 0 1 ${P(u1, -h(u1))}`;
    const abajo = `M${P(u1, h(u1))} A${f(r)} ${f(r)} 0 0 1 ${P(u0, h(u0))}`;
    return {
      color: (i % 2) as 0 | 1,
      area: `${arriba} L${P(u1, h(u1))} A${f(r)} ${f(r)} 0 0 1 ${P(u0, h(u0))} Z`,
      arcos: [arriba, abajo],
    };
  });
}

/** Una franja de una barra, en el sistema «largo × grosor» (x a lo largo, y a lo ancho). */
export type FranjaCinta = {
  color: 0 | 1;
  /** Paralelogramo a 45° (cuatro vértices [x, y]). */
  puntos: [number, number][];
  /** Tramos de contorno de los dos lados largos (y = 0.5 y y = grosor − 0.5), ya recortados al largo; null si no cae dentro. */
  lados: [number, number][][];
};

/** Las franjas de una barra de `largo` × `grosor` y el color de la franja que toca cada extremo. */
export type RayadoCinta = { franjas: FranjaCinta[]; colorIni: 0 | 1; colorFin: 0 | 1 };

/**
 * Franjas pequeñas repetidas a lo largo de una barra: cada color ocupa `grosor` px de largo y se inclina 45°
 * (como «/»), empezando por m1 en el extremo de inicio. La barra se recorta después (esquinas redondeadas).
 */
export function rayadoCinta(largo: number, grosor: number): RayadoCinta {
  const w = grosor;
  const t = grosor;
  const franjas: FranjaCinta[] = [];
  for (let k = 0; ; k++) {
    const a = k * w - t; // x donde la franja toca el lado de abajo; arriba está desplazada +t
    if (a >= largo) break;
    const lado = (x0: number, x1: number, y: number): [number, number][] =>
      Math.min(x1, largo) > Math.max(x0, 0) ? [[Math.max(x0, 0), y], [Math.min(x1, largo), y]] : [];
    franjas.push({
      color: (k % 2) as 0 | 1,
      puntos: [
        [a + t, 0],
        [a + t + w, 0],
        [a + w, t],
        [a, t],
      ],
      lados: [lado(a + t, a + t + w, 0.5), lado(a, a + w, t - 0.5)],
    });
  }
  // A media altura, la franja k cubre x desde k·w − t/2.
  const colorEn = (x: number) => (Math.floor((x + t / 2) / w) % 2) as 0 | 1;
  return { franjas, colorIni: colorEn(0), colorFin: colorEn(Math.max(0, largo - 0.01)) };
}
