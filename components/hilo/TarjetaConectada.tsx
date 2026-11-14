import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts, fontSizes, radius, spacing } from '@/constants/theme';

type Props = {
  tipo: string;
  titulo: string;
  detalle: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Aspecto de una tarjeta de las que el hilo une (gasto, sitio, plan). Es solo la parte visual, sin
 * toque: así la misma tarjeta sirve en la lista, en la capa que la lleva al detalle y en el detalle.
 */
export function TarjetaConectada({ tipo, titulo, detalle, style }: Props) {
  return (
    <View style={[styles.tarjeta, style]}>
      <Text style={styles.tipo}>{tipo}</Text>
      <Text style={styles.titulo} numberOfLines={2}>
        {titulo}
      </Text>
      <Text style={styles.detalle} numberOfLines={2}>
        {detalle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 2,
  },
  tipo: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: colors.accent },
  titulo: { fontFamily: fonts.title, fontSize: fontSizes.heading, color: colors.text },
  detalle: { fontFamily: fonts.body, fontSize: fontSizes.small, color: colors.textSecondary },
});
