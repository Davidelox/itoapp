import { View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioPlan } from '@/components/planificador/FormularioPlan';
import { colors } from '@/constants/theme';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Nuevo plan (mockup NuevoProyecto). */
export default function NuevoPlan() {
  const { pareja } = useEstado();
  if (!pareja) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  return <FormularioPlan pareja={pareja} />;
}
