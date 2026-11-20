/**
 * Búsqueda de sitios con Photon (OpenStreetMap), llamado DIRECTO desde la app.
 * Por qué directo: Photon devuelve 403 a las IPs de los servidores de Supabase (la Edge Function `buscar-sitios`
 * no puede usarlo), pero responde bien desde IPs de móviles. Para volver a la función con otro proveedor con clave
 * (MapTiler/Geoapify) solo hay que cambiar `PROVEEDOR_BUSQUEDA` en `lib/mapa/consultas.ts`.
 * Lógica pura (sin red ni React), copiada de `supabase/functions/buscar-sitios/logica.ts`.
 */
import type { SitioBuscado } from '@/lib/mapa/busqueda';
import type { CategoriaSitio } from '@/lib/mapa/tipos';

export const MAX_RESULTADOS = 5;
/** Candidatos que se piden a Photon para poder ordenar por cercanía (la pantalla enseña hasta `MAX_VISIBLES`). */
export const LIMITE_CANDIDATOS = 20;
export const MAX_VISIBLES = 8;
/** Medio lado (en grados, ~33 km) del recuadro de las búsquedas genéricas. */
export const MEDIO_BBOX = 0.3;
export const MAX_PETICIONES = 20; // por ventana
export const VENTANA_MS = 60_000;
export const CACHE_MS = 5 * 60_000;
export const CACHE_MAX = 100;

export type Entrada = { q: string; lat: number | null; lng: number | null };

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const POR_VALOR: Record<string, CategoriaSitio> = {
  restaurant: 'restaurant',
  fast_food: 'restaurant',
  food_court: 'restaurant',
  bar: 'bar',
  pub: 'bar',
  biergarten: 'bar',
  nightclub: 'bar',
  cafe: 'cafe',
  bakery: 'cafe',
  ice_cream: 'cafe',
  hotel: 'getaway',
  hostel: 'getaway',
  guest_house: 'getaway',
  apartment: 'getaway',
  motel: 'getaway',
  camp_site: 'getaway',
  chalet: 'getaway',
  museum: 'leisure',
  cinema: 'leisure',
  theatre: 'leisure',
  zoo: 'leisure',
  aquarium: 'leisure',
  gallery: 'leisure',
  attraction: 'leisure',
  viewpoint: 'leisure',
  theme_park: 'leisure',
  park: 'leisure',
  garden: 'leisure',
  stadium: 'leisure',
  beach: 'leisure',
  nature_reserve: 'leisure',
};

