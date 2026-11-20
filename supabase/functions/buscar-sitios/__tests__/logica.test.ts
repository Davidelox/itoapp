import {
  CACHE_MS,
  MAX_PETICIONES,
  VENTANA_MS,
  categoriaOsm,
  claveCache,
  guardarCache,
  leerCache,
  normalizarPhoton,
  normalizarRespuesta,
  permitir,
  urlPhoton,
  validarEntrada,
  type EntradaCache,
} from '../logica';

const feature = (props: Record<string, unknown>, coords: unknown = [-3.7, 40.4]) => ({
  geometry: { coordinates: coords },
  properties: { osm_type: 'N', osm_id: 123, name: 'Casa Lola', osm_key: 'amenity', osm_value: 'restaurant', ...props },
});

describe('validarEntrada', () => {
  it('acepta texto y ubicación', () => {
    expect(validarEntrada({ q: '  casa   lola ', lat: 40.4, lng: -3.7 })).toEqual({ q: 'casa lola', lat: 40.4, lng: -3.7 });
    expect(validarEntrada({ q: 'casa' })).toEqual({ q: 'casa', lat: null, lng: null });
  });
  it.each([
    [null],
    [{}],
    [{ q: 'a' }],
    [{ q: 'x'.repeat(101) }],
    [{ q: 'casa', lat: 40 }],
    [{ q: 'casa', lat: 91, lng: 0 }],
    [{ q: 'casa', lat: '40', lng: 0 }],
    [{ q: 5 }],
  ])('rechaza %j', (c) => expect(validarEntrada(c)).toBeNull());
});

describe('categoriaOsm', () => {
  it.each([
    ['amenity', 'restaurant', 'restaurant'],
    ['amenity', 'pub', 'bar'],
    ['amenity', 'cafe', 'cafe'],
    ['tourism', 'hotel', 'getaway'],
    ['tourism', 'museum', 'leisure'],
    ['leisure', 'park', 'leisure'],
    ['shop', 'bakery', 'other'],
    ['amenity', 'pharmacy', 'other'],
  ])('%s=%s → %s', (k, v, c) => expect(categoriaOsm(k, v)).toBe(c));
  it('tolera valores raros', () => expect(categoriaOsm(undefined, 5)).toBe('other'));
  it.each(['constructor', 'toString', '__proto__'])('no confunde %s con una categoría', (v) =>
    expect(categoriaOsm('amenity', v)).toBe('other'));
});

describe('normalizarPhoton', () => {
  it('normaliza un sitio con dirección', () => {
    expect(normalizarPhoton(feature({ street: 'Calle Mayor', housenumber: '12', postcode: '28013', city: 'Madrid' }))).toEqual({
      provider: 'photon',
      provider_place_id: 'N123',
      nombre: 'Casa Lola',
      direccion: 'Calle Mayor 12, 28013 Madrid',
      lat: 40.4,
      lng: -3.7,
      categoria: 'restaurant',
    });
  });
  it('dirección nula si no hay datos', () => expect(normalizarPhoton(feature({}))?.direccion).toBeNull());
  it('recorta el nombre a 120 caracteres sin partir un emoji', () => {
    const nombre = normalizarPhoton(feature({ name: 'a'.repeat(119) + '🍷🍷' }))?.nombre ?? '';
    expect(Array.from(nombre)).toHaveLength(120);
    expect(nombre.endsWith('🍷')).toBe(true);
  });
  it.each([
    ['sin nombre', feature({ name: undefined })],
    ['osm_type raro', feature({ osm_type: 'X' })],
    ['osm_id raro', feature({ osm_id: 'abc' })],
    ['coordenadas fuera', feature({}, [-3.7, 99])],
    ['coordenadas no array', feature({}, null)],
    ['no objeto', 'x'],
  ])('descarta %s', (_n, f) => expect(normalizarPhoton(f)).toBeNull());
});

describe('normalizarRespuesta', () => {
  it('limita a 5, sin repetidos ni inválidos', () => {
    const features = [feature({ osm_id: 1 }), feature({ osm_id: 1 }), feature({ name: undefined, osm_id: 9 })];
    for (let i = 2; i < 10; i++) features.push(feature({ osm_id: i }));
    const r = normalizarRespuesta({ features }) ?? [];
    expect(r).toHaveLength(5);
    expect(new Set(r.map((s) => s.provider_place_id)).size).toBe(5);
  });
  it('forma inesperada → null; sin resultados → []', () => {
    expect(normalizarRespuesta({ error: 'x' })).toBeNull();
    expect(normalizarRespuesta(null)).toBeNull();
    expect(normalizarRespuesta({ features: [] })).toEqual([]);
  });
});

describe('urlPhoton y claveCache', () => {
  it('lleva límite, idioma y sesgo redondeado', () => {
    const u = new URL(urlPhoton({ q: 'casa lola', lat: 40.41678, lng: -3.70379 }));
    expect(u.searchParams.get('q')).toBe('casa lola');
    expect(u.searchParams.get('limit')).toBe('8');
    expect(u.searchParams.get('lat')).toBe('40.42');
    expect(u.searchParams.get('lon')).toBe('-3.70');
  });
  it('sin ubicación no lleva sesgo', () => expect(new URL(urlPhoton({ q: 'ab', lat: null, lng: null })).searchParams.has('lat')).toBe(false));
  it('la clave ignora tildes, mayúsculas y diferencias de ~1 km', () => {
    expect(claveCache({ q: 'Café', lat: 40.411, lng: -3.701 })).toBe(claveCache({ q: 'cafe', lat: 40.414, lng: -3.703 }));
  });
});

describe('permitir', () => {
  it('corta tras el máximo y se libera al pasar la ventana', () => {
    const reg = new Map<string, number[]>();
    for (let i = 0; i < MAX_PETICIONES; i++) expect(permitir(reg, 'u', 1000)).toBe(true);
    expect(permitir(reg, 'u', 1000)).toBe(false);
    expect(permitir(reg, 'otro', 1000)).toBe(true);
    expect(permitir(reg, 'u', 1000 + VENTANA_MS)).toBe(true);
  });
});

describe('caché', () => {
  it('caduca y se acota', () => {
    const c = new Map<string, EntradaCache>();
    guardarCache(c, 'a', [], 0);
    expect(leerCache(c, 'a', CACHE_MS - 1)).toEqual([]);
    expect(leerCache(c, 'a', CACHE_MS)).toBeNull();
    for (let i = 0; i < 300; i++) guardarCache(c, `k${i}`, [], 0);
    expect(c.size).toBeLessThanOrEqual(200);
  });
});
