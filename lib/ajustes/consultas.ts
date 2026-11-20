import { type Cambios, type FilaAjustes } from '@/lib/ajustes/ajustes';
import { type CampoAviso, type PreferenciasAvisos, aPreferencias } from '@/lib/avisos/estado';
import { esErrorDeRed } from '@/lib/auth/errores';
import { ErrorGasto } from '@/lib/gastos/error';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

/** Una propuesta de cambio de ajustes (`settings_proposals`). */
export type Propuesta = {
  id: string;
  changes: Cambios;
  proposed_by: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  decided_at: string | null;
};

export type DatosAjustes = {
  fila: FilaAjustes;
  /** Valor por defecto de «Visible para tu pareja» en mis gastos personales. */
  compartirPersonales: boolean;
  /** Lo mismo para los pagos recurrentes personales. */
  compartirRecurrentes: boolean;
  /** La propuesta pendiente (solo puede haber una por pareja). */
  pendiente: Propuesta | null;
  /** Mi última propuesta respondida en los últimos 3 días, para avisar de si se aceptó o no. */
  respondida: Propuesta | null;
  /** Mis interruptores de Avisos (`notify_*`). */
  avisos: PreferenciasAvisos;
  /** Cuándo se unió la segunda persona (fecha de «Juntos en ito desde…»). */
  juntosDesde: string | null;
  /**
   * Si estás solo: `nunca` (nadie se ha unido aún), `salio` (salió y puede volver con un código nuevo) o
   * `borrada` (borró su cuenta: join_couple ya no admite a nadie nuevo). Con la pareja dentro, null.
   */
  sinPareja: { estado: 'nunca' } | { estado: 'salio'; nombre: string } | { estado: 'borrada' } | null;
};

const COLUMNAS =
  'default_split, proportional_pct_m1, pot_enabled, pot_categories, pot_funding, pot_monthly_cents, pot_day, pot_pct_m1';
const COLUMNAS_PROPUESTA = 'id, changes, proposed_by, status, created_at, decided_at';
const SIN_CONEXION = 'No hay conexión. Inténtalo de nuevo.';
const AVISO_RESPONDIDA_MS = 3 * 86_400_000;

const MENSAJES: Record<string, string> = {
  TW030: 'Esta propuesta ya está respondida o retirada.',
  TW031: 'Ese cambio no se puede proponer.',
  TW032: 'Los ajustes no encajan (por ejemplo, Mixto sin bote común). Revísalos.',
  '23505': 'Ya hay una propuesta pendiente. Respondedla antes de proponer otra.',
  '42501': 'Tu pareja ya no está en el espacio. Vuelve a abrir Ajustes.',
};

function traducir(contexto: string, error: unknown): ErrorGasto {
  registrarError(contexto, error);
  const codigo = (error as { code?: string } | null)?.code;
  if (esErrorDeRed(error)) return new ErrorGasto(SIN_CONEXION, 'red');
  return new ErrorGasto((codigo && MENSAJES[codigo]) || 'No se ha podido guardar. Inténtalo de nuevo.', codigo);
}

export const aFila = (d: Record<string, unknown>): FilaAjustes => ({
  default_split: d.default_split as FilaAjustes['default_split'],
  proportional_pct_m1: Number(d.proportional_pct_m1),
  pot_enabled: Boolean(d.pot_enabled),
  pot_categories: (d.pot_categories ?? []) as FilaAjustes['pot_categories'],
  pot_funding: d.pot_funding as FilaAjustes['pot_funding'],
  pot_monthly_cents: d.pot_monthly_cents === null ? null : Number(d.pot_monthly_cents),
  pot_day: d.pot_day === null ? null : Number(d.pot_day),
  pot_pct_m1: Number(d.pot_pct_m1),
});

export async function leerFilaAjustes(): Promise<FilaAjustes | null> {
  const { data, error } = await supabase.from('couple_settings').select(COLUMNAS).maybeSingle();
  if (error) throw traducir('ajustes.fila', error);
  return data ? aFila(data) : null;
}

