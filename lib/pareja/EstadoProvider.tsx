import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { Href } from 'expo-router';

import { useFlujoCuenta } from '@/lib/auth/FlujoCuenta';
import { claveFase, useSesion } from '@/lib/auth/SesionProvider';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';
import type { ColorPersona } from '@/constants/theme';

export type Fase = 'cargando' | 'sin_sesion' | 'sin_conexion' | 'sin_pareja' | 'sin_perfil' | 'dinero' | 'invitar' | 'lista';

/**
 * Vista previa de diseño, solo en desarrollo, con `EXPO_PUBLIC_VISTA_PREVIA` en `.env.local` (no va a git):
 * `1` fija la fase en `lista` (directo a las pestañas) y el nombre de una fase (`dinero`, `perfil`…) fija esa.
 * No hay sesión, así que Supabase no devuelve datos (la RLS sigue igual). En producción `__DEV__` es false.
 */
const FASES: Fase[] = ['cargando', 'sin_sesion', 'sin_conexion', 'sin_pareja', 'sin_perfil', 'dinero', 'invitar', 'lista'];
const valorVistaPrevia = process.env.EXPO_PUBLIC_VISTA_PREVIA ?? '';
const VISTA_PREVIA: Fase | null = !__DEV__
  ? null
  : valorVistaPrevia === '1'
    ? 'lista'
    : (FASES.find((f) => f === valorVistaPrevia) ?? null);

/**
 * Pantalla de entrada de cada fase. Se usa como `redirectTo` de los `Stack.Protected` (app/_layout.tsx y
 * app/(onboarding)/_layout.tsx): sin él, expo-router redirige al grupo («/(auth)»), que no tiene index.
 */
export const ENTRADA_FASE: Record<Fase, Href> = {
  cargando: '/cargando',
  sin_sesion: '/bienvenida',
  sin_conexion: '/sin-conexion',
  sin_pareja: '/pareja',
  sin_perfil: '/perfil',
  dinero: '/dinero',
  invitar: '/invitar',
  lista: '/',
};

export type Miembro = {
  userId: string;
  slot: 'm1' | 'm2';
  color: ColorPersona | null;
  nombre: string;
  avatarPath: string | null;
};

export type Pareja = {
  coupleId: string;
  yo: Miembro;
  /** null mientras la otra persona no se ha unido. */
  otra: Miembro | null;
  /** Lo que configuró quien creó el espacio (se muestra a quien se une). */
  ajustes: {
    reparto: string;
    bote: boolean;
    /** Aportación fija mensual al bote, si la hay. */
    aportacionCents: number | null;
    /** false mientras quien creó el espacio no ha pasado por «¿Cómo os organizáis el dinero?». */
    configurados: boolean;
  } | null;
};

export type EstadoApp = {
  fase: Fase;
  userId: string | null;
  pareja: Pareja | null;
  refrescar: () => Promise<void>;
  /** Congela la fase actual (por ejemplo mientras el nudo se ata) hasta llamar a `soltarFase`. */
  retenerFase: () => void;
  /** Libera la fase congelada, opcionalmente tras un retraso para que acabe la animación. */
  soltarFase: (despuesDeMs?: number) => void;
  /** Marca que ya se ha pasado por Invitar (en este dispositivo). */
  marcarInvitacionVista: () => Promise<void>;
};

const Contexto = createContext<EstadoApp | null>(null);

const FASES_CACHEABLES: Fase[] = ['sin_pareja', 'sin_perfil', 'dinero', 'invitar', 'lista'];
const ESPERA_SIN_CACHE_MS = 2500;
const claveInvitacion = (coupleId: string) => `ito.invitacion_vista.${coupleId}`;

const REPARTOS: Record<string, string> = {
  half: 'reparto a medias',
  mixed: 'reparto mixto',
  all_pot: 'todo del bote común',
  proportional: 'reparto proporcional',
};

type Datos = { pareja: Pareja | null; invitacionVista: boolean };

type FilaMiembro = { couple_id: string; user_id: string; slot: 'm1' | 'm2'; color: ColorPersona | null; left_at: string | null };
type FilaPerfil = { id: string; display_name: string; avatar_path: string | null };
type FilaAjustes = {
  default_split: string;
  pot_enabled: boolean;
  pot_funding: 'monthly' | 'manual';
  pot_monthly_cents: number | null;
  version: number;
};

