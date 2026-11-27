import { View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { crearEstilos, useColores } from '@/lib/tema';

/** Se muestra un instante al entrar, mientras se lee el espacio de la pareja. */
export default function Cargando() {
  const colors = useColores();
  const styles = useStyles();
  return (
    <View style={styles.centro}>
      <CargandoHilo size="large" color={colors.accent} />
    </View>
  );
}

const useStyles = crearEstilos((colors) => ({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
}));
