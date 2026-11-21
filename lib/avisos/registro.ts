import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { type EstadoPermiso, estadoPermisoDe } from '@/lib/avisos/estado';
import { puedeRecibirPush } from '@/lib/avisos/entorno';
import { type Fallo, type Intento, PLAZOS, ejecutarPaso } from '@/lib/avisos/plazo';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

type Notificaciones = typeof import('expo-notifications');

const CLAVE_TOKEN = 'ito.avisos.token';
const CLAVE_INTENTO = 'ito.avisos.intento';
const CLAVE_PREGUNTADO = 'ito.avisos.preguntado';

/**
 * expo-notifications se carga solo donde puede funcionar: en Expo Go y en web no se importa, así que
 * no hay errores ni avisos en consola.
 */
export async function cargarNotificaciones(): Promise<Notificaciones | null> {
  return puedeRecibirPush() ? import('expo-notifications') : null;
}

const leer = async (k: string) => (Platform.OS === 'web' ? null : SecureStore.getItemAsync(k).catch(() => null));
const guardar = async (k: string, v: string) => {
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(k, v).catch(() => undefined);
};

export const yaPreguntado = async () => (await leer(CLAVE_PREGUNTADO)) === '1';
export const marcarPreguntado = () => guardar(CLAVE_PREGUNTADO, '1');

export async function estadoPermiso(): Promise<EstadoPermiso> {
  const N = await cargarNotificaciones();
  if (!N) return 'no_disponible';
  const r = await ejecutarPaso('permiso', PLAZOS.lectura, () => N.getPermissionsAsync());
  if (!r.ok) {
    registrarError(`avisos.estadoPermiso.${r.fallo.motivo}`, null);
    return 'no_disponible';
  }
  return estadoPermisoDe(r.valor.status, r.valor.canAskAgain);
}

/** Diálogo del sistema. Llamar solo tras la hoja explicativa. No lanza ni se queda esperando más de 30 s. */
export async function pedirPermiso(): Promise<EstadoPermiso> {
  const N = await cargarNotificaciones();
  if (!N) return 'no_disponible';
  const r = await ejecutarPaso('permiso', PLAZOS.permiso, () => N.requestPermissionsAsync());
  if (!r.ok) {
    registrarError(`avisos.pedirPermiso.${r.fallo.motivo}`, null);
    await anotar({ permiso: null, ok: false, fallo: r.fallo });
    return 'no_disponible';
  }
  return estadoPermisoDe(r.valor.status, r.valor.canAskAgain);
}

/** `projectId` de EAS (lo añade `eas init` en app.json → extra.eas.projectId). */
const projectId = (): string | undefined => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

let ultimo: Intento | null = null;
const oyentes = new Set<() => void>();

async function anotar(parcial: Pick<Intento, 'permiso' | 'ok' | 'fallo'>) {
  ultimo = { ...parcial, hora: new Date().toISOString(), projectId: !!projectId(), dispositivoReal: Device.isDevice };
  oyentes.forEach((f) => f());
  await guardar(CLAVE_INTENTO, JSON.stringify(ultimo));
}

/** Último intento de registro (memoria, o SecureStore tras reiniciar la app). */
export async function ultimoIntento(): Promise<Intento | null> {
  if (ultimo) return ultimo;
  try {
    const t = await leer(CLAVE_INTENTO);
    return t ? (JSON.parse(t) as Intento) : null;
  } catch {
    return null;
  }
}

export const alCambiarIntento = (f: () => void) => {
  oyentes.add(f);
  return () => void oyentes.delete(f);
};

let enCurso: Promise<Fallo | null> | null = null;
let ultimoInicio = 0;
const ESPERA_AUTO = 60_000;

/**
 * Canal Android, token Expo y alta en el servidor. No lanza, cada paso tiene plazo, y si ya hay un registro
 * en curso devuelve ese. `auto` (al abrir o volver a primer plano) no reintenta antes de 60 s.
 * Devuelve `null` si ha quedado registrado, o el paso que ha fallado.
 */
export function registrarDispositivo(auto = false): Promise<Fallo | null> {
  if (enCurso) return enCurso;
  if (auto && Date.now() - ultimoInicio < ESPERA_AUTO) return Promise.resolve(null);
  ultimoInicio = Date.now();
  enCurso = registrar().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function registrar(): Promise<Fallo | null> {
  const fin = async (permiso: string | null, fallo: Fallo | null) => {
    if (fallo) registrarError(`avisos.registrar.${fallo.paso}.${fallo.motivo}`, null);
    await anotar({ permiso, ok: !fallo, fallo });
    return fallo;
  };
  const N = await cargarNotificaciones();
  const id = projectId();
  if (!N) return fin(null, { paso: 'config', motivo: 'error', detalle: 'notificaciones no disponibles aquí' });
  if (!id) return fin(null, { paso: 'config', motivo: 'error', detalle: 'falta projectId' });
  const permiso = await estadoPermiso();
  if (Platform.OS === 'android') {
    const c = await ejecutarPaso('canal', PLAZOS.lectura, () =>
      N.setNotificationChannelAsync('default', { name: 'Avisos', importance: N.AndroidImportance.HIGH, lightColor: '#7B2433' }),
    );
    if (!c.ok) return fin(permiso, c.fallo);
  }
  const t = await ejecutarPaso('token', PLAZOS.token, () => N.getExpoPushTokenAsync({ projectId: id }));
  if (!t.ok) return fin(permiso, t.fallo);
  const token = t.valor.data;
  const s = await ejecutarPaso('servidor', PLAZOS.servidor, async () => {
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
  });
  if (!s.ok) return fin(permiso, s.fallo);
  await guardar(CLAVE_TOKEN, token);
  return fin(permiso, null);
}

/** Borra este móvil del servidor. Va antes de `signOut` (después no hay sesión) y nunca bloquea el cierre. */
export async function olvidarDispositivo(): Promise<void> {
  try {
    const token = await leer(CLAVE_TOKEN);
    if (!token) return;
    const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
    if (error) throw error;
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(CLAVE_TOKEN).catch(() => undefined);
  } catch (e) {
    registrarError('avisos.olvidar', e);
  }
}

/** «Probar aviso»: lo encola el servidor (llega en 1–2 min). `false` si ya había uno de este minuto. */
export async function probarAviso(): Promise<boolean> {
  const { data, error } = await supabase.rpc('send_test_push');
  if (error) throw error;
  return data === true;
}
