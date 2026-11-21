import type { Hueco } from '@/lib/calendario/evento';
import { crearEvento } from '@/lib/calendario/consultas';
import type { Categoria } from '@/lib/gastos/categorias';
import { datosEventoGasto, idEventoDeGasto, idVisitaDeGasto } from '@/lib/gastos/visitaAutomatica';
import { anadirVisita } from '@/lib/mapa/consultas';
import type { SitioDeVisita } from '@/lib/mapa/eventoVisita';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

type Gasto = { id: string; concepto: string; categoria: Categoria; fecha: string; privado: boolean; sitioId: string | null };

/**
 * Da por hecha la salida de un gasto nuevo: con sitio, apunta la visita (que deja el sitio en «Hemos ido» y crea su
 * evento del día); sin sitio, crea un evento de todo el día. Nunca lanza: el gasto ya está guardado.
 */
export async function marcarSalida(coupleId: string, yo: Hueco, g: Gasto): Promise<void> {
  try {
    if (!g.sitioId) {
      await crearEvento(idEventoDeGasto(g.id), coupleId, datosEventoGasto(g, yo));
      return;
    }
    const { data: sitio, error } = await supabase.from('places').select('id, name, category, visible_to_partner').eq('id', g.sitioId).maybeSingle();
    if (error) throw error;
    if (!sitio) return;
    const { data: previas, error: e2 } = await supabase.from('place_visits').select('id').eq('place_id', g.sitioId).eq('visited_on', g.fecha).limit(1);
    if (e2) throw e2;
    if (previas && previas.length > 0) return;
    await anadirVisita(idVisitaDeGasto(g.id), coupleId, sitio as SitioDeVisita, yo, g.fecha, '');
  } catch (e) {
    registrarError('gastos.marcarSalida', e);
  }
}
