import { useCallback, useEffect, useState } from 'react';

/** Cuenta atrás en segundos (reenviar código, espera tras fallos). `iniciar(n)` la arranca. */
export function useCuentaAtras(inicial = 0) {
  const [restante, setRestante] = useState(inicial);
  useEffect(() => {
    if (restante <= 0) return;
    const t = setTimeout(() => setRestante((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restante]);
  const iniciar = useCallback((segundos: number) => setRestante(segundos), []);
  return { restante, iniciar };
}

/** 59 -> «0:59» */
export const formatearSegundos = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
