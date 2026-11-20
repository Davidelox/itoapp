/**
 * Resultados de búsqueda de sitios: distancia, orden por cercanía y paso a «Guardar». Lógica pura, sin red ni React.
 * Heurística de orden: si la consulta es una cadena o marca («KFC», «Starbucks»: casi todos los resultados se llaman
 * como ella), lo útil es lo más cercano → distancia ascendente. Si no («KFC Atocha», «Casa Lola Sevilla»), manda la
 * relevancia de Photon. La distancia, si hay centro de referencia, se muestra siempre.
 */
import { MAX_VISIBLES } from '@/lib/mapa/photon';
import type { SitioBuscado } from '@/lib/mapa/busqueda';
import { CATEGORIAS_SITIO } from '@/lib/mapa/categorias';
import { buscarDuplicado, coordenadasValidas, distanciaMetros } from '@/lib/mapa/sitio';
import type { CategoriaSitio, Sitio } from '@/lib/mapa/tipos';

export type Centro = { lat: number; lng: number };

/** Mínimo de coincidencias (y proporción) para tratar la consulta como cadena o marca. */
const MIN_COINCIDENCIAS = 2;
const PROPORCION_CADENA = 0.6;

/** Minúsculas, sin tildes y con espacios simples. */
export const normalizarNombre = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** «450 m», «1,2 km», «12 km»: metros redondeados a 10; de 1 a 10 km un decimal con coma; desde 10 km, enteros. */
export function formatoDistancia(metros: number): string {
  if (!Number.isFinite(metros) || metros < 0) return '';
  const redondeado = Math.round(metros / 10) * 10;
  if (redondeado < 1000) return `${Math.max(10, redondeado)} m`;
  const km = metros / 1000;
  if (km >= 9.95) return `${Math.round(km)} km`;
  return `${km.toFixed(1).replace('.', ',')} km`.replace(',0 km', ' km');
}

/** Una sola palabra (p. ej. «KFC», «farmacia»): búsqueda genérica, para la que tiene sentido acotar a la zona. */
export const esConsultaGenerica = (q: string) => normalizarNombre(q).split(' ').filter(Boolean).length === 1;

/** ¿El nombre contiene la consulta como palabras completas («KFC» en «KFC Atocha»)? */
const coincide = (nombre: string, nq: string) => ` ${normalizarNombre(nombre)} `.includes(` ${nq} `);

/** ¿La consulta es una cadena o marca? Al menos 2 resultados y el 60 % se llaman como ella. */
export function esBusquedaDeCadena(q: string, lista: Pick<SitioBuscado, 'nombre'>[]): boolean {
  const nq = normalizarNombre(q);
  if (nq === '') return false;
  const n = lista.filter((r) => coincide(r.nombre, nq)).length;
  return n >= MIN_COINCIDENCIAS && n / lista.length >= PROPORCION_CADENA;
}

/**
 * Añade la distancia (si hay centro) y ordena: cadena → los que coinciden por distancia ascendente y luego el resto
 * en su orden; si no → orden de Photon. Devuelve hasta `max`.
 */
export function ordenarResultados(lista: SitioBuscado[], q: string, centro: Centro | null | undefined, max: number = MAX_VISIBLES): SitioBuscado[] {
  if (!centro) return lista.slice(0, max);
  const con = lista.map((r) => ({ ...r, distanciaM: distanciaMetros(centro, r) }));
  if (!esBusquedaDeCadena(q, con)) return con.slice(0, max);
  const nq = normalizarNombre(q);
  const propios = con.filter((r) => coincide(r.nombre, nq)).sort((a, b) => a.distanciaM - b.distanciaM);
  return [...propios, ...con.filter((r) => !coincide(r.nombre, nq))].slice(0, max);
}

/** Resultado de búsqueda y el sitio ya guardado que es el mismo (mismo nombre a menos de 100 m), si lo hay. */
export function fusionarConGuardados(resultados: SitioBuscado[], sitios: Sitio[]): { resultado: SitioBuscado; guardado: Sitio | null }[] {
  return resultados.map((resultado) => ({
    resultado,
    guardado: buscarDuplicado(sitios, { nombre: resultado.nombre, lat: resultado.lat, lng: resultado.lng }) ?? null,
  }));
}

