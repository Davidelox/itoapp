import { useQuery } from '@tanstack/react-query';

import { aElementos } from '@/lib/calendario/agrupar';
import { sumarDias } from '@/lib/calendario/rejilla';
import { useCalendario, useEvento } from '@/lib/calendario/useCalendario';
import { hoyISO, horaEnZona } from '@/lib/gastos/fechas';
import { usePagos, useRecurrentes, useUltimosGastos } from '@/lib/gastos/useGastos';
import { leerEventosRecientes } from '@/lib/inicio/consultas';
import { type Hechos, movimientosRecientes, proximoPlan, proximoPlanMultidia, proximosDeLaSemana, ultimoLugarVisitado } from '@/lib/inicio/inicio';
import { usePlanes } from '@/lib/planificador/usePlanificador';
import { iconosDePin } from '@/lib/mapa/colecciones';
import { formatoDistancia } from '@/lib/mapa/resultados';
import { distanciaMetros } from '@/lib/mapa/sitio';
import { usePosicion } from '@/lib/mapa/usePosicion';
import { useColecciones, usePertenencias, useSitios, useUltimaVisita } from '@/lib/mapa/useSitios';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { codigoVigente } from '@/lib/pareja/acciones';

/** Días que se miran hacia delante en la agenda de Inicio (`calendar_range` admite hasta 100). */
const DIAS_AGENDA = 60;

/**
 * Agenda de Inicio con una sola lectura del calendario: el próximo evento (y la distancia hasta su sitio, solo si ya se
 * conoce la ubicación: nunca la pide), «Esta semana» y la próxima planificación de varios días (`plans` o un evento).
 */
export function useAgenda() {
  const hoy = hoyISO();
  const rango = useCalendario({ desde: hoy, hasta: sumarDias(hoy, DIAS_AGENDA) });
  // Todos los planes (no solo el primero): un cumpleaños anterior a un viaje no puede esconderlo.
  const planes = usePlanes();
  const sitios = useSitios();
  const posicion = usePosicion();
  const hora = horaEnZona(new Date());
  const lista = rango.data ? aElementos(rango.data) : [];
  const evento = proximoPlan(lista, hoy, hora);
  const multidia = proximoPlanMultidia(planes.data ?? [], lista, hoy);
  const semana = proximosDeLaSemana(lista, hoy, hora, [evento?.clave ?? null]);
  // `calendar_range` no trae la reserva: se lee del evento (una fila) solo para el que se enseña.
  const detalle = useEvento(evento?.tipo === 'event' ? evento.origenId : undefined);
  const sitio = evento?.placeId ? sitios.data?.find((s) => s.id === evento.placeId) : undefined;
  const distancia = sitio && posicion ? formatoDistancia(distanciaMetros(posicion, sitio)) : null;
  return {
    evento,
    distancia,
    reservado: detalle.data?.reserved === true,
    multidia,
    semana,
    cargando: rango.isLoading || planes.isLoading,
    // Si falla la lectura de los planes, el resto de Inicio sigue.
    error: rango.isError,
    refrescando: rango.isRefetching,
  };
}

/** Eventos creados hace poco (una lectura corta): alimentan «Últimos movimientos» y el paso «Apunta un evento». */
export function useEventosRecientes() {
  const { pareja, userId } = useEstado();
  return useQuery({
    queryKey: ['calendario', pareja?.coupleId ?? 'ninguna', userId ?? 'nadie', 'eventos-recientes'],
    queryFn: leerEventosRecientes,
    enabled: !!pareja && !!userId,
  });
}

/** Qué «Primeros pasos» están hechos, con las lecturas que ya usan las pestañas. */
export function usePrimerosPasos() {
  const gastos = useUltimosGastos(false);
  const sitios = useSitios();
  const recurrentes = useRecurrentes();
  const eventos = useEventosRecientes();
  const hechos: Hechos = {
    gasto: (gastos.data?.length ?? 0) > 0,
    sitio: (sitios.data?.length ?? 0) > 0,
    evento: (eventos.data?.length ?? 0) > 0,
    recurrente: (recurrentes.data?.length ?? 0) > 0,
  };
  const consultas = [gastos, sitios, recurrentes, eventos];
  return { hechos, cargando: consultas.some((c) => c.isLoading), error: consultas.some((c) => c.isError) };
}

/** Último lugar visitado, su emoji de colección y los movimientos recientes. */
export function usePanelActividad() {
  const { pareja, userId } = useEstado();
  const sitios = useSitios();
  const colecciones = useColecciones();
  const pertenencias = usePertenencias();
  const gastos = useUltimosGastos(false);
  const pagos = usePagos();
  const eventos = useEventosRecientes();
  const visita = useUltimaVisita();
  const ultimo = ultimoLugarVisitado(sitios.data ?? [], visita.data ?? null);
  const lugar = ultimo?.sitio ?? null;
  const emoji = lugar ? (iconosDePin([lugar], colecciones.data ?? [], pertenencias.data ?? []).get(lugar.id) ?? null) : null;
  const movimientos = pareja
    ? movimientosRecientes({
        gastos: gastos.data ?? [],
        pagos: pagos.data ?? [],
        sitios: sitios.data ?? [],
        eventos: eventos.data ?? [],
        yoId: userId,
        yo: pareja.yo.slot,
        nombrePareja: pareja.otra?.nombre.trim() || 'Tu pareja',
      })
    : [];
  return { lugar, fechaLugar: ultimo?.fecha ?? null, emoji, movimientos };
}

/** Caducidad del código de invitación vigente; solo se lee mientras la pareja no se ha unido. */
export function useCodigoVigente() {
  const { pareja } = useEstado();
  return useQuery({
    queryKey: ['invitacion', pareja?.coupleId ?? 'ninguna'],
    queryFn: codigoVigente,
    enabled: !!pareja && pareja.otra === null,
  });
}
