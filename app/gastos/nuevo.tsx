import { StyleSheet, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioGasto } from '@/components/gastos/FormularioGasto';
import { colors } from '@/constants/theme';
import { useAjustesGastos } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

export default function NuevoGasto() {
  const { pareja } = useEstado();
  const ajustes = useAjustesGastos();
  if (!pareja || !ajustes.data) {
    return (
      <View style={styles.cargando}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  return <FormularioGasto pareja={pareja} ajustes={ajustes.data} />;
}

const styles = StyleSheet.create({
  cargando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
