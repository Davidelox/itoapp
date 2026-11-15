import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { CampoTexto } from '@/components/onboarding/CampoTexto';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { contrasenaValida, crearCuenta, emailValido } from '@/lib/auth/acciones';
import { MENSAJES } from '@/lib/auth/errores';
import { useFlujoCuenta } from '@/lib/auth/FlujoCuenta';

export default function CrearCuenta() {
  const router = useRouter();
  const flujo = useFlujoCuenta();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const enviar = async () => {
    setErrorGeneral(null);
    const emailMal = !emailValido(email);
    const passMal = !contrasenaValida(password);
    setErrorEmail(emailMal ? 'Escribe un email válido.' : null);
    setErrorPassword(passMal ? MENSAJES.contrasenaDebil : null);
    if (emailMal || passMal) return;
    setCargando(true);
    const r = await crearCuenta(email, password);
    setCargando(false);
    if (r.ok) {
      flujo.iniciar('registro', email);
      setPassword(''); // la contraseña no se queda en memoria al salir de la pantalla
      router.push('/verificar');
    } else if (r.mensaje === MENSAJES.contrasenaDebil) {
      setErrorPassword(r.mensaje);
    } else {
      setErrorGeneral(r.mensaje);
    }
  };

  return (
    <Pantalla
      titulo="Crea tu cuenta"
      subtitulo="Te enviaremos un código para confirmar tu email."
      onAtras={() => router.back()}
      pie={<BotonPrincipal etiqueta="Crear cuenta" etiquetaCargando="Creando…" cargando={cargando} onPress={enviar} />}
    >
      <View style={styles.campos}>
        <CampoTexto
          etiqueta="Email"
          value={email}
          onChangeText={setEmail}
          error={errorEmail}
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
          error={errorPassword}
          ayuda="Al menos 10 caracteres, con letras y números."
          contrasena
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={enviar}
        />
        <MensajeError texto={errorGeneral} />
      </View>
      <EnlaceTexto etiqueta="¿Ya tienes cuenta? Entra" onPress={() => router.replace('/entrar')} />
    </Pantalla>
  );
}

const styles = StyleSheet.create({ campos: { gap: 16 } });
