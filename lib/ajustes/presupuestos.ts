/**
 * Preferencia local del dispositivo «Mostrar presupuestos» (desactivada por defecto): sin servidor ni migración.
 * Almacén de módulo + `useSyncExternalStore`: sin proveedor ni setState en efectos.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export const CLAVE_PRESUPUESTOS = 'ito.mostrarPresupuestos';

/** Solo «1» activa la opción; ausente o cualquier otra cosa = desactivada. */
export const leerPresupuestos = (raw: string | null | undefined): boolean => raw === '1';

let valor = false;
let cargado = false;
const oyentes = new Set<() => void>();

const avisar = () => oyentes.forEach((o) => o());

function cargar() {
  if (cargado) return;
  cargado = true;
  AsyncStorage.getItem(CLAVE_PRESUPUESTOS)
    .then((raw) => {
      const v = leerPresupuestos(raw);
      if (v !== valor) {
        valor = v;
        avisar();
      }
    })
    .catch(() => undefined);
}

function suscribir(o: () => void) {
  cargar();
  oyentes.add(o);
  return () => void oyentes.delete(o);
}

export function guardarPresupuestos(v: boolean) {
  valor = v;
  avisar();
  AsyncStorage.setItem(CLAVE_PRESUPUESTOS, v ? '1' : '0').catch(() => undefined);
}

/** `true` si el usuario ha activado «Mostrar presupuestos» en Ajustes. */
export const usePresupuestos = (): boolean => useSyncExternalStore(suscribir, () => valor, () => false);
