/**
 * Lecturas y escrituras de gastos (docs/plan-gastos.md §4). Las partes y el saldo los calcula el servidor:
 * aquí nunca se envían `share_*` ni se suman deudas.
 */
import { esErrorDeRed } from '@/lib/auth/errores';
import type { Categoria } from '@/lib/gastos/categorias';
import { categoriasQueCoinciden } from '@/lib/gastos/categorias';
import { soloCambios } from '@/lib/gastos/cambios';
import type { Party, RepartoPorDefecto, SplitMode } from '@/lib/gastos/reparto';
import type { AjustesBote, Movimiento } from '@/lib/gastos/bote';
import type { MetodoPago, Pago } from '@/lib/gastos/saldar';
import { resultadoBorrado, type ResultadoBorrado } from '@/lib/mapa/borradoColeccion';
import { formatearImporte } from '@/lib/dinero/importe';
import type { FilaAjustes } from '@/lib/ajustes/ajustes';
import { leerPropuesta, type Propuesta } from '@/lib/ajustes/consultas';
import { ErrorGasto } from '@/lib/gastos/error';
import { leerCobro } from '@/lib/gastos/consultasRecurrentes';
import type { Cobro, Recurrente } from '@/lib/gastos/recurrentes';
import { COLUMNAS_EVENTO, type Evento, type FilaEvento, type Hueco as HuecoEvento, aEvento } from '@/lib/calendario/evento';
import { vaAlEvento } from '@/lib/calendario/quienPago';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

export { soloCambios };

export const COLUMNAS =
  'id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, split_pct_m1, share_m1_cents, share_m2_cents, share_pot_cents, visible_to_partner, settlement_id, recurring_occurrence_id, event_id, event_title_snapshot, place_id, plan_id, plan_name_snapshot, plan_icon_snapshot, version, created_at, liquidacion:settlements(id, status, method, created_at), plan:plans(id, name, icon)';

export type Gasto = {
  id: string;
  created_by: string | null;
  concept: string;
  amount_cents: number;
  category: Categoria;
  spent_on: string;
  paid_by: Party;
  split_mode: SplitMode;
  split_pct_m1: number | null;
  share_m1_cents: number;
  share_m2_cents: number;
  share_pot_cents: number;
  visible_to_partner: boolean;
  settlement_id: string | null;
  /** Cobro de un pago recurrente del que viene (fase 4), si lo hay. */
  recurring_occurrence_id: string | null;
  /** Evento del calendario del que viene (la pregunta «¿Quién pagó?»), si lo hay y sigue existiendo. */
  event_id: string | null;
  /** Título del evento, guardado por el servidor al borrarlo (no en gastos compartidos de un secreto). */
  event_title_snapshot: string | null;
  /** Sitio del Mapa enlazado; null si no hay o se borró. */
  place_id: string | null;
  /** Plan del Planificador al que pertenece; null si no tiene o se borró (entonces quedan los `snapshot`). */
  plan_id: string | null;
  plan_name_snapshot: string | null;
  plan_icon_snapshot: string | null;
  /** El plan vivo (lectura embebida); null si no hay o se borró. */
  plan: { id: string; name: string; icon: string } | null;
  version: number;
  created_at: string;
  /** Pago que lo cubre (si lo hay). */
  liquidacion: { id: string; status: Pago['status']; method: MetodoPago; created_at: string } | null;
};

export type Saldo = {
  partner_owes_me_cents: number;
  /** Gastos abiertos con deuda entre los dos (aunque se compensen y el neto sea 0). */
  open_items: number;
  awaiting_confirmation_cents: number;
  pot_enabled: boolean;
  pot_balance_cents: number;
  /** Lo que el bote te debe (adelantaste en gastos del bote) y lo que le debe a tu pareja. */
  pot_owes_me_cents: number;
  pot_owes_partner_cents: number;
};

export type AjustesGastos = {
  reparto: RepartoPorDefecto;
  boteActivo: boolean;
  categoriasBote: Categoria[];
  pctProporcionalM1: number;
  /** Valor inicial de «Visible para tu pareja» en lo tuyo (couple_members.share_personal_expenses). */
  compartirPersonales: boolean;
  /** Lo mismo para los pagos recurrentes personales (fase 4). */
  compartirRecurrentes: boolean;
};

