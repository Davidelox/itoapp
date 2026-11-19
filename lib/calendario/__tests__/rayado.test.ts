import { FRANJAS_INSIGNIA, franjasInsignia, rayadoCinta } from '@/lib/calendario/rayado';

describe('franjasInsignia', () => {
  it('son 4 (par y fijo) y alternan m1, m2, m1, m2 empezando por m1, con área y dos arcos de contorno', () => {
    const f = franjasInsignia(22);
    expect(f).toHaveLength(FRANJAS_INSIGNIA);
    expect(f.map((x) => x.color)).toEqual([0, 1, 0, 1]);
    for (const x of f) {
      expect(x.area.startsWith('M')).toBe(true);
      expect(x.area.endsWith('Z')).toBe(true);
      expect(x.arcos).toHaveLength(2);
    }
  });
  it('los extremos de cada trazado quedan dentro del círculo (contorno de 1 px dentro del tamaño exterior)', () => {
    for (const tamano of [12, 15, 22, 30]) {
      const c = tamano / 2;
      for (const fr of franjasInsignia(tamano)) {
        const nums = (fr.area.match(/-?\d+\.\d+/g) ?? []).map(Number);
        // Los pares (x, y) de los puntos están a ≤ c − 0.5 del centro; los radios del arco (r r) también valen c − 0.5.
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const [x, y] = [nums[i], nums[i + 1]];
          if (Math.abs(x - (c - 0.5)) < 1e-6 && Math.abs(y - (c - 0.5)) < 1e-6) continue; // el par de radios del arco
          expect(Math.hypot(x - c, y - c)).toBeLessThanOrEqual(c - 0.5 + 0.02);
        }
      }
    }
  });
  it('es siempre igual (mismo orden en los dos móviles)', () => {
    expect(franjasInsignia(18)).toEqual(franjasInsignia(18));
  });
});

describe('rayadoCinta', () => {
  it('alterna m1, m2 empezando por m1, cada franja con su paralelogramo a 45°', () => {
    const { franjas } = rayadoCinta(60, 8);
    expect(franjas.map((f) => f.color).slice(0, 4)).toEqual([0, 1, 0, 1]);
    for (const f of franjas) {
      const [[x0, y0], [x1, y1], , [x3, y3]] = f.puntos;
      expect(y0).toBe(0);
      expect(y1).toBe(0);
      expect(y3).toBe(8);
      expect(x0 - x3).toBe(8); // la parte de arriba va 8 px a la derecha de la de abajo: 45°
      expect(x1 - x0).toBe(8); // cada color ocupa el grosor de largo
    }
  });
  it('cubre todo el largo: la primera franja empieza antes del inicio y la última llega al final', () => {
    for (const largo of [8, 25, 100]) {
      const { franjas } = rayadoCinta(largo, 8);
      expect(Math.min(...franjas[0].puntos.map((p) => p[0]))).toBeLessThanOrEqual(0);
      const ultima = franjas[franjas.length - 1];
      expect(Math.max(...ultima.puntos.map((p) => p[0]))).toBeGreaterThan(largo);
      // Ninguna franja empieza más allá del final.
      expect(franjas.every((f) => Math.min(...f.puntos.map((p) => p[0])) < largo)).toBe(true);
    }
  });
  it('los tramos de contorno quedan dentro del largo', () => {
    for (const f of rayadoCinta(50, 8).franjas) {
      for (const lado of f.lados) for (const [x] of lado) expect(x >= 0 && x <= 50).toBe(true);
    }
  });
  it('el extremo de inicio es de m1; el de fin, el de la franja que lo toca', () => {
    expect(rayadoCinta(40, 8).colorIni).toBe(0);
    const r = rayadoCinta(40, 8);
    // A media altura, la franja k cubre x desde k·8 − 4: x = 39.99 → k = 5 (m2).
    expect(r.colorFin).toBe(1);
    expect(rayadoCinta(30, 8).colorFin).toBe(0); // (29.99 + 4) / 8 → k = 4 (m1)
  });
});
