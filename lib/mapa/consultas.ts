/** Lecturas del Mapa (docs/plan-mapa.md §4). La RLS ya oculta los sitios privados de la pareja. */
import { ErrorGasto } from '@/lib/gastos/error';
import { MENSAJE_LIMITE, leerResultados, mensajeErrorBusqueda, mensajeErrorDirecto, textoBuscable, type SitioBuscado } from '@/lib/mapa/busqueda';
import { type EntradaCache, LIMITE_CANDIDATOS, claveCache, guardarCache, leerCache, normalizarRespuesta, permitir, urlPhoton } from '@/lib/mapa/photon';
import { esConsultaGenerica, ordenarResultados } from '@/lib/mapa/resultados';
import { mensajeErrorMapa } from '@/lib/mapa/error';
import { type PlanEnSitio, juntarPlanes } from '@/lib/mapa/conexiones';
import { type EventoAuto, type SitioDeVisita, datosEventoVisita, decidirEventoAlCorregir, hayEventoEseDia, idEventoDeVisita } from '@/lib/mapa/eventoVisita';
import type { Hueco } from '@/lib/calendario/evento';
import { filaNueva } from '@/lib/mapa/sitio';
import type { FormularioSitio } from '@/lib/mapa/sitio';
import type { EstadisticasSitio, Sitio } from '@/lib/mapa/tipos';
import { type Visita, notaDeVisita } from '@/lib/mapa/visitas';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

const COLUMNAS =
  'id, name, address, lat, lng, category, status, visible_to_partner, primary_collection_id, created_by, version, created_at, place_notes(user_id, rating, note)';

export async function leerSitios(): Promise<Sitio[]> {
  const { data, error } = await supabase.from('places').select(COLUMNAS).order('created_at', { ascending: false });
  if (error) {
    registrarError('mapa.sitios', error);
    throw error;
  }
  return (data ?? []) as unknown as Sitio[];
}

export async function leerEstadisticas(id: string): Promise<EstadisticasSitio | null> {
  const { data, error } = await supabase
    .from('place_stats')
    .select('place_id, visit_count, total_spent_cents, next_event_on, last_visit_on, suggested_visit_on')
    .eq('place_id', id)
    .maybeSingle();
  if (error) {
    registrarError('mapa.estadisticas', error);
    throw error;
  }
  return (data as EstadisticasSitio | null) ?? null;
}

/** Ids de los sitios con algún evento futuro enlazado (puntito de calendario en el pin). */
export async function leerSitiosConPlan(): Promise<string[]> {
  const { data, error } = await supabase.from('place_stats').select('place_id').not('next_event_on', 'is', null);
  if (error) {
    registrarError('mapa.conPlan', error);
    throw error;
  }
  return ((data ?? []) as { place_id: string }[]).map((f) => f.place_id);
}

/** Eventos y gastos enlazados a un sitio (la RLS ya oculta los secretos y los privados de la pareja). */
export async function leerPlanesDeSitio(id: string): Promise<PlanEnSitio[]> {
  const [eventos, gastos] = await Promise.all([
    supabase.from('events').select('id, title, start_date').eq('place_id', id).order('start_date', { ascending: false }).limit(50),
    supabase.from('expenses').select('id, concept, spent_on, amount_cents').eq('place_id', id).order('spent_on', { ascending: false }).limit(50),
  ]);
  const error = eventos.error ?? gastos.error;
  if (error) {
    registrarError('mapa.planes', error);
    throw error;
  }
  return juntarPlanes(eventos.data ?? [], gastos.data ?? []);
}

/** Error del servidor → `ErrorGasto` (mensaje listo y código) para que lo muestren los formularios y `BorrarGasto`. */
function traducir(contexto: string, error: unknown, tipo: 'sitio' | 'visita' = 'sitio'): ErrorGasto {
  registrarError(contexto, error);
  return new ErrorGasto(mensajeErrorMapa(error, tipo), (error as { code?: string } | null)?.code);
}

