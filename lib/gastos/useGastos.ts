import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  type Filtros,
  type TipoBorrable,
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
  leerGastosPlan,
  leerPagina,
  leerResumenesPlanes,
  leerSaldo,
  leerTotales,
  leerUltimos,
} from '@/lib/gastos/consultas';
import { leerDatosAjustes } from '@/lib/ajustes/consultas';
import { leerOrigen, leerRecurrente, leerRecurrentes } from '@/lib/gastos/consultasRecurrentes';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { registrarError } from '@/lib/registro';
import { opcionesInvalidarCalendario } from '@/lib/calendario/claves';
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

/** Gastos para la lista «Últimos»: más de 5 porque los de un mismo plan se agrupan en una fila (ver `agruparPorPlan`). */
export const MARGEN_ULTIMOS = 30;
export function useUltimosParaAgrupar(soloSinSaldar = false) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('ultimos-filas', soloSinSaldar), queryFn: () => leerUltimos(MARGEN_ULTIMOS, soloSinSaldar), enabled: !!pareja });
}

/** Total y número de gastos de cada plan (`plan_summaries`), para la fila agrupada. null si no responde. */
export function useResumenesPlanes() {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('resumenes-planes'), queryFn: leerResumenesPlanes, enabled: !!pareja });
}

export function useGasto(id: string | undefined) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('uno', id), queryFn: () => leerGasto(id as string), enabled: !!pareja && !!id });
}

/** Gastos de un plan (todos, también los saldados): sale en el detalle del plan. */
export function useGastosPlan(planId: string | undefined) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('plan', planId), queryFn: () => leerGastosPlan(planId as string), enabled: !!pareja && !!planId });
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

/** Mientras la app está en primer plano se vuelve a preguntar: «¿Quién pagó?» aparece por el paso del tiempo. */
const REFRESCO_PENDIENTES_MS = 5 * 60_000;

export function usePendientes() {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({
    queryKey: k('pendientes'),
    queryFn: () => leerPendientes((pareja as NonNullable<typeof pareja>).yo.slot),
    enabled: !!pareja,
    refetchInterval: REFRESCO_PENDIENTES_MS,
  });
}

/** `fecha`: solo para eventos repetidos, la repetición concreta; null = la solicitud de la serie (o del gasto, el pago…). */
export function useSolicitudBorrado(gastoId: string | undefined, tipo: TipoBorrable = 'expense', fecha: string | null = null) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({
    queryKey: k('solicitud', tipo, gastoId, fecha ?? 'todo'),
    queryFn: () => leerSolicitudBorrado(gastoId as string, tipo, fecha),
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

/** Pagos recurrentes (fase 4). */
export function useRecurrentes() {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('recurrentes'), queryFn: leerRecurrentes, enabled: !!pareja });
}

export function useOrigenRecurrente(cobroId: string | null | undefined) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('origen', cobroId), queryFn: () => leerOrigen(cobroId as string), enabled: !!pareja && !!cobroId });
}

export function useRecurrente(id: string | undefined) {
  const { pareja } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('recurrente', id), queryFn: () => leerRecurrente(id as string), enabled: !!pareja && !!id });
}

/** Ajustes de la pareja (pantalla Ajustes). Bajo la misma clave: el tiempo real los recarga con lo demás. */
export function useDatosAjustes() {
  const { pareja, userId } = useEstado();
  const k = useClave();
  return useQuery({ queryKey: k('ajustes-pareja'), queryFn: () => leerDatosAjustes(userId as string), enabled: !!pareja && !!userId });
}

/** Tras guardar: recarga saldo, listas y detalle. */
export function useInvalidarGastos() {
  const cliente = useQueryClient();
  const { pareja } = useEstado();
  return async (): Promise<void> => {
    await Promise.all([
      cliente.invalidateQueries({ queryKey: clave(pareja?.coupleId) }),
      // El calendario también enseña pagos recurrentes y gastos: se recarga con lo demás.
      cliente.invalidateQueries(opcionesInvalidarCalendario(pareja?.coupleId)),
      // Lo gastado de un plan (`plan_summaries`) sale del Planificador.
      cliente.invalidateQueries({ queryKey: ['planificador', pareja?.coupleId ?? 'ninguna'] }),
    ]);
  };
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings_proposals', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_payments', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_occurrences', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      // Calendario: la RLS filtra por suscriptor (un evento secreto solo le llega a quien lo ve).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_exceptions', filter: `couple_id=eq.${coupleId}` }, () => {
        invalidar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `couple_id=eq.${coupleId}` }, () => {
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
