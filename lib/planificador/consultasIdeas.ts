/** Lecturas y escrituras de las ideas y de su conversión en plan (docs/plan-planificador.md §F8). La RLS ya limita todo a la pareja. */
import { ErrorGasto } from '@/lib/gastos/error';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { anadirSitiosAColeccion } from '@/lib/mapa/consultasColecciones';
import { traducir } from '@/lib/planificador/consultas';
import type { FilaIdea, Idea } from '@/lib/planificador/ideas';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

const COLUMNAS = 'id, title, icon, type, place_id, notes, created_by, version, created_at';

export async function leerIdeas(): Promise<Idea[]> {
  const { data, error } = await supabase.from('ideas').select(COLUMNAS).order('created_at', { ascending: false });
  if (error) {
    registrarError('planificador.ideas', error);
    throw error;
  }
  return (data ?? []) as Idea[];
}

/** Alta idempotente: el id lo genera la app, así reintentar tras un fallo de red no duplica la idea. */
export async function crearIdea(id: string, coupleId: string, fila: FilaIdea): Promise<void> {
  const { error } = await supabase.from('ideas').upsert({ id, couple_id: coupleId, ...fila }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw traducir('planificador.ideas.crear', error);
}

/** Edición con control de versión: 0 filas = la otra persona la cambió o la borró. */
export async function editarIdea(id: string, version: number, fila: FilaIdea, nombrePareja: string): Promise<void> {
  const { data, error } = await supabase.from('ideas').update(fila).eq('id', id).eq('version', version).select('id');
  if (error) throw traducir('planificador.ideas.editar', error);
  if (!data || data.length === 0) {
    throw new ErrorGasto(`${nombrePareja} acaba de cambiar esta idea. Revísala y vuelve a intentarlo.`, 'version');
  }
}

/** Borrar una idea es directo, sin aprobación (es una lista de trabajo). Borrar una que ya no existe no es un error. */
export async function borrarIdea(id: string): Promise<void> {
  const { error } = await supabase.from('ideas').delete().eq('id', id);
  if (error) throw traducir('planificador.ideas.borrar', error);
}

/** Mete un sitio en la colección automática del plan (idempotente: si ya estaba, no cambia). */
export async function sitioAlPlan(planId: string, coupleId: string, sitioId: string): Promise<void> {
  const { data, error } = await supabase.from('collections').select('id').eq('plan_id', planId).maybeSingle();
  if (error) throw traducir('planificador.ideas.coleccion', error);
  if (!data) throw new ErrorGasto(ERROR_GENERICO);
  await anadirSitiosAColeccion((data as { id: string }).id, coupleId, [sitioId]);
}
