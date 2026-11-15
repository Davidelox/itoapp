import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { limpiarCacheAvatares } from '@/lib/avatar';
import { consumirCierreVoluntario } from '@/lib/auth/cierre';
import { supabase } from '@/lib/supabase';

export type Sesion = {
  estado: 'cargando' | 'sin_sesion' | 'con_sesion';
  userId: string | null;
  /** Aviso para Bienvenida cuando la sesión terminó sin que el usuario lo pidiera. */
  aviso: string | null;
  descartarAviso: () => void;
};

const Contexto = createContext<Sesion | null>(null);

export const claveFase = (userId: string) => `ito.fase.${userId}`;

/**
 * Una sola suscripción a onAuthStateChange. Los consumidores dependen de `userId`, que no cambia
 * al refrescarse el token cada hora. Dentro del callback no se espera a Supabase (la librería avisa
 * de bloqueos): lo que haya que hacer se aplaza con setTimeout.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Sesion['estado']>('cargando');
  const [userId, setUserId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const ultimoUsuario = useRef<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, session: Session | null) => {
      if (evento === 'SIGNED_OUT') {
        const anterior = ultimoUsuario.current;
        const voluntario = consumirCierreVoluntario();
        ultimoUsuario.current = null;
        setUserId(null);
        setEstado('sin_sesion');
        setTimeout(() => {
          supabase.removeAllChannels();
          limpiarCacheAvatares();
          if (anterior) AsyncStorage.removeItem(claveFase(anterior)).catch(() => undefined);
          if (!voluntario) setAviso('Tu sesión ha terminado. Vuelve a entrar.');
        }, 0);
        return;
      }
      const id = session?.user.id ?? null;
      ultimoUsuario.current = id;
      setUserId((previo) => (previo === id ? previo : id));
      setEstado(id ? 'con_sesion' : 'sin_sesion');
      if (id) setAviso(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const descartarAviso = useCallback(() => setAviso(null), []);
  const valor = useMemo<Sesion>(
    () => ({ estado, userId, aviso, descartarAviso }),
    [estado, userId, aviso, descartarAviso],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion fuera de SesionProvider');
  return valor;
}
