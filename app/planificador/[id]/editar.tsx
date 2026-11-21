import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioPlan } from '@/components/planificador/FormularioPlan';
import { colors, fonts } from '@/constants/theme';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { usePlan } from '@/lib/planificador/usePlanificador';

/** Editar un plan. */
export default function EditarPlan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pareja } = useEstado();
  const { plan, isLoading } = usePlan(id);
  if (!pareja || isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  if (!plan) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary, textAlign: 'center' }}>Este plan ya no existe.</Text>
      </View>
    );
  }
  // `key`: si la otra persona lo cambia mientras se edita, el formulario no se pisa (el aviso de versión lo dirá al guardar).
  return <FormularioPlan key={plan.id} pareja={pareja} plan={plan} />;
}