export async function leerDatosAjustes(userId: string): Promise<DatosAjustes | null> {
  const [s, m, p, inv] = await Promise.all([
    supabase.from('couple_settings').select(COLUMNAS).maybeSingle(),
    supabase.from('couple_members').select('user_id, joined_at, left_at, share_personal_expenses, share_personal_recurring, notify_payment_reminder, notify_events, notify_who_paid, notify_partner_expense, notify_settlements, notify_requests, profiles(display_name)'),
    supabase.from('settings_proposals').select(COLUMNAS_PROPUESTA).order('created_at', { ascending: false }).limit(5),
    supabase.from('couple_invitations').select('id').not('used_at', 'is', null).limit(1),
  ]);
  if (s.error) throw traducir('ajustes.leer', s.error);
  if (m.error) throw traducir('ajustes.miembros', m.error);
  if (p.error) throw traducir('ajustes.propuestas', p.error);
  if (!s.data) return null;
  const miembros = (m.data ?? []) as unknown as {
    user_id: string;
    joined_at: string;
    left_at: string | null;
    share_personal_expenses: boolean;
    share_personal_recurring: boolean;
    profiles: { display_name: string } | null;
  }[] & Partial<Record<CampoAviso, boolean>>[];
  const activos = miembros.filter((x) => x.left_at === null);
  const otraSalio = miembros.find((x) => x.user_id !== userId && x.left_at !== null);
  const invitacionUsada = !inv.error && (inv.data ?? []).length > 0;
  const sinPareja: DatosAjustes['sinPareja'] =
    activos.length === 2
      ? null
      : otraSalio
        ? { estado: 'salio', nombre: otraSalio.profiles?.display_name.trim() || 'Tu pareja' }
        : invitacionUsada
          ? { estado: 'borrada' }
          : { estado: 'nunca' };
  const propuestas = (p.data ?? []) as Propuesta[];
  const respondida =
    propuestas.find(
      (x) =>
        x.status !== 'pending' &&
        x.proposed_by === userId &&
        x.decided_at !== null &&
        Date.now() - new Date(x.decided_at).getTime() < AVISO_RESPONDIDA_MS,
    ) ?? null;
  return {
    fila: aFila(s.data),
    compartirPersonales: activos.find((x) => x.user_id === userId)?.share_personal_expenses ?? false,
    compartirRecurrentes: activos.find((x) => x.user_id === userId)?.share_personal_recurring ?? false,
    pendiente: propuestas.find((x) => x.status === 'pending') ?? null,
    // Solo si es más reciente que cualquier otra propuesta (si no, el aviso ya no tiene sentido).
    respondida: respondida && propuestas[0]?.id === respondida.id ? respondida : null,
    avisos: aPreferencias(activos.find((x) => x.user_id === userId) as Partial<Record<CampoAviso, boolean>> | undefined),
    juntosDesde: activos.length === 2 ? activos.map((x) => x.joined_at).sort()[1] : null,
    sinPareja,
  };
}

/** Propuesta pendiente por id (para la tarjeta de Inicio), con los ajustes actuales para el «antes». */
export async function leerPropuesta(id: string): Promise<{ propuesta: Propuesta; actual: FilaAjustes } | null> {
  const [p, s] = await Promise.all([
    supabase.from('settings_proposals').select(COLUMNAS_PROPUESTA).eq('id', id).maybeSingle(),
    supabase.from('couple_settings').select(COLUMNAS).maybeSingle(),
  ]);
  if (p.error) throw traducir('ajustes.propuesta', p.error);
  if (s.error) throw traducir('ajustes.propuestaFila', s.error);
  if (!p.data || !s.data) return null;
  return { propuesta: p.data as Propuesta, actual: aFila(s.data) };
}

/**
 * Estando solo en el espacio, los ajustes se cambian al momento. La RLS no lo deja si la pareja ya se unió:
 * entonces no se toca ninguna fila y se avisa con `codigo: 'pareja_unida'`.
 */
export async function guardarDirecto(coupleId: string, cambios: Cambios): Promise<void> {
  const { data, error } = await supabase.from('couple_settings').update(cambios).eq('couple_id', coupleId).select('couple_id');
  if (error) throw traducir('ajustes.guardar', error);
  if (!data || data.length === 0) {
    throw new ErrorGasto('Tu pareja acaba de unirse: ahora los cambios se proponen. Vuelve a intentarlo.', 'pareja_unida');
  }
}

/** Propone un cambio. El id lo genera la app al abrir la hoja: reintentar no crea dos propuestas. */
export async function proponer(id: string, coupleId: string, cambios: Cambios): Promise<void> {
  const { data, error } = await supabase
    .from('settings_proposals')
    .upsert({ id, couple_id: coupleId, changes: cambios }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (error) throw traducir('ajustes.proponer', error);
  if (data && data.length > 0) return;
  // Ya existía: era un reintento de esta misma propuesta.
  const ya = await supabase.from('settings_proposals').select('id').eq('id', id).maybeSingle();
  if (ya.error || !ya.data) throw new ErrorGasto('No se ha podido enviar. Inténtalo de nuevo.');
}

export async function responderPropuesta(id: string, aceptar: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_settings_proposal', { p_id: id, p_accept: aceptar });
  if (error) throw traducir('ajustes.responder', error);
}

/** Retira mi propuesta pendiente. Si ya no estaba (respondida mientras tanto), avisa. */
export async function retirarPropuesta(id: string): Promise<void> {
  const { data, error } = await supabase.from('settings_proposals').delete().eq('id', id).eq('status', 'pending').select('id');
  if (error) throw traducir('ajustes.retirar', error);
  if (!data || data.length === 0) throw new ErrorGasto(MENSAJES.TW030, 'TW030');
}

/** Mi preferencia de privacidad o de avisos (solo mía, sin aprobación). */
export type CampoPrivacidad = 'share_personal_expenses' | 'share_personal_recurring';

export async function guardarPrivacidad(userId: string, campo: CampoPrivacidad | CampoAviso, compartir: boolean): Promise<void> {
  const { error } = await supabase
    .from('couple_members')
    .update({ [campo]: compartir })
    .eq('user_id', userId)
    .is('left_at', null);
  if (error) throw traducir('ajustes.privacidad', error);
}

/** Borra la cuenta con la Edge Function `borrar-cuenta` (la clave service_role solo está en el servidor). */
export async function borrarCuenta(): Promise<void> {
  const { error } = await supabase.functions.invoke('borrar-cuenta', { method: 'POST' });
  if (error) {
    registrarError('ajustes.borrarCuenta', error);
    const sinRed = esErrorDeRed(error) || (error as { name?: string }).name === 'FunctionsFetchError';
    throw new ErrorGasto(sinRed ? SIN_CONEXION : 'No se ha podido borrar la cuenta. Inténtalo en unos minutos.');
  }
}
