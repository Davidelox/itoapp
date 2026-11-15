import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BotonNudo } from '@/components/hilo/BotonNudo';
import { CampoCodigo } from '@/components/onboarding/CampoCodigo';
import { Pantalla } from '@/components/onboarding/Pantalla';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { unirse } from '@/lib/pareja/acciones';
import { codigoCompleto } from '@/lib/pareja/codigo';

/** Tiempo que se deja ver el nudo apretado antes de que la guarda cambie de pantalla. */
const PAUSA_NUDO_MS = 1500;

export default function Unirse() {
  const router = useRouter();
  const { refrescar, retenerFase, soltarFase } = useEstado();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const unirme = async () => {
    setError(null);
    // La fase no cambia de pantalla en mitad del nudo.
    retenerFase();
    const r = await unirse(codigo);
    if (!r.ok) {
      setError(r.mensaje);
      soltarFase();
      throw new Error('codigo_rechazado'); // el nudo se suelta
    }
    await refrescar();
  };

  return (
    <Pantalla
      titulo="Únete a tu pareja"
      subtitulo="Introduce el código que te ha enviado."
      onAtras={() => router.back()}
      pie={
        <BotonNudo
          label="Unirme"
          labelHecho="Ya estáis unidos"
          labelError="No se ha podido unir"
          disabled={!codigoCompleto(codigo)}
          onPress={unirme}
          onHecho={() => soltarFase(PAUSA_NUDO_MS)}
        />
      }
    >
      <View style={styles.campos}>
        <CampoCodigo etiqueta="Código de invitación" tipo="invitacion" valor={codigo} onCambiar={(c) => { setCodigo(c); setError(null); }} error={error} autoFocus />
      </View>
    </Pantalla>
  );
}

const styles = StyleSheet.create({ campos: { gap: 16 } });
