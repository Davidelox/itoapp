/**
 * Tema claro/oscuro (docs/plan-modo-oscuro.md §4). La preferencia (Sistema / Claro / Oscuro) se guarda en el
 * móvil y se aplica con `Appearance.setColorScheme`: así la única fuente de verdad es `useColorScheme()`
 * (sin contexto ni `setState` en un effect) y los selectores nativos, el teclado y las alertas siguen el mismo tema.
 */
import * as SecureStore from 'expo-secure-store';
import { Appearance, type ImageStyle, StyleSheet, type TextStyle, useColorScheme, type ViewStyle } from 'react-native';

import { type Paleta, paletas } from '@/constants/theme';

export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';

const CLAVE = 'ito.tema';

let actual: PreferenciaTema = 'sistema';

function aplicar(pref: PreferenciaTema) {
  actual = pref;
  Appearance.setColorScheme?.(pref === 'claro' ? 'light' : pref === 'oscuro' ? 'dark' : 'unspecified');
}

/** Lee la preferencia guardada y la aplica; sin nada guardado (o sin almacenamiento, como en la web), Sistema. */
export async function cargarTema(): Promise<PreferenciaTema> {
  let pref: PreferenciaTema = 'sistema';
  try {
    const v = await SecureStore.getItemAsync(CLAVE);
    if (v === 'claro' || v === 'oscuro') pref = v;
  } catch {
    // Sin almacenamiento disponible: se queda en Sistema.
  }
  aplicar(pref);
  return pref;
}

/** Aplica y guarda la preferencia. */
export async function guardarTema(pref: PreferenciaTema): Promise<void> {
  aplicar(pref);
  try {
    await SecureStore.setItemAsync(CLAVE, pref);
  } catch {
    // Se aplica igualmente en esta sesión.
  }
}

/** Preferencia aplicada ahora (para marcar la opción en Ajustes). */
export function preferenciaActual(): PreferenciaTema {
  return actual;
}

export function useEsquema(): 'claro' | 'oscuro' {
  return useColorScheme() === 'dark' ? 'oscuro' : 'claro';
}

export function useColores(): Paleta {
  return paletas[useEsquema()];
}


type EstilosBase = { [clave: string]: ViewStyle | TextStyle | ImageStyle };

/**
 * Hoja de estilos que depende de la paleta: `const useStyles = crearEstilos((colors) => ({...}))` y, en el
 * componente, `const styles = useStyles()`. Se crea una hoja por tema, una sola vez.
 */
export function crearEstilos<T extends EstilosBase>(fabrica: (colors: Paleta) => T & EstilosBase) {
  const cache: Partial<Record<'claro' | 'oscuro', Readonly<T>>> = {};
  return function useStyles(): Readonly<T> {
    const esquema = useEsquema();
    return (cache[esquema] ??= StyleSheet.create(fabrica(paletas[esquema])));
  };
}
