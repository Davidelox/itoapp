import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { FormularioRecurrente } from '@/components/gastos/FormularioRecurrente';
import { colors } from '@/constants/theme';
import { useAjustesGastos } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

export default function NuevoRecurrente() {
  const { pareja } = useEstado();
  const ajustes = useAjustesGastos();
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  if (!pareja || !ajustes.data) {
    return (
      <View style={styles.cargando}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <FormularioRecurrente pareja={pareja} ajustes={ajustes.data} personalInicial={tipo === 'personal'} />;
}

const styles = StyleSheet.create({
  cargando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