async function leerDatos(userId: string): Promise<Datos | null> {
  const [m, p, s] = await Promise.all([
    supabase.from('couple_members').select('couple_id, user_id, slot, color, left_at'),
    supabase.from('profiles').select('id, display_name, avatar_path'),
    supabase.from('couple_settings').select('default_split, pot_enabled, pot_funding, pot_monthly_cents, version'),
  ]);
  if (m.error || p.error) {
    registrarError('estado.leer', m.error ?? p.error);
    return null;
  }
  const activos = (m.data as FilaMiembro[]).filter((f) => f.left_at === null);
  const mio = activos.find((f) => f.user_id === userId);
  if (!mio) return { pareja: null, invitacionVista: false };
  const perfiles = new Map((p.data as FilaPerfil[]).map((f) => [f.id, f]));
  const aMiembro = (f: FilaMiembro): Miembro => ({
    userId: f.user_id,
    slot: f.slot,
    color: f.color,
    nombre: perfiles.get(f.user_id)?.display_name ?? '',
    avatarPath: perfiles.get(f.user_id)?.avatar_path ?? null,
  });
  const otra = activos.find((f) => f.user_id !== userId);
  const ajuste = !s.error && s.data && s.data[0] ? (s.data[0] as FilaAjustes) : null;
  let invitacionVista = false;
  try {
    invitacionVista = (await AsyncStorage.getItem(claveInvitacion(mio.couple_id))) === '1';
  } catch {
    invitacionVista = false;
  }
  return {
    invitacionVista,
    pareja: {
      coupleId: mio.couple_id,
      yo: aMiembro(mio),
      otra: otra ? aMiembro(otra) : null,
      ajustes: ajuste
        ? {
            reparto: REPARTOS[ajuste.default_split] ?? 'reparto a medias',
            bote: ajuste.pot_enabled,
            aportacionCents: ajuste.pot_enabled && ajuste.pot_funding === 'monthly' ? ajuste.pot_monthly_cents : null,
            // La fila se crea con version = 1 y cada update la sube (trigger private.touch): > 1 = ya se guardó.
            configurados: ajuste.version > 1,
          }
        : null,
    },
  };
}

function derivarFase(datos: Datos): Fase {
  const { pareja, invitacionVista } = datos;
  if (!pareja) return 'sin_pareja';
  if (pareja.yo.nombre.trim() === '' || pareja.yo.color === null) return 'sin_perfil';
  // Solo quien crea el espacio, y solo mientras está solo: después los ajustes se cambian por propuesta.
  if (pareja.yo.slot === 'm1' && pareja.otra === null && pareja.ajustes && !pareja.ajustes.configurados) return 'dinero';
  if (pareja.yo.slot === 'm1' && pareja.otra === null && !invitacionVista) return 'invitar';
  return 'lista';
}

/**
 * Estado derivado de la app: fase (qué grupo de rutas existe) y pareja. Sin caché de la fase espera
 * a la red hasta 2,5 s y pasa a `sin_conexion`; con caché decide al instante y revalida en segundo plano.
 */
