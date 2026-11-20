// Lógica pura de «buscar-sitios» (docs/plan-mapa.md F4): sin APIs de Deno ni red, para probarla con Jest.
// El formato de salida (`Sitio buscado`) es el contrato con la app: cambiar de proveedor solo toca `normalizarPhoton`.

export const MIN_TEXTO = 2;
export const MAX_TEXTO = 100;
export const MAX_RESULTADOS = 5;
export const MAX_PETICIONES = 20; // por usuario y ventana
export const VENTANA_MS = 60_000;
export const CACHE_MS = 5 * 60_000;
export const CACHE_MAX = 200;

export type CategoriaSitio = 'restaurant' | 'bar' | 'cafe' | 'leisure' | 'getaway' | 'other';

export type SitioBuscado = {
  provider: 'photon';
  provider_place_id: string;
  nombre: string;
  direccion: string | null;
  lat: number;
  lng: number;
  categoria: CategoriaSitio;
};

export type Entrada = { q: string; lat: number | null; lng: number | null };

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Valida el cuerpo `{q, lat?, lng?}`. Devuelve la entrada limpia o null si no es válida. */
export function validarEntrada(cuerpo: unknown): Entrada | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const { q, lat, lng } = cuerpo as Record<string, unknown>;
  if (typeof q !== 'string') return null;
  const texto = q.replace(/\s+/g, ' ').trim();
  if (texto.length < MIN_TEXTO || texto.length > MAX_TEXTO) return null;
  const hayLat = lat !== undefined && lat !== null;
  const hayLng = lng !== undefined && lng !== null;
  if (hayLat !== hayLng) return null;
  if (!hayLat) return { q: texto, lat: null, lng: null };
  if (!esNumero(lat) || !esNumero(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { q: texto, lat, lng };
}

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

/** Respuesta de Photon → hasta 5 sitios sin repetir. Una respuesta con otra forma da null (proveedor roto). */
export function normalizarRespuesta(json: unknown): SitioBuscado[] | null {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;
  const vistos = new Set<string>();
  const salida: SitioBuscado[] = [];
  for (const f of features) {
    const s = normalizarPhoton(f);
    if (!s || vistos.has(s.provider_place_id)) continue;
    vistos.add(s.provider_place_id);
    salida.push(s);
    if (salida.length === MAX_RESULTADOS) break;
  }
  return salida;
}

/** URL de Photon: límite pequeño, idioma por defecto y sesgo por ubicación si la hay. */
export function urlPhoton(e: Entrada): string {
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', e.q);
  u.searchParams.set('limit', String(MAX_RESULTADOS + 3)); // margen para descartar los que no sirven
  u.searchParams.set('lang', 'default');
  if (e.lat !== null && e.lng !== null) {
    u.searchParams.set('lat', e.lat.toFixed(2));
    u.searchParams.set('lon', e.lng.toFixed(2));
  }
  return u.toString();
}

/** Clave de caché: texto normalizado y ubicación redondeada (~1 km). */
export function claveCache(e: Entrada): string {
  const q = e.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return e.lat === null || e.lng === null ? q : `${q}|${e.lat.toFixed(2)}|${e.lng.toFixed(2)}`;
}

/** Límite de peticiones por usuario en una ventana deslizante. Muta `registro` (id → instantes). */
export function permitir(registro: Map<string, number[]>, usuario: string, ahora: number): boolean {
  const recientes = (registro.get(usuario) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= MAX_PETICIONES) {
    registro.set(usuario, recientes);
    return false;
  }
  recientes.push(ahora);
  registro.set(usuario, recientes);
  if (registro.size > 1000) {
    for (const [id, ts] of registro) if (ts.every((t) => ahora - t >= VENTANA_MS)) registro.delete(id);
  }
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
