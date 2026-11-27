import { StyleSheet, Text, View } from 'react-native';

import { fonts, paletas } from '@/constants/theme';

/** Los pines no cambian con el tema (docs/plan-modo-oscuro.md §5). */
const colors = paletas.claro;

/**
 * Pin de un resultado de búsqueda (distinto de los sitios guardados, que son granates): gota oscura neutra con el
 * número del resultado. Oculto a los lectores de pantalla (la etiqueta va en el `Marker` y en la lista).
 */
export function PinResultado({ numero, activo = false, tamano = 30 }: { numero: number; activo?: boolean; tamano?: number }) {
  const lado = Math.round(tamano * 0.28);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.caja}>
      <View style={[styles.insignia, { width: tamano, height: tamano, borderRadius: tamano / 2 }, activo && styles.activo]}>
        <Text allowFontScaling={false} style={styles.numero}>
          {numero}
        </Text>
      </View>
      <View style={[styles.pico, { borderLeftWidth: lado / 2, borderRightWidth: lado / 2, borderTopWidth: lado }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { alignItems: 'center' },
  insignia: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, borderWidth: 2, borderColor: colors.card },
  activo: { backgroundColor: colors.icon, borderColor: colors.accentSoft },
  numero: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onAccent },
  pico: { width: 0, height: 0, marginTop: -1, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.text },
});