export type Filtros = { categoria: Categoria | null; texto: string };

export const TAM_PAGINA = 50;
const SIN_CONEXION = 'No hay conexión. Inténtalo de nuevo.';

/** Escapa los comodines de LIKE que escriba la persona (`%`, `_` y `\`). */
export const escaparLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const fallo = (contexto: string, error: unknown): never => {
  registrarError(contexto, error);
  throw error;
};

export async function leerSaldo(): Promise<Saldo | null> {
  const { data, error } = await supabase.rpc('get_balance');
  if (error) fallo('gastos.saldo', error);
  const fila = (data as Saldo[] | null)?.[0];
  if (!fila) return null;
  // bigint llega como número o como texto según el tamaño: se normaliza.
  return {
    partner_owes_me_cents: Number(fila.partner_owes_me_cents),
    open_items: Number(fila.open_items ?? 0),
    awaiting_confirmation_cents: Number(fila.awaiting_confirmation_cents),
    pot_enabled: fila.pot_enabled,
    pot_balance_cents: Number(fila.pot_balance_cents),
    pot_owes_me_cents: Number(fila.pot_owes_me_cents ?? 0),
    pot_owes_partner_cents: Number(fila.pot_owes_partner_cents ?? 0),
  };
}

export async function leerAjustes(userId: string): Promise<AjustesGastos | null> {
  const [s, m] = await Promise.all([
    supabase.from('couple_settings').select('default_split, pot_enabled, pot_categories, proportional_pct_m1').maybeSingle(),
    supabase.from('couple_members').select('share_personal_expenses, share_personal_recurring').eq('user_id', userId).is('left_at', null).maybeSingle(),
  ]);
  if (s.error) fallo('gastos.ajustes', s.error);
  if (!s.data) return null;
  return {
    reparto: s.data.default_split as RepartoPorDefecto,
    boteActivo: s.data.pot_enabled,
    categoriasBote: (s.data.pot_categories ?? []) as Categoria[],
    pctProporcionalM1: s.data.proportional_pct_m1,
    compartirPersonales: m.data?.share_personal_expenses ?? false,
    compartirRecurrentes: m.data?.share_personal_recurring ?? false,
  };
}

const ordenar = <T extends { order: (c: string, o: { ascending: boolean }) => T }>(q: T) =>
  q.order('spent_on', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false });

/**
 * Últimos gastos. `soloSinSaldar`: los que aún no están saldados, es decir, sin pago o con un pago
 * pendiente de confirmar (ese todavía cuenta en el saldo).
 */
export async function leerUltimos(cuantos = 5, soloSinSaldar = false): Promise<Gasto[]> {
  let q = supabase.from('expenses').select(COLUMNAS);
  if (soloSinSaldar) {
    const pendientes = await supabase.from('settlements').select('id').eq('status', 'pending');
    if (pendientes.error) fallo('gastos.ultimosPendientes', pendientes.error);
    const ids = (pendientes.data ?? []).map((f: { id: string }) => f.id);
    q = ids.length ? q.or(`settlement_id.is.null,settlement_id.in.(${ids.join(',')})`) : q.is('settlement_id', null);
  }
  const { data, error } = await ordenar(q).limit(cuantos);
  if (error) fallo('gastos.ultimos', error);
  return (data ?? []) as unknown as Gasto[];
}

/** Filtro de texto: concepto (ilike) o nombre de categoría («super» → Súper). */
/** Texto de búsqueda sin «*», que PostgREST trata como comodín y la RPC de totales no. */
export const limpiarBusqueda = (texto: string) => texto.replace(/\*/g, '').trim();

function filtroTexto(texto: string): string | null {
  const t = limpiarBusqueda(texto);
  if (!t) return null;
  const patron = `%${escaparLike(t)}%`.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const partes = [`concept.ilike."${patron}"`];
  const cats = categoriasQueCoinciden(t);
  if (cats.length) partes.push(`category.in.(${cats.join(',')})`);
  return partes.join(',');
}

export async function leerPagina(filtros: Filtros, desde: number): Promise<Gasto[]> {
  let q = supabase.from('expenses').select(COLUMNAS);
  if (filtros.categoria) q = q.eq('category', filtros.categoria);
  const texto = filtroTexto(filtros.texto);
  if (texto) q = q.or(texto);
  const { data, error } = await ordenar(q).range(desde, desde + TAM_PAGINA - 1);
  if (error) fallo('gastos.historial', error);
  return (data ?? []) as unknown as Gasto[];
}

