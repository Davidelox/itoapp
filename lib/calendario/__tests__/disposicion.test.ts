import {
  ANCHO_MAS,
  HUECO,
  MARGEN,
  TAMANO_MAXIMO,
  ZONA_MINIMA,
  type Disposicion,
  type Zona,
  disposicionGlifos,
  separacion,
} from '@/lib/calendario/disposicion';

/** Zonas de una celda del Mes: móvil estrecho (360 px), 375, ~51 px (el de David) y un móvil grande; alto de la zona con ALTO_CELDA = 84. */
const ZONAS: Zona[] = [ZONA_MINIMA, { ancho: 46, alto: 53 }, { ancho: 51, alto: 53 }, { ancho: 54, alto: 53 }];

const tamanos = (d: Disposicion) => d.huecos.map((h) => h.tamano);

/** Todas las parejas de glifos están a `HUECO` px o más (medido con su forma real, no con la caja). */
function sinTocarse(d: Disposicion): boolean {
  return d.huecos.every((a, i) => d.huecos.slice(i + 1).every((b) => separacion(a, b) >= HUECO - 1e-9));
}

describe('separacion', () => {
  it('en línea, es el hueco entre las cajas; en diagonal, menos (las esquinas están redondeadas)', () => {
    expect(separacion({ x: 0, y: 0, tamano: 20 }, { x: 23, y: 0, tamano: 20 })).toBeCloseTo(3);
    expect(separacion({ x: 0, y: 0, tamano: 20 }, { x: 0, y: 25, tamano: 20 })).toBeCloseTo(5);
    // Las cajas no se cruzan en ningún eje, pero las esquinas redondeadas dejan más hueco que la caja.
    const diagonal = separacion({ x: 0, y: 0, tamano: 20 }, { x: 22, y: 22, tamano: 20 });
    expect(diagonal).toBeGreaterThan(Math.hypot(2, 2));
  });
  it('negativa si se tocan o se solapan', () => {
    expect(separacion({ x: 0, y: 0, tamano: 20 }, { x: 10, y: 10, tamano: 20 })).toBeLessThan(0);
    expect(separacion({ x: 0, y: 0, tamano: 20 }, { x: 20, y: 0, tamano: 20 })).toBeCloseTo(0);
  });
});

