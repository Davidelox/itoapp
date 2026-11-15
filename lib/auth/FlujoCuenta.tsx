import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Estado en memoria del flujo de cuenta. El email NO viaja en los parámetros de ruta (en web acabaría
 * en la URL y en el historial): se guarda aquí y se pierde al recargar, y entonces Verificar lo pide otra vez.
 * Vive en la raíz porque, mientras `modo === 'recuperacion'`, la fase sigue siendo `sin_sesion`
 * aunque ya exista sesión: así la guarda no salta a la app antes de cambiar la contraseña.
 */
export type ModoFlujo = 'registro' | 'recuperacion' | null;

type Valor = {
  email: string;
  modo: ModoFlujo;
  iniciar: (modo: Exclude<ModoFlujo, null>, email: string) => void;
  limpiar: () => void;
};

const Contexto = createContext<Valor | null>(null);

export function FlujoCuentaProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<{ email: string; modo: ModoFlujo }>({ email: '', modo: null });
  const valor = useMemo<Valor>(
    () => ({
      ...estado,
      iniciar: (modo, email) => setEstado({ modo, email }),
      limpiar: () => setEstado({ modo: null, email: '' }),
    }),
    [estado],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useFlujoCuenta(): Valor {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useFlujoCuenta fuera de FlujoCuentaProvider');
  return valor;
}
