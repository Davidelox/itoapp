import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { FormularioGasto } from '@/components/gastos/FormularioGasto';
import { crearEstilos, useColores } from '@/lib/tema';
import { idDePlanValido } from '@/lib/gastos/planes';
import { useAjustesGastos } from '@/lib/gastos/useGastos';
import { useEstado } from '@/lib/pareja/EstadoProvider';
import { usePlan } from '@/lib/planificador/usePlanificador';

/** `?plan=<uuid>`: «Añadir gasto al plan». Un id mal formado o de un plan que no existe se ignora (gasto sin plan). */
export default function NuevoGasto() {
  const colors = useColores();
  const styles = useStyles();
  const { pareja } = useEstado();
  const { plan: parametro } = useLocalSearchParams<{ plan?: string }>();
  const planId = idDePlanValido(parametro);
  const ajustes = useAjustesGastos();
  const { plan, isLoading: cargandoPlan } = usePlan(planId ?? undefined);
  if (!pareja || !ajustes.data || (planId && cargandoPlan)) {
    return (
      <View style={styles.cargando}>
        <CargandoHilo size="large" color={colors.accent} />
      </View>
    );
  }
  return <FormularioGasto pareja={pareja} ajustes={ajustes.data} plan={plan} />;
}

const useStyles = crearEstilos((colors) => ({
  cargando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
}));
