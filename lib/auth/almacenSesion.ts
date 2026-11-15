import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { registrarError } from '@/lib/registro';

/**
 * Almacén de la sesión de Supabase en Keychain / Keystore (expo-secure-store, solo nativo; en web se
 * usa localStorage). SecureStore limita el tamaño de cada valor, así que el JSON se trocea:
 * `clave.0`, `clave.1`, … y al final `clave.n` con el número de partes.
 * Falla cerrado: si falta una parte o algo no se puede leer, devuelve null (equivale a cerrar sesión).
 */

const TROZO = 1800;
const MAX_TROZOS = 40;
const MARCA_INSTALACION = 'ito.instalada';
/** Claves de sesión de supabase.ts (storageKey). */
export const CLAVE_SESION = 'ito-auth';
const CLAVES_CONOCIDAS = [CLAVE_SESION, `${CLAVE_SESION}-code-verifier`, `${CLAVE_SESION}-user`];

const opciones: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

async function leerNumero(clave: string): Promise<number> {
  const n = await SecureStore.getItemAsync(`${clave}.n`, opciones);
  if (n === null) return 0;
  const num = Number(n);
  return Number.isInteger(num) && num >= 1 && num <= MAX_TROZOS ? num : -1;
}

async function borrar(clave: string): Promise<void> {
  const n = await leerNumero(clave);
  const total = n > 0 ? n : MAX_TROZOS;
  await Promise.all(
    Array.from({ length: total }, (_, i) => SecureStore.deleteItemAsync(`${clave}.${i}`, opciones)),
  );
  await SecureStore.deleteItemAsync(`${clave}.n`, opciones);
}

/**
 * En iOS el Keychain sobrevive a desinstalar la app. AsyncStorage no: si falta la marca, es una
 * instalación nueva y se descarta cualquier sesión que quedara en el Keychain.
 */
let inicio: Promise<void> | null = null;
function iniciar(): Promise<void> {
  inicio ??= (async () => {
    try {
      if ((await AsyncStorage.getItem(MARCA_INSTALACION)) === null) {
        await Promise.all(CLAVES_CONOCIDAS.map(borrar));
        await AsyncStorage.setItem(MARCA_INSTALACION, '1');
      }
    } catch (error) {
      registrarError('almacenSesion.iniciar', error);
    }
  })();
  return inicio;
}

export const almacenSesionSeguro = {
  async getItem(clave: string): Promise<string | null> {
    try {
      await iniciar();
      const n = await leerNumero(clave);
      if (n <= 0) return null;
      const partes: string[] = [];
      for (let i = 0; i < n; i++) {
        const parte = await SecureStore.getItemAsync(`${clave}.${i}`, opciones);
        if (parte === null) return null;
        partes.push(parte);
      }
      const valor = partes.join('');
      JSON.parse(valor); // si no es JSON legible, se trata como sin sesión
      return valor;
    } catch (error) {
      registrarError('almacenSesion.getItem', error);
      return null;
    }
  },

  async setItem(clave: string, valor: string): Promise<void> {
    await iniciar();
    const previo = await leerNumero(clave);
    // Troceo por posición (no con RegExp en plantilla: ahí `\s` se convierte en «s» y el patrón deja de valer).
    const partes: string[] = [];
    for (let i = 0; i < valor.length; i += TROZO) partes.push(valor.slice(i, i + TROZO));
    if (partes.length === 0) partes.push('');
    if (partes.length > MAX_TROZOS) throw new Error('Sesión demasiado grande');
    for (let i = 0; i < partes.length; i++) {
      await SecureStore.setItemAsync(`${clave}.${i}`, partes[i], opciones);
    }
    await SecureStore.setItemAsync(`${clave}.n`, String(partes.length), opciones);
    for (let i = partes.length; i < previo; i++) {
      await SecureStore.deleteItemAsync(`${clave}.${i}`, opciones);
    }
  },

  async removeItem(clave: string): Promise<void> {
    try {
      await iniciar();
      await borrar(clave);
    } catch (error) {
      registrarError('almacenSesion.removeItem', error);
    }
  },
};
