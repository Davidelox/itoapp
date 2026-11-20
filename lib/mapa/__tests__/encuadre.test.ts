import { DELTA_MINIMO, REGION_ESPANA, encuadre } from '@/lib/mapa/encuadre';

describe('encuadre', () => {
  it('sin sitios, España', () => expect(encuadre([])).toEqual(REGION_ESPANA));
  it('con uno, centrado y con el delta mínimo', () => {
    expect(encuadre([{ lat: 40.4, lng: -3.7 }])).toEqual({ latitude: 40.4, longitude: -3.7, latitudeDelta: DELTA_MINIMO, longitudeDelta: DELTA_MINIMO });
  });
  it('con dos muy cercanos, no baja del delta mínimo', () => {
    const r = encuadre([{ lat: 40.4, lng: -3.7 }, { lat: 40.4001, lng: -3.7001 }]);
    expect(r.latitudeDelta).toBe(DELTA_MINIMO);
    expect(r.longitudeDelta).toBe(DELTA_MINIMO);
  });
  it('con varios, centro de la caja y margen', () => {
    const r = encuadre([{ lat: 40, lng: -4 }, { lat: 42, lng: 0 }, { lat: 41, lng: -2 }]);
    expect(r.latitude).toBe(41);
    expect(r.longitude).toBe(-2);
    expect(r.latitudeDelta).toBeCloseTo(2.8);
    expect(r.longitudeDelta).toBeCloseTo(5.6);
  });
});
