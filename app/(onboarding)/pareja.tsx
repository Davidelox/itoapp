import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EnlaceTexto } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { TarjetaEleccion } from '@/components/onboarding/TarjetaEleccion';
import { cerrarSesion } from '@/lib/auth/acciones';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { crearEspacio } from '@/lib/pareja/acciones';

export default function Pareja() {
  const router = useRouter();
  const { refrescar } = useEstado();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setError(null);
    setCreando(true);
    const r = await crearEspacio();
    if (!r.ok) {
      setCreando(false);
      setError(r.mensaje);
      return;
    }
    // La fase pasa a «Tu perfil» al leer el espacio nuevo.
    await refrescar();
    setCreando(false);
  };

  return (
    <Pantalla paso={1} titulo="Vuestro espacio" subtitulo="Un sitio compartido donde viviréis los dos. ¿Cómo empezáis?">
      <View style={styles.tarjetas}>
        <TarjetaEleccion
          principal
          icono="home-outline"
          titulo="Crear nuestro espacio"
          detalle="Empiezo yo, invitaré a mi pareja."
          cargando={creando}
          onPress={crear}
        />
        <TarjetaEleccion
          icono="key-outline"
          titulo="Tengo un código"
          detalle="Mi pareja ya me ha invitado."
          deshabilitada={creando}
          onPress={() => router.push('/unirse')}
        />
        <MensajeError texto={error} />
      </View>
      <EnlaceTexto etiqueta="Cerrar sesión" onPress={() => cerrarSesion()} />
    </Pantalla>
  );
}

const styles = StyleSheet.create({ tarjetas: { gap: 14 } });
