import { puntosOndaCarga } from '@/components/hilo/ondaCarga';

describe('puntosOndaCarga', () => {
  const ancho = 52;
  const alto = 22;
  const grosor = 3;

  it('da 25 puntos por defecto y los que se pidan', () => {
    const { xs, ys } = puntosOndaCarga(ancho, alto, grosor, 0);
    expect(xs).toHaveLength(25);
    expect(ys).toHaveLength(25);
    expect(puntosOndaCarga(ancho, alto, grosor, 0, 33).xs).toHaveLength(33);
  });
  it('los extremos están quietos, a media altura, sea cual sea la fase', () => {
    for (const fase of [0, 1, 2.5, Math.PI, 5]) {
      const { ys } = puntosOndaCarga(ancho, alto, grosor, fase);
      expect(ys[0]).toBeCloseTo(alto / 2, 9);
      expect(ys[ys.length - 1]).toBeCloseTo(alto / 2, 9);
    }
  });
  it('todo queda dentro de [grosor, alto − grosor]', () => {
    for (let k = 0; k < 40; k++) {
      const { ys } = puntosOndaCarga(ancho, alto, grosor, (k / 40) * 2 * Math.PI);
      for (const y of ys) {
        expect(y).toBeGreaterThanOrEqual(grosor - 1e-9);
        expect(y).toBeLessThanOrEqual(alto - grosor + 1e-9);
      }
    }
  });
  it('la fase y la fase + 2π dan lo mismo (el bucle no salta)', () => {
    const a = puntosOndaCarga(ancho, alto, grosor, 1.3);
    const b = puntosOndaCarga(ancho, alto, grosor, 1.3 + 2 * Math.PI);
    a.ys.forEach((y, i) => expect(y).toBeCloseTo(b.ys[i], 9));
  });
  it('x crece de `grosor` a `ancho − grosor`', () => {
    const { xs } = puntosOndaCarga(ancho, alto, grosor, 0);
    expect(xs[0]).toBe(grosor);
    expect(xs[xs.length - 1]).toBeCloseTo(ancho - grosor, 9);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });
  it('la onda se mueve al cambiar la fase', () => {
    const a = puntosOndaCarga(ancho, alto, grosor, 0).ys;
    const b = puntosOndaCarga(ancho, alto, grosor, 1).ys;
    expect(a.some((y, i) => Math.abs(y - b[i]) > 0.1)).toBe(true);
  });
});
