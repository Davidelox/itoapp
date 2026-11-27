import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioRecurrente } from '@/components/gastos/FormularioRecurrente';
import { crearEstilos, useColores } from '@/lib/tema';
import { origenDe } from '@/lib/calendario/destino';
import { useAjustesGastos } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';

export default function NuevoRecurrente() {
  const colors = useColores();
  const styles = useStyles();
  const { pareja } = useEstado();
  const ajustes = useAjustesGastos();
  // `origen`: desde dónde se abrió (calendario o gastos); decide a dónde se vuelve al guardar.
  const { tipo, dia, origen } = useLocalSearchParams<{ tipo?: string; dia?: string; origen?: string }>();
  if (!pareja || !ajustes.data) {
    return (
      <View style={styles.cargando}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  return <FormularioRecurrente pareja={pareja} ajustes={ajustes.data} personalInicial={tipo === 'personal'} diaInicial={dia} origen={origenDe(origen)} />;
}

const useStyles = crearEstilos((colors) => ({
  cargando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
}));
