import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { CampoCodigo } from '@/components/onboarding/CampoCodigo';
import { CampoTexto } from '@/components/onboarding/CampoTexto';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { formatearSegundos, useCuentaAtras } from '@/components/onboarding/useCuentaAtras';
import { colors, fonts } from '@/constants/theme';
import { emailValido, pedirRecuperacion, reenviarCodigo, verificarCodigo } from '@/lib/auth/acciones';
import { useFlujoCuenta } from '@/lib/auth/FlujoCuenta';

const ESPERA_REENVIO_S = 60;
/** El código tiene 6 cifras; se acepta de 6 a 10 por si el proyecto tiene otra longitud configurada. */
const MIN_CIFRAS = 6;
const PAUSA_ENVIO_MS = 450;

export default function Verificar() {
  const router = useRouter();
  const flujo = useFlujoCuenta();
  const recuperacion = flujo.modo === 'recuperacion';
  const [emailEscrito, setEmailEscrito] = useState('');
  const email = flujo.email || emailEscrito;
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const reenvio = useCuentaAtras(ESPERA_REENVIO_S);
  const enCurso = useRef(false);

  const comprobar = async (valor: string) => {
    if (enCurso.current || valor.length < MIN_CIFRAS || !emailValido(email)) return;
    enCurso.current = true;
    setError(null);
    setCargando(true);
    const r = await verificarCodigo(email, valor, recuperacion ? 'recovery' : 'email');
    enCurso.current = false;
    setCargando(false);
    if (!r.ok) {
      setError(r.mensaje);
      setCodigo('');
      return;
    }
    if (recuperacion) {
      router.replace('/nueva-contrasena');
    } else {
      // Con la sesión recién creada, la guarda de rutas lleva a la pantalla que toque.
      flujo.limpiar();
    }
  };

  // Se envía solo al completar el código: una pausa corta evita enviar 6 cifras de un código más largo.
  useEffect(() => {
    if (codigo.length < MIN_CIFRAS) return;
    const t = setTimeout(() => comprobar(codigo), PAUSA_ENVIO_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  const reenviar = async () => {
    if (reenvio.restante > 0 || !emailValido(email)) return;
    setError(null);
    const r = recuperacion ? await pedirRecuperacion(email) : await reenviarCodigo(email);
    if (r.ok) {
      setAviso('Te hemos enviado un código nuevo.');
      reenvio.iniciar(ESPERA_REENVIO_S);
    } else {
      setAviso(null);
      setError(r.mensaje);
    }
  };

  const subtitulo = recuperacion
    ? 'Si hay una cuenta con ese email, te hemos enviado un código para cambiar tu contraseña.'
    : 'Si el email no tenía cuenta, te hemos enviado un código de 6 cifras. Si ya tienes cuenta, no te llegará nada: entra con tu contraseña.';

  return (
    <Pantalla
      titulo="Revisa tu correo"
      subtitulo={subtitulo}
      onAtras={() => router.back()}
      pie={
        <BotonPrincipal
          etiqueta="Confirmar"
          etiquetaCargando="Comprobando…"
          cargando={cargando}
          deshabilitado={codigo.length < MIN_CIFRAS || !emailValido(email)}
          onPress={() => comprobar(codigo)}
        />
      }
    >
      <View style={styles.campos}>
        {!flujo.email && (
          <CampoTexto
            etiqueta="Email"
            value={emailEscrito}
            onChangeText={setEmailEscrito}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
          />
        )}
        <CampoCodigo etiqueta="Código" tipo="otp" valor={codigo} onCambiar={setCodigo} error={error} editable={!cargando} autoFocus />
        {aviso && !error ? (
          <Text accessibilityLiveRegion="polite" style={styles.aviso}>
            {aviso}
          </Text>
        ) : null}
      </View>
      <View>
        <EnlaceTexto
          etiqueta={reenvio.restante > 0 ? `Reenviar código (${formatearSegundos(reenvio.restante)})` : 'Reenviar código'}
          deshabilitado={reenvio.restante > 0}
          onPress={reenviar}
        />
        {!recuperacion && <EnlaceTexto etiqueta="¿Ya tienes cuenta? Entra" onPress={() => router.replace('/entrar')} />}
      </View>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  campos: { gap: 16 },
  aviso: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
});