/** Recuento y total de lo filtrado (RPC expense_totals). null si la migración aún no está aplicada. */
export async function leerTotales(filtros: Filtros): Promise<{ cuantos: number; totalCents: number } | null> {
  const t = limpiarBusqueda(filtros.texto);
  const { data, error } = await supabase.rpc('expense_totals', {
    p_category: filtros.categoria,
    p_query: t ? escaparLike(t) : null,
    p_query_categories: t ? categoriasQueCoinciden(t) : null,
  });
  if (error) {
    registrarError('gastos.totales', error);
    return null;
  }
  const fila = (data as { expense_count: number; total_cents: number }[] | null)?.[0];
  return fila ? { cuantos: Number(fila.expense_count), totalCents: Number(fila.total_cents) } : null;
}

/** Todos los gastos de un plan (también los saldados), del más reciente al más antiguo. */
export async function leerGastosPlan(planId: string): Promise<Gasto[]> {
  const { data, error } = await ordenar(supabase.from('expenses').select(COLUMNAS).eq('plan_id', planId));
  if (error) fallo('gastos.plan', error);
  return (data ?? []) as unknown as Gasto[];
}

export async function leerGasto(id: string): Promise<Gasto | null> {
  const { data, error } = await supabase.from('expenses').select(COLUMNAS).eq('id', id).maybeSingle();
  if (error) fallo('gastos.uno', error);
  return (data as unknown as Gasto | null) ?? null;
}

export type DatosGasto = {
  concept: string;
  amount_cents: number;
  category: Categoria;
  spent_on: string;
  paid_by: Party;
  split_mode: SplitMode;
  split_pct_m1: number | null;
  visible_to_partner: boolean;
  /** Solo al poner el importe de un cobro variable: enlaza el gasto con su cobro. */
  recurring_occurrence_id?: string;
  /** Solo al apuntar «¿Quién pagó?» de un evento: el servidor cierra la pregunta al crear el gasto. */
  event_id?: string;
  /** Sitio del Mapa (opcional); null lo quita. */
  place_id?: string | null;
  /** Plan del Planificador (opcional); null lo quita. Un gasto de un plan es siempre compartido (TW066). */
  plan_id?: string | null;
};

export { ErrorGasto };

/** Lo que se puede pedir borrar (desde Gastos y desde el Calendario). */
export type TipoBorrable = 'expense' | 'pot_movement' | 'recurring_payment' | 'event' | 'place' | 'collection' | 'plan';

const MENSAJES: Record<string, string> = {
  TW020: 'Algo ha cambiado mientras tanto (un gasto se ha editado, saldado o pedido borrar). Revisa la lista.',
  TW021: 'Este pago ya está respondido o no te toca confirmarlo.',
  TW022: 'Este pago ya no se puede deshacer.',
  TW060: 'Este gasto ya no existe.',
  TW062: 'Esta solicitud ya está resuelta o ha caducado.',
  TW063: 'Esta solicitud la tiene que aprobar tu pareja.',
  TW070: 'El bote ya no debe tanto (puede que alguien lo haya reembolsado). Revisa el importe.',
  TW071: 'Ya se había guardado otro movimiento. Revisa los movimientos del bote.',
  TW080: 'Solo se puede saltar un cobro o deshacer el salto.',
  TW081: 'Este cobro ya está apuntado: borra su gasto para cambiarlo.',
  TW010: 'Este gasto ya está saldado: el importe y el reparto no se pueden cambiar.',
  TW011: 'Un gasto privado tiene que ser solo tuyo y pagado por ti.',
  TW012: 'El bote común ya no está activado. Elige quién pagó.',
  TW013: 'Solo quien apuntó el gasto puede cambiar su visibilidad.',
  TW014: 'La moneda del gasto no es la de vuestro espacio.',
  TW066: 'Un gasto de un plan lo veis los dos: no puede ser privado.',
  // Eventos (calendario).
  TW050: 'El evento no puede terminar antes de empezar. Revisa la fecha y la hora.',
  TW051: 'Un evento compartido no se puede volver secreto.',
  TW052: 'El rango de fechas del calendario no es válido.',
  TW064: 'Ese sitio ya no está disponible.',
  TW067: 'Ese día está fuera de las fechas del plan. Elige uno del plan.',
  TW069: 'Un evento no puede cambiar de plan. Bórralo y créalo en el otro plan.',
};

