import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { CampoTexto } from '@/components/onboarding/CampoTexto';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { useCuentaAtras } from '@/components/onboarding/useCuentaAtras';
import { emailValido, entrar, reenviarCodigo } from '@/lib/auth/acciones';
import { useFlujoCuenta } from '@/lib/auth/FlujoCuenta';

const FALLOS_ANTES_DE_ESPERAR = 5;
const ESPERA_S = 30;

export default function Entrar() {
  const router = useRouter();
  const flujo = useFlujoCuenta();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallos, setFallos] = useState(0);
  const espera = useCuentaAtras();

  const enviar = async () => {
    if (espera.restante > 0) return;
    if (!emailValido(email) || password === '') {
      setError('El email o la contraseña no son correctos.');
      return;
    }
    setError(null);
    setCargando(true);
    const r = await entrar(email, password);
    if (r.ok) {
      // La guarda de rutas lleva a la pantalla que toque en cuanto llega la sesión. Se limpia el flujo por si
      // quedó una recuperación a medias (con `modo === 'recuperacion'` la fase seguiría en `sin_sesion`).
      flujo.limpiar();
      setPassword('');
      return;
    }
    if (r.codigo === 'no_confirmado') {
      flujo.iniciar('registro', email);
      await reenviarCodigo(email);
      setCargando(false);
      setPassword('');
      router.push('/verificar');
      return;
    }
    setCargando(false);
    setError(r.mensaje);
    // Solo para la experiencia: el límite real está en el servidor.
    const total = fallos + 1;
    if (total >= FALLOS_ANTES_DE_ESPERAR) {
      setFallos(0);
      espera.iniciar(ESPERA_S);
    } else {
      setFallos(total);
    }
  };

  const bloqueado = espera.restante > 0;
  return (
    <Pantalla
      titulo="Entra en ito"
      onAtras={() => router.back()}
      pie={
        <BotonPrincipal
          etiqueta={bloqueado ? `Espera ${espera.restante} s` : 'Entrar'}
          etiquetaCargando="Entrando…"
          cargando={cargando}
          deshabilitado={bloqueado}
          onPress={enviar}
        />
      }
    >
      <View style={styles.campos}>
        <CampoTexto
          etiqueta="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
        />
        <CampoTexto
          etiqueta="Contraseña"
          value={password}
          onChangeText={setPassword}
          contrasena
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={enviar}
        />
        <MensajeError texto={error} />
      </View>
      <View>
        <EnlaceTexto etiqueta="¿Has olvidado tu contraseña?" onPress={() => router.push('/recuperar')} />
        <EnlaceTexto etiqueta="¿No tienes cuenta? Créala" onPress={() => router.replace('/crear-cuenta')} />
      </View>
    </Pantalla>
  );
}

const styles = StyleSheet.create({ campos: { gap: 16 } });
