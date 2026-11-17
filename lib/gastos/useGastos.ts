import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  type Filtros,
  leerAbiertos,
  leerAjustesBote,
  leerMesBote,
  leerMovimiento,
  leerPago,
  leerPagoRechazado,
  leerPagos,
  leerPendientes,
  leerSolicitudBorrado,
  TAM_PAGINA,
  leerAjustes,
  leerGasto,
  leerPagina,
  leerSaldo,
  leerTotales,
  leerUltimos,
} from '@/lib/gastos/consultas';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

/**
 * Todas las claves de gastos empiezan por `['gastos', coupleId, userId]`: se invalidan juntas.
 * El usuario va en la clave porque el saldo depende de quién mira (no se comparte ni un fotograma).
 */
const clave = (coupleId: string | undefined, ...resto: unknown[]) => ['gastos', coupleId ?? 'ninguna', ...resto];
const useClave = () => {
  const { pareja, userId } = useEstado();
  return (...resto: unknown[]) => clave(pareja?.coupleId, userId, ...resto);
};

export function useSaldo() {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('saldo'), queryFn: leerSaldo, enabled: !!pareja });
}

export function useAjustesGastos() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({
    queryKey: k('ajustes'),
    queryFn: () => leerAjustes(userId as string),
    enabled: !!pareja && !!userId,
  });
}

export function useUltimosGastos(soloSinSaldar = false) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('ultimos', soloSinSaldar), queryFn: () => leerUltimos(5, soloSinSaldar), enabled: !!pareja });
}

export function useGasto(id: string | undefined) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('uno', id), queryFn: () => leerGasto(id as string), enabled: !!pareja && !!id });
}

export function useHistorial(filtros: Filtros) {
  const { pareja } = useEstado();
  const k = useClave();
  return useInfiniteQuery({
    queryKey: k('historial', filtros.categoria, filtros.texto.trim()),
    queryFn: ({ pageParam }) => leerPagina(filtros, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => (ultima.length < TAM_PAGINA ? undefined : todas.length * TAM_PAGINA),
    enabled: !!pareja,
  });
}

export function useTotales(filtros: Filtros) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({
    queryKey: k('totales', filtros.categoria, filtros.texto.trim()),
    queryFn: () => leerTotales(filtros),
    enabled: !!pareja,
  });
}

export function useAbiertos() {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('abiertos'), queryFn: leerAbiertos, enabled: !!pareja });
}

export function usePagos(activo = true) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('pagos'), queryFn: leerPagos, enabled: !!pareja && activo });
}

export function usePago(id: string | undefined) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('pago', id), queryFn: () => leerPago(id as string), enabled: !!pareja && !!id });
}

export function usePagoRechazado() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('rechazado'), queryFn: () => leerPagoRechazado(userId as string), enabled: !!pareja && !!userId });
}

export function usePendientes() {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('pendientes'), queryFn: leerPendientes, enabled: !!pareja });
}

export function useSolicitudBorrado(gastoId: string | undefined, tipo: 'expense' | 'pot_movement' = 'expense') {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({
    queryKey: k('solicitud', tipo, gastoId),
    queryFn: () => leerSolicitudBorrado(gastoId as string, tipo),
    enabled: !!pareja && !!gastoId,
  });
}

export function useAjustesBote() {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('bote', 'ajustes'), queryFn: leerAjustesBote, enabled: !!pareja });
}

export function useMesBote(desde: string, hasta: string) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('bote', 'mes', desde), queryFn: () => leerMesBote(desde, hasta), enabled: !!pareja });
}

export function useMovimiento(id: string | undefined) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('bote', 'movimiento', id), queryFn: () => leerMovimiento(id as string), enabled: !!pareja && !!id });
}

/** Tras guardar: recarga saldo, listas y detalle. */
export function useInvalidarGastos() {
  const cliente = useQueryClient();
  const { pareja } = useEstado();
  return () => cliente.invalidateQueries({ queryKey: clave(pareja?.coupleId) });
}

/**
 * Tiempo real: cualquier cambio en los gastos de la pareja (también los de la otra persona) recarga
 * todo lo de gastos. La RLS decide qué llega a cada uno: los gastos privados de la pareja no llegan.
 * Los ajustes (bote, reparto) también, para que el formulario no ofrezca un bote ya desactivado.
 */
export function useTiempoRealGastos() {
  const { pareja } = useEstado();
  const invalidar = useInvalidarGastos();
  const coupleId = pareja?.coupleId;

  useEffect(() => {
    if (!coupleId) return;
    const canal = supabase
      // Nombre único por montaje: si la pantalla se monta dos veces seguidas, Supabase devolvería el canal
      // anterior (aún cerrándose) y no llegaría ningún aviso.
      .channel(`gastos:${coupleId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couple_settings', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deletion_requests', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pot_movements', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      .subscribe((estado, error) => {
        if (error) registrarError('gastos.tiempoReal', error);
        // Al (re)conectar se recarga: lo que pasó mientras el canal estaba caído no llegó como evento.
        if (estado === 'SUBSCRIBED') invalidar();
      });
    return () => {
      supabase.removeChannel(canal);
    };
    // invalidar cambia en cada render; el canal depende solo de la pareja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId]);
}
