/**
 * Lecturas y escrituras de pagos recurrentes (docs/plan-gastos-fase4.md §4). Los cobros los crea el job
 * del servidor; desde aquí solo se pone el importe de un cobro variable (creando su gasto) o se salta.
 */
import { esErrorDeRed } from '@/lib/auth/errores';
import { ErrorGasto } from '@/lib/gastos/error';
import type { Cobro, Recurrente } from '@/lib/gastos/recurrentes';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

const COLUMNAS_REC =
  'id, name, category, amount_cents, is_variable, frequency, day_of_month, month_of_year, start_date, end_date, paused, paid_by, split_mode, split_pct_m1, reminder_days, visible_to_partner, show_in_calendar, created_by, version, active_from';
const COLUMNAS_COBRO = 'id, due_date, status, amount_cents';
const SIN_CONEXION = 'No hay conexión. Inténtalo de nuevo.';

const MENSAJES: Record<string, string> = {
  TW011: 'Un pago privado tiene que ser solo tuyo y pagado por ti.',
  TW012: 'El bote común no está activado. Elige quién paga.',
  TW080: 'Solo se puede saltar un cobro o deshacer el salto.',
  TW081: 'Este cobro ya está apuntado: borra su gasto para cambiarlo.',
  TW082: 'Este cobro ya no existe.',
  '23505': 'Este cobro ya estaba apuntado.',
};

function traducir(contexto: string, error: unknown): ErrorGasto {
  registrarError(contexto, error);
  const codigo = (error as { code?: string } | null)?.code;
  if (esErrorDeRed(error)) return new ErrorGasto(SIN_CONEXION, 'red');
  return new ErrorGasto((codigo && MENSAJES[codigo]) || 'No se ha podido guardar. Inténtalo de nuevo.', codigo);
}

const fallo = (contexto: string, error: unknown): never => {
  registrarError(contexto, error);
  throw error;
};

/** Lo que se guarda al crear o editar (el resto lo pone el servidor). */
export type DatosRecurrente = Omit<Recurrente, 'id' | 'created_by' | 'version' | 'paused'>;

/** Último cobro de cada recurrente desde su `active_from` (para el próximo cobro: uno por periodo). */
type CobroBreve = Pick<Cobro, 'due_date' | 'status' | 'amount_cents'>;

/**
 * Lo que la lista necesita de los cobros: el último desde `active_from` (uno por periodo) y, en los variables,
 * la última factura ya apuntada y si el último cobro espera el importe.
 */
function conUltimo(r: Recurrente, cobros: CobroBreve[]): Recurrente {
  const desde = r.active_from ?? '';
  const ordenados = [...cobros].sort((a, b) => b.due_date.localeCompare(a.due_date));
  const ultimo = ordenados.find((c) => c.due_date >= desde)?.due_date ?? null;
  const pagado = ordenados.find((c) => c.status === 'paid' && c.amount_cents);
  return {
    ...r,
    ultimo_cobro: ultimo,
    ultima_factura: r.is_variable && pagado?.amount_cents ? { fecha: pagado.due_date, cents: pagado.amount_cents } : null,
    falta_importe: r.is_variable && ordenados[0]?.status === 'pending',
  };
}

export async function leerRecurrentes(): Promise<Recurrente[]> {
  const haceUnAnio = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const [r, c] = await Promise.all([
    supabase.from('recurring_payments').select(COLUMNAS_REC).order('name'),
    supabase.from('recurring_occurrences').select('recurring_id, due_date, status, amount_cents').gte('due_date', haceUnAnio),
  ]);
  if (r.error) fallo('recurrentes.lista', r.error);
  if (c.error) fallo('recurrentes.ultimos', c.error);
  const porRecurrente = new Map<string, CobroBreve[]>();
  for (const x of (c.data ?? []) as (CobroBreve & { recurring_id: string })[]) {
    porRecurrente.set(x.recurring_id, [...(porRecurrente.get(x.recurring_id) ?? []), x]);
  }
  return ((r.data ?? []) as Recurrente[]).map((x) => conUltimo(x, porRecurrente.get(x.id) ?? []));
}

export type CobroConGasto = Cobro & { gastoId: string | null };

/** Un recurrente con sus últimos cobros (y el gasto de cada uno, si lo hay). */
export async function leerRecurrente(id: string): Promise<{ recurrente: Recurrente; cobros: CobroConGasto[] } | null> {
  const [r, c] = await Promise.all([
    supabase.from('recurring_payments').select(COLUMNAS_REC).eq('id', id).maybeSingle(),
    supabase.from('recurring_occurrences').select(COLUMNAS_COBRO).eq('recurring_id', id).order('due_date', { ascending: false }).limit(6),
  ]);
  if (r.error) fallo('recurrentes.uno', r.error);
  if (c.error) fallo('recurrentes.cobros', c.error);
  if (!r.data) return null;
  const cobros = (c.data ?? []) as Cobro[];
  const ids = cobros.map((x) => x.id);
  const gastos = ids.length
    ? await supabase.from('expenses').select('id, recurring_occurrence_id').in('recurring_occurrence_id', ids)
    : { data: [], error: null };
  if (gastos.error) fallo('recurrentes.gastos', gastos.error);
  const porCobro = new Map(
    ((gastos.data ?? []) as { id: string; recurring_occurrence_id: string }[]).map((g) => [g.recurring_occurrence_id, g.id]),
  );
  return {
    recurrente: conUltimo(r.data as Recurrente, cobros),
    cobros: cobros.map((x) => ({ ...x, gastoId: porCobro.get(x.id) ?? null })),
  };
}

