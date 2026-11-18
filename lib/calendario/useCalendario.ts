import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { gastosDelEvento, leerBorradosPendientes, leerEvento, leerRango } from '@/lib/calendario/consultas';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/**
 * Todas las claves del calendario empiezan por `['calendario', coupleId]`: `useInvalidarGastos` las invalida
 * junto con las de gastos. El usuario va en la clave porque la RLS decide qué ve cada uno (secretos).
 */
const clave = (coupleId: string | undefined, userId: string | null, desde: string, hasta: string) => [
  'calendario',
  coupleId ?? 'ninguna',
  userId ?? 'nadie',
  desde,
  hasta,
];

type Rango = { desde: string; hasta: string };

/** Filas de `calendar_range` de la rejilla visible; precarga los rangos vecinos (periodo anterior y siguiente). */
export function useCalendario(rango: Rango, vecinos: Rango[] = []) {
  const { pareja, userId } = useEstado();
  const cliente = useQueryClient();
  const coupleId = pareja?.coupleId;
  const activo = !!pareja && !!userId;
  const vecinosTexto = vecinos.map((v) => `${v.desde}|${v.hasta}`).join(',');

  useEffect(() => {
    if (!activo) return;
    for (const v of vecinosTexto.split(',').filter(Boolean)) {
      const [desde, hasta] = v.split('|');
      cliente.prefetchQuery({ queryKey: clave(coupleId, userId, desde, hasta), queryFn: () => leerRango(desde, hasta), staleTime: 30_000 });
    }
    // La clave de los vecinos va resumida en vecinosTexto; cliente es estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, coupleId, userId, vecinosTexto]);

  return useQuery({
    queryKey: clave(coupleId, userId, rango.desde, rango.hasta),
    queryFn: () => leerRango(rango.desde, rango.hasta),
    enabled: activo,
    // Al cambiar de periodo se sigue viendo el anterior hasta que llega el nuevo (no parpadea).
    placeholderData: keepPreviousData,
  });
}

/** Un evento (detalle y editar). Clave bajo `['calendario', coupleId]`: se invalida con todo lo demás. */
export function useEvento(id: string | undefined) {
  const { pareja, userId } = useEstado();
  return useQuery({
    queryKey: ['calendario', pareja?.coupleId ?? 'ninguna', userId ?? 'nadie', 'evento', id],
    queryFn: () => leerEvento(id as string),
    enabled: !!pareja && !!userId && !!id,
  });
}

/** Eventos y pagos con una solicitud de borrado pendiente (claves de `claveBorrado`), para «Pendiente de borrar». */
export function useBorradosPendientes() {
  const { pareja, userId } = useEstado();
  return useQuery({
    queryKey: ['calendario', pareja?.coupleId ?? 'ninguna', userId ?? 'nadie', 'borrados'],
    queryFn: leerBorradosPendientes,
    enabled: !!pareja && !!userId,
  });
}

/** Gastos enlazados a un evento (bloque «Después del evento» y «Gastos» del detalle). */
export function useGastosDelEvento(id: string | undefined) {
  const { pareja, userId } = useEstado();
  return useQuery({
    queryKey: ['calendario', pareja?.coupleId ?? 'ninguna', userId ?? 'nadie', 'gastos-evento', id],
    queryFn: () => gastosDelEvento(id as string),
    enabled: !!pareja && !!userId && !!id,
  });
}