/** Mensajes de TW060 cuando lo que se pide borrar es un evento (en gastos significa «este gasto ya no existe»). */
const MENSAJES_EVENTO: Record<string, string> = {
  TW060: 'Este evento ya no existe, o no ocurre ese día. Revisa el calendario.',
};
const MENSAJES_PLAN: Record<string, string> = { TW060: 'Este plan ya no existe.' };
const MENSAJES_SITIO: Record<string, string> = { TW060: 'Este sitio ya no existe.' };
const MENSAJES_COLECCION: Record<string, string> = {
  TW060: 'Esta colección ya no existe.',
  TW061: 'La colección de un plan se borra con el plan.',
};

/** Error de Supabase → `ErrorGasto` con un mensaje listo para mostrar. `mensajes` pisa los generales. */
export function traducir(contexto: string, error: unknown, mensajes?: Record<string, string>): ErrorGasto {
  registrarError(contexto, error);
  const codigo = (error as { code?: string } | null)?.code;
  if (esErrorDeRed(error)) return new ErrorGasto(SIN_CONEXION, 'red');
  const texto = codigo ? (mensajes?.[codigo] ?? MENSAJES[codigo]) : undefined;
  return new ErrorGasto(texto || 'No se ha podido guardar. Inténtalo de nuevo.', codigo);
}

/** Alta idempotente: el id lo genera la app, así un reintento no duplica el gasto. */
export async function crearGasto(id: string, coupleId: string, datos: DatosGasto): Promise<void> {
  const { data, error } = await supabase
    .from('expenses')
    .upsert({ id, couple_id: coupleId, ...datos }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (error) throw traducir('gastos.crear', error);
  if (data && data.length > 0) return;
  // Ya existía: un intento anterior llegó al servidor aunque la app no recibiera la respuesta.
  // Si la persona corrigió algo antes de reintentar, se aplica sobre lo guardado.
  const guardado = await leerGasto(id);
  if (!guardado) throw new ErrorGasto('No se ha podido guardar. Inténtalo de nuevo.');
  const cambios = soloCambios(guardado, datos);
  if (Object.keys(cambios).length > 0) await editarGasto(id, guardado.version, cambios, 'Tu pareja');
}

/** Edición con control de versión: si la otra persona lo cambió antes, no toca nada y avisa. */
export async function editarGasto(id: string, version: number, datos: Partial<DatosGasto>, nombrePareja: string): Promise<void> {
  const { data, error } = await supabase.from('expenses').update(datos).eq('id', id).eq('version', version).select('id');
  if (error) throw traducir('gastos.editar', error);
  if (!data || data.length === 0) {
    throw new ErrorGasto(`${nombrePareja} acaba de cambiar este gasto. Revísalo y vuelve a guardar.`, 'version');
  }
}

// -----------------------------------------------------------------------------
// Fase 2: saldar, pagos y borrados (docs/plan-gastos-fase2.md)
// -----------------------------------------------------------------------------

const COLUMNAS_PAGO = 'id, from_slot, to_slot, amount_cents, method, status, created_by, created_at, responded_by, responded_at';

/** Ids de gastos con una solicitud de borrado pendiente y vigente (no se pueden saldar). */
async function idsPendientesDeBorrar(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('deletion_requests')
    .select('target_id')
    .eq('target_type', 'expense')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());
  if (error) fallo('gastos.borradosPendientes', error);
  return new Set((data ?? []).map((f: { target_id: string }) => f.target_id));
}

/** Gastos abiertos y visibles (la app filtra los que generan deuda) y los pendientes de borrar. */
export async function leerAbiertos(): Promise<{ gastos: Gasto[]; pendientesDeBorrar: Set<string> }> {
  const [g, pendientes] = await Promise.all([
    ordenar(supabase.from('expenses').select(COLUMNAS).is('settlement_id', null).eq('visible_to_partner', true)),
    idsPendientesDeBorrar(),
  ]);
  if (g.error) fallo('gastos.abiertos', g.error);
  return { gastos: (g.data ?? []) as unknown as Gasto[], pendientesDeBorrar: pendientes };
}

