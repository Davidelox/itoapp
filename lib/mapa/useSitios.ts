import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { leerColecciones, leerPertenencias } from '@/lib/mapa/consultasColecciones';
import { leerEstadisticas, leerPlanesDeSitio, leerSitios, leerSitiosConPlan } from '@/lib/mapa/consultas';
import type { Coleccion, Pertenencia, Sitio } from '@/lib/mapa/tipos';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

/**
 * Todas las claves del mapa empiezan por `['mapa', coupleId, userId]`. El usuario va en la clave porque la RLS decide
 * qué sitios ve cada uno (los privados).
 */
const useClave = () => {
  const { pareja, userId } = useEstado();
  return (...resto: unknown[]) => ['mapa', pareja?.coupleId ?? 'ninguna', userId ?? 'nadie', ...resto];
};

export function useSitios() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('sitios'), queryFn: leerSitios, enabled: !!pareja && !!userId });
}

/** Colecciones que ve esta persona (la RLS oculta las privadas de la pareja). */
export function useColecciones() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('colecciones'), queryFn: leerColecciones, enabled: !!pareja && !!userId });
}

/** Qué sitio está en qué colección. */
export function usePertenencias() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('pertenencias'), queryFn: leerPertenencias, enabled: !!pareja && !!userId });
}

/** Un sitio de la caché de la lista (la ficha no hace otra lectura). */
export function useSitio(id: string | undefined) {
  const consulta = useSitios();
  return { ...consulta, sitio: consulta.data?.find((s) => s.id === id) };
}

export function useEstadisticasSitio(id: string | undefined) {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('estadisticas', id), queryFn: () => leerEstadisticas(id as string), enabled: !!pareja && !!userId && !!id });
}

/** Sitios con un evento futuro enlazado (puntito del pin). */
export function useSitiosConPlan() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('conPlan'), queryFn: leerSitiosConPlan, enabled: !!pareja && !!userId });
}

/** «Planes y gastos en este sitio» de la ficha. */
export function usePlanesDeSitio(id: string | undefined) {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('planes', id), queryFn: () => leerPlanesDeSitio(id as string), enabled: !!pareja && !!userId && !!id });
}

/** Tiempo real del Mapa: cualquier cambio en sitios, notas, colecciones o solicitudes de borrado recarga lo del mapa. */
export function useTiempoRealMapa() {
  const { pareja } = useEstado();
  const cliente = useQueryClient();
  const coupleId = pareja?.coupleId;

  useEffect(() => {
    if (!coupleId) return;
    const invalidar = () => cliente.invalidateQueries({ queryKey: ['mapa', coupleId] });
    const canal = supabase
      .channel(`mapa:${coupleId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'places', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'place_notes', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deletion_requests', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collections', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collection_places', filter: `couple_id=eq.${coupleId}` }, invalidar)
      // Un evento o un gasto enlazado cambia las estadísticas, el puntito del pin y la lista de la ficha.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `couple_id=eq.${coupleId}` }, invalidar)
      .subscribe((estado, error) => {
        if (error) registrarError('mapa.tiempoReal', error);
        if (estado === 'SUBSCRIBED') invalidar();
      });
    return () => {
      supabase.removeChannel(canal);
    };
  }, [coupleId, cliente]);
}

/** Recarga todo lo del mapa tras guardar, cambiar el estado o borrar. */
export function useInvalidarMapa() {
  const cliente = useQueryClient();
  const { pareja } = useEstado();
  return () => cliente.invalidateQueries({ queryKey: ['mapa', pareja?.coupleId ?? 'ninguna'] });
}

/**
 * Quita una colección de las cachés al instante (borrada o dejada): el tiempo real no avisa a quien deja de verla.
 * Los sitios que la tenían de principal pasan a null (verán el icono de su categoría hasta recargar).
 */
export function useQuitarColeccionDeCache() {
  const cliente = useQueryClient();
  const { pareja } = useEstado();
  return (id: string) => {
    const raiz = ['mapa', pareja?.coupleId ?? 'ninguna'];
    cliente.setQueriesData<Coleccion[]>({ queryKey: raiz, predicate: (q) => q.queryKey[3] === 'colecciones' }, (x) => x?.filter((c) => c.id !== id));
    cliente.setQueriesData<Pertenencia[]>({ queryKey: raiz, predicate: (q) => q.queryKey[3] === 'pertenencias' }, (x) => x?.filter((p) => p.collection_id !== id));
    cliente.setQueriesData<Sitio[]>({ queryKey: raiz, predicate: (q) => q.queryKey[3] === 'sitios' }, (x) =>
      x?.map((s) => (s.primary_collection_id === id ? { ...s, primary_collection_id: null } : s)),
    );
  };
}
