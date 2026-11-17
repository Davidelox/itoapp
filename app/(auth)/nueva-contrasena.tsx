import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BotonPrincipal } from '@/components/onboarding/Botones';
import { CampoTexto } from '@/components/onboarding/CampoTexto';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { cambiarContrasena, contrasenaValida } from '@/lib/auth/acciones';
import { MENSAJES } from '@/lib/auth/errores';
import { useFlujoCuenta } from '@/lib/auth/FlujoCuenta';

export default function NuevaContrasena() {
  const flujo = useFlujoCuenta();
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cambiada, setCambiada] = useState(false);

  // Solo se llega aquí tras verificar el código de recuperación.
  if (flujo.modo !== 'recuperacion') return <Redirect href="/bienvenida" />;

  const enviar = async () => {
    if (!contrasenaValida(password)) {
      setError(MENSAJES.contrasenaDebil);
      return;
    }
    setError(null);
    setCargando(true);
    const r = await cambiarContrasena(password);
    setCargando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setPassword('');
    // Se muestra la confirmación sin limpiar el flujo: mientras siga en «recuperacion», la guarda no salta.
    setCambiada(true);
  };

  if (cambiada) {
    return (
      <Pantalla
        titulo="Contraseña actualizada"
        subtitulo="¡Has cambiado tu contraseña con éxito!"
        // Al limpiar el flujo la fase pasa a la que toque (ya hay sesión) y la guarda lleva a la app.
        pie={<BotonPrincipal etiqueta="Continuar" onPress={flujo.limpiar} />}
      >
        <View />
      </Pantalla>
    );
  }

  return (
    <Pantalla
      titulo="Elige una contraseña nueva"
      pie={<BotonPrincipal etiqueta="Guardar contraseña" etiquetaCargando="Guardando…" cargando={cargando} onPress={enviar} />}
    >
      <View style={styles.campos}>
        <CampoTexto
          etiqueta="Contraseña nueva"
          value={password}
          onChangeText={setPassword}
          error={error}
          ayuda="Al menos 10 caracteres, con letras y números."
          contrasena
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={enviar}
        />
      </View>
    </Pantalla>
  );
}

const styles = StyleSheet.create({ campos: { gap: 16 } });
