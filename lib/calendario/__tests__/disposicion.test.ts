import { ANCHO_MAS, ALTO_MAS, HUECO, MARGEN, TAMANO_MAXIMO, ZONA_MINIMA, type Zona, disposicionGlifos } from '@/lib/calendario/disposicion';

/** Zonas de una celda del Mes: móvil estrecho (360 px), 375, ~51 px y un móvil grande; alto de la zona con ALTO_CELDA = 54. */
const ZONAS: Zona[] = [ZONA_MINIMA, { ancho: 46, alto: 31 }, { ancho: 51, alto: 31 }, { ancho: 54, alto: 31 }];

describe('disposicionGlifos', () => {
  it('sin glifos no hay nada; solo «+N» ocupa su caja', () => {
    expect(disposicionGlifos(0, false)).toEqual({ ancho: 0, alto: 0, huecos: [], mas: null });
    expect(disposicionGlifos(0, true)).toMatchObject({ huecos: [], mas: { x: 0, y: 0, ancho: ANCHO_MAS, alto: ALTO_MAS } });
  });

  it('un glifo: el mayor que cabe, con tope', () => {
    for (const z of ZONAS) {
      const d = disposicionGlifos(1, false, z);
      expect(d.huecos).toHaveLength(1);
      expect(d.huecos[0].tamano).toBe(Math.min(TAMANO_MAXIMO, z.alto - 2 * MARGEN, z.ancho - 2 * MARGEN));
    }
  });

  it('dos glifos: en fila, sin tocarse y dentro de la zona', () => {
    for (const z of ZONAS) {
      const d = disposicionGlifos(2, false, z);
      const [a, b] = d.huecos;
      expect(a.tamano).toBe(b.tamano);
      expect(b.x - (a.x + a.tamano)).toBeGreaterThanOrEqual(HUECO);
      expect(a.y).toBe(b.y);
      expect(d.ancho).toBeLessThanOrEqual(z.ancho - 2 * MARGEN);
      expect(d.alto).toBeLessThanOrEqual(z.alto - 2 * MARGEN);
      expect(d.mas).toBeNull();
    }
    expect(disposicionGlifos(2, false, { ancho: 46, alto: 31 }).huecos.map((h) => h.tamano)).toEqual([19, 19]);
  });

  it('dos glifos y «+N»: el «+N» va debajo, sin tocar los glifos, y entra en la zona', () => {
    for (const z of ZONAS) {
      const d = disposicionGlifos(2, true, z);
      const [a] = d.huecos;
      expect(d.mas).not.toBeNull();
      expect(d.mas!.y).toBeGreaterThanOrEqual(a.y + a.tamano);
      expect(d.ancho).toBeLessThanOrEqual(z.ancho - 2 * MARGEN);
      expect(d.alto).toBeLessThanOrEqual(z.alto - 2 * MARGEN);
      expect(a.tamano).toBeLessThan(disposicionGlifos(2, false, z).huecos[0].tamano);
    }
  });

  it('un glifo y «+N»: el «+N» va a la derecha del glifo', () => {
    for (const z of ZONAS) {
      const d = disposicionGlifos(1, true, z);
      expect(d.mas!.x).toBeGreaterThanOrEqual(d.huecos[0].x + d.huecos[0].tamano + HUECO);
      expect(d.ancho).toBeLessThanOrEqual(z.ancho - 2 * MARGEN);
    }
  });

  it('más de 2 se recorta a 2; ni en una zona diminuta se queda sin huecos', () => {
    expect(disposicionGlifos(9, true)).toEqual(disposicionGlifos(2, true));
    expect(disposicionGlifos(2, true, { ancho: 10, alto: 10 }).huecos).toHaveLength(2);
  });

  it('por defecto usa la zona de un móvil estrecho', () => {
    expect(disposicionGlifos(2, false)).toEqual(disposicionGlifos(2, false, ZONA_MINIMA));
  });
});