/**
 * Salda esos gastos. `esperadoM1`: el importe que ve quien pulsa, con signo visto desde m1 (> 0 = m2 debe
 * a m1). Si el servidor calcula otro (alguien editó o añadió algo), responde TW020 y no registra nada.
 * Si la migración 20261117010000 aún no está aplicada, la función no admite ese parámetro: se llama sin él.
 */
export async function saldar(id: string, gastos: string[], metodo: MetodoPago, esperadoM1: number): Promise<Pago> {
  const base = { p_id: id, p_expense_ids: gastos, p_method: metodo };
  let { data, error } = await supabase.rpc('create_settlement', { ...base, p_expected_cents: esperadoM1 });
  if (error && ((error as { code?: string }).code === 'PGRST202' || (error as { code?: string }).code === '42883')) {
    ({ data, error } = await supabase.rpc('create_settlement', base));
  }
  if (error) throw traducir('gastos.saldar', error);
  return data as Pago;
}

export async function responderPago(id: string, aceptar: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_settlement', { p_id: id, p_accept: aceptar });
  if (error) throw traducir('gastos.responderPago', error);
}

export async function deshacerPago(id: string): Promise<void> {
  const { error } = await supabase.rpc('undo_settlement', { p_id: id });
  if (error) throw traducir('gastos.deshacerPago', error);
}

export async function leerPagos(): Promise<Pago[]> {
  const { data, error } = await supabase.from('settlements').select(COLUMNAS_PAGO).order('created_at', { ascending: false }).limit(200);
  if (error) fallo('gastos.pagos', error);
  return (data ?? []) as Pago[];
}

export async function leerPago(id: string): Promise<{ pago: Pago; gastos: Gasto[] } | null> {
  const [p, g] = await Promise.all([
    supabase.from('settlements').select(COLUMNAS_PAGO).eq('id', id).maybeSingle(),
    ordenar(supabase.from('expenses').select(COLUMNAS).eq('settlement_id', id)),
  ]);
  if (p.error) fallo('gastos.pago', p.error);
  if (g.error) fallo('gastos.pagoGastos', g.error);
  return p.data ? { pago: p.data as Pago, gastos: (g.data ?? []) as unknown as Gasto[] } : null;
}

/** Último pago tuyo rechazado en los últimos 7 días (aviso en Gastos). */
export async function leerPagoRechazado(userId: string): Promise<Pago | null> {
  const hace7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('settlements')
    .select(COLUMNAS_PAGO)
    .eq('status', 'rejected')
    .eq('created_by', userId)
    .gt('responded_at', hace7)
    .order('responded_at', { ascending: false })
    .limit(1);
  if (error) fallo('gastos.pagoRechazado', error);
  const rechazado = ((data ?? [])[0] as Pago | undefined) ?? null;
  if (!rechazado?.responded_at) return null;
  // Si después ya se registró otro pago entre los dos, el aviso sobra (revisión I7).
  const despues = await supabase.from('settlements').select('id').gt('created_at', rechazado.responded_at).limit(1);
  if (despues.error) fallo('gastos.pagoRechazado', despues.error);
  return (despues.data ?? []).length ? null : rechazado;
}

export type SolicitudBorrado = {
  id: string;
  target_id: string;
  /** Solo en los eventos: la fecha concreta que se pide borrar. null = toda la serie (o el gasto, el pago…). */
  occurrence_date: string | null;
  requested_by: string | null;
  created_at: string;
  expires_at: string;
};
const COLUMNAS_SOLICITUD = 'id, target_id, occurrence_date, requested_by, created_at, expires_at';

/**
 * Solicitud de borrado pendiente y vigente de un gasto (o evento, pago…), si la hay. `fecha`: la de un evento
 * repetido; sin ella se busca la de toda la serie (una solicitud de «solo este día» no cuenta como esa).
 */
