import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { fonts } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { registrarError } from '@/lib/registro';
import { supabase } from '@/lib/supabase';

type Resultado = 'procesando' | 'confirmado_sin_sesion' | 'caducado';

/**
 * Destino del enlace del email (PKCE): llega `?code=…` o `?error=…`. No tiene guarda: funciona con o sin sesión.
 * Nunca se muestra `error_description` ni se registra la URL entrante.
 */
export default function CallbackAuth() {
  const colors = useColores();
  const styles = useStyles();
  const router = useRouter();
  const { code, error } = useLocalSearchParams<{ code?: string; error?: string }>();
  const [resultado, setResultado] = useState<Resultado>(error ? 'caducado' : 'procesando');
  const hecho = useRef(false);

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    if (error) return;
    if (!code) {
      router.replace('/');
      return;
    }
    supabase.auth
      .exchangeCodeForSession(String(code))
      .then(({ error: fallo }) => {
        if (fallo) {
          // Enlace abierto en otro dispositivo o navegador (sin verificador): el email ya está confirmado.
          registrarError('callback.exchange', fallo);
          setResultado('confirmado_sin_sesion');
        } else {
          // Reemplaza la ruta: en web quita también el `code` de la barra y del historial.
          router.replace('/');
        }
      })
      .catch((e: unknown) => {
        registrarError('callback.exchange', e);
        setResultado('confirmado_sin_sesion');
      });
  }, [code, error, router]);

  if (resultado === 'procesando') {
    return (
      <View style={styles.centro}>
        <CargandoHilo size="large" color={colors.accent} />
        <Text style={styles.texto}>Confirmando tu email…</Text>
      </View>
    );
  }

  const confirmado = resultado === 'confirmado_sin_sesion';
  return (
    <Pantalla
      titulo={confirmado ? 'Tu email está confirmado' : 'Este enlace ya no sirve'}
      subtitulo={
        confirmado
          ? 'Tu email está confirmado. Entra con tu contraseña.'
          : 'El enlace ha caducado o ya se ha usado. Si ya confirmaste tu email, entra con tu contraseña; si no, pide un código nuevo.'
      }
      pie={<BotonPrincipal etiqueta={confirmado ? 'Entrar' : 'Volver al inicio'} onPress={() => router.replace(confirmado ? '/entrar' : '/')} />}
    >
      <View />
    </Pantalla>
  );
}

const useStyles = crearEstilos((colors) => ({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background },
  texto: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
}));
