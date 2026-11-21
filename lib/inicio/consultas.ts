import type { EventoReciente } from '@/lib/inicio/inicio';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

/** Los últimos eventos creados (para «Últimos movimientos» y para saber si hay alguno). La RLS oculta los secretos de la pareja. */
export async function leerEventosRecientes(): Promise<EventoReciente[]> {
  const { data, error } = await supabase.from('events').select('id, title, created_by, created_at').order('created_at', { ascending: false }).limit(5);
  if (error) {
    registrarError('inicio.eventosRecientes', error);
    throw error;
  }
  return (data ?? []) as EventoReciente[];
}