/** Texto de una fila o tarjeta: «dirección · 450 m» (lo que haya). */
export const lineaResultado = (r: Pick<SitioBuscado, 'direccion' | 'distanciaM'>) =>
  [r.direccion, r.distanciaM === undefined ? null : formatoDistancia(r.distanciaM)].filter(Boolean).join(' · ');

/** Parámetros de ruta de `/mapa/nuevo` para guardar un resultado sin volver a buscarlo. */
export function paramsGuardar(r: SitioBuscado): Record<string, string> {
  return { nombre: r.nombre, direccion: r.direccion ?? '', lat: String(r.lat), lng: String(r.lng), categoria: r.categoria, lugarId: r.provider_place_id };
}

export type DatosGuardar = { nombre: string; direccion: string; lat: number; lng: number; categoria: CategoriaSitio; lugarId: string };

const un = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | string[] | undefined) => {
  const t = un(v);
  return t !== undefined && t.trim() !== '' && Number.isFinite(Number(t)) ? Number(t) : null;
};

/** Los parámetros de `paramsGuardar` ya validados, o null si falta algo o no es de Photon (entonces es un alta normal). */
export function leerParamsGuardar(p: Record<string, string | string[] | undefined>): DatosGuardar | null {
  const nombre = un(p.nombre)?.trim();
  const lugarId = un(p.lugarId);
  const categoria = un(p.categoria) as CategoriaSitio;
  const lat = num(p.lat);
  const lng = num(p.lng);
  if (!nombre || !lugarId || !/^[NWR]\d+$/.test(lugarId) || !CATEGORIAS_SITIO.includes(categoria) || !coordenadasValidas(lat, lng)) return null;
  return { nombre, direccion: un(p.direccion)?.trim() ?? '', lat, lng: lng as number, categoria, lugarId };
}

/** Centro de referencia pasado por parámetros de ruta (`cLat`, `cLng`), o null. */
export function leerCentro(p: Record<string, string | string[] | undefined>): Centro | null {
  const lat = num(p.cLat);
  const lng = num(p.cLng);
  return coordenadasValidas(lat, lng) ? { lat, lng: lng as number } : null;
}

/** Zoom al elegir un resultado (grados de latitud/longitud: ~1 km de ancho). */
export const DELTA_ZOOM_RESULTADO = 0.008;

/** Región a la que se anima el mapa al elegir un resultado. */
export const regionDeResultado = (r: Pick<SitioBuscado, 'lat' | 'lng'>) => ({
  latitude: r.lat,
  longitude: r.lng,
  latitudeDelta: DELTA_ZOOM_RESULTADO,
  longitudeDelta: DELTA_ZOOM_RESULTADO,
});

type Zona = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

/** ¿El mapa se ha movido o ampliado lo bastante desde `base` como para ofrecer «Buscar en esta zona»? */
export function regionMovida(base: Zona, actual: Zona): boolean {
  const desplazamiento = Math.max(Math.abs(actual.latitude - base.latitude) / base.latitudeDelta, Math.abs(actual.longitude - base.longitude) / base.longitudeDelta);
  const zoom = actual.latitudeDelta / base.latitudeDelta;
  return desplazamiento > 0.25 || zoom > 1.4 || zoom < 0.7;
}

/** Autocompletado: letras mínimas y máximo de sugerencias. */
export const MIN_SUGERENCIAS = 3;
export const MAX_SUGERENCIAS = 5;
export const PAUSA_SUGERENCIAS_MS = 350;

/** Texto para sugerir (espacios limpios) o null si aún es corto (menos de 3 letras). */
export function textoSugerible(t: string): string | null {
  const limpio = t.replace(/\s+/g, ' ').trim();
  return limpio.length >= MIN_SUGERENCIAS ? limpio.slice(0, 100) : null;
}

/**
 * Zoom al elegir un resultado y vuelta al deseleccionar. `anterior`/`actual`: resultado elegido antes y ahora;
 * `ultima`: región del mapa ahora; `previa`: la guardada antes del zoom. Devuelve la región previa a guardar y a dónde animar.
 * La región se guarda solo al pasar de «ninguno» a uno (elegir otro resultado no la pisa).
 */
export function planZoom<R>(anterior: string | null, actual: string | null, previa: R | null, ultima: R | null, destino: R | null): { previa: R | null; ir: R | null } {
  if (actual !== null) return { previa: anterior === null ? ultima : previa, ir: destino };
  if (anterior !== null) return { previa: null, ir: previa };
  return { previa, ir: null };
}