export async function leerSolicitudBorrado(
  gastoId: string,
  tipo: TipoBorrable = 'expense',
  fecha: string | null = null,
): Promise<SolicitudBorrado | null> {
  const q = supabase
    .from('deletion_requests')
    .select(COLUMNAS_SOLICITUD)
    .eq('target_type', tipo)
    .eq('target_id', gastoId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());
  const { data, error } = await (fecha ? q.eq('occurrence_date', fecha) : q.is('occurrence_date', null)).maybeSingle();
  if (error) fallo('gastos.solicitudBorrado', error);
  return (data as SolicitudBorrado | null) ?? null;
}

/**
 * Pide borrar (o borra al momento si es privado o estás sin pareja). Devuelve si ya se ha borrado (`dejada`: colección que la pareja conserva).
 * `fecha`: solo para un evento repetido («solo este día»); sin ella se borra todo.
 */
export async function pedirBorrar(
  id: string,
  gastoId: string,
  tipo: TipoBorrable = 'expense',
  fecha?: string | null,
): Promise<ResultadoBorrado> {
  const params = { p_id: id, p_type: tipo, p_target_id: gastoId, ...(fecha ? { p_occurrence_date: fecha } : {}) };
  const { data, error } = await supabase.rpc('request_deletion', params);
  if (error) throw traducir('gastos.pedirBorrar', error, tipo === 'event' ? MENSAJES_EVENTO : tipo === 'place' ? MENSAJES_SITIO : tipo === 'collection' ? MENSAJES_COLECCION : tipo === 'plan' ? MENSAJES_PLAN : undefined);
  const resultado = resultadoBorrado(data);
  if (resultado) return resultado;
  // cancelled / rejected / expired: el id era de una solicitud ya resuelta.
  throw new ErrorGasto('Esa solicitud ya estaba resuelta. Vuelve a pedirlo.', 'solicitud_resuelta');
}

export async function responderBorrado(id: string, aceptar: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_deletion', { p_id: id, p_accept: aceptar });
  if (error) throw traducir('gastos.responderBorrado', error);
}

export async function retirarBorrado(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_deletion', { p_id: id });
  if (error) throw traducir('gastos.retirarBorrado', error);
}

export type Pendiente =
  | { tipo: 'pago'; id: string; pago: Pago }
  | { tipo: 'propuesta'; id: string; propuesta: Propuesta; actual: FilaAjustes }
  | { tipo: 'cobro'; id: string; cobro: Cobro; recurrente: Recurrente }
  /** «¿Quién pagó {evento}?» (vista `pending_actions`, tipo `who_paid`; `id` es el del evento). */
  | { tipo: 'quienPago'; id: string; evento: Evento }
  | {
      tipo: 'borrado';
      id: string;
      solicitud: SolicitudBorrado;
      etiqueta: string;
      gasto: Gasto | null;
      /** Si lo que se pide borrar es un movimiento del bote. */
      movimiento: Movimiento | null;
      /** Qué se pide borrar. Con un evento, `fecha` es la repetición concreta (null = toda la serie). */
      objetivo: TipoBorrable;
      objetivoId: string;
      fecha: string | null;
    };

const BORRABLES_EN_TARJETA: TipoBorrable[] = ['expense', 'pot_movement', 'event', 'recurring_payment', 'plan'];

/**
 * Tarjetas de Inicio (vista pending_actions): pagos por confirmar, borrados por aprobar, cobros variables,
 * cambios de ajustes y «¿Quién pagó?». `yo`: tu hueco; «¿Quién pagó?» solo se enseña a quien va al evento (la
 * migración 20261120000000 también lo filtra en el servidor, pero hasta que se aplique lo hace el cliente).
 */
