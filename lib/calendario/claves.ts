/**
 * Raíz de TODAS las claves del calendario (`['calendario', coupleId, userId, ...]`: rangos, detalle, borrados,
 * gastos del evento, Inicio). Invalidar el prefijo con `refetchType: 'all'` recarga también lo que no está montado
 * (otros meses, el detalle de otro evento), así que nada se queda con la fecha vieja en la caché.
 */
export const claveRaizCalendario = (coupleId: string | undefined | null) => ['calendario', coupleId ?? 'ninguna'] as const;

export const opcionesInvalidarCalendario = (coupleId: string | undefined | null) => ({
  queryKey: claveRaizCalendario(coupleId),
  refetchType: 'all' as const,
});
