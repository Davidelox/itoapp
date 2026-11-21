import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioPlan } from '@/components/planificador/FormularioPlan';
import { colors } from '@/constants/theme';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { precargaDeParametros } from '@/lib/planificador/precarga';

/** Nuevo plan (mockup NuevoProyecto). Con parámetros de una idea («Convertir en plan») o de un plan («Duplicar plan») sale ya rellenado. */
export default function NuevoPlan() {
  const { pareja } = useEstado();
  const params = useLocalSearchParams();
  if (!pareja) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  return <FormularioPlan pareja={pareja} precarga={precargaDeParametros(params)} />;
}
