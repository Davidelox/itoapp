import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioColeccion } from '@/components/mapa/FormularioColeccion';
import { colors } from '@/constants/theme';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Nueva colección (mockup NuevaColeccion). `?sitio=` llega marcado en «Añadir sitios ahora» (desde la ficha). */
export default function NuevaColeccion() {
  const { pareja } = useEstado();
  const { sitio } = useLocalSearchParams<{ sitio?: string }>();
  if (!pareja) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  return <FormularioColeccion pareja={pareja} sitioInicial={sitio} />;
}
