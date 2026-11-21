/** Lecturas y escrituras del calendario (docs/plan-calendario.md §4). */
import { type FilaRango, claveBorrado } from '@/lib/calendario/agrupar';
import {
  COLUMNAS_EVENTO,
  type DatosEvento,
  type DatosEventoNuevo,
  type Evento,
  type FilaEvento,
  aEvento,
} from '@/lib/calendario/evento';
import {
  COLUMNAS,
  type DatosGasto,
  ErrorGasto,
  type Gasto,
  editarGasto,
  leerGasto,
  soloCambios,
  traducir,
} from '@/lib/gastos/consultas';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

/**
 * Eventos, pagos y planes de [desde, hasta] (como mucho 100 días; se pide la rejilla visible, ≤ 42).
 * La RLS ya oculta los secretos y los recurrentes privados de la pareja: aquí no se filtra nada.
 */
export async function leerRango(desde: string, hasta: string): Promise<FilaRango[]> {
  const { data, error } = await supabase.rpc('calendar_range', { p_from: desde, p_to: hasta });
  if (error) {
    registrarError('calendario.rango', error);
    throw error;
  }
  return (data ?? []) as FilaRango[];
}

/** Gasto de un cobro de un pago recurrente (`expenses.recurring_occurrence_id`), o null si no hay o no se ve. */
export async function gastoDeCobro(cobroId: string): Promise<string | null> {
  const { data, error } = await supabase.from('expenses').select('id').eq('recurring_occurrence_id', cobroId).maybeSingle();
  if (error) {
    registrarError('calendario.gastoDeCobro', error);
    throw error;
  }
  return (data as { id: string } | null)?.id ?? null;
}

// -----------------------------------------------------------------------------
// Fase B: eventos (docs/plan-calendario.md §4)
// -----------------------------------------------------------------------------

/** Un evento, o null si no existe o no se ve (un secreto de tu pareja, por la RLS). */
export async function leerEvento(id: string): Promise<Evento | null> {
  const { data, error } = await supabase.from('events').select(COLUMNAS_EVENTO).eq('id', id).maybeSingle();
  if (error) {
    registrarError('calendario.evento', error);
    throw error;
  }
  return data ? aEvento(data as unknown as FilaEvento) : null;
}

/**
 * Alta idempotente: el id lo genera la app al abrir el formulario, así un reintento no duplica el evento.
 * Nunca se envían `time_zone` ni `created_by` (los pone el servidor).
 */
export async function crearEvento(id: string, coupleId: string, datos: DatosEventoNuevo): Promise<void> {
  const { data, error } = await supabase
    .from('events')
    .upsert({ id, couple_id: coupleId, ...datos }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (error) throw traducir('calendario.crearEvento', error);
  if (data && data.length > 0) return;
  // Ya existía: un intento anterior llegó al servidor aunque la app no recibiera la respuesta.
  // Si la persona corrigió algo antes de reintentar, se aplica sobre lo guardado.
  const guardado = await leerEvento(id);
  if (!guardado) throw new ErrorGasto('No se ha podido guardar. Inténtalo de nuevo.');
  // Se guardó compartido y ahora se quiere secreto: ya no se puede ocultar (TW051) y la pareja quizá ya lo ha
  // visto. Se avisa en vez de dejarlo compartido en silencio. Al revés (era secreto y ahora no) se revela abajo.
  if (datos.is_secret && !guardado.is_secret) {
    throw new ErrorGasto('Este evento ya se guardó como compartido y no se puede volver secreto. Revísalo en el calendario.', 'TW051');
  }
  const { is_secret: secreto, plan_id: _plan, ...editables } = datos;
  const cambios: Partial<DatosEvento> & { is_secret?: false } = soloCambios(guardado, editables);
  if (!secreto && guardado.is_secret) cambios.is_secret = false;
  if (Object.keys(cambios).length > 0) await editarEvento(id, guardado.version, cambios, 'Tu pareja');
}

const cambiado = (nombrePareja: string) => `${nombrePareja} ha cambiado este evento mientras tanto. Revisa el evento y vuelve a guardar.`;

/** Edición con control de versión, enviando solo lo que cambia. En un evento repetido cambia TODA la serie. */
export async function editarEvento(
  id: string,
  version: number,
  cambios: Partial<DatosEvento> & { is_secret?: false },
  nombrePareja: string,
): Promise<void> {
  const { data, error } = await supabase.from('events').update(cambios).eq('id', id).eq('version', version).select('id');
  if (error) throw traducir('calendario.editarEvento', error);
  if (!data || data.length === 0) throw new ErrorGasto(cambiado(nombrePareja), 'version');
}

/** Revelar un secreto a la pareja (`is_secret` true → false). No se puede volver a ocultar (TW051). */
export async function revelarEvento(id: string, version: number, nombrePareja: string): Promise<void> {
  const { data, error } = await supabase.from('events').update({ is_secret: false }).eq('id', id).eq('version', version).select('id');
  if (error) throw traducir('calendario.revelarEvento', error);
  if (!data || data.length === 0) throw new ErrorGasto(cambiado(nombrePareja), 'version');
}

/**
 * Solicitudes de borrado pendientes y vigentes de eventos y pagos recurrentes, como claves de `claveBorrado`
 * (el id, y con la fecha si es de «solo este día»): las filas del calendario dicen «Pendiente de borrar».
 */
export async function leerBorradosPendientes(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('deletion_requests')
    .select('target_id, occurrence_date')
    .in('target_type', ['event', 'recurring_payment'])
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());
  if (error) {
    registrarError('calendario.borradosPendientes', error);
    throw error;
  }
  return new Set(((data ?? []) as { target_id: string; occurrence_date: string | null }[]).map((f) => claveBorrado(f.target_id, f.occurrence_date)));
}

