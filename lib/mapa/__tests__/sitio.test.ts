import {
  buscarDuplicado,
  PROVIDER_BUSQUEDA,
  filaNueva,
  leerCoordenada,
  puedeRevelar,
  urlGoogleMaps,
  urlsComoLlegar,
  validarSitio,
  type FormularioSitio,
} from '@/lib/mapa/sitio';
import type { Sitio } from '@/lib/mapa/tipos';

const sitio = (o: Partial<Sitio> = {}): Sitio => ({
  id: 'a', name: 'Taberna El Olivo', address: 'Calle Mayor 12', lat: 40.4168, lng: -3.7038, category: 'restaurant', status: 'been',
  visible_to_partner: true, created_by: 'u1', version: 1, created_at: '2026-01-01T00:00:00Z', place_notes: [], ...o,
});
const form = (o: Partial<FormularioSitio> = {}): FormularioSitio => ({
  nombre: ' Mirador ', direccion: '  ', categoria: 'leisure', estado: 'want_to_go', privado: true, lat: 40, lng: -3, ...o,
});

describe('validarSitio', () => {
  it('acepta un nombre y unas coordenadas válidas', () => {
    expect(validarSitio({ nombre: 'Bar', lat: 40, lng: -3 })).toEqual({ nombre: null, ubicacion: null });
  });
  it('rechaza nombre vacío, de solo espacios o de más de 120', () => {
    expect(validarSitio({ nombre: '   ', lat: 40, lng: -3 }).nombre).not.toBeNull();
    expect(validarSitio({ nombre: 'a'.repeat(121), lat: 40, lng: -3 }).nombre).not.toBeNull();
    expect(validarSitio({ nombre: 'a'.repeat(120), lat: 40, lng: -3 }).nombre).toBeNull();
  });
  it('rechaza coordenadas ausentes, NaN o fuera de rango', () => {
    for (const [lat, lng] of [[null, null], [Number.NaN, 1], [91, 0], [0, 181]] as const) {
      expect(validarSitio({ nombre: 'Bar', lat, lng }).ubicacion).not.toBeNull();
    }
  });
});

describe('leerCoordenada', () => {
  it('admite coma o punto y rechaza lo que no es un número', () => {
    expect(leerCoordenada('40,4168')).toBe(40.4168);
    expect(leerCoordenada(' -3.7038 ')).toBe(-3.7038);
    expect(leerCoordenada('abc')).toBeNull();
    expect(leerCoordenada('')).toBeNull();
  });
});

describe('filaNueva', () => {
  it('a mano: sin provider_place_id, nombre recortado y dirección vacía a null', () => {
    expect(filaNueva(form())).toEqual({
      name: 'Mirador', address: null, lat: 40, lng: -3, provider: 'manual', provider_place_id: null,
      category: 'leisure', status: 'want_to_go', visible_to_partner: false,
    });
  });
  it('de la búsqueda: lleva provider_place_id y el provider válido del esquema', () => {
    const fila = filaNueva(form({ lugarId: 'N123' }));
    expect(fila.provider_place_id).toBe('N123');
    expect(fila.provider).toBe('osm');
    expect(PROVIDER_BUSQUEDA).toBe('osm');
  });
  it('compartido si no es privado', () => {
    expect(filaNueva(form({ privado: false })).visible_to_partner).toBe(true);
  });
});

describe('puedeRevelar', () => {
  it('solo el autor de un sitio privado', () => {
    expect(puedeRevelar(sitio({ visible_to_partner: false }), 'u1')).toBe(true);
    expect(puedeRevelar(sitio({ visible_to_partner: false }), 'u2')).toBe(false);
    expect(puedeRevelar(sitio({ visible_to_partner: true }), 'u1')).toBe(false);
    expect(puedeRevelar(sitio({ visible_to_partner: false }), undefined)).toBe(false);
  });
});

describe('buscarDuplicado', () => {
  const lista = [sitio({ id: 'x', visible_to_partner: false })];
  it('mismo nombre (sin tildes ni mayúsculas) cerca: duplicado, sea privado o compartido', () => {
    expect(buscarDuplicado(lista, { nombre: 'taberna el olivo', lat: 40.4169, lng: -3.7039 })?.id).toBe('x');
    expect(buscarDuplicado([sitio({ id: 'y', name: 'Café Ñandú' })], { nombre: 'cafe nandu', lat: 40.4168, lng: -3.7038 })?.id).toBe('y');
  });
  it('mismo nombre pero lejos, u otro nombre cerca: no es duplicado', () => {
    expect(buscarDuplicado(lista, { nombre: 'Taberna El Olivo', lat: 41.4, lng: -3.7 })).toBeUndefined();
    expect(buscarDuplicado(lista, { nombre: 'Otro', lat: 40.4168, lng: -3.7038 })).toBeUndefined();
  });
  it('al editar, el propio sitio no cuenta', () => {
    expect(buscarDuplicado(lista, { nombre: 'Taberna El Olivo', lat: 40.4168, lng: -3.7038 }, 'x')).toBeUndefined();
  });
});

describe('enlaces', () => {
  it('Google Maps: nombre y dirección codificados', () => {
    expect(urlGoogleMaps(sitio({ name: 'Bar & Co', address: 'C/ Sol, 3' }))).toBe(
      'https://www.google.com/maps/search/?api=1&query=Bar%20%26%20Co%20C%2F%20Sol%2C%203',
    );
  });
  it('Google Maps: sin dirección (o en blanco) usa las coordenadas', () => {
    expect(urlGoogleMaps(sitio({ address: null }))).toBe('https://www.google.com/maps/search/?api=1&query=40.4168%2C-3.7038');
    expect(urlGoogleMaps(sitio({ address: '  ' }))).toContain('query=40.4168%2C-3.7038');
  });
  it('Cómo llegar: Apple, Google y Waze con las coordenadas', () => {
    const u = urlsComoLlegar({ lat: 40.4168, lng: -3.7038 });
    expect(u.apple).toBe('https://maps.apple.com/?daddr=40.4168%2C-3.7038&dirflg=d');
    expect(u.google).toBe('https://www.google.com/maps/dir/?api=1&destination=40.4168%2C-3.7038');
    expect(u.waze).toBe('https://waze.com/ul?ll=40.4168%2C-3.7038&navigate=yes');
  });
});
