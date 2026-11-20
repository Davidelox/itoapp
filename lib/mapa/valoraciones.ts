/**
 * Mi valoración y mi nota de un sitio (`place_notes`, docs/plan-mapa.md F5). La RLS solo deja escribir mi fila.
 * La fila no lleva `version`: solo yo la escribo, así que no hay otra persona con quien chocar (gana lo último que guardé).
 */
import { ErrorGasto } from '@/lib/gastos/error';
import { mensajeErrorMapa } from '@/lib/mapa/error';
import { estaVacia, limpiarNota, puedeValorar } from '@/lib/mapa/valoracion';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

/**
 * Guarda mi valoración y nota; si no queda nada de las dos, borra mi fila.
 * Con el sitio en «Quiero ir» las estrellas se ignoran y solo se toca la nota (una valoración ya guardada se conserva).
 */
export async function guardarMiNota(placeId: string, coupleId: string, userId: string, rating: number | null, note: string, estado: string): Promise<void> {
  const limpia = limpiarNota(rating, note);
  const soloNota = !puedeValorar(estado);
  const { error } = soloNota
    ? limpia.note === null
      ? await supabase.from('place_notes').update({ note: null }).eq('place_id', placeId).eq('user_id', userId)
      : await supabase.from('place_notes').upsert({ place_id: placeId, couple_id: coupleId, user_id: userId, note: limpia.note }, { onConflict: 'place_id,user_id' })
    : estaVacia(limpia)
    ? await supabase.from('place_notes').delete().eq('place_id', placeId).eq('user_id', userId)
    : await supabase.from('place_notes').upsert({ place_id: placeId, couple_id: coupleId, user_id: userId, ...limpia }, { onConflict: 'place_id,user_id' });
  if (error) {
    registrarError('mapa.nota', error);
    throw new ErrorGasto(mensajeErrorMapa(error), (error as { code?: string }).code);
  }
}