// -----------------------------------------------------------------------------
// Fase C: «¿Quién pagó?» (docs/plan-calendario.md §2 «¿Quién pagó?» y §4)
// -----------------------------------------------------------------------------

/** Mensajes al apuntar el gasto de un evento (pisan a los generales de `traducir`). */
const mensajesQuienPago = (nombrePareja: string): Record<string, string> => ({
  TW060: 'Ese evento ya no existe.',
  '23505': `${nombrePareja} ya lo ha apuntado.`,
});

/** Gastos enlazados a un evento (`expenses.event_id`); la RLS deja fuera los privados de la pareja. */
export async function gastosDelEvento(eventoId: string): Promise<Gasto[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(COLUMNAS)
    .eq('event_id', eventoId)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    registrarError('calendario.gastosDelEvento', error);
    throw error;
  }
  return (data ?? []) as unknown as Gasto[];
}

/**
 * Apunta el gasto de un evento. `id` lo fija la app: en la pregunta «¿Quién pagó?» es el id DEL EVENTO, así que
 * si los dos responden a la vez solo entra uno y el segundo recibe «{Pareja} ya lo ha apuntado» en vez de un
 * gasto doble. En «Añadir gasto» (varios gastos por evento) es un uuid de la hoja, y el reintento tras un fallo
 * de red no lo duplica. El servidor cierra la pregunta (`who_paid_resolved_at`) con un trigger al crear el gasto.
 */
export async function crearGastoDeEvento(
  id: string,
  coupleId: string,
  userId: string,
  datos: DatosGasto,
  nombrePareja: string,
): Promise<void> {
  const mensajes = mensajesQuienPago(nombrePareja);
  const { data, error } = await supabase
    .from('expenses')
    .upsert({ id, couple_id: coupleId, ...datos }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (error) throw traducir('calendario.crearGastoDeEvento', error, mensajes);
  if (data && data.length > 0) return;
  // Ya existía ese id. Si es mío, un intento anterior llegó al servidor aunque la app no recibiera la respuesta
  // (si se corrigió algo antes de reintentar, se aplica sobre lo guardado). Si no, lo apuntó la pareja.
  const guardado = await leerGasto(id);
  if (!guardado || guardado.created_by !== userId) throw new ErrorGasto(mensajes['23505'], '23505');
  const cambios = soloCambios(guardado, datos);
  if (Object.keys(cambios).length > 0) await editarGasto(id, guardado.version, cambios, nombrePareja);
}

/**
 * «No hubo gasto»: cierra la pregunta (`who_paid_resolved_at = now()`). Solo si sigue abierta: si la pareja ya
 * respondió (con gasto o sin él) no hay nada que hacer y no se toca. No lleva control de versión: no cambia
 * ninguna otra columna, así que no pisa una edición de la pareja.
 */
export async function descartarQuienPago(eventoId: string): Promise<void> {
  const { data, error } = await supabase
    .from('events')
    .update({ who_paid_resolved_at: new Date().toISOString() })
    .eq('id', eventoId)
    .is('who_paid_resolved_at', null)
    .select('id');
  if (error) throw traducir('calendario.descartarQuienPago', error, { TW060: 'Ese evento ya no existe.' });
  if (data && data.length > 0) return;
  // Nada que cerrar: o ya estaba respondida (bien) o el evento ya no existe / no se ve.
  if (!(await leerEvento(eventoId))) throw new ErrorGasto('Ese evento ya no existe.', 'TW060');
}
