import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { type EstadoPermiso, estadoPermisoDe } from '@/lib/avisos/estado';
import { puedeRecibirPush } from '@/lib/avisos/entorno';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

type Notificaciones = typeof import('expo-notifications');

const CLAVE_TOKEN = 'ito.avisos.token';
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
  try {
    const p = await N.getPermissionsAsync();
    return estadoPermisoDe(p.status, p.canAskAgain);
  } catch (e) {
    registrarError('avisos.estadoPermiso', e);
    return 'no_disponible';
  }
}

/** Diálogo del sistema. Llamar solo tras la hoja explicativa. */
export async function pedirPermiso(): Promise<EstadoPermiso> {
  const N = await cargarNotificaciones();
  if (!N) return 'no_disponible';
  try {
    const p = await N.requestPermissionsAsync();
    return estadoPermisoDe(p.status, p.canAskAgain);
  } catch (e) {
    registrarError('avisos.pedirPermiso', e);
    return 'no_disponible';
  }
}

/** `projectId` de EAS (lo añade `eas init` en app.json → extra.eas.projectId). */
const projectId = (): string | undefined => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

/** Canal Android, token Expo y alta en el servidor. No lanza: devuelve si ha quedado registrado. */
export async function registrarDispositivo(): Promise<boolean> {
  const N = await cargarNotificaciones();
  const id = projectId();
  if (!N || !id) return false;
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'Avisos',
        importance: N.AndroidImportance.HIGH,
        lightColor: '#7B2433',
      });
    }
    const { data: token } = await N.getExpoPushTokenAsync({ projectId: id });
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    await guardar(CLAVE_TOKEN, token);
    return true;
  } catch (e) {
    registrarError('avisos.registrar', e);
    return false;
  }
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