/** Alta idempotente: el id lo genera la app, así un reintento tras un fallo de red no duplica el sitio. */
export async function crearSitio(id: string, coupleId: string, f: FormularioSitio): Promise<void> {
  const { error } = await supabase
    .from('places')
    .upsert({ id, couple_id: coupleId, ...filaNueva(f) }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw traducir('mapa.crear', error);
}

/** Edición con control de versión: si la otra persona lo cambió antes, no toca nada y avisa. */
export async function editarSitio(
  id: string,
  version: number,
  cambios: Partial<Pick<Sitio, 'name' | 'address' | 'category' | 'status' | 'visible_to_partner'>>,
  nombrePareja: string,
): Promise<void> {
  const { data, error } = await supabase.from('places').update(cambios).eq('id', id).eq('version', version).select('id');
  if (error) throw traducir('mapa.editar', error);
  if (!data || data.length === 0) {
    throw new ErrorGasto(`${nombrePareja} acaba de cambiar este sitio. Revísalo y vuelve a intentarlo.`, 'version');
  }
}

// -----------------------------------------------------------------------------
// Visitas (docs/plan-mapa.md §12): escritura directa, sin aprobación. Añadir una visita pone el sitio en «Hemos ido»
// en el servidor (sube `places.version`): después hay que recargar el sitio antes de editarlo.
// -----------------------------------------------------------------------------

/** Historial de visitas de un sitio, la más reciente primero. */
export async function leerVisitas(placeId: string): Promise<Visita[]> {
  const { data, error } = await supabase
    .from('place_visits')
    .select('id, visited_on, note, created_by, version')
    .eq('place_id', placeId)
    .order('visited_on', { ascending: false });
  if (error) {
    registrarError('mapa.visitas', error);
    throw error;
  }
  return (data ?? []) as Visita[];
}

/** La visita más reciente de todos los sitios que ve esta persona (la RLS oculta los privados de la pareja), o null. */
export async function leerUltimaVisita(): Promise<{ place_id: string; visited_on: string } | null> {
  const { data, error } = await supabase
    .from('place_visits')
    .select('place_id, visited_on')
    .order('visited_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    registrarError('mapa.ultimaVisita', error);
    throw error;
  }
  return ((data ?? [])[0] as { place_id: string; visited_on: string } | undefined) ?? null;
}

/**
 * Apunta una visita. El id lo genera la app (un reintento no la duplica). `23505` (ya había una ese día, quizá de
 * vuestra pareja) cuenta como hecho: el resultado es el que se quería.
 */
export async function anadirVisita(id: string, coupleId: string, sitio: SitioDeVisita, yo: Hueco, fecha: string, nota: string): Promise<void> {
  const { error } = await supabase
    .from('place_visits')
    .upsert({ id, couple_id: coupleId, place_id: sitio.id, visited_on: fecha, note: notaDeVisita(nota) }, { onConflict: 'id', ignoreDuplicates: true });
  if (error && (error as { code?: string }).code !== '23505') throw traducir('mapa.anadirVisita', error, 'visita');
  await crearEventoDeVisita(id, coupleId, sitio, yo, fecha);
}

/**
 * Si ese día no hay ya un evento enlazado al sitio, crea uno de todo el día (id derivado de la visita). Nunca bloquea:
 * la visita ya está guardada y un fallo aquí solo se registra.
 */
async function crearEventoDeVisita(idVisita: string, coupleId: string, sitio: SitioDeVisita, yo: Hueco, fecha: string): Promise<void> {
  try {
    const { data, error } = await supabase.from('events').select('start_date, end_date').eq('place_id', sitio.id).lte('start_date', fecha).order('start_date', { ascending: false }).limit(50);
    if (error) throw error;
    if (hayEventoEseDia((data ?? []) as { start_date: string; end_date: string | null }[], fecha)) return;
    const { error: e2 } = await supabase
      .from('events')
      .upsert({ id: idEventoDeVisita(idVisita), couple_id: coupleId, ...datosEventoVisita(sitio, fecha, yo) }, { onConflict: 'id', ignoreDuplicates: true });
    if (e2) throw e2;
  } catch (e) {
    registrarError('mapa.eventoDeVisita', e);
  }
}

/** Lo que hace falta para llevar el evento automático de la visita a la fecha corregida. */
export type ContextoEventoVisita = { coupleId: string; sitio: SitioDeVisita; yo: Hueco; fechaAntigua: string };

/**
 * Corrige la fecha o la nota de una visita, con control de versión (0 filas: la pareja la cambió o la quitó).
 * Con `evento`, su evento automático («Visita registrada», sin personalizar) se alinea siempre con la fecha de la visita.
 */
export async function corregirVisita(id: string, version: number, fecha: string, nota: string, nombrePareja: string, evento?: ContextoEventoVisita): Promise<void> {
  const { data, error } = await supabase
    .from('place_visits')
    .update({ visited_on: fecha, note: notaDeVisita(nota) })
    .eq('id', id)
    .eq('version', version)
    .select('id');
  if (error) throw traducir('mapa.corregirVisita', error, 'visita');
  if (!data || data.length === 0) throw new ErrorGasto(`${nombrePareja} acaba de cambiar esta visita. Revísala y vuelve a intentarlo.`, 'version');
  if (evento) await moverEventoDeVisita(id, evento, fecha);
}

/** Mueve (o crea) el evento de la visita al día nuevo. Nunca bloquea: la visita ya está corregida y un fallo solo se registra. */
async function moverEventoDeVisita(idVisita: string, { coupleId, sitio, yo, fechaAntigua }: ContextoEventoVisita, fecha: string): Promise<void> {
  try {
    const idEvento = idEventoDeVisita(idVisita);
    const [{ data: auto, error: e1 }, { data: otros, error: e2 }] = await Promise.all([
      supabase.from('events').select('version, title, place_id, start_time, start_date, end_date, all_day, notes').eq('id', idEvento).maybeSingle(),
      supabase.from('events').select('start_date, end_date').eq('place_id', sitio.id).neq('id', idEvento).lte('start_date', fecha).order('start_date', { ascending: false }).limit(50),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const decision = decidirEventoAlCorregir((auto as EventoAuto | null) ?? null, (otros ?? []) as { start_date: string; end_date: string | null }[], sitio, fechaAntigua, fecha);
    if (decision.accion === 'mover') {
      const { error } = await supabase.from('events').update({ start_date: fecha }).eq('id', idEvento).eq('version', decision.version).select('id');
      if (error) throw error;
    } else if (decision.accion === 'crear') {
      const { error } = await supabase.from('events').upsert({ id: idEvento, couple_id: coupleId, ...datosEventoVisita(sitio, fecha, yo) }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
  } catch (e) {
    registrarError('mapa.moverEventoDeVisita', e);
  }
}

/** Quita una visita (directo, sin solicitud de borrado). Quitar una que ya no existe no es un error. */
export async function quitarVisita(id: string): Promise<void> {
  const { error } = await supabase.from('place_visits').delete().eq('id', id);
  if (error) throw traducir('mapa.quitarVisita', error, 'visita');
}

/**
 * Proveedor de la búsqueda de sitios. Único punto de cambio: con 'funcion' vuelve a la Edge Function `buscar-sitios`
 * (útil con un proveedor con clave); con 'directo' la app llama a Photon, que da 403 a las IPs de Supabase.
 */
const PROVEEDOR_BUSQUEDA: 'directo' | 'funcion' = 'directo';
const TIMEOUT_BUSQUEDA_MS = 6000;

type Centro = { lat: number; lng: number };

/**
 * Busca sitios (hasta 8). `centro`: sesgo por cercanía y origen de las distancias, si se conoce. `signal`: cancela la
 * petición en curso. Los candidatos (hasta 20) se guardan en caché tal cual; el orden y la distancia se calculan aquí,
 * con el centro exacto (ver `ordenarResultados`).
 */
export async function buscarSitios(texto: string, centro?: Centro, signal?: AbortSignal): Promise<SitioBuscado[]> {
  const q = textoBuscable(texto);
  if (!q) return [];
  const candidatos = PROVEEDOR_BUSQUEDA === 'directo' ? await buscarDirecto(q, centro, signal) : await buscarConFuncion(q, centro);
  return ordenarResultados(candidatos, q, centro);
}

async function buscarConFuncion(q: string, centro?: Centro): Promise<SitioBuscado[]> {
  const { data, error } = await supabase.functions.invoke('buscar-sitios', { body: { q, lat: centro?.lat, lng: centro?.lng } });
  if (error) {
    registrarError('mapa.buscar', error);
    throw new ErrorGasto(mensajeErrorBusqueda(error));
  }
  return leerResultados(data);
}

const cacheBusqueda = new Map<string, EntradaCache>();
const peticiones: number[] = [];

/** Photon directo con caché de 5 min, tope de peticiones por minuto y plazo de 6 s. Nunca se registra el texto buscado. */
async function buscarDirecto(q: string, centro?: Centro, signal?: AbortSignal): Promise<SitioBuscado[]> {
  const entrada = { q, lat: centro?.lat ?? null, lng: centro?.lng ?? null };
  const clave = claveCache(entrada);
  const ahora = Date.now();
  const guardado = leerCache(cacheBusqueda, clave, ahora);
  if (guardado) return guardado;
  if (!permitir(peticiones, ahora)) throw new ErrorGasto(MENSAJE_LIMITE);

  const control = new AbortController();
  let caducado = false;
  const reloj = setTimeout(() => {
    caducado = true;
    control.abort();
  }, TIMEOUT_BUSQUEDA_MS);
  const cancelar = () => control.abort();
  signal?.addEventListener('abort', cancelar);
  try {
    const pedir = async (bbox: boolean) => {
      const r = await fetch(urlPhoton(entrada, { limite: LIMITE_CANDIDATOS, bbox }), { headers: { Accept: 'application/json' }, signal: control.signal });
      if (!r.ok) {
        registrarError('mapa.buscar', { status: r.status });
        throw new ErrorGasto(mensajeErrorDirecto({ estado: r.status }));
      }
      const resultado = normalizarRespuesta(await r.json(), LIMITE_CANDIDATOS);
      if (!resultado) {
        registrarError('mapa.buscar', { name: 'RespuestaInesperada' });
        throw new ErrorGasto(mensajeErrorDirecto({}));
      }
      return resultado;
    };
    // Búsqueda genérica con centro: primero solo la zona; si no hay nada, otra vez sin recuadro (cuenta para el tope).
    const conRecuadro = centro !== undefined && esConsultaGenerica(q);
    let lista = await pedir(conRecuadro);
    if (conRecuadro && lista.length === 0) {
      if (!permitir(peticiones, Date.now())) throw new ErrorGasto(MENSAJE_LIMITE);
      lista = await pedir(false);
    }
    guardarCache(cacheBusqueda, clave, lista, Date.now());
    return lista;
  } catch (e) {
    if (e instanceof ErrorGasto) throw e;
    // Cancelada por la app (otra búsqueda la sustituye): se deja pasar tal cual, sin mensaje.
    if (signal?.aborted && !caducado) throw e;
    registrarError('mapa.buscar', { name: (e as { name?: string } | null)?.name });
    throw new ErrorGasto(mensajeErrorDirecto({ tipo: caducado ? 'timeout' : 'red' }));
  } finally {
    clearTimeout(reloj);
    signal?.removeEventListener('abort', cancelar);
  }
}

/** Id del sitio ya guardado (y visible para esta persona) con ese resultado de búsqueda, para abrirlo tras un `23505`. */
export async function sitioDeBusqueda(lugarId: string): Promise<string | null> {
  const { data } = await supabase.from('places').select('id').eq('provider_place_id', lugarId).limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
