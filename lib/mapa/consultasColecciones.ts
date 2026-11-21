/** Lecturas y escrituras de las colecciones del Mapa (docs/modelo-datos.md §8). La RLS ya oculta las privadas de la pareja. */
import { ErrorGasto } from '@/lib/gastos/error';
import { esPrevision, type PrevisionBorrado } from '@/lib/mapa/borradoColeccion';
import { mensajeErrorMapa } from '@/lib/mapa/error';
import type { PasosGuardado } from '@/lib/mapa/colecciones';
import type { Coleccion, Pertenencia } from '@/lib/mapa/tipos';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

const COLUMNAS = 'id, name, icon, plan_id, visible_to_partner, created_by, version, created_at';

export async function leerColecciones(): Promise<Coleccion[]> {
  const { data, error } = await supabase.from('collections').select(COLUMNAS).order('created_at', { ascending: true });
  if (error) {
    registrarError('mapa.colecciones', error);
    throw error;
  }
  return (data ?? []) as Coleccion[];
}

export async function leerPertenencias(): Promise<Pertenencia[]> {
  const { data, error } = await supabase.from('collection_places').select('collection_id, place_id, added_at, added_by');
  if (error) {
    registrarError('mapa.pertenencias', error);
    throw error;
  }
  return (data ?? []) as Pertenencia[];
}

const traducir = (contexto: string, error: unknown): ErrorGasto => {
  registrarError(contexto, error);
  return new ErrorGasto(mensajeErrorMapa(error, true), (error as { code?: string } | null)?.code);
};

/** Alta idempotente (el id lo genera la app) y, si se piden, sus sitios. El primer sitio fija la principal de ese sitio si no tenía otra. */
export async function crearColeccion(
  id: string,
  coupleId: string,
  f: { nombre: string; icono: string; visible: boolean },
  sitios: string[] = [],
): Promise<void> {
  const { error } = await supabase
    .from('collections')
    .upsert({ id, couple_id: coupleId, name: f.nombre.trim(), icon: f.icono, visible_to_partner: f.visible }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw traducir('mapa.coleccion.crear', error);
  await anadirSitiosAColeccion(id, coupleId, sitios);
}

/** Añade sitios a una colección (idempotente: los que ya están no cambian). */
export async function anadirSitiosAColeccion(coleccionId: string, coupleId: string, sitios: string[]): Promise<void> {
  if (sitios.length === 0) return;
  const { error } = await supabase
    .from('collection_places')
    .upsert(sitios.map((place_id) => ({ collection_id: coleccionId, place_id, couple_id: coupleId })), { onConflict: 'collection_id,place_id', ignoreDuplicates: true });
  if (error) throw traducir('mapa.coleccion.sitios', error);
}

/** Quita un sitio de una colección (DELETE directo de `collection_places`: el sitio sigue existiendo y no pide aprobación). */
export const quitarSitioDeColeccion = (coleccionId: string, sitioId: string, coupleId: string) =>
  guardarColeccionesDeSitio(sitioId, coupleId, { primero: [], despues: [], quitar: [coleccionId], fijarPrincipal: null });

/** Edición con control de versión: si la otra persona la cambió antes, no toca nada y avisa. */
export async function editarColeccion(
  id: string,
  version: number,
  cambios: Partial<{ name: string; icon: string; visible_to_partner: boolean }>,
  nombrePareja: string,
): Promise<void> {
  const { data, error } = await supabase.from('collections').update(cambios).eq('id', id).eq('version', version).select('id');
  if (error) throw traducir('mapa.coleccion.editar', error);
  if (!data || data.length === 0) {
    throw new ErrorGasto(`${nombrePareja} acaba de cambiar esta colección. Revísala y vuelve a intentarlo.`, 'version');
  }
}

/**
 * Aplica `pasosGuardado` a un sitio, por orden: primero las colecciones que fijan la principal, luego el resto, después las que se
 * quitan (DELETE directo: no pide aprobación) y al final la principal si no basta con el trigger. Reintentar es seguro.
 */
export async function guardarColeccionesDeSitio(sitioId: string, coupleId: string, pasos: PasosGuardado): Promise<void> {
  const insertar = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('collection_places')
      .upsert(ids.map((collection_id) => ({ collection_id, place_id: sitioId, couple_id: coupleId })), { onConflict: 'collection_id,place_id', ignoreDuplicates: true });
    if (error) throw traducir('mapa.coleccion.anadir', error);
  };
  await insertar(pasos.primero);
  await insertar(pasos.despues);
  if (pasos.quitar.length > 0) {
    const { error } = await supabase.from('collection_places').delete().eq('place_id', sitioId).in('collection_id', pasos.quitar);
    if (error) throw traducir('mapa.coleccion.quitar', error);
  }
  if (pasos.fijarPrincipal) {
    const { error } = await supabase.from('places').update({ primary_collection_id: pasos.fijarPrincipal }).eq('id', sitioId);
    if (error) throw traducir('mapa.coleccion.principal', error);
  }
}

/** Qué pasaría al borrarla (orientativo). Falla o devuelve algo raro → null: la hoja usa el texto genérico. */
export async function previsionBorrarColeccion(id: string): Promise<PrevisionBorrado | null> {
  const { data, error } = await supabase.rpc('preview_collection_deletion', { p_collection_id: id });
  if (error) {
    registrarError('mapa.previsionBorrado', error);
    return null;
  }
  return esPrevision(data) ? data : null;
}