describe('disposicionGlifos', () => {
  it('sin glifos no hay nada', () => {
    expect(disposicionGlifos(0, false)).toEqual({ ancho: 0, alto: 0, huecos: [], mas: null });
  });

  it('1 glifo: el más grande, centrado en el bloque', () => {
    for (const z of ZONAS) {
      const d = disposicionGlifos(1, false, z);
      expect(d.huecos).toEqual([{ x: 0, y: 0, tamano: TAMANO_MAXIMO }]);
      expect(d).toMatchObject({ ancho: TAMANO_MAXIMO, alto: TAMANO_MAXIMO, mas: null });
    }
  });

  it('2 glifos: separados, sin solaparse, y más pequeños que uno solo', () => {
    for (const z of ZONAS) {
      const d = disposicionGlifos(2, false, z);
      expect(d.huecos).toHaveLength(2);
      expect(sinTocarse(d)).toBe(true);
      expect(d.huecos[0].tamano).toBeLessThan(TAMANO_MAXIMO);
      expect(d.huecos[0].tamano).toBeGreaterThanOrEqual(21);
    }
  });

  it('3 glifos: sin tocarse; dos arriba y uno centrado debajo, o en zigzag en una celda estrecha donde así caben mayores', () => {
    for (const z of ZONAS) {
      const d = disposicionGlifos(3, false, z);
      expect(sinTocarse(d)).toBe(true);
      expect(d.huecos[0].tamano).toBeGreaterThanOrEqual(18);
    }
    const [a, b, c] = disposicionGlifos(3, false, { ancho: 51, alto: 53 }).huecos;
    expect(a.y).toBe(b.y);
    expect(c.y).toBeGreaterThanOrEqual(a.y + a.tamano + HUECO);
    expect(c.x + c.tamano / 2).toBeCloseTo((a.x + b.x + b.tamano) / 2);
    // En 44 px de ancho el zigzag (izquierda, derecha, izquierda) gana al triángulo.
    const [p, q, r] = disposicionGlifos(3, false, ZONA_MINIMA).huecos;
    expect(p.tamano).toBe(19);
    expect(q.x).toBeGreaterThan(p.x);
    expect(r.x).toBe(p.x);
    expect(r.y).toBeGreaterThan(q.y);
  });

  it('4 glifos: 2 × 2 sin «+N» y sin tocarse', () => {
    for (const z of ZONAS) {
      const d = disposicionGlifos(4, false, z);
      const [a, b, c, e] = d.huecos;
      expect(d.huecos).toHaveLength(4);
      expect(d.mas).toBeNull();
      expect(sinTocarse(d)).toBe(true);
      expect(a.y).toBe(b.y);
      expect(c.y).toBe(e.y);
      expect(a.x).toBe(c.x);
      expect(b.x - a.x).toBe(a.tamano + HUECO);
      expect(a.tamano).toBeGreaterThanOrEqual(18);
    }
  });

  it('el tamaño crece con la celda, y con una más ancha y alta caben glifos mayores', () => {
    for (const n of [2, 3, 4]) {
      const anchos = ZONAS.map((z) => disposicionGlifos(n, false, z).huecos[0].tamano);
      expect([...anchos].sort((a, b) => a - b)).toEqual(anchos);
    }
    // En la celda de ~51 px: 22 px con 3 o 4, y 25 con 2.
    expect(tamanos(disposicionGlifos(4, false, { ancho: 51, alto: 53 }))).toEqual([22, 22, 22, 22]);
    expect(tamanos(disposicionGlifos(3, false, { ancho: 51, alto: 53 }))).toEqual([22, 22, 22]);
    expect(tamanos(disposicionGlifos(2, false, { ancho: 51, alto: 53 }))).toEqual([25, 25]);
  });

  it('no se pueden hacer más grandes: con un píxel más tocarían a otro o se saldrían del área', () => {
    // Un glifo de más (no entero) ya no cabe: la 2 × 2 de lado s + 1 ocupa 2·(s + 1) + HUECO.
    for (const z of ZONAS) {
      const d = disposicionGlifos(4, false, z);
      const s = d.huecos[0].tamano;
      const area = { ancho: z.ancho - 2 * MARGEN, alto: z.alto - 2 * MARGEN };
      expect(2 * s + HUECO).toBeLessThanOrEqual(Math.min(area.ancho, area.alto));
      expect(2 * (s + 1) + HUECO).toBeGreaterThan(Math.min(area.ancho, area.alto));
    }
  });

  it('con «+N»: los 4 glifos, separados, y el «+N» a la derecha sin tocar ninguno', () => {
    for (const z of ZONAS) {
      const d = disposicionGlifos(4, true, z);
      expect(d.huecos).toHaveLength(4);
      expect(sinTocarse(d)).toBe(true);
      expect(d.mas!.ancho).toBe(ANCHO_MAS);
      const ultimoX = Math.max(...d.huecos.map((h) => h.x + h.tamano));
      expect(d.mas!.x).toBeGreaterThanOrEqual(ultimoX + HUECO);
      expect(d.ancho).toBe(d.mas!.x + ANCHO_MAS);
      // Más pequeños que sin «+N», porque comparten el ancho.
      expect(d.huecos[0].tamano).toBeLessThan(disposicionGlifos(4, false, z).huecos[0].tamano);
    }
  });

  it('«+N» solo, o con pocos glifos (barras ocultas)', () => {
    expect(disposicionGlifos(0, true)).toMatchObject({ huecos: [], mas: { x: 0, ancho: ANCHO_MAS }, ancho: ANCHO_MAS });
    for (const n of [1, 2, 3]) {
      const d = disposicionGlifos(n, true);
      expect(d.huecos).toHaveLength(n);
      expect(sinTocarse(d)).toBe(true);
      const ultimoX = Math.max(...d.huecos.map((h) => h.x + h.tamano));
      expect(d.mas!.x).toBeGreaterThanOrEqual(ultimoX + HUECO);
    }
  });

  it('todos los casos caben en la zona con margen a los bordes, y los huecos dentro del bloque', () => {
    for (const z of ZONAS) {
      for (const hayMas of [false, true]) {
        for (let n = 0; n <= 4; n++) {
          const d = disposicionGlifos(n, hayMas, z);
          expect(d.ancho).toBeLessThanOrEqual(z.ancho - 2 * MARGEN);
          expect(d.alto).toBeLessThanOrEqual(z.alto - 2 * MARGEN);
          for (const h of d.huecos) {
            expect(h.x).toBeGreaterThanOrEqual(0);
            expect(h.y).toBeGreaterThanOrEqual(0);
            expect(h.x + h.tamano).toBeLessThanOrEqual(d.ancho + 1e-9);
            expect(h.y + h.tamano).toBeLessThanOrEqual(d.alto + 1e-9);
          }
          expect(sinTocarse(d)).toBe(true);
        }
      }
    }
  });

  it('más de 4 se trata como 4; por defecto, la zona de un móvil estrecho', () => {
    expect(disposicionGlifos(9, true)).toEqual(disposicionGlifos(4, true));
    expect(disposicionGlifos(3, false)).toEqual(disposicionGlifos(3, false, ZONA_MINIMA));
  });

  it('en zonas muy estrechas (sin medir o pantallas minúsculas) siempre hay un hueco por glifo, con valores finitos', () => {
    for (const ancho of [0, 10, 20, 30, 36, 44, 51]) {
      for (const hayMas of [false, true]) {
        for (let n = 0; n <= 4; n++) {
          const d = disposicionGlifos(n, hayMas, { ancho, alto: 53 });
          expect(d.huecos).toHaveLength(n);
          for (const h of d.huecos) {
            expect(Number.isFinite(h.x)).toBe(true);
            expect(Number.isFinite(h.y)).toBe(true);
            expect(Number.isFinite(h.tamano)).toBe(true);
            expect(h.x).toBeGreaterThanOrEqual(0);
            expect(h.y).toBeGreaterThanOrEqual(0);
            expect(h.tamano).toBeGreaterThan(0);
          }
          expect(Number.isFinite(d.ancho)).toBe(true);
          expect(Number.isFinite(d.alto)).toBe(true);
        }
      }
    }
  });
});
