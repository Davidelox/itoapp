/** Lógica pura de guardar, editar y abrir sitios (docs/plan-mapa.md §3 y §7, fase 3). Sin red ni React. */
import type { CategoriaSitio, EstadoSitio, Sitio } from '@/lib/mapa/tipos';

export const MAX_NOMBRE = 120;
export const MAX_DIRECCION = 200;

export type FormularioSitio = {
  nombre: string;
  direccion: string;
  categoria: CategoriaSitio;
  estado: EstadoSitio;
  /** Solo para quien lo guarda: la pareja no lo ve («para sorpresas»). */
  privado: boolean;
  lat: number | null;
  lng: number | null;
  /** Identificador del resultado de búsqueda elegido (Photon, p. ej. `N123`); sin él, el sitio es «a mano». */
  lugarId?: string | null;
};

export type ErroresSitio = { nombre: string | null; ubicacion: string | null };

/** Nombre de 1 a 120 caracteres (sin contar espacios de los lados) y coordenadas válidas. */
export function validarSitio(f: Pick<FormularioSitio, 'nombre' | 'lat' | 'lng'>): ErroresSitio {
  const nombre = f.nombre.trim();
  return {
    nombre: nombre.length === 0 ? 'Ponle un nombre al sitio.' : nombre.length > MAX_NOMBRE ? `El nombre admite hasta ${MAX_NOMBRE} letras.` : null,
    ubicacion: coordenadasValidas(f.lat, f.lng) ? null : 'Elige la ubicación en el mapa.',
  };
}

export const hayErroresSitio = (e: ErroresSitio) => e.nombre !== null || e.ubicacion !== null;

export function coordenadasValidas(lat: number | null, lng: number | null): lat is number {
  return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Texto de un campo de coordenada («40,4168» o «40.4168») → número, o null si no es un número. */
export function leerCoordenada(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Valor de `places.provider` para los sitios de la búsqueda (ids de OpenStreetMap; migración 20261127000000_places_osm.sql). */
export const PROVIDER_BUSQUEDA = 'osm' as const;

/** Fila de `places` a insertar (`manual` ⇒ sin `provider_place_id`; el esquema exige las dos cosas a la vez). */
export function filaNueva(f: FormularioSitio) {
  return {
    name: f.nombre.trim(),
    address: f.direccion.trim() || null,
    lat: f.lat as number,
    lng: f.lng as number,
    provider: f.lugarId ? PROVIDER_BUSQUEDA : ('manual' as const),
    provider_place_id: f.lugarId || null,
    category: f.categoria,
    status: f.estado,
    visible_to_partner: !f.privado,
  };
}

/** Formulario para guardar tal cual un resultado de búsqueda: «Quiero ir» y compartido con la pareja. */
export const formularioDeResultado = (r: { nombre: string; direccion?: string | null; categoria: CategoriaSitio; lat: number; lng: number; provider_place_id: string }): FormularioSitio => ({
  nombre: r.nombre,
  direccion: r.direccion ?? '',
  categoria: r.categoria,
  estado: 'want_to_go',
  privado: false,
  lat: r.lat,
  lng: r.lng,
  lugarId: r.provider_place_id,
});

/** Quién puede revelar un sitio privado: solo quien lo guardó (el servidor lo exige: TW013). */
export const puedeRevelar = (s: Pick<Sitio, 'created_by' | 'visible_to_partner'>, userId: string | undefined) =>
  !s.visible_to_partner && !!userId && s.created_by === userId;

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Distancia en metros entre dos puntos (fórmula del haversine). */
export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** A menos de esta distancia y con el mismo nombre, es el mismo sitio. */
export const RADIO_DUPLICADO_M = 100;

/**
 * El mismo sitio ya guardado, mirando solo la lista que ve esta persona (la RLS oculta los privados de la pareja):
 * mismo nombre (sin mayúsculas ni tildes) a menos de 100 m. Evita un sitio en privado y otro igual en compartido.
 * `excluirId`: al editar, el propio sitio no cuenta.
 */
export function buscarDuplicado(sitios: Sitio[], candidato: { nombre: string; lat: number; lng: number }, excluirId?: string): Sitio | undefined {
  const nombre = sinTildes(candidato.nombre);
  return sitios.find((s) => s.id !== excluirId && sinTildes(s.name) === nombre && distanciaMetros(s, candidato) <= RADIO_DUPLICADO_M);
}

const c = encodeURIComponent;
const coords = (s: Pick<Sitio, 'lat' | 'lng'>) => `${s.lat},${s.lng}`;

/**
 * «Ver en Google Maps»: busca por nombre y dirección, no por identificador (con nombres repetidos puede abrir otro
 * sitio). Sin dirección se usan las coordenadas, que no fallan.
 */
export function urlGoogleMaps(s: Pick<Sitio, 'name' | 'address' | 'lat' | 'lng'>): string {
  const consulta = s.address?.trim() ? `${s.name} ${s.address.trim()}` : coords(s);
  return `https://www.google.com/maps/search/?api=1&query=${c(consulta)}`;
}

/** «Cómo llegar»: ruta hasta las coordenadas, en cada aplicación (enlaces `https`, sin permisos extra). */
export const urlsComoLlegar = (s: Pick<Sitio, 'lat' | 'lng'>) => ({
  apple: `https://maps.apple.com/?daddr=${c(coords(s))}&dirflg=d`,
  google: `https://www.google.com/maps/dir/?api=1&destination=${c(coords(s))}`,
  waze: `https://waze.com/ul?ll=${c(coords(s))}&navigate=yes`,
});