/** Cobro pendiente con su recurrente (tarjeta de Inicio). */
export async function leerCobro(id: string): Promise<{ cobro: Cobro; recurrente: Recurrente } | null> {
  const { data, error } = await supabase
    .from('recurring_occurrences')
    .select(`${COLUMNAS_COBRO}, recurrente:recurring_payments(${COLUMNAS_REC})`)
    .eq('id', id)
    .maybeSingle();
  if (error) fallo('recurrentes.cobro', error);
  if (!data) return null;
  const { recurrente, ...cobro } = data as unknown as Cobro & { recurrente: Recurrente | null };
  return recurrente ? { cobro, recurrente } : null;
}

/** Alta idempotente: el id lo genera la app al abrir el formulario. */
export async function crearRecurrente(id: string, coupleId: string, datos: DatosRecurrente): Promise<void> {
  const { data, error } = await supabase
    .from('recurring_payments')
    .upsert({ id, couple_id: coupleId, ...datos }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (error) throw traducir('recurrentes.crear', error);
  if (data && data.length > 0) return;
  const ya = await supabase.from('recurring_payments').select('id').eq('id', id).maybeSingle();
  if (ya.error || !ya.data) throw new ErrorGasto('No se ha podido guardar. Inténtalo de nuevo.');
}

/** Edición con control de versión, enviando solo lo que cambia. */
export async function editarRecurrente(
  id: string,
  version: number,
  cambios: Partial<DatosRecurrente> & { paused?: boolean },
  nombrePareja: string,
): Promise<void> {
  const { data, error } = await supabase.from('recurring_payments').update(cambios).eq('id', id).eq('version', version).select('id');
  if (error) throw traducir('recurrentes.editar', error);
  if (!data || data.length === 0) {
    throw new ErrorGasto(`${nombrePareja} acaba de cambiar este pago. Revísalo y vuelve a intentarlo.`, 'version');
  }
}

/**
 * Pone el importe real de un cobro variable: crea su gasto (id de la app, idempotente) con el reparto del
 * recurrente. El trigger del gasto marca el cobro como pagado.
 */
export async function ponerImporte(idGasto: string, coupleId: string, cobro: Cobro, r: Recurrente, cents: number): Promise<void> {
  const { data, error } = await supabase
    .from('expenses')
    .upsert(
      {
        id: idGasto,
        couple_id: coupleId,
        concept: r.name,
        amount_cents: cents,
        category: r.category,
        spent_on: cobro.due_date,
        paid_by: r.paid_by,
        split_mode: r.split_mode,
        split_pct_m1: r.split_pct_m1,
        visible_to_partner: r.visible_to_partner,
        recurring_occurrence_id: cobro.id,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) {
    if ((error as { code?: string }).code === 'TW012') {
      registrarError('recurrentes.ponerImporte', error);
      throw new ErrorGasto('El bote está desactivado: activa el bote en Ajustes o cambia quién paga en el pago.', 'TW012');
    }
    throw traducir('recurrentes.ponerImporte', error);
  }
  if (data && data.length > 0) return;
  const ya = await supabase.from('expenses').select('id, amount_cents').eq('id', idGasto).maybeSingle();
  if (ya.error || !ya.data) throw new ErrorGasto('No se ha podido guardar. Inténtalo de nuevo.');
}

/** Saltar un cobro pendiente («Este mes no») o deshacerlo. */
export async function saltarCobro(id: string, saltar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('recurring_occurrences')
    .update({ status: saltar ? 'skipped' : 'pending' })
    .eq('id', id)
    .eq('status', saltar ? 'pending' : 'skipped')
    .select('id');
  if (error) throw traducir('recurrentes.saltar', error);
  if (!data || data.length === 0) throw new ErrorGasto('Este cobro ya no está pendiente.', 'TW081');
}

/** De qué pago recurrente viene un gasto (detalle del gasto). */
export async function leerOrigen(cobroId: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('recurring_occurrences')
    .select('recurrente:recurring_payments(id, name)')
    .eq('id', cobroId)
    .maybeSingle();
  if (error) fallo('recurrentes.origen', error);
  return ((data as unknown as { recurrente: { id: string; name: string } | null } | null)?.recurrente) ?? null;
}
