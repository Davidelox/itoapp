/** Lecturas del Mapa (docs/plan-mapa.md §4). La RLS ya oculta los sitios privados de la pareja. */
import { ErrorGasto } from '@/lib/gastos/error';
import { leerResultados, mensajeErrorBusqueda, textoBuscable, type SitioBuscado } from '@/lib/mapa/busqueda';
import { mensajeErrorMapa } from '@/lib/mapa/error';
import { type PlanEnSitio, juntarPlanes } from '@/lib/mapa/conexiones';
import { filaNueva } from '@/lib/mapa/sitio';
import type { FormularioSitio } from '@/lib/mapa/sitio';
import type { EstadisticasSitio, Sitio } from '@/lib/mapa/tipos';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

const COLUMNAS =
  'id, name, address, lat, lng, category, status, visible_to_partner, created_by, version, created_at, place_notes(user_id, rating, note)';

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
    .select('place_id, visit_count, total_spent_cents, next_event_on')
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
function traducir(contexto: string, error: unknown): ErrorGasto {
  registrarError(contexto, error);
  return new ErrorGasto(mensajeErrorMapa(error), (error as { code?: string } | null)?.code);
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

/** Busca sitios con la Edge Function `buscar-sitios` (Photon). `centro`: sesgo por cercanía, si se conoce. */
export async function buscarSitios(texto: string, centro?: { lat: number; lng: number }): Promise<SitioBuscado[]> {
  const q = textoBuscable(texto);
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke('buscar-sitios', { body: { q, lat: centro?.lat, lng: centro?.lng } });
  if (error) {
    registrarError('mapa.buscar', error);
    throw new ErrorGasto(mensajeErrorBusqueda(error));
  }
  return leerResultados(data);
}

/** Id del sitio ya guardado (y visible para esta persona) con ese resultado de búsqueda, para abrirlo tras un `23505`. */
export async function sitioDeBusqueda(lugarId: string): Promise<string | null> {
  const { data } = await supabase.from('places').select('id').eq('provider_place_id', lugarId).limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
