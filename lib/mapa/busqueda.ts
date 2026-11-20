/** Lógica pura de la búsqueda de sitios (docs/plan-mapa.md F4). Sin red ni React. El servidor es `buscar-sitios`. */
import { CATEGORIAS_SITIO } from '@/lib/mapa/categorias';
import { SIN_CONEXION } from '@/lib/mapa/error';
import type { CategoriaSitio } from '@/lib/mapa/tipos';

export const MIN_LETRAS = 2;
export const MAX_LETRAS = 100;
export const PAUSA_BUSQUEDA_MS = 500;

/** Un resultado ya normalizado por el servidor (independiente del proveedor). */
export type SitioBuscado = {
  provider: 'photon';
  provider_place_id: string;
  nombre: string;
  direccion: string | null;
  lat: number;
  lng: number;
  categoria: CategoriaSitio;
  /** Metros desde el centro de referencia (se calcula en la app; sin centro, no hay). */
  distanciaM?: number;
};

export const MENSAJE_SIN_BUSQUEDA = 'La búsqueda no está disponible ahora. Añádelo a mano.';
export const MENSAJE_TIMEOUT = 'La búsqueda tarda demasiado. Inténtalo de nuevo o añádelo a mano.';
export const MENSAJE_LIMITE = 'Demasiadas búsquedas seguidas. Espera un momento o añádelo a mano.';

/** Texto a buscar (espacios recortados) o null si aún es demasiado corto. */
export function textoBuscable(t: string): string | null {
  const limpio = t.replace(/\s+/g, ' ').trim();
  return limpio.length >= MIN_LETRAS ? limpio.slice(0, MAX_LETRAS) : null;
}

/** Respuesta del servidor → resultados válidos (descarta lo que no tenga la forma esperada). */
export function leerResultados(cuerpo: unknown): SitioBuscado[] {
  const lista = (cuerpo as { resultados?: unknown } | null)?.resultados;
  if (!Array.isArray(lista)) return [];
  return lista.filter((r): r is SitioBuscado => {
    const s = r as Partial<SitioBuscado> | null;
    return (
      !!s &&
      s.provider === 'photon' &&
      typeof s.provider_place_id === 'string' &&
      s.provider_place_id !== '' &&
      typeof s.nombre === 'string' &&
      s.nombre !== '' &&
      (s.direccion === null || typeof s.direccion === 'string') &&
      typeof s.lat === 'number' &&
      typeof s.lng === 'number' &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng) &&
      CATEGORIAS_SITIO.includes(s.categoria as CategoriaSitio)
    );
  });
}

/** Error de la llamada a la función → texto para el usuario (por estado HTTP; nunca el mensaje interno). */
export function mensajeErrorBusqueda(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as { name?: string; context?: { status?: number } };
  if (e.name === 'FunctionsFetchError' || e.name === 'TypeError') return SIN_CONEXION;
  return e.context?.status === 429 ? MENSAJE_LIMITE : MENSAJE_SIN_BUSQUEDA;
}

/** Error de la petición directa a Photon (`fetch`) → texto para el usuario. `estado`: HTTP; `tipo`: fallo antes de respuesta. */
export function mensajeErrorDirecto(fallo: { estado?: number; tipo?: 'red' | 'timeout' }): string {
  if (fallo.tipo === 'red') return SIN_CONEXION;
  if (fallo.tipo === 'timeout') return MENSAJE_TIMEOUT;
  return fallo.estado === 429 ? MENSAJE_LIMITE : MENSAJE_SIN_BUSQUEDA;
}
