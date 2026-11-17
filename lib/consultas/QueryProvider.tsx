import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useSesion } from '@/lib/auth/SesionProvider';

/**
 * Caché de datos de la app (TanStack Query, docs/plan-gastos.md §1.6).
 * - Recarga al volver a primer plano (en web ya lo hace la propia librería con el foco de la ventana).
 * - Al cambiar de usuario o cerrar sesión se vacía entera: nada de una cuenta se ve con la otra.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  const { userId } = useSesion();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (estado) => focusManager.setFocused(estado === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    cliente.clear();
  }, [cliente, userId]);

  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
