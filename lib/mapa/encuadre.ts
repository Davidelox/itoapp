/** Encuadre inicial del mapa (docs/plan-mapa.md §5.1): todos los sitios con margen; 0 → España; 1 → vista cercana. */
export type Punto = { lat: number; lng: number };
export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export const REGION_ESPANA: Region = { latitude: 40, longitude: -3.7, latitudeDelta: 6, longitudeDelta: 6 };
export const DELTA_MINIMO = 0.01;
const MARGEN = 1.4;

export function encuadre(puntos: Punto[]): Region {
  if (puntos.length === 0) return REGION_ESPANA;
  const lats = puntos.map((p) => p.lat);
  const lngs = puntos.map((p) => p.lng);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(DELTA_MINIMO, (maxLat - minLat) * MARGEN),
    longitudeDelta: Math.max(DELTA_MINIMO, (maxLng - minLng) * MARGEN),
  };
}