export function EstadoProvider({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const flujo = useFlujoCuenta();
  const userId = sesion.userId;

  const [datos, setDatos] = useState<{ userId: string; datos: Datos } | null>(null);
  const [errorLectura, setErrorLectura] = useState(false);
  const [esperaAgotada, setEsperaAgotada] = useState(false);
  const [cache, setCache] = useState<{ userId: string; fase: Fase | null } | null>(null);
  const [bloqueo, setBloqueo] = useState<Fase | null>(null);
  const faseRef = useRef<Fase>('cargando');
  const temporizadorSoltar = useRef<ReturnType<typeof setTimeout> | null>(null);

  const datosDelUsuario = userId && datos?.userId === userId ? datos.datos : null;
  const cacheDelUsuario = userId && cache?.userId === userId ? cache : null;

  // Fase calculada, antes de aplicar la retención.
  let calculada: Fase;
  if (sesion.estado === 'cargando') calculada = 'cargando';
  else if (sesion.estado === 'sin_sesion' || flujo.modo === 'recuperacion') calculada = 'sin_sesion';
  else if (datosDelUsuario) calculada = derivarFase(datosDelUsuario);
  else if (!cacheDelUsuario) calculada = 'cargando';
  else if (cacheDelUsuario.fase) calculada = cacheDelUsuario.fase;
  else calculada = errorLectura || esperaAgotada ? 'sin_conexion' : 'cargando';

  const fase = VISTA_PREVIA ?? bloqueo ?? calculada;
  useEffect(() => {
    faseRef.current = fase;
  }, [fase]);

  // Última fase conocida por usuario (solo el enum, nada personal).
  useEffect(() => {
    if (userId && datosDelUsuario && FASES_CACHEABLES.includes(calculada)) {
      AsyncStorage.setItem(claveFase(userId), calculada).catch(() => undefined);
    }
  }, [userId, datosDelUsuario, calculada]);

  const cargar = useCallback(async () => {
    if (!userId) return;
    const nuevos = await leerDatos(userId);
    if (!nuevos) {
      setErrorLectura(true);
      return;
    }
    setErrorLectura(false);
    // Si la otra persona se une mientras se ve Invitar, se mantiene esa pantalla para mostrar el aviso.
    if (faseRef.current === 'invitar' && nuevos.pareja?.otra && !nuevos.invitacionVista) setBloqueo('invitar');
    setDatos({ userId, datos: nuevos });
  }, [userId]);

  // Lectura inicial y caché de fase al entrar una sesión; vaciado al salir.
  useEffect(() => {
    setDatos(null);
    setErrorLectura(false);
    setEsperaAgotada(false);
    setBloqueo(null);
    if (!userId) {
      setCache(null);
      return;
    }
    let activo = true;
    AsyncStorage.getItem(claveFase(userId))
      .then((v) => {
        if (!activo) return;
        const f = FASES_CACHEABLES.includes(v as Fase) ? (v as Fase) : null;
        setCache({ userId, fase: f });
      })
      .catch(() => activo && setCache({ userId, fase: null }));
    cargar();
    const t = setTimeout(() => activo && setEsperaAgotada(true), ESPERA_SIN_CACHE_MS);
    return () => {
      activo = false;
      clearTimeout(t);
    };
  }, [userId, cargar]);

  const coupleId = datosDelUsuario?.pareja?.coupleId ?? null;

  // Tiempo real: la otra persona se une o cambia su color / nombre.
  useEffect(() => {
    if (!coupleId) return;
    const canal = supabase
      .channel(`pareja:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couple_members', filter: `couple_id=eq.${coupleId}` }, () => {
        cargar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        cargar();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [coupleId, cargar]);

  // Al volver a primer plano se relee (por si se perdió algún evento).
  useEffect(() => {
    if (!userId) return;
    const s = AppState.addEventListener('change', (e) => {
      if (e === 'active') cargar();
    });
    return () => s.remove();
  }, [userId, cargar]);

  const retenerFase = useCallback(() => {
    if (temporizadorSoltar.current) clearTimeout(temporizadorSoltar.current);
    setBloqueo(faseRef.current);
  }, []);

  const soltarFase = useCallback((despuesDeMs = 0) => {
    if (temporizadorSoltar.current) clearTimeout(temporizadorSoltar.current);
    if (despuesDeMs <= 0) setBloqueo(null);
    else temporizadorSoltar.current = setTimeout(() => setBloqueo(null), despuesDeMs);
  }, []);

  useEffect(
    () => () => {
      if (temporizadorSoltar.current) clearTimeout(temporizadorSoltar.current);
    },
    [],
  );

  const marcarInvitacionVista = useCallback(async () => {
    if (!coupleId) return;
    try {
      await AsyncStorage.setItem(claveInvitacion(coupleId), '1');
    } catch (error) {
      registrarError('estado.marcarInvitacion', error);
    }
    setDatos((d) => (d ? { ...d, datos: { ...d.datos, invitacionVista: true } } : d));
  }, [coupleId]);

  const valor = useMemo<EstadoApp>(
    () => ({
      fase,
      userId,
      pareja: datosDelUsuario?.pareja ?? null,
      refrescar: cargar,
      retenerFase,
      soltarFase,
      marcarInvitacionVista,
    }),
    [fase, userId, datosDelUsuario, cargar, retenerFase, soltarFase, marcarInvitacionVista],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstado(): EstadoApp {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useEstado fuera de EstadoProvider');
  return valor;
}
