import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BotonPrincipal } from '@/components/onboarding/Botones';
import { CampoTexto } from '@/components/onboarding/CampoTexto';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { emailValido, pedirRecuperacion } from '@/lib/auth/acciones';
import { useFlujoCuenta } from '@/lib/auth/FlujoCuenta';

export default function Recuperar() {
  const router = useRouter();
  const flujo = useFlujoCuenta();
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    if (!emailValido(email)) {
      setError('Escribe un email válido.');
      return;
    }
    setError(null);
    setCargando(true);
    const r = await pedirRecuperacion(email);
    setCargando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    // Siempre el mismo camino, haya o no cuenta con ese email.
    flujo.iniciar('recuperacion', email);
    router.push('/verificar');
  };

  return (
    <Pantalla
      titulo="Recupera tu contraseña"
      subtitulo="Te enviaremos un código para cambiar tu contraseña."
      onAtras={() => router.back()}
      pie={<BotonPrincipal etiqueta="Enviar código" etiquetaCargando="Enviando…" cargando={cargando} onPress={enviar} />}
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
          returnKeyType="go"
          onSubmitEditing={enviar}
        />
        <MensajeError texto={error} />
      </View>
    </Pantalla>
  );
}

const styles = StyleSheet.create({ campos: { gap: 16 } });
