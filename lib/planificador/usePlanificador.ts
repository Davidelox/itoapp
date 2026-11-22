import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { leerItinerario, leerPlanes, leerTareas } from '@/lib/planificador/consultas';
import { leerIdeas } from '@/lib/planificador/consultasIdeas';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { registrarError } from '@/lib/registro';
import { opcionesInvalidarCalendario } from '@/lib/calendario/claves';
import { supabase } from '@/lib/supabase';

/** Todas las claves del Planificador empiezan por `['planificador', coupleId, userId]`. */
const useClave = () => {
  const { pareja, userId } = useEstado();
  return (...resto: unknown[]) => ['planificador', pareja?.coupleId ?? 'ninguna', userId ?? 'nadie', ...resto];
};

/** Todos los planes de la pareja, con lo gastado. La lista y el detalle leen de aquí (una sola consulta). */
export function usePlanes() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('planes'), queryFn: leerPlanes, enabled: !!pareja && !!userId });
}

export function usePlan(id: string | undefined) {
  const consulta = usePlanes();
  return { ...consulta, plan: consulta.data?.find((p) => p.id === id) };
}

/** Todas las tareas de la pareja (una sola lectura: las tarjetas de la lista y el detalle filtran de aquí). */
export function useTareas() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('tareas'), queryFn: leerTareas, enabled: !!pareja && !!userId });
}

/** Ideas de la pareja (pestaña Ideas). */
export function useIdeas() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('ideas'), queryFn: leerIdeas, enabled: !!pareja && !!userId });
}

/** Elementos del itinerario de todos los planes (el detalle de cada plan filtra por `plan_id`). Los cambios de `events` la recargan (tiempo real de Gastos y de Mapa). */
export function useItinerario() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('itinerario'), queryFn: leerItinerario, enabled: !!pareja && !!userId });
}

/** Tras guardar: recarga los planes y lo que los enseña (el calendario pinta su banda y el mapa, su colección). */
export function useInvalidarPlanificador() {
  const cliente = useQueryClient();
  const { pareja } = useEstado();
  const coupleId = pareja?.coupleId ?? 'ninguna';
  return () =>
    Promise.all([
      cliente.invalidateQueries({ queryKey: ['planificador', coupleId] }),
      cliente.invalidateQueries(opcionesInvalidarCalendario(coupleId)),
      cliente.invalidateQueries({ queryKey: ['mapa', coupleId] }),
    ]);
}

/** Tiempo real: un cambio en los planes, sus tareas, las ideas o los gastos (lo gastado) recarga el Planificador. Vive en el layout de las pestañas. */
export function useTiempoRealPlanificador() {
  const { pareja } = useEstado();
  const cliente = useQueryClient();
  const coupleId = pareja?.coupleId;

  useEffect(() => {
    if (!coupleId) return;
    const invalidar = () => cliente.invalidateQueries({ queryKey: ['planificador', coupleId] });
    const canal = supabase
      .channel(`planificador:${coupleId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_tasks', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .subscribe((estado, error) => {
        if (error) registrarError('planificador.tiempoReal', error);
        if (estado === 'SUBSCRIBED') invalidar();
      });
    return () => {
      supabase.removeChannel(canal);
    };
  }, [coupleId, cliente]);
}
