import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { CLAVE_SESION, almacenSesionSeguro } from '@/lib/auth/almacenSesion';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL y/o EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env y rellena los valores de tu proyecto de Supabase.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Nativo: Keychain / Keystore. Web: localStorage (el predeterminado de la librería).
    storage: Platform.OS === 'web' ? undefined : almacenSesionSeguro,
    storageKey: CLAVE_SESION,
    // PKCE: en la URL de vuelta solo viaja un `code` de un solo uso. Nunca el flujo implícito.
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    // El enlace del email lo procesa app/auth/callback.tsx en todas las plataformas.
    detectSessionInUrl: false,
  },
});

// Solo refresca el token mientras la app está en primer plano (guía oficial de Supabase).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
