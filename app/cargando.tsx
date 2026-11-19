import { StyleSheet, View } from 'react-native';

import { CargandoHilo } from '@/components/hilo/CargandoHilo';
import { colors } from '@/constants/theme';

/** Se muestra un instante al entrar, mientras se lee el espacio de la pareja. */
export default function Cargando() {
  return (
    <View style={styles.centro}>
      <CargandoHilo size="large" color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
