/**
 * Mi valoración y mi nota de un sitio (`place_notes`, docs/plan-mapa.md F5). La RLS solo deja escribir mi fila.
 * La fila no lleva `version`: solo yo la escribo, así que no hay otra persona con quien chocar (gana lo último que guardé).
 */
import { ErrorGasto } from '@/lib/gastos/error';
import { mensajeErrorMapa } from '@/lib/mapa/error';
import { estaVacia, limpiarNota } from '@/lib/mapa/valoracion';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

/** Guarda mi valoración y nota; si no queda nada de las dos, borra mi fila. */
export async function guardarMiNota(placeId: string, coupleId: string, userId: string, rating: number | null, note: string): Promise<void> {
  const limpia = limpiarNota(rating, note);
  const { error } = estaVacia(limpia)
    ? await supabase.from('place_notes').delete().eq('place_id', placeId).eq('user_id', userId)
    : await supabase.from('place_notes').upsert({ place_id: placeId, couple_id: coupleId, user_id: userId, ...limpia }, { onConflict: 'place_id,user_id' });
  if (error) {
    registrarError('mapa.nota', error);
    throw new ErrorGasto(mensajeErrorMapa(error), (error as { code?: string }).code);
  }
}