export async function leerPendientes(yo: HuecoEvento): Promise<Pendiente[]> {
  const { data, error } = await supabase
    .from('pending_actions')
    .select('kind, item_id, since, title')
    .in('kind', ['confirm_settlement', 'approve_deletion', 'settings_proposal', 'variable_amount', 'who_paid'])
    .order('since', { ascending: false });
  if (error) fallo('gastos.pendientes', error);
  const filas = (data ?? []) as { kind: string; item_id: string; title: string | null }[];
  const idsPago = filas.filter((f) => f.kind === 'confirm_settlement').map((f) => f.item_id);
  const idsBorrado = filas.filter((f) => f.kind === 'approve_deletion').map((f) => f.item_id);
  const idsEvento = filas.filter((f) => f.kind === 'who_paid').map((f) => f.item_id);
  const [pagos, solicitudes, eventos] = await Promise.all([
    idsPago.length ? supabase.from('settlements').select(COLUMNAS_PAGO).in('id', idsPago) : Promise.resolve({ data: [], error: null }),
    idsBorrado.length
      ? supabase.from('deletion_requests').select(`${COLUMNAS_SOLICITUD}, target_type`).in('id', idsBorrado)
      : Promise.resolve({ data: [], error: null }),
    idsEvento.length
      ? supabase.from('events').select(COLUMNAS_EVENTO).in('id', idsEvento)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (pagos.error) fallo('gastos.pendientesPagos', pagos.error);
  if (solicitudes.error) fallo('gastos.pendientesBorrados', solicitudes.error);
  if (eventos.error) fallo('gastos.pendientesEventos', eventos.error);
  const eventosPorId = new Map(((eventos.data ?? []) as unknown as FilaEvento[]).map((x) => [x.id, aEvento(x)]));
  const sols = (solicitudes.data ?? []) as (SolicitudBorrado & { target_type: string })[];
  const idsGasto = sols.filter((s) => s.target_type === 'expense').map((s) => s.target_id);
  const idsMov = sols.filter((s) => s.target_type === 'pot_movement').map((s) => s.target_id);
  const [gastos, movs] = await Promise.all([
    idsGasto.length ? supabase.from('expenses').select(COLUMNAS).in('id', idsGasto) : Promise.resolve({ data: [], error: null }),
    idsMov.length ? supabase.from('pot_movements').select(COLUMNAS_MOV).in('id', idsMov) : Promise.resolve({ data: [], error: null }),
  ]);
  if (gastos.error) fallo('gastos.pendientesGastos', gastos.error);
  if (movs.error) fallo('gastos.pendientesMovimientos', movs.error);
  const porId = new Map(((gastos.data ?? []) as unknown as Gasto[]).map((x) => [x.id, x]));
  const movPorId = new Map(((movs.data ?? []) as Movimiento[]).map((x) => [x.id, x]));
  const pagosPorId = new Map(((pagos.data ?? []) as Pago[]).map((x) => [x.id, x]));
  const solsPorId = new Map(sols.map((x) => [x.id, x]));

  const lista: Pendiente[] = [];
  for (const f of filas) {
    if (f.kind === 'settings_proposal') {
      const p = await leerPropuesta(f.item_id);
      if (p) lista.push({ tipo: 'propuesta', id: f.item_id, ...p });
    } else if (f.kind === 'variable_amount') {
      const c = await leerCobro(f.item_id);
      if (c) lista.push({ tipo: 'cobro', id: f.item_id, ...c });
    } else if (f.kind === 'who_paid') {
      const evento = eventosPorId.get(f.item_id);
      if (evento && vaAlEvento(evento.attendees, yo)) lista.push({ tipo: 'quienPago', id: f.item_id, evento });
    } else if (f.kind === 'confirm_settlement') {
      const pago = pagosPorId.get(f.item_id);
      if (pago) lista.push({ tipo: 'pago', id: f.item_id, pago });
    } else {
      const solicitud = solsPorId.get(f.item_id);
      // Gastos, movimientos del bote, eventos, pagos recurrentes y planes: los sitios llegarán con su pestaña.
      if (solicitud && BORRABLES_EN_TARJETA.includes(solicitud.target_type as TipoBorrable)) {
        lista.push({
          tipo: 'borrado',
          id: f.item_id,
          solicitud,
          etiqueta: f.title ?? '',
          gasto: porId.get(solicitud.target_id) ?? null,
          movimiento: movPorId.get(solicitud.target_id) ?? null,
          objetivo: solicitud.target_type as TipoBorrable,
          objetivoId: solicitud.target_id,
          fecha: solicitud.occurrence_date,
        });
      }
    }
  }
  return lista;
}

// -----------------------------------------------------------------------------
// Fase 3: bote común (docs/plan-gastos-fase3.md)
// -----------------------------------------------------------------------------

const COLUMNAS_MOV = 'id, kind, member_slot, amount_cents, occurred_on, is_auto, created_by, created_at';

export async function leerAjustesBote(): Promise<AjustesBote | null> {
  const { data, error } = await supabase
    .from('couple_settings')
    .select('pot_enabled, pot_funding, pot_monthly_cents, pot_day, pot_pct_m1, pot_started_on, pot_generated_through')
    .maybeSingle();
  if (error) fallo('bote.ajustes', error);
  if (!data) return null;
  return {
    activo: data.pot_enabled,
    mensual: data.pot_funding === 'monthly',
    aportacionCents: data.pot_monthly_cents,
    dia: data.pot_day,
    pctM1: data.pot_pct_m1,
    desde: data.pot_started_on,
    generadoHasta: data.pot_generated_through,
  };
}

export type GastoBote = Pick<Gasto, 'id' | 'concept' | 'amount_cents' | 'category' | 'spent_on' | 'share_pot_cents'> & {
  paid_by: 'm1' | 'm2' | 'pot';
};

/** Movimientos y gastos pagados por el bote de un mes (`desde`/`hasta` en `YYYY-MM-DD`). */
export async function leerMesBote(desde: string, hasta: string): Promise<{ movimientos: Movimiento[]; gastos: GastoBote[] }> {
  const [m, g] = await Promise.all([
    supabase
      .from('pot_movements')
      .select(COLUMNAS_MOV)
      .gte('occurred_on', desde)
      .lte('occurred_on', hasta)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('expenses')
      .select('id, concept, amount_cents, category, spent_on, paid_by, share_pot_cents')
      // Pagados desde el bote, o del bote aunque se pagaran con tarjeta propia.
      .or('paid_by.eq.pot,share_pot_cents.gt.0')
      .gte('spent_on', desde)
      .lte('spent_on', hasta),
  ]);
  if (m.error) fallo('bote.movimientos', m.error);
  if (g.error) fallo('bote.gastos', g.error);
  return { movimientos: (m.data ?? []) as Movimiento[], gastos: (g.data ?? []) as GastoBote[] };
}

export async function leerMovimiento(id: string): Promise<Movimiento | null> {
  const { data, error } = await supabase.from('pot_movements').select(COLUMNAS_MOV).eq('id', id).maybeSingle();
  if (error) fallo('bote.movimiento', error);
  return (data as Movimiento | null) ?? null;
}

/**
 * Aportación a mano. El id lo genera la app: reintentar no la duplica. Si el id ya existía con otros datos
 * (un intento anterior llegó y luego se corrigió el importe o la persona), avisa: no se puede editar (I1).
 */
export async function aportar(id: string, coupleId: string, hueco: 'm1' | 'm2', cents: number, fecha: string): Promise<void> {
  const { data, error } = await supabase
    .from('pot_movements')
    .upsert(
      { id, couple_id: coupleId, kind: 'contribution', member_slot: hueco, amount_cents: cents, occurred_on: fecha },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw traducir('bote.aportar', error);
  if (data && data.length > 0) return;
  const guardado = await leerMovimiento(id);
  if (!guardado || guardado.amount_cents !== cents || guardado.member_slot !== hueco) {
    throw new ErrorGasto(
      guardado
        ? `Ya se había guardado una aportación de ${formatearImporte(guardado.amount_cents)}. Bórrala y apúntala de nuevo.`
        : 'No se ha podido guardar. Inténtalo de nuevo.',
      'TW071',
    );
  }
}

/**
 * Reembolso desde el bote, por la RPC reimburse_from_pot (migración 20261117020000): el servidor comprueba
 * que no supere lo que el bote debe y serializa los reembolsos de la pareja. Si la migración aún no está
 * aplicada, se usa el insert directo de antes (sin esa comprobación en el servidor).
 */
export async function reembolsar(id: string, coupleId: string, hueco: 'm1' | 'm2', cents: number, fecha: string): Promise<void> {
  const { error } = await supabase.rpc('reimburse_from_pot', { p_id: id, p_slot: hueco, p_cents: cents, p_on: fecha });
  if (!error) return;
  const codigo = (error as { code?: string }).code;
  if (codigo !== 'PGRST202' && codigo !== '42883') throw traducir('bote.reembolsar', error);
  const viejo = await supabase
    .from('pot_movements')
    .upsert(
      { id, couple_id: coupleId, kind: 'reimbursement', member_slot: hueco, amount_cents: cents, occurred_on: fecha },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  if (viejo.error) throw traducir('bote.reembolsar', viejo.error);
}
