/** Lecturas y escrituras de los planes (docs/modelo-datos.md §3). La RLS ya limita todo a la pareja. */
import { ErrorGasto } from '@/lib/gastos/error';
import { mensajeErrorPlan } from '@/lib/planificador/error';
import type { FilaPlan, FilaTarea, Plan, PlanLista, Tarea } from '@/lib/planificador/tipos';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

const COLUMNAS =
  'id, type, name, icon, destination, start_date, end_date, budget_cents, default_split_mode, default_split_pct_m1, notes, created_by, version';

/**
 * Todos los planes con lo gastado, en dos lecturas unidas aquí. Si la vista `plan_summaries` falla, los planes salen igual
 * y `gastado_cents` queda en `null` (no se inventa).
 */
export async function leerPlanes(): Promise<PlanLista[]> {
  const [planes, resumenes] = await Promise.all([
    supabase.from('plans').select(COLUMNAS).order('start_date', { ascending: true }),
    supabase.from('plan_summaries').select('plan_id, spent_cents'),
  ]);
  if (planes.error) {
    registrarError('planificador.planes', planes.error);
    throw planes.error;
  }
  if (resumenes.error) registrarError('planificador.resumenes', resumenes.error);
  const gastado = new Map<string, number>((resumenes.data ?? []).map((r) => [r.plan_id as string, Number(r.spent_cents)]));
  return ((planes.data ?? []) as Plan[]).map((p) => ({ ...p, gastado_cents: resumenes.error ? null : (gastado.get(p.id) ?? 0) }));
}

const traducir = (contexto: string, error: unknown): ErrorGasto => {
  registrarError(contexto, error);
  return new ErrorGasto(mensajeErrorPlan(error), (error as { code?: string } | null)?.code);
};

/** Alta idempotente: el id lo genera la app, así reintentar tras un fallo de red no duplica el plan. */
export async function crearPlan(id: string, coupleId: string, fila: FilaPlan): Promise<void> {
  const { error } = await supabase.from('plans').upsert({ id, couple_id: coupleId, ...fila }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw traducir('planificador.crear', error);
}

/** Edición con control de versión: si la otra persona lo cambió antes, no toca nada y avisa (`codigo: 'version'`). */
export async function editarPlan(id: string, version: number, fila: FilaPlan, nombrePareja: string): Promise<void> {
  const { data, error } = await supabase.from('plans').update(fila).eq('id', id).eq('version', version).select('id');
  if (error) throw traducir('planificador.editar', error);
  if (!data || data.length === 0) {
    throw new ErrorGasto(`${nombrePareja} acaba de cambiar este plan. Revísalo y vuelve a intentarlo.`, 'version');
  }
}

const COLUMNAS_TAREA = 'id, plan_id, kind, title, detail, assignee, status, done_by, due_date, place_id, position, version';

/** Todas las tareas de todos los planes en una sola lectura: la tarjeta de cada plan y el detalle filtran de aquí. */
export async function leerTareas(): Promise<Tarea[]> {
  const { data, error } = await supabase.from('plan_tasks').select(COLUMNAS_TAREA).order('position', { ascending: true });
  if (error) {
    registrarError('planificador.tareas', error);
    throw error;
  }
  return (data ?? []) as Tarea[];
}

type FilaTareaConId = FilaTarea & { id: string; position: number };

/** Alta idempotente (id del cliente). También sirve para insertar de golpe las tareas sugeridas de un plan recién creado. */
export async function crearTareas(coupleId: string, planId: string, filas: FilaTareaConId[]): Promise<void> {
  const { error } = await supabase
    .from('plan_tasks')
    .upsert(filas.map((f) => ({ couple_id: coupleId, plan_id: planId, ...f })), { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw traducir('planificador.tareas.crear', error);
}

/** Edición con control de versión (como los planes): 0 filas = la otra persona la cambió o la borró. */
export async function editarTarea(id: string, version: number, fila: FilaTarea, nombrePareja: string): Promise<void> {
  const { data, error } = await supabase.from('plan_tasks').update(fila).eq('id', id).eq('version', version).select('id');
  if (error) throw traducir('planificador.tareas.editar', error);
  if (!data || data.length === 0) {
    throw new ErrorGasto(`${nombrePareja} acaba de cambiar esta tarea. Revísala y vuelve a intentarlo.`, 'version');
  }
}

/** Marcar o deshacer: sin versión (es una casilla, gana la última). `done_at` y `done_by` los pone el servidor. */
export async function marcarTarea(id: string, hecha: boolean): Promise<void> {
  const { error } = await supabase.from('plan_tasks').update({ status: hecha ? 'done' : 'pending' }).eq('id', id);
  if (error) throw traducir('planificador.tareas.marcar', error);
}

/** Borrar una tarea es directo, sin aprobación (es una checklist). */
export async function borrarTarea(id: string): Promise<void> {
  const { error } = await supabase.from('plan_tasks').delete().eq('id', id);
  if (error) throw traducir('planificador.tareas.borrar', error);
}
