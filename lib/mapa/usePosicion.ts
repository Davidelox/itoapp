import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { Centro } from '@/lib/mapa/resultados';

export const CLAVE_POSICION = ['posicion-usuario'] as const;

/**
 * Posición del usuario SOLO si el permiso ya está concedido (nunca lo pide: eso lo hace «Mi ubicación» al pulsarlo).
 * Sirve de centro de las distancias de la búsqueda; no se guarda ni se envía a ningún sitio salvo como sesgo (redondeado) a Photon.
 * «Mi ubicación» la actualiza con `setQueryData(CLAVE_POSICION, …)`.
 */
export function usePosicion(): Centro | null {
  const q = useQuery<Centro | null>({
    queryKey: CLAVE_POSICION,
    queryFn: async () => {
      try {
        if (!(await Location.getForegroundPermissionsAsync()).granted) return null;
        const pos = (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
      } catch {
        return null;
      }
    },
    enabled: Platform.OS !== 'web',
    staleTime: 5 * 60_000,
    retry: false,
  });
  return q.data ?? null;
}