/** `osm_key` / `osm_value` de OpenStreetMap → categoría de sitio (lo desconocido es `other`). */
export function categoriaOsm(clave: unknown, valor: unknown): CategoriaSitio {
  if (typeof valor !== 'string') return 'other';
  if (clave === 'amenity' || clave === 'tourism' || clave === 'leisure' || clave === 'natural') {
    return Object.prototype.hasOwnProperty.call(POR_VALOR, valor) ? POR_VALOR[valor] : 'other';
  }
  return 'other';
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** Recorta a `max` caracteres sin partir un emoji (la base cuenta caracteres, no unidades UTF-16). */
const recortar = (t: string, max: number) => Array.from(t).slice(0, max).join('');

/** Dirección legible a partir de las propiedades de Photon (calle y número, código postal, ciudad). */
export function direccionPhoton(p: Record<string, unknown>): string | null {
  const calle = [texto(p.street), texto(p.housenumber)].filter(Boolean).join(' ');
  const zona = [texto(p.postcode), texto(p.city) ?? texto(p.town) ?? texto(p.village) ?? texto(p.district)].filter(Boolean).join(' ');
  const partes = [calle, zona].filter((x) => x !== '');
  return partes.length > 0 ? recortar(partes.join(', '), 200) : null;
}

/** Una `feature` de Photon → sitio buscado, o null si le falta lo imprescindible. */
export function normalizarPhoton(feature: unknown): SitioBuscado | null {
  if (typeof feature !== 'object' || feature === null) return null;
  const f = feature as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> };
  const p = f.properties;
  const c = f.geometry?.coordinates;
  if (!p || !Array.isArray(c)) return null;
  const [lng, lat] = c;
  if (!esNumero(lat) || !esNumero(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const tipo = texto(p.osm_type);
  const id = typeof p.osm_id === 'number' || typeof p.osm_id === 'string' ? String(p.osm_id) : null;
  const nombre = texto(p.name);
  if (!tipo || !/^[NWR]$/.test(tipo) || !id || !/^\d+$/.test(id) || !nombre) return null;
  return {
    provider: 'photon',
    provider_place_id: `${tipo}${id}`,
    nombre: recortar(nombre, 120),
    direccion: direccionPhoton(p),
    lat,
    lng,
    categoria: categoriaOsm(p.osm_key, p.osm_value),
  };
}

/** Respuesta de Photon → hasta `max` (5 por defecto) sitios sin repetir. Una respuesta con otra forma da null (proveedor roto). */
export function normalizarRespuesta(json: unknown, max: number = MAX_RESULTADOS): SitioBuscado[] | null {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;
  const vistos = new Set<string>();
  const salida: SitioBuscado[] = [];
  for (const f of features) {
    const s = normalizarPhoton(f);
    if (!s || vistos.has(s.provider_place_id)) continue;
    vistos.add(s.provider_place_id);
    salida.push(s);
    if (salida.length === max) break;
  }
  return salida;
}

/** Clave de caché: texto normalizado y ubicación redondeada (~1 km). */
export function claveCache(e: Entrada): string {
  const q = e.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return e.lat === null || e.lng === null ? q : `${q}|${e.lat.toFixed(2)}|${e.lng.toFixed(2)}`;
}

/** URL de Photon: límite pequeño, idioma por defecto (no admite `es`) y sesgo por ubicación si la hay. */
export function urlPhoton(e: Entrada, o: { limite?: number; bbox?: boolean } = {}): string {
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', e.q);
  u.searchParams.set('limit', String(o.limite ?? MAX_RESULTADOS + 3)); // margen para descartar los que no sirven
  u.searchParams.set('lang', 'default');
  if (e.lat !== null && e.lng !== null) {
    u.searchParams.set('lat', e.lat.toFixed(2));
    u.searchParams.set('lon', e.lng.toFixed(2));
    // Recuadro alrededor del centro (ya redondeado, como la clave de caché): mínimo lon, mínimo lat, máximo lon, máximo lat.
    if (o.bbox) {
      const [lat, lng] = [Number(e.lat.toFixed(2)), Number(e.lng.toFixed(2))];
      u.searchParams.set('bbox', [lng - MEDIO_BBOX, lat - MEDIO_BBOX, lng + MEDIO_BBOX, lat + MEDIO_BBOX].map((x) => x.toFixed(2)).join(','));
    }
  }
  return u.toString();
}

/** Límite de peticiones en una ventana deslizante. Muta `registro` (instantes). */
export function permitir(registro: number[], ahora: number): boolean {
  while (registro.length > 0 && ahora - registro[0] >= VENTANA_MS) registro.shift();
  if (registro.length >= MAX_PETICIONES) return false;
  registro.push(ahora);
  return true;
}

export type EntradaCache = { hasta: number; datos: SitioBuscado[] };

export function leerCache(cache: Map<string, EntradaCache>, clave: string, ahora: number): SitioBuscado[] | null {
  const e = cache.get(clave);
  if (!e) return null;
  if (e.hasta <= ahora) {
    cache.delete(clave);
    return null;
  }
  return e.datos;
}

export function guardarCache(cache: Map<string, EntradaCache>, clave: string, datos: SitioBuscado[], ahora: number): void {
  if (cache.size >= CACHE_MAX) {
    const primera = cache.keys().next().value;
    if (primera !== undefined) cache.delete(primera);
  }
  cache.set(clave, { hasta: ahora + CACHE_MS, datos });
}
