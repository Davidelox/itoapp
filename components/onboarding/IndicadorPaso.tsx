import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';

/** Pasos del primer uso de quien crea el espacio: espacio, perfil, dinero e invitar. */
export const TOTAL_PASOS = 4;

export function IndicadorPaso({ paso, total = TOTAL_PASOS }: { paso: number; total?: number }) {
  return (
    <View style={styles.fila}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Paso ${paso} de ${total}`}
        style={styles.barras}
      >
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.barra, i < paso && styles.barraHecha]} />
        ))}
      </View>
      <Text style={styles.texto} importantForAccessibility="no">
        {paso} de {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  barras: { flex: 1, flexDirection: 'row', gap: 6 },
  barra: { flex: 1, height: 8, borderRadius: 999, backgroundColor: colors.border },
  barraHecha: { backgroundColor: colors.accent },
  texto: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
});
